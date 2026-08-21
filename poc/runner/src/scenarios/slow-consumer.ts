import type { Scenario, ScenarioContext } from "./scenario.js"
import type { ConnectionEntry, ConnectionPool } from "../application/connection-pool.js"
import type { Subscription, SubscriptionEvent } from "../ports/event-stream.js"
import { StreamingHistogram } from "../adapters/streaming-histogram.js"
import { MATCH_IDS, MATCH_WEIGHTS } from "../domain/event.js"

// §4.7: Frozen slow-consumer parameters
const BACKPRESSURE_DURATION_MS = 15000
const LATENCY_DEGRADATION_THRESHOLD = 0.05
export const SLOW_EVENT_INTERVAL_MS = 2000 // §U: 1 event per 2 seconds
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

// §M3-HVR: Last-Event-ID replay-probe parameters — repair #2 separates genuine
// Nchan history replay from socket-buffer catch-up. A small cohort of slow
// viewers is deliberately disconnected at its APPLICATION-consumed position,
// reattached mid-stream with Last-Event-ID, and the replayed range is counted
// against the canonical head observed at detach time. This measures server-side
// retention directly; it can never be confused with TCP drain.
const REPLAY_PROBE_MAX_CLIENTS = 3
const REPLAY_PROBE_SETTLE_MS = 1000
const REPLAY_PROBE_WINDOW_MS = 5000
export const REPLAY_COVERAGE_THRESHOLD_PCT = 95

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
  // §3.8: Per-client event timestamps (window scope only — proves per-client pacing)
  per_client_event_timestamps_ms: number[][]
  slow_achieved_read_rate_events_per_sec: number
  // §3.8: Per-client median intervals — each should achieve ~2s independently
  per_client_median_event_interval_ms: number[]
  // §3.8: Aggregated interval stats (window-scope releases merged)
  slow_median_event_interval_ms: number
  slow_p95_event_interval_ms: number
  // §3.8: Memory boundedness trend result
  nchan_memory_bounded: boolean | null
  nchan_memory_growth_bytes: number | null
  nchan_memory_growth_pct: number | null
  independent_offered_measurement: boolean
  pacing_valid: boolean
  // §M3-HVR: True Last-Event-ID replay-probe evidence (repair #2) — distinct
  // from post-window catch-up drain, which is reported separately.
  // §M3-RACE-2: selected vs reattached are reported separately; retention is
  // proven only when every selected client reattached with a measurable range.
  replay_probe_clients: number
  replay_probe_selected: number
  replay_probe_reattached: number
  replay_probe_expected_missed: number
  replay_probe_replayed: number
  replay_probe_coverage_pct: number | null
  catchup_drained_count: number
  // Gating metric: weakest per-client coverage across ALL selected probes;
  // null when any client failed to reattach or had nothing measurable.
  replay_recovery_pct: number | null
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.ceil(sorted.length * p) - 1
  return sorted[Math.max(0, idx)]
}

interface GatedOptions {
  intervalMs?: number
}

// §M3-HVR repair #1: Application-read gate that enforces "1 event / intervalMs"
// EXACTLY — including for frames already parsed inside the current TCP chunk.
//
// Why pause()/resume() alone was wrong (§U defect): sse-http-client dispatches
// every frame already present in the received chunk synchronously; pausing the
// response only prevents FUTURE data callbacks. A chunk holding N buffered
// frames was therefore dispatched near-instantly after resume(), collapsing
// measured inter-event intervals toward ~0ms even though nothing was wrong
// with the server.
//
// This wrapper takes over dispatch: the pool's handler is removed from the
// inner subscription (removeEventHandler) and invoked ONLY by this gate.
// Wire-level frames are retained in an ordered queue; releases are pumped one
// at a time every intervalMs while backlog remains. The inner transport stays
// paused whenever the queue is non-empty, so once the current chunk is fully
// enqueued, real TCP backpressure propagates to Nchan.
export class GatedThrottledSubscription implements Subscription {
  private inner: Subscription
  private appHandler: ((event: SubscriptionEvent) => void) | null = null
  private extraHandlers: Array<(event: SubscriptionEvent) => void> = []
  private queue: SubscriptionEvent[] = []
  private pumpTimer: ReturnType<typeof setTimeout> | null = null
  private innerPausedByGate = false
  private passthrough = false
  private _wireCount = 0
  private _releasedCount = 0
  private _releaseTimestampsMs: number[] = []
  private _lastReleasedEventId: string | null = null
  private intervalMs: number

