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
const POC_V210 = path.join(REPO_ROOT, "poc/internal_docs/EXPERIMENT_CONTRACT_v2_1_0.md")
const POC_V211 = path.join(REPO_ROOT, "poc/internal_docs/EXPERIMENT_CONTRACT_v2_1_1.md")
const POC_V220 = path.join(REPO_ROOT, "poc/internal_docs/EXPERIMENT_CONTRACT_v2_2_0.md")
const POC_V230 = path.join(REPO_ROOT, "poc/internal_docs/EXPERIMENT_CONTRACT_v2_3_0.md")
const MILESTONES = path.join(REPO_ROOT, "internal_docs/LIVE_MATCH_CENTRE_ASSIGNMENT_MILESTONES (3).md")

function read(p: string): string {
  return readFileSync(p, "utf-8")
}

describe("contract governance", () => {
  it("exactly one canonical active contract exists and predecessors are historical", () => {
    // §v2.3.0: the full-population integrity contract is the canonical active
    // freeze. v2.2.0 and v2.1.1 are preserved BYTE-UNCHANGED as historical evidence; the
    // canonical producer must point at v2.3.0 and never back at a superseded
    // predecessor.
    const active = read(POC_V230)
    assert.match(active, /Status: \*\*FROZEN — CANONICAL ACTIVE\*\*/)
    assert.match(active, /Contract Version: v2\.3\.0/)
    assert.match(active, /Supersedes: v2\.2\.0/)
    // Predecessor preserved historically: original version marker intact.
    const pocV211 = read(POC_V211)
    assert.match(pocV211, /Status: \*\*FROZEN — CANONICAL ACTIVE\*\*/)
    assert.match(pocV211, /Contract Version: v2\.1\.1/)
    // The canonical producer points at exactly the active document.
    const producer = read(path.join(REPO_ROOT, "poc/runner/src/domain/active-contract.ts"))
    assert.match(producer, /ACTIVE_CONTRACT_FILENAME = "EXPERIMENT_CONTRACT_v2_3_0\.md"/)
    assert.doesNotMatch(producer, /EXPERIMENT_CONTRACT_v2_1_1\.md/)
    const pocV210 = read(POC_V210)
    assert.match(pocV210, /Contract Version: v2\.1\.0/)
    const pocV206 = read(POC_V206)
    assert.match(pocV206, /\[SUPERSEDED — HISTORICAL EVIDENCE ONLY\]/)
    assert.doesNotMatch(pocV206, /Status: \*\*FROZEN — CANONICAL ACTIVE\*\*/)
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
    assert.match(read(path.join(REPO_ROOT, "poc/runner/src/domain/active-contract.ts")), /ACTIVE_CONTRACT_VERSION = "v2\.3\.0"/)
  })

  it("freezes the partitioned fan-out acceptance-recovery semantics in v2.1.0", () => {
    const contract = read(POC_V210)
    for (const rule of [
      /partition\(shard i\) = i/,
      /each event\s+exactly\s+once, via partition p0/,
      /RESTART_TARGET_SHARD/,
      /paths\.spare_probe/,
      /paths\.failover_drill/,
      /oom_kill_events[^\n]*invalidates the run/,
      /seeds = 42, 43, 44/,
      /GLOBAL_RUNS = 3/,
      /late-join histogram count/,
      /87\.5% of NCHAN_MEMORY_GB/,
      /coefficient of variation <= 15%/,
      /INCONCLUSIVE > REJECT > ACCEPT/,
    ]) assert.match(contract, rule)
    assert.match(contract, /Milestone 3 remains the governing milestone/)
    assert.match(contract, /m3-c89159e88822-q5/)
  })

  it("freezes the post-v2.1.0 correction semantics in v2.1.1", () => {
    // §M3-RACE-3: v2.1.1 canonically incorporates every semantic correction
    // that drifted after the v2.1.0 freeze. No assignment threshold may be
    // weakened relative to the frozen v2.1.0 basis.
    const contract = read(POC_V211)
    for (const rule of [
      // pre-handler SSE frame buffering
      /pre-registration frame buffering is canonical/,
      /delivered exactly once, in order, when that handler attaches/,
      // true application-level pacing
      /offered events measured independently of application reads/,
      // true Last-Event-ID replay + all-selected-client validity
      /selected probe clients == successfully reattached probe clients/,
      /arithmetic over ALL selected probes/,
      /weakest client's recovery percentage is the gating value/,
      // partition-aware topology preflight
      /capacity is proven PER PARTITION NODE/,
      // partition-aware population/delivery accounting
      /sum exactly to the\s+global population/,
      // slow-client latency exclusion while intentionally deferred
      /excluded from global fan-out latency/,
      // catch-up drain != replay
      /catchup_drained_count/,
      /credited as Last-Event-ID/,
    ]) assert.match(contract, rule)
    // Assignment thresholds carried forward unweakened.
    for (const rule of [
      /fan_out_p95_ms\s+<= 500/,
      /surge_fan_out_p95_ms\s+<= 500/,
      /burst_fan_out_p95_ms\s+<= 1000/,
      /late_join_p95_ms\s+<= 2000/,
      /\+40,000 viewers within SURGE_SECONDS=120/,
      /aligned peak >= 100,000/,
      /seeds = 42, 43, 44/,
      /GLOBAL_RUNS = 3/,
    ]) assert.match(contract, rule)
  })

  it("freezes the lightweight-generator reset semantics in v2.2.0", () => {
    // §v2.2.0: assignment facts and POC methodology choices are separated;
    // the Go crowd generator + TS control-plane split is frozen; the
    // slow-client scenario is out of qualification.
    const contract = read(POC_V220)
    for (const rule of [
      /Part I — Assignment facts/,
      /Part II — POC methodology choices/,
      /Go load generators\s+poc\/loadgen/,
      /canonical match identity\s+match-001 \.\. match-008/,
      /MUST equal\s+MATCH_IDS/,
      /holds ZERO viewer connections/,
      /POST \/v1\/reset/,
      /POST \/v1\/start/,
      /POST \/v1\/stop/,
      /POST \/v1\/prefill/,
      /POST \/v1\/burst/,
      /GET  \/v1\/evidence/,
      /histograms\.goal_fan_out/,
      /histograms\.other_fan_out/,
      /exactly shard_count samples/,
      /Slow-client scenario — REMOVED from qualification/,
      />= 4,000 free ports computed from the/,
      /RUNTIME-measured range/,
      /generator-only benchmark/,
      /failure classifies as generator \| host\/kernel\/network \| DUT \|/,
    ]) assert.match(contract, rule)
    // Assignment thresholds carried forward unweakened.
    for (const rule of [
      /fan_out_p95_ms\s+<= 500/,
      /surge_fan_out_p95_ms\s+<= 500/,
      /burst_fan_out_p95_ms\s+<= 1000/,
      /late_join_p95_ms\s+<= 2000/,
      /\+40,000 viewers within 120 seconds/,
      /\+40,000 within SURGE_SECONDS=120/,
      /aligned peak >= 100,000/,
      /seeds = 42, 43, 44/,
      /GLOBAL_RUNS = 3/,
    ]) assert.match(contract, rule)
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
