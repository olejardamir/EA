import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { ConnectionPool } from "../application/connection-pool.js"
import type { EventStream, Subscription, SubscriptionEvent } from "../ports/event-stream.js"
import type { MetricsRecorder, MetricsSnapshot } from "../ports/metrics.js"
import type { Clock } from "../ports/clock.js"

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
      }
    },
  }
}

function mockClock(nowMs = 1000): Clock {
  return { now: () => nowMs, hrtime: () => 0n }
}

function mockSubscription(opts: { fail?: boolean; lastEventId?: string | null } = {}): Subscription & { _emit: (e: SubscriptionEvent) => void } {
  let handler: ((event: SubscriptionEvent) => void) | null = null
  const sub = {
    connected: true,
    lastEventId: opts.lastEventId ?? null,
    onEvent(h: (event: SubscriptionEvent) => void) { handler = h },
    pause() {},
    resume() {},
    close() { sub.connected = false },
    _emit(evt: SubscriptionEvent) { handler?.(evt) },
  }
  return sub as Subscription & { _emit: (e: SubscriptionEvent) => void }
}

function mockStream(opts: { failCount?: number } = {}): EventStream & { subscriptions: Subscription[] } {
  const subscriptions: Subscription[] = []
  let callCount = 0
  return {
    subscriptions,
    async connect(_url: string, _lastEventId?: string | null) {
      if (opts.failCount && callCount < opts.failCount) {
        callCount++
        throw new Error("connection refused")
      }
      const sub = mockSubscription()
      subscriptions.push(sub)
      callCount++
      return sub
    },
  }
}

describe("ConnectionPool defect fixes", () => {
  it("connectAll with exact target count (no workerCount division)", async () => {
    const stream = mockStream()
    const metrics = mockMetrics()
    const pool = new ConnectionPool(
      { subUrl: "http://localhost:8081", matchIds: ["match-001"] },
      metrics, mockClock(),
    )
    await pool.connectAll(stream, 50, 0)
    assert.equal(pool.size, 50)
    assert.equal(metrics.counts["connections_attempted"], 50)
    assert.equal(metrics.counts["connections_established"], 50)
  })

  it("connection failures increment connectionFailures (Defect 13)", async () => {
    const stream = mockStream({ failCount: 5 })
    const metrics = mockMetrics()
    const pool = new ConnectionPool(
      { subUrl: "http://localhost:8081", matchIds: ["match-001"] },
      metrics, mockClock(),
    )
    await pool.connectAll(stream, 10, 0)
    assert.equal(metrics.counts["connection_failures"], 5)
    assert.equal(metrics.counts["connections_attempted"], 10)
    assert.equal(metrics.counts["connections_established"], 5)
  })

  it("handleMessage records fan-out latency from publish_timestamp", async () => {
    const stream = mockStream()
    const metrics = mockMetrics()
    const pool = new ConnectionPool(
      { subUrl: "http://localhost:8081", matchIds: ["match-001"] },
      metrics, mockClock(2000),
    )
    pool.running = true
    await pool.connectAll(stream, 1, 0)
    const entry = pool.entries[0]

    const pastTime = new Date(Date.now() - 50).toISOString()
    const eventData = JSON.stringify({ canonical_seq: 1, publish_timestamp: pastTime })
    pool.handleMessage(entry, eventData)

    assert.equal(metrics.counts["events_received"], 1)
  })

  it("handleMessage ignores lobby events (no canonical_seq)", async () => {
    const stream = mockStream()
    const metrics = mockMetrics()
    const pool = new ConnectionPool(
      { subUrl: "http://localhost:8081", matchIds: ["match-001"] },
      metrics, mockClock(),
    )
    pool.running = true
    await pool.connectAll(stream, 1, 0)
    const entry = pool.entries[0]

    const lobbyData = JSON.stringify({ matches: [], timestamp: new Date().toISOString() })
    pool.handleMessage(entry, lobbyData)

    assert.equal(metrics.counts["events_received"], undefined)
  })

  it("connectAll with offset for surge batches", async () => {
    const stream = mockStream()
    const metrics = mockMetrics()
    const pool = new ConnectionPool(
      { subUrl: "http://localhost:8081", matchIds: ["match-001", "match-002"] },
      metrics, mockClock(),
    )
    await pool.connectAll(stream, 5, 0)
    assert.equal(pool.size, 5)

    await pool.connectAll(stream, 3, 5)
    assert.equal(pool.size, 8)
  })
})
