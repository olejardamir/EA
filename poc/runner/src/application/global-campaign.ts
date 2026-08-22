import {
  hasExactRestartPathEvidence,
  hasNoFabricatedRestartPaths,
  mergeHistograms,
  restartEvidenceMatchesRun,
  type GlobalExperimentResult,
} from "./global-coordinator.js"
import { ACTIVE_CONTRACT_VERSION } from "../domain/active-contract.js"

export interface GlobalCampaignResult {
  contract_version: typeof ACTIVE_CONTRACT_VERSION
  aggregate_scope: "campaign"
  scope: "campaign"
  global_direct_accept_eligible: boolean
  campaign_id: string | null
  created_at_ms: number
  run_count: number
  run_indices: number[]
  experiment_run_ids: string[]
  global_target: number | null
  source_commit: string | null
  seeds: number[]
  per_run_verdicts: GlobalExperimentResult["verdict"][]
  dispersion: {
    threshold_cv: number
    stable: boolean
    worst_cv: number
    metrics: Record<string, number>
  }
  histograms: {
    fan_out: ReturnType<typeof campaignHistogramSummary>
    goal_fan_out: ReturnType<typeof campaignHistogramSummary>
    other_fan_out: ReturnType<typeof campaignHistogramSummary>
    late_join: ReturnType<typeof campaignHistogramSummary>
    burst: ReturnType<typeof campaignHistogramSummary>
  }
  correctness_counters: Record<string, number>
  per_run_resources: GlobalExperimentResult["resources"][]
  per_run_workload_rates: GlobalExperimentResult["workload_rates"][]
  global_runs: GlobalExperimentResult[]
  validity: { valid: boolean; reasons: string[] }
  verdict: "ACCEPT" | "REJECT" | "INCONCLUSIVE"
}

const DISPERSION_THRESHOLD_CV = 0.15
const EMPTY_DISTRIBUTION = { max_ms: 30_000, total_count: 0, overflow_count: 0, buckets: [] }

function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  if (mean === 0) return 0
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance) / Math.abs(mean)
}

function campaignHistogramSummary(histogram: ReturnType<typeof mergeHistograms>) {
  return {
    p50_ms: histogram.p50(),
    p95_ms: histogram.p95(),
    p99_ms: histogram.p99(),
    max_ms: histogram.max,
    count: histogram.count,
    overflow_count: histogram.overflows,
    distribution: histogram.serialize(),
  }
}

function globalRunRestartEvidenceError(run: GlobalExperimentResult): string | null {
  if (run.shard_results.length !== run.shard_count) return "restart evidence does not cover every shard"
  const owners = run.shard_results.filter((shard) => shard.publisher_owner)
  if (owners.length !== 1) return `restart publisher owners ${owners.length}; expected exactly 1`
  if (run.publisher_owner_shard_id !== owners[0].shard_id) return "restart publisher owner disagrees with global identity"
  // §v2.1.0: the drill targets exactly one non-owner partition (shard i ↔ partition i)
  const targetShardId = run.shard_count - 1
  if (owners[0].shard_id === targetShardId) return "restart target partition must not be the publisher-owner partition"

  for (const shard of run.shard_results) {
    const records = shard.scenarios.filter((scenario) => scenario.name === "restart-replacement")
    if (records.length !== 1) return `shard ${shard.shard_id} restart record count ${records.length}; expected 1`
    const restart = records[0]
    const identity = {
      campaign_id: run.campaign_id,
      experiment_run_id: run.experiment_run_id,
      run_index: run.run_index,
      shard_id: shard.shard_id,
    }
    if (shard.publisher_owner) {
      if (!restart.participated || !restart.passed || !hasExactRestartPathEvidence(restart.structured, "spare_probe")) {
        return `publisher-owner shard ${shard.shard_id} lacks exact spare-probe restart evidence`
      }
      if (!restartEvidenceMatchesRun(restart.structured, identity)) {
        return `publisher-owner shard ${shard.shard_id} restart evidence is stale or misbound`
      }
    } else if (shard.shard_id === targetShardId) {
      if (!restart.participated || !restart.passed || !hasExactRestartPathEvidence(restart.structured, "failover_drill")) {
        return `restart-target shard ${shard.shard_id} lacks exact failover-drill evidence`
      }
      if (!restartEvidenceMatchesRun(restart.structured, identity)) {
        return `restart-target shard ${shard.shard_id} restart evidence is stale or misbound`
      }
      const pool = (restart.structured as Record<string, unknown> | undefined)?.pool as Record<string, unknown> | undefined
      if (!pool || pool.failed !== 0 || pool.gaps !== 0 || pool.duplicates !== 0 || pool.order_violations !== 0) {
        return `restart-target shard ${shard.shard_id} failover pool health is not clean`
      }
    } else if (restart.participated || !restart.passed || !hasNoFabricatedRestartPaths(restart.structured)) {
      return `bystander shard ${shard.shard_id} restart non-participation is invalid`
    }
  }
  return null
}

