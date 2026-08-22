import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { runIndependentAudit, renderAuditMarkdown, type AuditPolicy } from "../independent-verdict-audit.js"
import { aggregateGlobalCampaign } from "../application/global-campaign.js"
import type { GlobalExperimentResult, ShardExperimentResult } from "../application/global-coordinator.js"
import { ACTIVE_CONTRACT_VERSION } from "../domain/active-contract.js"
import { validTimingEvidence } from "./timing-evidence-fixture.js"
import { validPublisherEvidence } from "./publisher-evidence-fixture.js"
import { validResourceStages, validRedisEvidence, validDeepAgreement, validCorrectnessCounters } from "./resource-evidence-fixture.js"
import {
  bystanderRestartStructuredEvidence,
  validOwnerRestartStructuredEvidence,
  validTargetRestartStructuredEvidence,
} from "./restart-evidence-fixture.js"

const SHA = "64d0661cb607067f2b1dd59b25229c58a646f549"
const POLICY: AuditPolicy = { campaign_id: "campaign-1", source_commit: SHA, base_seed: 42 }

function auditShard(index: number, shardId: number): ShardExperimentResult {
  const owner = shardId === 0
  const restartIdentity = { campaign_id: "campaign-1", experiment_run_id: `campaign-1-global-${index}`, run_index: index }
  const restartStructured = owner
    ? validOwnerRestartStructuredEvidence({ ...restartIdentity, shard_id: 0 })
    : shardId === 3
      ? validTargetRestartStructuredEvidence({ ...restartIdentity, shard_id: 3 })
      : bystanderRestartStructuredEvidence()
  return {
    contract_version: ACTIVE_CONTRACT_VERSION,
    aggregate_scope: "shard",
    scope: "shard",
    global_direct_accept_eligible: false,
    experiment_run_id: `campaign-1-global-${index}`,
    campaign_id: "campaign-1",
    run_index: index,
    shard_id: shardId,
    shard_count: 4,
    local_target: 25_000,
    global_target: 100_000,
    seed: 42 + index,
    source_commit: SHA,
    publisher_owner: owner,
    verdict: "ACCEPT",
    validity: { generator_valid: true, source_port_headroom_valid: true, nginx_worker_capacity_valid: true, environment_valid: true, timing_valid: true, reasons: [] },
    samples: [],
    histograms: {
      fan_out: { max_ms: 30_000, total_count: 3, overflow_count: 0, buckets: [[10, 1], [15, 1], [30, 1]] },
      goal_fan_out: { max_ms: 30_000, total_count: 1, overflow_count: 0, buckets: [[10, 1]] },
      other_fan_out: { max_ms: 30_000, total_count: 1, overflow_count: 0, buckets: [[15, 1]] },
      late_join: { max_ms: 30_000, total_count: 64, overflow_count: 0, buckets: [[20, 64]] },
      burst: { max_ms: 30_000, total_count: 1, overflow_count: 0, buckets: [[30, 1]] },
      surge_fan_out: { max_ms: 30_000, total_count: 2, overflow_count: 0, buckets: [[25, 2]] },
    },
    correctness_counters: validCorrectnessCounters(),
    workload: { events_published: owner ? 100 : 0, phase_rates: [] },
    resources: { generator: { timing: validTimingEvidence(), publisher: validPublisherEvidence(), resource_stages: validResourceStages(), deep_agreement: validDeepAgreement() }, nchan: { memory_peak_run_bytes: 1000 }, redis: validRedisEvidence() },
    scenarios: [
      {
        name: "restart-replacement",
        participated: owner || shardId === 3,
        passed: true,
        detail: owner ? "exact spare-probe evidence" : shardId === 3 ? "exact failover-drill evidence" : "not-participating",
        structured: restartStructured,
      },
      {
        name: "reconnect",
        participated: true,
        passed: true,
        detail: "all clients re-established",
        structured: { selected: 64, ready_before_hold: 64, missing_raw_id: 0, released: 64, evaluated: 64, passed: 64, failed: 0, missing_results: 0 },
      },
      {
        name: "surge",
        participated: true,
        passed: true,
        detail: "surge complete",
        structured: {
          surge_start_active: 15_000,
          surge_attempted_additions: 10_000,
          surge_established_additions: 10_000,
          surge_failed_additions: 0,
          surge_elapsed_ms: 90_000,
          surge_final_active: 25_000,
          surge_peak_active: 26_000,
        },
      },
    ],
  }
}

