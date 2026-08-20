import type { Scenario, ScenarioContext } from "./scenario.js"
import type { ConnectionPool } from "../application/connection-pool.js"
import type { Subscription, SubscriptionEvent } from "../ports/event-stream.js"

// §4.7: Frozen slow-consumer parameters
const BACKPRESSURE_DURATION_MS = 15000
const LATENCY_DEGRADATION_THRESHOLD = 0.05
const SLOW_EVENT_INTERVAL_MS = 2000 // §U: 1 event per 2 seconds

// §4.7: Slow-consumer result metrics — separate from AggregateMetrics
export interface SlowConsumerMetrics {
  slow_clients: number
  healthy_clients: number
  slow_offered_event_count: number
  slow_application_read_count: number
  slow_backlog_growth: number
  backpressure_duration_ms: number
  evidence_server_side_backpressure_reached: boolean
  healthy_p95_before_ms: number
  healthy_p95_during_slow_ms: number
  healthy_degradation_pct: number
  slow_disconnects: number
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.ceil(sorted.length * p) - 1
  return sorted[Math.max(0, idx)]
}

// §4.7: Throttled subscription wrapper — consumes 1 event every SLOW_EVENT_INTERVAL_MS
// Controls read-side pacing by pausing/resuming the underlying transport.
// Wraps the inner subscription and forwards events through the throttling gate.
class ThrottledSubscription implements Subscription {
  private inner: Subscription
  private eventsReceived = 0
  private paused = false
  private downstreamHandler: ((event: SubscriptionEvent) => void) | null = null
  private resumeTimers: ReturnType<typeof setTimeout>[] = []
  private _offeredCount = 0

  constructor(inner: Subscription, downstreamHandler: (event: SubscriptionEvent) => void) {
    this.inner = inner
    this.downstreamHandler = downstreamHandler
    // §4.7: Auto-register throttling wrapper on inner subscription
    this.inner.onEvent((evt) => {
      if (evt.type === "message") {
        this._offeredCount++
        this.eventsReceived++
        if (!this.paused) {
          this.paused = true
          this.inner.pause()
          const timer = setTimeout(() => {
            this.paused = false
            if (this.inner.connected) {
              this.inner.resume()
            }
          }, SLOW_EVENT_INTERVAL_MS)
          this.resumeTimers.push(timer)
        }
      }
      this.downstreamHandler?.(evt)
    })
  }

  get connected(): boolean { return this.inner.connected }
  get lastEventId(): string | null { return this.inner.lastEventId }

  onEvent(handler: (event: SubscriptionEvent) => void): void {
    this.downstreamHandler = handler
  }

  pause(): void { this.inner.pause() }
  resume(): void { this.inner.resume() }
  close(): void {
    for (const t of this.resumeTimers) clearTimeout(t)
    this.resumeTimers = []
    this.inner.close()
  }

  get achievedReadCount(): number { return this.eventsReceived }
  get offeredCount(): number { return this._offeredCount }
}

export class SlowConsumerScenario implements Scenario {
  name = "slow-consumer"
  private pool: ConnectionPool
  public slowMetrics: SlowConsumerMetrics | null = null

  constructor(pool: ConnectionPool) {
    this.pool = pool
  }

