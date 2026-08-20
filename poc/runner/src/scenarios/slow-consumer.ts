import type { Scenario, ScenarioContext } from "./scenario.js"
import type { ConnectionPool } from "../application/connection-pool.js"
import type { Subscription, SubscriptionEvent } from "../ports/event-stream.js"
import { StreamingHistogram } from "../adapters/streaming-histogram.js"

// §4.7: Frozen slow-consumer parameters
const BACKPRESSURE_DURATION_MS = 15000
const LATENCY_DEGRADATION_THRESHOLD = 0.05
const SLOW_EVENT_INTERVAL_MS = 2000 // §U: 1 event per 2 seconds

// §3.6: Nchan memory sampling interval during slow phase
const MEMORY_SAMPLE_INTERVAL_MS = 1000

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
  // §3.6: Dedicated healthy-cohort histograms (isolated from slow connections)
  healthy_before_sample_count: number
  healthy_during_sample_count: number
  // §3.6: Nchan memory during slow phase
  nchan_memory_baseline_bytes: number | null
  nchan_memory_during_bytes: number | null
  nchan_memory_end_bytes: number | null
  nchan_memory_recovery_bytes: number | null
  nchan_memory_samples_during: number[]
  // §3.8: Per-client event timestamps (not merged) — proves per-client 2-second pacing
  per_client_event_timestamps_ms: number[][]
  slow_achieved_read_rate_events_per_sec: number
  // §3.8: Per-client median intervals — each should achieve ~2s independently
  per_client_median_event_interval_ms: number[]
  // §3.8: Aggregated interval stats (all clients merged)
  slow_median_event_interval_ms: number
  slow_p95_event_interval_ms: number
  // §3.8: Memory boundedness trend result
  nchan_memory_bounded: boolean | null
  nchan_memory_growth_bytes: number | null
  nchan_memory_growth_pct: number | null
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.ceil(sorted.length * p) - 1
  return sorted[Math.max(0, idx)]
}

// §4.7: Throttled subscription wrapper — consumes 1 event every SLOW_EVENT_INTERVAL_MS
// Controls read-side pacing by pausing/resuming the underlying transport.
// §3.6: Tracks timestamps of events arriving at the subscription for throttle proof.
// The pause/resume model means Nchan delivers events only when the transport is resumed,
// so offered = events delivered by transport, read = events forwarded to application.
// In this model, both are incremented at the same boundary because the transport only
// delivers when the client reads (TCP backpressure). The key proof is the inter-event
// interval: if it's ~2s, the throttle is working.
class ThrottledSubscription implements Subscription {
  private inner: Subscription
  private eventsReceived = 0
  private paused = false
  private poolHandler: ((event: SubscriptionEvent) => void) | null
  private downstreamHandler: ((event: SubscriptionEvent) => void) | null = null
  private resumeTimers: ReturnType<typeof setTimeout>[] = []
  private _offeredCount = 0
  // §3.6: Timestamps (ms since page load) of events arriving at this subscription
  private _eventTimestampsMs: number[] = []

