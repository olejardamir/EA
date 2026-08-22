import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { aggregateGlobalCampaign } from "../application/global-campaign.js"
import type { GlobalExperimentResult, ShardExperimentResult } from "../application/global-coordinator.js"
import { ACTIVE_CONTRACT_VERSION } from "../domain/active-contract.js"
import {
  bystanderRestartStructuredEvidence,
  validOwnerRestartStructuredEvidence,
  validTargetRestartStructuredEvidence,
} from "./restart-evidence-fixture.js"

const SHA = "64d0661cb607067f2b1dd59b25229c58a646f549"

function campaignShard(index: number, shardId: number): ShardExperimentResult {
  const owner = shardId === 0
  // §v2.1.0 role model with shard_count=4: shard 0 = publisher owner (spare
  // probe), shard 3 = restart target (failover drill), shards 1-2 bystanders.
  const restartIdentity = { campaign_id: "campaign-1", experiment_run_id: `run-${index}`, run_index: index }
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
    experiment_run_id: `run-${index}`,
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
    // §v2.2.0 wire invariant: fan_out == goal + other + burst populations.
    histograms: {
      fan_out: { max_ms: 30_000, total_count: 3, overflow_count: 0, buckets: [[10, 1], [15, 1], [30, 1]] },
      goal_fan_out: { max_ms: 30_000, total_count: 1, overflow_count: 0, buckets: [[10, 1]] },
      other_fan_out: { max_ms: 30_000, total_count: 1, overflow_count: 0, buckets: [[15, 1]] },
      late_join: { max_ms: 30_000, total_count: 64, overflow_count: 0, buckets: [[20, 64]] },
      burst: { max_ms: 30_000, total_count: 1, overflow_count: 0, buckets: [[30, 1]] },
    },
    correctness_counters: {},
    workload: { events_published: owner ? 100 : 0, phase_rates: [] },
    resources: { generator: {}, nchan: { memory_peak_run_bytes: 1000 }, redis: owner ? { memory_used_bytes: 500 } : {} },
    scenarios: [{
      name: "restart-replacement",
      participated: owner || shardId === 3,
      passed: true,
      detail: owner ? "exact spare-probe evidence" : shardId === 3 ? "exact failover-drill evidence" : "not-participating",
      structured: restartStructured,
    }],
  }
}