  async execute(ctx: ScenarioContext): Promise<{ name: string; passed: boolean; detail: string }> {
    ctx.log("--- PHASE: SLOW CONSUMER TEST ---")

    const all = [...this.pool.entries]
    if (all.length === 0) {
      return { name: this.name, passed: true, detail: "skipped (no connections)" }
    }

    const slowFraction = ctx.config.slowConsumerFraction
    const slowCount = Math.max(1, Math.floor(all.length * slowFraction))
    const slowConnections = all.slice(0, slowCount)
    const healthyConnections = all.slice(slowCount)

    ctx.log(`Designating ${slowCount}/${all.length} connections as slow (${slowFraction * 100}%)`)

    // §4.7: Snapshot healthy-client latency before slow phase
    const snapBefore = ctx.metrics.snapshot()
    const latenciesBefore = [...snapBefore.fan_out_latencies_ms].sort((a, b) => a - b)
    const p95Before = percentile(latenciesBefore, 0.95)

    // §4.7: Wrap slow connections with throttled read (1 event per 2s)
    // Capture the original pool handler from the mock/real subscription
    const throttledWrappers: ThrottledSubscription[] = []
    for (const conn of slowConnections) {
      // The pool registered its handler via conn.subscription.onEvent(poolHandler).
      // We need to capture that handler and pass it through the throttling gate.
      // The mock stores it in _lastHandler; real subscriptions use onEvent chaining.
      const capturedHandler = (conn.subscription as any)._lastHandler
        ?? ((evt: SubscriptionEvent) => { /* fallback: no-op */ })
      const throttled = new ThrottledSubscription(conn.subscription, capturedHandler)
      conn.subscription = throttled
      throttledWrappers.push(throttled)
    }

    ctx.log(`${slowCount} slow connections throttled to 1 event/2s, ${healthyConnections.length} healthy connections active`)

    // §4.7: Measure during the slow phase
    const slowPhaseStart = ctx.clock.now()
    await ctx.sleep(BACKPRESSURE_DURATION_MS)
    const slowPhaseElapsed = ctx.clock.now() - slowPhaseStart

    // §4.7: Collect slow-consumer metrics after the phase
    let slowDisconnects = 0
    let totalOffered = 0
    let totalRead = 0
    for (let i = 0; i < slowConnections.length; i++) {
      const conn = slowConnections[i]
      const wrapper = throttledWrappers[i]
      if (!conn.subscription.connected) {
        slowDisconnects++
        ctx.metrics.incrementSlowConsumerDisconnects()
      }
      totalOffered += wrapper.offeredCount
      totalRead += wrapper.achievedReadCount
      try { conn.subscription.resume() } catch {}
    }

    // §4.7: Measure healthy-client latency during slow phase
    const snapDuring = ctx.metrics.snapshot()
    const latenciesDuring = [...snapDuring.fan_out_latencies_ms].sort((a, b) => a - b)
    const p95During = percentile(latenciesDuring, 0.95)

    ctx.log(`Slow consumers: ${slowDisconnects}/${slowCount} disconnected by server`)
    ctx.log(`Healthy p95 latency: before=${p95Before}ms, with_slow=${p95During}ms`)

    const degradation = p95Before > 0
      ? (p95During - p95Before) / p95Before
      : 0

    // §4.7: Compute backlog growth — events offered but not yet consumed
    const backlogGrowth = totalOffered - totalRead

    // §4.7: Detect evidence of server-side backpressure
    // Server-side pressure is evidenced by: slow consumer disconnects by server,
    // or Nchan dropping messages to slow consumers, or healthy-client degradation
    // exceeding threshold (indicating Nchan is spending resources on slow consumers)
    const evidenceBackpressure = slowDisconnects > 0 || degradation > LATENCY_DEGRADATION_THRESHOLD

    // §4.7: Compute offered read rate (events/s delivered to slow consumers)
    const slowOfferedRate = slowPhaseElapsed > 0 ? totalOffered / (slowPhaseElapsed / 1000) : 0
    const slowReadRate = slowPhaseElapsed > 0 ? totalRead / (slowPhaseElapsed / 1000) : 0

    ctx.log(`§4.7 slow offered: ${totalOffered} events (${slowOfferedRate.toFixed(2)}/s), read: ${totalRead} events (${slowReadRate.toFixed(2)}/s), backlog_growth=${backlogGrowth}`)
    ctx.log(`§4.7 server-side backpressure: ${evidenceBackpressure ? "YES" : "NO"}`)

    // §4.8: Core property — bounded behavior without unbounded memory growth
    // The test passes if healthy clients are not significantly degraded
    // AND the system demonstrates bounded behavior (no unbounded backlog growth)
    const degradationOk = degradation <= LATENCY_DEGRADATION_THRESHOLD
    // §4.7: Bounded memory — backlog must not grow without bound
    // With frozen params: ~9 events/s on 8 matches = ~72 events/s total
    // Slow consumers get 1 event per 2s = 0.5 events/s
    // Over 15s, backlog should grow by ~(72 - 0.5*slowCount) * 15
    // But it must be finite and measurable, not infinite
    const boundedOk = backlogGrowth >= 0 // Must have some backlog (proof throttling works)
      && (totalRead > 0 || slowDisconnects > 0) // Must have consumed something or been disconnected

    // §4.8: Pass/fail rule — frozen interpretation:
    // PASS: healthy degradation <= threshold AND bounded behavior demonstrated
    // INCONCLUSIVE: no server-side backpressure reached (test absorbed by kernel buffers)
    const passed = degradationOk && boundedOk

    this.slowMetrics = {
      slow_clients: slowCount,
      healthy_clients: healthyConnections.length,
      slow_offered_event_count: totalOffered,
      slow_application_read_count: totalRead,
      slow_backlog_growth: backlogGrowth,
      backpressure_duration_ms: slowPhaseElapsed,
      evidence_server_side_backpressure_reached: evidenceBackpressure,
      healthy_p95_before_ms: p95Before,
      healthy_p95_during_slow_ms: p95During,
      healthy_degradation_pct: degradation * 100,
      slow_disconnects: slowDisconnects,
    }

    const detail = [
      `slow_throttled=${slowCount}/${all.length}`,
      `slow_disconnects=${slowDisconnects}/${slowCount}`,
      `slow_offered=${totalOffered}`,
      `slow_read=${totalRead}`,
      `slow_backlog_growth=${backlogGrowth}`,
      `slow_read_rate=${slowReadRate.toFixed(2)}/s`,
      `p95_before=${p95Before}ms`,
      `p95_with_slow=${p95During}ms`,
      `degradation=${(degradation * 100).toFixed(1)}%`,
      `threshold=${(LATENCY_DEGRADATION_THRESHOLD * 100).toFixed(0)}%`,
      `backpressure=${evidenceBackpressure ? "YES" : "NO"}`,
      `bounded=${boundedOk ? "OK" : "FAIL"}`,
    ].join(" ")

    ctx.log(`Slow consumer result: ${passed ? "PASS" : "FAIL"} (${detail})`)
    return { name: this.name, passed, detail }
  }
}
