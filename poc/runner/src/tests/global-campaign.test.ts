import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { aggregateGlobalCampaign } from "../application/global-campaign.js"
import type { GlobalExperimentResult } from "../application/global-coordinator.js"
import { ACTIVE_CONTRACT_VERSION } from "../domain/active-contract.js"
import { validRestartStructuredEvidence } from "./restart-evidence-fixture.js"

const SHA = "64d0661cb607067f2b1dd59b25229c58a646f549"

function globalRun(index: number, overrides: Partial<GlobalExperimentResult> = {}): GlobalExperimentResult {
  return {
    contract_version: ACTIVE_CONTRACT_VERSION,
    aggregate_scope: "simultaneous_global_run",
    scope: "global",
    experiment_run_id: `run-${index}`,
    run_index: index,
    seed: 42 + index,
    participating_shard_ids: [0, 1, 2, 3],
    shard_count: 4,
    global_target: 100_000,
    publisher_owner_shard_id: 0,
    source_commit: SHA,
    phase_timings: {},
    active_population: {
      sample_bucket_ms: 1000,
      complete_aligned_bucket_count: 3,
      global_active_peak: 100_000,
      buckets: [],
      scenarios: {},
    },
    workload_rates: { events_published: 100, phase_rates: [] },
    histograms: {
      fan_out: { p50_ms: 10, p95_ms: 10, p99_ms: 10, max_ms: 10, count: 1, overflow_count: 0, distribution: { max_ms: 30_000, total_count: 1, overflow_count: 0, buckets: [[10, 1]] } },
      late_join: { p50_ms: 20, p95_ms: 20, p99_ms: 20, max_ms: 20, count: 1, overflow_count: 0, distribution: { max_ms: 30_000, total_count: 1, overflow_count: 0, buckets: [[20, 1]] } },
    },
    correctness_counters: { missing_sequences: 0 },
    per_shard_generator_validity: [],
    resources: { nchan: {}, redis: {} },
    scenario_results: [{
      name: "restart-replacement",
      passed: true,
      participant_shard_ids: [0],
      active_population: null,
      details: [{ shard_id: 0, detail: "exact restart paths", structured: validRestartStructuredEvidence() }],
    }],
    shard_results: [],
    validity: { valid: true, reasons: [] },
    verdict: "ACCEPT",
    global_direct_accept_eligible: true,
    ...overrides,
  }
}

describe("repeated simultaneous-global campaign aggregation", () => {
  it("keeps campaign, global-run, and shard dimensions distinct", () => {
    const result = aggregateGlobalCampaign([globalRun(0), globalRun(1), globalRun(2)])
    assert.equal(result.aggregate_scope, "campaign")
    assert.equal(result.contract_version, ACTIVE_CONTRACT_VERSION)
    assert.equal(result.run_count, 3)
    assert.deepEqual(result.run_indices, [0, 1, 2])
    assert.equal(result.histograms.fan_out.count, 3)
    assert.equal(result.verdict, "ACCEPT")
    assert.equal(result.global_direct_accept_eligible, true)
    assert.equal(result.global_target, 100_000)
    assert.equal(result.source_commit, SHA)
    assert.ok(result.global_runs.every((run) => run.aggregate_scope === "simultaneous_global_run"))
  })

  it("makes unstable cross-run dispersion inconclusive", () => {
    const result = aggregateGlobalCampaign([
      globalRun(0),
      globalRun(1),
      globalRun(2, { active_population: { ...globalRun(2).active_population, global_active_peak: 200_000 } }),
    ])
    assert.equal(result.dispersion.stable, false)
    assert.equal(result.verdict, "INCONCLUSIVE")
    assert.equal(result.global_direct_accept_eligible, false)
  })

  it("uses the frozen sample-variance CV formula", () => {
    const result = aggregateGlobalCampaign([
      globalRun(0, { active_population: { ...globalRun(0).active_population, global_active_peak: 84_000 } }),
      globalRun(1),
      globalRun(2, { active_population: { ...globalRun(2).active_population, global_active_peak: 116_000 } }),
    ])
    // Sample CV is 16%; population CV would be about 13.1% and would falsely pass.
    assert.equal(result.dispersion.metrics.global_active_peak, 0.16)
    assert.equal(result.dispersion.stable, false)
    assert.equal(result.verdict, "INCONCLUSIVE")
  })

  it("propagates a conclusive global-run rejection after stable repetition", () => {
    const result = aggregateGlobalCampaign([globalRun(0), globalRun(1, { verdict: "REJECT", global_direct_accept_eligible: false }), globalRun(2)])
    assert.equal(result.dispersion.stable, true)
    assert.equal(result.verdict, "REJECT")
  })

  it("rejects missing global-run inputs", () => {
    const result = aggregateGlobalCampaign([globalRun(0), globalRun(1)])
    assert.equal(result.validity.valid, false)
    assert.equal(result.verdict, "INCONCLUSIVE")
    assert.match(result.validity.reasons.join(" "), /outside frozen 3\.\.8 range/)
  })

  it("rejects a global run governed by a stale contract", () => {
    const stale = { ...globalRun(1), contract_version: "v2.0.4" } as unknown as GlobalExperimentResult
    const result = aggregateGlobalCampaign([globalRun(0), stale, globalRun(2)])
    assert.equal(result.validity.valid, false)
    assert.equal(result.verdict, "INCONCLUSIVE")
    assert.match(result.validity.reasons.join(" "), new RegExp(ACTIVE_CONTRACT_VERSION))
  })

  it("does not let stale global ACCEPT booleans bypass exact restart evidence", () => {
    const stale = globalRun(1)
    const structured = stale.scenario_results[0].details[0].structured as ReturnType<typeof validRestartStructuredEvidence>
    structured.paths.cross_node.received_required_count = 7
    structured.paths.cross_node.missing_required = 1
    structured.paths.cross_node.missing_required_sequences = [17]
    structured.paths.cross_node.target_reached = false
    structured.paths.cross_node.passed = false

    const result = aggregateGlobalCampaign([globalRun(0), stale, globalRun(2)])
    assert.equal(result.validity.valid, false)
    assert.equal(result.verdict, "INCONCLUSIVE")
    assert.equal(result.global_direct_accept_eligible, false)
    assert.match(result.validity.reasons.join(" "), /missing exact restart structured evidence: 1/)
  })
})
