import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { evaluateRestartRequiredRange } from "../scenarios/nchan-restart.js"

const EXACT = [10, 11, 12, 13, 14, 15, 16, 17]

function evaluate(receivedSequences: number[]) {
  return evaluateRestartRequiredRange({
    transportResumeId: "transport-9",
    expectedFirstSeq: 10,
    expectedLastSeq: 17,
    receivedSequences,
    recoveryMs: 25,
  })
}

for (const path of ["literal_restart", "cross_node"] as const) {
  describe(`${path} exact frozen replay range`, () => {
    it("passes exactly 10..17 in order", () => {
      const result = evaluate(EXACT)
      assert.equal(result.passed, true)
      assert.equal(result.target_reached, true)
      assert.equal(result.received_required_count, 8)
      assert.equal(result.missing_required, 0)
      assert.deepEqual(result.missing_required_sequences, [])
    })

    it("rejects a later live sequence substituted for the final required sequence", () => {
      const result = evaluate([10, 11, 12, 13, 14, 15, 16, 18])
      assert.equal(result.passed, false)
      assert.equal(result.target_reached, false)
      assert.equal(result.received_required_count, 7)
      assert.deepEqual(result.missing_required_sequences, [17])
      assert.equal(result.out_of_range_after_count, 1)
    })

    it("rejects a missing middle sequence even when a later live frame preserves total count", () => {
      const result = evaluate([10, 11, 13, 14, 15, 16, 17, 18])
      assert.equal(result.passed, false)
      assert.equal(result.target_reached, false)
      assert.equal(result.received_required_count, 7)
      assert.equal(result.missing_required, 1)
      assert.deepEqual(result.missing_required_sequences, [12])
    })

    it("rejects a missing prefix", () => {
      const result = evaluate([11, 12, 13, 14, 15, 16, 17, 18])
      assert.equal(result.passed, false)
      assert.equal(result.missing_prefix, true)
      assert.deepEqual(result.missing_required_sequences, [10])
    })

    it("rejects a duplicate required sequence", () => {
      const result = evaluate([10, 11, 12, 12, 13, 14, 15, 16, 17])
      assert.equal(result.passed, false)
      assert.equal(result.target_reached, true)
      assert.equal(result.duplicates, 1)
      assert.equal(result.received_required_count, 8)
    })

    it("rejects required sequences received out of order", () => {
      const result = evaluate([10, 11, 13, 12, 14, 15, 16, 17])
      assert.equal(result.passed, false)
      assert.equal(result.target_reached, true)
      assert.equal(result.out_of_order, 1)
    })

    it("never counts out-of-range frames as required", () => {
      const result = evaluate([9, 10, 11, 12, 13, 14, 15, 16, 18])
      assert.equal(result.received_required_count, 7)
      assert.equal(result.missing_required, 1)
      assert.equal(result.out_of_range_before_count, 1)
      assert.equal(result.out_of_range_after_count, 1)
      assert.equal(result.passed, false)
    })
  })
}
