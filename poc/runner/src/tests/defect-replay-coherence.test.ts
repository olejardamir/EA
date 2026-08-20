import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createInitialMatchStates, advanceMatchState } from "../domain/match-state.js"
import { createEventPayload, createLobbyPayload, MATCH_IDS } from "../domain/event.js"
import { createSequenceTracker } from "../domain/sequence-validator.js"
import { BoundedMetricsRecorder } from "../adapters/metrics-recorder.js"
import { createPRNG } from "../domain/prng.js"
import { createMatchHeadTracker } from "../domain/match-state.js"

describe("§AJ: Replay/lobby state coherence", () => {
  it("replayed canonical history reconstructs committed publisher score at head-at-start", () => {
    const states = createInitialMatchStates()
    const state = states[0]
    const random = createPRNG(42)

    const events: string[] = []
    const committedScores: Array<{ seq: number; score: { home: number; away: number }; clock: { period: string; elapsed_seconds: number } }> = []

    for (let i = 0; i < 50; i++) {
      advanceMatchState(state, i % 3 === 0 ? "goal" : "corner", random)
      const event = createEventPayload("match-001", state.seq, "corner", state.score, state.clock)
      events.push(JSON.stringify(event))
      committedScores.push({ seq: state.seq, score: { ...state.score }, clock: { ...state.clock } })
    }

    const headAtStart = state.seq
    assert.equal(headAtStart, 50)

    const tracker = createSequenceTracker(0)
    let reconstructedScore: { home: number; away: number } | null = null
    let reconstructedClock: { period: string; elapsed_seconds: number } | null = null
    let lastCanonicalSeq = 0

    for (const raw of events) {
      const data = JSON.parse(raw)
      const classification = tracker.classify(data.canonical_seq)
      if (classification.kind === "NEXT" || classification.kind === "DUPLICATE") {
        reconstructedScore = data.score
        reconstructedClock = data.clock
        lastCanonicalSeq = data.canonical_seq
      }
    }

    const committedAtHead = committedScores.find((c) => c.seq === headAtStart)
    assert.ok(committedAtHead, "committed state at head should exist")
    assert.deepEqual(reconstructedScore, committedAtHead.score, "reconstructed score must match committed score at head")
    assert.deepEqual(reconstructedClock, committedAtHead.clock, "reconstructed clock must match committed clock at head")
    assert.equal(lastCanonicalSeq, headAtStart, "last canonical seq must equal target head")
  })

  it("lobby buffered state equals coherent committed publisher state boundary", () => {
    const states = createInitialMatchStates()
    const random = createPRNG(42)

    for (const state of states) {
      for (let i = 0; i < 20; i++) {
        advanceMatchState(state, "corner", random)
      }
    }

    const lobbyPayload = createLobbyPayload(
      states.map((s, i) => ({
        matchId: MATCH_IDS[i],
        score: s.score,
        clock: s.clock,
        lastEventType: s.last_event_type,
      })),
    )

    assert.equal(lobbyPayload.matches.length, 8)

    for (let i = 0; i < states.length; i++) {
      const lobbyMatch = lobbyPayload.matches[i]
      const committed = states[i]
      assert.equal(lobbyMatch.match_id, MATCH_IDS[i], `match ${i} id must match`)
      assert.deepEqual(lobbyMatch.score, committed.score, `match ${i} score must match committed state`)
      assert.deepEqual(lobbyMatch.clock, committed.clock, `match ${i} clock must match committed state`)
    }
  })
})

describe("§BB: Run isolation", () => {
  it("BoundedMetricsRecorder resets all counters on new instance", () => {
    const recorder1 = new BoundedMetricsRecorder()

    recorder1.recordFanOutLatency(100)
    recorder1.recordFanOutLatency(200)
    recorder1.incrementEventsReceived()
    recorder1.incrementConnectionsEstablished()
    recorder1.setActiveConnections(5)

    const snap1 = recorder1.snapshot()
    assert.ok(snap1.fan_out_latencies_ms.length > 0, "first recorder should have data")
    assert.ok(snap1.events_received > 0, "first recorder should have events")
    assert.ok(snap1.connections_established > 0, "first recorder should have connections")
    assert.ok(snap1.active_connections_peak > 0, "first recorder should have peak")

    const recorder2 = new BoundedMetricsRecorder()
    const snap2 = recorder2.snapshot()
    assert.equal(snap2.fan_out_latencies_ms.length, 0, "new recorder must have no latencies")
    assert.equal(snap2.events_received, 0, "new recorder must have no events")
    assert.equal(snap2.connections_established, 0, "new recorder must have no connections")
    assert.equal(snap2.active_connections_peak, 0, "new recorder must have zero peak")
    assert.equal(snap2.latency_invalid_count, 0, "new recorder must have no invalid latencies")
    assert.equal(snap2.latency_overflow_count, 0, "new recorder must have no overflow latencies")
  })

  it("PRNG produces different sequences with different seeds", () => {
    const rng1 = createPRNG(1)
    const rng2 = createPRNG(2)
    const vals1 = Array.from({ length: 10 }, () => rng1())
    const vals2 = Array.from({ length: 10 }, () => rng2())
    const allSame = vals1.every((v: number, i: number) => v === vals2[i])
    assert.ok(!allSame, "different seeds must produce different PRNG sequences")
  })

  it("MatchHeadTracker creates fresh per-run state", () => {
    const tracker1 = createMatchHeadTracker()
    tracker1.updateHead("match-001", 500)

    const tracker2 = createMatchHeadTracker()
    assert.equal(tracker2.getHead("match-001"), 0, "new tracker must start at zero")
  })
})