function globalRun(index: number, overrides: Partial<GlobalExperimentResult> = {}): GlobalExperimentResult {
  return {
    contract_version: ACTIVE_CONTRACT_VERSION,
    aggregate_scope: "simultaneous_global_run",
    scope: "global",
    experiment_run_id: `run-${index}`,
    campaign_id: "campaign-1",
    created_at_ms: 1_700_000_000_000 + index,
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
      fan_out: { p50_ms: 10, p95_ms: 10, p99_ms: 10, max_ms: 10, count: 3, overflow_count: 0, distribution: { max_ms: 30_000, total_count: 3, overflow_count: 0, buckets: [[10, 3]] } },
      goal_fan_out: { p50_ms: 10, p95_ms: 10, p99_ms: 10, max_ms: 10, count: 1, overflow_count: 0, distribution: { max_ms: 30_000, total_count: 1, overflow_count: 0, buckets: [[10, 1]] } },
      other_fan_out: { p50_ms: 10, p95_ms: 10, p99_ms: 10, max_ms: 10, count: 1, overflow_count: 0, distribution: { max_ms: 30_000, total_count: 1, overflow_count: 0, buckets: [[10, 1]] } },
      late_join: { p50_ms: 20, p95_ms: 20, p99_ms: 20, max_ms: 20, count: 256, overflow_count: 0, distribution: { max_ms: 30_000, total_count: 256, overflow_count: 0, buckets: [[20, 256]] } },
      burst: { p50_ms: 30, p95_ms: 30, p99_ms: 30, max_ms: 30, count: 4, overflow_count: 0, distribution: { max_ms: 30_000, total_count: 4, overflow_count: 0, buckets: [[30, 4]] } },
    },
    correctness_counters: { missing_sequences: 0 },
    per_shard_generator_validity: [],
    resources: {
      nchan_partitions: [0, 1, 2, 3].map((shard_id) => ({ shard_id, partition_id: shard_id, evidence: { memory_peak_run_bytes: 1000 } as Record<string, number | null> })),
      nchan_spare: null,
      redis: { memory_used_bytes: 500 },
    },
    scenario_results: [{
      name: "restart-replacement",
      passed: true,
      participant_shard_ids: [0, 3],
      active_population: null,
      details: [
        { shard_id: 0, participated: true, detail: "exact spare-probe restart evidence", structured: validOwnerRestartStructuredEvidence({ campaign_id: "campaign-1", experiment_run_id: `run-${index}`, run_index: index, shard_id: 0 }) },
        { shard_id: 3, participated: true, detail: "exact failover-drill restart evidence", structured: validTargetRestartStructuredEvidence({ campaign_id: "campaign-1", experiment_run_id: `run-${index}`, run_index: index, shard_id: 3 }) },
      ],
    }],
    shard_results: [0, 1, 2, 3].map((shardId) => campaignShard(index, shardId)),
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
    assert.equal(result.histograms.fan_out.count, 9)
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
    assert.match(result.validity.reasons.join(" "), /outside frozen exactly 3/)
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
    const structured = stale.shard_results[0].scenarios[0].structured as ReturnType<typeof validOwnerRestartStructuredEvidence>
    const spareProbe = (structured.paths as Record<string, any>).spare_probe
    spareProbe.received_required_count = 7
    spareProbe.missing_required = 1
    spareProbe.missing_required_sequences = [17]
    spareProbe.target_reached = false
    spareProbe.passed = false

    const result = aggregateGlobalCampaign([globalRun(0), stale, globalRun(2)])
    assert.equal(result.validity.valid, false)
    assert.equal(result.verdict, "INCONCLUSIVE")
    assert.equal(result.global_direct_accept_eligible, false)
    assert.match(result.validity.reasons.join(" "), /publisher-owner shard 0 lacks exact spare-probe restart evidence/)
  })

  it("accepts one exact owner and three legitimate non-participants", () => {
    const result = aggregateGlobalCampaign([globalRun(0), globalRun(1), globalRun(2)])
    assert.equal(result.validity.valid, true)
    assert.equal(result.verdict, "ACCEPT")
  })

  // R07: the qualifying campaign is frozen to base seed 42 (runs 42,43,44).
  it("rejects a campaign that does not start at frozen base seed 42", () => {
    const shifted = [0, 1, 2].map((index) => globalRun(index, { seed: 7 + index }))
    const result = aggregateGlobalCampaign(shifted)
    assert.equal(result.validity.valid, false)
    assert.match(result.validity.reasons.join(" "), /base seed 7 != frozen qualifying base seed 42/)
    assert.equal(result.verdict, "INCONCLUSIVE")
  })

  // R08: the campaign late-join cardinality must be EXACTLY runs × shards × 64
  // (= 768 for the frozen 3×4 topology); a weak >= check would accept both.
  // The delta is applied to one run's distribution so the merged campaign
  // cohort lands exactly on the probed cardinality.
  function withCampaignLateJoin(count: number) {
    const delta = count - 768
    return [0, 1, 2].map((index) => {
      const run = globalRun(index)
      const runCount = index === 2 ? 256 + delta : 256
      run.histograms.late_join = {
        p50_ms: 20, p95_ms: 20, p99_ms: 20, max_ms: 20,
        count: runCount,
        overflow_count: 0,
        distribution: { max_ms: 30_000, total_count: runCount, overflow_count: 0, buckets: [[20, runCount]] },
      }
      return run
    })
  }

  it("accepts the exact campaign late-join cardinality of 768", () => {
    const result = aggregateGlobalCampaign(withCampaignLateJoin(768))
    assert.equal(result.histograms.late_join.count, 768)
    assert.ok(!result.validity.reasons.some((reason) => reason.includes("late-join cohort")))
    assert.equal(result.verdict, "ACCEPT")
  })

  it("rejects a campaign late-join cardinality of 767", () => {
    const result = aggregateGlobalCampaign(withCampaignLateJoin(767))
    assert.match(result.validity.reasons.join(" "), /campaign late-join cohort 767 != exact 768/)
    assert.equal(result.verdict, "INCONCLUSIVE")
  })

  it("rejects a campaign late-join cardinality of 769", () => {
    const result = aggregateGlobalCampaign(withCampaignLateJoin(769))
    assert.match(result.validity.reasons.join(" "), /campaign late-join cohort 769 != exact 768/)
    assert.equal(result.verdict, "INCONCLUSIVE")
  })

  it("rejects below-consumed-position substitution in owner restart evidence", () => {
    // §v2.1.1 §10: live tail ABOVE the frozen range is diagnostic-only, but
    // frames BELOW the consumed position remain a fatal replay defect.
    const run = globalRun(1)
    const evidence = run.shard_results[0].scenarios[0].structured as ReturnType<typeof validOwnerRestartStructuredEvidence>
    const spareProbe = (evidence.paths as Record<string, any>).spare_probe
    spareProbe.out_of_range_before_count = 1
    const result = aggregateGlobalCampaign([globalRun(0), run, globalRun(2)])
    assert.match(result.validity.reasons.join(" "), /lacks exact spare-probe restart evidence/)
  })

  it("accepts owner restart evidence with diagnostic live-tail above the frozen range", () => {
    // §v2.1.1 §10 regression at campaign level: recovery races can deliver one
    // live frame past expected_last; that never fails an otherwise exact range.
    const run = globalRun(1)
    const evidence = run.shard_results[0].scenarios[0].structured as ReturnType<typeof validOwnerRestartStructuredEvidence>
    const spareProbe = (evidence.paths as Record<string, any>).spare_probe
    spareProbe.received_last_seq = 18
    spareProbe.out_of_range_after_count = 1
    const result = aggregateGlobalCampaign([globalRun(0), run, globalRun(2)])
    assert.equal(result.verdict, "ACCEPT")
    assert.equal(result.validity.valid, true)
  })

  it("rejects a non-owner that falsely claims restart participation", () => {
    const run = globalRun(1)
    run.shard_results[1].scenarios[0].participated = true
    run.shard_results[1].scenarios[0].structured = validTargetRestartStructuredEvidence({ campaign_id: "campaign-1", experiment_run_id: "run-1", run_index: 1, shard_id: 1 })
    const result = aggregateGlobalCampaign([globalRun(0), run, globalRun(2)])
    assert.match(result.validity.reasons.join(" "), /bystander shard 1 restart non-participation is invalid/)
  })

  it("rejects multiple publisher owners", () => {
    const run = globalRun(1)
    run.shard_results[1].publisher_owner = true
    const result = aggregateGlobalCampaign([globalRun(0), run, globalRun(2)])
    assert.match(result.validity.reasons.join(" "), /publisher owners 2/)
  })

  it("rejects a run with no publisher owner", () => {
    const run = globalRun(1)
    for (const shard of run.shard_results) shard.publisher_owner = false
    const result = aggregateGlobalCampaign([globalRun(0), run, globalRun(2)])
    assert.match(result.validity.reasons.join(" "), /publisher owners 0/)
  })

  it("rejects stale restart evidence copied from another run", () => {
    const run = globalRun(1)
    const evidence = run.shard_results[0].scenarios[0].structured as ReturnType<typeof validOwnerRestartStructuredEvidence>
    evidence.experiment_run_id = "run-0"
    const result = aggregateGlobalCampaign([globalRun(0), run, globalRun(2)])
    assert.match(result.validity.reasons.join(" "), /stale or misbound/)
  })

  it("merges burst populations and preserves overflow evidence", () => {
    const first = globalRun(0)
    first.histograms.burst = { p50_ms: 10, p95_ms: 10, p99_ms: 10, max_ms: 10, count: 2, overflow_count: 1, distribution: { max_ms: 30_000, total_count: 2, overflow_count: 1, buckets: [[10, 1]] } }
    const second = globalRun(1)
    second.histograms.burst = { p50_ms: 20, p95_ms: 20, p99_ms: 20, max_ms: 20, count: 2, overflow_count: 0, distribution: { max_ms: 30_000, total_count: 2, overflow_count: 0, buckets: [[20, 2]] } }
    const third = globalRun(2)
    third.histograms.burst = { p50_ms: 30, p95_ms: 30, p99_ms: 30, max_ms: 30, count: 2, overflow_count: 0, distribution: { max_ms: 30_000, total_count: 2, overflow_count: 0, buckets: [[30, 2]] } }
    const result = aggregateGlobalCampaign([first, second, third])
    assert.equal(result.histograms.burst.count, 6)
    assert.equal(result.histograms.burst.p95_ms, 30)
    assert.equal(result.histograms.burst.overflow_count, 1)
  })

  it("cannot interpret missing burst or late-join evidence as pass", () => {
    const run = globalRun(1)
    run.histograms.burst = { p50_ms: 0, p95_ms: 0, p99_ms: 0, max_ms: 0, count: 0, overflow_count: 0, distribution: { max_ms: 30_000, total_count: 0, overflow_count: 0, buckets: [] } }
    run.histograms.late_join = { p50_ms: 0, p95_ms: 0, p99_ms: 0, max_ms: 0, count: 0, overflow_count: 0, distribution: { max_ms: 30_000, total_count: 0, overflow_count: 0, buckets: [] } }
    const result = aggregateGlobalCampaign([globalRun(0), run, globalRun(2)])
    assert.equal(result.verdict, "INCONCLUSIVE")
    assert.match(result.validity.reasons.join(" "), /burst histogram is empty/)
    assert.match(result.validity.reasons.join(" "), /late-join sample count 0/)
  })

  it("enforces frozen campaign identity, source, run count, seed, and freshness", () => {
    const runs = [globalRun(0), globalRun(1), globalRun(2)]
    const result = aggregateGlobalCampaign(runs, {
      campaign_id: "different-campaign",
      source_commit: "0000000000000000000000000000000000000000",
      run_count: 4,
      base_seed: 100,
      started_at_ms: 1_900_000_000_000,
    })
    assert.equal(result.validity.valid, false)
    const reasons = result.validity.reasons.join(" ")
    assert.match(reasons, /campaign identity does not match/)
    assert.match(reasons, /source commit does not match/)
    assert.match(reasons, /differs from frozen 4/)
    assert.match(reasons, /base-seed policy/)
    assert.match(reasons, /predate the current campaign/)
  })

  it("rejects a stale shard object hidden inside a current global result", () => {
    const run = globalRun(1)
    run.shard_results[2].experiment_run_id = "run-0"
    const result = aggregateGlobalCampaign([globalRun(0), run, globalRun(2)])
    assert.match(result.validity.reasons.join(" "), /stale or misbound shard results/)
  })

  it("handles a physically missing burst field as invalid evidence, not an exception", () => {
    const run = globalRun(1)
    delete (run.histograms as Partial<GlobalExperimentResult["histograms"]>).burst
    const result = aggregateGlobalCampaign([globalRun(0), run, globalRun(2)])
    assert.equal(result.verdict, "INCONCLUSIVE")
    assert.match(result.validity.reasons.join(" "), /burst histogram is empty/)
  })
})
