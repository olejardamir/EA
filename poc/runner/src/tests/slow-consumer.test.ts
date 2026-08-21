import { describe, it } from "node:test"
import assert from "node:assert/strict"
import type { ScenarioContext } from "../scenarios/scenario.js"
import type { EventStream, Subscription, SubscriptionEvent } from "../ports/event-stream.js"
import type { MetricsSnapshot } from "../ports/metrics.js"
import type { MatchEventPublisher } from "../adapters/match-event-publisher.js"
import type { Clock } from "../ports/clock.js"
import { ConnectionPool, type ConnectionEntry } from "../application/connection-pool.js"
import {
  SlowConsumerScenario,
  GatedThrottledSubscription,
  independentOfferedCount,
  pacingWithinTolerance,
  SLOW_EVENT_INTERVAL_MS,
} from "../scenarios/slow-consumer.js"

// ────────────────────────────────────────────────────────────────────
// §M3-HVR test doubles — mirror production sse-http-client semantics:
// onEvent ADDS to a handler list, every frame is dispatched to ALL of
// them, and removeEventHandler detaches exactly one handler. A
// replace-style or removal-incapable mock hides the double-dispatch
// and stuck-handler defect classes this scenario exists to prevent.
// ────────────────────────────────────────────────────────────────────
class MockSubscription implements Subscription {
  handlers: Array<(event: SubscriptionEvent) => void> = []
  private _connected = true
  private _closed = false
  paused = false
  constructor(private _lastEventId: string | null = null) {}
  get connected(): boolean {
    return this._connected && !this._closed
  }
  get lastEventId(): string | null {
    return this._lastEventId
  }
  setLastEventId(id: string | null): void {
    this._lastEventId = id
  }
  onEvent(h: (event: SubscriptionEvent) => void): void {
    this.handlers.push(h)
  }
  getEventHandler(): ((event: SubscriptionEvent) => void) | null {
    return this.handlers.length > 0 ? this.handlers[this.handlers.length - 1] : null
  }
  removeEventHandler(h: (event: SubscriptionEvent) => void): void {
    const idx = this.handlers.indexOf(h)
    if (idx >= 0) this.handlers.splice(idx, 1)
  }
  pause(): void {
    this.paused = true
  }
  resume(): void {
    this.paused = false
  }
  close(): void {
    this._closed = true
    this.handlers.length = 0
  }
  // Production dispatch: every registered handler sees every frame.
  emit(evt: SubscriptionEvent): void {
    for (const h of [...this.handlers]) h(evt)
  }
}

function messageEvt(matchId: string, seq: number, id?: string): Extract<SubscriptionEvent, { type: "message" }> {
  return {
    type: "message",
    event: {
      id: id ?? `${matchId}-${seq}`,
      event: "match_event",
      data: JSON.stringify({
        match_id: matchId,
        canonical_seq: seq,
        event_type: "goal",
        publish_timestamp: new Date().toISOString(),
        score: { home: 0, away: 0 },
        clock: { period: "H1", elapsed_seconds: seq },
      }),
    },
  }
}

interface StreamRecord {
  subscription: MockSubscription
  url: string
  lastEventId: string | null | undefined
}

function mockStream(): EventStream & { created: StreamRecord[] } {
  const created: StreamRecord[] = []
  return {
    created,
    async connect(url: string, lastEventId?: string | null) {
      const sub = new MockSubscription(lastEventId ?? null)
      created.push({ subscription: sub, url, lastEventId })
      return sub
    },
  } as never
}

