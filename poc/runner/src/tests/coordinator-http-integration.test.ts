import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { CoordinatedShardClient } from "../application/coordinator-client.js"
import { COORDINATED_PHASES } from "../application/global-coordinator.js"
import type { CoordinatedPhase, ShardExperimentResult } from "../application/global-coordinator.js"
import { ACTIVE_CONTRACT_VERSION } from "../domain/active-contract.js"
import {
  validOwnerRestartStructuredEvidence,
  validTargetRestartStructuredEvidence,
} from "./restart-evidence-fixture.js"
import { validSurgeScenarioEvidence } from "./surge-evidence-fixture.js"
import { validTimingEvidence } from "./timing-evidence-fixture.js"

const SHA = "64d0661cb607067f2b1dd59b25229c58a646f549"
const SHARDS = 2
const GLOBAL_TARGET = 100
const LOCAL_TARGET = 50

interface SpawnedCoordinator {
  port: number
  resultPath: string
  waitReady: () => Promise<void>
  waitExit: () => Promise<{ code: number | null; stdout: string }>
  dispose: () => void
}

let portCounter = 23100
function nextPort(): number {
  const port = portCounter
  portCounter += 7
  return port
}

function startCoordinator(): SpawnedCoordinator {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coordinator-it-"))
  const resultPath = path.join(dir, "global-result.json")
  const port = nextPort()
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "src/coordinator-server.ts"],
    {
      cwd: path.join(import.meta.dirname, "../.."),
      env: {
        ...process.env,
        COORDINATOR_PORT: String(port),
        SHARD_TOTAL: String(SHARDS),
        GLOBAL_TARGET: String(GLOBAL_TARGET),
        GLOBAL_SEED: "42",
        GIT_COMMIT_SHA: SHA,
        EXPERIMENT_RUN_ID: "it-run-1",
        CAMPAIGN_ID: "campaign-it",
        GLOBAL_RESULT_PATH: resultPath,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  )
  let stdout = ""
  child.stdout.on("data", (chunk) => { stdout += String(chunk) })
  child.stderr.on("data", (chunk) => { stdout += String(chunk) })
  const readyPromise = new Promise<void>((resolve, reject) => {
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("coordinator ready")) resolve()
    })
    child.on("exit", (code) => reject(new Error(`coordinator exited early code=${code}: ${stdout}`)))
  })
  return {
    port,
    resultPath,
    waitReady: () => readyPromise,
    waitExit: () => new Promise((resolve) => {
      child.on("exit", (code) => resolve({ code, stdout }))
    }),
    dispose: () => { child.kill("SIGKILL"); fs.rmSync(dir, { recursive: true, force: true }) },
  }
}

