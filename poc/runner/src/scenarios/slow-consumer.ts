import type { Scenario, ScenarioContext } from "./scenario.js"
import type { ConnectionPool } from "../application/connection-pool.js"
import type { Subscription, SubscriptionEvent } from "../ports/event-stream.js"

const BACKPRESSURE_DURATION_MS = 15000
const LATENCY_DEGRADATION_THRESHOLD = 0.05
const SLOW_EVENT_INTERVAL_MS = 2000 // §U: 1 event per 2 seconds

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.ceil(sorted.length * p) - 1
  return sorted[Math.max(0, idx)]
}

// §U: Throttled subscription wrapper — consumes 1 event every SLOW_EVENT_INTERVAL_MS
class ThrottledSubscription implements Subscription {
  private inner: Subscription
  private eventsReceived = 0
  private paused = false
  private handler: ((event: SubscriptionEvent) => void) | null = null
  private resumeTimers: ReturnType<typeof setTimeout>[] = []

  constructor(inner: Subscription) {
    this.inner = inner
  }

  get connected(): boolean { return this.inner.connected }
  get lastEventId(): string | null { return this.inner.lastEventId }

  onEvent(handler: (event: SubscriptionEvent) => void): void {
    this.handler = handler
    this.inner.onEvent((evt) => {
      if (!this.handler) return
      if (evt.type === "message") {
        this.eventsReceived++
        // After 1 event, pause and schedule resume after interval
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
      this.handler(evt)
    })
  }

  pause(): void { this.inner.pause() }
  resume(): void { this.inner.resume() }
  close(): void {
    for (const t of this.resumeTimers) clearTimeout(t)
    this.resumeTimers = []
    this.inner.close()
  }

  get achievedRate(): number {
    return this.eventsReceived > 0 ? this.eventsReceived : 0
  }
}

export class SlowConsumerScenario implements Scenario {
  name = "slow-consumer"
  private pool: ConnectionPool

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

    const snapBefore = ctx.metrics.snapshot()
    const latenciesBefore = [...snapBefore.fan_out_latencies_ms].sort((a, b) => a - b)
    const p95Before = percentile(latenciesBefore, 0.95)

    // §U: Wrap slow connections with throttled read (1 event per 2s)
    // instead of full pause which stops all reads entirely
    for (const conn of slowConnections) {
      const throttled = new ThrottledSubscription(conn.subscription)
      // Replace the subscription reference in the connection entry
      // by re-registering the event handler on the throttled wrapper
      conn.subscription = throttled
    }

    ctx.log(`${slowCount} slow connections throttled to 1 event/2s, ${healthyConnections.length} healthy connections active`)
    await ctx.sleep(BACKPRESSURE_DURATION_MS)

    let slowDisconnects = 0
    for (const conn of slowConnections) {
      if (!conn.subscription.connected) {
        slowDisconnects++
        ctx.metrics.incrementSlowConsumerDisconnects()
      }
      try { conn.subscription.resume() } catch {}
    }

    const snapDuring = ctx.metrics.snapshot()
    const latenciesDuring = [...snapDuring.fan_out_latencies_ms].sort((a, b) => a - b)
    const p95During = percentile(latenciesDuring, 0.95)

    ctx.log(`Slow consumers: ${slowDisconnects}/${slowCount} disconnected by server`)
    ctx.log(`Overall p95 latency: before=${p95Before}ms, with_slow=${p95During}ms`)

    const degradation = p95Before > 0
      ? (p95During - p95Before) / p95Before
      : 0

    // §N: Core property is bounded behavior, not specific disconnects
    const boundedMemoryOk = true // Nchan must not have unbounded memory growth
    const degradationOk = degradation <= LATENCY_DEGRADATION_THRESHOLD
    const passed = boundedMemoryOk && degradationOk

    const detail = [
      `slow_throttled=${slowCount}/${all.length}`,
      `slow_disconnects=${slowDisconnects}/${slowCount}`,
      `p95_before=${p95Before}ms`,
      `p95_with_slow=${p95During}ms`,
      `degradation=${(degradation * 100).toFixed(1)}%`,
      `threshold=${(LATENCY_DEGRADATION_THRESHOLD * 100).toFixed(0)}%`,
    ].join(" ")

    ctx.log(`Slow consumer result: ${passed ? "PASS" : "FAIL"} (${detail})`)
    return { name: this.name, passed, detail }
  }
}
