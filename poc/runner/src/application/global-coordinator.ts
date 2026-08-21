import crypto from "node:crypto"
import { StreamingHistogram } from "../adapters/streaming-histogram.js"
import type { SerializedHistogram } from "../adapters/streaming-histogram.js"
import { ACTIVE_CONTRACT_VERSION } from "../domain/active-contract.js"

export const COORDINATED_PHASES = [
  "preflight",
  "warmup",
  "steady",
  "surge",
  "target-barrier",
  "stabilization",
  "late-join",
  "burst",
  "post-burst",
  "reconnect",
  "slow-consumer",
  "restart-replacement",
  "final-metrics",
] as const

export type CoordinatedPhase = typeof COORDINATED_PHASES[number]
export type BarrierBoundary = "start" | "end"

export interface ShardRegistration {
  experiment_run_id?: string
  campaign_id: string
  shard_id: number
  shard_count: number
  local_target: number
  global_target: number
  seed: number
  source_commit: string
  publisher_owner: boolean
}

export interface BarrierReceipt {
  experiment_run_id: string
  phase: CoordinatedPhase
  boundary: BarrierBoundary
  released_at_ms: number
  participating_shard_ids: number[]
}

export interface AlignedSample {
  timestamp_ms: number
  phase: CoordinatedPhase
  active_current: number
  connections_attempted: number
  connections_established: number
  connection_failures: number
}

export interface ShardValidity {
  generator_valid: boolean
  source_port_headroom_valid: boolean
  nginx_worker_capacity_valid: boolean
  environment_valid: boolean
  timing_valid: boolean
  reasons: string[]
}

export interface ShardResourceEvidence {
  generator: Record<string, number | null>
  nchan: Record<string, number | null>
  redis: Record<string, number | null>
}

export interface ShardScenarioEvidence {
  name: "late-join" | "burst" | "reconnect" | "slow-consumer" | "restart-replacement"
  participated: boolean
  passed: boolean
  detail: string
  structured?: Record<string, unknown>
}

export interface ShardExperimentResult {
  contract_version: typeof ACTIVE_CONTRACT_VERSION
  aggregate_scope: "shard"
  scope: "shard"
  global_direct_accept_eligible: false
  experiment_run_id: string
  campaign_id: string
  run_index: number
  shard_id: number
  shard_count: number
  local_target: number
  global_target: number
  seed: number
  source_commit: string
  publisher_owner: boolean
  verdict: "ACCEPT" | "REJECT" | "INCONCLUSIVE" | "NOT_APPLICABLE"
  validity: ShardValidity
  samples: AlignedSample[]
  histograms: {
    fan_out: SerializedHistogram
    late_join: SerializedHistogram
    burst: SerializedHistogram
  }
  correctness_counters: Record<string, number>
  workload: {
    events_published: number
    phase_rates: Array<{ phase: string; attempted_per_sec: number; accepted_per_sec: number }>
  }
  resources: ShardResourceEvidence
  scenarios: ShardScenarioEvidence[]
}

export interface GlobalActiveEvidence {
  sample_bucket_ms: number
  complete_aligned_bucket_count: number
  global_active_peak: number
  buckets: Array<{
    bucket_start_ms: number
    phase: CoordinatedPhase
    active: number
    attempts_per_sec: number
    establishments_per_sec: number
    failures_per_sec: number
  }>
  scenarios: Record<string, { active_start: number; active_min: number; active_peak: number; active_end: number }>
}