function countingMetrics(): import("../ports/metrics.js").MetricsRecorder & { counts: Record<string, number>; fanOutLatencies: number[] } {
  const counts: Record<string, number> = {}
  const fanOutLatencies: number[] = []
  const inc = (k: string, n = 1) => {
    counts[k] = (counts[k] ?? 0) + n
  }
  const rec = {
    counts,
    fanOutLatencies,
    recordFanOutLatency(ms: number) {
      fanOutLatencies.push(ms)
    },
    recordLateJoinLatency() {},
    incrementEventsReceived: () => inc("events_received"),
    incrementExpectedFanDeliveries: () => {},
    incrementMissingSequences: (n = 1) => inc("missing_sequences", n),
    incrementDuplicates: () => inc("duplicates"),
    incrementOutOfOrder: () => inc("out_of_order"),
    incrementReconnectGaps: (n = 1) => inc("reconnect_gaps", n),
    incrementReconnectDuplicates: () => inc("reconnect_duplicates"),
    incrementReconnectOrderViolations: () => inc("reconnect_order_violations"),
    incrementSlowConsumerDisconnects: () => inc("slow_consumer_disconnects"),
    incrementConnectionsAttempted: () => inc("connections_attempted"),
    incrementConnectionsEstablished: () => inc("connections_established"),
    incrementConnectionFailures: () => inc("connection_failures"),
    incrementConnectionsDropped: () => inc("connections_dropped"),
    setActiveConnections() {},
    incrementLatencyInvalid() {},
    incrementLatencyOverflow() {},
    setBacklog() {},
    incrementSseParseErrors() {},
    incrementJsonParseErrors() {},
    incrementInvalidTimestampCount() {},
    incrementLiveExpectedDeliveries() {},
    incrementLiveReceivedDeliveries: () => inc("live_received"),
    incrementLateJoinHistoryExpected() {},
    incrementLateJoinHistoryReceived() {},
    incrementReconnectReplayExpected() {},
    incrementReconnectReplayReceived() {},
    incrementRestartReplayExpected() {},
    incrementRestartReplayReceived() {},
    incrementLiteralRestartExpected() {},
    incrementLiteralRestartReceived() {},
    incrementCrossNodeExpected() {},
    incrementCrossNodeReceived() {},
    incrementDeliberateDisconnects: () => inc("deliberate_disconnects"),
    incrementUnexpectedClientDisconnects() {},
    incrementServerInitiatedDisconnects() {},
    incrementNetworkFailures() {},
    incrementShutdownCleanup() {},
    incrementPlannedRestartDisconnects() {},
    incrementSchemaValidationErrors() {},
    incrementMissingTransportId() {},
    gauge() {},
    recordSchedulerLag() {},
    beginPhase() {}, endPhase() {}, snapshotPhaseHistograms() { return {} },
    snapshot(): MetricsSnapshot {
      return {
        fan_out_latencies_ms: [], late_join_latencies_ms: [],
        events_received: 0, expected_fan_deliveries: 0, received_fan_deliveries: 0,
        missing_sequences: 0, duplicates: 0, out_of_order: 0,
        reconnect_gaps: 0, reconnect_duplicates: 0, reconnect_order_violations: 0,
        slow_consumer_disconnects: 0, connections_attempted: 0, connections_established: 0,
        connection_failures: 0, connections_dropped: 0, active_connections_peak: 0,
        latency_sample_count: 0, latency_invalid_count: 0, latency_overflow_count: 0,
        generator_backlog_peak: 0, sse_parse_errors: 0, json_parse_errors: 0, invalid_timestamp_count: 0,
        live_expected_deliveries: 0, live_received_deliveries: 0,
        late_join_history_expected: 0, late_join_history_received: 0,
        reconnect_replay_expected: 0, reconnect_replay_received: 0,
        restart_replay_expected: 0, restart_replay_received: 0,
        literal_restart_expected: 0, literal_restart_received: 0,
        cross_node_expected: 0, cross_node_received: 0,
        deliberate_disconnects: 0, unexpected_client_disconnects: 0,
        server_initiated_disconnects: 0, network_failures: 0, shutdown_cleanup_disconnects: 0,
        planned_restart_disconnects: 0,
        schema_validation_errors: 0, missing_transport_id: 0,
        fan_out_sample_count: 0, fan_out_overflow_count: 0,
        late_join_sample_count: 0, late_join_overflow_count: 0,
        scheduler_lag_p95_ms: 0, scheduler_lag_max_ms: 0,
      }
    },
  }
  return rec as import("../ports/metrics.js").MetricsRecorder & { counts: Record<string, number>; fanOutLatencies: number[] }
}

const fixedClock: Clock = { now: () => 5000, hrtime: () => 0n }

