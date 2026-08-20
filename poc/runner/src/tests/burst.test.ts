import { describe, it } from "node:test"
import assert from "node:assert/strict"
import type { ScenarioContext } from "../scenarios/scenario.js"
import type { Subscription } from "../ports/event-stream.js"
import type { MetricsSnapshot } from "../ports/metrics.js"
import type { MatchEventPublisher } from "../adapters/match-event-publisher.js"
import { BurstScenario } from "../scenarios/burst.js"

function mockCtx(burstSeconds = 1): ScenarioContext {
  let time = 1000
  return {
    publisher: {
      start() {}, stop() {},
      drain() {},
      snapshotAndReset() { return { eventsPublished: 0, byMatch: new Map() } },
    } as unknown as MatchEventPublisher,
    eventStream: { async connect() { return {} as Subscription } },
    metrics: (() => {
      let snapshotCount = 0
      return {
        recordFanOutLatency() {}, recordLateJoinLatency() {},
        incrementEventsReceived() {}, incrementExpectedFanDeliveries() {},
        incrementMissingSequences() {}, incrementDuplicates() {}, incrementOutOfOrder() {},
        incrementReconnectGaps() {}, incrementReconnectDuplicates() {},
        incrementReconnectOrderViolations() {}, incrementSlowConsumerDisconnects() {},
        incrementConnectionsAttempted() {}, incrementConnectionsEstablished() {},
        incrementConnectionFailures() {}, incrementConnectionsDropped() {},
        setActiveConnections() {}, incrementLatencyInvalid() {}, incrementLatencyOverflow() {},
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
        snapshot(): MetricsSnapshot {
          snapshotCount++
          // First snapshot (pre-burst) returns 5 latencies, second (post-burst) returns 15
          const fanOutLatencies = snapshotCount === 1
            ? [5, 10, 15, 20, 25]
            : [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75]
          return {
            fan_out_latencies_ms: fanOutLatencies,
            late_join_latencies_ms: [],
            events_received: 0, expected_fan_deliveries: 0, received_fan_deliveries: 0,
            missing_sequences: 0, duplicates: 0, out_of_order: 0,
            reconnect_gaps: 0, reconnect_duplicates: 0, reconnect_order_violations: 0,
            slow_consumer_disconnects: 0, connections_attempted: 0, connections_established: 0,
            connection_failures: 0, connections_dropped: 0, active_connections_peak: 0,
            latency_sample_count: fanOutLatencies.length, latency_invalid_count: 0, latency_overflow_count: 0,
            generator_backlog_peak: 0, sse_parse_errors: 0, json_parse_errors: 0,             invalid_timestamp_count: 0,
            live_expected_deliveries: 0, live_received_deliveries: 0,
            late_join_history_expected: 0, late_join_history_received: 0,
            reconnect_replay_expected: 0, reconnect_replay_received: 0,
            restart_replay_expected: 0, restart_replay_received: 0,
            deliberate_disconnects: 0, unexpected_client_disconnects: 0,
            server_initiated_disconnects: 0, network_failures: 0, shutdown_cleanup_disconnects: 0,
            schema_validation_errors: 0, missing_transport_id: 0,
          }
        },
      }
    })(),
    clock: {
      now: () => time,
      advance(ms: number) { time += ms },
    },
    resourceMonitor: {
      measureCpu() {},
      snapshot() { return { memoryMbPeak: 100, eventLoopDelayP99Ms: 10, cpuPercentPeak: 50, nchanMemoryMbPeak: null, redisMemoryMbPeak: 100, cpu_usage_usec: null, cpu_throttled_count: null, cpu_throttled_usec: null, memory_current_bytes: null, memory_peak_bytes: null, memory_oom_events: null, memory_oom_kill_events: null, cpu_max_quota: null, memory_max_bytes: null } },
      startEventLoopMonitor() {}, stopEventLoopMonitor() {}, dispose() {},
    },
    headTracker: { getHead: () => 0, updateHead() {} },
    config: {
      nchanPubUrl: "http://localhost:8080", nchanSubUrl: "http://localhost:8081",
      nchan2SubUrl: "", nchanControlUrl: "", redisUrl: "redis://localhost:6379",
      targetConnections: 100, warmupSeconds: 1, measureSeconds: 1, burstSeconds,
      cooldownSeconds: 1, slowConsumerFraction: 0.05, lobbyFraction: 0.02,
      historyUrl: "http://localhost:8081", seed: 42, runProfile: "smoke", runMode: "single",
    },
    matchIds: ["match-001"],
    phaseSnapshots: [],
    log: () => {},
    sleep: (ms: number) => new Promise((r) => setTimeout(r, Math.min(ms, 10))),
  } as any
}

