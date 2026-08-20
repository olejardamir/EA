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
          deliberate_disconnects: 0, unexpected_client_disconnects: 0,
          server_initiated_disconnects: 0, network_failures: 0, shutdown_cleanup_disconnects: 0,
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
    headTracker: { getHead: () => 0, updateHead() {} },
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
    let connectCount = 0
    const stream: EventStream = {
      async connect(_url: string, _lastEventId?: string): Promise<Subscription> {
        connectCount++
        let delivered = 0
        const evts = connectCount === 1 ? events : events.slice(1)
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
        }
      },
    }
    const ctx = mockCtx({ eventStream: stream, nchan2SubUrl: "http://localhost:8082" })
    const scenario = new NchanRestartScenario("http://localhost:8081", "http://localhost:8080", "http://localhost:8082", "")
    const result = await scenario.execute(ctx)
    assert.ok(result.passed)
    assert.ok(result.detail.includes("cross-node"))
  })
})
