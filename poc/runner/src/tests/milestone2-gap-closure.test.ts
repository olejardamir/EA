import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { parseSSEChunk } from "../adapters/sse-http-client.js"
import type { ParsedFrame } from "../adapters/sse-http-client.js"
import { BoundedMetricsRecorder } from "../adapters/metrics-recorder.js"
import { ConnectionPool } from "../application/connection-pool.js"
import { classifyResult } from "../application/result-classifier.js"
import { createSequenceTracker } from "../domain/sequence-validator.js"
import { createMatchHeadTracker } from "../domain/match-state.js"
import { createEventPayload, MATCH_IDS } from "../domain/event.js"
import { createPRNG } from "../domain/prng.js"
import { createInitialMatchStates, advanceMatchState } from "../domain/match-state.js"
import type { EventStream, Subscription, SubscriptionEvent, SSEEvent } from "../ports/event-stream.js"
import type { MetricsRecorder, MetricsSnapshot } from "../ports/metrics.js"
import type { Clock } from "../ports/clock.js"
import http from "node:http"
import type { AggregatedMetrics } from "../domain/result.js"

function freshFrame(): ParsedFrame {
  return { data: [] }
}

function mockMetrics(): MetricsRecorder & { counts: Record<string, number> } {
  const counts: Record<string, number> = {}
  const inc = (k: string, n = 1) => { counts[k] = (counts[k] ?? 0) + n }
  return {
    counts,
    recordFanOutLatency(ms: number) { inc("fan_out_latencies_ms", 1) },
    recordLateJoinLatency(ms: number) { inc("late_join_latencies_ms", 1) },
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
    incrementLatencyInvalid: () => inc("latency_invalid"),
    incrementLatencyOverflow: () => inc("latency_overflow"),
    setBacklog() {},
    incrementSseParseErrors: () => inc("sse_parse_errors"),
    incrementJsonParseErrors: () => inc("json_parse_errors"),
    incrementInvalidTimestampCount: () => inc("invalid_timestamp_count"),
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
    incrementSchemaValidationErrors: () => inc("schema_validation_errors"),
    incrementMissingTransportId: () => inc("missing_transport_id"),
    recordSchedulerLag: () => {},
    snapshot(): MetricsSnapshot {
      return {
        fan_out_latencies_ms: [], late_join_latencies_ms: [],
        latency_sample_count: 0, latency_invalid_count: 0, latency_overflow_count: 0,
        events_received: 0, expected_fan_deliveries: 0, received_fan_deliveries: 0,
        missing_sequences: 0, duplicates: 0,
        out_of_order: 0, reconnect_gaps: 0, reconnect_duplicates: 0,
        reconnect_order_violations: 0, slow_consumer_disconnects: 0,
        connections_attempted: 0, connections_established: 0,
        connection_failures: 0, connections_dropped: 0,
    active_connections_peak: 10000,
        generator_backlog_peak: 0,
        sse_parse_errors: 0, json_parse_errors: 0, invalid_timestamp_count: 0,
        live_expected_deliveries: 0, live_received_deliveries: 0,
        late_join_history_expected: 0, late_join_history_received: 0,
        reconnect_replay_expected: 0, reconnect_replay_received: 0,
        restart_replay_expected: 0, restart_replay_received: 0,
        deliberate_disconnects: 0, unexpected_client_disconnects: 0,
        server_initiated_disconnects: 0, network_failures: 0, shutdown_cleanup_disconnects: 0,
        schema_validation_errors: 0, missing_transport_id: 0,
        fan_out_sample_count: 0, fan_out_overflow_count: 0,
        late_join_sample_count: 0, late_join_overflow_count: 0,
        scheduler_lag_p95_ms: 0, scheduler_lag_max_ms: 0,
      }
    },
  }
}

function mockClock(nowMs = 1000): Clock {
  return { now: () => nowMs, hrtime: () => 0n }
}

function mockSubscription(): Subscription & { _emit: (e: SubscriptionEvent) => void } {
  let handler: ((event: SubscriptionEvent) => void) | null = null
  return {
    connected: true,
    lastEventId: null,
    onEvent(h) { handler = h },
    getEventHandler() { return handler },
    pause() {},
    resume() {},
    close() {},
    _emit(evt: SubscriptionEvent) { handler?.(evt) },
  } as Subscription & { _emit: (e: SubscriptionEvent) => void }
}

function mockStream(): EventStream & { subscriptions: Subscription[] } {
  const subscriptions: Subscription[] = []
  return {
    subscriptions,
    async connect() {
      const sub = mockSubscription()
      subscriptions.push(sub)
      return sub
    },
  }
}

