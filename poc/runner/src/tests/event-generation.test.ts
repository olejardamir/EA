import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  weightedRandom, padToSize, createEventPayload, createLobbyPayload,
  MATCH_IDS, EVENT_TYPES,
} from "../domain/event.js"

describe("Event generation", () => {
  it("weightedRandom returns valid index", () => {
    const weights = [1, 2, 3]
    for (let i = 0; i < 100; i++) {
      const idx = weightedRandom(weights)
      assert.ok(idx >= 0 && idx < weights.length)
    }
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
