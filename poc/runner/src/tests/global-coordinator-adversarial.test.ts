import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { StreamingHistogram } from "../adapters/streaming-histogram.js"
import {
  COORDINATED_PHASES,
  GlobalExperimentCoordinator,
  alignSamples,
  mergeHistograms,
  isExactRestartPathEvidence,
  restartEvidenceMatchesRun,
} from "../application/global-coordinator.js"
import type {
  AlignedSample,
  ShardExperimentResult,
  ShardRegistration,
} from "../application/global-coordinator.js"
import { ACTIVE_CONTRACT_VERSION } from "../domain/active-contract.js"
import {
  validOwnerRestartStructuredEvidence,
  validTargetRestartStructuredEvidence,
} from "./restart-evidence-fixture.js"
import { validSurgeScenarioEvidence } from "./surge-evidence-fixture.js"
import { validTimingEvidence } from "./timing-evidence-fixture.js"
import { validPublisherEvidence } from "./publisher-evidence-fixture.js"

const SHA = "64d0661cb607067f2b1dd59b25229c58a646f549"

function histogram(values: number[], maxMs = 30_000) {
  const value = new StreamingHistogram(maxMs)
  for (const sample of values) value.record(sample)
  return value.serialize()
}

function registration(shardId: number, overrides: Partial<ShardRegistration> = {}): ShardRegistration {
  return {
    campaign_id: "campaign-1",
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
  // §v2.1.0 role model with shardCount=2: shard 0 = publisher owner (spare
  // probe), shard 1 = restart target (failover drill); no bystanders.
  const restartStructured = owner
    ? validOwnerRestartStructuredEvidence({ campaign_id: "campaign-1", experiment_run_id: "run-1", run_index: 0, shard_id: 0 })
    : validTargetRestartStructuredEvidence({ campaign_id: "campaign-1", experiment_run_id: "run-1", run_index: 0, shard_id: 1 })
  return {
    contract_version: ACTIVE_CONTRACT_VERSION,
    aggregate_scope: "shard",
    scope: "shard",
    global_direct_accept_eligible: false,
    experiment_run_id: "run-1",
    campaign_id: "campaign-1",
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
    // §v2.2.0 wire invariant: fan_out == goal + other + burst populations.
    histograms: {
      fan_out: histogram([10, 20, 15]),
      goal_fan_out: histogram([10]),
      other_fan_out: histogram([20]),
      late_join: histogram(Array(64).fill(5)),
      burst: histogram([15]),
      surge_fan_out: histogram([12, 18]),
    },
    correctness_counters: {
      missing_sequences: 0,
      duplicates: 0,
      out_of_order: 0,
      reconnect_gaps: 0,
      reconnect_duplicates: 0,
      reconnect_order_violations: 0,
      restart_failover_gaps: 0,
      restart_failover_duplicates: 0,
      restart_failover_order_violations: 0,
      restart_failover_connection_failures: 0,
      restart_failover_unexpected_disconnects: 0,
    },
    workload: {
      events_published: owner ? 100 : 0,
      phase_rates: owner ? [{ phase: "steady", attempted_per_sec: 10, accepted_per_sec: 10 }] : [],
    },
    resources: {
      generator: { timing: validTimingEvidence(), publisher: validPublisherEvidence() },
      nchan: { memory_peak_run_bytes: 1000, oom_kill_events: 0 },
      redis: owner ? { memory_used_bytes: 500 } : {},
    },
    scenarios: [
      validSurgeScenarioEvidence({ shard_id: shardId, shard_count: 2 }),
      { name: "late-join", participated: true, passed: true, detail: "ok" },
      { name: "burst", participated: owner, passed: true, detail: "ok" },
      { name: "reconnect", participated: true, passed: true, detail: "ok", structured: { selected: 64, ready_before_hold: 64, missing_raw_id: 0, released: 64, evaluated: 64, passed: 64, failed: 0, missing_results: 0 } },
      { name: "restart-replacement", participated: true, passed: true, detail: "ok", structured: restartStructured },
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
  it("rejects a shard result governed by a stale contract", () => {
    const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", campaignId: "campaign-1", shardCount: 2, globalTarget: 100, seed: 42 })
    coordinator.register(registration(0))
    const stale = { ...shardResult(0), contract_version: "v2.0.4" } as unknown as ShardExperimentResult
    assert.throws(() => coordinator.submitResult(stale), /contract_version mismatch/)
  })

  it("does not let a stale restart passed boolean bypass exact path evidence", async () => {
    const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", campaignId: "campaign-1", shardCount: 2, globalTarget: 100, seed: 42 })
    coordinator.register(registration(0)); coordinator.register(registration(1)); await completeBarriers(coordinator)
    const owner = shardResult(0)
    const restart = owner.scenarios.find((scenario) => scenario.name === "restart-replacement")!
    const structured = validOwnerRestartStructuredEvidence({ campaign_id: "campaign-1", experiment_run_id: "run-1", run_index: 0, shard_id: 0 })
    const spareProbe = (structured.paths as Record<string, any>).spare_probe
    spareProbe.received_last_seq = 18
    spareProbe.received_required_count = 7
    spareProbe.missing_required = 1
    spareProbe.missing_required_sequences = [17]
    spareProbe.out_of_range_after_count = 1
    spareProbe.target_reached = false
    spareProbe.passed = false
    restart.passed = true
    restart.structured = structured

    coordinator.submitResult(owner)
    coordinator.submitResult(shardResult(1))
    const result = coordinator.buildGlobalResult()
    // §v2.1.0: tampered path evidence is an integrity failure — the aggregate
    // can never be ACCEPT and the stale passed boolean cannot rescue it.
    assert.equal(result.scenario_results.find((scenario) => scenario.name === "restart-replacement")?.passed, false)
    assert.equal(result.verdict, "INCONCLUSIVE")
    assert.equal(result.global_direct_accept_eligible, false)
    assert.ok(result.validity.reasons.some((reason) => reason.includes("restart publisher-owner spare-probe evidence is invalid")))
  })

  function reconnectInvalidationCase(name: string, mutate: (rec: { name: string; participated: boolean; passed: boolean; detail: string; structured?: unknown }) => void): void {
    it(name, async () => {
      const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", campaignId: "campaign-1", shardCount: 2, globalTarget: 100, seed: 42 })
      coordinator.register(registration(0)); coordinator.register(registration(1)); await completeBarriers(coordinator)
      const owner = shardResult(0)
      const rec = owner.scenarios.find((scenario) => scenario.name === "reconnect")!
      mutate(rec as never)
      coordinator.submitResult(owner)
      coordinator.submitResult(shardResult(1))
      const result = coordinator.buildGlobalResult()
      assert.equal(result.verdict, "INCONCLUSIVE")
      assert.equal(result.global_direct_accept_eligible, false)
      assert.ok(result.validity.reasons.some((reason) => reason.toLowerCase().includes("reconnect")), `expected a reconnect validity reason, got: ${JSON.stringify(result.validity.reasons)}`)
    })
  }

  reconnectInvalidationCase("treats missing structured reconnect evidence as invalidating", (rec) => { delete rec.structured })
  reconnectInvalidationCase("treats reconnect structured evidence with a missing required field as invalidating", (rec) => { delete (rec.structured as Record<string, unknown>).selected })
  reconnectInvalidationCase("rejects ready_before_hold below 64", (rec) => { (rec.structured as Record<string, unknown>).ready_before_hold = 63 })
  reconnectInvalidationCase("rejects an evaluated denominator shrunken below released", (rec) => { (rec.structured as Record<string, unknown>).evaluated = 63; (rec.structured as Record<string, unknown>).passed = 63 })

  // R03: measured restart-window deltas must agree between the top-level
  // counters and the structured pool evidence on every shard.
  function restartInvalidationCase(name: string, mutate: (owner: ShardExperimentResult, target: ShardExperimentResult) => void, expectedReason: string): void {
    it(name, async () => {
      const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", campaignId: "campaign-1", shardCount: 2, globalTarget: 100, seed: 42 })
      coordinator.register(registration(0)); coordinator.register(registration(1)); await completeBarriers(coordinator)
      const owner = shardResult(0)
      const target = shardResult(1)
      mutate(owner, target)
      coordinator.submitResult(owner)
      coordinator.submitResult(target)
      const result = coordinator.buildGlobalResult()
      assert.equal(result.verdict, "INCONCLUSIVE")
      assert.equal(result.global_direct_accept_eligible, false)
      assert.ok(result.validity.reasons.some((reason) => reason.includes(expectedReason)), `expected "${expectedReason}" validity reason, got: ${JSON.stringify(result.validity.reasons)}`)
    })
  }

  restartInvalidationCase(
    "rejects a restart counter that disagrees with its structured pool delta",
    (_owner, target) => {
      const rec = target.scenarios.find((scenario) => scenario.name === "restart-replacement")!
      ;((rec.structured as Record<string, any>).pool as Record<string, unknown>).gaps = 1
    },
    "restart restart_failover_gaps mismatch",
  )
  restartInvalidationCase(
    "rejects a structured pool delta that disagrees with the top-level restart counter",
    (_owner, target) => {
      const rec = target.scenarios.find((scenario) => scenario.name === "restart-replacement")!
      ;((rec.structured as Record<string, any>).pool as Record<string, unknown>).duplicates = 2
    },
    "restart restart_failover_duplicates mismatch",
  )
  restartInvalidationCase(
    "rejects restart evidence without a structured pool block",
    (_owner, target) => {
      const rec = target.scenarios.find((scenario) => scenario.name === "restart-replacement")!
      delete (rec.structured as Record<string, unknown>).pool
    },
    "restart evidence missing structured pool deltas",
  )
  restartInvalidationCase(
    "rejects a restart-replacement scenario without structured evidence at all",
    (_owner, target) => {
      const rec = target.scenarios.find((scenario) => scenario.name === "restart-replacement")!
      delete rec.structured
    },
    "restart evidence missing structured pool deltas",
  )
  restartInvalidationCase(
    "rejects a missing mandatory restart delta counter",
    (_owner, target) => { delete target.correctness_counters.restart_failover_unexpected_disconnects },
    "restart evidence missing measured delta restart_failover_unexpected_disconnects",
  )

  // R04: exact machine-proven surge gates.
  function surgeInvalidationCase(name: string, mutate: (owner: ShardExperimentResult, target: ShardExperimentResult) => void, expectedReason: string, expectedVerdict = "REJECT"): void {
    it(name, async () => {
      const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", campaignId: "campaign-1", shardCount: 2, globalTarget: 100, seed: 42 })
      coordinator.register(registration(0)); coordinator.register(registration(1)); await completeBarriers(coordinator)
      const owner = shardResult(0)
      const target = shardResult(1)
      mutate(owner, target)
      coordinator.submitResult(owner)
      coordinator.submitResult(target)
      const result = coordinator.buildGlobalResult()
      assert.equal(result.verdict, expectedVerdict)
      if (expectedVerdict === "INCONCLUSIVE") {
        assert.equal(result.global_direct_accept_eligible, false)
      }
      assert.ok(
        result.validity.reasons.some((reason) => reason.includes(expectedReason)),
        `expected "${expectedReason}" reason, got: ${JSON.stringify(result.validity.reasons)}`,
      )
    })
  }

  function surgeStructuredOf(result: ShardExperimentResult): Record<string, unknown> {
    const rec = result.scenarios.find((scenario) => scenario.name === "surge")!
    return (rec.structured as Record<string, unknown>)
  }

  surgeInvalidationCase(
    "rejects 39999 established surge additions (one short)",
    (_o, t) => { const s = surgeStructuredOf(t); s.surge_established_additions = (s.surge_established_additions as number) - 1; s.surge_failed_additions = 1 },
    "surge established additions 39999 != 40000",
  )
  surgeInvalidationCase(
    "rejects 40000 established at 120001ms",
    (_o, t) => { surgeStructuredOf(t).surge_elapsed_ms = 120_001 },
    "surge elapsed 120001ms > 120000ms",
  )
  surgeInvalidationCase(
    "rejects a pre-surge start population off by one",
    (_o, t) => { surgeStructuredOf(t).surge_start_active = (surgeStructuredOf(t).surge_start_active as number) - 1 },
    "surge start active 99 != 100",
  )
  surgeInvalidationCase(
    "rejects final population below the post-surge target",
    (_o, t) => { surgeStructuredOf(t).surge_final_active = (surgeStructuredOf(t).surge_final_active as number) - 1 },
    "surge final active",
  )
  surgeInvalidationCase(
    "rejects a shard below its post-surge ownership floor",
    (_o, t) => { surgeStructuredOf(t).surge_final_active = (surgeStructuredOf(t).surge_final_active as number) - 2; surgeStructuredOf(t).surge_peak_active = (surgeStructuredOf(t).surge_final_active as number) - 3 },
    "shard 1 surge final active",
  )
  surgeInvalidationCase(
    "rejects nonzero surge failed additions",
    (_o, t) => {
      const s = surgeStructuredOf(t)
      s.surge_failed_additions = 5
      s.surge_established_additions = (s.surge_attempted_additions as number) - 5
    },
    "surge failed additions 5 > 0",
  )
  surgeInvalidationCase(
    "treats missing structured surge measurement as invalidating",
    (_o, t) => {
      const rec = t.scenarios.find((scenario) => scenario.name === "surge")!
      delete rec.structured
    },
    "surge evidence has no structured measurement",
    "INCONCLUSIVE",
  )
  surgeInvalidationCase(
    "treats a mandatory surge field going missing as invalidating",
    (_o, t) => { delete surgeStructuredOf(t).surge_peak_active },
    "surge structured fields missing: surge_peak_active",
    "INCONCLUSIVE",
  )

  it("rejects out-of-range and non-integer shard IDs", () => {
    const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", campaignId: "campaign-1", shardCount: 2, globalTarget: 100, seed: 42 })
    assert.throws(() => coordinator.register(registration(-1)), /invalid shard_id/)
    assert.throws(() => coordinator.register(registration(2)), /invalid shard_id/)
    assert.throws(() => coordinator.register(registration(1.5)), /invalid shard_id/)
  })

  it("binds every barrier receipt to the one coordinator-issued experiment run ID", async () => {
    const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", campaignId: "campaign-1", shardCount: 1, globalTarget: 100, seed: 42 })
    assert.throws(() => coordinator.register(registration(0, { experiment_run_id: "different-run", shard_count: 1 })), /mismatch/)
    coordinator.register(registration(0, { shard_count: 1 }))
    const receipt = await coordinator.arrive(0, "preflight", "start")
    assert.equal(receipt.experiment_run_id, "run-1")
  })

  it("marks the aggregate invalid when local targets do not sum to the global target", async () => {
    const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", campaignId: "campaign-1", shardCount: 2, globalTarget: 100, seed: 42 })
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
    const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", campaignId: "campaign-1", shardCount: 2, globalTarget: 100, seed: 42 })
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
    const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", campaignId: "campaign-1", shardCount: 2, globalTarget: 100, seed: 42 })
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
    const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", campaignId: "campaign-1", shardCount: 1, globalTarget: 100, seed: 42 })
    coordinator.register(registration(0, { shard_count: 1 }))
    await coordinator.arrive(0, "preflight", "start")
    await coordinator.arrive(0, "preflight", "end")
    await coordinator.arrive(0, "warmup", "start")
    await coordinator.arrive(0, "warmup", "end")
    // Shard 0 skips steady:start entirely.
    await assert.rejects(coordinator.arrive(0, "surge", "start"), /skipped steady:start/)
  })

  it("rejects duplicate barrier arrivals from the same shard", async () => {
    const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", campaignId: "campaign-1", shardCount: 1, globalTarget: 100, seed: 42 })
    coordinator.register(registration(0, { shard_count: 1 }))
    await coordinator.arrive(0, "preflight", "start")
    await assert.rejects(coordinator.arrive(0, "preflight", "start"), /duplicate barrier arrival/)
  })

  it("keeps the first abort reason when abort is called repeatedly", async () => {
    const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", campaignId: "campaign-1", shardCount: 2, globalTarget: 100, seed: 42 })
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
    const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", campaignId: "campaign-1", shardCount: 2, globalTarget: 100, seed: 42 })
    coordinator.register(registration(0))
    coordinator.register(registration(1))
    await completeBarriers(coordinator)
    assert.throws(() => coordinator.submitResult(shardResult(7)), /unregistered shard/)
    coordinator.submitResult(shardResult(0))
    assert.throws(() => coordinator.submitResult(shardResult(0)), /duplicate result/)
  })

  it("treats a failed per-shard source-port headroom flag as invalidating", async () => {
    const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", campaignId: "campaign-1", shardCount: 2, globalTarget: 100, seed: 42 })
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
    const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", campaignId: "campaign-1", shardCount: 2, globalTarget: 100, seed: 42 })
    coordinator.register(registration(0))
    coordinator.register(registration(1))
    await completeBarriers(coordinator)
    coordinator.submitResult(shardResult(0, { histograms: { fan_out: histogram([]), goal_fan_out: histogram([]), other_fan_out: histogram([]), late_join: histogram([]), burst: histogram([1]) } }))
    coordinator.submitResult(shardResult(1, { histograms: { fan_out: histogram([]), goal_fan_out: histogram([]), other_fan_out: histogram([]), late_join: histogram([]), burst: histogram([1]) } }))
    const result = coordinator.buildGlobalResult()
    assert.equal(result.validity.valid, false)
    assert.ok(result.validity.reasons.some((reason) => reason.includes("global fan-out histogram is empty")))
  })

  it("treats an empty surge latency histogram as invalidating (R06)", async () => {
    const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", campaignId: "campaign-1", shardCount: 2, globalTarget: 100, seed: 42 })
    coordinator.register(registration(0))
    coordinator.register(registration(1))
    await completeBarriers(coordinator)
    const emptySurge = { fan_out: histogram([10]), goal_fan_out: histogram([10]), other_fan_out: histogram([20]), late_join: histogram(Array(64).fill(5)), burst: histogram([15]), surge_fan_out: histogram([]) }
    coordinator.submitResult(shardResult(0, { histograms: emptySurge }))
    coordinator.submitResult(shardResult(1, { histograms: emptySurge }))
    const result = coordinator.buildGlobalResult()
    assert.equal(result.verdict, "INCONCLUSIVE")
    assert.ok(result.validity.reasons.some((reason) => reason.includes("global surge histogram is empty")))
  })

  it("reports REJECT when any correctness counter is nonzero across shards", async () => {
    const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", campaignId: "campaign-1", shardCount: 2, globalTarget: 100, seed: 42 })
    coordinator.register(registration(0))
    coordinator.register(registration(1))
    await completeBarriers(coordinator)
    coordinator.submitResult(shardResult(0))
    coordinator.submitResult(shardResult(1, {
      correctness_counters: { missing_sequences: 0, duplicates: 3, out_of_order: 0, reconnect_gaps: 0, reconnect_duplicates: 0, reconnect_order_violations: 0, restart_failover_gaps: 0, restart_failover_duplicates: 0, restart_failover_order_violations: 0, restart_failover_connection_failures: 0, restart_failover_unexpected_disconnects: 0 },
    }))
    const result = coordinator.buildGlobalResult()
    assert.equal(result.verdict, "REJECT")
    assert.ok(result.validity.reasons.some((reason) => reason.includes("duplicates=3")))
  })

  it("does not let a single 28k-scale shard verdict stand in for the global verdict", async () => {
    // Shard 0 claims ACCEPT at its local scale while the aligned global peak
    // never reaches the global target — the global result must be REJECT.
    const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", campaignId: "campaign-1", shardCount: 2, globalTarget: 100, seed: 42 })
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

// §v2.1.1 §10 regression: restart-range live tail is diagnostic-only.
describe("isExactRestartPathEvidence live-tail semantics", () => {
  function exactPath(overrides: Record<string, unknown> = {}) {
    return {
      transport_resume_id: "resume-1",
      expected_first_seq: 10,
      expected_last_seq: 17,
      received_first_seq: 10,
      received_last_seq: 17,
      expected_count: 8,
      received_required_count: 8,
      missing_required: 0,
      missing_required_sequences: [] as number[],
      duplicates: 0,
      out_of_order: 0,
      out_of_range_before_count: 0,
      out_of_range_after_count: 0,
      missing_prefix: false,
      target_reached: true,
      recovery_ms: 25,
      passed: true,
      ...overrides,
    }
  }

  it("accepts canonical evidence with zero live-tail frames", () => {
    assert.equal(isExactRestartPathEvidence(exactPath()), true)
  })

  it("accepts otherwise-exact evidence with live-tail frames above the frozen range", () => {
    // Observed in probe ea-probe-10000-20260821t134348: recovery races let one
    // live frame (seq 1173 > expected_last 1172) arrive after the frozen range
    // completed. Contract v2.1.1 §10 freezes these as diagnostic-only.
    const withTail = exactPath({
      received_last_seq: 18,
      out_of_range_after_count: 1,
    })
    assert.equal(isExactRestartPathEvidence(withTail), true)
    assert.equal(isExactRestartPathEvidence(exactPath({ out_of_range_after_count: 5, received_last_seq: 22 })), true)
  })

  it("still rejects loss inside the frozen range", () => {
    assert.equal(isExactRestartPathEvidence(exactPath({ missing_required: 1, missing_required_sequences: [12], received_required_count: 7 })), false)
  })

  it("still rejects duplicate and ordering violations inside the range", () => {
    assert.equal(isExactRestartPathEvidence(exactPath({ duplicates: 1, received_required_count: 9 })), false)
    assert.equal(isExactRestartPathEvidence(exactPath({ out_of_order: 2 })), false)
  })

  it("still rejects frames below the consumed position (out_of_range_before)", () => {
    assert.equal(isExactRestartPathEvidence(exactPath({ out_of_range_before_count: 1 })), false)
  })

  it("still rejects prefix loss and unmet targets", () => {
    assert.equal(isExactRestartPathEvidence(exactPath({ missing_prefix: true })), false)
    assert.equal(isExactRestartPathEvidence(exactPath({ target_reached: false })), false)
    assert.equal(isExactRestartPathEvidence(exactPath({ passed: false })), false)
  })

  it("rejects malformed range arithmetic and missing transport id", () => {
    assert.equal(isExactRestartPathEvidence(exactPath({ expected_count: 7 })), false)
    assert.equal(isExactRestartPathEvidence(exactPath({ transport_resume_id: "" })), false)
    assert.equal(isExactRestartPathEvidence(null), false)
    assert.equal(isExactRestartPathEvidence("nope"), false)
  })

  it("rejects a negative or non-integer live-tail counter", () => {
    assert.equal(isExactRestartPathEvidence(exactPath({ out_of_range_after_count: -1 })), false)
    assert.equal(isExactRestartPathEvidence(exactPath({ out_of_range_after_count: 1.5 })), false)
  })

  it("restartEvidenceMatchesRun still binds identity exactly", () => {
    const structured = { campaign_id: "c1", experiment_run_id: "r1", run_index: 0, shard_id: 0, paths: {} }
    assert.equal(restartEvidenceMatchesRun(structured, { campaign_id: "c1", experiment_run_id: "r1", run_index: 0, shard_id: 0 }), true)
    assert.equal(restartEvidenceMatchesRun(structured, { campaign_id: "cX", experiment_run_id: "r1", run_index: 0, shard_id: 0 }), false)
    assert.equal(restartEvidenceMatchesRun(structured, { campaign_id: "c1", experiment_run_id: "r1", run_index: 1, shard_id: 0 }), false)
  })
})

describe.skip("§v2.1.1 drift item 11: slow-consumer probe-transient allowance — retired in v2.3.0", () => {
  // The mandatory Last-Event-ID replay probe detaches exactly its selected
  // clients mid-phase; the aligned slow-consumer active minimum may sit below
  // the full target by exactly that planned cohort — derived from reported
  // evidence, capped at the frozen 5% cohort fraction, zero without evidence.
  function sampleSetWithSlowDip(shardId: number, dip: number): AlignedSample[] {
    return fullSampleSet(shardId).map((sample) =>
      (sample.phase as string) === "slow-consumer" ? { ...sample, active_current: 50 - dip } : sample
    )
  }

  function withSlowProbe(result: ShardExperimentResult, selected: number | null, dip: number): ShardExperimentResult {
    const scenarios = result.scenarios.map((scenario) =>
      (scenario.name as string) === "slow-consumer"
        ? { ...scenario, ...(selected === null ? {} : { structured: { replay_probe_selected: selected } }) }
        : scenario
    )
    return { ...result, samples: sampleSetWithSlowDip(result.shard_id, dip), scenarios }
  }

  async function buildWith(dip0: number, sel0: number | null, dip1: number, sel1: number | null) {
    const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", campaignId: "campaign-1", shardCount: 2, globalTarget: 100, seed: 42 })
    coordinator.register(registration(0))
    coordinator.register(registration(1))
    await completeBarriers(coordinator)
    coordinator.submitResult(withSlowProbe(shardResult(0), sel0, dip0))
    coordinator.submitResult(withSlowProbe(shardResult(1), sel1, dip1))
    return coordinator.buildGlobalResult()
  }

  it("accepts a dip exactly equal to the evidence-derived probed cohort", async () => {
    const result = await buildWith(2, 2, 1, 1)
    assert.equal(result.verdict, "ACCEPT")
  })

  it("rejects a dip beyond the probed cohort", async () => {
    const result = await buildWith(3, 2, 1, 1)
    assert.equal(result.verdict, "REJECT")
    assert.ok(result.validity.reasons.some((reason) => reason.includes("slow-consumer active minimum 96 < 97")))
  })

  it("gives no allowance without structured probe evidence", async () => {
    const result = await buildWith(1, null, 1, null)
    assert.equal(result.verdict, "REJECT")
    assert.ok(result.validity.reasons.some((reason) => reason.includes("slow-consumer active minimum 98 < 100")))
  })

  it("ignores malformed probe-selected evidence", async () => {
    const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", campaignId: "campaign-1", shardCount: 2, globalTarget: 100, seed: 42 })
    coordinator.register(registration(0))
    coordinator.register(registration(1))
    await completeBarriers(coordinator)
    const malformed = withSlowProbe(shardResult(0), null, 1)
    malformed.scenarios = malformed.scenarios.map((scenario) =>
      (scenario.name as string) === "slow-consumer" ? { ...scenario, structured: { replay_probe_selected: "many" } } : scenario
    )
    coordinator.submitResult(malformed)
    coordinator.submitResult(withSlowProbe(shardResult(1), null, 1))
    const result = coordinator.buildGlobalResult()
    assert.equal(result.verdict, "REJECT")
    assert.ok(result.validity.reasons.some((reason) => reason.includes("slow-consumer active minimum 98 < 100")))
  })

  it.skip("caps the allowance at the frozen slow-cohort fraction (5%) — slow-consumer retired in v2.3.0", async () => {
    const rejected = await buildWith(4, 50, 4, 50)
    assert.equal(rejected.verdict, "REJECT")
  })
})

// R10: TimingValid must be backed by exposed structured timing evidence on
// every shard — missing, malformed, or contradictory evidence invalidates
// the aggregate (INCONCLUSIVE), it can never be silently trusted.
describe("R10 structured timing evidence cross-check", () => {
  function timingInvalidationCase(name: string, mutate: (result: ShardExperimentResult) => void, expectedReason: string): void {
    it(name, async () => {
      const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", campaignId: "campaign-1", shardCount: 2, globalTarget: 100, seed: 42 })
      coordinator.register(registration(0)); coordinator.register(registration(1)); await completeBarriers(coordinator)
      const target = shardResult(1)
      mutate(target)
      coordinator.submitResult(shardResult(0))
      coordinator.submitResult(target)
      const result = coordinator.buildGlobalResult()
      assert.equal(result.verdict, "INCONCLUSIVE")
      assert.equal(result.global_direct_accept_eligible, false)
      assert.ok(result.validity.reasons.some((reason) => reason.includes(expectedReason)), `expected "${expectedReason}" validity reason, got: ${JSON.stringify(result.validity.reasons)}`)
    })
  }

  timingInvalidationCase(
    "rejects a shard with no structured timing evidence at all",
    (target) => { delete (target.resources.generator as Record<string, unknown>).timing },
    "missing structured timing evidence",
  )
  timingInvalidationCase(
    "rejects timing evidence missing a coordinated phase",
    (target) => {
      const t = (target.resources.generator as Record<string, unknown>).timing as Record<string, unknown>
      delete t.burst
    },
    "timing evidence invalid: phase burst absent",
  )
  timingInvalidationCase(
    "rejects timing evidence whose duration contradicts its boundaries",
    (target) => {
      const t = (target.resources.generator as Record<string, unknown>).timing as Record<string, unknown>
      ;(t.steady as Record<string, unknown>).duration_ms = 99_999
    },
    "timing evidence invalid: phase steady duration inconsistent",
  )
  timingInvalidationCase(
    "rejects timing evidence with a non-positive phase duration",
    (target) => {
      const t = (target.resources.generator as Record<string, unknown>).timing as Record<string, unknown>
      ;(t.warmup as Record<string, unknown>).duration_ms = 0
    },
    "timing evidence invalid: phase warmup duration inconsistent",
  )
  timingInvalidationCase(
    "rejects timing evidence with an implausible future timestamp",
    (target) => {
      const t = (target.resources.generator as Record<string, unknown>).timing as Record<string, unknown>
      const future = Date.now() + 3_600_000
      t.surge = { start_ms: future, end_ms: future + 10_000, duration_ms: 10_000 }
    },
    "implausible future timestamp",
  )
  timingInvalidationCase(
    "rejects timing evidence missing run boundaries",
    (target) => {
      const t = (target.resources.generator as Record<string, unknown>).timing as Record<string, unknown>
      delete t.run_end_ms
    },
    "missing or unordered run boundaries",
  )
  timingInvalidationCase(
    "rejects timing_valid=false despite complete timing evidence",
    (target) => { target.validity.timing_valid = false },
    "timing_valid false despite complete timing evidence",
  )

  it("accepts a fully evidenced healthy run with complete timing proof", async () => {
    const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", campaignId: "campaign-1", shardCount: 2, globalTarget: 100, seed: 42 })
    coordinator.register(registration(0)); coordinator.register(registration(1)); await completeBarriers(coordinator)
    coordinator.submitResult(shardResult(0))
    coordinator.submitResult(shardResult(1))
    const result = coordinator.buildGlobalResult()
    assert.ok(!result.validity.reasons.some((reason) => reason.includes("timing")), `no timing reasons expected, got: ${JSON.stringify(result.validity.reasons)}`)
    assert.equal(result.verdict, "ACCEPT")
  })
})

// R11: workload proof must come from measured publisher health — structured
// per-boundary snapshots, zero definite/ambiguous failures, bounded pending
// peak, and accepted publication rates inside the frozen windows.
describe("R11 publisher health and event-rate cross-check", () => {
  function timingInvalidationCase(name: string, mutate: (owner: ShardExperimentResult) => void, expectedReason: string): void {
    it(name, async () => {
      const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", campaignId: "campaign-1", shardCount: 2, globalTarget: 100, seed: 42 })
      coordinator.register(registration(0)); coordinator.register(registration(1)); await completeBarriers(coordinator)
      const owner = shardResult(0)
      mutate(owner)
      coordinator.submitResult(owner)
      coordinator.submitResult(shardResult(1))
      const result = coordinator.buildGlobalResult()
      assert.equal(result.verdict, "INCONCLUSIVE")
      assert.equal(result.global_direct_accept_eligible, false)
      assert.ok(result.validity.reasons.some((reason) => reason.includes(expectedReason)), `expected "${expectedReason}" validity reason, got: ${JSON.stringify(result.validity.reasons)}`)
    })
  }

  timingInvalidationCase(
    "rejects a run with no structured publisher evidence on the owner",
    (owner) => { delete (owner.resources.generator as Record<string, unknown>).publisher },
    "missing structured publisher evidence",
  )
  timingInvalidationCase(
    "rejects publisher evidence missing a mandatory boundary snapshot",
    (owner) => {
      const p = (owner.resources.generator as Record<string, unknown>).publisher as Record<string, unknown>
      delete p["steady:end"]
    },
    "publisher snapshot steady:end missing",
  )
  timingInvalidationCase(
    "rejects publisher snapshots missing mandatory counter fields",
    (owner) => {
      const p = (owner.resources.generator as Record<string, unknown>).publisher as Record<string, unknown>
      delete ((p["final-metrics:start"] as Record<string, unknown>)["pending_peak"])
    },
    "publisher snapshot final-metrics:start missing pending_peak",
  )
  timingInvalidationCase(
    "rejects definite publisher failures",
    (owner) => {
      const p = (owner.resources.generator as Record<string, unknown>).publisher as Record<string, unknown>
      ;((p["final-metrics:start"] as Record<string, unknown>)["definite_failures"]) = 3
    },
    "publisher definite failures 3 != 0",
  )
  timingInvalidationCase(
    "rejects ambiguous publisher failures",
    (owner) => {
      const p = (owner.resources.generator as Record<string, unknown>).publisher as Record<string, unknown>
      ;((p["final-metrics:start"] as Record<string, unknown>)["ambiguous_failures"]) = 1
    },
    "publisher ambiguous failures 1 != 0",
  )
  timingInvalidationCase(
    "rejects a pending peak above the frozen ceiling",
    (owner) => {
      const p = (owner.resources.generator as Record<string, unknown>).publisher as Record<string, unknown>
      ;((p["final-metrics:start"] as Record<string, unknown>)["pending_peak"]) = 1001
    },
    "publisher pending peak 1001 > 1000",
  )
  timingInvalidationCase(
    "rejects an unmeasurable steady publication rate",
    (owner) => {
      const p = (owner.resources.generator as Record<string, unknown>).publisher as Record<string, unknown>
      delete (p["publication_rates"] as Record<string, unknown>).steady_accepted_per_sec
    },
    "publisher rate steady_accepted_per_sec not measurable",
  )
  timingInvalidationCase(
    "rejects a burst publication rate outside the frozen window",
    (owner) => {
      const p = (owner.resources.generator as Record<string, unknown>).publisher as Record<string, unknown>
      ;((p["publication_rates"] as Record<string, unknown>)["burst_accepted_per_sec"]) = 70.5
    },
    "publisher burst accepted rate 70.50 events/s outside frozen [40.0, 60.0] window",
  )

  it("accepts a healthy run with complete publisher proof and no publisher reasons", async () => {
    const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", campaignId: "campaign-1", shardCount: 2, globalTarget: 100, seed: 42 })
    coordinator.register(registration(0)); coordinator.register(registration(1)); await completeBarriers(coordinator)
    coordinator.submitResult(shardResult(0))
    coordinator.submitResult(shardResult(1))
    const result = coordinator.buildGlobalResult()
    assert.ok(!result.validity.reasons.some((reason) => reason.includes("publisher")), `no publisher reasons expected, got: ${JSON.stringify(result.validity.reasons)}`)
    assert.equal(result.verdict, "ACCEPT")
  })

  it("flags a missing publisher-owner result", async () => {
    const coordinator = new GlobalExperimentCoordinator({ experimentRunId: "run-1", campaignId: "campaign-1", shardCount: 2, globalTarget: 100, seed: 42 })
    coordinator.register(registration(0)); coordinator.register(registration(1)); await completeBarriers(coordinator)
    const nonOwner = shardResult(1)
    nonOwner.publisher_owner = true // duplicate owner registration on submit is impossible via fixtures; simulate two owners
    const secondOwner = shardResult(0)
    coordinator.submitResult(secondOwner)
    coordinator.submitResult(nonOwner)
    const result = coordinator.buildGlobalResult()
    assert.notEqual(result.verdict, "ACCEPT")
    assert.equal(result.global_direct_accept_eligible, false)
  })
})
