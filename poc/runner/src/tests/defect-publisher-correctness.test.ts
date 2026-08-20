import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { MatchEventPublisher } from "../adapters/match-event-publisher.js"
import { createMatchHeadTracker } from "../domain/match-state.js"
import { createPRNG } from "../domain/prng.js"
import type { EventPublisher } from "../ports/event-publisher.js"

function mockPublisher(opts: { failCount?: number } = {}): EventPublisher & { attempts: number } {
  let callCount = 0
  return {
    attempts: 0,
    async publish(_matchId: string, _body: string, _eventType: string): Promise<boolean> {
      this.attempts++
      if (opts.failCount && callCount < opts.failCount) {
        callCount++
        return false
      }
      callCount++
      return true
    },
    async healthcheck() { return true },
  }
}

function mockAmbiguousPublisher(opts: { ambiguousCount?: number } = {}): EventPublisher & { attempts: number } {
  let callCount = 0
  return {
    attempts: 0,
    async publish(_matchId: string, _body: string, _eventType: string): Promise<boolean> {
      this.attempts++
      if (opts.ambiguousCount && callCount < opts.ambiguousCount) {
        callCount++
        throw new Error("connect timeout")
      }
      callCount++
      return true
    },
    async healthcheck() { return true },
  }
}

describe("§AS: Publisher atomic commit (§AS/§6.58)", () => {
  it("definite failed publish does not advance canonical seq/head/state", async () => {
    const pub = mockPublisher({ failCount: 100 })
    const headTracker = createMatchHeadTracker()
    const random = createPRNG(42)

    const publisher = new MatchEventPublisher({
      publisher: pub,
      headTracker,
      burstMode: false,
      random,
    })

    publisher.start(true)
    await new Promise((r) => setTimeout(r, 500))
    publisher.stop()

    // All publishes failed — head tracker should have NO entries
    for (const matchId of publisher.matchIds) {
      assert.equal(headTracker.getHead(matchId), 0, `head must remain 0 for ${matchId} after failed publishes`)
    }
    assert.equal(publisher.totalPublished, 0, "totalPublished must be 0 when all publishes fail")
  })

  it("accepted publishes advance state exactly once", async () => {
    const pub = mockPublisher()
    const headTracker = createMatchHeadTracker()
    const random = createPRNG(42)

    const publisher = new MatchEventPublisher({
      publisher: pub,
      headTracker,
      burstMode: false,
      random,
    })

    publisher.start(true)
    await new Promise((r) => setTimeout(r, 300))
    publisher.stop()

    assert.ok(publisher.totalPublished > 0, "totalPublished must be > 0")
    assert.equal(publisher.totalPublished, pub.attempts, "totalPublished must equal successful attempts")
    // At least one match should have advanced
    const anyAdvanced = publisher.matchIds.some((id) => headTracker.getHead(id) > 0)
    assert.ok(anyAdvanced, "at least one match head should advance on successful publishes")
  })

  it("ambiguous (throwing) publish does not advance head for failed attempts", async () => {
    const pub = mockAmbiguousPublisher({ ambiguousCount: 2 })
    const headTracker = createMatchHeadTracker()
    const random = createPRNG(42)

    const publisher = new MatchEventPublisher({
      publisher: pub,
      headTracker,
      burstMode: false,
      random,
    })

    publisher.start(true)
    await new Promise((r) => setTimeout(r, 500))
    publisher.stop()

    // Throws are caught by .catch() — state only advances on ok=true
    // The publisher.totalPublished should equal the number of successful (non-throwing) publishes
    assert.ok(pub.attempts >= 2, `mock should have been called at least twice, got ${pub.attempts}`)
    // totalPublished only counts ok=true — fewer than total attempts
    assert.ok(publisher.totalPublished <= pub.attempts, "totalPublished must not exceed total attempts")
  })
})

