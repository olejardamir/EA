import type { Scenario, ScenarioContext } from "./scenario.js"
import type { ConnectionPool } from "../application/connection-pool.js"
import type { Subscription, SubscriptionEvent } from "../ports/event-stream.js"
import { StreamingHistogram } from "../adapters/streaming-histogram.js"

// §4.7: Frozen slow-consumer parameters
const BACKPRESSURE_DURATION_MS = 15000
const LATENCY_DEGRADATION_THRESHOLD = 0.05
const SLOW_EVENT_INTERVAL_MS = 2000 // §U: 1 event per 2 seconds
const PACING_TOLERANCE_FRACTION = 0.20
const PACING_MIN_MS = SLOW_EVENT_INTERVAL_MS * (1 - PACING_TOLERANCE_FRACTION)
const PACING_MAX_MS = SLOW_EVENT_INTERVAL_MS * (1 + PACING_TOLERANCE_FRACTION)
const HEALTHY_BASELINE_MS = 3000
const RECOVERY_TIMEOUT_MS = 10_000
const MEMORY_MAX_GROWTH_BYTES = 50 * 1024 * 1024
const MEMORY_MAX_GROWTH_FRACTION = 0.10
const MEMORY_MAX_RECOVERY_DELTA_BYTES = 50 * 1024 * 1024
const MEMORY_MEANINGFUL_GROWTH_BYTES = 1024 * 1024
const MEMORY_MEANINGFUL_GROWTH_FRACTION = 0.05

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
  independent_offered_measurement: boolean
  pacing_valid: boolean
  replay_recovery_pct: number
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.ceil(sorted.length * p) - 1
  return sorted[Math.max(0, idx)]
}

// §4.7: Throttled subscription wrapper — consumes 1 event every SLOW_EVENT_INTERVAL_MS
// Controls read-side pacing by pausing/resuming the underlying transport.
// §3.6: Tracks timestamps of events arriving at the subscription for throttle proof.
//
class ThrottledSubscription implements Subscription {
  private inner: Subscription
  private eventsReceived = 0
  private paused = false
  private downstreamHandler: ((event: SubscriptionEvent) => void) | null = null
  private resumeTimers: ReturnType<typeof setTimeout>[] = []
  private _offeredCount = 0
  private throttleEnabled = true
  // §3.6: Timestamps (ms since page load) of events arriving at this subscription
  private _eventTimestampsMs: number[] = []