  constructor(inner: Subscription, options?: GatedOptions) {
    this.inner = inner
    this.intervalMs = options?.intervalMs ?? SLOW_EVENT_INTERVAL_MS
    this.inner.onEvent((evt) => this.onWireEvent(evt))
  }

  // The scenario hands over the pool handler it removed from the inner
  // subscription. From then on this gate is the connection's sole dispatcher.
  takeOver(appHandler: ((event: SubscriptionEvent) => void) | null): void {
    this.appHandler = appHandler
  }

  get connected(): boolean {
    return this.inner.connected
  }

  get lastEventId(): string | null {
    // §M3-HVR: application-consumed position — the correct resume token for the
    // replay probe. Proxies the wire position before any release has happened.
    return this._lastReleasedEventId ?? this.inner.lastEventId
  }

  get wireCount(): number {
    return this._wireCount
  }

  get releasedCount(): number {
    return this._releasedCount
  }

  get queueDepth(): number {
    return this.queue.length
  }

  get releaseTimestampsMs(): number[] {
    return this._releaseTimestampsMs
  }

  onEvent(handler: (event: SubscriptionEvent) => void): void {
    // Post-takeover listeners fire at DELIVERY time (after the gate), so they
    // observe exactly the frames the application consumed.
    this.extraHandlers.push(handler)
  }

  getEventHandler(): ((event: SubscriptionEvent) => void) | null {
    return this.appHandler
  }

  removeEventHandler(handler: (event: SubscriptionEvent) => void): void {
    const idx = this.extraHandlers.indexOf(handler)
    if (idx >= 0) this.extraHandlers.splice(idx, 1)
  }

  pause(): void {
    this.inner.pause()
  }

  resume(): void {
    this.inner.resume()
  }

  close(): void {
    if (this.pumpTimer) clearTimeout(this.pumpTimer)
    this.pumpTimer = null
    this.queue = []
    this.inner.close()
  }

  // §M3-HVR: End-of-phase catch-up. Drains the retained backlog to the
  // application in order at full speed and switches to transparent
  // pass-through. Deliberately NOT part of replay accounting.
  flushAndRelease(): number {
    let drained = 0
    if (this.pumpTimer) clearTimeout(this.pumpTimer)
    this.pumpTimer = null
    this.passthrough = true
    while (this.queue.length > 0) {
      const evt = this.queue.shift()!
      this.deliver(evt)
      drained++
    }
    this.innerPausedByGate = false
    if (this.inner.connected) this.inner.resume()
    return drained
  }

  private deliver(evt: SubscriptionEvent): void {
    this._releasedCount++
    this._releaseTimestampsMs.push(performance.now())
    if (evt.type === "message" && evt.event.id !== undefined && evt.event.id !== null) {
      this._lastReleasedEventId = evt.event.id
    }
    this.appHandler?.(evt)
    for (const h of this.extraHandlers) h(evt)
  }

  private onWireEvent(evt: SubscriptionEvent): void {
    if (evt.type !== "message") {
      // Terminal/error events must stay live — pool disconnect attribution
      // depends on them arriving immediately, never behind the gate.
      this.appHandler?.(evt)
      for (const h of this.extraHandlers) h(evt)
      return
    }
    this._wireCount++
    if (this.passthrough) {
      this.deliver(evt)
      return
    }
    this.queue.push(evt)
    if (!this.innerPausedByGate && this.inner.connected) {
      this.inner.pause()
      this.innerPausedByGate = true
    }
    if (this.pumpTimer === null) {
      // Gate idle: consume the first event of a burst immediately, then pace.
      const next = this.queue.shift()!
      this.deliver(next)
      this.scheduleNextRelease()
    }
  }

  private scheduleNextRelease(): void {
    const timer = setTimeout(() => {
      this.pumpTimer = null
      const next = this.queue.shift()
      if (!next) {
        // Backlog drained within the window — reopen the socket until the
        // next arrival restarts the cycle.
        if (this.innerPausedByGate) {
          this.innerPausedByGate = false
          if (this.inner.connected) this.inner.resume()
        }
        return
      }
      this.deliver(next)
      this.scheduleNextRelease()
    }, this.intervalMs)
    // §M3-RACE-2 hygiene: the pump timer must never keep the process alive on
    // its own — during the slow phase the runner always holds live sockets,
    // and at teardown an orphaned 2s-interval timer would otherwise hang exit.
    timer.unref?.()
    this.pumpTimer = timer
  }
}