export interface GlobalExperimentResult {
  contract_version: typeof ACTIVE_CONTRACT_VERSION
  aggregate_scope: "simultaneous_global_run"
  scope: "global"
  experiment_run_id: string
  campaign_id: string
  created_at_ms: number
  run_index: number
  seed: number
  participating_shard_ids: number[]
  shard_count: number
  global_target: number
  publisher_owner_shard_id: number | null
  source_commit: string | null
  phase_timings: Record<string, { start_ms: number; end_ms: number; duration_ms: number }>
  active_population: GlobalActiveEvidence
  workload_rates: ShardExperimentResult["workload"]
  histograms: {
    fan_out: ReturnType<typeof histogramSummary>
    late_join: ReturnType<typeof histogramSummary>
    burst: ReturnType<typeof histogramSummary>
  }
  correctness_counters: Record<string, number>
  per_shard_generator_validity: Array<{ shard_id: number; validity: ShardValidity }>
  resources: { nchan: Record<string, number | null>; redis: Record<string, number | null> }
  scenario_results: Array<{
    name: ShardScenarioEvidence["name"]
    passed: boolean
    participant_shard_ids: number[]
    active_population: { active_start: number; active_min: number; active_peak: number; active_end: number } | null
    details: Array<{ shard_id: number; participated: boolean; detail: string; structured?: Record<string, unknown> }>
  }>
  shard_results: ShardExperimentResult[]
  validity: { valid: boolean; reasons: string[] }
  verdict: "ACCEPT" | "REJECT" | "INCONCLUSIVE"
  global_direct_accept_eligible: boolean
}

interface BarrierState {
  arrivals: Set<number>
  releasedAtMs: number | null
  resolve: Array<(receipt: BarrierReceipt) => void>
  reject: Array<(error: Error) => void>
}

function isSha(value: string): boolean {
  return /^[0-9a-f]{40}$/i.test(value)
}

