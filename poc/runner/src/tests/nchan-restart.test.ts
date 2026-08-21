import { describe, it } from "node:test"
import assert from "node:assert/strict"
import type { ScenarioContext } from "../scenarios/scenario.js"
import type { EventStream, Subscription, SubscriptionEvent } from "../ports/event-stream.js"
import type { MetricsSnapshot } from "../ports/metrics.js"
import type { MatchEventPublisher } from "../adapters/match-event-publisher.js"
import type { ConnectionPool } from "../application/connection-pool.js"
import { NchanRestartScenario, evaluateRestartRequiredRange, type NchanRestartOptions } from "../scenarios/nchan-restart.js"

// §v2.1.0 API: role-based participation.
// - owner  → spare-node cross-node probe (_restartReplay.spare_probe)
// - target → literal partition restart + planned failover (_restartReplay.failover_drill)
// - bystander → non-participation with no fabricated paths

function mockSnapshot(): MetricsSnapshot {
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
}

function mockPool(overrides: Partial<Record<string, any>> = {}): ConnectionPool {
  return {
    size: 25_000,
    beginPlannedFailover() {
      return { saved: Array.from({ length: 25_000 }, (_, i) => ({ entry: { id: i }, lastEventId: `evt-${i}` })) }
    },
    async completePlannedFailover(_stream: EventStream, token: any, _spareSubUrl: string) {
      return { attempted: token.saved.length, reestablished: token.saved.length, failed: 0 }
    },
    promoteEntriesToSteady() { return 25_000 },
    ...overrides,
  } as unknown as ConnectionPool
}

interface MockCtxOverrides {
  eventStream?: EventStream
  controlUrl?: string
  head?: number
  publisher?: any
  pool?: ConnectionPool
  fetchMock?: (url: string) => Response
}

function mockCtx(overrides: MockCtxOverrides = {}): ScenarioContext {
  let time = 1000
  const head = overrides.head ?? 5
  return {
    publisher: overrides.publisher ?? {
      start() {}, stop() {},
      snapshotAndReset() { return { eventsPublished: 0, byMatch: new Map() } },
      // Frozen range contract: publishPrefill(match, 8) → firstSeq=4, lastSeq=11
      async publishPrefill(_matchId: string, count: number) {
        return { published: count, firstSeq: 4, lastSeq: 3 + count, frozenState: null }
      },
    } as unknown as MatchEventPublisher,
    eventStream: overrides.eventStream ?? { async connect() { return {} as Subscription } },
    metrics: new Proxy({
      recordFanOutLatency() {}, recordLateJoinLatency() {},
      beginPhase(_name: string) {}, endPhase() {}, snapshotPhaseHistograms() { return {} },
      snapshot(): MetricsSnapshot { return mockSnapshot() },
    }, {
      get(target: any, prop: string | symbol) {
        if (prop in target) return target[prop]
        if (typeof prop === "string" && prop.startsWith("increment")) return () => {}
        return target[prop]
      },
    }),
    clock: {
      now: () => time,
      advance(ms: number) { time += ms },
    },
    resourceMonitor: {
      measureCpu() {},
      snapshot() { return { memoryMbPeak: 100, eventLoopDelayP99Ms: 10, cpuPercentPeak: 50, nchanMemoryMbPeak: null, redisMemoryMbPeak: 100, cpu_usage_usec: null, cpu_throttled_count: null, cpu_throttled_usec: null, memory_current_bytes: null, memory_peak_bytes: null, memory_oom_events: null, memory_oom_kill_events: null, cpu_max_quota: null, memory_max_bytes: null } },
      startEventLoopMonitor() {}, stopEventLoopMonitor() {}, dispose() {},
    },
    headTracker: { getHead: () => head, updateHead() {}, updateHeadState() {}, getHeadState() { return null } },
    config: {
      nchanPubUrl: "http://localhost:8080", nchanSubUrl: "http://localhost:8081",
      nchanSpareSubUrl: "", nchanControlUrl: "",
      redisUrl: "redis://localhost:6379",
      targetConnections: 100, warmupSeconds: 1, measureSeconds: 1, burstSeconds: 1,
      cooldownSeconds: 1, slowConsumerFraction: 0.05, lobbyFraction: 0.02,
      historyUrl: "http://localhost:8081", seed: 42, runProfile: "smoke", runMode: "single",
    },
    matchIds: ["match-001"],
    phaseSnapshots: [],
    log: () => {},
    sleep: (ms: number) => new Promise((r) => setTimeout(r, Math.min(ms, 10))),
  } as any
}