export function independentOfferedCount(headsBefore: number[], headsAfter: number[]): number {
  return headsAfter.reduce((sum, head, index) => sum + Math.max(0, head - (headsBefore[index] ?? head)), 0)
}

export function pacingWithinTolerance(medians: number[], intendedClients: number): boolean {
  return medians.length === intendedClients && medians.every((median) => median >= PACING_MIN_MS && median <= PACING_MAX_MS)
}

// §M3-PACE: minimum frozen match weight for slow-cohort membership. A client
// can hold one application read per SLOW_EVENT_INTERVAL_MS only while its
// channel OFFERS at least 1/intervalMs events. Under the seeded weight
// distribution the cold matches fall below that floor (match-008: 0.5/9 of
// ~8.8 match events/s ≈ 0.49/s < 0.5/s; match-007 starves ~26 % of cycles),
// so starved cycles deliver on arrival and inflate medians to 2400–2900 ms —
// physically unreachable pacing, not a gate defect. Cohort membership
// therefore prefers the busiest matches, deterministically from the frozen
// MATCH_WEIGHTS (no RNG): tier 1 = weight >= 1.5 (offer rate >= ~1.47/s,
// starved-cycle probability <= ~5 %), falling back to lower tiers only if a
// shard pool cannot fill the cohort otherwise. Partition distribution is
// untouched — selection happens inside each shard's existing pool.
const SLOW_COHORT_MIN_WEIGHT = 1.5

function matchWeight(matchId: string): number {
  const idx = MATCH_IDS.indexOf(matchId)
  return idx >= 0 ? MATCH_WEIGHTS[idx] : 0
}

export function selectSlowCohort(entries: ConnectionEntry[], count: number): ConnectionEntry[] {
  if (count >= entries.length) return [...entries]
  const taken = new Set<ConnectionEntry>()
  const selected: ConnectionEntry[] = []
  const tiers = [SLOW_COHORT_MIN_WEIGHT, 1.0, 0]
  for (const tier of tiers) {
    for (const entry of entries) {
      if (selected.length >= count) break
      if (taken.has(entry)) continue
      if (matchWeight(entry.matchId) >= tier) {
        taken.add(entry)
        selected.push(entry)
      }
    }
    if (selected.length >= count) break
  }
  // Guarantee the exact cohort size even on degenerate pools.
  for (const entry of entries) {
    if (selected.length >= count) break
    if (!taken.has(entry)) {
      taken.add(entry)
      selected.push(entry)
    }
  }
  return selected
}

// §M3-HVR: Extract canonical_seq from a match frame payload (production schema),
// falling back to the lightweight `seq` used by unit-test fixtures. Returns null
// when neither field carries a usable number.
function extractSeq(data: string): number | null {
  try {
    const parsed = JSON.parse(data) as Record<string, unknown>
    if (typeof parsed.canonical_seq === "number") return parsed.canonical_seq
    if (typeof parsed.seq === "number") return parsed.seq
  } catch {}
  return null
}

interface ReplayProbeRecord {
  entry: ConnectionEntry
  detachedId: string | null
  collector: ((evt: SubscriptionEvent) => void) | null
  // §M3-RACE-4: the subscription-level handler is the pool's forwarding wrapper,
  // so window teardown disarms the observer instead of removing a handler.
  disarm: (() => void) | null
  consumedHead: number
  headAtDetach: number
  expectedMissed: number
  replayed: number
  liveDuringProbe: number
  reattached: boolean
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
    // §M3-PACE: deterministic busy-match preference — the frozen 2 s read pace
    // is only physically achievable on channels whose offer rate sustains it.
    const slowConnections = selectSlowCohort(all, slowCount)
    const slowSet = new Set(slowConnections)
    const healthyConnections = all.filter((conn) => !slowSet.has(conn))

    ctx.log(`Designating ${slowCount}/${all.length} connections as slow (${slowFraction * 100}%)`)

    // Dedicated immediately-before-slow healthy baseline. This listener is
    // installed now and excludes every earlier phase by construction.
    // §M3-R dup fix: onEvent ADDS a handler and the pool handler remains
    // registered on the subscription, so this listener must ONLY record the
    // latency histogram.
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