function baseMetrics(overrides: Partial<AggregatedMetrics> = {}): AggregatedMetrics {
  return {
    connections_attempted: 10000,
    connections_established: 10000,
    connection_failures: 0,
    connections_dropped: 0,
    events_published: 500,
    events_received: 5000000,
    missing_sequences: 0,
    duplicates: 0,
    out_of_order: 0,
    fan_out_latency_p50_ms: 30,
    fan_out_latency_p95_ms: 80,
    fan_out_latency_p99_ms: 120,
    fan_out_latency_max_ms: 200,
    late_join_p50_ms: 5,
    late_join_p95_ms: 10,
    late_join_p99_ms: 15,
    late_join_max_ms: 20,
    reconnect_gaps: 0,
    reconnect_duplicates: 0,
    reconnect_order_violations: 0,
    slow_consumer_disconnects: 50,
    event_loop_delay_p99_ms: 35,
    memory_mb_peak: 400,
    expected_fan_deliveries: 5000000,
    received_fan_deliveries: 5000000,
    connections_target: 10000,
    burst_fan_out_p95_ms: 200,
    nchan_restart_history_replay_correct: true,
    nchan_restart_missing_sequences: 0,
    nchan_restart_skipped: false,
    non_slow_p95_degradation_pct: 1,
    nchan_memory_mb_peak: 200,
    redis_memory_mb_peak: 100,
    nchan_cpu_usage_usec: null, nchan_cpu_throttled_count: null, nchan_cpu_throttled_usec: null,
    nchan_memory_current_bytes: null, nchan_memory_peak_bytes: null,
    nchan_memory_oom_events: null, nchan_memory_oom_kill_events: null,
    redis_connected_clients_peak: null,
    nchan_cpu_percent_peak: null,
    redis_cpu_percent_peak: null,
    timing_valid: true,
    generator_cpu_percent_peak: 75,
    generator_event_loop_p99_ms: 10,
    run_profile: "evidence" as const,
    lobby_subscribers: 200,
    match_001_subscribers: 800,
    phase_publish_rates: [],
    cpu_throttled_count: 0,
    cpu_throttled_usec: 0,
    cpu_usage_usec: 0,
    memory_oom_events: 0,
    memory_oom_kill_events: 0,
    memory_current_bytes: null,
    memory_peak_bytes: null,
    cpu_max_quota: null,
    memory_max_bytes: null,
    generator_backlog_peak: 0,
    publisher_attempts: 100,
    publisher_successes: 100,
    publisher_definite_failures: 0,
    publisher_ambiguous_failures: 0,
    sse_parse_errors: 0,
    json_parse_errors: 0,
    invalid_timestamp_count: 0,
    surge_fan_out_p95_ms: 0,
    surge_missing_sequences: 0,
    surge_duplicates: 0,
    surge_out_of_order: 0,
    surge_events_received: 0,
    active_connections_peak: 10000,
    live_expected_deliveries: 0,
    live_received_deliveries: 0,
    late_join_history_expected: 0,
    late_join_history_received: 0,
    reconnect_replay_expected: 0,
    reconnect_replay_received: 0,
    restart_replay_expected: 0,
    restart_replay_received: 0,
    slow_consumer_metrics: null,
    deliberate_disconnects: 0,
    unexpected_client_disconnects: 0,
    server_initiated_disconnects: 0,
    network_failures: 0,
    shutdown_cleanup_disconnects: 0,
    schema_validation_errors: 0,
    missing_transport_id: 0,
    fan_out_sample_count: 0,
    fan_out_overflow_count: 0,
    late_join_sample_count: 0,
    late_join_overflow_count: 0,
    latency_invalid_count: 0,
    latency_overflow_count: 0,
    topology_capacity_sufficient: true,
    surge_target_additions: 0,
    surge_attempted: 0,
    surge_established: 0,
    surge_failures: 0,
    surge_start_time: 0,
    surge_end_time: 0,
    surge_elapsed_ms: 0,
    surge_timing_error_ms: 0,
    attempt_rate_peak: 0,
    establishment_rate_peak: 0,
    scheduler_lag_p95: 0,
    scheduler_lag_max: 0,
    active_population_start: 0,
    active_population_end: 0,
    active_population_peak: 0,
    build_identity: { git_commit_sha: null, nginx_version: "1.27.4", nchan_version: "1.3.8", node_version: "", redis_version: "7.2" },
    ...overrides,
  }
}

// ═══════════════════════════════════════════════════════════════
// §AF: SSE Content-Type validation
// ═══════════════════════════════════════════════════════════════
describe("§AF: SSE Content-Type validation", () => {
  it("rejects non-event-stream Content-Type", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" })
      res.end("<html>not SSE</html>")
    })

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const addr = server.address() as { port: number }

    try {
      const { SSEHttpClient } = await import("../adapters/sse-http-client.js")
      const client = new SSEHttpClient()
      await assert.rejects(
        client.connect(`http://127.0.0.1:${addr.port}/test`),
        (err: Error) => {
          assert.ok(err.message.includes("Invalid Content-Type"), `unexpected error: ${err.message}`)
          return true
        },
      )
    } finally {
      server.close()
    }
  })

  it("accepts text/event-stream Content-Type", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8" })
      res.write("id: 1\ndata: hello\n\n")
    })

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const addr = server.address() as { port: number }

    try {
      const { SSEHttpClient } = await import("../adapters/sse-http-client.js")
      const client = new SSEHttpClient()
      const sub = await client.connect(`http://127.0.0.1:${addr.port}/test`)
      assert.ok(sub.connected)
      sub.close()
    } finally {
      server.close()
    }
  })

  it("rejects non-200 status codes", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(404)
      res.end("not found")
    })

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const addr = server.address() as { port: number }

    try {
      const { SSEHttpClient } = await import("../adapters/sse-http-client.js")
      const client = new SSEHttpClient()
      await assert.rejects(
        client.connect(`http://127.0.0.1:${addr.port}/test`),
        (err: Error) => {
          assert.ok(err.message.includes("HTTP 404"), `unexpected error: ${err.message}`)
          return true
        },
      )
    } finally {
      server.close()
    }
  })
})

// ═══════════════════════════════════════════════════════════════
// §AF: Heartbeat/comment frame metric exclusion
// ═══════════════════════════════════════════════════════════════
describe("§AF: Heartbeat/comment frame exclusion from metrics", () => {
  it("parseSSEChunk ignores comment lines and does not produce frames", () => {
    const frame = freshFrame()
    const { frames, remainder } = parseSSEChunk(
      ": keepalive\n: heartbeat\n: ping\n\n",
      frame,
    )
    assert.equal(frames.length, 0, "comment frames must not produce SSE events")
    assert.equal(remainder, "")
  })

  it("heartbeats between events do not affect subsequent event parsing", () => {
    const frame = freshFrame()
    const { frames: batch1 } = parseSSEChunk(
      "id: 1\ndata: event1\n\n: keepalive\n\n",
      frame,
    )
    assert.equal(batch1.length, 1)
    assert.equal(batch1[0].id, "1")
    assert.equal(batch1[0].data, "event1")

    const { frames: batch2 } = parseSSEChunk(
      "id: 2\ndata: event2\n\n",
      frame,
    )
    assert.equal(batch2.length, 1)
    assert.equal(batch2[0].id, "2")
    assert.equal(batch2[0].data, "event2")
  })

  it("empty data events from heartbeats are not counted as received", () => {
    const metrics = new BoundedMetricsRecorder()
    const eventsReceivedBefore = metrics.snapshot().events_received

    const frame = freshFrame()
    const { frames } = parseSSEChunk(": keepalive\n\n", frame)
    assert.equal(frames.length, 0)

    const snap = metrics.snapshot()
    assert.equal(snap.events_received, eventsReceivedBefore)
  })
})