function makePool(opts: { count: number; matchIds?: string[]; metrics?: ReturnType<typeof countingMetrics> } ): {
  pool: ConnectionPool
  stream: ReturnType<typeof mockStream>
  metrics: ReturnType<typeof countingMetrics>
} {
  const metrics = opts.metrics ?? countingMetrics()
  const stream = mockStream()
  const pool = new ConnectionPool(
    { subUrl: "http://sub", matchIds: opts.matchIds ?? ["match-001"] },
    metrics,
    fixedClock,
  )
  pool.running = true
  return { pool, stream, metrics }
}

async function connectViewers(
  pool: ConnectionPool,
  stream: ReturnType<typeof mockStream>,
  count: number,
): Promise<void> {
  await pool.connectAll(stream, count, 0)
}

function headTrackerFrom(initial: Record<string, number> = {}) {
  const heads = new Map(Object.entries(initial))
  return {
    getHead: (m: string) => heads.get(m) ?? 0,
    updateHead: (m: string, seq: number) => {
      if ((heads.get(m) ?? 0) < seq) heads.set(m, seq)
    },
    updateHeadState() {}, getHeadState: () => null,
  }
}

function mockCtx(entries: ConnectionEntry[], slowFraction: number, heads: Record<string, number> = {}): ScenarioContext {
  return {
    publisher: {
      start() {}, stop() {},
      snapshotAndReset() { return { eventsPublished: 0, byMatch: new Map() } },
    } as unknown as MatchEventPublisher,
    eventStream: mockStream(),
    metrics: countingMetrics(),
    clock: fixedClock,
    resourceMonitor: {
      measureCpu() {},
      snapshot() { return { memoryMbPeak: 100, eventLoopDelayP99Ms: 10, cpuPercentPeak: 50, nchan_memory_current_bytes: null, nchanMemoryMbPeak: null, redisMemoryMbPeak: 100, nchan_cpu_percent_peak: null, redis_cpu_percent_peak: null, cpu_usage_usec: null, cpu_throttled_count: null, cpu_throttled_usec: null, memory_current_bytes: null, memory_peak_bytes: null, memory_oom_events: null, memory_oom_kill_events: null, cpu_max_quota: null, cpu_max_period: null, memory_max_bytes: null, nchan_cpu_usage_usec: null, nchan_cpu_throttled_count: null, nchan_cpu_throttled_usec: null, nchan_memory_peak_bytes: null, nchan_memory_oom_events: null, nchan_memory_oom_kill_events: null, redis_connected_clients_peak: null, nchan_cpu_max_quota: null, redis_cpu_max_quota: null } },
      startEventLoopMonitor() {}, stopEventLoopMonitor() {}, dispose() {}, async ready() {}, async preflight() { return null },
    },
    headTracker: headTrackerFrom(heads),
    config: {
      nchanPubUrl: "http://localhost:8080", nchanSubUrl: "http://localhost:8081",
      nchan2SubUrl: "", nchanControlUrl: "", redisUrl: "redis://localhost:6379",
      targetConnections: 100, warmupSeconds: 1, measureSeconds: 1, burstSeconds: 1,
      cooldownSeconds: 1, slowConsumerFraction: slowFraction, lobbyFraction: 0.02,
      historyUrl: "http://localhost:8081", seed: 42, runProfile: "smoke", runMode: "single",
    },
    matchIds: ["match-001"],
    phaseSnapshots: [],
    log: () => {},
    sleep: (ms: number) => new Promise((r) => setTimeout(r, Math.min(ms, 10))),
  } as unknown as ScenarioContext
}

const settle = (ms = 150) => new Promise((r) => setTimeout(r, ms))

describe("SlowConsumerScenario pure functions", () => {
  it("derives offered events independently from accepted publisher head deltas", () => {
    assert.equal(independentOfferedCount([10, 20], [15, 27]), 12)
  })

  it("requires the frozen ±20% tolerance around two-second pacing", () => {
    assert.equal(pacingWithinTolerance([1600, 2000, 2400], 3), true)
    assert.equal(pacingWithinTolerance([1000, 2000], 2), false)
    assert.equal(pacingWithinTolerance([2000], 2), false)
  })
})