export interface FrozenCampaignPolicy {
  campaign_id?: string
  source_commit?: string
  run_count?: number
  base_seed?: number
  started_at_ms?: number
}

export function aggregateGlobalCampaign(globalRuns: GlobalExperimentResult[], policy: FrozenCampaignPolicy = {}): GlobalCampaignResult {
  const runs = [...globalRuns].sort((a, b) => a.run_index - b.run_index)
  const reasons: string[] = []
  if (runs.length !== 3) reasons.push(`global run count ${runs.length} outside frozen exactly 3`)

  const runIndices = runs.map((run) => run.run_index)
  if (new Set(runIndices).size !== runs.length || runIndices.some((value, index) => value !== index)) {
    reasons.push(`run indices must be unique contiguous 0..${Math.max(0, runs.length - 1)}`)
  }
  const experimentRunIds = runs.map((run) => run.experiment_run_id)
  if (new Set(experimentRunIds).size !== runs.length) reasons.push("experiment_run_id must be unique per global run")
  if (runs.some((run) => run.aggregate_scope !== "simultaneous_global_run" || run.scope !== "global")) {
    reasons.push("campaign inputs must be simultaneous global-run results")
  }
  if (runs.some((run) => run.contract_version !== ACTIVE_CONTRACT_VERSION)) {
    reasons.push(`all campaign inputs must use contract ${ACTIVE_CONTRACT_VERSION}`)
  }
  if (policy.run_count !== undefined && runs.length !== policy.run_count) reasons.push(`global run count ${runs.length} differs from frozen ${policy.run_count}`)

  const campaignIds = new Set(runs.map((run) => run.campaign_id))
  const campaignId = campaignIds.size === 1 ? runs[0]?.campaign_id ?? null : null
  if (campaignIds.size !== 1 || !campaignId) reasons.push("campaign identity differs or is missing across runs")
  if (policy.campaign_id !== undefined && campaignId !== policy.campaign_id) reasons.push("campaign identity does not match frozen launcher policy")
  if (runs.some((run) => !Number.isFinite(run.created_at_ms) || run.created_at_ms <= 0)) reasons.push("global run creation timestamp is missing or invalid")
  if (policy.started_at_ms !== undefined && runs.some((run) => run.created_at_ms < policy.started_at_ms!)) {
    reasons.push("one or more global results predate the current campaign")
  }
  if (runs.some((run) => run.created_at_ms > Date.now() + 60_000)) reasons.push("one or more global results have an implausible future timestamp")

  for (const run of runs) {
    if (policy.campaign_id !== undefined && run.experiment_run_id !== `${policy.campaign_id}-global-${run.run_index}`) {
      reasons.push(`global run ${run.run_index} experiment_run_id does not match frozen launcher identity`)
    }
    if (run.shard_results.some((shard) => shard.campaign_id !== run.campaign_id
      || shard.experiment_run_id !== run.experiment_run_id
      || shard.run_index !== run.run_index
      || shard.seed !== run.seed
      || shard.source_commit !== run.source_commit)) {
      reasons.push(`global run ${run.run_index} contains stale or misbound shard results`)
    }
    const error = globalRunRestartEvidenceError(run)
    if (error) reasons.push(`global run ${run.run_index} restart evidence: ${error}`)
    if (!run.histograms?.burst || run.histograms.burst.count === 0) reasons.push(`global run ${run.run_index} burst histogram is empty`)
    if (!run.histograms?.late_join || run.histograms.late_join.count !== run.shard_count * 64) {
      reasons.push(`global run ${run.run_index} late-join sample count ${run.histograms?.late_join?.count ?? "missing"}; expected ${run.shard_count * 64} (64 per partition)`)
    }
    const redisMemory = run.resources?.redis?.memory_used_bytes
    if (typeof redisMemory !== "number" || !Number.isFinite(redisMemory) || redisMemory < 0) {
      reasons.push(`global run ${run.run_index} Redis memory_used_bytes is missing or invalid`)
    }
    // §v2.1.0: per-partition resource evidence must be complete and numeric
    if (!run.resources?.nchan_partitions || run.resources.nchan_partitions.length !== run.shard_count) {
      reasons.push(`global run ${run.run_index} per-partition resource evidence incomplete`)
    }
  }

  const targets = new Set(runs.map((run) => run.global_target))
  const commits = new Set(runs.map((run) => run.source_commit))
  const shardCounts = new Set(runs.map((run) => run.shard_count))
  const globalTarget = targets.size === 1 ? runs[0]?.global_target ?? null : null
  const sourceCommit = commits.size === 1 ? runs[0]?.source_commit ?? null : null
  if (targets.size !== 1) reasons.push("global target differs across runs")
  if (commits.size !== 1 || !sourceCommit) reasons.push("source commit differs or is missing across runs")
  if (policy.source_commit !== undefined && sourceCommit !== policy.source_commit) reasons.push("source commit does not match frozen launcher policy")
  if (shardCounts.size !== 1) reasons.push("shard count differs across runs")
  const seeds = runs.map((run) => run.seed)
  if (new Set(seeds).size !== runs.length || seeds.some((seed, index) => seed !== seeds[0] + index)) {
    reasons.push("seeds must be unique and contiguous from the frozen base")
  }
  if (policy.base_seed !== undefined && seeds.some((seed, index) => seed !== policy.base_seed! + index)) {
    reasons.push("seeds do not match frozen base-seed policy")
  }

  const dispersionMetrics = {
    global_active_peak: coefficientOfVariation(runs.map((run) => run.active_population.global_active_peak)),
    fan_out_p95_ms: coefficientOfVariation(runs.map((run) => run.histograms?.fan_out?.p95_ms ?? 0)),
    late_join_p95_ms: coefficientOfVariation(runs.map((run) => run.histograms?.late_join?.p95_ms ?? 0)),
    burst_p95_ms: coefficientOfVariation(runs.map((run) => run.histograms?.burst?.p95_ms ?? 0)),
  }
  const worstCv = Math.max(...Object.values(dispersionMetrics))
  const dispersionStable = Number.isFinite(worstCv) && worstCv <= DISPERSION_THRESHOLD_CV
  const fanOut = mergeHistograms(runs.map((run) => run.histograms?.fan_out?.distribution ?? EMPTY_DISTRIBUTION))
  // §v2.2.0: class-split deep-cohort distributions aggregated across runs.
  const goalFanOut = mergeHistograms(runs.map((run) => run.histograms?.goal_fan_out?.distribution ?? EMPTY_DISTRIBUTION))
  const otherFanOut = mergeHistograms(runs.map((run) => run.histograms?.other_fan_out?.distribution ?? EMPTY_DISTRIBUTION))
  const lateJoin = mergeHistograms(runs.map((run) => run.histograms?.late_join?.distribution ?? EMPTY_DISTRIBUTION))
  const burst = mergeHistograms(runs.map((run) => run.histograms?.burst?.distribution ?? EMPTY_DISTRIBUTION))
  if (lateJoin.count < runs.length * (runs[0]?.shard_count ?? 1)) {
    reasons.push(`campaign late-join cohort ${lateJoin.count} < required ${runs.length * (runs[0]?.shard_count ?? 1)}`)
  }
  const correctnessCounters: Record<string, number> = {}
  for (const run of runs) {
    for (const [name, value] of Object.entries(run.correctness_counters)) {
      correctnessCounters[name] = (correctnessCounters[name] ?? 0) + value
    }
  }

  const hasInconclusive = runs.some((run) => run.verdict === "INCONCLUSIVE" || !run.validity.valid)
  const hasReject = runs.some((run) => run.verdict === "REJECT")
  const validity = { valid: reasons.length === 0, reasons }
  const verdict: GlobalCampaignResult["verdict"] = !validity.valid || hasInconclusive || !dispersionStable
    ? "INCONCLUSIVE"
    : hasReject
      ? "REJECT"
      : runs.length > 0 && runs.every((run) => run.verdict === "ACCEPT")
        ? "ACCEPT"
        : "INCONCLUSIVE"

  return {
    contract_version: ACTIVE_CONTRACT_VERSION,
    aggregate_scope: "campaign",
    scope: "campaign",
    global_direct_accept_eligible: verdict === "ACCEPT",
    campaign_id: campaignId,
    created_at_ms: Date.now(),
    run_count: runs.length,
    run_indices: runIndices,
    experiment_run_ids: experimentRunIds,
    global_target: globalTarget,
    source_commit: sourceCommit,
    seeds,
    per_run_verdicts: runs.map((run) => run.verdict),
    dispersion: {
      threshold_cv: DISPERSION_THRESHOLD_CV,
      stable: dispersionStable,
      worst_cv: worstCv,
      metrics: dispersionMetrics,
    },
    histograms: {
      fan_out: campaignHistogramSummary(fanOut),
      goal_fan_out: campaignHistogramSummary(goalFanOut),
      other_fan_out: campaignHistogramSummary(otherFanOut),
      late_join: campaignHistogramSummary(lateJoin),
      burst: campaignHistogramSummary(burst),
    },
    correctness_counters: correctnessCounters,
    per_run_resources: runs.map((run) => run.resources),
    per_run_workload_rates: runs.map((run) => run.workload_rates),
    global_runs: runs,
    validity,
    verdict,
  }
}
