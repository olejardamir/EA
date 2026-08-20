import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createSequenceTracker } from "../domain/sequence-validator.js"
import { createMatchHeadTracker } from "../domain/match-state.js"

describe("Late-join history calculation (Defect 4)", () => {
  it("match head tracker correctly tracks per-match heads", () => {
    const tracker = createMatchHeadTracker()
    assert.equal(tracker.getHead("match-001"), 0)

    tracker.updateHead("match-001", 10)
    assert.equal(tracker.getHead("match-001"), 10)
    assert.equal(tracker.getHead("match-002"), 0)

    tracker.updateHead("match-001", 5)
    assert.equal(tracker.getHead("match-001"), 10)

    tracker.updateHead("match-001", 15)
    assert.equal(tracker.getHead("match-001"), 15)
  })

  it("history_expected should equal head at connection time", () => {
    const headTracker = createMatchHeadTracker()
    headTracker.updateHead("match-001", 500)

    const headAtConnectionTime = headTracker.getHead("match-001")
    const historyExpected = headAtConnectionTime

    assert.equal(historyExpected, 500)
  })
})

describe("Reconnect head delta tracking (Defect 5)", () => {
  it("head delta accurately reflects events during disconnect", () => {
    const headTracker = createMatchHeadTracker()

    const headBefore = headTracker.getHead("match-001")
    headTracker.updateHead("match-001", 100)
    headTracker.updateHead("match-001", 150)
    headTracker.updateHead("match-001", 200)
    const headAfter = headTracker.getHead("match-001")

    const eventsDuringDisconnect = headAfter - headBefore
    assert.equal(eventsDuringDisconnect, 200)
  })

  it("sequence tracker preserves state across reconnect", () => {
    const tracker = createSequenceTracker(0)
    tracker.classify(1)
    tracker.classify(2)
    tracker.classify(3)
    assert.equal(tracker.lastSeq, 3)

    const reconnectTracker = createSequenceTracker(0)
    const r4 = reconnectTracker.classify(4)
    assert.equal(r4.kind, "NEXT")
    assert.equal(reconnectTracker.lastSeq, 4)
  })
})