export function auditGlobalRun(index: number, overrides: Partial<GlobalExperimentResult> = {}): GlobalExperimentResult {
  return {
    contract_version: ACTIVE_CONTRACT_VERSION,
    aggregate_scope: "simultaneous_global_run",
    scope: "global",
    experiment_run_id: `campaign-1-global-${index}`,
    campaign_id: "campaign-1",
    created_at_ms: 1_700_000_000_000 + index,
    run_index: index,
    seed: 42 + index,
    participating_shard_ids: [0, 1, 2, 3],
    shard_count: 4,
    global_target: 100_000,
    publisher_owner_shard_id: 0,
    source_commit: SHA,
    phase_timings: Object.fromEntries(
      ["preflight", "warmup", "steady", "surge", "target-barrier", "stabilization", "late-join", "burst", "post-burst", "reconnect", "restart-replacement", "final-metrics"]
        .map((phase, phaseIndex) => [phase, { start_ms: phaseIndex * 1000, end_ms: phaseIndex * 1000 + 500, duration_ms: 500 }]),
    ),
    active_population: {
      sample_bucket_ms: 1000,
      complete_aligned_bucket_count: 3,
      global_active_peak: 100_000,
      buckets: [],
      scenarios: {},
    },
    workload_rates: { events_published: 100, phase_rates: [] },
    histograms: {
      fan_out: { p50_ms: 10, p95_ms: 10, p99_ms: 10, max_ms: 10, count: 3, overflow_count: 0, distribution: { max_ms: 30_000, total_count: 3, overflow_count: 0, buckets: [[10, 3]] } },
      goal_fan_out: { p50_ms: 10, p95_ms: 10, p99_ms: 10, max_ms: 10, count: 1, overflow_count: 0, distribution: { max_ms: 30_000, total_count: 1, overflow_count: 0, buckets: [[10, 1]] } },
      other_fan_out: { p50_ms: 10, p95_ms: 10, p99_ms: 10, max_ms: 10, count: 1, overflow_count: 0, distribution: { max_ms: 30_000, total_count: 1, overflow_count: 0, buckets: [[15, 1]] } },
      late_join: { p50_ms: 20, p95_ms: 20, p99_ms: 20, max_ms: 20, count: 256, overflow_count: 0, distribution: { max_ms: 30_000, total_count: 256, overflow_count: 0, buckets: [[20, 256]] } },
      burst: { p50_ms: 30, p95_ms: 30, p99_ms: 30, max_ms: 30, count: 4, overflow_count: 0, distribution: { max_ms: 30_000, total_count: 4, overflow_count: 0, buckets: [[30, 4]] } },
      surge_fan_out: { p50_ms: 25, p95_ms: 25, p99_ms: 25, max_ms: 25, count: 8, overflow_count: 0, distribution: { max_ms: 30_000, total_count: 8, overflow_count: 0, buckets: [[25, 8]] } },
    },
    correctness_counters: validCorrectnessCounters(),
    per_shard_generator_validity: [0, 1, 2, 3].map((shard_id) => ({
      shard_id,
      validity: { generator_valid: true, source_port_headroom_valid: true, nginx_worker_capacity_valid: true, environment_valid: true, timing_valid: true, reasons: [] },
    })),
    resources: {
      nchan_partitions: [0, 1, 2, 3].map((shard_id) => ({ shard_id, partition_id: shard_id, evidence: { memory_peak_run_bytes: 1000 } as Record<string, number | null> })),
      nchan_spare: { memory_current_bytes: 1000, memory_peak_bytes: 1100 },
      redis: { memory_used_bytes: 500 },
    },
    scenario_results: [],
    shard_results: [0, 1, 2, 3].map((shardId) => auditShard(index, shardId)),
    validity: { valid: true, reasons: [] },
    verdict: "ACCEPT",
    global_direct_accept_eligible: true,
    ...overrides,
  }
}

function passingCampaign(runs: GlobalExperimentResult[]) {
  return aggregateGlobalCampaign(runs, {
    campaign_id: "campaign-1",
    source_commit: SHA,
    run_count: 3,
    base_seed: 42,
    started_at_ms: 0,
  })
}