function makeOpts(role: "owner" | "target" | "bystander", overrides: Partial<NchanRestartOptions> = {}): NchanRestartOptions {
  return {
    role,
    ownSubUrl: "http://localhost:8081",
    ownPubUrl: "http://localhost:8080",
    spareSubUrl: "http://localhost:48081",
    controlUrl: "http://localhost:18888",
    pool: mockPool(),
    restartTargetShard: 3,
    shardId: role === "target" ? 3 : 0,
    probeTimeoutMs: 250,
    ...overrides,
  }
}

// Live stream delivering 3 pre-restart frames (seq 1..3), then replay frames on reconnect.
function makeLiveThenReplayStream(replaySeqs: number[]): { stream: EventStream; connectUrls: string[]; resumeIds: (string | undefined)[] } {
  const events = [
    JSON.stringify({ canonical_seq: 1, ts: Date.now() }),
    JSON.stringify({ canonical_seq: 2, ts: Date.now() }),
    JSON.stringify({ canonical_seq: 3, ts: Date.now() }),
  ]
  const replayEvents = replaySeqs.map((s) => JSON.stringify({ canonical_seq: s, ts: Date.now() }))
  const connectUrls: string[] = []
  const resumeIds: (string | undefined)[] = []
  let connectCount = 0
  const stream: EventStream = {
    async connect(url: string, lastEventId?: string): Promise<Subscription> {
      connectCount++
      connectUrls.push(url)
      resumeIds.push(lastEventId)
      const evts = connectCount === 1 ? events : replayEvents
      let delivered = 0
      let handler: ((event: SubscriptionEvent) => void) | null = null
      const timer = setInterval(() => {
        if (delivered < evts.length && handler) {
          handler({ type: "message", event: { data: evts[delivered], id: `evt-${connectCount}-${delivered}`, event: "message" } })
          delivered++
        } else if (delivered >= evts.length) {
          clearInterval(timer)
        }
      }, 5)
      return {
        connected: true,
        lastEventId: connectCount === 1 ? "evt-1-2" : null,
        onEvent(h) { handler = h },
        pause() {},
        resume() {},
        close() { clearInterval(timer) },
        getEventHandler() { return null },
      }
    },
  }
  return { stream, connectUrls, resumeIds }
}

describe("NchanRestartScenario role wiring (§v2.1.0)", () => {
  it("bystander records non-participation without fabricating paths", async () => {
    const ctx = mockCtx()
    const scenario = new NchanRestartScenario(makeOpts("bystander"))
    const result = await scenario.execute(ctx)
    assert.ok(result.passed)
    assert.ok(result.detail.includes("not-participating"), result.detail)
    assert.ok(result.detail.includes("partition 3"), result.detail)
    assert.equal(ctx._restartReplay, undefined)
  })

  it("owner fails closed when no spare node is configured", async () => {
    const ctx = mockCtx()
    const scenario = new NchanRestartScenario(makeOpts("owner", { spareSubUrl: "" }))
    const result = await scenario.execute(ctx)
    assert.ok(!result.passed)
    assert.ok(result.detail.includes("no spare node configured"), result.detail)
  })

  it("target fails closed when no spare node or control server is configured", async () => {
    const ctx = mockCtx()
    const scenario = new NchanRestartScenario(makeOpts("target", { spareSubUrl: "", controlUrl: "" }))
    const result = await scenario.execute(ctx)
    assert.ok(!result.passed)
    assert.ok(result.detail.includes("spare node or control server not configured"), result.detail)
  })
})

