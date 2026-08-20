import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { weightedRandom, MATCH_WEIGHTS } from "../domain/event.js"
import { createPRNG } from "../domain/prng.js"

describe("Hot-match burst weights", () => {
  it("burst weights produce ~80% match-001 distribution over 1000 iterations", () => {
    const burstWeights = MATCH_WEIGHTS.map((w, i) => (i === 0 ? w * 4 : w * 0.5))
    const total = burstWeights.reduce((a, b) => a + b, 0)
    const expectedShare = burstWeights[0] / total

    const rng = createPRNG(42)
    const iterations = 1000
    const counts = new Array(MATCH_WEIGHTS.length).fill(0)

    for (let i = 0; i < iterations; i++) {
      counts[weightedRandom(burstWeights, rng)]++
    }

    const match001Ratio = counts[0] / iterations
    assert.ok(match001Ratio > 0.5, `match-001 ratio ${match001Ratio} should be > 50%`)
    assert.ok(match001Ratio < 0.95, `match-001 ratio ${match001Ratio} should be < 95%`)
    assert.ok(Math.abs(match001Ratio - expectedShare) < 0.1,
      `match-001 ratio ${match001Ratio} too far from expected ${expectedShare}`)
  })
})
