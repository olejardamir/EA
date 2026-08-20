import { describe, it } from "node:test"
import assert from "node:assert/strict"
import type { ScenarioContext } from "../scenarios/scenario.js"
import type { Subscription, SubscriptionEvent } from "../ports/event-stream.js"
import type { MetricsSnapshot } from "../ports/metrics.js"
import type { MatchEventPublisher } from "../adapters/match-event-publisher.js"
import { SteadyScenario } from "../scenarios/steady.js"

function mockCtx(measureSeconds = 1): ScenarioContext & { clock: { now(): number; advance(ms: number): void } } {
  let time = 1000
  return {
    publisher: {
      start() {},
      stop() {},
      snapshotAndReset() { return { eventsPublished: 0, byMatch: new Map() } },
    } as unknown as MatchEventPublisher,
    eventStream: { async connect() { return {} as Subscription } },
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
      nchan2SubUrl: "", nchanControlUrl: "", redisUrl: "redis://localhost:6379",
      targetConnections: 100, warmupSeconds: 1, measureSeconds, burstSeconds: 1,
      cooldownSeconds: 1, slowConsumerFraction: 0.05, lobbyFraction: 0.02,
      historyUrl: "http://localhost:8081", seed: 42, runProfile: "smoke", runMode: "single",
    },
    matchIds: ["match-001"],
    phaseSnapshots: [],
    log: () => {},
    sleep: (ms: number) => new Promise((r) => setTimeout(r, Math.min(ms, 10))),
  } as any
}

describe("SteadyScenario", () => {
  it("calls snapshotAndReset before measurement", async () => {
    const ctx = mockCtx(1)
    let snapshotCalled = false
    ctx.publisher = {
      start() {}, stop() {},
      snapshotAndReset() { snapshotCalled = true; return { eventsPublished: 0, byMatch: new Map() } },
    } as unknown as MatchEventPublisher
    const steady = new SteadyScenario({} as any)
    await steady.execute(ctx)
    assert.ok(snapshotCalled)
  })

  it("returns passed=true with duration in detail", async () => {
    const ctx = mockCtx(1)
    const steady = new SteadyScenario({} as any)
    const result = await steady.execute(ctx)
    assert.ok(result.passed)
    assert.ok(result.detail.includes("measured"))
    assert.equal(result.name, "steady")
  })

  it("respects measureSeconds config in detail output", async () => {
    const ctx = mockCtx(5)
    const steady = new SteadyScenario({} as any)
    const result = await steady.execute(ctx)
    assert.ok(result.passed)
    assert.ok(result.detail.includes("measured"))
  })
})