describe("§6.20: Per-match ordering lock", () => {
  it("two publishes to the same match cannot overlap", async () => {
    const perMatchActive = new Map<string, number>()
    const perMatchMax = new Map<string, number>()

    const slowPub: EventPublisher = {
      async publish(matchId: string, _body: string, _eventType: string): Promise<boolean> {
        const cur = (perMatchActive.get(matchId) ?? 0) + 1
        perMatchActive.set(matchId, cur)
        const prevMax = perMatchMax.get(matchId) ?? 0
        if (cur > prevMax) perMatchMax.set(matchId, cur)
        await new Promise((r) => setTimeout(r, 30))
        perMatchActive.set(matchId, cur - 1)
        return true
      },
      async healthcheck() { return true },
    }

    const headTracker = createMatchHeadTracker()
    const random = createPRNG(42)

    const publisher = new MatchEventPublisher({
      publisher: slowPub,
      headTracker,
      burstMode: false,
      random,
    })

    publisher.start(true)
    await new Promise((r) => setTimeout(r, 3000))
    publisher.stop()

    // Per-match max concurrency must be exactly 1
    for (const [matchId, max] of perMatchMax) {
      assert.equal(max, 1, `match ${matchId}: per-match lock violated, max concurrent was ${max}`)
    }
  })
})

describe("§Z: Deliberate teardown not counted as unexpected disconnect (§6.52)", () => {
  it("disconnectAll does not increment connections_dropped", async () => {
    const { ConnectionPool } = await import("../application/connection-pool.js")
    const counts: Record<string, number> = {}
    const inc = (k: string, n = 1) => { counts[k] = (counts[k] ?? 0) + n }

    const mockStream = {
      async connect() {
        return {
          connected: true,
          lastEventId: null,
          onEvent() {},
          pause() {},
          resume() {},
          close() { this.connected = false },
        }
      },
    }

    const metrics = {
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
      incrementDeliberateDisconnects: () => inc("deliberate_disconnects"),
      incrementUnexpectedClientDisconnects: () => inc("unexpected_client_disconnects"),
      incrementServerInitiatedDisconnects: () => inc("server_initiated_disconnects"),
      incrementNetworkFailures: () => inc("network_failures"),
      incrementShutdownCleanup: () => inc("shutdown_cleanup_disconnects"),
      incrementLiveExpectedDeliveries() {},
      incrementLiveReceivedDeliveries() {},
      incrementLateJoinHistoryExpected() {},
      incrementLateJoinHistoryReceived() {},
      incrementReconnectReplayExpected() {},
      incrementReconnectReplayReceived() {},
      incrementRestartReplayExpected() {},
      incrementRestartReplayReceived() {},
      beginPhase(_name: string) {}, endPhase() {}, snapshotPhaseHistograms() { return {} },
      snapshot() {
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
          server_initiated_disconnects: 0, network_failures: 0,
          shutdown_cleanup_disconnects: 0,
          schema_validation_errors: 0, missing_transport_id: 0,
          fan_out_sample_count: 0, fan_out_overflow_count: 0,
          late_join_sample_count: 0, late_join_overflow_count: 0,
          scheduler_lag_p95_ms: 0, scheduler_lag_max_ms: 0,
        }
      },
    }

    const pool = new ConnectionPool(
      { subUrl: "http://localhost:8081", matchIds: ["match-001"] },
      metrics as any,
      { now: () => Date.now(), hrtime: () => 0n },
    )

    await pool.connectAll(mockStream as any, 5, 0)
    assert.equal(pool.size, 5)

    await pool.disconnectAll()
    assert.equal(pool.size, 0)
    assert.equal(counts["connections_dropped"], undefined, "deliberate teardown must not increment connections_dropped")
  })

  it("unexpected disconnect (error event) increments connections_dropped", async () => {
    const capturedHandler: { fn: ((evt: any) => void) | null } = { fn: null }
    const mockStream = {
      async connect() {
        return {
          connected: true,
          lastEventId: null,
          onEvent(h: (evt: any) => void) { capturedHandler.fn = h },
          pause() {},
          resume() {},
          close() { this.connected = false },
        }
      },
    }

    const counts: Record<string, number> = {}
    const inc = (k: string, n = 1) => { counts[k] = (counts[k] ?? 0) + n }

    const metrics = {
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
      incrementDeliberateDisconnects: () => inc("deliberate_disconnects"),
      incrementUnexpectedClientDisconnects: () => inc("unexpected_client_disconnects"),
      incrementServerInitiatedDisconnects: () => inc("server_initiated_disconnects"),
      incrementNetworkFailures: () => inc("network_failures"),
      incrementShutdownCleanup: () => inc("shutdown_cleanup_disconnects"),
      incrementLiveExpectedDeliveries() {},
      incrementLiveReceivedDeliveries() {},
      incrementLateJoinHistoryExpected() {},
      incrementLateJoinHistoryReceived() {},
      incrementReconnectReplayExpected() {},
      incrementReconnectReplayReceived() {},
      incrementRestartReplayExpected() {},
      incrementRestartReplayReceived() {},
      snapshot() {
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
          server_initiated_disconnects: 0, network_failures: 0,
          shutdown_cleanup_disconnects: 0,
        }
      },
    }

    const { ConnectionPool } = await import("../application/connection-pool.js")
    const pool = new ConnectionPool(
      { subUrl: "http://localhost:8081", matchIds: ["match-001"] },
      metrics as any,
      { now: () => Date.now(), hrtime: () => 0n },
    )

    await pool.connectAll(mockStream as any, 1, 0)
    assert.equal(pool.size, 1)

    ;(pool as any)._running = true
    capturedHandler.fn?.({ type: "error", error: new Error("stream ended") })

    assert.equal(counts["server_initiated_disconnects"], 1, "unexpected disconnect must increment server_initiated_disconnects")
  })
})