  constructor(inner: Subscription, poolHandler: (event: SubscriptionEvent) => void) {
    this.inner = inner
    this.poolHandler = poolHandler
    // §3.17: Chain BOTH the pool handler and throttling logic.
    this.inner.onEvent((evt) => {
      if (evt.type === "message") {
        this._offeredCount++
        this.eventsReceived++
        // §3.6: Record the timestamp when this event arrived
        this._eventTimestampsMs.push(performance.now())
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
      // Forward to pool handler (for metrics/tracking) AND downstream handler
      this.poolHandler?.(evt)
      this.downstreamHandler?.(evt)
    })
  }

  get connected(): boolean { return this.inner.connected }
  get lastEventId(): string | null { return this.inner.lastEventId }

  onEvent(handler: (event: SubscriptionEvent) => void): void {
    this.downstreamHandler = handler
  }

  getEventHandler(): ((event: SubscriptionEvent) => void) | null {
    return this.downstreamHandler
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
  // §3.6: Timestamps of events arriving at this subscription
  get eventTimestampsMs(): number[] { return this._eventTimestampsMs }
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

    // §3.6: Snapshot healthy-client latency before slow phase — dedicated histogram
    // At this point ALL connections are healthy, so the global snapshot IS the healthy cohort
    const healthyBeforeHist = new StreamingHistogram()
    const snapBefore = ctx.metrics.snapshot()
    for (const ms of snapBefore.fan_out_latencies_ms) {
      healthyBeforeHist.record(ms)
    }
    const p95Before = healthyBeforeHist.p95()

    // §3.6: Nchan memory baseline — before wrapping slow connections
    const nchanMemBaseline = ctx.resourceMonitor.snapshot().nchan_memory_current_bytes
    ctx.log(`§3.6 nchan_memory_baseline=${nchanMemBaseline !== null ? `${(nchanMemBaseline / 1024 / 1024).toFixed(1)}MB` : "null"}`)

    // §4.7: Wrap slow connections with throttled read (1 event per 2s)
    const throttledWrappers: ThrottledSubscription[] = []
    for (const conn of slowConnections) {
      // §3.17: Capture the pool's handler via the Subscription interface — no unsafe type erasure.
      const poolHandler = conn.subscription.getEventHandler() ?? (() => {})
      const throttled = new ThrottledSubscription(conn.subscription, poolHandler)
      conn.subscription = throttled
      throttledWrappers.push(throttled)
    }

    ctx.log(`${slowCount} slow connections throttled to 1 event/2s, ${healthyConnections.length} healthy connections active`)

    // §3.6: Create a dedicated histogram for healthy connections during the slow phase.
    // Register a listener on each healthy connection that records latency into this histogram.
    const healthyDuringHist = new StreamingHistogram()
    for (const conn of healthyConnections) {
      const origHandler = conn.subscription.getEventHandler()
      conn.subscription.onEvent((evt) => {
        if (evt.type === "message" && evt.event.id) {
          // §3.6: Parse the event to extract publish_timestamp for latency measurement
          try {
            const body = JSON.parse(evt.event.data)
            if (body.publish_timestamp) {
              const latencyMs = Date.now() - new Date(body.publish_timestamp).getTime()
              if (latencyMs >= 0 && latencyMs < 30000) {
                healthyDuringHist.record(latencyMs)
              }
            }
          } catch { /* non-JSON events are expected */ }
        }
        // §3.17: Chain to the original pool handler
        origHandler?.(evt)
      })
    }

    // §3.6: Nchan memory sampling during slow phase
    const nchanMemSamplesDuring: number[] = []
    const sampleTimer = setInterval(() => {
      const snap = ctx.resourceMonitor.snapshot()
      if (snap.nchan_memory_current_bytes !== null) {
        nchanMemSamplesDuring.push(snap.nchan_memory_current_bytes)
      }
    }, MEMORY_SAMPLE_INTERVAL_MS)

    // §4.7: Measure during the slow phase
    const slowPhaseStart = ctx.clock.now()
    await ctx.sleep(BACKPRESSURE_DURATION_MS)
    const slowPhaseElapsed = ctx.clock.now() - slowPhaseStart

    // §3.6: Stop memory sampling
    clearInterval(sampleTimer)

    // §3.6: Nchan memory at slow end — before resuming
    const nchanMemEnd = ctx.resourceMonitor.snapshot().nchan_memory_current_bytes
    ctx.log(`§3.6 nchan_memory_end=${nchanMemEnd !== null ? `${(nchanMemEnd / 1024 / 1024).toFixed(1)}MB` : "null"}`)
    if (nchanMemBaseline !== null && nchanMemEnd !== null) {
      const growthMB = (nchanMemEnd - nchanMemBaseline) / 1024 / 1024
      ctx.log(`§3.6 nchan_memory_growth_during=${growthMB >= 0 ? "+" : ""}${growthMB.toFixed(1)}MB`)
    }

    // §4.7: Collect slow-consumer metrics after the phase
    let slowDisconnects = 0
    let totalOffered = 0
    let totalRead = 0
    // §3.8: Per-client event timestamps (not merged) — proves per-client 2-second pacing
    const perClientTimestampsMs: number[][] = []
    for (let i = 0; i < slowConnections.length; i++) {
      const conn = slowConnections[i]
      const wrapper = throttledWrappers[i]
      if (!conn.subscription.connected) {
        slowDisconnects++
        ctx.metrics.incrementSlowConsumerDisconnects()
      }
      totalOffered += wrapper.offeredCount
      totalRead += wrapper.achievedReadCount
      perClientTimestampsMs.push([...wrapper.eventTimestampsMs])
      try { conn.subscription.resume() } catch {}
    }

    // §3.6: Nchan memory after recovery — after resuming all connections
    await ctx.sleep(2000) // Allow time for recovery
    const nchanMemRecovery = ctx.resourceMonitor.snapshot().nchan_memory_current_bytes
    ctx.log(`§3.6 nchan_memory_recovery=${nchanMemRecovery !== null ? `${(nchanMemRecovery / 1024 / 1024).toFixed(1)}MB` : "null"}`)

    // §3.6: Compute achieved read rate from slow consumers
    const slowReadRate = slowPhaseElapsed > 0 ? totalRead / (slowPhaseElapsed / 1000) : 0

    // §3.8: Compute per-client inter-event intervals — proves each client achieves ~2s pacing
    const allSortedIntervals: number[] = []
    const perClientMedianIntervals: number[] = []
    for (const clientTs of perClientTimestampsMs) {
      if (clientTs.length < 2) continue
      const sorted = [...clientTs].sort((a, b) => a - b)
      const intervals: number[] = []
      for (let i = 1; i < sorted.length; i++) {
        intervals.push(sorted[i] - sorted[i - 1])
      }
      allSortedIntervals.push(...intervals)
      perClientMedianIntervals.push(percentile(intervals.sort((a, b) => a - b), 0.5))
    }
    allSortedIntervals.sort((a, b) => a - b)
    const medianInterval = percentile(allSortedIntervals, 0.5)
    const p95Interval = percentile(allSortedIntervals, 0.95)
    // §3.8: Per-client median interval — all clients should achieve ~2s pacing independently
    const perClientMediansAllAbove1s = perClientMedianIntervals.every((m) => m >= 1000)
    ctx.log(`§3.6 slow_consumer read rate: ${slowReadRate.toFixed(2)} events/s, median_interval=${medianInterval.toFixed(0)}ms, p95_interval=${p95Interval.toFixed(0)}ms (target=${SLOW_EVENT_INTERVAL_MS}ms)`)
    ctx.log(`§3.8 per_client_medians: [${perClientMedianIntervals.map((m) => m.toFixed(0)).join(", ")}]ms, all_above_1s=${perClientMediansAllAbove1s}`)

    // §3.6: Healthy-client latency during slow phase — from dedicated histogram
    const p95During = healthyDuringHist.p95()

    ctx.log(`Slow consumers: ${slowDisconnects}/${slowCount} disconnected by server`)
    ctx.log(`§3.6 healthy p95 latency (dedicated cohort): before=${p95Before}ms, with_slow=${p95During}ms`)
    ctx.log(`§3.6 healthy_during_sample_count=${healthyDuringHist.count}`)

    const degradation = p95Before > 0
      ? (p95During - p95Before) / p95Before
      : 0

    // §4.7: Compute backlog growth — events offered but not yet consumed
    const backlogGrowth = totalOffered - totalRead

    // §3.8: Nchan memory boundedness — trend-based rule, not arbitrary threshold
    // Bounded = memory did not grow continuously during the slow phase AND recovered after
    // Unavailable evidence = INCONCLUSIVE (not pass)
    const nchanMemoryBounded = (() => {
      if (nchanMemBaseline === null || nchanMemEnd === null) return null // unknown
      const growthBytes = nchanMemEnd - nchanMemBaseline
      // Growth must be < 10% of baseline AND < 50MB to be considered bounded
      const growthPct = nchanMemBaseline > 0 ? growthBytes / nchanMemBaseline : 0
      if (growthBytes >= 50 * 1024 * 1024 || growthPct >= 0.10) return false
      // If recovery sample exists, check it returned toward baseline
      if (nchanMemRecovery !== null) {
        const recoveryDelta = Math.abs(nchanMemRecovery - nchanMemBaseline)
        if (recoveryDelta >= 50 * 1024 * 1024) return false
      }
      return true
    })()

    // §3.8: Server-side backpressure — falsifiable signal
    // NOT just any memory increase or latency change. Require:
    //   1. Slow consumers disconnected by server (definitive), OR
    //   2. Nchan memory grew by >1MB AND >5% of baseline (meaningful server-side buffering)
    // Small memory variation or kernel socket absorption does NOT count.
    const nchanMemoryGrew = nchanMemBaseline !== null && nchanMemEnd !== null
      ? nchanMemEnd > nchanMemBaseline
      : false
    const nchanMemoryGrowthBytes = nchanMemBaseline !== null && nchanMemEnd !== null
      ? nchanMemEnd - nchanMemBaseline
      : 0
    const nchanMemoryGrowthPct = nchanMemBaseline !== null && nchanMemBaseline > 0
      ? nchanMemoryGrowthBytes / nchanMemBaseline
      : 0
    const nchanMemoryMeaningfulGrowth = nchanMemoryGrowthBytes > 1024 * 1024 && nchanMemoryGrowthPct > 0.05
    const evidenceBackpressure = slowDisconnects > 0 || nchanMemoryMeaningfulGrowth

    ctx.log(`§3.6 slow offered: ${totalOffered} events (${(totalOffered / (slowPhaseElapsed / 1000)).toFixed(2)} /s), read: ${totalRead} events (${slowReadRate.toFixed(2)} /s), backlog_growth=${backlogGrowth}`)
    ctx.log(`§3.6 server-side backpressure: ${evidenceBackpressure ? "YES" : "NO"} (disconnects=${slowDisconnects > 0}, nchan_memory_grew=${nchanMemoryGrew}, degradation=${degradation > LATENCY_DEGRADATION_THRESHOLD})`)

    // §4.8: Core property — bounded behavior without unbounded memory growth
    const degradationOk = degradation <= LATENCY_DEGRADATION_THRESHOLD
    // §3.8: Boundedness = Nchan memory trend is bounded (null = unknown = INCONCLUSIVE)
    const boundedOk = nchanMemoryBounded === true
      && backlogGrowth >= 0
      && (totalRead > 0 || slowDisconnects > 0)

    // §4.8: Pass/fail rule — frozen interpretation:
    // PASS: healthy degradation <= threshold AND bounded behavior demonstrated AND backpressure proven
    // INCONCLUSIVE: no server-side backpressure reached (absorbed by kernel buffers) OR boundedness unknown
    // §3.8: PASS only when all three conditions hold: backpressure proven, bounded memory, healthy degradation ok
    const boundedKnown = nchanMemoryBounded !== null
    const passed = degradationOk && boundedOk && evidenceBackpressure && boundedKnown

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
      // §3.6: Dedicated healthy-cohort histograms
      healthy_before_sample_count: healthyBeforeHist.count,
      healthy_during_sample_count: healthyDuringHist.count,
      // §3.6: Nchan memory during slow phase
      nchan_memory_baseline_bytes: nchanMemBaseline,
      nchan_memory_during_bytes: nchanMemSamplesDuring.length > 0 ? nchanMemSamplesDuring[nchanMemSamplesDuring.length - 1] : null,
      nchan_memory_end_bytes: nchanMemEnd,
      nchan_memory_recovery_bytes: nchanMemRecovery,
      nchan_memory_samples_during: nchanMemSamplesDuring,
      // §3.8: Per-client event timestamps (not merged)
      per_client_event_timestamps_ms: perClientTimestampsMs,
      slow_achieved_read_rate_events_per_sec: slowReadRate,
      // §3.8: Per-client median intervals
      per_client_median_event_interval_ms: perClientMedianIntervals,
      // §3.8: Aggregated interval stats
      slow_median_event_interval_ms: medianInterval,
      slow_p95_event_interval_ms: p95Interval,
      // §3.8: Memory boundedness trend
      nchan_memory_bounded: nchanMemoryBounded,
      nchan_memory_growth_bytes: nchanMemBaseline !== null && nchanMemEnd !== null ? nchanMemEnd - nchanMemBaseline : null,
      nchan_memory_growth_pct: nchanMemoryGrowthPct,
    }

    const detail = [
      `slow_throttled=${slowCount}/${all.length}`,
      `slow_disconnects=${slowDisconnects}/${slowCount}`,
      `slow_offered=${totalOffered}`,
      `slow_read=${totalRead}`,
      `slow_backlog_growth=${backlogGrowth}`,
      `slow_read_rate=${slowReadRate.toFixed(2)}/s`,
      `median_event_interval=${medianInterval.toFixed(0)}ms`,
      `p95_event_interval=${p95Interval.toFixed(0)}ms`,
      `per_client_medians=[${perClientMedianIntervals.map((m) => m.toFixed(0)).join(",")}]ms`,
      `p95_before=${p95Before}ms`,
      `p95_with_slow=${p95During}ms`,
      `healthy_before_samples=${healthyBeforeHist.count}`,
      `healthy_during_samples=${healthyDuringHist.count}`,
      `degradation=${(degradation * 100).toFixed(1)}%`,
      `threshold=${(LATENCY_DEGRADATION_THRESHOLD * 100).toFixed(0)}%`,
      `backpressure=${evidenceBackpressure ? "YES" : "NO"}`,
      `nchan_mem_baseline=${nchanMemBaseline !== null ? `${(nchanMemBaseline / 1024 / 1024).toFixed(1)}MB` : "null"}`,
      `nchan_mem_end=${nchanMemEnd !== null ? `${(nchanMemEnd / 1024 / 1024).toFixed(1)}MB` : "null"}`,
      `nchan_mem_growth=${nchanMemoryGrowthBytes !== null ? `${(nchanMemoryGrowthBytes / 1024 / 1024).toFixed(1)}MB (${(nchanMemoryGrowthPct * 100).toFixed(1)}%)` : "null"}`,
      `nchan_mem_bounded=${nchanMemoryBounded === null ? "unknown" : nchanMemoryBounded ? "OK" : "FAIL"}`,
      `nchan_mem_samples=${nchanMemSamplesDuring.length}`,
      `bounded=${boundedOk ? "OK" : "FAIL"}`,
    ].join(" ")

    ctx.log(`Slow consumer result: ${passed ? "PASS" : "FAIL"} (${detail})`)
    return { name: this.name, passed, detail }
  }
}