describe("§4.1: Restart exact-range adversarial tests (owner: spare-probe path)", () => {
  // Mock publishPrefill returns {published: 8, firstSeq: 4, lastSeq: 11}
  // Pre-restart probe sees seq 1..3, so frozenExpectedFirstSeq=4, head=11, expectedCount=8
  // Frozen expected set: {4, 5, 6, 7, 8, 9, 10, 11}

  async function runOwner(replaySeqs: number[]) {
    const { stream } = makeLiveThenReplayStream(replaySeqs)
    const ctx = mockCtx({ eventStream: stream })
    const scenario = new NchanRestartScenario(makeOpts("owner"))
    const result = await scenario.execute(ctx)
    return { result, ctx }
  }

  it("exact required range 4..11 passes on the spare node", async () => {
    const { result, ctx } = await runOwner([4, 5, 6, 7, 8, 9, 10, 11])
    assert.ok(result.passed, result.detail)
    assert.ok(result.detail.includes("type=spare-probe"), result.detail)
    assert.equal(ctx._restartReplay?.spare_probe?.received_required_count, 8)
    assert.equal(ctx._restartReplay?.spare_probe?.missing_required, 0)
    assert.equal(ctx._restartReplay?.spare_probe?.missing_required_sequences?.length, 0)
  })

  it("resume uses Last-Event-ID captured from the live probe connection", async () => {
    const { stream, resumeIds } = makeLiveThenReplayStream([4, 5, 6, 7, 8, 9, 10, 11])
    const ctx = mockCtx({ eventStream: stream })
    const scenario = new NchanRestartScenario(makeOpts("owner"))
    await scenario.execute(ctx)
    assert.equal(resumeIds[0], undefined)
    assert.equal(resumeIds[1], "evt-1-2")
  })

  it("missing middle required seq (7) fails", async () => {
    const { result, ctx } = await runOwner([4, 5, 6, 8, 9, 10, 11])
    assert.ok(!result.passed)
    assert.equal(ctx._restartReplay?.spare_probe?.received_required_count, 7)
    assert.equal(ctx._restartReplay?.spare_probe?.missing_required, 1)
    assert.deepEqual(ctx._restartReplay?.spare_probe?.missing_required_sequences, [7])
  })

  it("missing final required seq (11) + later live seq (12) fails — later event cannot repair", async () => {
    const { result, ctx } = await runOwner([4, 5, 6, 7, 8, 9, 10, 12])
    assert.ok(!result.passed)
    assert.equal(ctx._restartReplay?.spare_probe?.received_required_count, 7)
    assert.equal(ctx._restartReplay?.spare_probe?.missing_required, 1)
    assert.deepEqual(ctx._restartReplay?.spare_probe?.missing_required_sequences, [11])
    assert.equal(ctx._restartReplay?.spare_probe?.out_of_range_after_count, 1)
  })

  it("missing first prefix (4) fails", async () => {
    const { result, ctx } = await runOwner([5, 6, 7, 8, 9, 10, 11])
    assert.ok(!result.passed)
    assert.ok(ctx._restartReplay?.spare_probe?.missing_prefix)
    assert.equal(ctx._restartReplay?.spare_probe?.received_required_count, 7)
    assert.equal(ctx._restartReplay?.spare_probe?.missing_required, 1)
  })

  it("duplicate required seq fails", async () => {
    const { result, ctx } = await runOwner([4, 4, 5, 6, 7, 8, 9, 10, 11])
    assert.ok(!result.passed)
    assert.ok(ctx._restartReplay?.spare_probe?.duplicates! > 0)
  })

  it("required-range out-of-order fails", async () => {
    const { result, ctx } = await runOwner([4, 6, 5, 7, 8, 9, 10, 11])
    assert.ok(!result.passed)
    assert.ok(ctx._restartReplay?.spare_probe?.out_of_order! > 0)
  })

  it("out-of-range frames cannot increase received_required_count", async () => {
    // §3.2.D: the first frame above the frozen target (seq 20) proves
    // substitution while the set is incomplete, so the path fails immediately;
    // trailing frames are never processed and can never inflate the count.
    const { result, ctx } = await runOwner([4, 5, 6, 7, 8, 9, 20, 21, 22])
    assert.ok(!result.passed)
    assert.equal(ctx._restartReplay?.spare_probe?.received_required_count, 6)
    assert.equal(ctx._restartReplay?.spare_probe?.missing_required, 2)
    assert.equal(ctx._restartReplay?.spare_probe?.out_of_range_after_count, 1)
    assert.equal(ctx._restartReplay?.spare_probe?.target_reached, false)
  })

  it("target_reached requires required-set completeness", async () => {
    const { result, ctx } = await runOwner([4, 5, 6, 8, 9, 10, 11])
    assert.ok(!result.passed)
    assert.equal(ctx._restartReplay?.spare_probe?.target_reached, false)
    assert.equal(ctx._restartReplay?.spare_probe?.received_required_count, 7)
    assert.equal(ctx._restartReplay?.spare_probe?.missing_required, 1)
  })
})