async function waitForPort(spawned: SpawnedCoordinator): Promise<number> {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${spawned.port}/healthz`)
      if (response.ok) return spawned.port
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error("coordinator did not become healthy")
}

function sampleSeries(shardId: number): ShardExperimentResult["samples"] {
  const samples: ShardExperimentResult["samples"] = []
  let counters = 0
  // Cover every coordinated phase so each scenario has aligned active evidence.
  for (const [index, phase] of COORDINATED_PHASES.entries()) {
    counters += 10
    samples.push({
      timestamp_ms: 1_700_000_000_100 + index * 1000 + shardId,
      phase,
      active_current: LOCAL_TARGET,
      connections_attempted: counters,
      connections_established: counters,
      connection_failures: 0,
    })
  }
  return samples
}

function shardResult(shardId: number, runId: string): ShardExperimentResult {
  const owner = shardId === 0
  // §v2.1.0 role model with SHARDS=2: shard 0 = publisher owner (spare probe),
  // shard 1 = restart target (failover drill); no bystanders.
  const restartStructured = owner
    ? validOwnerRestartStructuredEvidence({ campaign_id: "campaign-it", experiment_run_id: runId, run_index: 0, shard_id: 0 })
    : validTargetRestartStructuredEvidence({ campaign_id: "campaign-it", experiment_run_id: runId, run_index: 0, shard_id: 1 })
  return {
    contract_version: ACTIVE_CONTRACT_VERSION,
    aggregate_scope: "shard",
    scope: "shard",
    global_direct_accept_eligible: false,
    experiment_run_id: runId,
    campaign_id: "campaign-it",
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
    samples: sampleSeries(shardId),
    // §v2.2.0 wire invariant: fan_out == goal + other + burst populations.
    histograms: {
      fan_out: { max_ms: 30_000, total_count: 3, overflow_count: 0, buckets: [[20, 1], [40, 1], [25, 1]] },
      goal_fan_out: { max_ms: 30_000, total_count: 1, overflow_count: 0, buckets: [[20, 1]] },
      other_fan_out: { max_ms: 30_000, total_count: 1, overflow_count: 0, buckets: [[40, 1]] },
      late_join: { max_ms: 30_000, total_count: 64, overflow_count: 0, buckets: [[5, 64]] },
      burst: { max_ms: 30_000, total_count: 1, overflow_count: 0, buckets: [[25, 1]] },
      surge_fan_out: { max_ms: 30_000, total_count: 2, overflow_count: 0, buckets: [[12, 1], [18, 1]] },
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
      events_published: owner ? 40 : 0,
      phase_rates: owner ? [{ phase: "steady", attempted_per_sec: 10, accepted_per_sec: 10 }] : [],
    },
    resources: {
      generator: { timing: validTimingEvidence() },
      nchan: { memory_peak_run_bytes: 1234, oom_kill_events: 0 },
      redis: owner ? { memory_used_bytes: 500 } : {},
    },
    scenarios: [
      validSurgeScenarioEvidence({ shard_id: shardId, shard_count: SHARDS, global_target: GLOBAL_TARGET }),
      { name: "late-join", participated: true, passed: true, detail: "ok" },
      { name: "burst", participated: owner, passed: true, detail: "ok" },
      { name: "reconnect", participated: true, passed: true, detail: "ok", structured: { selected: 64, ready_before_hold: 64, missing_raw_id: 0, released: 64, evaluated: 64, passed: 64, failed: 0, missing_results: 0 } },
      {
        name: "restart-replacement",
        participated: true,
        passed: true,
        detail: "ok",
        structured: restartStructured,
      },
    ],
  }
}

describe("§5 PASS 13-15: reduced coordinated multi-shard HTTP integration", () => {
  it("registers shards over HTTP, releases shared barriers, and persists one global result", async () => {
    const spawned = startCoordinator()
    try {
      await spawned.waitReady()
      const port = await waitForPort(spawned)
      const clients = Array.from({ length: SHARDS }, (_, shardId) =>
        new CoordinatedShardClient(`http://127.0.0.1:${port}`, {
          campaign_id: "campaign-it",
          shard_id: shardId,
          shard_count: SHARDS,
          local_target: LOCAL_TARGET,
          global_target: GLOBAL_TARGET,
          seed: 42,
          source_commit: SHA,
          publisher_owner: shardId === 0,
        }))

      const registrations = await Promise.all(clients.map((client) => client.register()))
      for (const registration of registrations) {
        assert.equal(registration.experiment_run_id, "it-run-1")
        assert.equal(registration.seed, 42)
        assert.equal(registration.global_target, GLOBAL_TARGET)
      }

      const runPhases: CoordinatedPhase[] = COORDINATED_PHASES.filter((phase) => phase !== "final-metrics")
      for (const phase of runPhases) {
        const starts = await Promise.all(clients.map((client) => client.barrier(phase, "start")))
        for (const receipt of starts) assert.equal(receipt.participating_shard_ids.length, SHARDS)
        await Promise.all(clients.map((client) => client.barrier(phase, "end")))
      }

      // Results must be collected before the final-metrics barrier closes the experiment.
      const submissions = await Promise.all(
        clients.map((client, index) => client.submitResult(shardResult(index, "it-run-1"))),
      )
      for (const submission of submissions) assert.equal(submission.accepted, true)

      await Promise.all(clients.map((client) => client.barrier("final-metrics", "start")))
      await Promise.all(clients.map((client) => client.barrier("final-metrics", "end")))

      const exit = await spawned.waitExit()
      assert.equal(exit.code, 0, `coordinator exit code: ${exit.code}\n${exit.stdout}`)

      const persisted = JSON.parse(fs.readFileSync(spawned.resultPath, "utf8"))
      assert.equal(persisted.aggregate_scope, "simultaneous_global_run")
      assert.equal(persisted.experiment_run_id, "it-run-1")
      assert.deepEqual(persisted.participating_shard_ids, [0, 1])
      assert.equal(persisted.global_active_peak ?? persisted.active_population.global_active_peak, GLOBAL_TARGET)
      assert.equal(persisted.publisher_owner_shard_id, 0)
      assert.equal(persisted.verdict, "ACCEPT")
      assert.equal(persisted.global_direct_accept_eligible, true)
      assert.ok(persisted.histograms.fan_out.count >= 4)
    } finally {
      spawned.dispose()
    }
  })

  it("aborts the whole experiment when one shard reports failure", async () => {
    const spawned = startCoordinator()
    try {
      await spawned.waitReady()
      const port = await waitForPort(spawned)
      const failing = new CoordinatedShardClient(`http://127.0.0.1:${port}`, {
        campaign_id: "campaign-it",
        shard_id: 0,
        shard_count: SHARDS,
        local_target: LOCAL_TARGET,
        global_target: GLOBAL_TARGET,
        seed: 42,
        source_commit: SHA,
        publisher_owner: true,
      })
      const healthy = new CoordinatedShardClient(`http://127.0.0.1:${port}`, {
        campaign_id: "campaign-it",
        shard_id: 1,
        shard_count: SHARDS,
        local_target: LOCAL_TARGET,
        global_target: GLOBAL_TARGET,
        seed: 42,
        source_commit: SHA,
        publisher_owner: false,
      })
      await Promise.all([failing.register(), healthy.register()])
      await Promise.all([failing.barrier("preflight", "start"), healthy.barrier("preflight", "start")])
      await Promise.all([failing.barrier("preflight", "end"), healthy.barrier("preflight", "end")])

      // The healthy shard waits at the next barrier; the failing shard's abort
      // must reject that wait. The wait is created first so the ordering is
      // deterministic regardless of HTTP round-trip timing.
      const healthyWait = healthy.barrier("warmup", "start")
      await failing.abort("generator saturated")
      await assert.rejects(healthyWait, /aborted/)
    } finally {
      spawned.dispose()
    }
  })
})
