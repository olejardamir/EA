import { describe, it } from "node:test"
import assert from "node:assert/strict"
import net from "node:net"
import type { ScenarioContext } from "../scenarios/scenario.js"
import type { EventStream, Subscription, SubscriptionEvent } from "../ports/event-stream.js"
import type { MetricsSnapshot } from "../ports/metrics.js"
import type { MatchEventPublisher } from "../adapters/match-event-publisher.js"
import { LateJoinScenario } from "../scenarios/late-join.js"

// Hermetic mini-RESP server: exercises the real redis-run-isolation SET/GET
// wire logic without requiring a live Redis container in unit tests.
function startMockRedis(): Promise<{ url: string; store: Map<string, string>; close: () => Promise<void> }> {
  const store = new Map<string, string>()
  const server = net.createServer((socket) => {
    let buf = ""
    socket.on("data", (chunk) => {
      buf += chunk.toString("utf8")
      for (;;) {
        if (!buf.startsWith("*")) { buf = ""; return }
        const headerEnd = buf.indexOf("\r\n")
        if (headerEnd === -1) return
        const argc = parseInt(buf.slice(1, headerEnd), 10)
        if (!Number.isInteger(argc) || argc <= 0) { buf = ""; return }
        const args: string[] = []
        let pos = headerEnd + 2
        let complete = true
        for (let i = 0; i < argc; i++) {
          const lenEnd = buf.indexOf("\r\n", pos)
          if (lenEnd === -1) { complete = false; break }
          const len = parseInt(buf.slice(pos + 1, lenEnd), 10)
          if (!Number.isInteger(len) || len < 0) { buf = ""; complete = false; break }
          const val = buf.slice(lenEnd + 2, lenEnd + 2 + len)
          if (val.length < len) { complete = false; break }
          args.push(val)
          pos = lenEnd + 2 + len + 2
        }
        if (!complete) return
        buf = buf.slice(pos)
        if (args[0] === "SET" && args.length === 3) {
          store.set(args[1], args[2])
          socket.write("+OK\r\n")
        } else if (args[0] === "GET" && args.length === 2) {
          const v = store.get(args[1])
          if (v === undefined) socket.write("$-1\r\n")
          else socket.write(`$${Buffer.byteLength(v)}\r\n${v}\r\n`)
        } else {
          socket.write("-ERR unsupported command\r\n")
        }
      }
    })
  })
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as net.AddressInfo
      resolve({
        url: `redis://127.0.0.1:${addr.port}`,
        store,
        close: () => new Promise((res) => server.close(() => res())),
      })
    })
  })
}