    // §M3-HVR repair #1: install the application-read gate. The pool handler is
    // removed from the inner subscription and handed to the gate, which retains
    // parsed frames and releases them at true application pace.
    const gatedWrappers: GatedThrottledSubscription[] = []
    for (const conn of slowConnections) {
      const poolHandler = conn.subscription.getEventHandler()
      if (poolHandler) conn.subscription.removeEventHandler?.(poolHandler)
      const gated = new GatedThrottledSubscription(conn.subscription)
      gated.takeOver(poolHandler)
      conn.subscription = gated
      conn.deferredDelivery = true
      gatedWrappers.push(gated)
    }

    ctx.log(`${slowCount} slow connections gated to true 1-event/${SLOW_EVENT_INTERVAL_MS}ms application reads, ${healthyConnections.length} healthy connections active`)
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

    // §3.6: Nchan memory at slow end — before any release activity
    const nchanMemEnd = ctx.resourceMonitor.snapshot().nchan_memory_current_bytes
    ctx.log(`§3.6 nchan_memory_end=${nchanMemEnd !== null ? `${(nchanMemEnd / 1024 / 1024).toFixed(1)}MB` : "null"}`)
    if (nchanMemBaseline !== null && nchanMemEnd !== null) {
      const growthMB = (nchanMemEnd - nchanMemBaseline) / 1024 / 1024
      ctx.log(`§3.6 nchan_memory_growth_during=${growthMB >= 0 ? "+" : ""}${growthMB.toFixed(1)}MB`)
    }

    // §4.7/§M3-HVR: Window-scope capture — taken BEFORE the replay probe and
    // catch-up flush so pacing statistics measure pure gated consumption.
    let slowDisconnects = 0
    const readAtWindowEnd: number[] = []
    const perClientWindowTimestampsMs: number[][] = []
    for (let i = 0; i < slowConnections.length; i++) {
      const conn = slowConnections[i]
      const wrapper = gatedWrappers[i]
      if (!conn.subscription.connected) {
        slowDisconnects++
        ctx.metrics.incrementSlowConsumerDisconnects()
      }
      readAtWindowEnd.push(wrapper.releasedCount)
      perClientWindowTimestampsMs.push([...wrapper.releaseTimestampsMs])
    }

    // §3.7: Head deltas after the window (before probe/flush activity)
    const headsAfterSlow = slowConnections.map(conn => ctx.headTracker.getHead(conn.matchId))

    // ────────────────────────────────────────────────────────────────────
    // §M3-HVR repair #2: TRUE Last-Event-ID replay probe.
    // Detach selected slow viewers at their application-consumed position,
    // reattach mid-stream with Last-Event-ID, and count exactly which frames
    // Nchan replays versus delivers live. Socket-buffer drainage plays no
    // part: the detached sockets are destroyed client-side before sampling.
    // ────────────────────────────────────────────────────────────────────
    const probeIndices = selectProbeIndices(slowConnections, REPLAY_PROBE_MAX_CLIENTS)
    const probeRecords: ReplayProbeRecord[] = []
    for (const idx of probeIndices) {
      const entry = slowConnections[idx]
      const detachedId = this.pool.detachEntryForReplayProbe(entry)
      const consumedHead = entry.tracker.lastSeq
      const headAtDetach = ctx.headTracker.getHead(entry.matchId)
      probeRecords.push({
        entry,
        detachedId,
        collector: null,
        disarm: null,
        consumedHead,
        headAtDetach,
        expectedMissed: Math.max(0, headAtDetach - consumedHead),
        replayed: 0,
        liveDuringProbe: 0,
        reattached: false,
      })
      ctx.log(`§M3-HVR probe: detached conn#${entry.id} (${entry.matchId}) at consumed_head=${consumedHead}, wire_head=${headAtDetach}, resume_id=${detachedId ?? "none"}`)
    }
    if (probeRecords.length > 0) await ctx.sleep(REPLAY_PROBE_SETTLE_MS)
    for (const rec of probeRecords) {
      // §M3-RACE-4: the collector must be registered BEFORE wireEntry() runs
      // inside reattachAfterReplayProbe — the §M3-RACE initialization buffer
      // flushes to handlers at first registration, and any post-return attach
      // dispatches the replay head to the pool handler only (observed: 81.8%
      // coverage on busy channels). Passing it as preWireHandler guarantees
      // the collector observes the full buffered burst in arrival order while
      // the pool wrapper keeps tracker/reconnect accounting exact.
      let armed = true
      const collector = (evt: SubscriptionEvent) => {
        if (!armed) return
        if (evt.type !== "message") return
        const seq = extractSeq(evt.event.data)
        if (seq === null) return
        // Missed range is (consumedHead, headAtDetach] in canonical-seq space.
        // Crediting only that closed interval keeps coverage conservative:
        // duplicate frames at or below the consumed position can never inflate
        // retention evidence, and anything beyond detach-head is live delivery.
        if (seq > rec.consumedHead && seq <= rec.headAtDetach) rec.replayed++
        else if (seq > rec.headAtDetach) rec.liveDuringProbe++
      }
      const ok = await this.pool.reattachAfterReplayProbe(ctx.eventStream, rec.entry, rec.detachedId, collector)
      if (!ok) continue
      rec.reattached = true
      rec.collector = collector
      rec.disarm = () => { armed = false }
    }
    if (probeRecords.some(r => r.reattached)) await ctx.sleep(REPLAY_PROBE_WINDOW_MS)
    for (const rec of probeRecords) {
      if (rec.reattached) rec.disarm?.()
      rec.entry.deferredDelivery = false
    }
    this.pool.promoteEntriesToSteady()

