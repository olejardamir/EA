import fs from "node:fs"
import path from "node:path"
import { ACTIVE_CONTRACT_VERSION } from "./domain/active-contract.js"
import {
  COORDINATED_PHASES,
  SURGE_DEADLINE_MS,
  SURGE_GLOBAL_ADDITIONS,
  SURGE_TERMINAL_GLOBAL_TARGET,
  SURGE_TERMINAL_PRE_POPULATION,
  mergeHistograms,
  type GlobalExperimentResult,
} from "./application/global-coordinator.js"
import type { GlobalCampaignResult } from "./application/global-campaign.js"

export interface AuditPolicy {
  campaign_id: string | null
  source_commit: string | null
  base_seed: number | null
}

export interface AuditCheck {
  name: string
  pass: boolean
  detail: string
}

export interface IndependentAuditResult {
  checks: AuditCheck[]
  independent_verdict: "PASS" | "FAIL"
  machine_verdict: string
  agreement: boolean
}

const EMPTY_DISTRIBUTION = { max_ms: 30_000, total_count: 0, overflow_count: 0, buckets: [] }

// R19: this list is deliberately restated here instead of imported so the
// audit does not share mutable gate state with the coordinator.
const AUDIT_MANDATORY_CORRECTNESS_FIELDS = [
  "missing_sequences", "duplicates", "out_of_order",
  "missing_transport_id", "missing_canonical_seq", "canonical_seq_parse_errors",
  "schema_validation_errors", "json_parse_errors", "invalid_timestamp_count",
  "state_violations", "canonical_payload_state_violations", "lobby_malformed",
  "reconnect_gaps", "reconnect_duplicates", "reconnect_order_violations",
  "reconnect_missing_raw_id",
  "restart_failover_gaps", "restart_failover_duplicates", "restart_failover_order_violations",
  "restart_failover_connection_failures", "restart_failover_unexpected_disconnects",
  "surge_missing_sequences", "surge_duplicates", "surge_out_of_order", "surge_unexpected_disconnects",
  "connection_failures", "unexpected_disconnects",
  "agreement_violations", "state_agreement_violations",
  "deep_unmatched",
]

const RESTART_COUNTER_MAP: Array<[string, string]> = [
  ["gaps", "restart_failover_gaps"],
  ["duplicates", "restart_failover_duplicates"],
  ["order_violations", "restart_failover_order_violations"],
  ["failed", "restart_failover_connection_failures"],
  ["unexpected_disconnects", "restart_failover_unexpected_disconnects"],
]

function cv(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  if (mean === 0) return 0
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance) / Math.abs(mean)
}

function isHex(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value)
}

