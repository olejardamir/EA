import { describe, it } from "node:test"
import assert from "node:assert/strict"
import type { ScenarioContext } from "../scenarios/scenario.js"
import type { EventStream, Subscription, SubscriptionEvent } from "../ports/event-stream.js"
import type { MetricsRecorder, MetricsSnapshot } from "../ports/metrics.js"
import type { Clock } from "../ports/clock.js"
import type { ResourceMonitor, ResourceSnapshot } from "../ports/resource-monitor.js"
import type { MatchHeadTracker } from "../domain/match-state.js"
import type { MatchEventPublisher } from "../adapters/match-event-publisher.js"
import type { ExperimentConfig } from "../config/experiment-config.js"
import { WarmupScenario } from "../scenarios/warmup.js"
import { ConnectionSurgeScenario } from "../scenarios/connection-surge.js"

function mockMetrics(): MetricsRecorder & { counts: Record<string, number> } {
  const counts: Record<string, number> = {}
  const inc = (k: string, n = 1) => { counts[k] = (counts[k] ?? 0) + n }
  return {
    counts,
    recordFanOutLatency() {},
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
        missing_sequences: 0, duplicates: 0,
        out_of_order: 0, reconnect_gaps: 0, reconnect_duplicates: 0,
        reconnect_order_violations: 0, slow_consumer_disconnects: 0,
        connections_attempted: 0, connections_established: 0,
        connection_failures: 0, connections_dropped: 0,
        active_connections_peak: 0,
        latency_sample_count: 0, latency_invalid_count: 0, latency_overflow_count: 0,
        generator_backlog_peak: 0,
        sse_parse_errors: 0, json_parse_errors: 0, invalid_timestamp_count: 0,
        live_expected_deliveries: 0, live_received_deliveries: 0,
        late_join_history_expected: 0, late_join_history_received: 0,
        reconnect_replay_expected: 0, reconnect_replay_received: 0,
        restart_replay_expected: 0, restart_replay_received: 0,
        deliberate_disconnects: 0, unexpected_client_disconnects: 0,
        server_initiated_disconnects: 0, network_failures: 0, shutdown_cleanup_disconnects: 0,
      }
    },
  }
}

function mockClock(): Clock & { time: number; advance(ms: number): void } {
  let time = 1000
  return {
    get time() { return time },
    now: () => time,
    advance(ms: number) { time += ms },
    hrtime: () => 0n,
  }
}

function mockSubscription(): Subscription {
  let handler: ((event: SubscriptionEvent) => void) | null = null
  return {
    connected: true,
    lastEventId: null,
    onEvent(h) { handler = h },
    pause() {},
    resume() {},
    close() {},
  }
}

function mockStream(): EventStream {
  return {
    async connect() { return mockSubscription() },
  }
}

function mockResourceMonitor(): ResourceMonitor {
  return {
    measureCpu() {},
    snapshot(): ResourceSnapshot {
      return {
        memoryMbPeak: 100, eventLoopDelayP99Ms: 10, cpuPercentPeak: 50,
        nchanMemoryMbPeak: null, redisMemoryMbPeak: 100,
        cpu_usage_usec: null, cpu_throttled_count: null, cpu_throttled_usec: null,
        memory_current_bytes: null, memory_peak_bytes: null,
        memory_oom_events: null, memory_oom_kill_events: null,
        cpu_max_quota: null, memory_max_bytes: null,
        nchan_cpu_usage_usec: null, nchan_cpu_throttled_count: null, nchan_cpu_throttled_usec: null,
        nchan_memory_current_bytes: null, nchan_memory_peak_bytes: null,
        nchan_memory_oom_events: null, nchan_memory_oom_kill_events: null,
      }
    },
    startEventLoopMonitor() {},
    stopEventLoopMonitor() {},
    dispose() {},
  }
}

function mockCtx(overrides: Partial<ExperimentConfig> = {}): ScenarioContext {
  const clock = mockClock()
  return {
    publisher: {
      start() {},
      stop() {},
      snapshotAndReset() { return { eventsPublished: 0, byMatch: new Map() } },
    } as unknown as MatchEventPublisher,
    eventStream: mockStream(),
    metrics: mockMetrics(),
    clock,
    resourceMonitor: mockResourceMonitor(),
    headTracker: { getHead: () => 0, updateHead() {} },
    config: {
      nchanPubUrl: "http://localhost:8080",
      nchanSubUrl: "http://localhost:8081",
      nchan2SubUrl: "",
      nchanControlUrl: "http://localhost:18888",
      redisUrl: "redis://localhost:6379",
      targetConnections: 100,
      warmupSeconds: 1,
      measureSeconds: 1,
      burstSeconds: 1,
      cooldownSeconds: 1,
      slowConsumerFraction: 0.05,
      lobbyFraction: 0.02,
      historyUrl: "http://localhost:8081",
      seed: 42,
      runProfile: "smoke",
      runMode: "single",
      ...overrides,
    },
    matchIds: ["match-001", "match-002", "match-003", "match-004",
      "match-005", "match-006", "match-007", "match-008"],
    phaseSnapshots: [],
    log: () => {},
    sleep: (ms) => new Promise((r) => {
      const actual = Math.min(ms, 10)
      clock.advance(actual)
      setTimeout(r, actual)
    }),
  }
}