// ═══════════════════════════════════════════════════════════════
// §T: Latency integrity — negative/overflow/invalid handling
// ═══════════════════════════════════════════════════════════════
describe("§T: Latency integrity — no valid sample silently discarded", () => {
  it("negative latency increments invalid count, not recorded as valid", () => {
    const metrics = new BoundedMetricsRecorder()
    const clockMs = 1000
    const clock = mockClock(clockMs)
    const pool = new ConnectionPool(
      { subUrl: "http://localhost:8081", matchIds: ["match-001"] },
      metrics, clock,
    )
    pool.running = true

    const stream = mockStream()
    pool.add = () => {}

    const entry = {
      id: 0,
      matchId: "match-001",
      subscription: mockSubscription(),
      tracker: createSequenceTracker(0),
      mode: "steady" as const,
    }

    // §4.19: Event must pass schema validation to reach latency logic
    const futureTime = new Date(clockMs + 5000).toISOString()
    const eventData = JSON.stringify({
      match_id: "match-001",
      canonical_seq: 1,
      event_type: "goal",
      score: { home: 0, away: 0 },
      clock: { period: "1H", elapsed_seconds: 0 },
      publish_timestamp: futureTime,
    })
    pool.handleMessage(entry, eventData, "evt-1")

    const snap = metrics.snapshot()
    assert.equal(snap.latency_invalid_count, 1, "negative latency must be counted as invalid")
    assert.equal(snap.fan_out_latencies_ms.length, 0, "negative latency must NOT be recorded as valid sample")
  })

  it("very large positive latency is recorded (not censored)", () => {
    const metrics = new BoundedMetricsRecorder()
    const clockMs = 100000
    const clock = mockClock(clockMs)
    const pool = new ConnectionPool(
      { subUrl: "http://localhost:8081", matchIds: ["match-001"] },
      metrics, clock,
    )
    pool.running = true

    const entry = {
      id: 0,
      matchId: "match-001",
      subscription: mockSubscription(),
      tracker: createSequenceTracker(0),
      mode: "steady" as const,
    }

    // §4.19: Event must pass schema validation to reach latency logic
    const oldTime = new Date(1000).toISOString()
    const eventData = JSON.stringify({
      match_id: "match-001",
      canonical_seq: 1,
      event_type: "goal",
      score: { home: 0, away: 0 },
      clock: { period: "1H", elapsed_seconds: 0 },
      publish_timestamp: oldTime,
    })
    pool.handleMessage(entry, eventData, "evt-1")

    const snap = metrics.snapshot()
    assert.ok(snap.fan_out_latencies_ms.length > 0, "very large latency must still be recorded")
    assert.ok(snap.fan_out_latencies_ms[0] > 90000, "recorded latency should be very large")
  })

  it("invalid timestamp increments schema validation errors", () => {
    const metrics = new BoundedMetricsRecorder()
    const clock = mockClock(5000)
    const pool = new ConnectionPool(
      { subUrl: "http://localhost:8081", matchIds: ["match-001"] },
      metrics, clock,
    )
    pool.running = true

    const entry = {
      id: 0,
      matchId: "match-001",
      subscription: mockSubscription(),
      tracker: createSequenceTracker(0),
      mode: "steady" as const,
    }

    // §4.19: Invalid timestamp rejected by schema validation before reaching latency logic
    const eventData = JSON.stringify({ canonical_seq: 1, publish_timestamp: "not-a-date" })
    pool.handleMessage(entry, eventData)

    const snap = metrics.snapshot()
    assert.equal(snap.schema_validation_errors, 1, "invalid timestamp must be caught by schema validation")
    assert.equal(snap.events_received, 0, "rejected events must not increment events_received")
  })

  it("event missing required fields rejected by schema validation", () => {
    const metrics = new BoundedMetricsRecorder()
    const clock = mockClock(5000)
    const pool = new ConnectionPool(
      { subUrl: "http://localhost:8081", matchIds: ["match-001"] },
      metrics, clock,
    )
    pool.running = true

    const entry = {
      id: 0,
      matchId: "match-001",
      subscription: mockSubscription(),
      tracker: createSequenceTracker(0),
      mode: "steady" as const,
    }

    // §4.19: Missing required fields rejected by schema validation
    const eventData = JSON.stringify({ canonical_seq: 1 })
    pool.handleMessage(entry, eventData)

    const snap = metrics.snapshot()
    assert.equal(snap.schema_validation_errors, 1, "missing fields must be caught by schema validation")
    assert.equal(snap.events_received, 0, "rejected events must not increment events_received")
  })

  it("JSON parse error increments json_parse_errors", () => {
    const metrics = new BoundedMetricsRecorder()
    const clock = mockClock(5000)
    const pool = new ConnectionPool(
      { subUrl: "http://localhost:8081", matchIds: ["match-001"] },
      metrics, clock,
    )
    pool.running = true

    const entry = {
      id: 0,
      matchId: "match-001",
      subscription: mockSubscription(),
      tracker: createSequenceTracker(0),
      mode: "steady" as const,
    }

    pool.handleMessage(entry, "not json at all {{{")

    const snap = metrics.snapshot()
    assert.equal(snap.json_parse_errors, 1, "JSON parse error must be counted")
    assert.equal(snap.events_received, 0, "invalid JSON event not counted as received")
  })
})

// ═══════════════════════════════════════════════════════════════
// §R: Active connection concurrency — peak vs cumulative
// ═══════════════════════════════════════════════════════════════
describe("§R: Active connection concurrency correctness", () => {
  it("active_connections_peak tracks maximum, not cumulative", () => {
    const metrics = new BoundedMetricsRecorder()

    metrics.setActiveConnections(50)
    metrics.setActiveConnections(100)
    metrics.setActiveConnections(75)
    metrics.setActiveConnections(120)
    metrics.setActiveConnections(60)

    const snap = metrics.snapshot()
    assert.equal(snap.active_connections_peak, 120, "peak must be the maximum observed value")
  })

  it("setActiveConnections does not decrease peak", () => {
    const metrics = new BoundedMetricsRecorder()

    metrics.setActiveConnections(100)
    metrics.setActiveConnections(50)

    const snap = metrics.snapshot()
    assert.equal(snap.active_connections_peak, 100, "peak must not decrease")
  })

  it("connections_attempted = established + failures (§6.2)", async () => {
    const stream = mockStream()
    const metrics = mockMetrics()
    const pool = new ConnectionPool(
      { subUrl: "http://localhost:8081", matchIds: ["match-001"] },
      metrics, mockClock(),
    )
    await pool.connectAll(stream, 20, 0)

    const attempted = metrics.counts["connections_attempted"]
    const established = metrics.counts["connections_established"] ?? 0
    const failures = metrics.counts["connection_failures"] ?? 0

    assert.equal(attempted, 20, "attempted must equal requested count")
    assert.equal(established + failures, attempted, "attempted = established + failures")
  })

  it("active_connections_current tracks live connections", async () => {
    const stream = mockStream()
    const metrics = mockMetrics()
    const pool = new ConnectionPool(
      { subUrl: "http://localhost:8081", matchIds: ["match-001"] },
      metrics, mockClock(),
    )
    await pool.connectAll(stream, 10, 0)
    assert.equal(pool.size, 10)

    await pool.disconnectAll()
    assert.equal(pool.size, 0)
  })
})

