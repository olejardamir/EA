import { describe, it } from "node:test"
import assert from "node:assert/strict"
import type { EventStream, Subscription, SubscriptionEvent } from "../ports/event-stream.js"
import type { MetricsRecorder, MetricsSnapshot } from "../ports/metrics.js"
import type { Clock } from "../ports/clock.js"
import { ConnectionPool } from "../application/connection-pool.js"
import { createPRNG } from "../domain/prng.js"
import { MATCH_IDS } from "../domain/event.js"

function mockMetrics(): MetricsRecorder {
  return {
    recordFanOutLatency() {},
    recordLateJoinLatency() {},
    incrementEventsReceived() {},
    incrementExpectedFanDeliveries() {},
    incrementMissingSequences() {},
    incrementDuplicates() {},
    incrementOutOfOrder() {},
    incrementReconnectGaps() {},
    incrementReconnectDuplicates() {},
    incrementReconnectOrderViolations() {},
    incrementSlowConsumerDisconnects() {},
    incrementConnectionsAttempted() {},
    incrementConnectionsEstablished() {},
    incrementConnectionFailures() {},
    incrementConnectionsDropped() {},
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
    incrementSchemaValidationErrors() {},
    incrementMissingTransportId() {},
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
        schema_validation_errors: 0, missing_transport_id: 0,
        fan_out_sample_count: 0, fan_out_overflow_count: 0,
        late_join_sample_count: 0, late_join_overflow_count: 0,
      }
    },
  }
}

function mockClock(): Clock {
  let time = 1000
  return {
    now: () => time,
    hrtime: () => 0n,
  }
}

function mockSubscription(): Subscription {
  return {
    connected: true,
    lastEventId: null,
    onEvent() {},
    pause() {},
    resume() {},
    close() {},
    getEventHandler() { return null },
  }
}

function mockStream(): EventStream {
  return {
    async connect() { return mockSubscription() },
  }
}

describe("Channel-aware subscriber tracking (Defect 12)", () => {
  it("tracks subscribers per match channel", async () => {
    const pool = new ConnectionPool(
      { subUrl: "http://localhost:8081", matchIds: [...MATCH_IDS] },
      mockMetrics(),
      mockClock(),
    )

    await pool.connectAll(mockStream(), 8, 0)

    for (const matchId of MATCH_IDS) {
      const count = pool.getSubscriberCount(matchId)
      assert.ok(count >= 1, `expected at least 1 subscriber for ${matchId}, got ${count}`)
    }
  })

  it("decrements count on disconnect", async () => {
    const pool = new ConnectionPool(
      { subUrl: "http://localhost:8081", matchIds: [...MATCH_IDS] },
      mockMetrics(),
      mockClock(),
    )

    await pool.connectAll(mockStream(), 8, 0)
    const before = pool.getSubscriberCount("match-001")
    assert.ok(before >= 1)

    await pool.disconnectAll()
    assert.equal(pool.getSubscriberCount("match-001"), 0)
  })

  it("returns 0 for unknown channel", () => {
    const pool = new ConnectionPool(
      { subUrl: "http://localhost:8081", matchIds: [...MATCH_IDS] },
      mockMetrics(),
      mockClock(),
    )
    assert.equal(pool.getSubscriberCount("nonexistent"), 0)
  })
})

describe("Lobby subscriber allocation (Defect 13)", () => {
  it("allocates lobbyFraction of connections to lobby channel", async () => {
    const pool = new ConnectionPool(
      { subUrl: "http://localhost:8081", matchIds: [...MATCH_IDS] },
      mockMetrics(),
      mockClock(),
    )

    await pool.connectAll(mockStream(), 100, 0, undefined, 0.02)

    const lobbyCount = pool.getSubscriberCount("lobby")
    assert.ok(lobbyCount >= 1 && lobbyCount <= 5, `expected ~2% lobby subscribers, got ${lobbyCount}`)
    assert.ok(pool.size > lobbyCount, "should have more match subscribers than lobby")
  })

  it("zero lobbyFraction means no lobby subscribers", async () => {
    const pool = new ConnectionPool(
      { subUrl: "http://localhost:8081", matchIds: [...MATCH_IDS] },
      mockMetrics(),
      mockClock(),
    )

    await pool.connectAll(mockStream(), 100, 0, undefined, 0)
    assert.equal(pool.getSubscriberCount("lobby"), 0)
  })
})

describe("Phase snapshot and reset (Defects 14-15)", () => {
  it("MatchEventPublisher snapshotAndReset captures and clears state", async () => {
    const { MatchEventPublisher } = await import("../adapters/match-event-publisher.js")
    const random = createPRNG(42)
    const headTracker = { getHead: () => 0, updateHead() {}, updateHeadState() {}, getHeadState() { return null } }

    let publishCount = 0
    const publisher = new MatchEventPublisher({
      publisher: {
        async publish() { publishCount++; return true },
        async healthcheck() { return true },
      },
      headTracker: headTracker as any,
      burstMode: false,
      random,
      getSubscriberCount: () => 50,
      onPublish() {},
    })

    publisher.start(true)
    await new Promise((r) => setTimeout(r, 500))
    publisher.stop()

    const snap = publisher.snapshotAndReset()
    assert.ok(snap.eventsPublished > 0, "should have published events")
    assert.ok(snap.byMatch.size > 0, "should have per-match counts")

    const totalAfter = Array.from(snap.byMatch.values()).reduce((a, b) => a + b, 0)
    assert.ok(totalAfter <= snap.eventsPublished, "byMatch total should not exceed eventsPublished (lobby events excluded)")

    const snap2 = publisher.snapshotAndReset()
    assert.equal(snap2.eventsPublished, 0, "second snapshot should be empty after reset")
  })
})