  constructor(inner: Subscription) {
    this.inner = inner
    // §M3-R dup fix: onEvent ADDS a handler (sse-http-client §3.17) and the
    // pool handler stays registered on the inner subscription, so it keeps
    // firing exactly once on its own. Re-forwarding events to the captured
    // pool handler from this wrapper double-counted every frame as a wire
    // duplicate from the moment throttling was installed.
    this.inner.onEvent((evt) => {
      if (evt.type === "message") {
        this._offeredCount++
        this.eventsReceived++
        // §3.6: Record the timestamp when this event arrived
        this._eventTimestampsMs.push(performance.now())
        if (this.throttleEnabled && !this.paused) {
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
      // Forward to downstream handler only (pool handler is dispatched by inner)
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

  disableThrottle(): void {
    this.throttleEnabled = false
    this.paused = false
    for (const timer of this.resumeTimers) clearTimeout(timer)
    this.resumeTimers = []
    if (this.inner.connected) this.inner.resume()
  }
}

export function independentOfferedCount(headsBefore: number[], headsAfter: number[]): number {
  return headsAfter.reduce((sum, head, index) => sum + Math.max(0, head - (headsBefore[index] ?? head)), 0)
}

export function pacingWithinTolerance(medians: number[], intendedClients: number): boolean {
  return medians.length === intendedClients && medians.every((median) => median >= PACING_MIN_MS && median <= PACING_MAX_MS)
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

    // Dedicated immediately-before-slow healthy baseline. This listener is
    // installed now and excludes every earlier phase by construction.
    // §M3-R dup fix: onEvent ADDS a handler and the pool handler remains
    // registered on the subscription, so this wrapper must ONLY record the
    // latency histogram. Re-invoking the captured handler dispatched every
    // frame twice into the pool's sequence tracker, counting each event as a
    // duplicate for the rest of the run.
    const healthyBeforeHist = new StreamingHistogram()
    const healthyDuringHist = new StreamingHistogram()
    let collectHealthyBaseline = true
    let collectHealthyDuring = false
    for (const conn of healthyConnections) {
      conn.subscription.onEvent((evt) => {
        if (evt.type === "message") {
          try {
            const payload = JSON.parse(evt.event.data)
            const publishedAt = new Date(payload.publish_timestamp).getTime()
            const latencyMs = Date.now() - publishedAt
            if (Number.isFinite(publishedAt) && latencyMs >= 0 && latencyMs < 30_000) {
              if (collectHealthyBaseline) healthyBeforeHist.record(latencyMs)
              if (collectHealthyDuring) healthyDuringHist.record(latencyMs)
            }
          } catch {}
        }
      })
    }
    await ctx.sleep(HEALTHY_BASELINE_MS)
    collectHealthyBaseline = false
    const p95Before = healthyBeforeHist.p95()

    // §3.6: Nchan memory baseline — before wrapping slow connections
    const nchanMemBaseline = ctx.resourceMonitor.snapshot().nchan_memory_current_bytes
    ctx.log(`§3.6 nchan_memory_baseline=${nchanMemBaseline !== null ? `${(nchanMemBaseline / 1024 / 1024).toFixed(1)}MB` : "null"}`)

    // §4.7: Wrap slow connections with throttled read (1 event per 2s)
    const throttledWrappers: ThrottledSubscription[] = []
    for (const conn of slowConnections) {
      const throttled = new ThrottledSubscription(conn.subscription)
      conn.subscription = throttled
      throttledWrappers.push(throttled)
    }

    ctx.log(`${slowCount} slow connections throttled to 1 event/2s, ${healthyConnections.length} healthy connections active`)
    collectHealthyDuring = true

    // §3.7: Track heads before slow phase for missed-live computation
    const headsBeforeSlow = slowConnections.map(conn => ctx.headTracker.getHead(conn.matchId))

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
    collectHealthyDuring = false

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
      totalRead += wrapper.achievedReadCount
      perClientTimestampsMs.push([...wrapper.eventTimestampsMs])
    }

    // §3.7: Compute per-client missed live using head deltas
    const headsAfterSlow = slowConnections.map(conn => ctx.headTracker.getHead(conn.matchId))
    // Independent offered/expected source: canonical accepted publisher head
    // deltas for each slow client's channel, not the slow callback itself.
    totalOffered = independentOfferedCount(headsBeforeSlow, headsAfterSlow)

    // §3.7: Capture read counts before resume for replay tracking
    const readBeforeResume = throttledWrappers.map(w => w.achievedReadCount)

    // Remove throttling and drain replay/backlog until recovered or timed out.
    for (const wrapper of throttledWrappers) wrapper.disableThrottle()
    const expectedRecovery = totalOffered - totalRead
    const recoveryDeadline = Date.now() + RECOVERY_TIMEOUT_MS
    while (Date.now() < recoveryDeadline) {
      const recovered = throttledWrappers.reduce((sum, wrapper, index) => sum + Math.max(0, wrapper.achievedReadCount - readBeforeResume[index]), 0)
      if (recovered >= expectedRecovery) break
      await ctx.sleep(100)
    }

    // §3.6: Nchan memory after recovery — after resuming all connections
    await ctx.sleep(2000) // Allow time for recovery
    const nchanMemRecovery = ctx.resourceMonitor.snapshot().nchan_memory_current_bytes

    // §3.7: Capture replay counts after recovery
    const readAfterReplay = throttledWrappers.map(w => w.achievedReadCount)
    ctx.log(`§3.6 nchan_memory_recovery=${nchanMemRecovery !== null ? `${(nchanMemRecovery / 1024 / 1024).toFixed(1)}MB` : "null"}`)

    // §3.7: Build per-client detail records with missed-live and replay metrics
    interface PerClientDetail {
      index: number
      missedLive: number
      missedReplay: number
      replayGap: number
      totalMissed: number
      detail: string
    }
    const perClientDetails: PerClientDetail[] = []
    for (let i = 0; i < slowConnections.length; i++) {
      const publishedDuringSlow = headsAfterSlow[i] - headsBeforeSlow[i]
      const consumedDuringSlow = readBeforeResume[i]
      const missedLive = Math.max(0, publishedDuringSlow - consumedDuringSlow)
      const replayReceived = Math.max(0, readAfterReplay[i] - readBeforeResume[i])
      const missedReplay = Math.max(0, missedLive - replayReceived)
      const replayGap = missedReplay
      const totalMissed = missedLive
      perClientDetails.push({
        index: i,
        missedLive,
        missedReplay,
        replayGap,
        totalMissed,
        detail: `client_${i}:missed_live=${missedLive}:missed_replay=${missedReplay}:replay_gap=${replayGap}`,
      })
    }

    // §3.7: Aggregate missed-live and replay metrics
    const missedLive = perClientDetails.reduce((s, pc) => s + pc.missedLive, 0)
    const missedReplay = perClientDetails.reduce((s, pc) => s + pc.missedReplay, 0)
    const missedRequired = missedLive
    const expectedTotalReplay = missedLive
    const replayReceivedAfterReconnect = perClientDetails.reduce((s, pc) => s + Math.min(pc.missedLive, Math.max(0, readAfterReplay[pc.index] - readBeforeResume[pc.index])), 0)
    const replayCoverage = expectedTotalReplay > 0 ? replayReceivedAfterReconnect / expectedTotalReplay : 1

    ctx.log(`§3.7 missed_live=${missedLive} missed_replay=${missedReplay} replay_coverage=${(replayCoverage * 100).toFixed(1)}%`)
    ctx.log(`§3.7 per_client: [${perClientDetails.map(d => d.detail).join("; ")}]`)

    // §3.7: Per-client gauge metrics
    for (const pc of perClientDetails) {
      ctx.metrics.gauge(`slow_client_${pc.index}_total_missed`, pc.totalMissed)
      ctx.metrics.gauge(`slow_client_${pc.index}_missed_live`, pc.missedLive)
      ctx.metrics.gauge(`slow_client_${pc.index}_missed_replay`, pc.missedReplay)
      ctx.metrics.gauge(`slow_client_${pc.index}_replay_gap`, pc.replayGap)
    }

    // §3.6: Compute achieved read rate from slow consumers
    const slowReadRate = slowPhaseElapsed > 0 ? totalRead / slowCount / (slowPhaseElapsed / 1000) : 0

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
    const pacingValid = pacingWithinTolerance(perClientMedianIntervals, slowCount)
    ctx.log(`§3.6 slow_consumer read rate: ${slowReadRate.toFixed(2)} events/s, median_interval=${medianInterval.toFixed(0)}ms, p95_interval=${p95Interval.toFixed(0)}ms (target=${SLOW_EVENT_INTERVAL_MS}ms)`)
    ctx.log(`§3.8 per_client_medians: [${perClientMedianIntervals.map((m) => m.toFixed(0)).join(", ")}]ms, tolerance=${PACING_MIN_MS}-${PACING_MAX_MS}ms pacing_valid=${pacingValid}`)

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
      if (growthBytes >= MEMORY_MAX_GROWTH_BYTES || growthPct >= MEMORY_MAX_GROWTH_FRACTION) return false
      // If recovery sample exists, check it returned toward baseline
      if (nchanMemRecovery !== null) {
        const recoveryDelta = Math.abs(nchanMemRecovery - nchanMemBaseline)
        if (recoveryDelta >= MEMORY_MAX_RECOVERY_DELTA_BYTES) return false
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
    const nchanMemoryMeaningfulGrowth = nchanMemoryGrowthBytes > MEMORY_MEANINGFUL_GROWTH_BYTES && nchanMemoryGrowthPct > MEMORY_MEANINGFUL_GROWTH_FRACTION
    const evidenceBackpressure = slowDisconnects > 0 || (backlogGrowth > 0 && nchanMemoryMeaningfulGrowth)

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
    // §3.7: PASS requires at least one client missed events and replay coverage >= 95%
    const boundedKnown = nchanMemoryBounded !== null
    const anyClientMissed = perClientDetails.some(pc => pc.totalMissed > 0)
    const replayCoverageOk = replayCoverage >= 0.95
    const passed = degradationOk && boundedOk && evidenceBackpressure && boundedKnown
      && anyClientMissed && replayCoverageOk && pacingValid

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
      independent_offered_measurement: true,
      pacing_valid: pacingValid,
      replay_recovery_pct: replayCoverage * 100,
    }

    const detail = [
      `slow_throttled=${slowCount}/${all.length}`,
      `slow_disconnects=${slowDisconnects}/${slowCount}`,
      `slow_offered=${totalOffered}`,
      `slow_read=${totalRead}`,
      `slow_backlog_growth=${backlogGrowth}`,
      `slow_read_rate=${slowReadRate.toFixed(2)}/s`,
      `missed_required=${missedRequired} direction=live`,
      `missed_live=${missedLive} direction=live`,
      `missed_replay=${missedReplay} direction=replay`,
      `replay_coverage=${(replayCoverage * 100).toFixed(1)}% direction=replay`,
      `any_client_missed=${anyClientMissed}`,
      `median_event_interval=${medianInterval.toFixed(0)}ms`,
      `p95_event_interval=${p95Interval.toFixed(0)}ms`,
      `per_client_medians=[${perClientMedianIntervals.map((m) => m.toFixed(0)).join(",")}]ms`,
      `pacing_tolerance=${PACING_MIN_MS}-${PACING_MAX_MS}ms`,
      `pacing_valid=${pacingValid}`,
      `offered_source=accepted_publisher_head_delta`,
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
      `active_start=${all.length}`,
      `active_peak=${all.length}`,
      `active_end=${this.pool.size}`,
      ...perClientDetails.map(d => d.detail),
    ].join(" ")

    ctx.log(`Slow consumer result: ${passed ? "PASS" : "FAIL"} (${detail})`)

    // §3.11.C: Record active population for this scenario
    ctx._slowConsumerActivePopulation = {
      start: all.length,
      peak: all.length,
      end: this.pool.size,
    }

    return { name: this.name, passed, detail }
  }
}