function mockPool(size: number): { entries: Array<{ id: number; matchId: string; subscription: Subscription; tracker: { lastSeq: number; classify(s: number): { kind: string }; reset(): void }; mode: string }> } {
  const entries = Array.from({ length: size }, (_, i) => ({
    id: i,
    matchId: `match-${String(i % 8 + 1).padStart(3, "0")}`,
    subscription: mockSubscription(),
    tracker: { lastSeq: 0, classify(_s: number) { return { kind: "NEXT" } }, reset() {} },
    mode: "steady" as string,
  }))
  return { entries }
}

describe("WarmupScenario (Defect 2/6)", () => {
  it("connects 60% of target (not 100%)", async () => {
    const ctx = mockCtx({ targetConnections: 100, warmupSeconds: 1 })
    const pool = { size: 0, entries: [] as any[], connectAll: async (_s: any, count: number, _o: number, _slow?: any, _lobby?: number) => { pool.size = count }, running: true }
    const warmup = new WarmupScenario(pool as any)
    const result = await warmup.execute(ctx)
    assert.equal(pool.size, 60)
    assert.ok(result.detail.includes("60%"))
  })

  it("connects 60% for evidence profile (100k)", async () => {
    const ctx = mockCtx({ targetConnections: 100000, warmupSeconds: 1 })
    const pool = { size: 0, entries: [] as any[], connectAll: async (_s: any, count: number, _o: number, _slow?: any, _lobby?: number) => { pool.size = count }, running: true }
    const warmup = new WarmupScenario(pool as any)
    const result = await warmup.execute(ctx)
    assert.equal(pool.size, 60000)
    assert.ok(result.detail.includes("60000"))
  })
})

describe("ConnectionSurgeScenario (Defect 6)", () => {
  it("adds remaining 40% to reach target", async () => {
    const ctx = mockCtx({ targetConnections: 100 })
    const establishedState = { count: 60 }
    const entries: any[] = Array.from({ length: 60 }, (_, i) => ({
      id: i, matchId: "match-001",
      subscription: mockSubscription(),
      tracker: { lastSeq: 0, classify() { return { kind: "NEXT" } }, reset() {} },
      mode: "steady",
    }))
    // Override snapshot to return dynamic established count
    const origSnapshot = ctx.metrics.snapshot.bind(ctx.metrics)
    ctx.metrics = {
      ...ctx.metrics,
      snapshot() {
        const s = origSnapshot()
        s.connections_established = establishedState.count
        return s
      },
    }
    const pool = {
      size: 60,
      entries,
      connectAll: async (_s: any, count: number, offset: number, _slow?: any, _lobby?: number) => {
        for (let i = 0; i < count; i++) {
          entries.push({ id: offset + i, matchId: "match-001", subscription: mockSubscription(), tracker: { lastSeq: 0, classify() { return { kind: "NEXT" } }, reset() {} }, mode: "steady" })
        }
        establishedState.count += count
        pool.size = entries.length
        // Advance clock so batch elapsed > 0 (surge calculates rates from clock delta)
        ;(ctx.clock as any).advance(10)
      },
      running: true,
    }
    const surge = new ConnectionSurgeScenario(pool as any)
    const result = await surge.execute(ctx)
    assert.equal(pool.size, 100)
    assert.ok(result.passed, result.detail)
  })

  it("skips when already at target", async () => {
    const ctx = mockCtx({ targetConnections: 60 })
    const pool = {
      size: 60,
      entries: Array.from({ length: 60 }, (_, i) => ({ id: i, matchId: "match-001", subscription: mockSubscription(), tracker: { lastSeq: 0, classify() { return { kind: "NEXT" } }, reset() {} }, mode: "steady" })),
      connectAll: async () => {},
      running: true,
    }
    const surge = new ConnectionSurgeScenario(pool as any)
    const result = await surge.execute(ctx)
    assert.ok(result.passed)
    assert.ok(result.detail.includes("skipped"))
  })
})