export function runIndependentAudit(
  runsInput: GlobalExperimentResult[],
  campaign: GlobalCampaignResult | null,
  policy: AuditPolicy,
): IndependentAuditResult {
  const checks: AuditCheck[] = []
  const add = (name: string, pass: boolean, detail: string): void => {
    checks.push({ name, pass, detail })
  }
  const runs = [...runsInput].sort((a, b) => a.run_index - b.run_index)

  // 1. contract identity
  const wrongContract = runs.filter((run) => run.contract_version !== ACTIVE_CONTRACT_VERSION)
  add("contract identity", runs.length > 0 && wrongContract.length === 0,
    wrongContract.length === 0 ? `all runs report ${ACTIVE_CONTRACT_VERSION}` : `${wrongContract.length} run(s) off-contract`)

  // 2. source identity
  const commits = new Set(runs.map((run) => run.source_commit))
  const sourceOk = isHex(policy.source_commit)
    && commits.size === 1
    && isHex([...commits][0])
    && ([...commits][0] as string).toLowerCase() === (policy.source_commit as string).toLowerCase()
  add("source identity", sourceOk,
    sourceOk ? `all runs at ${policy.source_commit}` : `policy=${String(policy.source_commit)} runs=${[...commits].join(",") || "none"}`)

  // 3. exact 3 runs
  const indices = runs.map((run) => run.run_index)
  const threeOk = runs.length === 3 && indices.every((value, index) => value === index)
  add("exact 3 runs", threeOk, `run_indices=[${indices.join(",")}]`)

  // 4. seeds 42/43/44
  const seeds = runs.map((run) => run.seed)
  const seedsOk = policy.base_seed === null
    ? seeds.every((seed, index) => seed === 42 + index)
    : seeds.every((seed, index) => seed === policy.base_seed! + index) && seeds[0] === 42
  add("seeds 42/43/44", seedsOk, `seeds=[${seeds.join(",")}]`)

  // 5. 4 shards
  const shardCounts = new Set(runs.map((run) => run.shard_count))
  const shardsOk = shardCounts.size === 1 && runs.length > 0 && runs[0].shard_count === 4
    && runs.every((run) => JSON.stringify(run.participating_shard_ids) === JSON.stringify([0, 1, 2, 3]))
  add("4 shards", shardsOk, `shard_counts=[${[...shardCounts].join(",")}]`)

  // 6. publisher owner
  let ownerDetail = ""
  let ownerOk = runs.length > 0
  for (const run of runs) {
    const owners = run.shard_results.filter((shard) => shard.publisher_owner)
    const nonOwnerPublished = run.shard_results.filter((shard) => !shard.publisher_owner && shard.workload.events_published !== 0)
    const ownerWorkload = owners.length === 1 && owners[0].workload.events_published > 0
    if (owners.length !== 1 || run.publisher_owner_shard_id !== owners[0]?.shard_id || nonOwnerPublished.length > 0 || !ownerWorkload) {
      ownerOk = false
      ownerDetail = `run ${run.run_index}: owners=${owners.map((o) => o.shard_id).join(",") || "none"}`
      break
    }
  }
  add("publisher owner", ownerOk, ownerDetail || "exactly one owner per run with accepted workload")

  // 7. phase completeness
  let phasesOk = runs.length > 0
  let phaseDetail = ""
  for (const run of runs) {
    for (const phase of COORDINATED_PHASES) {
      const timing = run.phase_timings?.[phase]
      if (!timing || typeof timing.start_ms !== "number" || typeof timing.end_ms !== "number"
        || typeof timing.duration_ms !== "number" || timing.duration_ms <= 0
        || timing.end_ms - timing.start_ms !== timing.duration_ms) {
        phasesOk = false
        phaseDetail = `run ${run.run_index} phase ${phase}`
        break
      }
    }
    if (!phasesOk) break
  }
  add("phase completeness", phasesOk, phaseDetail || `all ${COORDINATED_PHASES.length} coordinated phases measured per run`)

  // Surge machine proof (8-10), recomputed from structured scenario evidence
  // per individual global run — never summed across repetitions.
  const surgePerRun = runs.map((run) => {
    let startSum = 0
    let attemptedSum = 0
    let establishedSum = 0
    let failedSum = 0
    let finalSum = 0
    let maxElapsedMs = 0
    for (const shard of run.shard_results) {
      const rec = shard.scenarios.find((scenario) => scenario.name === "surge")
      const st = rec?.structured as Record<string, unknown> | undefined
      const required = ["surge_start_active", "surge_attempted_additions", "surge_established_additions", "surge_failed_additions", "surge_elapsed_ms", "surge_final_active"]
      if (!st || required.some((key) => typeof st[key] !== "number")) {
        return { complete: false as const }
      }
      startSum += st["surge_start_active"] as number
      attemptedSum += st["surge_attempted_additions"] as number
      establishedSum += st["surge_established_additions"] as number
      failedSum += st["surge_failed_additions"] as number
      finalSum += st["surge_final_active"] as number
      maxElapsedMs = Math.max(maxElapsedMs, st["surge_elapsed_ms"] as number)
    }
    return { complete: true as const, startSum, attemptedSum, establishedSum, failedSum, finalSum, maxElapsedMs }
  })
  const surgeComplete = runs.length > 0 && surgePerRun.every((surge) => surge.complete)
  const surgeStartSum = surgePerRun.reduce((sum, surge) => sum + (surge.complete ? surge.startSum : 0), 0)
  const allSurgeExact = surgePerRun.every((surge) =>
    surge.complete && surge.startSum === SURGE_TERMINAL_PRE_POPULATION)
  const allSurgeAdditions = surgePerRun.every((surge) =>
    surge.complete && surge.attemptedSum === SURGE_GLOBAL_ADDITIONS
    && surge.establishedSum === SURGE_GLOBAL_ADDITIONS
    && surge.failedSum === 0
    && surge.maxElapsedMs <= SURGE_DEADLINE_MS)

  // 8. 60k baseline
  add("60k baseline", surgeComplete && allSurgeExact,
    `per-run surge start populations [${surgePerRun.map((surge) => surge.complete ? surge.startSum : "missing").join(",")}]`)

  // 9. +40k established <=120s
  add("+40k established <=120s", surgeComplete && allSurgeAdditions,
    `per-run [attempted=${surgePerRun.map((surge) => surge.complete ? surge.attemptedSum : "missing").join(",")}] `
    + `[established=${surgePerRun.map((surge) => surge.complete ? surge.establishedSum : "missing").join(",")}] `
    + `[max elapsed ms=${surgePerRun.map((surge) => surge.complete ? surge.maxElapsedMs : "missing").join(",")}] deadline=${SURGE_DEADLINE_MS}ms`)

  // 10. 100k full target
  const targets = new Set(runs.map((run) => run.global_target))
  const peakOk = runs.every((run) => run.active_population.global_active_peak >= run.global_target)
  const surgeFinalOk = surgePerRun.every((surge) => surge.complete && surge.finalSum >= SURGE_TERMINAL_GLOBAL_TARGET)
  add("100k full target",
    targets.size === 1 && runs.length > 0 && runs[0].global_target === SURGE_TERMINAL_GLOBAL_TARGET && peakOk && surgeFinalOk,
    `targets=[${[...targets].join(",")}] per-run final_surge_population=[${surgePerRun.map((surge) => surge.complete ? surge.finalSum : "missing").join(",")}]`)

  // 11-12. mandatory correctness fields present and zero
  let fieldsPresent = runs.length > 0
  let fieldDetail = ""
  const totals: Record<string, number> = {}
  for (const run of runs) {
    for (const [name, value] of Object.entries(run.correctness_counters)) {
      totals[name] = (totals[name] ?? 0) + value
    }
    for (const shard of run.shard_results) {
      for (const name of AUDIT_MANDATORY_CORRECTNESS_FIELDS) {
        const value = shard.correctness_counters[name]
        if (typeof value !== "number" || !Number.isFinite(value)) {
          fieldsPresent = false
          fieldDetail = `run ${run.run_index} shard ${shard.shard_id} field ${name}`
          break
        }
      }
      if (!fieldsPresent) break
    }
    if (!fieldsPresent) break
  }
  add("mandatory correctness fields present", fieldsPresent, fieldDetail || `${AUDIT_MANDATORY_CORRECTNESS_FIELDS.length} fields numeric on every shard`)
  const nonzero = AUDIT_MANDATORY_CORRECTNESS_FIELDS.filter((name) => (totals[name] ?? 0) > 0)
  add("correctness zero", fieldsPresent && nonzero.length === 0, nonzero.length === 0 ? "all totals zero" : nonzero.map((name) => `${name}=${totals[name]}`).join(" "))

  // 13. surge correctness zero
  const surgeCounters = ["surge_missing_sequences", "surge_duplicates", "surge_out_of_order", "surge_unexpected_disconnects"]
  const surgeNonzero = surgeCounters.filter((name) => (totals[name] ?? 0) > 0)
  add("surge correctness", surgeNonzero.length === 0, surgeNonzero.length === 0 ? "surge counters zero" : surgeNonzero.map((name) => `${name}=${totals[name]}`).join(" "))

  // 14. reconnect exact denominator
  let reconnectOk = runs.length > 0
  let reconnectDetail = ""
  for (const run of runs) {
    for (const shard of run.shard_results) {
      const rec = shard.scenarios.find((scenario) => scenario.name === "reconnect")
      const st = rec?.structured as Record<string, unknown> | undefined
      if (!st) {
        reconnectOk = false
        reconnectDetail = `run ${run.run_index} shard ${shard.shard_id} no structured denominator`
        break
      }
      const exact = st["selected"] === 64 && st["ready_before_hold"] === 64 && st["released"] === 64
        && st["evaluated"] === 64 && st["passed"] === 64 && st["failed"] === 0 && st["missing_results"] === 0
      if (!exact) {
        reconnectOk = false
        reconnectDetail = `run ${run.run_index} shard ${shard.shard_id}: ${JSON.stringify(st)}`
        break
      }
    }
    if (!reconnectOk) break
  }
  add("reconnect exact denominator", reconnectOk, reconnectDetail || "64/64/64/64/64 with zero failures on every shard")

  // 15. restart measured deltas
  let restartOk = runs.length > 0
  let restartDetail = ""
  for (const run of runs) {
    for (const shard of run.shard_results) {
      const rec = shard.scenarios.find((scenario) => scenario.name === "restart-replacement")
      const pool = rec?.structured as Record<string, unknown> | undefined
        ? ((rec!.structured as Record<string, unknown>)["pool"] as Record<string, unknown> | undefined)
        : undefined
      if (!pool) {
        restartOk = false
        restartDetail = `run ${run.run_index} shard ${shard.shard_id} missing pool deltas`
        break
      }
      for (const [structuredKey, counterKey] of RESTART_COUNTER_MAP) {
        const structuredValue = pool[structuredKey]
        const topLevel = shard.correctness_counters[counterKey]
        if (typeof structuredValue !== "number" || typeof topLevel !== "number" || structuredValue !== topLevel) {
          restartOk = false
          restartDetail = `run ${run.run_index} shard ${shard.shard_id} ${counterKey}: top-level=${String(topLevel)} structured=${String(structuredValue)}`
          break
        }
      }
      if (!restartOk) break
    }
    if (!restartOk) break
  }
  add("restart measured deltas", restartOk, restartDetail || "structured pool agrees with top-level counters on every shard")

  // 16. latejoin 256/run
  const lateJoinPerRunOk = runs.length > 0 && runs.every((run) => run.histograms.late_join.count === run.shard_count * 64)
  add("latejoin 256/run", lateJoinPerRunOk, runs.map((run) => run.histograms.late_join.count).join("/"))

  // 17. latejoin 768/campaign
  const lateJoinTotal = runs.reduce((sum, run) => sum + (run.histograms.late_join.count ?? 0), 0)
  add("latejoin 768/campaign", lateJoinTotal === 768, `merged total ${lateJoinTotal}`)

  // 18. deep 1024/1024 (per run: 256 per shard × 4 shards, all agreed)
  const deepPerRun = runs.map((run) => {
    let expected = 0
    let agreed = 0
    let disagreed = 0
    let unmatched = 0
    for (const shard of run.shard_results) {
      const da = (shard.resources.generator as Record<string, unknown>)["deep_agreement"] as Record<string, unknown> | undefined
      if (!da || typeof da["expected"] !== "number" || typeof da["agreed"] !== "number"
        || typeof da["disagreed"] !== "number" || typeof da["unmatched"] !== "number") {
        return { complete: false as const }
      }
      expected += da["expected"] as number
      agreed += da["agreed"] as number
      disagreed += da["disagreed"] as number
      unmatched += da["unmatched"] as number
    }
    return { complete: true as const, expected, agreed, disagreed, unmatched }
  })
  const deepComplete = runs.length > 0 && deepPerRun.every((deep) => deep.complete)
  const deepAllExact = deepPerRun.every((deep) =>
    deep.complete && deep.expected === 1024 && deep.agreed === deep.expected && deep.disagreed === 0 && deep.unmatched === 0)
  add("deep 1024/1024",
    deepComplete && deepAllExact,
    deepComplete ? `per-run agreed=[${deepPerRun.map((deep) => `${deep.agreed}/${deep.expected}`).join(",")}] disagreed=[${deepPerRun.map((deep) => deep.disagreed).join(",")}] unmatched=[${deepPerRun.map((deep) => deep.unmatched).join(",")}]` : "deep-agreement evidence incomplete")

  // 19. latency thresholds (p95 gates recomputed from raw distributions)
  const mergedFanOut = mergeHistograms(runs.map((run) => run.histograms.fan_out.distribution ?? EMPTY_DISTRIBUTION))
  const mergedBurst = mergeHistograms(runs.map((run) => run.histograms.burst.distribution ?? EMPTY_DISTRIBUTION))
  const mergedLateJoin = mergeHistograms(runs.map((run) => run.histograms.late_join.distribution ?? EMPTY_DISTRIBUTION))
  const mergedSurge = mergeHistograms(runs.map((run) => (run.histograms as Record<string, unknown>).surge_fan_out !== undefined
    ? ((run.histograms as Record<string, unknown>).surge_fan_out as { distribution?: typeof EMPTY_DISTRIBUTION }).distribution ?? EMPTY_DISTRIBUTION
    : EMPTY_DISTRIBUTION))
  const fanP95 = mergedFanOut.p95()
  const burstP95 = mergedBurst.p95()
  const lateJoinP95 = mergedLateJoin.p95()
  const surgeP95 = mergedSurge.p95()
  const latencyOk = mergedFanOut.count > 0 && fanP95 <= 500
    && mergedLateJoin.count > 0 && lateJoinP95 <= 2000
    && mergedSurge.count > 0 && surgeP95 <= 500
    && (mergedBurst.count === 0 || burstP95 <= 1000)
  add("latency thresholds", latencyOk,
    `fan_out_p95=${fanP95} burst_p95=${burstP95} late_join_p95=${lateJoinP95} surge_p95=${surgeP95} (gates 500/1000/2000/500)`)

  // 20. publisher workload/rates
  let publisherOk = runs.length > 0
  let publisherDetail = ""
  for (const run of runs) {
    const owner = run.shard_results.find((shard) => shard.publisher_owner)
    const pub = owner?.resources.generator as Record<string, unknown> | undefined
    const p = pub?.["publisher"] as Record<string, unknown> | undefined
    const rates = p?.["publication_rates"] as Record<string, unknown> | undefined
    if (!p || !rates) {
      publisherOk = false
      publisherDetail = `run ${run.run_index} publisher evidence missing`
      break
    }
    const windows: Array<[string, number, number]> = [
      ["steady_accepted_per_sec", 8.0, 12.0],
      ["burst_accepted_per_sec", 40.0, 60.0],
    ]
    for (const [key, minRate, maxRate] of windows) {
      const value = rates[key]
      if (typeof value !== "number" || value < minRate || value > maxRate) {
        publisherOk = false
        publisherDetail = `run ${run.run_index} ${key}=${String(value)} outside [${minRate}, ${maxRate}]`
        break
      }
    }
    if (!publisherOk) break
  }
  add("publisher workload/rates", publisherOk, publisherDetail || "measured rates inside frozen windows")

  // 21. generator validity
  const genBad = runs.flatMap((run) =>
    run.per_shard_generator_validity
      .filter((entry) => !entry.validity.generator_valid || !entry.validity.timing_valid || entry.validity.reasons.length > 0)
      .map((entry) => `run ${run.run_index} shard ${entry.shard_id}`))
  const genCoverage = runs.every((run) => run.per_shard_generator_validity.length === run.shard_count)
  add("generator validity", genCoverage && genBad.length === 0, genBad.length === 0 ? "valid on every shard of every run" : genBad.join(", "))

  // 22. Nchan p0..p3 validity
  let nchanOk = runs.length > 0
  let nchanDetail = ""
  for (const run of runs) {
    if (run.resources.nchan_partitions.length !== 4) {
      nchanOk = false
      nchanDetail = `run ${run.run_index} partition count ${run.resources.nchan_partitions.length}`
      break
    }
    for (const partition of run.resources.nchan_partitions) {
      const memoryPeak = partition.evidence["memory_peak_run_bytes"]
      if (typeof memoryPeak !== "number" || !Number.isFinite(memoryPeak) || memoryPeak < 0) {
        nchanOk = false
        nchanDetail = `run ${run.run_index} partition ${partition.partition_id} memory_peak_run_bytes invalid`
        break
      }
    }
    if (!nchanOk) break
  }
  add("Nchan p0..p3 validity", nchanOk, nchanDetail || "all four partitions report valid evidence")

  // 23. spare validity
  const spareBad = runs.filter((run) => {
    const spare = run.resources.nchan_spare
    if (!spare) return true
    return Object.keys(spare).length === 0 || Object.values(spare).every((value) => typeof value !== "number")
  }).map((run) => `run ${run.run_index}`)
  add("spare validity", spareBad.length === 0, spareBad.length === 0 ? "spare-node evidence present" : `missing in ${spareBad.join(", ")}`)

  // 24. Redis validity
  const redisBad = runs.flatMap((run) =>
    run.shard_results.filter((shard) => {
      const redis = shard.resources.redis
      const memory = redis["memory_used_bytes"]
      return typeof memory !== "number" || !Number.isFinite(memory) || memory < 0
    }).map((shard) => `run ${run.run_index} shard ${shard.shard_id}`))
  add("Redis validity", redisBad.length === 0, redisBad.length === 0 ? "memory evidence valid everywhere" : redisBad.join(", "))

  // 25-26. CV formula and threshold, recomputed independently.
  const recomputedMetrics = {
    global_active_peak: cv(runs.map((run) => run.active_population.global_active_peak)),
    fan_out_p95_ms: cv(runs.map((run) => run.histograms.fan_out.p95_ms)),
    late_join_p95_ms: cv(runs.map((run) => run.histograms.late_join.p95_ms)),
    burst_p95_ms: cv(runs.map((run) => run.histograms.burst.p95_ms)),
  }
  const recomputedWorst = Math.max(...Object.values(recomputedMetrics))
  const storedMetrics = campaign?.dispersion.metrics
  const formulaMatches = campaign !== null && storedMetrics !== undefined
    && Math.abs(recomputedWorst - campaign.dispersion.worst_cv) < 1e-9
    && Object.entries(recomputedMetrics).every(([key, value]) => Math.abs(value - (storedMetrics[key] ?? Number.NaN)) < 1e-9)
    && campaign.dispersion.threshold_cv === 0.15
  add("CV formula", formulaMatches,
    campaign === null ? "no campaign result" : `recomputed worst_cv ${recomputedWorst} vs stored ${campaign.dispersion.worst_cv}`)

  const cvWithinThreshold = recomputedWorst <= 0.15
  add("CV <=0.15", cvWithinThreshold, `worst_cv=${recomputedWorst}`)

  // 27. per-run verdict consistency
  const perRunConsistent = campaign !== null
    && JSON.stringify(campaign.per_run_verdicts) === JSON.stringify(runs.map((run) => run.verdict))
    && runs.every((run) => run.verdict === "ACCEPT"
      ? run.validity.valid && run.validity.reasons.length === 0
      : true)
  add("per-run verdict consistency", perRunConsistent,
    campaign === null ? "no campaign result" : `per_run_verdicts=[${campaign.per_run_verdicts.join(",")}]`)

  // 28. campaign verdict consistency (frozen rule recomputed from raw runs)
  let recomputedVerdict: GlobalExperimentResult["verdict"] = "INCONCLUSIVE"
  const structuralValid = runs.length === 3
    && seeds.every((seed, index) => seed === 42 + index)
    && fieldsPresent && nonzero.length === 0
    && reconnectOk && restartOk && lateJoinPerRunOk && lateJoinTotal === 768
    && deepComplete && deepAllExact
    && latencyOk && publisherOk && genBad.length === 0 && nchanOk && spareBad.length === 0 && redisBad.length === 0
    && surgeComplete && allSurgeExact && allSurgeAdditions && surgeFinalOk
    && ownerOk && phasesOk && shardsOk
  if (structuralValid && cvWithinThreshold && runs.every((run) => run.verdict === "ACCEPT" && run.validity.valid)) {
    recomputedVerdict = "ACCEPT"
  } else if (structuralValid && cvWithinThreshold && runs.every((run) => run.verdict !== "INCONCLUSIVE")) {
    recomputedVerdict = "REJECT"
  }
  const campaignConsistent = campaign !== null && campaign.verdict === recomputedVerdict
  add("campaign verdict consistency", campaignConsistent,
    campaign === null ? "no campaign result" : `machine=${campaign.verdict} independent=${recomputedVerdict}`)

  const pass = checks.every((check) => check.pass)
  const machineAccept = campaign?.verdict === "ACCEPT"
  return {
    checks,
    independent_verdict: pass ? "PASS" : "FAIL",
    machine_verdict: campaign?.verdict ?? "MISSING",
    agreement: pass && machineAccept,
  }
}