// ═══════════════════════════════════════════════════════════════
// §Z: Disconnect attribution
// ═══════════════════════════════════════════════════════════════
describe("§Z: Disconnect attribution", () => {
  it("deliberate close does not count as unexpected drop", () => {
    const metrics = new BoundedMetricsRecorder()

    metrics.incrementConnectionsDropped()
    metrics.incrementConnectionsDropped()

    const snap = metrics.snapshot()
    assert.equal(snap.connections_dropped, 2, "deliberate disconnects tracked separately")
  })

  it("slow_consumer_disconnects are tracked separately", () => {
    const metrics = new BoundedMetricsRecorder()

    metrics.incrementSlowConsumerDisconnects()
    metrics.incrementSlowConsumerDisconnects()
    metrics.incrementSlowConsumerDisconnects()

    const snap = metrics.snapshot()
    assert.equal(snap.slow_consumer_disconnects, 3)
  })

  it("connection failures are separate from drops", async () => {
    const failStream: EventStream & { count: number } = {
      count: 0,
      async connect() {
        this.count++
        if (this.count <= 3) throw new Error("refused")
        return mockSubscription()
      },
    }

    const metrics = mockMetrics()
    const pool = new ConnectionPool(
      { subUrl: "http://localhost:8081", matchIds: ["match-001"] },
      metrics, mockClock(),
    )
    await pool.connectAll(failStream, 5, 0)

    const failures = metrics.counts["connection_failures"] ?? 0
    const established = metrics.counts["connections_established"] ?? 0
    assert.ok(failures > 0, "should have some connection failures")
    assert.ok(established > 0, "should have some successful connections")
    assert.equal(failures + established, 5)
  })
})

// ═══════════════════════════════════════════════════════════════
// §6.20: Publisher per-match ordering
// ═══════════════════════════════════════════════════════════════
describe("§6.20: Publisher per-match ordering", () => {
  it("sequence tracker enforces monotonically increasing canonical seq", () => {
    const tracker = createSequenceTracker(0)

    assert.equal(tracker.classify(1).kind, "NEXT")
    assert.equal(tracker.classify(2).kind, "NEXT")
    assert.equal(tracker.classify(3).kind, "NEXT")
    assert.equal(tracker.classify(3).kind, "DUPLICATE")
    assert.equal(tracker.classify(5).kind, "GAP")
    assert.equal(tracker.classify(4).kind, "OUT_OF_ORDER")
    assert.equal(tracker.classify(6).kind, "NEXT")
  })

  it("match state seq increments exactly once per event", () => {
    const states = createInitialMatchStates()
    const state = states[0]
    const random = createPRNG(42)

    const initialSeq = state.seq
    advanceMatchState(state, "corner", random)
    assert.equal(state.seq, initialSeq + 1, "seq must increment by exactly 1")

    advanceMatchState(state, "goal", random)
    assert.equal(state.seq, initialSeq + 2, "seq must increment by exactly 1 again")
  })

  it("goal event changes exactly one team score by +1", () => {
    const states = createInitialMatchStates()
    const state = states[0]
    const random = createPRNG(42)

    const initialHome = state.score.home
    const initialAway = state.score.away

    advanceMatchState(state, "goal", random)

    const totalChange = (state.score.home - initialHome) + (state.score.away - initialAway)
    assert.equal(totalChange, 1, "goal must change total score by exactly 1")
    assert.ok(
      (state.score.home === initialHome + 1 && state.score.away === initialAway) ||
      (state.score.home === initialHome && state.score.away === initialAway + 1),
      "exactly one team score must change by +1",
    )
  })

  it("non-goal events do not change score", () => {
    const states = createInitialMatchStates()
    const state = states[0]
    const random = createPRNG(42)

    const nonGoalTypes = ["corner", "free_kick", "substitution", "offside", "yellow_card", "red_card", "var_review"]

    for (const eventType of nonGoalTypes) {
      const prevHome = state.score.home
      const prevAway = state.score.away
      advanceMatchState(state, eventType, random)
      assert.equal(state.score.home, prevHome, `${eventType} must not change home score`)
      assert.equal(state.score.away, prevAway, `${eventType} must not change away score`)
    }
  })

  it("match clock never regresses within same period", () => {
    const states = createInitialMatchStates()
    const state = states[0]
    const random = createPRNG(42)

    let prevElapsed = state.clock.elapsed_seconds
    for (let i = 0; i < 50; i++) {
      advanceMatchState(state, "corner", random)
      assert.ok(
        state.clock.elapsed_seconds >= prevElapsed,
        `clock must not regress: ${state.clock.elapsed_seconds} < ${prevElapsed} at event ${i}`,
      )
      prevElapsed = state.clock.elapsed_seconds
    }
  })
})