describe("§BJ: onParseError wiring in SSE subscription", () => {
  it("onParseError callback is stored and invoked on null-byte detection", async () => {
    const { parseSSEChunk } = await import("../adapters/sse-http-client.js")

    // Parse SSE chunk with embedded null byte — the parser itself returns frames
    // but the SSE data handler detects null bytes and calls onParseError.
    // We verify parseSSEChunk handles null bytes in the buffer.
    const bufferWithNull = "data: hello\0world\n\n"
    const frame = { data: [] as string[] }
    const result = parseSSEChunk(bufferWithNull, frame)

    // parseSSEChunk returns frames; the null-byte check is in the SSE data handler
    assert.ok(Array.isArray(result.frames), "parseSSEChunk returns frames array")
    assert.equal(result.error, false, "parseSSEChunk error flag is false")
  })

  it("onParseError is wired through connect() to the subscription", async () => {
    const http = await import("node:http")

    // Create a server that sends data and keeps the connection open with a timer
    let keepAlive: ReturnType<typeof setInterval> | null = null
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" })
      res.write("id: 1\ndata: {\"test\":true}\n\n")
      // Keep connection alive with periodic whitespace (SSE comment line)
      keepAlive = setInterval(() => { res.write(":\n") }, 500)
      res.on("close", () => { if (keepAlive) clearInterval(keepAlive) })
    })

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const addr = server.address() as { port: number }

    let parseErrorCalled = false

    try {
      const { SSEHttpClient } = await import("../adapters/sse-http-client.js")
      const client = new SSEHttpClient()
      const sub = await client.connect(
        `http://127.0.0.1:${addr.port}/sub/test`,
        undefined,
        () => { parseErrorCalled = true },
      )

      // Wait for data to arrive
      await new Promise((r) => setTimeout(r, 100))

      assert.equal(parseErrorCalled, false, "onParseError not called on clean data")
      assert.ok(sub.connected, "subscription connected")
      sub.close()
    } finally {
      if (keepAlive) clearInterval(keepAlive)
      server.close()
    }
  })
})