export function renderAuditMarkdown(result: IndependentAuditResult, header: {
  campaign_id: string | null
  source_commit: string | null
  generated_at_ms: number
}): string {
  const lines: string[] = [
    "# M3 Independent Verdict Audit",
    "",
    `- campaign_id: \`${header.campaign_id ?? "unknown"}\``,
    `- source_commit: \`${header.source_commit ?? "unknown"}\``,
    `- machine verdict: \`${result.machine_verdict}\``,
    `- independent verdict: **${result.independent_verdict}**`,
    `- agreement (independent PASS + machine ACCEPT): **${result.agreement ? "YES" : "NO"}**`,
    "",
    "| check | result | detail |",
    "|-------|--------|--------|",
  ]
  for (const check of result.checks) {
    lines.push(`| ${check.name} | ${check.pass ? "PASS" : "FAIL"} | ${check.detail.replaceAll("|", "\\|")} |`)
  }
  lines.push("", result.agreement
    ? "Independent audit AGREES with the machine ACCEPT verdict."
    : "Independent audit DISAGREES — M3 remains open.", "")
  return lines.join("\n")
}

async function main(): Promise<void> {
  const directory = process.env.GLOBAL_EVIDENCE_DIR ?? "/evidence"
  const sourceCommit = process.env.GIT_COMMIT_SHA ?? null
  const campaignId = process.env.CAMPAIGN_ID ?? null
  const baseSeedRaw = process.env.BASE_GLOBAL_SEED
  const baseSeed = baseSeedRaw !== undefined ? Number.parseInt(baseSeedRaw, 10) : null

  const resultFiles = fs.readdirSync(directory).filter((name) => /^global-result-\d+\.json$/.test(name)).sort()
  const runs: GlobalExperimentResult[] = resultFiles.map((name) =>
    JSON.parse(fs.readFileSync(path.join(directory, name), "utf8")) as GlobalExperimentResult)
  const campaignPath = path.join(directory, "campaign-result.json")
  const campaign = fs.existsSync(campaignPath)
    ? JSON.parse(fs.readFileSync(campaignPath, "utf8")) as GlobalCampaignResult
    : null

  const result = runIndependentAudit(runs, campaign, {
    campaign_id: campaignId,
    source_commit: sourceCommit,
    base_seed: baseSeed !== null && Number.isInteger(baseSeed) ? baseSeed : null,
  })
  const markdown = renderAuditMarkdown(result, {
    campaign_id: campaignId,
    source_commit: sourceCommit,
    generated_at_ms: Date.now(),
  })
  fs.writeFileSync(path.join(directory, "M3_INDEPENDENT_VERDICT_AUDIT.md"), markdown, "utf8")
  process.stdout.write(`${markdown}\n`)
  process.exitCode = result.agreement ? 0 : 1
}

if (process.argv[1] !== undefined && process.argv[1].endsWith("independent-verdict-audit.ts")) {
  void main()
}
