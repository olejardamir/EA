import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { StreamingHistogram } from "../adapters/streaming-histogram.js"
import {
  COORDINATED_PHASES,
  GlobalExperimentCoordinator,
  alignSamples,
  mergeHistograms,
} from "../application/global-coordinator.js"
import type {
  AlignedSample,
  ShardExperimentResult,
  ShardRegistration,
} from "../application/global-coordinator.js"

const SHA = "64d0661cb607067f2b1dd59b25229c58a646f549"

function histogram(values: number[]) {
  const value = new StreamingHistogram()
  for (const sample of values) value.record(sample)
  return value.serialize()
}

function registration(shardId: number, overrides: Partial<ShardRegistration> = {}): ShardRegistration {
  return {
    shard_id: shardId,
    shard_count: 2,
    local_target: 50,
    global_target: 100,
    seed: 42,
    source_commit: SHA,
    publisher_owner: shardId === 0,
    ...overrides,
  }
}

function scenarioSamples(shardId: number): AlignedSample[] {
  const samples: AlignedSample[] = []
  let attempted = 0
  let established = 0
  for (let index = 0; index < COORDINATED_PHASES.length; index++) {
    const phase = COORDINATED_PHASES[index]
    for (let offset = 0; offset < 2; offset++) {
      attempted += index === 3 ? 5 : 0
      established += index === 3 ? 5 : 0
      samples.push({
        timestamp_ms: (index * 2 + offset + 1) * 1000 + shardId * 10,
        phase,
        active_current: phase === "reconnect" && offset === 0 ? 45 : 50,
        connections_attempted: attempted,
        connections_established: established,
        connection_failures: 0,
      })
    }
  }
  return samples
}

function shardResult(shardId: number, overrides: Partial<ShardExperimentResult> = {}): ShardExperimentResult {
  const owner = shardId === 0
  return {
    aggregate_scope: "shard",
    scope: "shard",
    global_direct_accept_eligible: false,
    experiment_run_id: "run-1",
    run_index: 0,
    shard_id: shardId,
    shard_count: 2,
    local_target: 50,
    global_target: 100,
    seed: 42,
    source_commit: SHA,
    publisher_owner: owner,
    verdict: "ACCEPT",
    validity: {
      generator_valid: true,
      source_port_headroom_valid: true,
      nginx_worker_capacity_valid: true,
      environment_valid: true,
      timing_valid: true,
      reasons: [],
    },
    samples: scenarioSamples(shardId),
    histograms: { fan_out: histogram([10 + shardId * 10, 20 + shardId * 10]), late_join: histogram([100 + shardId * 100]) },
    correctness_counters: {
      missing_sequences: 0,
      duplicates: 0,
      out_of_order: 0,
      reconnect_gaps: 0,
      reconnect_duplicates: 0,
      reconnect_order_violations: 0,
    },
    workload: {
      events_published: owner ? 100 : 0,
      phase_rates: owner ? [{ phase: "steady", attempted_per_sec: 10, accepted_per_sec: 10 }] : [],
    },
    resources: {
      generator: { cpu_percent_of_capacity_peak: 50 },
      nchan: owner ? { memory_peak_run_bytes: 1000 } : {},
      redis: owner ? { memory_peak_run_bytes: 500 } : {},
    },
    scenarios: [
      { name: "late-join", participated: owner, passed: true, detail: owner ? "exact full history" : "owner-only" },
      { name: "burst", participated: owner, passed: true, detail: owner ? "authoritative burst" : "owner-only" },
      { name: "reconnect", participated: true, passed: true, detail: "all clients re-established" },
      { name: "slow-consumer", participated: true, passed: true, detail: "independent offered/consumed proof" },
      { name: "restart-replacement", participated: owner, passed: true, detail: owner ? "non-empty exact ranges" : "owner-only" },
    ],
    ...overrides,
  }
}

async function completeBarriers(coordinator: GlobalExperimentCoordinator): Promise<void> {
  for (const phase of COORDINATED_PHASES) {
    await Promise.all([coordinator.arrive(0, phase, "start"), coordinator.arrive(1, phase, "start")])
    await Promise.all([coordinator.arrive(0, phase, "end"), coordinator.arrive(1, phase, "end")])
  }
}