function histogramSummary(histogram: StreamingHistogram) {
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

function emptyHistogram(): SerializedHistogram {
  return { max_ms: 30_000, total_count: 0, overflow_count: 0, buckets: [] }
}

export function isExactRestartPathEvidence(value: unknown): boolean {
  if (!value || typeof value !== "object") return false
  const path = value as Record<string, unknown>
  const first = path.expected_first_seq
  const last = path.expected_last_seq
  const expectedCount = path.expected_count
  return typeof path.transport_resume_id === "string" && path.transport_resume_id.length > 0
    && typeof first === "number" && Number.isInteger(first)
    && typeof last === "number" && Number.isInteger(last) && last >= first
    && typeof expectedCount === "number" && expectedCount > 0 && expectedCount === last - first + 1
    && path.received_first_seq === first
    && path.received_last_seq === last
    && path.received_required_count === expectedCount
    && path.missing_required === 0
    && Array.isArray(path.missing_required_sequences) && path.missing_required_sequences.length === 0
    && path.duplicates === 0
    && path.out_of_order === 0
    && path.out_of_range_before_count === 0
    && path.out_of_range_after_count === 0
    && path.missing_prefix === false
    && path.target_reached === true
    && path.passed === true
}

export function hasExactRestartStructuredEvidence(structured: unknown): boolean {
  if (!structured || typeof structured !== "object") return false
  const paths = (structured as Record<string, unknown>).paths
  if (!paths || typeof paths !== "object") return false
  const record = paths as Record<string, unknown>
  return isExactRestartPathEvidence(record.literal_restart) && isExactRestartPathEvidence(record.cross_node)
}

export function hasNoFabricatedRestartPaths(structured: unknown): boolean {
  if (!structured || typeof structured !== "object") return true
  const paths = (structured as Record<string, unknown>).paths
  return !!paths && typeof paths === "object" && Object.keys(paths as Record<string, unknown>).length === 0
}

export function restartEvidenceMatchesRun(
  structured: unknown,
  expected: { campaign_id: string; experiment_run_id: string; run_index: number; shard_id: number },
): boolean {
  if (!structured || typeof structured !== "object") return false
  const record = structured as Record<string, unknown>
  return record.campaign_id === expected.campaign_id
    && record.experiment_run_id === expected.experiment_run_id
    && record.run_index === expected.run_index
    && record.shard_id === expected.shard_id
}

function hasExactRestartEvidence(scenario: ShardScenarioEvidence): boolean {
  return hasExactRestartStructuredEvidence(scenario.structured)
}

export class GlobalExperimentCoordinator {
  readonly experimentRunId: string
  readonly campaignId: string
  readonly shardCount: number
  readonly globalTarget: number
  readonly seed: number
  readonly bucketMs: number

  private registrations = new Map<number, ShardRegistration>()
  private barriers = new Map<string, BarrierState>()
  private results = new Map<number, ShardExperimentResult>()
  private phaseTimings = new Map<CoordinatedPhase, { start_ms?: number; end_ms?: number }>()
  private abortedReason: string | null = null

  constructor(options: {
    experimentRunId?: string
    campaignId: string
    shardCount: number
    globalTarget: number
    seed: number
    bucketMs?: number
  }) {
    if (!Number.isInteger(options.shardCount) || options.shardCount < 1) throw new Error("shardCount must be positive")
    if (!Number.isInteger(options.globalTarget) || options.globalTarget < 1) throw new Error("globalTarget must be positive")
    if (!options.campaignId.trim()) throw new Error("campaignId must be non-empty")
    this.experimentRunId = options.experimentRunId || crypto.randomUUID()
    this.campaignId = options.campaignId
    this.shardCount = options.shardCount
    this.globalTarget = options.globalTarget
    this.seed = options.seed
    this.bucketMs = options.bucketMs ?? 1000
  }

  register(registration: ShardRegistration): { experiment_run_id: string; seed: number; global_target: number } {
    if (this.abortedReason) throw new Error(`experiment aborted: ${this.abortedReason}`)
    if (!Number.isInteger(registration.shard_id) || registration.shard_id < 0 || registration.shard_id >= this.shardCount) {
      throw new Error(`invalid shard_id ${registration.shard_id}`)
    }
    if (this.registrations.has(registration.shard_id)) throw new Error(`duplicate shard_id ${registration.shard_id}`)
    if (registration.experiment_run_id && registration.experiment_run_id !== this.experimentRunId) throw new Error("experiment_run_id mismatch")
    if (registration.campaign_id !== this.campaignId) throw new Error("campaign_id mismatch")
    if (registration.shard_count !== this.shardCount) throw new Error("shard_count mismatch")
    if (registration.global_target !== this.globalTarget) throw new Error("global_target mismatch")
    if (registration.seed !== this.seed) throw new Error("global seed mismatch")
    if (!isSha(registration.source_commit)) throw new Error("source_commit must be a non-null valid SHA")
    if (!Number.isInteger(registration.local_target) || registration.local_target < 1) throw new Error("local_target must be positive")
    this.registrations.set(registration.shard_id, { ...registration, experiment_run_id: this.experimentRunId })
    return { experiment_run_id: this.experimentRunId, seed: this.seed, global_target: this.globalTarget }
  }

  async arrive(shardId: number, phase: CoordinatedPhase, boundary: BarrierBoundary): Promise<BarrierReceipt> {
    if (this.abortedReason) throw new Error(`experiment aborted: ${this.abortedReason}`)
    if (!this.registrations.has(shardId)) throw new Error(`unregistered shard ${shardId}`)
    const phaseIndex = COORDINATED_PHASES.indexOf(phase)
    if (phaseIndex < 0) throw new Error(`unknown phase ${phase}`)

    // A shard may not skip any earlier boundary. This is the local ordering half
    // of the global lifecycle guarantee; release requires every registered shard.
    for (let i = 0; i <= phaseIndex; i++) {
      const requiredPhase = COORDINATED_PHASES[i]
      const requiredBoundaries: BarrierBoundary[] = i === phaseIndex && boundary === "start" ? ["start"] : ["start", "end"]
      for (const requiredBoundary of requiredBoundaries) {
        if (requiredPhase === phase && requiredBoundary === boundary) continue
        const prior = this.barriers.get(`${requiredPhase}:${requiredBoundary}`)
        if (!prior?.arrivals.has(shardId)) throw new Error(`shard ${shardId} skipped ${requiredPhase}:${requiredBoundary}`)
      }
    }

    const key = `${phase}:${boundary}`
    let state = this.barriers.get(key)
    if (!state) {
      state = { arrivals: new Set(), releasedAtMs: null, resolve: [], reject: [] }
      this.barriers.set(key, state)
    }
    if (state.arrivals.has(shardId)) throw new Error(`duplicate barrier arrival ${key} from shard ${shardId}`)
    state.arrivals.add(shardId)

    const release = () => {
      if (!state || state.releasedAtMs !== null || state.arrivals.size !== this.shardCount) return
      state.releasedAtMs = Date.now()
      const timing = this.phaseTimings.get(phase) ?? {}
      if (boundary === "start") timing.start_ms = state.releasedAtMs
      else timing.end_ms = state.releasedAtMs
      this.phaseTimings.set(phase, timing)
      const receipt: BarrierReceipt = {
        experiment_run_id: this.experimentRunId,
        phase,
        boundary,
        released_at_ms: state.releasedAtMs,
        participating_shard_ids: [...state.arrivals].sort((a, b) => a - b),
      }
      for (const resolve of state.resolve.splice(0)) resolve(receipt)
      state.reject = []
    }

    return new Promise<BarrierReceipt>((resolve, reject) => {
      state!.resolve.push(resolve)
      state!.reject.push(reject)
      release()
    })
  }

  abort(reason: string): void {
    if (this.abortedReason) return
    this.abortedReason = reason || "unspecified shard abort"
    for (const state of this.barriers.values()) {
      for (const reject of state.reject.splice(0)) reject(new Error(`experiment aborted: ${this.abortedReason}`))
      state.resolve = []
    }
  }

  submitResult(result: ShardExperimentResult): void {
    if (this.abortedReason) throw new Error(`experiment aborted: ${this.abortedReason}`)
    if (!this.registrations.has(result.shard_id)) throw new Error(`unregistered shard ${result.shard_id}`)
    if (this.results.has(result.shard_id)) throw new Error(`duplicate result from shard ${result.shard_id}`)
    if (result.experiment_run_id !== this.experimentRunId) throw new Error("result experiment_run_id mismatch")
    if (result.campaign_id !== this.campaignId) throw new Error("result campaign_id mismatch")
    if (result.contract_version !== ACTIVE_CONTRACT_VERSION) throw new Error("result contract_version mismatch")
    if (result.aggregate_scope !== "shard" || result.scope !== "shard" || result.global_direct_accept_eligible !== false) {
      throw new Error("shard result attempted a global acceptance claim")
    }
    this.results.set(result.shard_id, result)
  }

  get registrationCount(): number { return this.registrations.size }
  get resultCount(): number { return this.results.size }
  get aborted(): string | null { return this.abortedReason }
  get complete(): boolean { return this.results.size === this.shardCount }

  buildGlobalResult(): GlobalExperimentResult {
    const shardResults = [...this.results.values()].sort((a, b) => a.shard_id - b.shard_id)
    const validityReasons: string[] = []
    const rejectReasons: string[] = []
    const ids = shardResults.map((result) => result.shard_id)

    if (this.abortedReason) validityReasons.push(`global abort: ${this.abortedReason}`)
    if (this.registrations.size !== this.shardCount) validityReasons.push(`registered shards ${this.registrations.size}/${this.shardCount}`)
    if (shardResults.length !== this.shardCount) validityReasons.push(`collected shard results ${shardResults.length}/${this.shardCount}`)

    const registrations = [...this.registrations.values()]
    const commits = new Set(registrations.map((value) => value.source_commit))
    const sourceCommit = commits.size === 1 ? [...commits][0] : null
    if (!sourceCommit || !isSha(sourceCommit)) validityReasons.push("all shards must report the same non-null valid source commit")
    const publisherOwners = registrations.filter((value) => value.publisher_owner)
    if (publisherOwners.length !== 1) validityReasons.push(`publisher owners ${publisherOwners.length}; expected exactly 1`)
    const localTargetTotal = registrations.reduce((sum, value) => sum + value.local_target, 0)
    if (localTargetTotal !== this.globalTarget) validityReasons.push(`local targets sum to ${localTargetTotal}, expected ${this.globalTarget}`)

    for (const phase of COORDINATED_PHASES) {
      for (const boundary of ["start", "end"] as const) {
        const state = this.barriers.get(`${phase}:${boundary}`)
        if (state?.arrivals.size !== this.shardCount || state.releasedAtMs === null) {
          validityReasons.push(`incomplete barrier ${phase}:${boundary}`)
        }
      }
    }

    for (const result of shardResults) {
      if (!result.validity.generator_valid || !result.validity.source_port_headroom_valid ||
        !result.validity.nginx_worker_capacity_valid || !result.validity.environment_valid || !result.validity.timing_valid) {
        validityReasons.push(`shard ${result.shard_id} invalid: ${result.validity.reasons.join("; ") || "validity flag failed"}`)
      }
      if (result.source_commit !== sourceCommit) validityReasons.push(`shard ${result.shard_id} result source commit mismatch`)
    }

    const nonOwnerPublished = shardResults.filter((result) => !result.publisher_owner && result.workload.events_published !== 0)
    if (nonOwnerPublished.length > 0) validityReasons.push(`non-owner shards published events: ${nonOwnerPublished.map((r) => r.shard_id).join(",")}`)
    const ownerResult = shardResults.find((result) => result.publisher_owner)
    if (!ownerResult || ownerResult.workload.events_published <= 0) validityReasons.push("authoritative publisher produced no accepted workload")

    const activeEvidence = alignSamples(shardResults, this.shardCount, this.bucketMs)
    if (activeEvidence.complete_aligned_bucket_count === 0) validityReasons.push("no complete aligned concurrency buckets")
    if (activeEvidence.global_active_peak < this.globalTarget) rejectReasons.push(`aligned global active peak ${activeEvidence.global_active_peak} < ${this.globalTarget}`)

    const mergedFanOut = mergeHistograms(shardResults.map((result) => result.histograms.fan_out ?? emptyHistogram()))
    const mergedLateJoin = mergeHistograms(shardResults.map((result) => result.histograms.late_join ?? emptyHistogram()))
    const mergedBurst = mergeHistograms(shardResults.map((result) => result.histograms.burst ?? emptyHistogram()))
    if (mergedFanOut.count === 0) validityReasons.push("global fan-out histogram is empty")
    if (mergedBurst.count === 0) validityReasons.push("global burst fan-out histogram is empty")
    if (mergedLateJoin.count !== 1) validityReasons.push(`global late-join sample count ${mergedLateJoin.count}; expected exactly 1 publisher-owner sample`)

    const correctnessCounters: Record<string, number> = {}
    for (const result of shardResults) {
      for (const [name, value] of Object.entries(result.correctness_counters)) {
        correctnessCounters[name] = (correctnessCounters[name] ?? 0) + value
      }
    }
    for (const name of ["missing_sequences", "duplicates", "out_of_order", "reconnect_gaps", "reconnect_duplicates", "reconnect_order_violations"]) {
      if ((correctnessCounters[name] ?? 0) > 0) rejectReasons.push(`${name}=${correctnessCounters[name]}`)
    }

    const scenarioNames: ShardScenarioEvidence["name"][] = ["late-join", "burst", "reconnect", "slow-consumer", "restart-replacement"]
    const scenarioResults = scenarioNames.map((name) => {
      const records = shardResults.flatMap((result) => result.scenarios.filter((scenario) => scenario.name === name).map((scenario) => ({ shardId: result.shard_id, owner: result.publisher_owner, scenario })))
      const participants = records.filter(({ scenario }) => scenario.participated)
      const phaseName = name === "restart-replacement" ? "restart-replacement" : name
      const active = activeEvidence.scenarios[phaseName] ?? null
      let passed = participants.length > 0 && participants.every(({ scenario }) => scenario.passed)
      if (name === "restart-replacement") {
        const ownerRecords = records.filter(({ owner }) => owner)
        const nonOwnerRecords = records.filter(({ owner }) => !owner)
        const validOwner = ownerRecords.length === 1
          && ownerRecords[0].scenario.participated
          && ownerRecords[0].scenario.passed
          && hasExactRestartEvidence(ownerRecords[0].scenario)
          && restartEvidenceMatchesRun(ownerRecords[0].scenario.structured, {
            campaign_id: this.campaignId,
            experiment_run_id: this.experimentRunId,
            run_index: ownerResult?.run_index ?? -1,
            shard_id: ownerRecords[0].shardId,
          })
        const validNonOwners = nonOwnerRecords.length === Math.max(0, this.shardCount - 1)
          && nonOwnerRecords.every(({ scenario }) => !scenario.participated
            && scenario.passed
            && hasNoFabricatedRestartPaths(scenario.structured))
        passed = validOwner && validNonOwners
        if (!validNonOwners) validityReasons.push("restart non-owner participation/evidence is invalid")
      }
      if (!passed) rejectReasons.push(`${name} scenario failed or had no participant`)
      if (active) {
        const requiredMin = name === "reconnect" ? Math.floor(this.globalTarget * 0.9) : this.globalTarget
        if (active.active_min < requiredMin) rejectReasons.push(`${name} active minimum ${active.active_min} < ${requiredMin}`)
      } else {
        validityReasons.push(`${name} has no complete aligned active-population evidence`)
      }
      return {
        name,
        passed,
        participant_shard_ids: participants.map(({ shardId }) => shardId),
        active_population: active,
        details: records.map(({ shardId, scenario }) => ({
          shard_id: shardId,
          participated: scenario.participated,
          detail: scenario.detail,
          ...(scenario.structured ? { structured: scenario.structured } : {}),
        })),
      }
    })

    const phaseTimings: GlobalExperimentResult["phase_timings"] = {}
    for (const [phase, timing] of this.phaseTimings) {
      if (timing.start_ms !== undefined && timing.end_ms !== undefined) {
        phaseTimings[phase] = { start_ms: timing.start_ms, end_ms: timing.end_ms, duration_ms: timing.end_ms - timing.start_ms }
      }
    }

    // Shared DUT/Redis resources are observed exactly once by the publisher-owner
    // shard. They are not summed across duplicated observations.
    const resources = {
      nchan: ownerResult?.resources.nchan ?? {},
      redis: ownerResult?.resources.redis ?? {},
    }
    const redisMemoryUsedBytes = resources.redis.memory_used_bytes
    if (typeof redisMemoryUsedBytes !== "number" || !Number.isFinite(redisMemoryUsedBytes) || redisMemoryUsedBytes < 0) {
      validityReasons.push("mandatory Redis memory_used_bytes evidence is missing or invalid")
    }

    const validity = { valid: validityReasons.length === 0, reasons: validityReasons }
    // An invalid/inconclusive shard means the global experiment cannot support
    // a DUT rejection either: generator/environment evidence is not trustworthy.
    // Only healthy, conclusive shard evidence can yield a global REJECT.
    const hasInconclusiveShard = shardResults.some((result) => result.verdict === "INCONCLUSIVE" || result.verdict === "NOT_APPLICABLE")
    const verdict: GlobalExperimentResult["verdict"] = !validity.valid || hasInconclusiveShard
      ? "INCONCLUSIVE"
      : rejectReasons.length > 0 || shardResults.some((result) => result.verdict === "REJECT")
        ? "REJECT"
        : "ACCEPT"

    if (rejectReasons.length > 0 && validity.valid) validity.reasons.push(...rejectReasons)

    return {
      contract_version: ACTIVE_CONTRACT_VERSION,
      aggregate_scope: "simultaneous_global_run",
      scope: "global",
      experiment_run_id: this.experimentRunId,
      campaign_id: this.campaignId,
      created_at_ms: Date.now(),
      run_index: shardResults[0]?.run_index ?? 0,
      seed: this.seed,
      participating_shard_ids: ids,
      shard_count: this.shardCount,
      global_target: this.globalTarget,
      publisher_owner_shard_id: publisherOwners.length === 1 ? publisherOwners[0].shard_id : null,
      source_commit: sourceCommit,
      phase_timings: phaseTimings,
      active_population: activeEvidence,
      workload_rates: ownerResult?.workload ?? { events_published: 0, phase_rates: [] },
      histograms: {
        fan_out: histogramSummary(mergedFanOut),
        late_join: histogramSummary(mergedLateJoin),
        burst: histogramSummary(mergedBurst),
      },
      correctness_counters: correctnessCounters,
      per_shard_generator_validity: shardResults.map((result) => ({ shard_id: result.shard_id, validity: result.validity })),
      resources,
      scenario_results: scenarioResults,
      shard_results: shardResults,
      validity,
      verdict,
      global_direct_accept_eligible: verdict === "ACCEPT",
    }
  }
}

export function mergeHistograms(histograms: SerializedHistogram[]): StreamingHistogram {
  if (histograms.length === 0) return new StreamingHistogram()
  const maxMs = Math.max(...histograms.map((value) => value.max_ms))
  const merged = new StreamingHistogram(maxMs)
  for (const serialized of histograms) merged.merge(StreamingHistogram.deserialize(serialized))
  return merged
}

export function alignSamples(results: ShardExperimentResult[], shardCount: number, bucketMs = 1000): GlobalActiveEvidence {
  const perBucket = new Map<number, Map<number, AlignedSample>>()
  for (const result of results) {
    for (const sample of result.samples) {
      const bucket = Math.floor(sample.timestamp_ms / bucketMs) * bucketMs
      let shardMap = perBucket.get(bucket)
      if (!shardMap) {
        shardMap = new Map()
        perBucket.set(bucket, shardMap)
      }
      const prior = shardMap.get(result.shard_id)
      if (!prior || prior.timestamp_ms < sample.timestamp_ms) shardMap.set(result.shard_id, sample)
    }
  }

  const complete = [...perBucket.entries()]
    .filter(([, values]) => values.size === shardCount)
    .sort(([a], [b]) => a - b)
  const buckets: GlobalActiveEvidence["buckets"] = []
  let prior: Map<number, AlignedSample> | null = null
  for (const [bucketStart, values] of complete) {
    const samples = [...values.values()]
    const active = samples.reduce((sum, sample) => sum + sample.active_current, 0)
    let attempts = 0
    let establishments = 0
    let failures = 0
    if (prior) {
      for (const [shardId, sample] of values) {
        const before = prior.get(shardId)
        if (!before) continue
        attempts += Math.max(0, sample.connections_attempted - before.connections_attempted)
        establishments += Math.max(0, sample.connections_established - before.connections_established)
        failures += Math.max(0, sample.connection_failures - before.connection_failures)
      }
    }
    const phases = new Set(samples.map((sample) => sample.phase))
    // A cross-phase bucket is excluded: phase attribution would be ambiguous.
    if (phases.size === 1) {
      buckets.push({
        bucket_start_ms: bucketStart,
        phase: samples[0].phase,
        active,
        attempts_per_sec: attempts * (1000 / bucketMs),
        establishments_per_sec: establishments * (1000 / bucketMs),
        failures_per_sec: failures * (1000 / bucketMs),
      })
    }
    prior = values
  }

  const scenarios: GlobalActiveEvidence["scenarios"] = {}
  for (const phase of ["late-join", "burst", "reconnect", "slow-consumer", "restart-replacement"] as CoordinatedPhase[]) {
    const phaseBuckets = buckets.filter((bucket) => bucket.phase === phase)
    if (phaseBuckets.length === 0) continue
    const populations = phaseBuckets.map((bucket) => bucket.active)
    scenarios[phase] = {
      active_start: populations[0],
      active_min: Math.min(...populations),
      active_peak: Math.max(...populations),
      active_end: populations[populations.length - 1],
    }
  }
  return {
    sample_bucket_ms: bucketMs,
    complete_aligned_bucket_count: buckets.length,
    global_active_peak: buckets.reduce((peak, bucket) => Math.max(peak, bucket.active), 0),
    buckets,
    scenarios,
  }
}
