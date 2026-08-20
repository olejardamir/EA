import { describe, it } from "node:test"
import assert from "node:assert/strict"
import type { ScenarioContext } from "../scenarios/scenario.js"
import type { EventStream, Subscription, SubscriptionEvent } from "../ports/event-stream.js"
import type { MetricsSnapshot } from "../ports/metrics.js"
import type { MatchEventPublisher } from "../adapters/match-event-publisher.js"
import { SlowConsumerScenario } from "../scenarios/slow-consumer.js"

function makeEntry(id: number) {
  // §4.7: Mock subscription that simulates event delivery — calls handler with events
  let handler: ((event: SubscriptionEvent) => void) | null = null
  let eventTimer: ReturnType<typeof setTimeout> | null = null
  let seq = 0
  const mockSub: any = {
    connected: true,
    lastEventId: `evt-${id}`,
    onEvent(h: (event: SubscriptionEvent) => void) {
      handler = h
      // §3.17: getEventHandler() exposes the handler — no _lastHandler needed
      // Simulate event delivery: emit 10 events at 10ms intervals
      let count = 0
      const emit = () => {
        if (count >= 10 || !handler) return
        seq++
        handler({ type: "message" as const, event: { id: `evt-${id}-${seq}`, event: "message", data: JSON.stringify({ seq, ts: Date.now() }) } })
        count++
        eventTimer = setTimeout(emit, 10)
      }
      emit()
    },
    pause() { /* pretend to pause */ },
    resume() {},
    getEventHandler() { return handler },
    close() {
      if (eventTimer) clearTimeout(eventTimer)
      handler = null
    },
  }
  return {
    id,
    matchId: "match-001",
    subscription: mockSub,
    tracker: { lastSeq: id * 100, classify() { return { kind: "NEXT" } }, reset() {} },
    mode: "steady",
  }
}

function mockCtx(entries: any[], slowFraction = 0.05): ScenarioContext {
  let time = 1000
  return {
    publisher: {
      start() {}, stop() {},
      snapshotAndReset() { return { eventsPublished: 0, byMatch: new Map() } },
    } as unknown as MatchEventPublisher,
    eventStream: { async connect() { return {} as Subscription } },
    metrics: {
      recordFanOutLatency() {}, recordLateJoinLatency() {},
      incrementEventsReceived() {}, incrementExpectedFanDeliveries() {},
      incrementMissingSequences() {}, incrementDuplicates() {}, incrementOutOfOrder() {},
      incrementReconnectGaps() {}, incrementReconnectDuplicates() {},
      incrementReconnectOrderViolations() {},
      incrementSlowConsumerDisconnects() {},
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
      snapshot() { return { memoryMbPeak: 100, eventLoopDelayP99Ms: 10, cpuPercentPeak: 50, nchan_memory_current_bytes: null, nchanMemoryMbPeak: null, redisMemoryMbPeak: 100, nchan_cpu_percent_peak: null, redis_cpu_percent_peak: null, cpu_usage_usec: null, cpu_throttled_count: null, cpu_throttled_usec: null, memory_current_bytes: null, memory_peak_bytes: null, memory_oom_events: null, memory_oom_kill_events: null, cpu_max_quota: null, cpu_max_period: null, memory_max_bytes: null, nchan_cpu_usage_usec: null, nchan_cpu_throttled_count: null, nchan_cpu_throttled_usec: null, nchan_memory_peak_bytes: null, nchan_memory_oom_events: null, nchan_memory_oom_kill_events: null, redis_connected_clients_peak: null, nchan_cpu_max_quota: null, redis_cpu_max_quota: null } },
      startEventLoopMonitor() {}, stopEventLoopMonitor() {}, dispose() {}, async ready() {}, async preflight() { return null } },
    headTracker: { getHead: () => 0, updateHead() {}, updateHeadState() {}, getHeadState() { return null } },
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
  } as any
}

describe("SlowConsumerScenario", () => {
  it("skips when no connections exist", async () => {
    const ctx = mockCtx([])
    const scenario = new SlowConsumerScenario({ entries: [] } as any)
    const result = await scenario.execute(ctx)
    assert.ok(result.passed)
    assert.ok(result.detail.includes("skipped"))
  })

  it("throttles slow connections and checks degradation", async () => {
    const entries = Array.from({ length: 20 }, (_, i) => makeEntry(i))
    const pool = { entries }
    const ctx = mockCtx(entries, 0.05)
    const scenario = new SlowConsumerScenario(pool as any)
    const result = await scenario.execute(ctx)
    // §3.6: Without server-side backpressure evidence (mock has no disconnects/null memory),
    // passed=false is correct — the test did not prove the backpressure property
    assert.ok(!result.passed)
    assert.ok(result.detail.includes("slow_throttled"))
    assert.ok(result.detail.includes("degradation"))
    assert.ok(result.detail.includes("threshold=5%"))
    assert.ok(result.detail.includes("backpressure=NO"))
  })

  it("respects slowConsumerFraction config", async () => {
    const entries = Array.from({ length: 100 }, (_, i) => makeEntry(i))
    const pool = { entries }
    const ctx = mockCtx(entries, 0.1)
    const scenario = new SlowConsumerScenario(pool as any)
    const result = await scenario.execute(ctx)
    // §3.6: No backpressure evidence in mock → passed=false
    assert.ok(!result.passed)
    assert.ok(result.detail.includes("slow_throttled=10/100"))
  })

  it("passes with zero degradation (no latency change)", async () => {
    const entries = Array.from({ length: 10 }, (_, i) => makeEntry(i))
    const pool = { entries }
    const ctx = mockCtx(entries, 0.05)
    const scenario = new SlowConsumerScenario(pool as any)
    const result = await scenario.execute(ctx)
    // §3.6: Zero degradation is healthy, but no backpressure evidence → passed=false
    assert.ok(!result.passed)
    assert.ok(result.detail.includes("degradation=0.0%"))
  })
})
