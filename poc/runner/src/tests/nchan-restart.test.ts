import { describe, it } from "node:test"
import assert from "node:assert/strict"
import type { ScenarioContext } from "../scenarios/scenario.js"
import type { EventStream, Subscription, SubscriptionEvent } from "../ports/event-stream.js"
import type { MetricsSnapshot } from "../ports/metrics.js"
import type { MatchEventPublisher } from "../adapters/match-event-publisher.js"
import { NchanRestartScenario } from "../scenarios/nchan-restart.js"

function mockCtx(overrides: Partial<{ eventStream: EventStream; nchan2SubUrl: string; controlUrl: string }> = {}): ScenarioContext {
  let time = 1000
  return {
    publisher: {
      start() {}, stop() {},
      snapshotAndReset() { return { eventsPublished: 0, byMatch: new Map() } },
      async publishPrefill(_matchId: string, count: number) {
        return {
          published: count,
          firstSeq: 4,
          lastSeq: 3 + count,
          frozenState: null,
        }
      },
    } as unknown as MatchEventPublisher,
    eventStream: overrides.eventStream ?? { async connect() { return {} as Subscription } },
    metrics: {
      recordFanOutLatency() {}, recordLateJoinLatency() {},
      incrementEventsReceived() {}, incrementExpectedFanDeliveries() {},
      incrementMissingSequences() {}, incrementDuplicates() {}, incrementOutOfOrder() {},
      incrementReconnectGaps() {}, incrementReconnectDuplicates() {},
      incrementReconnectOrderViolations() {}, incrementSlowConsumerDisconnects() {},
      incrementConnectionsAttempted() {}, incrementConnectionsEstablished() {},
      incrementConnectionFailures() {}, incrementConnectionsDropped() {},
      setActiveConnections() {}, incrementLatencyInvalid() {}, incrementLatencyOverflow() {},
      gauge() {},
      setBacklog() {}, incrementSseParseErrors() {}, incrementJsonParseErrors() {},
      incrementInvalidTimestampCount() {},
      incrementLiveExpectedDeliveries() {},
      incrementLiveReceivedDeliveries() {},
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
      incrementDeliberateDisconnects() {},
      incrementUnexpectedClientDisconnects() {},
      incrementServerInitiatedDisconnects() {},
      incrementNetworkFailures() {},
      incrementShutdownCleanup() {},
      incrementSchemaValidationErrors() {},
      incrementMissingTransportId() {},
      recordSchedulerLag() {},
      beginPhase(_name: string) {}, endPhase() {}, snapshotPhaseHistograms() { return {} },
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
          schema_validation_errors: 0, missing_transport_id: 0,
          fan_out_sample_count: 0, fan_out_overflow_count: 0,
          late_join_sample_count: 0, late_join_overflow_count: 0,
          scheduler_lag_p95_ms: 0, scheduler_lag_max_ms: 0,
        }
      },
    },
    clock: {
      now: () => time,
      advance(ms: number) { time += ms },
    },
    resourceMonitor: {
      measureCpu() {},
      snapshot() { return { memoryMbPeak: 100, eventLoopDelayP99Ms: 10, cpuPercentPeak: 50, nchanMemoryMbPeak: null, redisMemoryMbPeak: 100, cpu_usage_usec: null, cpu_throttled_count: null, cpu_throttled_usec: null, memory_current_bytes: null, memory_peak_bytes: null, memory_oom_events: null, memory_oom_kill_events: null, cpu_max_quota: null, memory_max_bytes: null } },
      startEventLoopMonitor() {}, stopEventLoopMonitor() {}, dispose() {},
    },
    headTracker: { getHead: () => 5, updateHead() {}, updateHeadState() {}, getHeadState() { return null } },
    config: {
      nchanPubUrl: "http://localhost:8080", nchanSubUrl: "http://localhost:8081",
      nchan2SubUrl: overrides.nchan2SubUrl ?? "", nchanControlUrl: overrides.controlUrl ?? "",
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

describe("NchanRestartScenario", () => {
  it("skips when no nchan-2 or control server", async () => {
    const ctx = mockCtx()
    const scenario = new NchanRestartScenario("http://localhost:8081", "http://localhost:8080", "", "")
    const result = await scenario.execute(ctx)
    assert.ok(result.passed)
    assert.ok(result.detail.includes("skipped"))
  })

  it("skips with correct detail message", async () => {
    const ctx = mockCtx()
    const scenario = new NchanRestartScenario("http://localhost:8081", "http://localhost:8080", "", "")
    const result = await scenario.execute(ctx)
    assert.ok(result.detail.includes("no nchan-2 or control server"))
  })

  it("attempts cross-node test when nchan-2 is available", async () => {
    const events = [
      JSON.stringify({ canonical_seq: 1, ts: Date.now() }),
      JSON.stringify({ canonical_seq: 2, ts: Date.now() }),
      JSON.stringify({ canonical_seq: 3, ts: Date.now() }),
    ]
    // §3.11: Replay must include events AFTER pre-restart lastSeq (3) to satisfy seq > lastSeq1
    const replayEvents = Array.from({ length: 8 }, (_, index) =>
      JSON.stringify({ canonical_seq: 4 + index, ts: Date.now() }))
    let connectCount = 0
    const stream: EventStream = {
      async connect(_url: string, _lastEventId?: string): Promise<Subscription> {
        connectCount++
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
    const ctx = mockCtx({ eventStream: stream, nchan2SubUrl: "http://localhost:8082" })
    const scenario = new NchanRestartScenario("http://localhost:8081", "http://localhost:8080", "http://localhost:8082", "")
    const result = await scenario.execute(ctx)
    assert.ok(result.passed)
    assert.ok(result.detail.includes("cross-node"))
    assert.equal(ctx._restartReplay?.cross_node?.expected_count, 8)
    assert.equal(ctx._restartReplay?.cross_node?.received_required_count, 8)
    assert.equal(ctx._restartReplay?.cross_node?.missing_required, 0)
  })
})

// §4.1: Restart exact-range adversarial tests
// The mock publishPrefill returns {published: 8, firstSeq: 4, lastSeq: 11}
// Pre-restart events are 3 (seq 1,2,3), so frozenExpectedFirstSeq=4, head=11, expectedCount=8
// Frozen expected set: {4, 5, 6, 7, 8, 9, 10, 11}

function makeReplayStream(replaySeqs: number[]): EventStream {
  const events = [
    JSON.stringify({ canonical_seq: 1, ts: Date.now() }),
    JSON.stringify({ canonical_seq: 2, ts: Date.now() }),
    JSON.stringify({ canonical_seq: 3, ts: Date.now() }),
  ]
  const replayEvents = replaySeqs.map((s) => JSON.stringify({ canonical_seq: s, ts: Date.now() }))
  let connectCount = 0
  return {
    async connect(_url: string, _lastEventId?: string): Promise<Subscription> {
      connectCount++
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
}

describe("§4.1: Restart exact-range adversarial tests (cross-node)", () => {
  it("exact required range 4..11 passes", async () => {
    const ctx = mockCtx({ eventStream: makeReplayStream([4, 5, 6, 7, 8, 9, 10, 11]), nchan2SubUrl: "http://localhost:8082" })
    const scenario = new NchanRestartScenario("http://localhost:8081", "http://localhost:8080", "http://localhost:8082", "")
    const result = await scenario.execute(ctx)
    assert.ok(result.passed)
    assert.equal(ctx._restartReplay?.cross_node?.received_required_count, 8)
    assert.equal(ctx._restartReplay?.cross_node?.missing_required, 0)
    assert.equal(ctx._restartReplay?.cross_node?.missing_required_sequences?.length, 0)
  })

  it("missing middle required seq (7) fails", async () => {
    const ctx = mockCtx({ eventStream: makeReplayStream([4, 5, 6, 8, 9, 10, 11]), nchan2SubUrl: "http://localhost:8082" })
    const scenario = new NchanRestartScenario("http://localhost:8081", "http://localhost:8080", "http://localhost:8082", "")
    const result = await scenario.execute(ctx)
    assert.ok(!result.passed)
    assert.equal(ctx._restartReplay?.cross_node?.received_required_count, 7)
    assert.equal(ctx._restartReplay?.cross_node?.missing_required, 1)
    assert.deepEqual(ctx._restartReplay?.cross_node?.missing_required_sequences, [7])
  })

  it("missing final required seq (11) + later live seq (12) fails — later event cannot repair", async () => {
    const ctx = mockCtx({ eventStream: makeReplayStream([4, 5, 6, 7, 8, 9, 10, 12]), nchan2SubUrl: "http://localhost:8082" })
    const scenario = new NchanRestartScenario("http://localhost:8081", "http://localhost:8080", "http://localhost:8082", "")
    const result = await scenario.execute(ctx)
    assert.ok(!result.passed)
    assert.equal(ctx._restartReplay?.cross_node?.received_required_count, 7)
    assert.equal(ctx._restartReplay?.cross_node?.missing_required, 1)
    assert.deepEqual(ctx._restartReplay?.cross_node?.missing_required_sequences, [11])
    assert.equal(ctx._restartReplay?.cross_node?.out_of_range_after_count, 1)
  })

  it("missing first prefix (4) fails", async () => {
    const ctx = mockCtx({ eventStream: makeReplayStream([5, 6, 7, 8, 9, 10, 11]), nchan2SubUrl: "http://localhost:8082" })
    const scenario = new NchanRestartScenario("http://localhost:8081", "http://localhost:8080", "http://localhost:8082", "")
    const result = await scenario.execute(ctx)
    assert.ok(!result.passed)
    assert.ok(ctx._restartReplay?.cross_node?.missing_prefix)
    assert.equal(ctx._restartReplay?.cross_node?.received_required_count, 7)
    assert.equal(ctx._restartReplay?.cross_node?.missing_required, 1)
  })

  it("duplicate required seq fails", async () => {
    const ctx = mockCtx({ eventStream: makeReplayStream([4, 4, 5, 6, 7, 8, 9, 10, 11]), nchan2SubUrl: "http://localhost:8082" })
    const scenario = new NchanRestartScenario("http://localhost:8081", "http://localhost:8080", "http://localhost:8082", "")
    const result = await scenario.execute(ctx)
    assert.ok(!result.passed)
    assert.ok(ctx._restartReplay?.cross_node?.duplicates! > 0)
  })

  it("required-range out-of-order fails", async () => {
    const ctx = mockCtx({ eventStream: makeReplayStream([4, 6, 5, 7, 8, 9, 10, 11]), nchan2SubUrl: "http://localhost:8082" })
    const scenario = new NchanRestartScenario("http://localhost:8081", "http://localhost:8080", "http://localhost:8082", "")
    const result = await scenario.execute(ctx)
    assert.ok(!result.passed)
    assert.ok(ctx._restartReplay?.cross_node?.out_of_order! > 0)
  })

  it("out-of-range frames cannot increase received_required_count", async () => {
    // Send only 6 required events (missing 2) + out-of-range events.
    // §3.2.D: the first frame above the frozen target (seq 20) proves
    // substitution while the set is incomplete, so the path fails immediately;
    // the trailing frames are never processed and can never inflate the count.
    const ctx = mockCtx({ eventStream: makeReplayStream([4, 5, 6, 7, 8, 9, 20, 21, 22]), nchan2SubUrl: "http://localhost:8082" })
    const scenario = new NchanRestartScenario("http://localhost:8081", "http://localhost:8080", "http://localhost:8082", "")
    const result = await scenario.execute(ctx)
    assert.ok(!result.passed)
    assert.equal(ctx._restartReplay?.cross_node?.received_required_count, 6)
    assert.equal(ctx._restartReplay?.cross_node?.missing_required, 2)
    assert.equal(ctx._restartReplay?.cross_node?.out_of_range_after_count, 1)
    assert.equal(ctx._restartReplay?.cross_node?.target_reached, false)
  })

  it("target_reached requires required-set completeness", async () => {
    // Missing seq 7 but has seq 11 (>= target); target_reached should be false
    const ctx = mockCtx({ eventStream: makeReplayStream([4, 5, 6, 8, 9, 10, 11]), nchan2SubUrl: "http://localhost:8082" })
    const scenario = new NchanRestartScenario("http://localhost:8081", "http://localhost:8080", "http://localhost:8082", "")
    const result = await scenario.execute(ctx)
    assert.ok(!result.passed)
    assert.equal(ctx._restartReplay?.cross_node?.target_reached, false)
    assert.equal(ctx._restartReplay?.cross_node?.received_required_count, 7)
    assert.equal(ctx._restartReplay?.cross_node?.missing_required, 1)
  })
})

describe("§4.1: Restart exact-range adversarial tests (literal)", () => {
  // Literal restart uses controlUrl; mockCtx with controlUrl triggers literalRestartTest
  // publishPrefill returns {published: 8, firstSeq: 4, lastSeq: 11}
  // frozenExpectedFirstSeq=4, headAtRestart=11, frozenExpectedCount=8

  function makeLiteralStream(replaySeqs: number[]): EventStream {
    const events = [
      JSON.stringify({ canonical_seq: 1, ts: Date.now() }),
      JSON.stringify({ canonical_seq: 2, ts: Date.now() }),
      JSON.stringify({ canonical_seq: 3, ts: Date.now() }),
    ]
    const replayEvents = replaySeqs.map((s) => JSON.stringify({ canonical_seq: s, ts: Date.now() }))
    let connectCount = 0
    return {
      async connect(_url: string, _lastEventId?: string): Promise<Subscription> {
        connectCount++
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
  }

  function mockLiteralCtx(overrides: Partial<{ eventStream: EventStream }> = {}): ScenarioContext {
    let time = 1000
    return {
      publisher: {
        start() {}, stop() {},
        snapshotAndReset() { return { eventsPublished: 0, byMatch: new Map() } },
        async publishPrefill(_matchId: string, count: number) {
          return { published: count, firstSeq: 4, lastSeq: 3 + count, frozenState: null }
        },
      } as unknown as MatchEventPublisher,
      eventStream: overrides.eventStream ?? { async connect() { return {} as Subscription } },
      metrics: {
        recordFanOutLatency() {}, recordLateJoinLatency() {},
        incrementEventsReceived() {}, incrementExpectedFanDeliveries() {},
        incrementMissingSequences() {}, incrementDuplicates() {}, incrementOutOfOrder() {},
        incrementReconnectGaps() {}, incrementReconnectDuplicates() {},
        incrementReconnectOrderViolations() {}, incrementSlowConsumerDisconnects() {},
        incrementConnectionsAttempted() {}, incrementConnectionsEstablished() {},
        incrementConnectionFailures() {}, incrementConnectionsDropped() {},
        setActiveConnections() {}, incrementLatencyInvalid() {}, incrementLatencyOverflow() {},
        gauge() {},
        setBacklog() {}, incrementSseParseErrors() {}, incrementJsonParseErrors() {},
        incrementInvalidTimestampCount() {},
        incrementLiveExpectedDeliveries() {},
        incrementLiveReceivedDeliveries() {},
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
        incrementDeliberateDisconnects() {},
        incrementUnexpectedClientDisconnects() {},
        incrementServerInitiatedDisconnects() {},
        incrementNetworkFailures() {},
        incrementShutdownCleanup() {},
        incrementSchemaValidationErrors() {},
        incrementMissingTransportId() {},
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
            schema_validation_errors: 0, missing_transport_id: 0,
            fan_out_sample_count: 0, fan_out_overflow_count: 0,
            late_join_sample_count: 0, late_join_overflow_count: 0,
            scheduler_lag_p95_ms: 0, scheduler_lag_max_ms: 0,
          }
        },
      },
      clock: { now: () => time, advance(ms: number) { time += ms } },
      resourceMonitor: {
        measureCpu() {},
        snapshot() { return { memoryMbPeak: 100, eventLoopDelayP99Ms: 10, cpuPercentPeak: 50, nchanMemoryMbPeak: null, redisMemoryMbPeak: 100, cpu_usage_usec: null, cpu_throttled_count: null, cpu_throttled_usec: null, memory_current_bytes: null, memory_peak_bytes: null, memory_oom_events: null, memory_oom_kill_events: null, cpu_max_quota: null, memory_max_bytes: null } },
        startEventLoopMonitor() {}, stopEventLoopMonitor() {}, dispose() {},
      },
      headTracker: { getHead: () => 5, updateHead() {}, updateHeadState() {}, getHeadState() { return null } },
      config: {
        nchanPubUrl: "http://localhost:8080", nchanSubUrl: "http://localhost:8081",
        nchan2SubUrl: "", nchanControlUrl: "http://localhost:9090",
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

  // Mock global fetch for literal restart control server
  const originalFetch = globalThis.fetch

  function setupLiteralTest() {
    globalThis.fetch = async (url: string | URL | Request) => {
      const u = typeof url === "string" ? url : url instanceof URL ? url.href : url.url
      if (u.includes("/restart")) {
        return new Response(null, { status: 200 })
      }
      if (u.includes("/pub/healthcheck")) {
        return new Response(null, { status: 200 })
      }
      return new Response(null, { status: 404 })
    }
  }

  function teardownLiteralTest() {
    globalThis.fetch = originalFetch
  }

  it("exact required range 4..11 passes", async () => {
    setupLiteralTest()
    try {
      const ctx = mockLiteralCtx({ eventStream: makeLiteralStream([4, 5, 6, 7, 8, 9, 10, 11]) })
      const scenario = new NchanRestartScenario("http://localhost:8081", "http://localhost:8080", "", "http://localhost:9090")
      const result = await scenario.execute(ctx)
      assert.ok(result.passed)
      assert.equal(ctx._restartReplay?.literal_restart?.received_required_count, 8)
      assert.equal(ctx._restartReplay?.literal_restart?.missing_required, 0)
    } finally { teardownLiteralTest() }
  })

  it("missing final required seq (11) + later live seq (12) fails — later event cannot repair", async () => {
    setupLiteralTest()
    try {
      const ctx = mockLiteralCtx({ eventStream: makeLiteralStream([4, 5, 6, 7, 8, 9, 10, 12]) })
      const scenario = new NchanRestartScenario("http://localhost:8081", "http://localhost:8080", "", "http://localhost:9090")
      const result = await scenario.execute(ctx)
      assert.ok(!result.passed)
      assert.equal(ctx._restartReplay?.literal_restart?.received_required_count, 7)
      assert.equal(ctx._restartReplay?.literal_restart?.missing_required, 1)
      assert.deepEqual(ctx._restartReplay?.literal_restart?.missing_required_sequences, [11])
      assert.equal(ctx._restartReplay?.literal_restart?.out_of_range_after_count, 1)
    } finally { teardownLiteralTest() }
  })

  it("missing middle required seq (7) fails", async () => {
    setupLiteralTest()
    try {
      const ctx = mockLiteralCtx({ eventStream: makeLiteralStream([4, 5, 6, 8, 9, 10, 11]) })
      const scenario = new NchanRestartScenario("http://localhost:8081", "http://localhost:8080", "", "http://localhost:9090")
      const result = await scenario.execute(ctx)
      assert.ok(!result.passed)
      assert.equal(ctx._restartReplay?.literal_restart?.received_required_count, 7)
      assert.equal(ctx._restartReplay?.literal_restart?.missing_required, 1)
      assert.deepEqual(ctx._restartReplay?.literal_restart?.missing_required_sequences, [7])
    } finally { teardownLiteralTest() }
  })

  it("out-of-range frames cannot increase received_required_count", async () => {
    setupLiteralTest()
    try {
      // Send only 6 required events (missing 2) + out-of-range events.
      // §3.2.D: the first frame above the frozen target (seq 20) proves
      // substitution while the set is incomplete, so the path fails immediately;
      // the trailing frames are never processed and can never inflate the count.
      const ctx = mockLiteralCtx({ eventStream: makeLiteralStream([4, 5, 6, 7, 8, 9, 20, 21, 22]) })
      const scenario = new NchanRestartScenario("http://localhost:8081", "http://localhost:8080", "", "http://localhost:9090")
      const result = await scenario.execute(ctx)
      assert.ok(!result.passed)
      assert.equal(ctx._restartReplay?.literal_restart?.received_required_count, 6)
      assert.equal(ctx._restartReplay?.literal_restart?.missing_required, 2)
      assert.equal(ctx._restartReplay?.literal_restart?.out_of_range_after_count, 1)
      assert.equal(ctx._restartReplay?.literal_restart?.target_reached, false)
    } finally { teardownLiteralTest() }
  })

  it("target_reached requires required-set completeness", async () => {
    setupLiteralTest()
    try {
      const ctx = mockLiteralCtx({ eventStream: makeLiteralStream([4, 5, 6, 8, 9, 10, 11]) })
      const scenario = new NchanRestartScenario("http://localhost:8081", "http://localhost:8080", "", "http://localhost:9090")
      const result = await scenario.execute(ctx)
      assert.ok(!result.passed)
      assert.equal(ctx._restartReplay?.literal_restart?.target_reached, false)
    } finally { teardownLiteralTest() }
  })
})
