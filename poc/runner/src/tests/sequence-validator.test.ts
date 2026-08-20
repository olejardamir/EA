import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createSequenceTracker } from "../domain/sequence-validator.js"

describe("SequenceTracker", () => {
  it("classifies 1->2 as NEXT", () => {
    const t = createSequenceTracker(0)
    const r1 = t.classify(1)
    assert.equal(r1.kind, "NEXT")
    const r2 = t.classify(2)
    assert.equal(r2.kind, "NEXT")
    assert.equal(t.lastSeq, 2)
  })

  it("classifies 2->2 as DUPLICATE", () => {
    const t = createSequenceTracker(0)
    t.classify(2)
    const r = t.classify(2)
    assert.equal(r.kind, "DUPLICATE")
    assert.equal(t.lastSeq, 2)
  })

  it("classifies 2->4 as GAP(3,4)", () => {
    const t = createSequenceTracker(0)
    t.classify(2)
    const r = t.classify(4)
    assert.equal(r.kind, "GAP")
    if (r.kind === "GAP") {
      assert.equal(r.expected, 3)
      assert.equal(r.received, 4)
    }
    assert.equal(t.lastSeq, 4)
  })

  it("classifies 4->3 as OUT_OF_ORDER", () => {
    const t = createSequenceTracker(0)
    t.classify(4)
    const r = t.classify(3)
    assert.equal(r.kind, "OUT_OF_ORDER")
    assert.equal(t.lastSeq, 4)
  })

  it("handles initial seq=0 (first event is always NEXT)", () => {
    const t = createSequenceTracker(0)
    const r = t.classify(100)
    assert.equal(r.kind, "NEXT")
    assert.equal(t.lastSeq, 100)
  })

  it("can be reset", () => {
    const t = createSequenceTracker(0)
    t.classify(5)
    assert.equal(t.lastSeq, 5)
    t.reset(0)
    assert.equal(t.lastSeq, 0)
    const r = t.classify(1)
    assert.equal(r.kind, "NEXT")
  })

  it("reconnect scenario: 1->2->3, disconnect, reconnect, get 2->3->4", () => {
    const t = createSequenceTracker(0)
    t.classify(1)
    t.classify(2)
    t.classify(3)

    // Disconnect, create new tracker for reconnect
    const t2 = createSequenceTracker(0)
    // Replayed events: 2,3 are duplicates
    const r2 = t2.classify(2)
    assert.equal(r2.kind, "NEXT") // first event on new tracker
    const r3 = t2.classify(3)
    assert.equal(r3.kind, "NEXT")
    // New event: 4
    const r4 = t2.classify(4)
    assert.equal(r4.kind, "NEXT")
  })

  it("reconnect: proper resume preserves Last-Event-ID state", () => {
    const t = createSequenceTracker(0)
    t.classify(1)
    t.classify(2)
    t.classify(3)
    // lastSeq is 3, so reconnect should start from 4

    // On reconnect with Last-Event-ID=3, Nchan sends from seq 4
    const t2 = createSequenceTracker(0)
    const r4 = t2.classify(4)
    assert.equal(r4.kind, "NEXT")
    const r5 = t2.classify(5)
    assert.equal(r5.kind, "NEXT")
  })
})
