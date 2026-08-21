import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

// §M2-4.2: Static contract/governance tests. These prove the governance chain
// (one canonical active contract, correct pointers, no contradictory active
// freezes) directly against repository files.

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")
const CANONICAL = path.join(REPO_ROOT, "internal_docs/LIVE_MATCH_CENTRE_POC_EXPERIMENT_CONTRACT_v2_0_5.md")
const STALE_V204 = path.join(REPO_ROOT, "internal_docs/LIVE_MATCH_CENTRE_POC_EXPERIMENT_CONTRACT_v2_0_4.md")
const POC_V204 = path.join(REPO_ROOT, "poc/internal_docs/EXPERIMENT_CONTRACT_v2_0_4.md")
const POC_V205_REFERENCE = path.join(REPO_ROOT, "poc/internal_docs/EXPERIMENT_CONTRACT_v2_0_5.md")
const POC_V206 = path.join(REPO_ROOT, "poc/internal_docs/EXPERIMENT_CONTRACT_v2_0_6.md")
const MILESTONES = path.join(REPO_ROOT, "internal_docs/LIVE_MATCH_CENTRE_ASSIGNMENT_MILESTONES (3).md")

function read(p: string): string {
  return readFileSync(p, "utf-8")
}

describe("contract governance", () => {
  it("exactly one canonical active successor contract exists", () => {
    const s = read(POC_V206)
    assert.match(s, /Status: \*\*FROZEN — CANONICAL ACTIVE\*\*/)
    assert.match(s, /Contract Version: v2\.0\.6/)
    const pocReference = read(POC_V205_REFERENCE)
    assert.match(pocReference, /NON-CANONICAL IMPLEMENTATION REFERENCE/)
    assert.match(pocReference, /LIVE_MATCH_CENTRE_POC_EXPERIMENT_CONTRACT_v2_0_5\.md/)
    assert.doesNotMatch(pocReference, /Status:.*canonical active/i)
  })

  it("both v2.0.4 documents are historical and the frozen POC body is unmodified", () => {
    const stale = read(STALE_V204)
    assert.match(stale, /\[SUPERSEDED — HISTORICAL EVIDENCE ONLY\]/)
    assert.match(stale, /MUST NOT be referenced\s+(?:>\s*)?as active\./)

    // §M2-3.1D: no second document may claim active status. The banner is a
    // governance header; the frozen body below it stays byte-identical.
    const pocHistorical = read(POC_V204)
    assert.match(pocHistorical, /^> \*\*\[SUPERSEDED — HISTORICAL EVIDENCE ONLY\]\*\*/)
    assert.match(pocHistorical, /MUST NOT be referenced\s+(?:>\s*)?as active\./)
    assert.ok(
      pocHistorical.indexOf("SUPERSEDED") < pocHistorical.indexOf("# Experiment Contract v2.0.4"),
      "banner must precede the frozen body",
    )
    const canonical = read(CANONICAL)
    assert.match(canonical, /poc\/internal_docs\/EXPERIMENT_CONTRACT_v2_0_4\.md/)
    assert.match(canonical, /both are preserved as historical evidence/)
  })

  it("the milestone document points to the canonical v2.0.5 as active", () => {
    const s = read(MILESTONES)
    assert.match(s, /Active contract:\*\* `internal_docs\/LIVE_MATCH_CENTRE_POC_EXPERIMENT_CONTRACT_v2_0_5\.md`/)
    assert.doesNotMatch(s, /LIVE_MATCH_CENTRE_POC_EXPERIMENT_CONTRACT_v2_0_4\.md \(active\)/)
  })

  it("no active document freezes the stale 28k x 4 topology", () => {
    const canonical = read(CANONICAL)
    assert.match(canonical, /25,000 viewer connections per shard/)
    assert.match(canonical, /100,000 exact/)
    // Stale values may appear only as historical description; they must never
    // be phrased as the frozen per-shard target or aggregate.
    assert.doesNotMatch(canonical, /per-shard target[^|]*28,000/)
    assert.doesNotMatch(canonical, /28,000 connections per shard/)
    assert.doesNotMatch(canonical, /local target[s]? of 28,000/)
    assert.doesNotMatch(canonical, /112,000 aggregate connections/)
  })

  it("no active document says RUN_MODE=single for the coordinated 100k path", () => {
    const canonical = read(CANONICAL)
    assert.match(canonical, /RUN_MODE=coordinated-shard for every participating shard/)
  })

  it("one-publisher, global-barrier, and global-aggregate semantics are frozen", () => {
    const canonical = read(CANONICAL)
    assert.match(canonical, /exactly one publisher-owner shard/)
    assert.match(canonical, /coordinated `start` and `end` barriers/)
    assert.match(canonical, /lossless serialized-distribution merge/)
    assert.match(canonical, /simultaneous-global-run verdict/)
    assert.match(canonical, /3–8 repeated global runs/)
  })

  it("slow-client pacing is frozen as the executable 1600–2400 ms tolerance", () => {
    const canonical = read(CANONICAL)
    assert.match(canonical, /1600 ms ≤ each intended client's median ≤ 2400 ms/)
    assert.match(canonical, /medians merely >1 s do NOT pass/)
  })

  it("restart exact-range semantics are frozen", () => {
    const canonical = read(CANONICAL)
    assert.match(canonical, /expected_first_seq ≤ seq ≤ expected_last_seq/)
    assert.match(canonical, /can never repair a missing required seq/)
    assert.match(canonical, /total frame count is never proof of replay completeness/)
  })

  it("machine outputs use the one canonical contract-version producer", () => {
    const producers = [
      "poc/runner/src/main.ts",
      "poc/runner/src/application/evidence-suite.ts",
      "poc/runner/src/application/result-printer.ts",
      "poc/runner/src/application/global-coordinator.ts",
      "poc/runner/src/application/global-campaign.ts",
    ]
    for (const relative of producers) {
      const source = read(path.join(REPO_ROOT, relative))
      assert.match(source, /ACTIVE_CONTRACT_VERSION/, `${relative} must use the canonical producer`)
      assert.doesNotMatch(source, /contract_version:\s*["']v2\.0\./, `${relative} must not hard-code a version`)
    }
    assert.match(read(path.join(REPO_ROOT, "poc/runner/src/domain/active-contract.ts")), /ACTIVE_CONTRACT_VERSION = "v2\.0\.6"/)
  })

  it("freezes the post-q5 correction semantics and Terminal A decision inside poc", () => {
    const contract = read(POC_V206)
    for (const rule of [
      /Nchan cgroup `oom_kill` delta is direct DUT capacity evidence and yields REJECT/,
      /Exactly one publisher-owner late-join sample is required per valid simultaneous global run/,
      /Empty or missing distributions cannot pass/,
      /Signal exits are encoded as 128 \+ signal number/,
    ]) assert.match(contract, rule)
    const reconciliation = read(path.join(REPO_ROOT, "poc/internal_docs/MILESTONE_4_INCONCLUSIVE_RECONCILIATION.md"))
    assert.match(reconciliation, /Decision: \*\*Terminal A/)
    assert.match(reconciliation, /q5 did not validate the architecture and its machine verdict did not reject it/)
  })
})