describe("R19 independent verdict audit", () => {
  it("all checks PASS on fully conforming frozen-campaign evidence and agree with machine ACCEPT", () => {
    const runs = [0, 1, 2].map((index) => auditGlobalRun(index))
    const campaign = passingCampaign(runs)
    assert.equal(campaign.verdict, "ACCEPT", JSON.stringify(campaign.validity.reasons))
    const result = runIndependentAudit(runs, campaign, POLICY)
    const failures = result.checks.filter((check) => !check.pass)
    assert.deepEqual(failures.map((check) => check.name), [], JSON.stringify(failures))
    assert.equal(result.independent_verdict, "PASS")
    assert.equal(result.machine_verdict, "ACCEPT")
    assert.equal(result.agreement, true)
  })

  it("FAILS when a mandatory correctness counter is nonzero even if the machine claims ACCEPT", () => {
    const runs = [0, 1, 2].map((index) => auditGlobalRun(index))
    runs[1] = auditGlobalRun(1, {
      correctness_counters: { ...validCorrectnessCounters(), duplicates: 3 },
    })
    const result = runIndependentAudit(runs, null, POLICY)
    const correctness = result.checks.find((check) => check.name === "correctness zero")
    assert.ok(correctness && !correctness.pass)
    assert.equal(result.independent_verdict, "FAIL")
    assert.equal(result.agreement, false)
  })

  it("FAILS when the machine ACCEPT hides a wrong seed", () => {
    const runs = [auditGlobalRun(0), auditGlobalRun(1), auditGlobalRun(2, { seed: 45 })]
    const result = runIndependentAudit(runs, null, POLICY)
    const seeds = result.checks.find((check) => check.name === "seeds 42/43/44")
    assert.ok(seeds && !seeds.pass)
    assert.equal(result.agreement, false)
  })

  it("FAILS when the stored campaign verdict disagrees with the independently recomputed rule", () => {
    const runs = [0, 1, 2].map((index) => auditGlobalRun(index))
    const campaign = { ...passingCampaign(runs), verdict: "INCONCLUSIVE" as const }
    const result = runIndependentAudit(runs, campaign, POLICY)
    const consistency = result.checks.find((check) => check.name === "campaign verdict consistency")
    assert.ok(consistency && !consistency.pass)
    assert.equal(result.agreement, false)
  })

  it("detects tampered dispersion metrics (CV formula check)", () => {
    const runs = [0, 1, 2].map((index) => auditGlobalRun(index))
    const campaign = passingCampaign(runs)
    const tampered = {
      ...campaign,
      dispersion: { ...campaign.dispersion, worst_cv: 0.01, stable: true },
    }
    const result = runIndependentAudit(runs, tampered, POLICY)
    const formula = result.checks.find((check) => check.name === "CV formula")
    assert.ok(formula && !formula.pass)
  })

  it("flags reconnect denominator drift on one shard of one run", () => {
    const runs = [0, 1, 2].map((index) => auditGlobalRun(index))
    const shard = runs[2].shard_results[1]
    const rec = shard.scenarios.find((scenario) => scenario.name === "reconnect")!
    ;(rec.structured as Record<string, unknown>)["passed"] = 63
    const result = runIndependentAudit(runs, null, POLICY)
    const reconnect = result.checks.find((check) => check.name === "reconnect exact denominator")
    assert.ok(reconnect && !reconnect.pass)
  })

  it("flags latejoin over-sampling (769 is not 768)", () => {
    const runs = [0, 1, 2].map((index) => auditGlobalRun(index))
    runs[2] = auditGlobalRun(2, {
      histograms: {
        ...auditGlobalRun(2).histograms,
        late_join: { p50_ms: 20, p95_ms: 20, p99_ms: 20, max_ms: 20, count: 257, overflow_count: 0, distribution: { max_ms: 30_000, total_count: 257, overflow_count: 0, buckets: [[20, 257]] } },
      },
    })
    const result = runIndependentAudit(runs, null, POLICY)
    const lateJoin256 = result.checks.find((check) => check.name === "latejoin 256/run")
    const lateJoin768 = result.checks.find((check) => check.name === "latejoin 768/campaign")
    assert.ok(lateJoin256 && !lateJoin256.pass)
    assert.ok(lateJoin768 && !lateJoin768.pass)
  })

  it("rendered markdown lists every check with pass/fail and disagreement notice on failure", () => {
    const runs = [0, 1, 2].map((index) => auditGlobalRun(index))
    const good = runIndependentAudit(runs, passingCampaign(runs), POLICY)
    const markdown = renderAuditMarkdown(good, { campaign_id: "campaign-1", source_commit: SHA, generated_at_ms: 1 })
    for (const name of ["contract identity", "source identity", "exact 3 runs", "seeds 42/43/44", "4 shards", "publisher owner", "phase completeness", "60k baseline", "+40k established <=120s", "100k full target", "mandatory correctness fields present", "correctness zero", "surge correctness", "reconnect exact denominator", "restart measured deltas", "latejoin 256/run", "latejoin 768/campaign", "deep 1024/1024", "latency thresholds", "publisher workload/rates", "generator validity", "Nchan p0..p3 validity", "spare validity", "Redis validity", "CV formula", "CV <=0.15", "per-run verdict consistency", "campaign verdict consistency"]) {
      assert.ok(markdown.includes(`| ${name} |`), `missing check row: ${name}`)
    }
    assert.ok(markdown.includes("AGREES"))
  })
})