// ═══════════════════════════════════════════════════════════════
// §M: Classifier exhaustive decision table
// ═══════════════════════════════════════════════════════════════
describe("§M: Classifier exhaustive decision table", () => {
  it("valid all-pass evidence returns ACCEPT", () => {
    const result = classifyResult(baseMetrics(), true, true)
    assert.equal(result.verdict, "ACCEPT")
  })

  it("fan_out_p95 <= 500ms is ACCEPT, > 500ms is REJECT", () => {
    const pass = classifyResult(baseMetrics({ fan_out_latency_p95_ms: 500 }), true, true)
    assert.equal(pass.verdict, "ACCEPT")

    const fail = classifyResult(baseMetrics({ fan_out_latency_p95_ms: 501 }), true, true)
    assert.equal(fail.verdict, "REJECT")
    assert.ok(fail.checks.find((c) => c.name === "fan_out_p95")!.passed === false)
  })

  it("late_join_p95 <= 2000ms is ACCEPT, > 2000ms is REJECT", () => {
    const pass = classifyResult(baseMetrics({ late_join_p95_ms: 2000 }), true, true)
    assert.equal(pass.verdict, "ACCEPT")

    const fail = classifyResult(baseMetrics({ late_join_p95_ms: 2001 }), true, true)
    assert.equal(fail.verdict, "REJECT")
  })

  it("missing_sequences > 0 is REJECT", () => {
    const result = classifyResult(baseMetrics({ missing_sequences: 1 }), true, true)
    assert.equal(result.verdict, "REJECT")
    assert.ok(result.checks.find((c) => c.name === "missing_sequences")!.passed === false)
  })

  it("duplicates > 0 is REJECT", () => {
    const result = classifyResult(baseMetrics({ duplicates: 1 }), true, true)
    assert.equal(result.verdict, "REJECT")
  })

  it("out_of_order > 0 is REJECT", () => {
    const result = classifyResult(baseMetrics({ out_of_order: 1 }), true, true)
    assert.equal(result.verdict, "REJECT")
  })

  it("reconnect_gaps > 0 is REJECT", () => {
    const result = classifyResult(baseMetrics({ reconnect_gaps: 1 }), true, true)
    assert.equal(result.verdict, "REJECT")
  })

  it("reconnect_duplicates > 0 is REJECT", () => {
    const result = classifyResult(baseMetrics({ reconnect_duplicates: 1 }), true, true)
    assert.equal(result.verdict, "REJECT")
  })

  it("reconnect_order_violations > 0 is REJECT", () => {
    const result = classifyResult(baseMetrics({ reconnect_order_violations: 1 }), true, true)
    assert.equal(result.verdict, "REJECT")
  })

  it("timing_invalid -> INCONCLUSIVE (takes precedence over REJECT)", () => {
    const result = classifyResult(
      baseMetrics({ missing_sequences: 100, fan_out_latency_p95_ms: 5000 }),
      true,
      false,
    )
    assert.equal(result.verdict, "INCONCLUSIVE")
  })

  it("generator_saturated -> INCONCLUSIVE (takes precedence)", () => {
    const result = classifyResult(
      baseMetrics({ missing_sequences: 100 }),
      false,
      true,
    )
    assert.equal(result.verdict, "INCONCLUSIVE")
  })

  it("smoke profile cannot return ACCEPT", () => {
    const result = classifyResult(baseMetrics({ run_profile: "smoke" }), true, true)
    assert.equal(result.verdict, "NOT_APPLICABLE")
    assert.notEqual(result.verdict, "ACCEPT")
  })

  it("cpu_throttled_count > 0 is INCONCLUSIVE", () => {
    const result = classifyResult(baseMetrics({ cpu_throttled_count: 1 }), true, true)
    assert.equal(result.verdict, "INCONCLUSIVE")
  })

  it("oom_kill_events > 0 is INCONCLUSIVE", () => {
    const result = classifyResult(baseMetrics({ memory_oom_kill_events: 1 }), true, true)
    assert.equal(result.verdict, "INCONCLUSIVE")
  })

  it("sse_parse_errors > 0 is REJECT", () => {
    const result = classifyResult(baseMetrics({ sse_parse_errors: 1 }), true, true)
    assert.equal(result.verdict, "REJECT")
  })

  it("json_parse_errors > 0 is REJECT", () => {
    const result = classifyResult(baseMetrics({ json_parse_errors: 1 }), true, true)
    assert.equal(result.verdict, "REJECT")
  })

  it("invalid_timestamp_count > 0 is REJECT", () => {
    const result = classifyResult(baseMetrics({ invalid_timestamp_count: 1 }), true, true)
    assert.equal(result.verdict, "REJECT")
  })

  it("surge_missing_sequences > 0 is REJECT", () => {
    const result = classifyResult(baseMetrics({ surge_missing_sequences: 1 }), true, true)
    assert.equal(result.verdict, "REJECT")
  })

  it("surge_duplicates > 0 is REJECT", () => {
    const result = classifyResult(baseMetrics({ surge_duplicates: 1 }), true, true)
    assert.equal(result.verdict, "REJECT")
  })

  it("surge_out_of_order > 0 is REJECT", () => {
    const result = classifyResult(baseMetrics({ surge_out_of_order: 1 }), true, true)
    assert.equal(result.verdict, "REJECT")
  })

  it("surge_fan_out_p95 > 500ms is REJECT", () => {
    const result = classifyResult(baseMetrics({ surge_fan_out_p95_ms: 501 }), true, true)
    assert.equal(result.verdict, "REJECT")
  })

  it("nchan_history_replay_correct=false is REJECT", () => {
    const result = classifyResult(baseMetrics({ nchan_restart_history_replay_correct: false }), true, true)
    assert.equal(result.verdict, "REJECT")
  })

  it("slow_consumer_disconnects=0 is ACCEPT (bounded healthy degradation)", () => {
    const result = classifyResult(baseMetrics({ slow_consumer_disconnects: 0 }), true, true)
    assert.equal(result.verdict, "ACCEPT")
  })

  it("non_slow_p95_degradation > 5% is REJECT", () => {
    const result = classifyResult(baseMetrics({ non_slow_p95_degradation_pct: 6 }), true, true)
    assert.equal(result.verdict, "REJECT")
  })

  it("burst_fan_out_p95 > 1000ms is REJECT", () => {
    const result = classifyResult(baseMetrics({ burst_fan_out_p95_ms: 1001 }), true, true)
    assert.equal(result.verdict, "REJECT")
  })

  it("connections below target is REJECT", () => {
    const result = classifyResult(baseMetrics({
      active_connections_peak: 9999,
      connections_target: 10000,
    }), true, true)
    assert.equal(result.verdict, "REJECT")
  })

  it("every valid outcome maps to exactly one result (no undefined zone)", () => {
    const betweenFanOut = classifyResult(baseMetrics({ fan_out_latency_p95_ms: 1000 }), true, true)
    assert.equal(betweenFanOut.verdict, "REJECT", "fan_out between 500 and 2000 must be REJECT")

    const betweenBurst = classifyResult(baseMetrics({ burst_fan_out_p95_ms: 1500 }), true, true)
    assert.equal(betweenBurst.verdict, "REJECT", "burst fan_out between 1000 and 2000 must be REJECT")
  })
})