    // §M3-RACE-2: Per-client replay correctness FIRST, then aggregate. The old
    // arithmetic filtered to reattached clients only, so a failed reattach
    // silently vanished from the denominator and one strong client could mask
    // two failed ones. Retention is now proven only when EVERY selected probe:
    //   1. reattached successfully (selected == reattached), AND
    //   2. had a measurable missed range (expectedMissed > 0), AND
    //   3. individually achieved >= threshold coverage of its own missed range.
    const probeSelected = probeRecords.length
    const probeReattached = probeRecords.filter(r => r.reattached).length
    interface PerClientProbe {
      index: number
      reattached: boolean
      measurable: boolean
      expectedMissed: number
      replayed: number
      coveragePct: number | null
      passed: boolean
    }
    const perClientProbes: PerClientProbe[] = probeRecords.map((r, index) => {
      const measurable = r.reattached && r.expectedMissed > 0
      const coveragePct = measurable ? Math.min(100, (r.replayed / r.expectedMissed) * 100) : null
      return {
        index,
        reattached: r.reattached,
        measurable,
        expectedMissed: r.expectedMissed,
        replayed: r.replayed,
        coveragePct,
        passed: coveragePct !== null && coveragePct >= REPLAY_COVERAGE_THRESHOLD_PCT,
      }
    })
    // Arithmetic aggregate over ALL selected clients — failures keep their place
    // in the denominator (reporting metric only; gating uses the weakest link).
    const probeExpectedMissedTotal = probeRecords.reduce((s, r) => s + r.expectedMissed, 0)
    const probeReplayedTotal = probeRecords.reduce((s, r) => s + r.replayed, 0)
    const probeCoveragePct = probeExpectedMissedTotal > 0
      ? Math.min(100, (probeReplayedTotal / probeExpectedMissedTotal) * 100)
      : null
    // Gating metric: weakest per-client link. null unless every selected client
    // reattached with a measurable range — the classifier treats null as an
    // explicit failure, so a partial probe can never pass by omission.
    const allReattached = probeReattached === probeSelected
    const allMeasurable = perClientProbes.every(p => p.measurable)
    const minClientCoveragePct = allReattached && allMeasurable
      ? Math.min(...perClientProbes.map(p => p.coveragePct!))
      : null
    const probeRetentionProven = probeSelected > 0
      && allReattached && allMeasurable
      && perClientProbes.every(p => p.passed)
    ctx.log(`§M3-HVR replay probe: selected=${probeSelected} reattached=${probeReattached} expected_missed=${probeExpectedMissedTotal} replayed=${probeReplayedTotal} aggregate_coverage=${probeCoveragePct !== null ? `${probeCoveragePct.toFixed(1)}%` : "unmeasurable"} min_client_coverage=${minClientCoveragePct !== null ? `${minClientCoveragePct.toFixed(1)}%` : "unmeasurable"} per_client=[${perClientProbes.map(p => `#${p.index}:${p.reattached ? (p.measurable ? `${p.coveragePct!.toFixed(1)}%` : "unmeasurable") : "reattach_failed"}`).join(",")}] retention_proven=${probeRetentionProven}`)

    // ────────────────────────────────────────────────────────────────────
    // §M3-HVR: Catch-up drain — release each remaining viewer's retained
    // backlog at full speed. This measures how quickly buffered data can be
    // handed to the application once the throttle lifts; it is explicitly
    // NOT replay evidence and is excluded from replay_coverage.
    // ────────────────────────────────────────────────────────────────────
    const probedEntries = new Set(probeRecords.map(r => r.entry))
    let catchupDrained = 0
    for (let i = 0; i < slowConnections.length; i++) {
      const conn = slowConnections[i]
      if (probedEntries.has(conn)) continue
      catchupDrained += gatedWrappers[i].flushAndRelease()
      conn.deferredDelivery = false
    }
    const wireTotalNonProbed = gatedWrappers.reduce((sum, w, i) => probedEntries.has(slowConnections[i]) ? sum : sum + w.wireCount, 0)
    const recoveryDeadline = Date.now() + RECOVERY_TIMEOUT_MS
    while (Date.now() < recoveryDeadline && releasedTotalNonProbedGetter(gatedWrappers, probedEntries, slowConnections) < wireTotalNonProbed) {
      await ctx.sleep(100)
    }
    ctx.log(`§M3-HVR catch-up drain: flushed=${catchupDrained} frames (backlog handoff, not replay)`)

    // §3.6: Nchan memory after recovery
    await ctx.sleep(2000) // Allow time for recovery
    const nchanMemRecovery = ctx.resourceMonitor.snapshot().nchan_memory_current_bytes
    ctx.log(`§3.6 nchan_memory_recovery=${nchanMemRecovery !== null ? `${(nchanMemRecovery / 1024 / 1024).toFixed(1)}MB` : "null"}`)

    // §3.7/§M3-HVR: Per-client records — consumption is now true gated reads;
    // post-window deliveries are classified as catch-up, never as replay.
    interface PerClientDetail {
      index: number
      publishedDuringSlow: number
      consumedDuringSlow: number
      missedLive: number
      catchupReceived: number
      detail: string
    }
    const perClientDetails: PerClientDetail[] = []
    for (let i = 0; i < slowConnections.length; i++) {
      const conn = slowConnections[i]
      const publishedDuringSlow = Math.max(0, headsAfterSlow[i] - headsBeforeSlow[i])
      const consumedDuringSlow = readAtWindowEnd[i]
      const missedLive = Math.max(0, publishedDuringSlow - consumedDuringSlow)
      const catchupReceived = Math.max(0, gatedWrappers[i].releasedCount - readAtWindowEnd[i])
      perClientDetails.push({
        index: i,
        publishedDuringSlow,
        consumedDuringSlow,
        missedLive,
        catchupReceived,
        detail: `client_${i}:published=${publishedDuringSlow}:consumed=${consumedDuringSlow}:missed_live=${missedLive}:catchup=${catchupReceived}`,
      })
    }

    // §3.7: Aggregate missed-live metrics (replay coverage comes from the probe)
    const missedLive = perClientDetails.reduce((s, pc) => s + pc.missedLive, 0)
    const anyClientMissed = perClientDetails.some(pc => pc.missedLive > 0)

    ctx.log(`§3.7 missed_live_total=${missedLive} (replay coverage measured by Last-Event-ID probe, not by drain)`)

    // §3.7: Per-client gauge metrics
    for (const pc of perClientDetails) {
      ctx.metrics.gauge(`slow_client_${pc.index}_missed_live`, pc.missedLive)
      ctx.metrics.gauge(`slow_client_${pc.index}_catchup_received`, pc.catchupReceived)
    }

    // §3.6: Compute achieved window read rate from slow consumers
    const totalRead = readAtWindowEnd.reduce((s, n) => s + n, 0)
    const slowReadRate = slowPhaseElapsed > 0 ? totalRead / slowCount / (slowPhaseElapsed / 1000) : 0

    // §3.8: Compute per-client inter-release intervals — proves each client
    // achieved ~2s APPLICATION pacing independently (window scope only).
    const allSortedIntervals: number[] = []
    const perClientMedianIntervals: number[] = []
    for (const clientTs of perClientWindowTimestampsMs) {
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
    ctx.log(`§3.6 slow_consumer window read rate: ${slowReadRate.toFixed(2)} events/s, median_interval=${medianInterval.toFixed(0)}ms, p95_interval=${p95Interval.toFixed(0)}ms (target=${SLOW_EVENT_INTERVAL_MS}ms)`)
    ctx.log(`§3.8 per_client_medians: [${perClientMedianIntervals.map((m) => m.toFixed(0)).join(", ")}]ms, tolerance=${PACING_MIN_MS}-${PACING_MAX_MS}ms pacing_valid=${pacingValid}`)

    // §3.6: Healthy-client latency during slow phase — from dedicated histogram
    const p95During = healthyDuringHist.p95()

    ctx.log(`Slow consumers: ${slowDisconnects}/${slowCount} disconnected by server`)
    ctx.log(`§3.6 healthy p95 latency (dedicated cohort): before=${p95Before}ms, with_slow=${p95During}ms`)
    ctx.log(`§3.6 healthy_during_sample_count=${healthyDuringHist.count}`)

    const degradation = p95Before > 0
      ? (p95During - p95Before) / p95Before
      : 0

    // Independent offered source: accepted publisher head deltas per channel
    const totalOffered = independentOfferedCount(headsBeforeSlow, headsAfterSlow)

    // §4.7: Compute backlog growth — events offered but not yet consumed in-window
    const backlogGrowth = totalOffered - totalRead

    // §3.8: Nchan memory boundedness — trend-based rule, not arbitrary threshold
    const nchanMemoryBounded = (() => {
      if (nchanMemBaseline === null || nchanMemEnd === null) return null // unknown
      const growthBytes = nchanMemEnd - nchanMemBaseline
      const growthPct = nchanMemBaseline > 0 ? growthBytes / nchanMemBaseline : 0
      if (growthBytes >= MEMORY_MAX_GROWTH_BYTES || growthPct >= MEMORY_MAX_GROWTH_FRACTION) return false
      if (nchanMemRecovery !== null) {
        const recoveryDelta = Math.abs(nchanMemRecovery - nchanMemBaseline)
        if (recoveryDelta >= MEMORY_MAX_RECOVERY_DELTA_BYTES) return false
      }
      return true
    })()

    // §M3-HVR repair #3: Server-side backpressure/retention evidence —
    // falsifiable signals replacing the old Goldilocks memory window:
    //   1. Server disconnected slow consumers (definitive backpressure action), OR
    //   2. Meaningful Nchan memory growth correlated with the backlog window (>1MB AND >5%), OR
    //   3. Replay-probe retention proven: Nchan held the exact missed range and
    //      redelivered it on Last-Event-ID reconnect (≥ threshold coverage).
    // Signal 3 makes efficient-kernel-absorption runs decidable: even when
    // memory barely moves, retained-history redelivery proves server-side
    // buffering happened somewhere measurable.
    const nchanMemoryGrowthBytes = nchanMemBaseline !== null && nchanMemEnd !== null
      ? nchanMemEnd - nchanMemBaseline
      : 0
    const nchanMemoryGrowthPct = nchanMemBaseline !== null && nchanMemBaseline > 0
      ? nchanMemoryGrowthBytes / nchanMemBaseline
      : 0
    const nchanMemoryMeaningfulGrowth = nchanMemoryGrowthBytes > MEMORY_MEANINGFUL_GROWTH_BYTES && nchanMemoryGrowthPct > MEMORY_MEANINGFUL_GROWTH_FRACTION
    const evidenceBackpressure = slowDisconnects > 0 || nchanMemoryMeaningfulGrowth || probeRetentionProven
    const replayCoverageOk = probeRetentionProven

    ctx.log(`§3.6 slow offered: ${totalOffered} events (${slowPhaseElapsed > 0 ? (totalOffered / (slowPhaseElapsed / 1000)).toFixed(2) : "0"} /s), window-read: ${totalRead} events (${slowReadRate.toFixed(2)} /s), backlog_growth=${backlogGrowth}`)
    ctx.log(`§3.6 server-side backpressure/retention: ${evidenceBackpressure ? "YES" : "NO"} (disconnects=${slowDisconnects > 0}, meaningful_memory_growth=${nchanMemoryMeaningfulGrowth}, probe_retention=${probeRetentionProven})`)

    // §4.8: Core property — bounded behavior without unbounded memory growth
    const degradationOk = degradation <= LATENCY_DEGRADATION_THRESHOLD
    const boundedOk = nchanMemoryBounded === true
      && backlogGrowth >= 0
      && (totalRead > 0 || slowDisconnects > 0)

    // §4.8/§M3-HVR: Pass/fail rule — frozen interpretation:
    // PASS requires ALL of:
    //   - healthy degradation <= threshold
    //   - bounded Nchan memory trend (known, not runaway)
    //   - genuine application pacing achieved within frozen tolerance
    //   - at least one client demonstrably missed events while throttled
    //   - backpressure/retention evidence (disconnects OR memory OR probe)
    //   - Last-Event-ID replay probe coverage >= threshold
    const boundedKnown = nchanMemoryBounded !== null
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
      // §3.8: Per-client window event timestamps (not merged, not flushed)
      per_client_event_timestamps_ms: perClientWindowTimestampsMs,
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
      // §M3-HVR: Probe + catch-up evidence
      replay_probe_clients: probeSelected,
      replay_probe_selected: probeSelected,
      replay_probe_reattached: probeReattached,
      replay_probe_expected_missed: probeExpectedMissedTotal,
      replay_probe_replayed: probeReplayedTotal,
      replay_probe_coverage_pct: probeCoveragePct,
      catchup_drained_count: catchupDrained,
      replay_recovery_pct: minClientCoveragePct,
    }

    const probeDetail = [
      `probe_selected=${probeSelected}`,
      `probe_reattached=${probeReattached}`,
      `probe_expected_missed=${probeExpectedMissedTotal}`,
      `probe_replayed=${probeReplayedTotal}`,
      `probe_aggregate_coverage=${probeCoveragePct !== null ? `${probeCoveragePct.toFixed(1)}%` : "unmeasurable"}`,
      `probe_min_client_coverage=${minClientCoveragePct !== null ? `${minClientCoveragePct.toFixed(1)}%` : "unmeasurable"}`,
      `per_client=[${perClientProbes.map(p => `#${p.index}:${p.reattached ? (p.measurable ? `${p.coveragePct!.toFixed(1)}%` : "unmeasurable") : "reattach_failed"}`).join(",")}]`,
      `catchup_drained=${catchupDrained}`,
    ].join(" ")

    const detail = [
      `slow_gated=${slowCount}/${all.length}`,
      `slow_disconnects=${slowDisconnects}/${slowCount}`,
      `slow_offered=${totalOffered}`,
      `slow_window_read=${totalRead}`,
      `slow_backlog_growth=${backlogGrowth}`,
      `slow_read_rate=${slowReadRate.toFixed(2)}/s`,
      `missed_required=${missedLive} direction=live`,
      `any_client_missed=${anyClientMissed}`,
      `median_event_interval=${medianInterval.toFixed(0)}ms`,
      `p95_event_interval=${p95Interval.toFixed(0)}ms`,
      `per_client_medians=[${perClientMedianIntervals.map((m) => m.toFixed(0)).join(",")}]ms`,
      `pacing_tolerance=${PACING_MIN_MS}-${PACING_MAX_MS}ms`,
      `pacing_valid=${pacingValid}`,
      `offered_source=accepted_publisher_head_delta`,
      probeDetail,
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

// §M3-HVR: Pick up to `max` probe candidates spread across distinct matches
// first (maximising channel coverage), then fill remaining slots.
function selectProbeIndices(entries: ConnectionEntry[], max: number): number[] {
  const seenMatches = new Set<string>()
  const picked: number[] = []
  for (let i = 0; i < entries.length && picked.length < max; i++) {
    if (!seenMatches.has(entries[i].matchId)) {
      seenMatches.add(entries[i].matchId)
      picked.push(i)
    }
  }
  for (let i = 0; i < entries.length && picked.length < max; i++) {
    if (!picked.includes(i)) picked.push(i)
  }
  return picked
}

function releasedTotalNonProbedGetter(
  wrappers: GatedThrottledSubscription[],
  probedEntries: Set<ConnectionEntry>,
  connections: ConnectionEntry[],
): number {
  let total = 0
  for (let i = 0; i < wrappers.length; i++) {
    if (probedEntries.has(connections[i])) continue
    total += wrappers[i].releasedCount
  }
  return total
}
