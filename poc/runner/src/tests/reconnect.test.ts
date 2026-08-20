import { describe, it } from "node:test"
import assert from "node:assert/strict"
import type { ScenarioContext } from "../scenarios/scenario.js"
import type { EventStream, Subscription, SubscriptionEvent } from "../ports/event-stream.js"
import type { MetricsSnapshot } from "../ports/metrics.js"
import type { MatchEventPublisher } from "../adapters/match-event-publisher.js"
import type { ConnectionEntry } from "../application/connection-pool.js"
import { ReconnectScenario } from "../scenarios/reconnect.js"

function makeEntry(id: number): ConnectionEntry {
  return {
    id,
    matchId: "match-001",
    subscription: {
      connected: true,
      lastEventId: `evt-${id}`,
      onEvent(_h: (event: SubscriptionEvent) => void) {},
      pause() {},
      resume() {},
      close() {},
    },
    tracker: { lastSeq: id * 100, classify() { return { kind: "NEXT" } }, reset() {} },
    mode: "steady",
  } as unknown as ConnectionEntry
}

function mockCtx(entries: ConnectionEntry[], metricsOverrides: Partial<MetricsSnapshot> = {}): ScenarioContext & { head: { value: number } } {
  let time = 1000
  const head = { value: 500 }
  let getHeadCalls = 0
  return {
    publisher: {
      start() {}, stop() {},
      snapshotAndReset() { return { eventsPublished: 0, byMatch: new Map() } },
    } as unknown as MatchEventPublisher,
    eventStream: {
      async connect(_url: string, _lastEventId?: string): Promise<Subscription> {
        return {
          connected: true,
          lastEventId: null,
          onEvent(_h) {},
          pause() {},
          resume() {},
          close() {},
        }
      },
    },
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
          schema_validation_errors: 0, missing_transport_id: 0,
          ...metricsOverrides,
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
    headTracker: {
      getHead(_matchId: string) {
        getHeadCalls++
        // After first 2 calls (headBefore for 2-entry cohort), advance head to simulate events published during disconnect
        if (getHeadCalls > 2) head.value += 100
        return head.value
      },
      updateHead(_m: string, s: number) { head.value = Math.max(head.value, s) },
    },
    config: {
      nchanPubUrl: "http://localhost:8080", nchanSubUrl: "http://localhost:8081",
      nchan2SubUrl: "", nchanControlUrl: "", redisUrl: "redis://localhost:6379",
      targetConnections: 100, warmupSeconds: 1, measureSeconds: 1, burstSeconds: 1,
      cooldownSeconds: 1, slowConsumerFraction: 0.05, lobbyFraction: 0.02,
      historyUrl: "http://localhost:8081", seed: 42, runProfile: "smoke", runMode: "single",
    },
    matchIds: ["match-001"],
    phaseSnapshots: [],
    log: () => {},
    sleep: (ms: number) => new Promise((r) => setTimeout(r, Math.min(ms, 10))),
    head,
  } as any
}

describe("ReconnectScenario", () => {
  it("skips when no connections exist", async () => {
    const ctx = mockCtx([])
    const reconnect = new ReconnectScenario({ entries: [], running: true } as any)
    const result = await reconnect.execute(ctx)
    assert.ok(result.passed)
    assert.ok(result.detail.includes("skipped"))
  })

  it("reconnects 10% cohort and checks for gaps/duplicates", async () => {
    const entries = Array.from({ length: 20 }, (_, i) => makeEntry(i))
    const pool = { entries, running: true, handleMessage() {} }
    const ctx = mockCtx(entries)
    const reconnect = new ReconnectScenario(pool as any)
    const result = await reconnect.execute(ctx)
    // Check that reconnect was attempted (at least 1 reconnection)
    assert.ok(result.detail.includes("reconnected="))
    assert.ok(result.detail.includes("gaps="))
    assert.ok(result.detail.includes("dups="))
    // With mock metrics returning 0 gaps/dups and head advancing, should pass
    assert.ok(result.passed, `Expected passed=true, detail: ${result.detail}`)
  })

  it("reports FAIL when reconnect gaps detected", async () => {
    const entries = Array.from({ length: 10 }, (_, i) => makeEntry(i))
    const pool = { entries, running: true, handleMessage() {} }
    const ctx = mockCtx(entries, { reconnect_gaps: 3 })
    const reconnect = new ReconnectScenario(pool as any)
    const result = await reconnect.execute(ctx)
    assert.ok(!result.passed)
    assert.ok(result.detail.includes("gaps=3"))
  })
})
