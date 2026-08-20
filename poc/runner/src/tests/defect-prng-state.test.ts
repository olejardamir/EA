import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createPRNG } from "../domain/prng.js"
import { weightedRandom, MATCH_WEIGHTS, MATCH_IDS } from "../domain/event.js"
import { advanceMatchState, createInitialMatchStates } from "../domain/match-state.js"

describe("PRNG seed determinism (Defect 2)", () => {
  it("seed 42 produces identical sequence for match state advancement", () => {
    const rng1 = createPRNG(42)
    const rng2 = createPRNG(42)
    const states1 = createInitialMatchStates()
    const states2 = createInitialMatchStates()

    for (let i = 0; i < 100; i++) {
      const idx = weightedRandom(MATCH_WEIGHTS, rng1)
      advanceMatchState(states1[idx], "corner", rng1)
    }
    for (let i = 0; i < 100; i++) {
      const idx = weightedRandom(MATCH_WEIGHTS, rng2)
      advanceMatchState(states2[idx], "corner", rng2)
    }

    for (let i = 0; i < states1.length; i++) {
      assert.equal(states1[i].seq, states2[i].seq, `match ${i} seq should match`)
    }
  })

  it("different seeds produce different match state advancement", () => {
    const rng1 = createPRNG(1)
    const rng2 = createPRNG(99)
    const states1 = createInitialMatchStates()
    const states2 = createInitialMatchStates()

    for (let i = 0; i < 100; i++) {
      const idx = weightedRandom(MATCH_WEIGHTS, rng1)
      advanceMatchState(states1[idx], "goal", rng1)
    }
    for (let i = 0; i < 100; i++) {
      const idx = weightedRandom(MATCH_WEIGHTS, rng2)
      advanceMatchState(states2[idx], "goal", rng2)
    }

    const allSame = states1.every((s, i) => s.seq === states2[i].seq)
    assert.ok(!allSame, "different seeds should produce different advancement")
  })
})

describe("Burst hot-match weight distribution", () => {
  it("burst weights produce ~80% match-001 with seeded PRNG", () => {
    const burstWeights = [80, 20 / 7, 20 / 7, 20 / 7, 20 / 7, 20 / 7, 20 / 7, 20 / 7]
    const total = burstWeights.reduce((a, b) => a + b, 0)
    const expectedShare = burstWeights[0] / total

    const rng = createPRNG(42)
    const iterations = 1000
    const counts = new Array(8).fill(0)

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