describe("§4.1: Restart exact-range adversarial tests (target: failover-drill path)", () => {
  // Same frozen range arithmetic as the owner path, but exercised through the
  // literal partition restart + planned mass failover to the spare.

  function setupLiteralFetch(): void {
    globalThis.fetch = (async (url: string | URL | Request) => {
      const u = typeof url === "string" ? url : url instanceof URL ? url.href : url.url
      if (u.includes("/restart")) return new Response(null, { status: 200 })
      if (u.includes("/pub/healthcheck")) return new Response(null, { status: 200 })
      return new Response(null, { status: 404 })
    }) as typeof fetch
  }

  async function runTarget(replaySeqs: number[], poolOverrides: Partial<Record<string, any>> = {}) {
    setupLiteralFetch()
    try {
      const { stream } = makeLiveThenReplayStream(replaySeqs)
      const pool = mockPool(poolOverrides)
      // Canonical head must cover the full published range (publishPrefill
      // returns lastSeq=11); the drill freezes [live.lastSeq+1 .. head].
      const ctx = mockCtx({ eventStream: stream, pool, head: 11 })
      const scenario = new NchanRestartScenario(makeOpts("target", { pool }))
      const result = await scenario.execute(ctx)
      return { result, ctx, pool }
    } finally {
      delete (globalThis as any).fetch
    }
  }

  it("exact required range 4..11 passes after literal restart + failover", async () => {
    const { result, ctx } = await runTarget([4, 5, 6, 7, 8, 9, 10, 11])
    assert.ok(result.passed, result.detail)
    assert.ok(result.detail.includes("type=failover-drill"), result.detail)
    assert.equal(ctx._restartReplay?.failover_drill?.received_required_count, 8)
    assert.equal(ctx._restartReplay?.failover_drill?.missing_required, 0)
    assert.equal(ctx._failoverHealth?.attempted, 25_000)
    assert.equal(ctx._failoverHealth?.failed, 0)
    assert.equal(ctx._failoverHealth?.gaps, 0)
    assert.equal(ctx._failoverHealth?.duplicates, 0)
    assert.equal(ctx._failoverHealth?.order_violations, 0)
  })

  it("failover routes every drained viewer to the spare node", async () => {
    let failoverUrl = ""
    const { result } = await runTarget([4, 5, 6, 7, 8, 9, 10, 11], {
      async completePlannedFailover(_stream: EventStream, token: any, spareSubUrl: string) {
        failoverUrl = spareSubUrl
        return { attempted: token.saved.length, reestablished: token.saved.length, failed: 0 }
      },
    })
    assert.ok(result.passed, result.detail)
    assert.equal(failoverUrl, "http://localhost:48081")
  })

  it("failover-window correctness deltas block PASS", async () => {
    const { result, ctx } = await runTarget([4, 5, 6, 7, 8, 9, 10, 11], {
      async completePlannedFailover(_stream: EventStream, token: any, _spareSubUrl: string) {
        return { attempted: token.saved.length, reestablished: token.saved.length - 5, failed: 5 }
      },
    })
    assert.ok(!result.passed)
    assert.equal(ctx._failoverHealth?.failed, 5)
    assert.ok(result.detail.includes("failed=5"), result.detail)
  })

  it("missing final required seq (11) + later live seq (12) fails — later event cannot repair", async () => {
    const { result, ctx } = await runTarget([4, 5, 6, 7, 8, 9, 10, 12])
    assert.ok(!result.passed)
    assert.equal(ctx._restartReplay?.failover_drill?.received_required_count, 7)
    assert.deepEqual(ctx._restartReplay?.failover_drill?.missing_required_sequences, [11])
    assert.equal(ctx._restartReplay?.failover_drill?.out_of_range_after_count, 1)
  })

  it("missing middle required seq (7) fails", async () => {
    const { result, ctx } = await runTarget([4, 5, 6, 8, 9, 10, 11])
    assert.ok(!result.passed)
    assert.deepEqual(ctx._restartReplay?.failover_drill?.missing_required_sequences, [7])
  })

  it("out-of-range frames cannot increase received_required_count", async () => {
    const { result, ctx } = await runTarget([4, 5, 6, 7, 8, 9, 20, 21, 22])
    assert.ok(!result.passed)
    assert.equal(ctx._restartReplay?.failover_drill?.received_required_count, 6)
    assert.equal(ctx._restartReplay?.failover_drill?.missing_required, 2)
    assert.equal(ctx._restartReplay?.failover_drill?.out_of_range_after_count, 1)
    assert.equal(ctx._restartReplay?.failover_drill?.target_reached, false)
  })

  it("target_reached requires required-set completeness", async () => {
    const { result, ctx } = await runTarget([4, 5, 6, 8, 9, 10, 11])
    assert.ok(!result.passed)
    assert.equal(ctx._restartReplay?.failover_drill?.target_reached, false)
  })

  it("unreachable control server fails the drill", async () => {
    setupLiteralFetch()
    try {
      globalThis.fetch = (async () => { throw new Error("ECONNREFUSED") }) as typeof fetch
      const { stream } = makeLiveThenReplayStream([4, 5, 6, 7, 8, 9, 10, 11])
      const ctx = mockCtx({ eventStream: stream })
      const scenario = new NchanRestartScenario(makeOpts("target"))
      const result = await scenario.execute(ctx)
      assert.ok(!result.passed)
      assert.ok(result.detail.includes("control server unreachable"), result.detail)
    } finally {
      delete (globalThis as any).fetch
    }
  })
})

