import { mergeHistograms, type GlobalExperimentResult } from "./global-coordinator.js"

export interface GlobalCampaignResult {
  contract_version: "v2.0.4"
  aggregate_scope: "campaign"
  scope: "campaign"
  global_direct_accept_eligible: boolean
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
    late_join: ReturnType<typeof campaignHistogramSummary>
  }
  correctness_counters: Record<string, number>
  per_run_resources: GlobalExperimentResult["resources"][]
  per_run_workload_rates: GlobalExperimentResult["workload_rates"][]
  global_runs: GlobalExperimentResult[]
  validity: { valid: boolean; reasons: string[] }
  verdict: "ACCEPT" | "REJECT" | "INCONCLUSIVE"
}

const DISPERSION_THRESHOLD_CV = 0.15

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

export function aggregateGlobalCampaign(globalRuns: GlobalExperimentResult[]): GlobalCampaignResult {
  const runs = [...globalRuns].sort((a, b) => a.run_index - b.run_index)
  const reasons: string[] = []
  if (runs.length < 3 || runs.length > 8) reasons.push(`global run count ${runs.length} outside frozen 3..8 range`)

  const runIndices = runs.map((run) => run.run_index)
  if (new Set(runIndices).size !== runs.length || runIndices.some((value, index) => value !== index)) {
    reasons.push(`run indices must be unique contiguous 0..${Math.max(0, runs.length - 1)}`)
  }
  const experimentRunIds = runs.map((run) => run.experiment_run_id)
  if (new Set(experimentRunIds).size !== runs.length) reasons.push("experiment_run_id must be unique per global run")
  if (runs.some((run) => run.aggregate_scope !== "simultaneous_global_run" || run.scope !== "global")) {
    reasons.push("campaign inputs must be simultaneous global-run results")
  }

  const targets = new Set(runs.map((run) => run.global_target))
  const commits = new Set(runs.map((run) => run.source_commit))
  const shardCounts = new Set(runs.map((run) => run.shard_count))
  const globalTarget = targets.size === 1 ? runs[0]?.global_target ?? null : null
  const sourceCommit = commits.size === 1 ? runs[0]?.source_commit ?? null : null
  if (targets.size !== 1) reasons.push("global target differs across runs")
  if (commits.size !== 1 || !sourceCommit) reasons.push("source commit differs or is missing across runs")
  if (shardCounts.size !== 1) reasons.push("shard count differs across runs")

  const dispersionMetrics = {
    global_active_peak: coefficientOfVariation(runs.map((run) => run.active_population.global_active_peak)),
    fan_out_p95_ms: coefficientOfVariation(runs.map((run) => run.histograms.fan_out.p95_ms)),
    late_join_p95_ms: coefficientOfVariation(runs.map((run) => run.histograms.late_join.p95_ms)),
  }
  const worstCv = Math.max(...Object.values(dispersionMetrics))
  const dispersionStable = Number.isFinite(worstCv) && worstCv <= DISPERSION_THRESHOLD_CV

  const fanOut = mergeHistograms(runs.map((run) => run.histograms.fan_out.distribution))
  const lateJoin = mergeHistograms(runs.map((run) => run.histograms.late_join.distribution))
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
    contract_version: "v2.0.4",
    aggregate_scope: "campaign",
    scope: "campaign",
    global_direct_accept_eligible: verdict === "ACCEPT",
    run_count: runs.length,
    run_indices: runIndices,
    experiment_run_ids: experimentRunIds,
    global_target: globalTarget,
    source_commit: sourceCommit,
    seeds: runs.map((run) => run.seed),
    per_run_verdicts: runs.map((run) => run.verdict),
    dispersion: {
      threshold_cv: DISPERSION_THRESHOLD_CV,
      stable: dispersionStable,
      worst_cv: worstCv,
      metrics: dispersionMetrics,
    },
    histograms: {
      fan_out: campaignHistogramSummary(fanOut),
      late_join: campaignHistogramSummary(lateJoin),
    },
    correctness_counters: correctnessCounters,
    per_run_resources: runs.map((run) => run.resources),
    per_run_workload_rates: runs.map((run) => run.workload_rates),
    global_runs: runs,
    validity,
    verdict,
  }
}