describe("GatedThrottledSubscription (repair #1)", () => {
  it("paces releases one-event-per-interval even when one chunk holds many buffered frames", async () => {
    const inner = new MockSubscription("seed")
    const gate = new GatedThrottledSubscription(inner, { intervalMs: 40 })
    const releasedAt: number[] = []
    gate.takeOver(null)
    gate.onEvent(() => releasedAt.push(performance.now()))
    // Simulate ONE TCP chunk carrying 4 frames dispatched synchronously.
    for (let seq = 1; seq <= 4; seq++) inner.emit(messageEvt("m", seq))
    assert.equal(gate.queueDepth, 3, "first frame consumed immediately, rest queued")
    await settle(200)
    assert.equal(gate.releasedCount, 4)
    const gaps: number[] = []
    for (let i = 1; i < releasedAt.length; i++) gaps.push(releasedAt[i] - releasedAt[i - 1])
    // The old pause()/resume() flaw collapsed these gaps toward ~0ms.
    for (const gap of gaps) assert.ok(gap >= 30, `inter-release gap ${gap.toFixed(1)}ms must be near the ${SLOW_EVENT_INTERVAL_MS}-ms pacing interval`)
  })

  it("holds real TCP backpressure while backlog is retained and reopens when drained", async () => {
    const inner = new MockSubscription(null)
    const gate = new GatedThrottledSubscription(inner, { intervalMs: 20 })
    gate.takeOver(null)
    for (let seq = 1; seq <= 3; seq++) inner.emit(messageEvt("m", seq))
    assert.ok(inner.paused, "inner transport must be paused while the gate holds backlog")
    await settle(120)
    assert.equal(gate.queueDepth, 0)
    assert.ok(!inner.paused, "inner transport must reopen once the backlog is drained")
  })

  it("flushAndRelease drains retained backlog immediately and switches to passthrough", () => {
    const inner = new MockSubscription(null)
    const gate = new GatedThrottledSubscription(inner, { intervalMs: 60_000 })
    const seen: number[] = []
    gate.takeOver((evt) => {
      if (evt.type === "message") seen.push(JSON.parse(evt.event.data).canonical_seq)
    })
    for (let seq = 1; seq <= 5; seq++) inner.emit(messageEvt("m", seq))
    assert.equal(seen.length, 1)
    const drained = gate.flushAndRelease()
    assert.equal(drained, 4)
    assert.deepEqual(seen, [1, 2, 3, 4, 5])
    // Passthrough: subsequent wire frames deliver without gating.
    inner.emit(messageEvt("m", 6))
    assert.deepEqual(seen, [1, 2, 3, 4, 5, 6])
  })

  it("delivers terminal error events immediately, never behind the gate", () => {
    const inner = new MockSubscription(null)
    const gate = new GatedThrottledSubscription(inner, { intervalMs: 60_000 })
    const kinds: string[] = []
    gate.takeOver((evt) => kinds.push(evt.type))
    inner.emit(messageEvt("m", 1))
    inner.emit({ type: "error", error: new Error("stream ended") } as SubscriptionEvent)
    assert.deepEqual(kinds, ["message", "error"], "error must bypass a non-empty queue")
    gate.close()
  })

  it("lastEventId tracks the application-consumed position, not the wire position", () => {
    const inner = new MockSubscription("wire-0")
    const gate = new GatedThrottledSubscription(inner, { intervalMs: 60_000 })
    gate.takeOver(null)
    assert.equal(gate.lastEventId, "wire-0", "proxies wire position before any release")
    inner.emit(messageEvt("m", 1, "wire-1"))
    inner.emit(messageEvt("m", 2, "wire-2"))
    assert.equal(gate.lastEventId, "wire-1", "reflects the last RELEASED frame only")
    assert.equal(gate.releasedCount, 1)
    gate.close()
  })
})

