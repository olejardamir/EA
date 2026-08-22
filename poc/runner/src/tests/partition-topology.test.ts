import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { StreamingHistogram } from "../adapters/streaming-histogram.js"
import {
  COORDINATED_PHASES,
  GlobalExperimentCoordinator,
} from "../application/global-coordinator.js"
import type {
  AlignedSample,
  ShardExperimentResult,
  ShardRegistration,
} from "../application/global-coordinator.js"
import { ACTIVE_CONTRACT_VERSION } from "../domain/active-contract.js"
import {
  bystanderRestartStructuredEvidence,
  validOwnerRestartStructuredEvidence,
  validTargetRestartStructuredEvidence,
} from "./restart-evidence-fixture.js"

// §v2.1.0 partition-topology tests: connection ownership, event routing,
// aggregation, history sampling, failure/replacement roles, and per-partition
// resource mandates against a 3-shard coordinator (owner=0, bystander=1,
// restart target=2 = shardCount-1).

const SHA = "64d0661cb607067f2b1dd59b25229c58a646f549"
const SHARDS = 3
const LOCAL_TARGET = 50
const GLOBAL_TARGET = SHARDS * LOCAL_TARGET

function histogram(values: number[]) {
  const value = new StreamingHistogram()
  for (const sample of values) value.record(sample)
  return value.serialize()
}

function registration(shardId: number, overrides: Partial<ShardRegistration> = {}): ShardRegistration {
  return {
    campaign_id: "campaign-1",
    shard_id: shardId,
    shard_count: SHARDS,
    local_target: LOCAL_TARGET,
    global_target: GLOBAL_TARGET,
    seed: 42,
    source_commit: SHA,
    publisher_owner: shardId === 0,
    ...overrides,
  }
}

function samplesFor(shardId: number, phaseActive: Partial<Record<string, number>> = {}): AlignedSample[] {
  const samples: AlignedSample[] = []
  let counters = 0
  for (let index = 0; index < COORDINATED_PHASES.length; index++) {
    const phase = COORDINATED_PHASES[index]
    const active = phaseActive[phase] ?? LOCAL_TARGET
    for (let offset = 0; offset < 2; offset++) {
      counters += 1
      samples.push({
        timestamp_ms: (index * 2 + offset + 1) * 1000 + shardId * 10,
        phase,
        active_current: active,
        connections_attempted: counters,
        connections_established: counters,
        connection_failures: 0,
      })
    }
  }
  return samples
}

function restartStructured(shardId: number): Record<string, unknown> {
  if (shardId === 0) {
    return validOwnerRestartStructuredEvidence({ campaign_id: "campaign-1", experiment_run_id: "run-1", run_index: 0, shard_id: 0 })
  }
  if (shardId === SHARDS - 1) {
    return validTargetRestartStructuredEvidence({ campaign_id: "campaign-1", experiment_run_id: "run-1", run_index: 0, shard_id: SHARDS - 1 })
  }
  return bystanderRestartStructuredEvidence()
}

function shardResult(shardId: number, overrides: Partial<ShardExperimentResult> = {}): ShardExperimentResult {
  const owner = shardId === 0
  const target = shardId === SHARDS - 1
  return {
    contract_version: ACTIVE_CONTRACT_VERSION,
    aggregate_scope: "shard",
    scope: "shard",
    global_direct_accept_eligible: false,
    experiment_run_id: "run-1",
    campaign_id: "campaign-1",
    run_index: 0,
    shard_id: shardId,
    shard_count: SHARDS,
    local_target: LOCAL_TARGET,
    global_target: GLOBAL_TARGET,
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
    samples: samplesFor(shardId),
    // §v2.2.0 wire invariant: fan_out == goal + other + burst populations.
    histograms: {
      fan_out: histogram([10, 20, 15]),
      goal_fan_out: histogram([10]),
      other_fan_out: histogram([20]),
      late_join: histogram(Array(64).fill(100)),
      burst: histogram([15]),
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
      generator: {},
      nchan: { memory_peak_run_bytes: 1000, oom_kill_events: 0 },
      redis: owner ? { memory_used_bytes: 500 } : {},
      ...(target ? { spare: { memory_peak_run_bytes: 800, oom_kill_events: 0 } } : {}),
    },
    scenarios: [
      { name: "late-join", participated: true, passed: true, detail: "own partition history" },
      { name: "burst", participated: owner, passed: true, detail: "ok" },
      { name: "reconnect", participated: true, passed: true, detail: "ok", structured: { selected: 64, ready_before_hold: 64, missing_raw_id: 0, released: 64, evaluated: 64, passed: 64, failed: 0, missing_results: 0 } },
      {
        name: "restart-replacement",
        participated: !((shardId !== 0) && !target),
        passed: true,
        detail: owner ? "spare probe" : target ? "failover drill" : "bystander",
        structured: restartStructured(shardId),
      },
    ],
    ...overrides,
  }
}

