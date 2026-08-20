import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  weightedRandom, padToSize, createEventPayload, createLobbyPayload,
  MATCH_IDS, EVENT_TYPES, MATCH_WEIGHTS,
} from "../domain/event.js"
import { createPRNG } from "../domain/prng.js"

describe("Event generation", () => {
  it("weightedRandom returns valid index", () => {
    const weights = [1, 2, 3]
    const rng = createPRNG(1)
    for (let i = 0; i < 100; i++) {
      const idx = weightedRandom(weights, rng)
      assert.ok(idx >= 0 && idx < weights.length)
    }
  })

  it("weightedRandom with seeded PRNG produces deterministic match selection", () => {
    const rng1 = createPRNG(42)
    const rng2 = createPRNG(42)
    const seq1 = Array.from({ length: 200 }, () => weightedRandom(MATCH_WEIGHTS, rng1))
    const seq2 = Array.from({ length: 200 }, () => weightedRandom(MATCH_WEIGHTS, rng2))
    assert.deepEqual(seq1, seq2)
  })

  it("weightedRandom with seeded PRNG produces deterministic event-type selection", () => {
    const weights = EVENT_TYPES.map((e) => e.weight)
    const rng1 = createPRNG(123)
    const rng2 = createPRNG(123)
    const seq1 = Array.from({ length: 200 }, () => weightedRandom(weights, rng1))
    const seq2 = Array.from({ length: 200 }, () => weightedRandom(weights, rng2))
    assert.deepEqual(seq1, seq2)
  })

  it("hot-match weights sum correctly for 80/20 split", () => {
    const burstWeights = MATCH_WEIGHTS.map((w, i) => (i === 0 ? w * 4 : w * 0.5))
    const total = burstWeights.reduce((a, b) => a + b, 0)
    const match0Share = burstWeights[0] / total
    assert.ok(match0Share > 0.5, `match-001 share ${match0Share} should be > 50% in burst mode`)
    assert.ok(match0Share < 0.95, `match-001 share ${match0Share} should be < 95%`)
  })

  it("padToSize returns empty when payload already meets target", () => {
    const result = padToSize("hello world", 5)
    assert.equal(result, "")
  })

  it("padToSize pads to correct byte size", () => {
    const result = padToSize("hi", 10)
    assert.equal(Buffer.byteLength("hi" + result, "utf-8"), 10)
  })

  it("createEventPayload produces valid structure", () => {
    const event = createEventPayload("match-001", 42, "goal", { home: 2, away: 1 }, { period: "1H", elapsed_seconds: 1200 })
    assert.equal(event.match_id, "match-001")
    assert.equal(event.canonical_seq, 42)
    assert.equal(event.event_type, "goal")
    assert.equal(event.score.home, 2)
    assert.equal(event.score.away, 1)
    assert.ok(event.publish_timestamp.length > 0)
    assert.ok(event.description.length > 0)
  })

  it("goal events are ~350 bytes", () => {
    const event = createEventPayload("match-001", 1, "goal", { home: 0, away: 0 }, { period: "1H", elapsed_seconds: 0 })
    const size = Buffer.byteLength(JSON.stringify(event), "utf-8")
    assert.ok(size >= 340 && size <= 360, `goal payload size ${size} not in range 340-360`)
  })

  it("routine events are ~250 bytes", () => {
    const event = createEventPayload("match-001", 1, "corner", { home: 0, away: 0 }, { period: "1H", elapsed_seconds: 0 })
    const size = Buffer.byteLength(JSON.stringify(event), "utf-8")
    assert.ok(size >= 240 && size <= 260, `routine payload size ${size} not in range 240-260`)
  })

  it("createLobbyPayload produces valid structure", () => {
    const states = MATCH_IDS.map((id) => ({
      matchId: id,
      score: { home: 1, away: 0 },
      clock: { period: "1H", elapsed_seconds: 600 },
      lastEventType: "corner",
    }))
    const lobby = createLobbyPayload(states)
    assert.equal(lobby.matches.length, 8)
    assert.ok(lobby.timestamp.length > 0)
  })

  it("has 8 match IDs", () => {
    assert.equal(MATCH_IDS.length, 8)
  })

  it("has 8 event types", () => {
    assert.equal(EVENT_TYPES.length, 8)
  })
})