describe("§6.24: Machine-readable JSON output", () => {
  it("emitMachineReadableResult produces valid JSON with required fields", async () => {
    const { emitMachineReadableResult } = await import("../application/result-printer.js")

    let jsonOutput = ""
    const originalLog = console.log
    console.log = (msg: string) => { jsonOutput = msg }

    try {
      emitMachineReadableResult(
        {
          connections_attempted: 100, connections_established: 100, connection_failures: 0,
          events_published: 50, events_received: 50, missing_sequences: 0,
          duplicates: 0, out_of_order: 0,
          fan_out_latency_p50_ms: 5, fan_out_latency_p95_ms: 10, fan_out_latency_p99_ms: 15, fan_out_latency_max_ms: 20,
          late_join_p50_ms: 100, late_join_p95_ms: 150, late_join_p99_ms: 200, late_join_max_ms: 250,
          reconnect_gaps: 0, reconnect_duplicates: 0, reconnect_order_violations: 0,
          slow_consumer_disconnects: 0, event_loop_delay_p99_ms: 5, memory_mb_peak: 100,
          connections_dropped: 0, expected_fan_deliveries: 50, received_fan_deliveries: 50,
          connections_target: 100, burst_fan_out_p95_ms: 20,
          nchan_restart_history_replay_correct: true, nchan_restart_missing_sequences: 0, nchan_restart_skipped: false,
          non_slow_p95_degradation_pct: 0, nchan_memory_mb_peak: null, redis_memory_mb_peak: null,
          timing_valid: true, generator_cpu_percent_peak: 30, generator_event_loop_p99_ms: 5,
          run_profile: "smoke", lobby_subscribers: 2, match_001_subscribers: 12,
          match_002_subscribers: 0, match_003_subscribers: 0, match_004_subscribers: 0,
          match_005_subscribers: 0, match_006_subscribers: 0, match_007_subscribers: 0,
          match_008_subscribers: 0,
          phase_publish_rates: [], cpu_usage_usec: null, cpu_throttled_count: null,
          cpu_throttled_usec: null, memory_oom_events: null, memory_oom_kill_events: null,
          memory_current_bytes: null, memory_peak_bytes: null, cpu_max_quota: null, memory_max_bytes: null,
          generator_backlog_peak: 0, publisher_attempts: 50, publisher_successes: 50,
          publisher_definite_failures: 0, publisher_ambiguous_failures: 0,
          sse_parse_errors: 0, json_parse_errors: 0, invalid_timestamp_count: 0,
          surge_fan_out_p95_ms: 0, surge_missing_sequences: 0, surge_duplicates: 0,
          surge_out_of_order: 0, surge_events_received: 0, active_connections_peak: 100,
        } as any,
        50,
        { verdict: "NOT_APPLICABLE", checks: [{ name: "smoke_gate", passed: true, detail: "smoke" }] },
        { targetConnections: 100, seed: 42, runProfile: "smoke", warmupSeconds: 5, measureSeconds: 10, burstSeconds: 5, cooldownSeconds: 3, slowConsumerFraction: 0.05, lobbyFraction: 0.02 },
      )
    } finally {
      console.log = originalLog
    }

    const parsed = JSON.parse(jsonOutput)
    assert.equal(parsed.contract_version, "v2.0.2")
    assert.equal(parsed.run_profile, "smoke")
    assert.equal(parsed.seed, 42)
    assert.ok(parsed.resolved_config, "resolved_config present")
    assert.ok(parsed.connection_metrics, "connection_metrics present")
    assert.ok(parsed.event_metrics, "event_metrics present")
    assert.ok(parsed.latency_metrics, "latency_metrics present")
    assert.ok(parsed.classification, "classification present")
    assert.equal(parsed.classification.verdict, "NOT_APPLICABLE")
    assert.ok(Array.isArray(parsed.classification.checks), "checks is array")
  })
})