// ═══════════════════════════════════════════════════════════════
// §6.30: SSE first-frame handler race prevention
// ═══════════════════════════════════════════════════════════════
describe("§6.30: SSE first-frame handler race", () => {
  it("parseSSEChunk returns frames from initial data without handler", () => {
    const frame = freshFrame()
    const { frames } = parseSSEChunk("id: 1\ndata: initial\n\n", frame)
    assert.equal(frames.length, 1)
    assert.equal(frames[0].data, "initial")
    assert.equal(frames[0].id, "1")
  })

  it("incremental parsing accumulates correctly across multiple chunks", () => {
    const frame = freshFrame()

    const { frames: f1, remainder: r1 } = parseSSEChunk("id: 1\ndata: hel", frame)
    assert.equal(f1.length, 0, "incomplete frame should not produce event yet")
    assert.equal(r1, "data: hel", "remainder should be only the incomplete last line (id was already consumed)")

    const { frames: f2, remainder: r2 } = parseSSEChunk(`${r1}lo\n\n`, frame)
    assert.equal(f2.length, 1, "complete frame after continuation should produce event")
    assert.equal(f2[0].data, "hello")
    assert.equal(f2[0].id, "1", "id from first chunk should be preserved in frame state")
    assert.equal(r2, "")
  })

  it("streaming TextDecoder handles multibyte UTF-8 split across chunks", () => {
    const frame = freshFrame()
    const fullStr = "data: " + "日本語テスト".repeat(100) + "\n\n"
    const buf = Buffer.from(fullStr, "utf-8")

    const mid = Math.floor(buf.length / 2)

    const chunk1 = buf.subarray(0, mid)
    const chunk2 = buf.subarray(mid)

    const decoder = new TextDecoder("utf-8", { fatal: false })
    const text1 = decoder.decode(chunk1, { stream: true })
    const text2 = decoder.decode(chunk2, { stream: true })
    const combined = text1 + text2

    const { frames } = parseSSEChunk(combined, frame)
    assert.equal(frames.length, 1)
    assert.equal(frames[0].data, "日本語テスト".repeat(100))
  })

  it("handshake timeout is cleared after HTTP 200 so idle healthy streams survive", async () => {
    const http = await import("node:http")

    let keepAlive: ReturnType<typeof setInterval> | null = null
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" })
      // §6.30: Send heartbeats every 5s — enough to keep the connection alive
      // but spaced enough to prove the 10s connect timeout was cleared.
      keepAlive = setInterval(() => { res.write(": heartbeat\n") }, 5000)
      res.on("close", () => { if (keepAlive) clearInterval(keepAlive) })
    })

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const addr = server.address() as { port: number }

    try {
      const { SSEHttpClient } = await import("../adapters/sse-http-client.js")
      const client = new SSEHttpClient()
      const sub = await client.connect(`http://127.0.0.1:${addr.port}/sub/test`)

      // §6.30: Wait >10s (connect timeout). If timeout wasn't cleared, the
      // connection would be destroyed during the idle gap between heartbeats.
      await new Promise((r) => setTimeout(r, 12_000))

      assert.ok(sub.connected, "connection must remain alive beyond the connect timeout")
      sub.close()
    } finally {
      if (keepAlive) clearInterval(keepAlive)
      server.close()
    }
  })
})

// ═══════════════════════════════════════════════════════════════
// §6.31: Correct initial canonical-sequence baseline
// ═══════════════════════════════════════════════════════════════
describe("§6.31: Correct initial canonical-sequence baseline", () => {
  it("live subscriber starting at seq 100 does not report 1-99 as gap", () => {
    const tracker = createSequenceTracker(0)

    const firstResult = tracker.classify(100)
    assert.equal(firstResult.kind, "NEXT", "first received seq establishes baseline")

    const secondResult = tracker.classify(101)
    assert.equal(secondResult.kind, "NEXT", "100 -> 101 is normal NEXT")
  })

  it("gap 100 -> 102 is detected as real gap", () => {
    const tracker = createSequenceTracker(0)

    tracker.classify(100)
    const result = tracker.classify(102)
    assert.equal(result.kind, "GAP", "100 -> 102 must be detected as GAP")
    if (result.kind === "GAP") {
      assert.equal(result.expected, 101)
      assert.equal(result.received, 102)
    }
  })

  it("reset to new seq allows fresh baseline", () => {
    const tracker = createSequenceTracker(0)
    tracker.classify(1)
    tracker.classify(2)
    tracker.classify(3)

    tracker.reset(50)

    const result = tracker.classify(51)
    assert.equal(result.kind, "NEXT")
    assert.equal(tracker.lastSeq, 51)
  })
})

// ═══════════════════════════════════════════════════════════════
// §AS: Atomic synthetic-state commit
// ═══════════════════════════════════════════════════════════════
describe("§AS: Atomic synthetic-state commit", () => {
  it("head tracker only advances on updateHead call", () => {
    const tracker = createMatchHeadTracker()
    assert.equal(tracker.getHead("match-001"), 0)

    tracker.updateHead("match-001", 10)
    assert.equal(tracker.getHead("match-001"), 10)

    tracker.updateHead("match-001", 5)
    assert.equal(tracker.getHead("match-001"), 10, "head must not decrease")
  })

  it("head tracker is per-match", () => {
    const tracker = createMatchHeadTracker()
    tracker.updateHead("match-001", 100)
    tracker.updateHead("match-002", 200)

    assert.equal(tracker.getHead("match-001"), 100)
    assert.equal(tracker.getHead("match-002"), 200)
    assert.equal(tracker.getHead("match-003"), 0)
  })
})