async function completeBarriers(coordinator: GlobalExperimentCoordinator): Promise<void> {
  const arrivals: Array<Promise<unknown>> = []
  for (const phase of COORDINATED_PHASES) {
    for (const boundary of ["start", "end"] as const) {
      for (let shardId = 0; shardId < SHARDS; shardId++) {
        arrivals.push(coordinator.arrive(shardId, phase, boundary))
      }
      await Promise.all(arrivals.splice(0))
    }
  }
}

function setupCoordinator(overrides: { restartTargetShard?: number } = {}): GlobalExperimentCoordinator {
  const coordinator = new GlobalExperimentCoordinator({
    experimentRunId: "run-1",
    campaignId: "campaign-1",
    shardCount: SHARDS,
    globalTarget: GLOBAL_TARGET,
    seed: 42,
    ...overrides,
  })
  for (let shardId = 0; shardId < SHARDS; shardId++) coordinator.register(registration(shardId))
  return coordinator
}

async function acceptScenario(coordinator: GlobalExperimentCoordinator): Promise<void> {
  await completeBarriers(coordinator)
  for (let shardId = 0; shardId < SHARDS; shardId++) coordinator.submitResult(shardResult(shardId))
}

describe("partition topology (§v2.1.0)", () => {
  it("defaults the restart target to the last shard and validates overrides", () => {
    assert.equal(setupCoordinator().restartTargetShard, SHARDS - 1)
    assert.equal(setupCoordinator({ restartTargetShard: 1 }).restartTargetShard, 1)
    assert.throws(() => new GlobalExperimentCoordinator({
      campaignId: "campaign-1", shardCount: SHARDS, globalTarget: GLOBAL_TARGET, seed: 42, restartTargetShard: -1,
    }), /restartTargetShard/)
    assert.throws(() => new GlobalExperimentCoordinator({
      campaignId: "campaign-1", shardCount: SHARDS, globalTarget: GLOBAL_TARGET, seed: 42, restartTargetShard: SHARDS,
    }), /restartTargetShard/)
  })

  it("accepts a fully valid owner/target/bystander run with per-partition evidence", async () => {
    const coordinator = setupCoordinator()
    await acceptScenario(coordinator)
    const result = coordinator.buildGlobalResult()
    assert.equal(result.verdict, "ACCEPT")
    assert.equal(result.publisher_owner_shard_id, 0)
    assert.equal(result.resources.nchan_partitions.length, SHARDS)
    assert.deepEqual(result.resources.nchan_partitions.map((partition) => partition.partition_id), [0, 1, 2])
    assert.equal(result.histograms.late_join.count, SHARDS * 64)
    assert.deepEqual(result.resources.nchan_spare, { memory_peak_run_bytes: 800, oom_kill_events: 0 })
  })

  it("invalidates under-sampled late-join history (one sample per partition required)", async () => {
    const coordinator = setupCoordinator()
    await completeBarriers(coordinator)
    coordinator.submitResult(shardResult(0))
    coordinator.submitResult(shardResult(1, { histograms: { fan_out: histogram([10]), goal_fan_out: histogram([]), other_fan_out: histogram([]), late_join: histogram([]), burst: histogram([15]) } }))
    coordinator.submitResult(shardResult(2))
    const result = coordinator.buildGlobalResult()
    assert.equal(result.verdict, "INCONCLUSIVE")
    assert.ok(result.validity.reasons.some((reason) => reason.includes("global late-join sample count 128; expected exactly 192")))
  })

  it("invalidates over-sampled late-join history beyond one sample per partition", async () => {
    const coordinator = setupCoordinator()
    await completeBarriers(coordinator)
    coordinator.submitResult(shardResult(0, { histograms: { fan_out: histogram([10]), goal_fan_out: histogram([]), other_fan_out: histogram([]), late_join: histogram(Array(65).fill(100)), burst: histogram([15]) } }))
    coordinator.submitResult(shardResult(1))
    coordinator.submitResult(shardResult(2))
    const result = coordinator.buildGlobalResult()
    assert.equal(result.verdict, "INCONCLUSIVE")
    assert.ok(result.validity.reasons.some((reason) => reason.includes("global late-join sample count 193; expected exactly 192")))
  })

  it("invalidates when any partition lacks numeric OOM-kill evidence", async () => {
    const coordinator = setupCoordinator()
    await completeBarriers(coordinator)
    coordinator.submitResult(shardResult(0))
    coordinator.submitResult(shardResult(1, { resources: { generator: {}, nchan: { memory_peak_run_bytes: 1000 }, redis: {} } }))
    coordinator.submitResult(shardResult(2))
    const result = coordinator.buildGlobalResult()
    assert.equal(result.verdict, "INCONCLUSIVE")
    assert.ok(result.validity.reasons.some((reason) => reason.includes("partition 1 mandatory OOM-kill evidence is missing or invalid")))
  })

  it("takes spare-node evidence only from the restart-target shard", async () => {
    const coordinator = setupCoordinator()
    await completeBarriers(coordinator)
    coordinator.submitResult(shardResult(0, { resources: { generator: {}, nchan: { memory_peak_run_bytes: 1000, oom_kill_events: 0 }, redis: { memory_used_bytes: 500 }, spare: { oom_kill_events: 0 } } }))
    coordinator.submitResult(shardResult(1))
    coordinator.submitResult(shardResult(2, { resources: { generator: {}, nchan: { memory_peak_run_bytes: 1000, oom_kill_events: 0 }, redis: {} } }))
    const result = coordinator.buildGlobalResult()
    assert.equal(result.resources.nchan_spare, null)
  })

  it("invalidates when shared Redis memory bytes are missing from the owner", async () => {
    const coordinator = setupCoordinator()
    await completeBarriers(coordinator)
    coordinator.submitResult(shardResult(0, { resources: { generator: {}, nchan: { memory_peak_run_bytes: 1000, oom_kill_events: 0 }, redis: {} } }))
    coordinator.submitResult(shardResult(1))
    coordinator.submitResult(shardResult(2))
    const result = coordinator.buildGlobalResult()
    assert.equal(result.verdict, "INCONCLUSIVE")
    assert.ok(result.validity.reasons.some((reason) => reason.includes("mandatory Redis memory_used_bytes evidence is missing or invalid")))
  })

  it("invalidates an owner without exact spare-probe path evidence", async () => {
    const coordinator = setupCoordinator()
    await completeBarriers(coordinator)
    coordinator.submitResult(shardResult(0, {
      scenarios: [
        { name: "late-join", participated: true, passed: true, detail: "ok" },
        { name: "burst", participated: true, passed: true, detail: "ok" },
        { name: "reconnect", participated: true, passed: true, detail: "ok", structured: { selected: 64, ready_before_hold: 64, missing_raw_id: 0, released: 64, evaluated: 64, passed: 64, failed: 0, missing_results: 0 } },
        { name: "restart-replacement", participated: true, passed: true, detail: "claimed", structured: { paths: {} } },
      ],
    }))
    coordinator.submitResult(shardResult(1))
    coordinator.submitResult(shardResult(2))
    const result = coordinator.buildGlobalResult()
    assert.equal(result.verdict, "INCONCLUSIVE")
    assert.ok(result.validity.reasons.some((reason) => reason.includes("restart publisher-owner spare-probe evidence is invalid")))
  })

  it("invalidates a target whose failover pool recorded gaps", async () => {
    const coordinator = setupCoordinator()
    await completeBarriers(coordinator)
    const target = shardResult(2)
    const restart = target.scenarios.find((scenario) => scenario.name === "restart-replacement")!
    const structured = JSON.parse(JSON.stringify(restart.structured)) as Record<string, any>
    structured.pool.gaps = 1
    restart.structured = structured
    coordinator.submitResult(shardResult(0))
    coordinator.submitResult(shardResult(1))
    coordinator.submitResult(target)
    const result = coordinator.buildGlobalResult()
    assert.equal(result.verdict, "INCONCLUSIVE")
    assert.ok(result.validity.reasons.some((reason) => reason.includes("restart target-shard 2 failover-drill evidence is invalid")))
  })

  it("invalidates a bystander that fabricated restart paths", async () => {
    const coordinator = setupCoordinator()
    await completeBarriers(coordinator)
    const bystander = shardResult(1)
    const restart = bystander.scenarios.find((scenario) => scenario.name === "restart-replacement")!
    restart.structured = validOwnerRestartStructuredEvidence({ campaign_id: "campaign-1", experiment_run_id: "run-1", run_index: 0, shard_id: 1 })
    coordinator.submitResult(shardResult(0))
    coordinator.submitResult(bystander)
    coordinator.submitResult(shardResult(2))
    const result = coordinator.buildGlobalResult()
    assert.equal(result.verdict, "INCONCLUSIVE")
    assert.ok(result.validity.reasons.some((reason) => reason.includes("restart bystander participation/evidence is invalid")))
  })

  it("invalidates a bystander that claims drill participation", async () => {
    const coordinator = setupCoordinator()
    await completeBarriers(coordinator)
    const bystander = shardResult(1)
    const restart = bystander.scenarios.find((scenario) => scenario.name === "restart-replacement")!
    restart.participated = true
    coordinator.submitResult(shardResult(0))
    coordinator.submitResult(bystander)
    coordinator.submitResult(shardResult(2))
    const result = coordinator.buildGlobalResult()
    assert.equal(result.verdict, "INCONCLUSIVE")
    assert.ok(result.validity.reasons.some((reason) => reason.includes("restart bystander participation/evidence is invalid")))
  })

  it("rejects restart evidence bound to a different global run", async () => {
    const coordinator = setupCoordinator()
    await completeBarriers(coordinator)
    const target = shardResult(2)
    const restart = target.scenarios.find((scenario) => scenario.name === "restart-replacement")!
    const structured = JSON.parse(JSON.stringify(restart.structured)) as Record<string, any>
    structured.experiment_run_id = "run-0"
    restart.structured = structured
    coordinator.submitResult(shardResult(0))
    coordinator.submitResult(shardResult(1))
    coordinator.submitResult(target)
    const result = coordinator.buildGlobalResult()
    assert.equal(result.verdict, "INCONCLUSIVE")
    assert.ok(result.validity.reasons.some((reason) => reason.includes("restart target-shard 2 failover-drill evidence is invalid")))
  })

  it("enforces the 90% reconnect population floor across partitions", async () => {
    const coordinator = setupCoordinator()
    await completeBarriers(coordinator)
    for (let shardId = 0; shardId < SHARDS; shardId++) {
      coordinator.submitResult(shardResult(shardId, { samples: samplesFor(shardId, { reconnect: 44 }) }))
    }
    const result = coordinator.buildGlobalResult()
    assert.equal(result.verdict, "REJECT")
    assert.ok(result.validity.reasons.some((reason) => reason.includes("reconnect active minimum 132 < 135")))
  })

  it("allows the restart drill transient dip down to the 70% floor but not below", async () => {
    const withinFloor = setupCoordinator()
    await completeBarriers(withinFloor)
    for (let shardId = 0; shardId < SHARDS; shardId++) {
      withinFloor.submitResult(shardResult(shardId, { samples: samplesFor(shardId, { "restart-replacement": 40 }) }))
    }
    const dipped = withinFloor.buildGlobalResult()
    assert.equal(dipped.verdict, "ACCEPT")

    const belowFloor = setupCoordinator()
    await completeBarriers(belowFloor)
    for (let shardId = 0; shardId < SHARDS; shardId++) {
      belowFloor.submitResult(shardResult(shardId, { samples: samplesFor(shardId, { "restart-replacement": 30 }) }))
    }
    const rejected = belowFloor.buildGlobalResult()
    assert.equal(rejected.verdict, "REJECT")
    assert.ok(rejected.validity.reasons.some((reason) => reason.includes("restart-replacement active minimum 90 < 105")))
  })

  it("invalidates an owner that published no accepted workload", async () => {
    const coordinator = setupCoordinator()
    await completeBarriers(coordinator)
    coordinator.submitResult(shardResult(0, { workload: { events_published: 0, phase_rates: [] } }))
    coordinator.submitResult(shardResult(1))
    coordinator.submitResult(shardResult(2))
    const result = coordinator.buildGlobalResult()
    assert.equal(result.verdict, "INCONCLUSIVE")
    assert.ok(result.validity.reasons.some((reason) => reason.includes("authoritative publisher produced no accepted workload")))
  })
})