describe("evaluateRestartRequiredRange (pure predicate)", () => {
  const base = { transportResumeId: "evt-1-2", recoveryMs: 42 }

  it("complete contiguous set passes", () => {
    const r = evaluateRestartRequiredRange({ ...base, expectedFirstSeq: 4, expectedLastSeq: 11, receivedSequences: [4, 5, 6, 7, 8, 9, 10, 11] })
    assert.equal(r.passed, true)
    assert.equal(r.expected_count, 8)
    assert.equal(r.received_required_count, 8)
    assert.equal(r.recovery_ms, 42)
  })

  it("empty expected range cannot pass vacuously", () => {
    const r = evaluateRestartRequiredRange({ ...base, expectedFirstSeq: 5, expectedLastSeq: 4, receivedSequences: [] })
    assert.equal(r.passed, false)
    assert.equal(r.target_reached, false)
  })

  it("frames below the range are rejected, never counted", () => {
    const r = evaluateRestartRequiredRange({ ...base, expectedFirstSeq: 4, expectedLastSeq: 6, receivedSequences: [1, 2, 4, 5, 6] })
    assert.equal(r.out_of_range_before_count, 2)
    assert.equal(r.passed, false)
    // The first REQUIRED frame (4) matches the expected first; the pre-range
    // frames fail the path via out_of_range_before_count, not missing_prefix.
    assert.equal(r.missing_prefix, false)
    assert.equal(r.received_required_count, 3)
  })

  it("live frames above the range are diagnostics, never credited and never a failure (§M3-PACE-2)", () => {
    // The shared publisher keeps publishing while the probe reads; a frame
    // beyond the frozen head arriving after complete replay is ordinary live
    // continuation. It must not be credited as replay — and must not fail an
    // otherwise exact replay.
    const r = evaluateRestartRequiredRange({ ...base, expectedFirstSeq: 4, expectedLastSeq: 6, receivedSequences: [4, 5, 6, 99] })
    assert.equal(r.out_of_range_after_count, 1)
    assert.equal(r.received_required_count, 3)
    assert.equal(r.received_last_seq, 99)
    assert.equal(r.passed, true)
  })

  it("a beyond-range frame cannot mask loss inside the range", () => {
    // Bounded-wait trigger fires on the first above-range frame; the missing
    // required sequence still fails the path.
    const r = evaluateRestartRequiredRange({ ...base, expectedFirstSeq: 4, expectedLastSeq: 6, receivedSequences: [4, 5, 99] })
    assert.equal(r.missing_required, 1)
    assert.deepEqual(r.missing_required_sequences, [6])
    assert.equal(r.out_of_range_after_count, 1)
    assert.equal(r.passed, false)
  })

  it("single-element range passes exactly", () => {
    const r = evaluateRestartRequiredRange({ ...base, expectedFirstSeq: 7, expectedLastSeq: 7, receivedSequences: [7] })
    assert.equal(r.passed, true)
    assert.equal(r.expected_count, 1)
  })
})