describe("BurstScenario", () => {
  it("stops publisher before burst, then restarts in burst mode", async () => {
    const ctx = mockCtx(1)
    let stopped = false
    let burstModeSet = false
    ctx.publisher = {
      start(_warmup: boolean) {},
      stop() { stopped = true },
      drain() {},
      get burstMode() { return false },
      set burstMode(v: boolean) { burstModeSet = v },
      snapshotAndReset() { return { eventsPublished: 0, byMatch: new Map() } },
    } as any
    const burst = new BurstScenario()
    await burst.execute(ctx)
    assert.ok(stopped)
    assert.ok(burstModeSet)
  })

  it("returns passed=true with burst fan-out p95", async () => {
    const ctx = mockCtx(1)
    const burst = new BurstScenario()
    const result = await burst.execute(ctx)
    assert.ok(result.passed)
    assert.ok(result.detail.includes("fan-out p95"))
    assert.ok(result.detail.includes("burst for"))
  })

  it("computes p95 from fan-out latencies", async () => {
    const ctx = mockCtx(1)
    const burst = new BurstScenario()
    await burst.execute(ctx)
    // First snapshot returns 5 latencies, second returns 15
    // Burst latencies = second.slice(5) = [30, 35, 40, 45, 50, 55, 60, 65, 70, 75]
    // p95 = index ceil(0.95 * 10) - 1 = 9 → 75
    assert.equal(burst.burstFanOutP95Ms, 75)
  })

  it("handles empty fan-out latencies", async () => {
    const ctx = mockCtx(1)
    ctx.metrics = {
      recordFanOutLatency() {}, recordLateJoinLatency() {},
      incrementEventsReceived() {}, incrementExpectedFanDeliveries() {},
      incrementMissingSequences() {}, incrementDuplicates() {}, incrementOutOfOrder() {},
      incrementReconnectGaps() {}, incrementReconnectDuplicates() {},
      incrementReconnectOrderViolations() {}, incrementSlowConsumerDisconnects() {},
      incrementConnectionsAttempted() {}, incrementConnectionsEstablished() {},
      incrementConnectionFailures() {}, incrementConnectionsDropped() {},
      setActiveConnections() {}, incrementLatencyInvalid() {}, incrementLatencyOverflow() {},
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
        snapshot(): MetricsSnapshot {
        return {
          fan_out_latencies_ms: [], late_join_latencies_ms: [],
          events_received: 0, expected_fan_deliveries: 0, received_fan_deliveries: 0,
          missing_sequences: 0, duplicates: 0, out_of_order: 0,
          reconnect_gaps: 0, reconnect_duplicates: 0, reconnect_order_violations: 0,
          slow_consumer_disconnects: 0, connections_attempted: 0, connections_established: 0,
          connection_failures: 0, connections_dropped: 0, active_connections_peak: 0,
          latency_sample_count: 0, latency_invalid_count: 0, latency_overflow_count: 0,
          generator_backlog_peak: 0, sse_parse_errors: 0, json_parse_errors: 0,           invalid_timestamp_count: 0,
          live_expected_deliveries: 0, live_received_deliveries: 0,
          late_join_history_expected: 0, late_join_history_received: 0,
          reconnect_replay_expected: 0, reconnect_replay_received: 0,
          restart_replay_expected: 0, restart_replay_received: 0,
          deliberate_disconnects: 0, unexpected_client_disconnects: 0,
          server_initiated_disconnects: 0, network_failures: 0, shutdown_cleanup_disconnects: 0,
          schema_validation_errors: 0, missing_transport_id: 0,
        }
      },
    } as any
    const burst = new BurstScenario()
    const result = await burst.execute(ctx)
    assert.ok(result.passed)
    assert.equal(burst.burstFanOutP95Ms, 0)
  })
})
