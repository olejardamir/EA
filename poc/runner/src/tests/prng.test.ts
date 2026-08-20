import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createPRNG } from "../domain/prng.js"

describe("createPRNG", () => {
  it("same seed produces identical sequence", () => {
    const rng1 = createPRNG(42)
    const rng2 = createPRNG(42)
    const seq1 = Array.from({ length: 100 }, () => rng1())
    const seq2 = Array.from({ length: 100 }, () => rng2())
    assert.deepEqual(seq1, seq2)
  })

  it("different seeds produce different sequences", () => {
    const rng1 = createPRNG(1)
    const rng2 = createPRNG(2)
    const seq1 = Array.from({ length: 50 }, () => rng1())
    const seq2 = Array.from({ length: 50 }, () => rng2())
    const identical = seq1.every((v, i) => v === seq2[i])
    assert.ok(!identical, "sequences from different seeds should differ")
  })

  it("output is in [0, 1) range", () => {
    const rng = createPRNG(99)
    for (let i = 0; i < 10000; i++) {
      const v = rng()
      assert.ok(v >= 0, `value ${v} < 0`)
      assert.ok(v < 1, `value ${v} >= 1`)
    }
  })

  it("sequence is reproducible across calls", () => {
    const rng = createPRNG(7)
    const first = Array.from({ length: 20 }, () => rng())
    const rng2 = createPRNG(7)
    const second = Array.from({ length: 20 }, () => rng2())
    assert.deepEqual(first, second)
  })
})
