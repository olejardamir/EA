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

function histogram(values: number[], maxMs = 30_000) {
  const value = new StreamingHistogram(maxMs)
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

function fullSampleSet(shardId: number, activeCurrent = 50): AlignedSample[] {
  const samples: AlignedSample[] = []
  let counters = 0
  for (let index = 0; index < COORDINATED_PHASES.length; index++) {
    for (let offset = 0; offset < 2; offset++) {
      counters += 1
      samples.push({
        timestamp_ms: (index * 2 + offset + 1) * 1000 + shardId * 10,
        phase: COORDINATED_PHASES[index],
        active_current: activeCurrent,
        connections_attempted: counters,
        connections_established: counters,
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
    samples: fullSampleSet(shardId),
    histograms: { fan_out: histogram([10, 20]), late_join: histogram([5]) },
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
    resources: { generator: {}, nchan: owner ? { memory_peak_run_bytes: 1000 } : {}, redis: {} },
    scenarios: [
      { name: "late-join", participated: owner, passed: true, detail: "ok" },
      { name: "burst", participated: owner, passed: true, detail: "ok" },
      { name: "reconnect", participated: true, passed: true, detail: "ok" },
      { name: "slow-consumer", participated: true, passed: true, detail: "ok" },
      { name: "restart-replacement", participated: owner, passed: true, detail: "ok" },
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

describe("GlobalExperimentCoordinator adversarial", () => {
  it("rejects out-of-range and non-integer shard IDs", () => {
    const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", shardCount: 2, globalTarget: 100, seed: 42 })
    assert.throws(() => coordinator.register(registration(-1)), /invalid shard_id/)
    assert.throws(() => coordinator.register(registration(2)), /invalid shard_id/)
    assert.throws(() => coordinator.register(registration(1.5)), /invalid shard_id/)
  })

  it("binds every barrier receipt to the one coordinator-issued experiment run ID", async () => {
    const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", shardCount: 1, globalTarget: 100, seed: 42 })
    assert.throws(() => coordinator.register(registration(0, { experiment_run_id: "different-run", shard_count: 1 })), /mismatch/)
    coordinator.register(registration(0, { shard_count: 1 }))
    const receipt = await coordinator.arrive(0, "preflight", "start")
    assert.equal(receipt.experiment_run_id, "run-1")
  })

  it("marks the aggregate invalid when local targets do not sum to the global target", async () => {
    const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", shardCount: 2, globalTarget: 100, seed: 42 })
    coordinator.register(registration(0, { local_target: 40 }))
    coordinator.register(registration(1, { local_target: 40 }))
    await completeBarriers(coordinator)
    coordinator.submitResult(shardResult(0, { local_target: 40 }))
    coordinator.submitResult(shardResult(1, { local_target: 40 }))
    const result = coordinator.buildGlobalResult()
    assert.equal(result.validity.valid, false)
    assert.ok(result.validity.reasons.some((reason) => reason.includes("local targets sum to 80")))
  })

  it("excludes cross-phase buckets from aligned concurrency evidence", () => {
    // The two shards' latest samples inside the same bucket disagree on phase,
    // so phase attribution would be ambiguous and the bucket must be excluded.
    const first = shardResult(0, { samples: [
      { timestamp_ms: 1000, phase: "surge", active_current: 80, connections_attempted: 0, connections_established: 0, connection_failures: 0 },
      { timestamp_ms: 1500, phase: "surge", active_current: 80, connections_attempted: 5, connections_established: 5, connection_failures: 0 },
    ] })
    const second = shardResult(1, { samples: [
      { timestamp_ms: 1010, phase: "target-barrier", active_current: 20, connections_attempted: 0, connections_established: 0, connection_failures: 0 },
      { timestamp_ms: 1510, phase: "target-barrier", active_current: 20, connections_attempted: 5, connections_established: 5, connection_failures: 0 },
    ] })
    const aligned = alignSamples([first, second], 2)
    assert.equal(aligned.complete_aligned_bucket_count, 0)
    assert.equal(aligned.global_active_peak, 0)
  })

  it("never sums peaks from buckets where a shard is missing", () => {
    const first = shardResult(0, { samples: [
      { timestamp_ms: 1000, phase: "steady", active_current: 90, connections_attempted: 0, connections_established: 0, connection_failures: 0 },
      { timestamp_ms: 3000, phase: "steady", active_current: 10, connections_attempted: 4, connections_established: 4, connection_failures: 0 },
    ] })
    const second = shardResult(1, { samples: [
      { timestamp_ms: 3000, phase: "steady", active_current: 95, connections_attempted: 4, connections_established: 4, connection_failures: 0 },
    ] })
    const aligned = alignSamples([first, second], 2)
    // Bucket at t=1000 has only shard 0 (90 active) — excluded.
    // Bucket at t=3000 is complete: 10 + 95 = 105, not 185 (sum of unrelated peaks).
    assert.equal(aligned.global_active_peak, 105)
  })

  it("returns INCONCLUSIVE when a shard never submits a result", async () => {
    const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", shardCount: 2, globalTarget: 100, seed: 42 })
    coordinator.register(registration(0))
    coordinator.register(registration(1))
    await completeBarriers(coordinator)
    coordinator.submitResult(shardResult(0))
    const result = coordinator.buildGlobalResult()
    assert.equal(result.verdict, "INCONCLUSIVE")
    assert.equal(result.global_direct_accept_eligible, false)
    assert.ok(result.validity.reasons.some((reason) => reason.includes("collected shard results 1/2")))
  })

  it("flags non-owner shards that published workload", async () => {
    const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", shardCount: 2, globalTarget: 100, seed: 42 })
    coordinator.register(registration(0))
    coordinator.register(registration(1))
    await completeBarriers(coordinator)
    coordinator.submitResult(shardResult(0))
    coordinator.submitResult(shardResult(1, { workload: { events_published: 50, phase_rates: [] } }))
    const result = coordinator.buildGlobalResult()
    assert.equal(result.validity.valid, false)
    assert.ok(result.validity.reasons.some((reason) => reason.includes("non-owner shards published events: 1")))
  })

  it("merges histograms across ranges, preserving clamped maxima and overflow counts", () => {
    // Values beyond a histogram's range clamp to its max bucket; negative
    // values count as overflows. Merging must preserve both faithfully.
    const narrow = histogram([29_000, -5], 30_000)
    const wide = histogram([40_000], 60_000)
    const merged = mergeHistograms([narrow, wide])
    assert.equal(merged.count, 3)
    assert.equal(merged.overflows, 1)
    assert.equal(merged.max, 40_000)
  })

  it("detects a shard skipping an earlier phase boundary", async () => {
    const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", shardCount: 1, globalTarget: 100, seed: 42 })
    coordinator.register(registration(0, { shard_count: 1 }))
    await coordinator.arrive(0, "preflight", "start")
    await coordinator.arrive(0, "preflight", "end")
    await coordinator.arrive(0, "warmup", "start")
    await coordinator.arrive(0, "warmup", "end")
    // Shard 0 skips steady:start entirely.
    await assert.rejects(coordinator.arrive(0, "surge", "start"), /skipped steady:start/)
  })

  it("rejects duplicate barrier arrivals from the same shard", async () => {
    const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", shardCount: 1, globalTarget: 100, seed: 42 })
    coordinator.register(registration(0, { shard_count: 1 }))
    await coordinator.arrive(0, "preflight", "start")
    await assert.rejects(coordinator.arrive(0, "preflight", "start"), /duplicate barrier arrival/)
  })

  it("keeps the first abort reason when abort is called repeatedly", async () => {
    const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", shardCount: 2, globalTarget: 100, seed: 42 })
    coordinator.register(registration(0))
    coordinator.register(registration(1))
    const waiting = coordinator.arrive(0, "preflight", "start")
    coordinator.abort("first failure")
    coordinator.abort("second failure")
    await assert.rejects(waiting, /first failure/)
    assert.equal(coordinator.aborted, "first failure")
    assert.throws(() => coordinator.register(registration(1)), /aborted/)
  })

  it("rejects results from unregistered shards and duplicate submissions", async () => {
    const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", shardCount: 2, globalTarget: 100, seed: 42 })
    coordinator.register(registration(0))
    coordinator.register(registration(1))
    await completeBarriers(coordinator)
    assert.throws(() => coordinator.submitResult(shardResult(7)), /unregistered shard/)
    coordinator.submitResult(shardResult(0))
    assert.throws(() => coordinator.submitResult(shardResult(0)), /duplicate result/)
  })

  it("treats a failed per-shard source-port headroom flag as invalidating", async () => {
    const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", shardCount: 2, globalTarget: 100, seed: 42 })
    coordinator.register(registration(0))
    coordinator.register(registration(1))
    await completeBarriers(coordinator)
    coordinator.submitResult(shardResult(0, {
      validity: { ...shardResult(0).validity, source_port_headroom_valid: false, reasons: ["source-port headroom exhausted"] },
    }))
    coordinator.submitResult(shardResult(1))
    const result = coordinator.buildGlobalResult()
    assert.equal(result.verdict, "INCONCLUSIVE")
    assert.ok(result.validity.reasons.some((reason) => reason.includes("shard 0 invalid")))
  })

  it("requires a non-empty global fan-out histogram", async () => {
    const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", shardCount: 2, globalTarget: 100, seed: 42 })
    coordinator.register(registration(0))
    coordinator.register(registration(1))
    await completeBarriers(coordinator)
    coordinator.submitResult(shardResult(0, { histograms: { fan_out: histogram([]), late_join: histogram([]) } }))
    coordinator.submitResult(shardResult(1, { histograms: { fan_out: histogram([]), late_join: histogram([]) } }))
    const result = coordinator.buildGlobalResult()
    assert.equal(result.validity.valid, false)
    assert.ok(result.validity.reasons.some((reason) => reason.includes("global fan-out histogram is empty")))
  })

  it("reports REJECT when any correctness counter is nonzero across shards", async () => {
    const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", shardCount: 2, globalTarget: 100, seed: 42 })
    coordinator.register(registration(0))
    coordinator.register(registration(1))
    await completeBarriers(coordinator)
    coordinator.submitResult(shardResult(0))
    coordinator.submitResult(shardResult(1, {
      correctness_counters: { missing_sequences: 0, duplicates: 3, out_of_order: 0, reconnect_gaps: 0, reconnect_duplicates: 0, reconnect_order_violations: 0 },
    }))
    const result = coordinator.buildGlobalResult()
    assert.equal(result.verdict, "REJECT")
    assert.ok(result.validity.reasons.some((reason) => reason.includes("duplicates=3")))
  })

  it("does not let a single 28k-scale shard verdict stand in for the global verdict", async () => {
    // Shard 0 claims ACCEPT at its local scale while the aligned global peak
    // never reaches the global target — the global result must be REJECT.
    const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", shardCount: 2, globalTarget: 100, seed: 42 })
    coordinator.register(registration(0))
    coordinator.register(registration(1))
    await completeBarriers(coordinator)
    coordinator.submitResult(shardResult(0, {
      samples: fullSampleSet(0, 28),
    }))
    coordinator.submitResult(shardResult(1, {
      samples: fullSampleSet(1, 28),
    }))
    const result = coordinator.buildGlobalResult()
    assert.equal(result.active_population.global_active_peak, 56)
    assert.equal(result.shard_results.every((shard) => shard.verdict === "ACCEPT"), true)
    assert.equal(result.verdict, "REJECT")
    assert.equal(result.global_direct_accept_eligible, false)
  })
})