describe("SlowConsumerScenario", () => {
  it("skips when no connections exist", async () => {
    const ctx = mockCtx([], 0.05)
    const scenario = new SlowConsumerScenario({ entries: [] } as any)
    const result = await scenario.execute(ctx)
    assert.ok(result.passed)
    assert.ok(result.detail.includes("skipped"))
  })

  it("gates slow connections and reports no backpressure evidence without server signals", async () => {
    const { pool, stream } = makePool({ count: 20 })
    await connectViewers(pool, stream, 20)
    const ctx = mockCtx(pool.entries as ConnectionEntry[], 0.05)
    const scenario = new SlowConsumerScenario(pool)
    const result = await scenario.execute(ctx)
    // Without server-side backpressure evidence (mock has no disconnects/null memory),
    // passed=false is correct — the test did not prove the backpressure property.
    assert.ok(!result.passed)
    assert.ok(result.detail.includes("slow_gated=1/20"))
    assert.ok(result.detail.includes("degradation"))
    assert.ok(result.detail.includes("threshold=5%"))
    assert.ok(result.detail.includes("backpressure=NO"))
    // Replay probe ran but nothing was missed → coverage explicitly unmeasurable.
    assert.equal(scenario.slowMetrics!.replay_probe_clients >= 1, true)
    assert.equal(scenario.slowMetrics!.replay_recovery_pct, null)
  })

  it("respects slowConsumerFraction config", async () => {
    const { pool, stream } = makePool({ count: 100 })
    await connectViewers(pool, stream, 100)
    const ctx = mockCtx(pool.entries as ConnectionEntry[], 0.1)
    const scenario = new SlowConsumerScenario(pool)
    const result = await scenario.execute(ctx)
    assert.ok(!result.passed)
    assert.ok(result.detail.includes("slow_gated=10/100"))
  })

  it("passes with zero degradation (no latency change)", async () => {
    const { pool, stream } = makePool({ count: 10 })
    await connectViewers(pool, stream, 10)
    const ctx = mockCtx(pool.entries as ConnectionEntry[], 0.05)
    const scenario = new SlowConsumerScenario(pool)
    const result = await scenario.execute(ctx)
    assert.ok(!result.passed)
    assert.ok(result.detail.includes("degradation=0.0%"))
  })

  it("wrapping cohorts must not double-dispatch frames into the pool handler (dup regression)", async () => {
    // §M3-R regression for the 10k-probe duplicate storm, re-verified against the
    // §M3-HVR gate design: the pool handler is REMOVED from the inner subscription
    // and invoked ONLY by the gate, so each frame reaches the sequence tracker
    // exactly once regardless of how many wrappers are chained afterwards.
    const { pool, stream, metrics } = makePool({ count: 20 })
    await connectViewers(pool, stream, 20)

    // Continuous background emission across baseline/window/flush phases.
    const emitters = stream.created.map(({ subscription }, i) => {
      let seq = 0
      const timer = setInterval(() => {
        if (seq >= 10 || !subscription.connected) return
        seq++
        subscription.emit(messageEvt("match-001", i * 100 + seq))
      }, 5)
      return timer
    })

    const ctx = mockCtx(pool.entries as ConnectionEntry[], 0.2)
    const scenario = new SlowConsumerScenario(pool)
    await scenario.execute(ctx)
    await settle(250)
    for (const t of emitters) clearInterval(t)

    // Exact-once proof: a second dispatch of any frame through the pool handler
    // would classify as DUPLICATE in steady mode — precisely the 10k-probe storm
    // symptom. (Totals are not asserted: probed viewers deliberately drop their
    // client-side queue at detach and recover the range via server replay.)
    assert.equal(metrics.counts["duplicates"] ?? 0, 0, "no frame may reach the tracker twice")
    assert.ok((metrics.counts["events_received"] ?? 0) >= 100, "frames must have flowed through both gated and passthrough paths")
    const m = scenario.slowMetrics!
    assert.equal(m.slow_clients + m.healthy_clients, 20)
  })

  it("second onEvent on an already-wrapped connection must not multiply pool dispatches", async () => {
    const { pool, stream, metrics } = makePool({ count: 4 })
    await connectViewers(pool, stream, 4)
    const emitters = stream.created.map(({ subscription }, i) => {
      let seq = 0
      const timer = setInterval(() => {
        if (seq >= 10 || !subscription.connected) return
        seq++
        subscription.emit(messageEvt("match-001", i * 100 + seq))
      }, 5)
      return timer
    })
    const ctx = mockCtx(pool.entries as ConnectionEntry[], 0.5)
    const scenario = new SlowConsumerScenario(pool)
    await scenario.execute(ctx)
    await settle(250)
    for (const t of emitters) clearInterval(t)
    assert.equal(metrics.counts["duplicates"] ?? 0, 0)
    assert.ok((metrics.counts["events_received"] ?? 0) >= 20)
  })

  it("replay probe counts Last-Event-ID replay separately from live delivery and catch-up drain", async () => {
    // One slow viewer on match-001. Publisher head advances well beyond what the
    // gated viewer consumes; at detach the missed range is [consumed+1 .. head].
    // The reattached stream replays exactly that range, then delivers one live
    // frame beyond the detach-time head. Coverage must be computed ONLY from the
    // replayed range; the catch-up drain of the remaining viewers stays separate.
    const { pool, stream } = makePool({ count: 4 })
    await connectViewers(pool, stream, 4)
    const slowEntry = pool.entries[0] as ConnectionEntry

    // Drive the slow viewer forward through its pool handler so tracker.lastSeq
    // reflects application-consumed position, then let the gate hold the rest.
    const ctx = mockCtx(pool.entries as ConnectionEntry[], 0.25, { "match-001": 12 })
    // Feed frames 1..3 directly through the pool so the tracker consumes them.
    for (let seq = 1; seq <= 3; seq++) pool.handleMessage(slowEntry, messageEvt("match-001", seq).event.data, `id-${seq}`)
    assert.equal(slowEntry.tracker.lastSeq, 3)

    // Script the REATTACHED stream: replay 4..12 (the missed range), then live 13.
    const reattachSpec = { seqs: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13] }
    const origConnect = (ctx.eventStream as any).connect.bind(ctx.eventStream)
    ;(ctx.eventStream as any).connect = async (url: string, lastEventId?: string | null) => {
      const sub = await origConnect(url, lastEventId)
      // Emit synchronously on next tick — inside the probe window either way,
      // because the collector classifies by seq, not by arrival pacing.
      setTimeout(() => {
        for (const seq of reattachSpec.seqs) sub.emit(messageEvt("match-001", seq))
      }, 1)
      return sub
    }

    const scenario = new SlowConsumerScenario(pool)
    await scenario.execute(ctx)

    const m = scenario.slowMetrics!
    assert.equal(m.replay_probe_clients, 1)
    assert.equal(m.replay_probe_expected_missed, 9, "head 12 − consumed 3")
    assert.equal(m.replay_probe_replayed, 9, "seqs 4..12 counted as replay")
    assert.equal(m.replay_recovery_pct, 100)
    assert.ok(m.catchup_drained_count >= 0)
    // The live frame beyond detach-head must NOT inflate replay coverage.
    assert.ok(m.replay_probe_expected_missed === m.replay_probe_replayed)
  })

  it("failed reattaches cannot vanish from the probe denominator (masking prevention)", async () => {
    // §M3-RACE-2: three probes selected, only the last reattaches. The old
    // arithmetic filtered to reattached clients, letting one success hide two
    // failures. Now: selected(3) != reattached(1) → recovery explicitly null.
    const { pool, stream } = makePool({ count: 4 })
    await connectViewers(pool, stream, 4)
    const ctx = mockCtx(pool.entries as ConnectionEntry[], 0.75, { "match-001": 10 })

    const origConnect = (ctx.eventStream as any).connect.bind(ctx.eventStream)
    let attempts = 0
    ;(ctx.eventStream as any).connect = async (url: string, lastEventId?: string | null) => {
      attempts++
      if (attempts <= 2) throw new Error("connection refused")
      return origConnect(url, lastEventId)
    }

    const scenario = new SlowConsumerScenario(pool)
    await scenario.execute(ctx)

    const m = scenario.slowMetrics!
    assert.equal(m.replay_probe_selected, 3)
    assert.equal(m.replay_probe_reattached, 1)
    assert.equal(m.replay_recovery_pct, null, "partial probe must report unmeasurable, not a survivor's score")
    assert.ok(scenario.slowMetrics!.replay_probe_expected_missed > 0)
  })

  it("a measurable but uncovered client fails retention even when it is the only probe", async () => {
    // Reattach succeeds, missed range is measurable, but nothing is replayed —
    // weakest-link coverage 0% must gate retention below the 95% threshold.
    const { pool, stream } = makePool({ count: 4 })
    await connectViewers(pool, stream, 4)
    const ctx = mockCtx(pool.entries as ConnectionEntry[], 0.25, { "match-001": 10 })

    const origConnect = (ctx.eventStream as any).connect.bind(ctx.eventStream)
    ;(ctx.eventStream as any).connect = async (url: string, lastEventId?: string | null) => {
      const sub = await origConnect(url, lastEventId)
      // Only LIVE frames beyond detach-head — no history replay at all.
      setTimeout(() => {
        sub.emit(messageEvt("match-001", 11))
        sub.emit(messageEvt("match-001", 12))
      }, 1)
      return sub
    }

    const scenario = new SlowConsumerScenario(pool)
    await scenario.execute(ctx)

    const m = scenario.slowMetrics!
    assert.equal(m.replay_probe_selected, 1)
    assert.equal(m.replay_probe_reattached, 1)
    assert.equal(m.replay_probe_expected_missed, 10)
    assert.equal(m.replay_probe_replayed, 0)
    assert.equal(m.replay_recovery_pct, 0, "zero replay over a measurable range must gate at 0%")
  })

  it("reattach passes the saved Last-Event-ID to the transport and preserves the tracker", async () => {
    const { pool, stream } = makePool({ count: 2 })
    await connectViewers(pool, stream, 2)
    const entry = pool.entries[0] as ConnectionEntry
    const trackerBefore = entry.tracker

    const detachedId = pool.detachEntryForReplayProbe(entry)
    assert.equal(detachedId, null, "initial connects carry no resume token")
    assert.equal(pool.size, 1, "detached entry leaves the active pool")

    const ok = await pool.reattachAfterReplayProbe(stream, entry, detachedId)
    assert.ok(ok)
    assert.equal(pool.size, 2)
    assert.equal(entry.mode, "reconnect", "replayed frames stay out of live accounting until promoted")
    assert.equal(entry.tracker, trackerBefore, "tracker preserved across the probe")
    const record = stream.created.at(-1)!
    assert.equal(record.url, "http://sub/sub/match-001")
    assert.equal(record.lastEventId ?? null, null)
    assert.equal(pool.promoteEntriesToSteady(), 1, "only the reattached probe entry was in reconnect mode")
    assert.equal(entry.mode, "steady")
  })
})