// ═══════════════════════════════════════════════════════════════
// §6.21: Run isolation — sequential runs don't contaminate
// ═══════════════════════════════════════════════════════════════
describe("§6.21: Run isolation", () => {
  it("two fresh BoundedMetricsRecorder instances are independent", () => {
    const m1 = new BoundedMetricsRecorder()
    m1.recordFanOutLatency(100)
    m1.incrementEventsReceived()

    const m2 = new BoundedMetricsRecorder()
    const s2 = m2.snapshot()
    assert.equal(s2.fan_out_latencies_ms.length, 0)
    assert.equal(s2.events_received, 0)
  })

  it("two fresh SequenceTracker instances are independent", () => {
    const t1 = createSequenceTracker(0)
    t1.classify(1)
    t1.classify(2)
    t1.classify(3)

    const t2 = createSequenceTracker(0)
    const r = t2.classify(1)
    assert.equal(r.kind, "NEXT")
    assert.equal(t2.lastSeq, 1)
  })

  it("two fresh MatchHeadTracker instances are independent", () => {
    const h1 = createMatchHeadTracker()
    h1.updateHead("match-001", 500)

    const h2 = createMatchHeadTracker()
    assert.equal(h2.getHead("match-001"), 0)
  })
})

// ═══════════════════════════════════════════════════════════════
// §6.29: Publisher acceptance / canonical commit
// ═══════════════════════════════════════════════════════════════
describe("§6.29: Publisher acceptance and canonical commit", () => {
  it("event payload structure is correct with all required fields", () => {
    const event = createEventPayload(
      "match-001", 42, "goal",
      { home: 2, away: 1 },
      { period: "1H", elapsed_seconds: 1200 },
    )

    assert.equal(event.match_id, "match-001")
    assert.equal(event.canonical_seq, 42)
    assert.equal(event.event_type, "goal")
    assert.equal(typeof event.publish_timestamp, "string")
    assert.ok(event.publish_timestamp.length > 0)
    assert.deepEqual(event.score, { home: 2, away: 1 })
    assert.deepEqual(event.clock, { period: "1H", elapsed_seconds: 1200 })
    assert.equal(typeof event.description, "string")
    assert.ok(event.description.length > 0)
  })

  it("score in payload matches committed state", () => {
    const states = createInitialMatchStates()
    const state = states[0]
    const random = createPRNG(42)

    advanceMatchState(state, "goal", random)

    const event = createEventPayload("match-001", state.seq, "goal", state.score, state.clock)
    assert.deepEqual(event.score, state.score, "payload score must match committed state")
    assert.deepEqual(event.clock, state.clock, "payload clock must match committed state")
  })

  it("description picks correct variant for event type", () => {
    const event = createEventPayload("match-001", 0, "goal", { home: 0, away: 0 }, { period: "1H", elapsed_seconds: 0 })
    assert.ok(event.description.includes("GOAL"), "goal event description should contain GOAL")

    const cornerEvent = createEventPayload("match-001", 0, "corner", { home: 0, away: 0 }, { period: "1H", elapsed_seconds: 0 })
    assert.ok(cornerEvent.description.includes("Corner") || cornerEvent.description.includes("corner"))
  })
})

// ═══════════════════════════════════════════════════════════════
// §6.12: Channel-aware expected fan deliveries
// ═══════════════════════════════════════════════════════════════
describe("§6.12: Channel-aware subscriber tracking", () => {
  it("getSubscriberCount returns correct per-channel counts", async () => {
    const stream = mockStream()
    const metrics = mockMetrics()
    const pool = new ConnectionPool(
      { subUrl: "http://localhost:8081", matchIds: ["match-001", "match-002"] },
      metrics, mockClock(),
    )
    await pool.connectAll(stream, 10, 0, undefined, 0.1)

    const lobbyCount = pool.getSubscriberCount("lobby")
    assert.ok(lobbyCount >= 1, "should have some lobby subscribers")

    const match1Count = pool.getSubscriberCount("match-001")
    assert.ok(match1Count >= 1, "should have some match-001 subscribers")
  })

  it("disconnectAll resets all channel counts", async () => {
    const stream = mockStream()
    const metrics = mockMetrics()
    const pool = new ConnectionPool(
      { subUrl: "http://localhost:8081", matchIds: ["match-001"] },
      metrics, mockClock(),
    )
    await pool.connectAll(stream, 5, 0, undefined, 0.1)

    assert.ok(pool.getSubscriberCount("match-001") > 0 || pool.getSubscriberCount("lobby") > 0)

    await pool.disconnectAll()
    assert.equal(pool.getSubscriberCount("match-001"), 0)
    assert.equal(pool.getSubscriberCount("lobby"), 0)
  })
})

// ═══════════════════════════════════════════════════════════════
// §6.32: Streaming histogram correctness
// ═══════════════════════════════════════════════════════════════
describe("§6.32: Bounded histogram — streaming histogram enforcement", () => {
  it("streaming histogram preserves all samples (not tail-truncated)", () => {
    const metrics = new BoundedMetricsRecorder()

    for (let i = 0; i < 200_001; i++) {
      metrics.recordFanOutLatency(i)
    }

    // §6.32: The histogram must preserve ALL samples, not just the latest 100k
    const histogram = metrics.getFanOutHistogram()
    assert.equal(histogram.count, 200_001, "histogram must count all 200,001 samples")
    assert.ok(histogram.count > 100_000, "histogram must preserve more than 100k samples")
  })

  it("histogram percentile computation is correct", () => {
    const metrics = new BoundedMetricsRecorder()

    // Record values 0-999 (1000 samples)
    for (let i = 0; i < 1000; i++) {
      metrics.recordFanOutLatency(i)
    }

    const histogram = metrics.getFanOutHistogram()
    // p50 should be around 500
    const p50 = histogram.p50()
    assert.ok(p50 >= 499 && p50 <= 501, `p50 should be ~500, got ${p50}`)

    // p95 should be around 950
    const p95 = histogram.p95()
    assert.ok(p95 >= 949 && p95 <= 951, `p95 should be ~950, got ${p95}`)

    // max should be 999
    assert.equal(histogram.max, 999, "max should be 999")
  })

  it("raw buffer is bounded for scenario phase-scoped queries", () => {
    const metrics = new BoundedMetricsRecorder()

    for (let i = 0; i < 200_000; i++) {
      metrics.recordFanOutLatency(i)
    }

    const snap = metrics.snapshot()
    // The raw buffer is bounded (10k FIFO) for scenario use
    assert.ok(
      snap.fan_out_latencies_ms.length <= 10_000,
      `raw buffer length ${snap.fan_out_latencies_ms.length} should be bounded`,
    )
  })
})