function mockCtx(overrides: Partial<{ headTracker: any; eventStream: EventStream; config: Partial<ScenarioContext["config"]>; publisher: any }> = {}): ScenarioContext {
  let time = 1000
  let head = 0
  return {
    publisher: overrides.publisher ?? {
      start() {}, stop() {},
      snapshotAndReset() { return { eventsPublished: 0, byMatch: new Map() } },
      async publishPrefill(_ch: string, count: number) {
        head += count
        return { published: count, firstSeq: head - count + 1, lastSeq: head, frozenState: { seq: head, score: { home: 0, away: 0 }, clock: { period: "1H", elapsed: 0 } } }
      },
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
      gauge() {},
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
      incrementLiteralRestartExpected() {},
      incrementLiteralRestartReceived() {},
      incrementCrossNodeExpected() {},
      incrementCrossNodeReceived() {},
      incrementDeliberateDisconnects() {},
      incrementUnexpectedClientDisconnects() {},
      incrementServerInitiatedDisconnects() {},
      incrementNetworkFailures() {},
      incrementShutdownCleanup() {},
      incrementSchemaValidationErrors() {},
      incrementMissingTransportId() {},
      recordSchedulerLag() {},
      beginPhase(_name: string) {}, endPhase() {}, snapshotPhaseHistograms() { return {} },
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
          literal_restart_expected: 0, literal_restart_received: 0,
          cross_node_expected: 0, cross_node_received: 0,
          deliberate_disconnects: 0, unexpected_client_disconnects: 0,
          server_initiated_disconnects: 0, network_failures: 0, shutdown_cleanup_disconnects: 0,
          planned_restart_disconnects: 0,
          schema_validation_errors: 0, missing_transport_id: 0,
          fan_out_sample_count: 0, fan_out_overflow_count: 0,
          late_join_sample_count: 0, late_join_overflow_count: 0,
          scheduler_lag_p95_ms: 0, scheduler_lag_max_ms: 0,
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
    headTracker: overrides.headTracker ?? {
      getHead() { return head },
      updateHead(_matchId: string, seq: number) { head = Math.max(head, seq) },
      updateHeadState() {},
      getHeadState() { return null },
    },
    config: {
      nchanPubUrl: "http://localhost:8080", nchanSubUrl: "http://localhost:8081",
      nchan2SubUrl: "", nchanControlUrl: "", redisUrl: "redis://localhost:6379",
      targetConnections: 100, warmupSeconds: 1, measureSeconds: 1, burstSeconds: 1,
      cooldownSeconds: 1, slowConsumerFraction: 0.05, lobbyFraction: 0.02,
      historyUrl: "http://localhost:8081", seed: 42, runProfile: "smoke", runMode: "single",
      ...overrides.config,
    },
    matchIds: ["match-001"],
    phaseSnapshots: [],
    log: () => {},
    sleep: (ms: number) => {
      time += Math.min(ms, 10)
      return new Promise((r) => setTimeout(r, 1))
    },
  } as any
}

function createHistorySubscription(handlerRef: { current: ((evt: SubscriptionEvent) => void) | null }): Subscription {
  return {
    connected: true,
    lastEventId: null,
    onEvent(h: any) { handlerRef.current = h },
    pause() {},
    resume() {},
    close() {},
  } as any
}

describe("LateJoinScenario", () => {
  it("publishes canonical prefill events and validates history replay", async () => {
    const redis = await startMockRedis()
    try {
      // Three valid same-run events predate the deterministic 500-event prefill.
      let publishCount = 3
      const handlerRef: { current: ((evt: SubscriptionEvent) => void) | null } = { current: null }
      let capturedUrl = ""
      const ctx = mockCtx({
        headTracker: {
          getHead() { return publishCount },
          updateHead(_m: string, s: number) { publishCount = Math.max(publishCount, s) },
          updateHeadState(_m: string, s: number, _sc: any, _ck: any) { publishCount = Math.max(publishCount, s) },
          getHeadState() { return publishCount > 0 ? { seq: publishCount, score: { home: 0, away: 0 }, clock: { period: "1H", elapsed: 0 } } : null },
        },
        publisher: {
          start() {}, stop() {},
          snapshotAndReset() { return { eventsPublished: 0, byMatch: new Map() } },
          async publishPrefill(_ch: string, count: number) {
            publishCount += count
            const firstSeq = publishCount - count + 1
            const lastSeq = publishCount
            return { published: count, firstSeq, lastSeq, frozenState: { seq: lastSeq, score: { home: 0, away: 0 }, clock: { period: "1H", elapsed: 0 } } }
          },
        } as any,
        eventStream: {
          async connect(url: string) {
            capturedUrl = url
            return createHistorySubscription(handlerRef)
          },
        },
        config: { redisUrl: redis.url },
      })

      const lateJoin = new LateJoinScenario({} as any, { role: "owner", experimentRunId: "test-run" })
      const execPromise = lateJoin.execute(ctx)

      // Wait for prefill to complete and history subscription to be created
      await new Promise((r) => setTimeout(r, 50))

      // Full retained history is seq 1..503, not merely prefill seq 4..503.
      const targetHead = 503
      if (handlerRef.current) {
        for (let seq = 1; seq <= targetHead; seq++) {
          handlerRef.current({
            type: "message",
            event: {
              id: String(seq),
              event: "message",
              data: JSON.stringify({
                match_id: "match-001",
                canonical_seq: seq,
                event_type: "goal",
                score: { home: 0, away: 0 },
                clock: { period: "1H", elapsed_seconds: 0 },
                publish_timestamp: new Date().toISOString(),
              }),
            },
          })
        }
        // Nchan may deliver an already-parsed live frame in the same network
        // batch. It must not overwrite the reconstructed frozen target state.
        handlerRef.current({
          type: "message",
          event: {
            id: "504",
            event: "message",
            data: JSON.stringify({
              match_id: "match-001",
              canonical_seq: 504,
              event_type: "goal",
              score: { home: 99, away: 99 },
              clock: { period: "2H", elapsed_seconds: 999 },
              publish_timestamp: new Date().toISOString(),
            }),
          },
        })
      }

      const result = await execPromise
      assert.ok(result.passed, `Expected passed=true, got detail: ${result.detail}`)
      assert.ok(result.detail.includes("prefill_events=500"), `Expected prefill_events=500 in: ${result.detail}`)
      assert.ok(result.detail.includes("history_expected=503"), `Expected history_expected=503 in: ${result.detail}`)
      assert.ok(result.detail.includes("expected_first_seq=1"), `Expected expected_first_seq=1 in: ${result.detail}`)
      assert.ok(result.detail.includes("expected_last_seq=503"), `Expected expected_last_seq=503 in: ${result.detail}`)
      assert.ok(capturedUrl.includes("/history/"), `Expected /history/ in URL: ${capturedUrl}`)
      // §v2.1.0: owner must freeze the expectation for follower shards.
      assert.ok(redis.store.has("latejoin_expectation:test-run"), "expectation key missing from Redis")
    } finally {
      await redis.close()
    }
  })

  it("returns connection failed when history endpoint throws", async () => {
    const redis = await startMockRedis()
    try {
      const ctx = mockCtx({
        headTracker: {
          getHead() { return 0 },
          updateHead() {},
          updateHeadState() {},
          getHeadState() { return null },
        },
        publisher: {
          start() {}, stop() {},
          snapshotAndReset() { return { eventsPublished: 0, byMatch: new Map() } },
          async publishPrefill(_ch: string, count: number) {
            return { published: count, firstSeq: 1, lastSeq: count, frozenState: { seq: count, score: { home: 0, away: 0 }, clock: { period: "1H", elapsed: 0 } } }
          },
        } as any,
        eventStream: {
          async connect() { throw new Error("connection refused") },
        },
        config: { redisUrl: redis.url },
      })
      const lateJoin = new LateJoinScenario({} as any, { role: "owner", experimentRunId: "test-run" })
      const result = await lateJoin.execute(ctx)
      assert.ok(!result.passed)
      assert.ok(result.detail.includes("connection failed"), `Expected 'connection failed' in: ${result.detail}`)
    } finally {
      await redis.close()
    }
  })

  it("detects missing sequences in history replay", async () => {
    const redis = await startMockRedis()
    try {
      let publishCount = 0
      const handlerRef: { current: ((evt: SubscriptionEvent) => void) | null } = { current: null }
      const ctx = mockCtx({
        headTracker: {
          getHead() { return publishCount },
          updateHead(_m: string, s: number) { publishCount = Math.max(publishCount, s) },
          updateHeadState(_m: string, s: number, _sc: any, _ck: any) { publishCount = Math.max(publishCount, s) },
          getHeadState() { return publishCount > 0 ? { seq: publishCount, score: { home: 0, away: 0 }, clock: { period: "1H", elapsed: 0 } } : null },
        },
        publisher: {
          start() {}, stop() {},
          snapshotAndReset() { return { eventsPublished: 0, byMatch: new Map() } },
          async publishPrefill(_ch: string, count: number) {
            publishCount += count
            const firstSeq = publishCount - count + 1
            const lastSeq = publishCount
            return { published: count, firstSeq, lastSeq, frozenState: { seq: lastSeq, score: { home: 0, away: 0 }, clock: { period: "1H", elapsed: 0 } } }
          },
        } as any,
        eventStream: {
          async connect() {
            return createHistorySubscription(handlerRef)
          },
        },
        config: { redisUrl: redis.url },
      })

      const lateJoin = new LateJoinScenario({} as any, { role: "owner", experimentRunId: "test-run" })
      const execPromise = lateJoin.execute(ctx)

      await new Promise((r) => setTimeout(r, 50))

      // Fire events with a gap (missing seq 5)
      if (handlerRef.current) {
        for (let seq = 1; seq <= 500; seq++) {
          if (seq === 5) continue // skip to create gap
          handlerRef.current({
            type: "message",
            event: {
              id: String(seq),
              event: "message",
              data: JSON.stringify({
                match_id: "match-001",
                canonical_seq: seq,
                event_type: "goal",
                score: { home: 0, away: 0 },
                clock: { period: "1H", elapsed_seconds: 0 },
                publish_timestamp: new Date().toISOString(),
              }),
            },
          })
        }
      }

      const result = await execPromise
      // Should detect missing sequence 5
      assert.ok(result.detail.includes("missing_required_sequences=1"),
        `Expected missing_required_sequences=1 in: ${result.detail}`)
    } finally {
      await redis.close()
    }
  })
})

// §v2.1.0: follower shards poll the shared Redis expectation and probe their OWN
// partition node — no independent history/fan-out ownership domain can escape
// verification (one sample per shard per run).
describe("LateJoinScenario follower role (§v2.1.0 per-partition sampling)", () => {
  function seedExpectation(store: Map<string, string>, overrides: Partial<any> = {}): void {
    store.set("latejoin_expectation:test-run", JSON.stringify({
      match_id: "match-001",
      expected_first_seq: 1,
      expected_last_seq: 3,
      frozen_state: { seq: 3, score: { home: 2, away: 1 }, clock: { period: "2H", elapsed: 120 } },
      prefill_events: 3,
      ...overrides,
    }))
  }

  it("follower polls expectation from Redis and probes its own partition node", async () => {
    const redis = await startMockRedis()
    try {
      seedExpectation(redis.store)
      const handlerRef: { current: ((evt: SubscriptionEvent) => void) | null } = { current: null }
      let capturedUrl = ""
      const ctx = mockCtx({
        eventStream: {
          async connect(url: string) {
            capturedUrl = url
            return createHistorySubscription(handlerRef)
          },
        },
        config: {
          redisUrl: redis.url,
          historyUrl: "http://localhost:28081",
        },
      })

      const lateJoin = new LateJoinScenario({} as any, { role: "follower", experimentRunId: "test-run" })
      const execPromise = lateJoin.execute(ctx)
      await new Promise((r) => setTimeout(r, 50))

      if (handlerRef.current) {
        for (let seq = 1; seq <= 4; seq++) {
          handlerRef.current({
            type: "message",
            event: {
              id: String(seq),
              event: "message",
              data: JSON.stringify({
                match_id: "match-001",
                canonical_seq: seq,
                event_type: "goal",
                score: seq >= 3 ? { home: 2, away: 1 } : { home: 0, away: 0 },
                clock: seq >= 3 ? { period: "2H", elapsed_seconds: 120 } : { period: "1H", elapsed_seconds: 0 },
                publish_timestamp: new Date().toISOString(),
              }),
            },
          })
        }
      }

      const result = await execPromise
      assert.ok(result.passed, `Expected follower PASS, got detail: ${result.detail}`)
      assert.ok(result.detail.includes("role=follower"), `Expected role=follower in: ${result.detail}`)
      assert.ok(capturedUrl.includes("28081"), `Expected own-partition port in URL: ${capturedUrl}`)
    } finally {
      await redis.close()
    }
  })

  it("follower fails when reconstructed state diverges from the frozen expectation", async () => {
    const redis = await startMockRedis()
    try {
      seedExpectation(redis.store)
      const handlerRef: { current: ((evt: SubscriptionEvent) => void) | null } = { current: null }
      const ctx = mockCtx({
        eventStream: {
          async connect() {
            return createHistorySubscription(handlerRef)
          },
        },
        config: { redisUrl: redis.url },
      })

      const lateJoin = new LateJoinScenario({} as any, { role: "follower", experimentRunId: "test-run" })
      const execPromise = lateJoin.execute(ctx)
      await new Promise((r) => setTimeout(r, 50))

      if (handlerRef.current) {
        for (let seq = 1; seq <= 4; seq++) {
          handlerRef.current({
            type: "message",
            event: {
              id: String(seq),
              event: "message",
              data: JSON.stringify({
                match_id: "match-001",
                canonical_seq: seq,
                event_type: "goal",
                score: { home: 9, away: 9 },
                clock: { period: "2H", elapsed_seconds: 999 },
                publish_timestamp: new Date().toISOString(),
              }),
            },
          })
        }
      }

      const result = await execPromise
      assert.ok(!result.passed)
      assert.ok(result.detail.includes("reconstructed_score_matches=false"),
        `Expected score mismatch detection in: ${result.detail}`)
    } finally {
      await redis.close()
    }
  })

  it("follower fails closed when the expectation payload fails schema validation", async () => {
    const redis = await startMockRedis()
    try {
      // Malformed payload: missing frozen_state and numeric fields.
      redis.store.set("latejoin_expectation:test-run", JSON.stringify({ bogus: true }))
      const ctx = mockCtx({
        config: { redisUrl: redis.url },
      })

      const lateJoin = new LateJoinScenario({} as any, { role: "follower", experimentRunId: "test-run" })
      const result = await lateJoin.execute(ctx)
      assert.ok(!result.passed)
      assert.ok(result.detail.includes("expectation failed schema validation"),
        `Expected schema-validation failure in: ${result.detail}`)
    } finally {
      await redis.close()
    }
  })
})