describe("ConnectionPool deferredDelivery (repair #1 accounting guard)", () => {
  it("suppresses fan-out latency recording while the gate holds delivery, keeps sequence accounting", () => {
    const { pool, metrics } = makePool({ count: 0 })
    const entry: ConnectionEntry = {
      id: 1,
      matchId: "match-001",
      subscription: new MockSubscription(),
      tracker: pool.createTracker(),
      mode: "steady",
    }
    const frame = (seq: number) => JSON.stringify({
      match_id: "match-001",
      canonical_seq: seq,
      event_type: "goal",
      publish_timestamp: new Date(4000).toISOString(),
      score: { home: 0, away: 0 },
      clock: { period: "H1", elapsed_seconds: seq },
    })

    pool.handleMessage(entry, frame(1), "t1")
    assert.equal(metrics.fanOutLatencies.length, 1, "live delivery records transport latency")

    entry.deferredDelivery = true
    pool.handleMessage(entry, frame(2), "t2")
    assert.equal(metrics.fanOutLatencies.length, 1, "deferred release must not poison the histogram")
    assert.equal(metrics.counts["events_received"], 2, "sequence/live accounting continues")

    entry.deferredDelivery = false
    pool.handleMessage(entry, frame(3), "t3")
    assert.equal(metrics.fanOutLatencies.length, 2)
  })
})