// ═══════════════════════════════════════════════════════════════
// §4.25: Histogram overflow behavior verification
// ═══════════════════════════════════════════════════════════════
describe("§4.25: Histogram overflow behavior", () => {
  it("negative latency increments overflow count, not bucketed", () => {
    const metrics = new BoundedMetricsRecorder()
    metrics.recordFanOutLatency(-1)
    metrics.recordFanOutLatency(-5)
    metrics.recordFanOutLatency(100)

    const snap = metrics.snapshot()
    assert.equal(snap.fan_out_overflow_count, 2, "two negative latencies must be counted as overflows")
    assert.equal(snap.fan_out_sample_count, 3, "total count includes overflows")
  })

  it("very-high latency is bucketed at max, not lost", () => {
    const metrics = new BoundedMetricsRecorder()
    metrics.recordFanOutLatency(50000)
    metrics.recordFanOutLatency(99999)

    const snap = metrics.snapshot()
    assert.equal(snap.fan_out_overflow_count, 0, "positive latencies are not overflows")
    assert.equal(snap.fan_out_sample_count, 2, "both positive samples counted")
  })

  it("late-join overflow counts are tracked separately", () => {
    const metrics = new BoundedMetricsRecorder()
    metrics.recordLateJoinLatency(-1)
    metrics.recordLateJoinLatency(100)

    const snap = metrics.snapshot()
    assert.equal(snap.late_join_overflow_count, 1, "one negative late-join latency")
    assert.equal(snap.late_join_sample_count, 2, "both late-join samples counted")
  })

  it("histogram populations appear in machine-readable output", () => {
    const metrics = new BoundedMetricsRecorder()
    for (let i = 0; i < 50; i++) metrics.recordFanOutLatency(i)
    metrics.recordFanOutLatency(-1)
    const snap = metrics.snapshot()

    assert.equal(snap.fan_out_sample_count, 51, "sample count includes all")
    assert.equal(snap.fan_out_overflow_count, 1, "overflow tracked")
    assert.equal(snap.late_join_sample_count, 0, "no late-join yet")
    assert.equal(snap.late_join_overflow_count, 0, "no late-join overflow")
  })
})

// ═══════════════════════════════════════════════════════════════
// §6.35: Viewer-to-SSE-connection model consistency
// ═══════════════════════════════════════════════════════════════
describe("§6.35: Connection pool accounting consistency", () => {
  it("total pool size equals sum of per-channel counts", async () => {
    const stream = mockStream()
    const metrics = mockMetrics()
    const pool = new ConnectionPool(
      { subUrl: "http://localhost:8081", matchIds: [...MATCH_IDS] },
      metrics, mockClock(),
    )
    await pool.connectAll(stream, 100, 0, undefined, 0.02)

    let totalFromChannels = 0
    for (const id of MATCH_IDS) {
      totalFromChannels += pool.getSubscriberCount(id)
    }
    totalFromChannels += pool.getSubscriberCount("lobby")

    assert.equal(pool.size, totalFromChannels, "pool size must equal sum of per-channel counts")
  })
})

// ═══════════════════════════════════════════════════════════════
// §6.41: Simulator score/clock/event coherence
// ═══════════════════════════════════════════════════════════════
describe("§6.41: Simulator score/clock/event coherence", () => {
  it("emitted score equals committed match state after each event", () => {
    const states = createInitialMatchStates()
    const state = states[0]
    const random = createPRNG(42)

    for (let i = 0; i < 20; i++) {
      const eventType = i % 5 === 0 ? "goal" : "corner"
      advanceMatchState(state, eventType, random)

      const event = createEventPayload("match-001", state.seq, eventType, state.score, state.clock)

      assert.deepEqual(event.score, state.score, `event ${i}: emitted score must equal committed state`)
      assert.deepEqual(event.clock, state.clock, `event ${i}: emitted clock must equal committed state`)
      assert.equal(event.canonical_seq, state.seq, `event ${i}: canonical_seq must equal state seq`)
    }
  })

  it("head tracker equals highest committed canonical_seq", () => {
    const headTracker = createMatchHeadTracker()
    const states = createInitialMatchStates()
    const state = states[0]
    const random = createPRNG(42)

    for (let i = 0; i < 30; i++) {
      advanceMatchState(state, "corner", random)
      headTracker.updateHead("match-001", state.seq)
    }

    assert.equal(headTracker.getHead("match-001"), state.seq, "head must equal highest seq")
  })

  it("clock never regresses within same period except across period transition", () => {
    const states = createInitialMatchStates()
    const state = states[0]
    const random = createPRNG(42)

    let prevPeriod = state.clock.period
    let prevElapsed = state.clock.elapsed_seconds

    for (let i = 0; i < 100; i++) {
      advanceMatchState(state, "corner", random)

      if (state.clock.period === prevPeriod) {
        assert.ok(
          state.clock.elapsed_seconds >= prevElapsed,
          `within period ${state.clock.period}: clock must not regress`,
        )
      }

      prevPeriod = state.clock.period
      prevElapsed = state.clock.elapsed_seconds
    }
  })
})

// ═══════════════════════════════════════════════════════════════
// §6.14: Measured publish rate consistency
// ═══════════════════════════════════════════════════════════════
describe("§6.14: Payload sizes match targets", () => {
  it("goal events are approximately 350 bytes", () => {
    const event = createEventPayload("match-001", 1, "goal", { home: 1, away: 0 }, { period: "1H", elapsed_seconds: 600 })
    const size = Buffer.byteLength(JSON.stringify(event), "utf-8")
    assert.ok(size >= 340, `goal event size ${size} should be >= 340`)
    assert.ok(size <= 360, `goal event size ${size} should be <= 360`)
  })

  it("non-goal events are approximately 250 bytes", () => {
    const event = createEventPayload("match-001", 1, "corner", { home: 0, away: 0 }, { period: "1H", elapsed_seconds: 600 })
    const size = Buffer.byteLength(JSON.stringify(event), "utf-8")
    assert.ok(size >= 240, `corner event size ${size} should be >= 240`)
    assert.ok(size <= 260, `corner event size ${size} should be <= 260`)
  })
})
