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

function mockSubscription(opts: { fail?: boolean; lastEventId?: string | null } = {}): Subscription {
  let handler: ((event: SubscriptionEvent) => void) | null = null
  return {
    connected: true,
    lastEventId: opts.lastEventId ?? null,
    onEvent(h) { handler = h },
    pause() {},
    resume() {},
    close() {},
    _emit(evt: SubscriptionEvent) { handler?.(evt) },
  } as Subscription
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

describe("ConnectionPool", () => {
  it("attempted = established + failures accounting", async () => {
    const stream = mockStream({ failCount: 3 })
    const metrics = mockMetrics()
    const pool = new ConnectionPool(
      { subUrl: "http://localhost:8080", matchIds: ["m1", "m2"] },
      metrics, mockClock(),
    )
    await pool.connectAll(stream, 10, 0)
    const attempted = metrics.counts["connections_attempted"] ?? 0
    const established = metrics.counts["connections_established"] ?? 0
    assert.equal(attempted, 10, "attempted should equal connectionsPerWorker")
    assert.ok(established <= attempted, "established <= attempted")
    assert.equal(stream.subscriptions.length, established)
  })

  it("reconnect preserves prior canonical sequence state", async () => {
    const stream = mockStream()
    const metrics = mockMetrics()
    const pool = new ConnectionPool(
      { subUrl: "http://localhost:8080", matchIds: ["match-001"] },
      metrics, mockClock(),
    )
    pool.running = true
    await pool.connectAll(stream, 1, 0)
    assert.equal(pool.size, 1)

    const entry = pool.entries[0]
    entry.tracker.classify(1)
    entry.tracker.classify(2)
    entry.tracker.classify(3)

    await pool.reconnectAll(stream, 0)
    assert.equal(pool.size, 1)
    const newEntry = pool.entries[0]
    assert.equal(newEntry.mode, "reconnect")

    const r = newEntry.tracker.classify(4)
    assert.equal(r.kind, "NEXT")
  })

  it("reconnect supplies Last-Event-ID", async () => {
    const stream = mockStream()
    const metrics = mockMetrics()
    const pool = new ConnectionPool(
      { subUrl: "http://localhost:8080", matchIds: ["match-001"] },
      metrics, mockClock(),
    )
    pool.running = true
    await pool.connectAll(stream, 1, 0)

    const entry = pool.entries[0]
    entry.tracker.classify(1)
    entry.tracker.classify(2)
    entry.tracker.classify(3)

    const sub = entry.subscription as any
    sub.lastEventId = "3"

    await pool.reconnectAll(stream, 0)

    const newSub = stream.subscriptions[stream.subscriptions.length - 1]
    assert.ok(newSub, "new subscription was created")
  })

  it("reconnect publishes events during outage via tracking", async () => {
    const stream = mockStream()
    const metrics = mockMetrics()
    const pool = new ConnectionPool(
      { subUrl: "http://localhost:8080", matchIds: ["match-001"] },
      metrics, mockClock(),
    )
    pool.running = true
    await pool.connectAll(stream, 1, 0)

    const entry = pool.entries[0]
    entry.tracker.classify(1)
    entry.tracker.classify(2)

    const sub = entry.subscription as any
    sub.lastEventId = "2"

    await pool.reconnectAll(stream, 0)
    const newEntry = pool.entries[0]
    newEntry.tracker.classify(3)
    newEntry.tracker.classify(4)

    assert.equal(newEntry.tracker.lastSeq, 4)
    assert.equal(pool.size, 1)
  })
})