describe("GlobalExperimentCoordinator", () => {
  it("does not release a phase until every shard reaches the same barrier", async () => {
    const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", shardCount: 2, globalTarget: 100, seed: 42 })
    coordinator.register(registration(0))
    coordinator.register(registration(1))
    let released = false
    const first = coordinator.arrive(0, "preflight", "start").then(() => { released = true })
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(released, false)
    const second = coordinator.arrive(1, "preflight", "start")
    await Promise.all([first, second])
    assert.equal(released, true)
  })

  it("propagates a global abort to shards waiting at a barrier", async () => {
    const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", shardCount: 2, globalTarget: 100, seed: 42 })
    coordinator.register(registration(0))
    coordinator.register(registration(1))
    const waiting = coordinator.arrive(0, "preflight", "start")
    coordinator.abort("shard 1 failed preflight")
    await assert.rejects(waiting, /shard 1 failed preflight/)
  })

  it("rejects inconsistent seeds, commits, targets, and duplicate shard IDs", () => {
    const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", shardCount: 2, globalTarget: 100, seed: 42 })
    coordinator.register(registration(0))
    assert.throws(() => coordinator.register(registration(0)), /duplicate shard_id/)
    assert.throws(() => coordinator.register(registration(1, { seed: 43 })), /seed mismatch/)
    assert.throws(() => coordinator.register(registration(1, { source_commit: "unknown" })), /valid SHA/)
    assert.throws(() => coordinator.register(registration(1, { global_target: 101 })), /target mismatch/)
  })

  it("merges actual histogram populations and recomputes global percentiles", () => {
    const merged = mergeHistograms([histogram([10, 10, 20]), histogram([100, 200])])
    assert.equal(merged.count, 5)
    assert.equal(merged.p50(), 20)
    assert.equal(merged.p95(), 200)
    assert.equal(merged.max, 200)
  })

  it("computes aligned concurrency instead of summing unrelated shard peaks", () => {
    const first = shardResult(0, { samples: [
      { timestamp_ms: 1000, phase: "surge", active_current: 80, connections_attempted: 0, connections_established: 0, connection_failures: 0 },
      { timestamp_ms: 2000, phase: "surge", active_current: 20, connections_attempted: 10, connections_established: 10, connection_failures: 0 },
    ] })
    const second = shardResult(1, { samples: [
      { timestamp_ms: 1010, phase: "surge", active_current: 20, connections_attempted: 0, connections_established: 0, connection_failures: 0 },
      { timestamp_ms: 2010, phase: "surge", active_current: 80, connections_attempted: 10, connections_established: 10, connection_failures: 0 },
    ] })
    const aligned = alignSamples([first, second], 2)
    assert.equal(aligned.global_active_peak, 100)
    assert.notEqual(aligned.global_active_peak, 160)
    assert.equal(aligned.buckets[1].establishments_per_sec, 20)
  })

  it("produces one global ACCEPT only after all barriers and global evidence pass", async () => {
    const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", shardCount: 2, globalTarget: 100, seed: 42 })
    coordinator.register(registration(0))
    coordinator.register(registration(1))
    await completeBarriers(coordinator)
    coordinator.submitResult(shardResult(0))
    coordinator.submitResult(shardResult(1))
    const result = coordinator.buildGlobalResult()
    assert.equal(result.aggregate_scope, "simultaneous_global_run")
    assert.equal(result.active_population.global_active_peak, 100)
    assert.equal(result.publisher_owner_shard_id, 0)
    assert.equal(result.workload_rates.events_published, 100)
    assert.equal(result.resources.nchan.memory_peak_run_bytes, 1000)
    assert.equal(result.histograms.fan_out.count, 4)
    assert.equal(result.verdict, "ACCEPT")
    assert.equal(result.global_direct_accept_eligible, true)
  })

  it("prevents a shard-local direct/global acceptance claim", () => {
    const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", shardCount: 2, globalTarget: 100, seed: 42 })
    coordinator.register(registration(0))
    assert.throws(() => coordinator.submitResult({
      ...shardResult(0),
      global_direct_accept_eligible: true,
    } as unknown as ShardExperimentResult), /global acceptance claim/)
  })

  it("returns INCONCLUSIVE for generator/environment invalidity and REJECT for healthy DUT capacity failure", async () => {
    const invalid = new GlobalExperimentCoordinator({ experimentRunId: "run-1", shardCount: 2, globalTarget: 100, seed: 42 })
    invalid.register(registration(0)); invalid.register(registration(1)); await completeBarriers(invalid)
    invalid.submitResult(shardResult(0, { validity: { ...shardResult(0).validity, generator_valid: false, reasons: ["event loop saturated"] } }))
    invalid.submitResult(shardResult(1))
    assert.equal(invalid.buildGlobalResult().verdict, "INCONCLUSIVE")

    const capacity = new GlobalExperimentCoordinator({ experimentRunId: "run-1", shardCount: 2, globalTarget: 100, seed: 42 })
    capacity.register(registration(0)); capacity.register(registration(1)); await completeBarriers(capacity)
    const low = (id: number) => shardResult(id, { samples: scenarioSamples(id).map((sample) => ({ ...sample, active_current: 40 })) })
    capacity.submitResult(low(0)); capacity.submitResult(low(1))
    assert.equal(capacity.buildGlobalResult().verdict, "REJECT")
  })
})
