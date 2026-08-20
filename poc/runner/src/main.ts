import { loadConfig } from "./config/experiment-config.js"
import { NchanHttpPublisher } from "./adapters/nchan-http-publisher.js"
import { SSEHttpClient } from "./adapters/sse-http-client.js"
import { BoundedMetricsRecorder } from "./adapters/metrics-recorder.js"
import { SystemClock } from "./adapters/system-clock.js"
import { CgroupResourceMonitor, normalizeCpuPercent, baselineCpuPercent, detectContainerMode, effectiveCpuCapacity } from "./adapters/cgroup-resource-monitor.js"
import { MatchEventPublisher } from "./adapters/match-event-publisher.js"
import { ConnectionPool } from "./application/connection-pool.js"
import { createMatchHeadTracker } from "./domain/match-state.js"
import { createPRNG } from "./domain/prng.js"
import { MATCH_IDS } from "./domain/event.js"
import { WarmupScenario } from "./scenarios/warmup.js"
import { SteadyScenario } from "./scenarios/steady.js"
import { LateJoinScenario } from "./scenarios/late-join.js"
import { BurstScenario } from "./scenarios/burst.js"
import { ReconnectScenario } from "./scenarios/reconnect.js"
import { SlowConsumerScenario } from "./scenarios/slow-consumer.js"
import { ConnectionSurgeScenario } from "./scenarios/connection-surge.js"
import { NchanRestartScenario } from "./scenarios/nchan-restart.js"
import { aggregateWorkerMetrics, classifyResult } from "./application/result-classifier.js"
import { printSummary, emitMachineReadableResult } from "./application/result-printer.js"
import { runEvidenceSuite } from "./application/evidence-suite.js"
import { runTopologyPreflight } from "./adapters/topology-preflight.js"
import crypto from "node:crypto"
import { execSync } from "node:child_process"
import type { ScenarioContext } from "./scenarios/scenario.js"
import { CoordinatedShardClient } from "./application/coordinator-client.js"
import type { CoordinatedPhase, ShardExperimentResult } from "./application/global-coordinator.js"
import { resetRedisForExperiment } from "./adapters/redis-run-isolation.js"

function getGitCommitSha(): string | null {
  // §3.15: Check environment variable first (set via build ARG or Compose)
  const envSha = process.env.GIT_COMMIT_SHA
  // §3.11.A: Reject non-hex values (e.g. "unknown") — only accept valid SHA-256/SHA-1 prefixes
  if (envSha && /^[0-9a-f]{40}$/i.test(envSha)) return envSha
  try {
    const resolved = execSync("git rev-parse HEAD", { encoding: "utf-8", timeout: 2000 }).trim()
    return /^[0-9a-f]{40}$/i.test(resolved) ? resolved : null
  } catch {
    return null
  }
}

function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 23)
  console.log(`[${ts}] ${msg}`)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForNchan(pubUrl: string): Promise<void> {
  log("Waiting for Nchan to be ready...")
  const deadline = Date.now() + 60000
  while (Date.now() < deadline) {
    try {
      const resp = await fetch(`${pubUrl}/pub/healthcheck`, { signal: AbortSignal.timeout(3000) })
      if (resp.ok) {
        log("Nchan is ready")
        return
      }
    } catch {}
    await sleep(1000)
  }
  throw new Error("Nchan not ready after 60s")
}

async function main(): Promise<void> {
  const config = loadConfig()

  // §6.37: Evidence mode — delegate to repeated-run evidence suite
  if (config.runMode === "evidence") {
    log("§6.37 Evidence mode — running evidence suite")

    // §4.24: Runtime nginx capacity preflight before evidence run
    if (config.nchanControlUrl) {
      const resourceMonitor = new CgroupResourceMonitor(undefined, config.nchanControlUrl)
      const preflight = await resourceMonitor.preflight(config.nchanControlUrl)
      if (preflight) {
        log(`§4.24 preflight: worker_processes=${preflight.worker_processes} worker_connections=${preflight.worker_connections} total=${preflight.worker_connections_total} fd_soft=${preflight.nginx_worker_fd_soft ?? preflight.nginx_master_fd_soft} cpu_quota=${preflight.cpu_quota} sufficient=${preflight.sufficient}`)
        if (!preflight.sufficient) {
          log(`§4.24 preflight FAILED: ${preflight.reason}`)
          process.exitCode = 1
          return
        }
      } else {
        log("§4.24 preflight: could not reach control server — skipping")
      }
      resourceMonitor.dispose()
    }

    const suiteResult = await runEvidenceSuite(config)
    log(`§6.37 Evidence suite complete: ${suiteResult.finalVerdict} (${suiteResult.totalRuns} runs)`)

    // §6.24: Emit machine-readable JSON for evidence suite
    const suiteDigest = crypto.createHash("sha256").update(JSON.stringify({
      totalRuns: suiteResult.totalRuns,
      finalVerdict: suiteResult.finalVerdict,
    })).digest("hex")

    const machineReadable = {
      contract_version: "v2.0.3",
      run_profile: config.runProfile,
      run_mode: "evidence",
      total_runs: suiteResult.totalRuns,
      final_verdict: suiteResult.finalVerdict,
      dispersion_stable: suiteResult.dispersionStable,
      worst_cv_pct: suiteResult.crossRun.worstCV * 100,
      per_run_verdicts: suiteResult.perRunVerdicts,
      aggregate: suiteResult.aggregate,
      suite_digest: suiteDigest,
    }
    console.log(JSON.stringify(machineReadable))

    process.exitCode = suiteResult.finalVerdict === "ACCEPT" ? 0 : 1
    return
  }

  const nchanPublisher = new NchanHttpPublisher(config.nchanPubUrl)
  const sseClient = new SSEHttpClient()
  const metrics = new BoundedMetricsRecorder()
  const clock = new SystemClock()
  const resourceMonitor = new CgroupResourceMonitor(config.redisUrl, config.nchanControlUrl)
  const headTracker = createMatchHeadTracker()

  const random = createPRNG(config.seed)

  const pool = new ConnectionPool(
    { subUrl: config.nchanSubUrl, matchIds: [...MATCH_IDS] },
    metrics,
    clock,
  )

  const publisher = new MatchEventPublisher({
    publisher: nchanPublisher,
    headTracker,
    burstMode: false,
    random,
    getSubscriberCount: (channel) => pool.getSubscriberCount(channel),
    onPublish: (channel, expected) => {
      metrics.incrementExpectedFanDeliveries(expected)
      // §3.13: Live expected from publisher at accepted-publish time using eligible subscriber count
      metrics.incrementLiveExpectedDeliveries(expected)
    },
  })

  const coordinatedMode = config.runMode === "coordinated-shard"
  const shardId = parseInt(process.env.SHARD_ID ?? "0", 10)
  const shardCount = parseInt(process.env.SHARD_TOTAL ?? process.env.SHARD_COUNT ?? "1", 10)
  const globalTarget = parseInt(process.env.GLOBAL_TARGET ?? String(config.targetConnections * shardCount), 10)
  const publisherOwner = !coordinatedMode || process.env.PUBLISHER_OWNER === "true"
  const sourceCommit = getGitCommitSha()
  const coordinator = coordinatedMode
    ? new CoordinatedShardClient(process.env.COORDINATOR_URL ?? "http://coordinator:3000", {
        shard_id: shardId,
        shard_count: shardCount,
        local_target: config.targetConnections,
        global_target: globalTarget,
        seed: parseInt(process.env.GLOBAL_SEED ?? String(config.seed), 10),
        source_commit: sourceCommit ?? "",
        publisher_owner: publisherOwner,
      })
    : null

  const phaseBarrier = async (phase: CoordinatedPhase, boundary: "start" | "end"): Promise<void> => {
    if (!coordinator) return
    const receipt = await coordinator.barrier(phase, boundary)
    log(`coordinator released ${phase}:${boundary} at ${receipt.released_at_ms} shards=${receipt.participating_shard_ids.join(",")}`)
  }

  // §BS: Maximum run deadline to prevent indefinite hangs
  const MAX_RUN_MS = 10 * 60 * 1000 // 10 minutes
  const runTimer = setTimeout(() => {
    log(`§BS: Maximum run deadline (${MAX_RUN_MS / 1000}s) reached — forcing shutdown`)
    process.exit(2)
  }, MAX_RUN_MS)

  let loopMonitor: NodeJS.Timeout | null = null
  let verdictVerdict = "NOT_APPLICABLE" as string
  let nginxRuntimePreflight: Awaited<ReturnType<CgroupResourceMonitor["preflight"]>> = null

  try {
    if (coordinator) {
      const registration = await coordinator.register()
      if (registration.seed !== config.seed || registration.global_target !== globalTarget) {
        throw new Error("coordinator returned inconsistent global seed/target")
      }
      coordinator.startSampling(() => {
        const snapshot = metrics.snapshot()
        return {
          active_current: pool.size,
          connections_attempted: snapshot.connections_attempted,
          connections_established: snapshot.connections_established,
          connection_failures: snapshot.connection_failures,
        }
      })
      log(`coordinated shard registered run=${registration.experiment_run_id} shard=${shardId}/${shardCount} publisher_owner=${publisherOwner}`)
    }
    await phaseBarrier("preflight", "start")
    await waitForNchan(config.nchanPubUrl)

    // §4.15: Clock compatibility — same-host containers share the Linux kernel clock.
    // RTT/2 is NOT a clock offset measurement. All containers with network_mode:host
    // or on the same Docker host share the same monotonic and wall clocks.
    // We verify connectivity to each Nchan node and document the clock model.
    const clockEvidence = {
      runner_wall_clock: process.hrtime(),
      runner_date_now: Date.now(),
      nchan1_reachable: false,
      nchan2_reachable: false,
      clock_model: "same-host-kernel-clock",
      cross_node_max_offset_ms: 0,
      threshold_ms: 0,
      passed: true,
    }

    try {
      const resp1 = await fetch(`${config.nchanPubUrl}/pub/healthcheck`, { signal: AbortSignal.timeout(3000) })
      clockEvidence.nchan1_reachable = resp1.ok
    } catch {}
    if (config.nchan2SubUrl) {
      const nchan2PubUrl = config.nchan2SubUrl.replace("/sub/", "/pub/").replace(":8081", ":18080")
      try {
        const resp2 = await fetch(`${nchan2PubUrl}/pub/healthcheck`, { signal: AbortSignal.timeout(3000) })
        clockEvidence.nchan2_reachable = resp2.ok
      } catch {}
    }

    // Same-host containers: clock offset is 0 (shared kernel clock)
    // Only fails if a Nchan node is unreachable (can't verify clock sharing)
    clockEvidence.passed = clockEvidence.nchan1_reachable &&
      (config.nchan2SubUrl ? clockEvidence.nchan2_reachable : true)

    log(`§4.15 clock-compat: model=${clockEvidence.clock_model} nchan1=${clockEvidence.nchan1_reachable} nchan2=${clockEvidence.nchan2_reachable} offset=${clockEvidence.cross_node_max_offset_ms}ms threshold=${clockEvidence.threshold_ms}ms passed=${clockEvidence.passed}`)
    if (!clockEvidence.passed) {
      log("§4.15 clock-compat: INCONCLUSIVE — unreachable Nchan node prevents clock verification")
    }

    const ctx: ScenarioContext = {
      publisher,
      eventStream: sseClient,
      metrics,
      clock,
      resourceMonitor,
      headTracker,
      config,
      matchIds: publisher.matchIds,
      phaseSnapshots: [],
      log,
      sleep,
      publisherEnabled: publisherOwner,
    }

    log("=== POC Runner Starting ===")
    log(`Config: ${config.targetConnections} target connections, seed=${config.seed}`)
    log(`Profile: ${config.runProfile}`)
    log(`Phases: warmup=${config.warmupSeconds}s, steady=${config.measureSeconds}s, burst=${config.burstSeconds}s`)

    // §4.2/§4.24: Run topology and capacity preflight
    // §3.3: Fetch Nginx container's actual FD limits from control server /preflight API.
    // In the 100k topology, Nginx is in a separate container; its RLIMIT_NOFILE
    // differs from the runner's. The control server reads the Nginx container's limits.
    let nginxFdLimits: { soft: number | null; hard: number | null } | undefined
    if (config.nchanControlUrl) {
      const rm = new CgroupResourceMonitor(undefined, config.nchanControlUrl)
      const nginxPreflight = await rm.preflight(config.nchanControlUrl, globalTarget)
      nginxRuntimePreflight = nginxPreflight
      if (nginxPreflight) {
        const soft = nginxPreflight.nginx_worker_fd_soft ?? nginxPreflight.nginx_master_fd_soft
        const hard = nginxPreflight.nginx_worker_fd_hard ?? nginxPreflight.nginx_master_fd_hard
        if (soft !== null) nginxFdLimits = { soft, hard }
      }
      rm.dispose()
    }
    const topologyPreflight = runTopologyPreflight(config.targetConnections, undefined, undefined, undefined, nginxFdLimits)
    log(`§4.2 topology preflight: FD_soft=${topologyPreflight.fd_soft_limit}, ephemeral_ports=${topologyPreflight.ephemeral_port_count}, nginx_capacity=${topologyPreflight.nginx_max_sse_capacity}, sufficient=${topologyPreflight.capacity_sufficient}`)
    if (topologyPreflight.warnings.length > 0) {
      for (const w of topologyPreflight.warnings) log(`  WARNING: ${w}`)
    }
    if (!topologyPreflight.capacity_sufficient) {
      log("§4.2 topology preflight FAILED: capacity insufficient — evidence invalidated")
      const machine = {
        verdict: "INCONCLUSIVE" as const,
        validity: { valid: false, reasons: [`Topology preflight failed: ${topologyPreflight.warnings.join("; ")}`] },
      }
      console.log(JSON.stringify(machine, null, 2))
      process.exit(2)
    }

    // The publisher owner establishes a known run namespace before any shard
    // opens viewers. This makes active-match retained history start at seq=1.
    if (coordinator && publisherOwner) {
      await resetRedisForExperiment(config.redisUrl)
      log("Redis history reset and verified for coordinated run isolation")
    }

    // §4.22: Build identity — immutable provenance
    const buildIdentity = {
      git_commit_sha: sourceCommit,
      nginx_version: "1.27.4",
      nchan_version: "1.3.8",
      node_version: process.version,
      redis_version: "7.2",
    }

    loopMonitor = setInterval(() => {
      resourceMonitor.measureCpu()
      // §BL: Sample publisher backlog (in-flight publish promises) every 100ms
      metrics.setBacklog(publisher.pendingPublishes)
      // §3.5: Drain publisher scheduler lag samples into metrics recorder
      const lagSamples = publisher.drainSchedulerLagSamples()
      for (const ms of lagSamples) {
        metrics.recordSchedulerLag(ms)
      }
    }, 100)

    // §AB: Start continuous event-loop delay monitor before measured phases
    resourceMonitor.startEventLoopMonitor()

    // §3.9: Capture cgroup baseline at run start — cgroup counters are cumulative over
    // container lifetime; per-run deltas = end_snapshot - start_snapshot.
    // §3.8.C: Wait for initial Nchan/Redis polls so baseline includes service metrics
    await resourceMonitor.ready()
    const cgroupBaseline = resourceMonitor.snapshot()
    await phaseBarrier("preflight", "end")

    // Phase 1: Warmup (60% base) — publisher starts during warm-up (§BT)
    await phaseBarrier("warmup", "start")
    metrics.beginPhase("warmup")
    const warmup = new WarmupScenario(pool)
    const warmupResult = await warmup.execute(ctx)
    metrics.endPhase()
    log(`  ${warmupResult.passed ? "PASS" : "FAIL"} ${warmupResult.name}: ${warmupResult.detail}`)
    // §4.6: Record phase snapshot for publish rate measurement
    const warmupSnap = publisher.snapshotAndReset()
    ctx.phaseSnapshots.push({ phase: "warmup", eventsPublished: warmupSnap.eventsPublished, byMatch: warmupSnap.byMatch, durationMs: config.warmupSeconds * 1000, matchPublished: warmupSnap.matchPublished, lobbyPublished: warmupSnap.lobbyPublished, matchAttempts: warmupSnap.matchAttempts, lobbyAttempts: warmupSnap.lobbyAttempts })
    await phaseBarrier("warmup", "end")

    // Phase 2: Steady — publisher already running from warm-up
    await phaseBarrier("steady", "start")
    metrics.beginPhase("steady")
    const steady = new SteadyScenario(pool)
    const steadyResult = await steady.execute(ctx)
    metrics.endPhase()
    log(`  ${steadyResult.passed ? "PASS" : "FAIL"} ${steadyResult.name}: ${steadyResult.detail}`)
    // §4.6: Record phase snapshot
    const steadySnap = publisher.snapshotAndReset()
    ctx.phaseSnapshots.push({ phase: "steady", eventsPublished: steadySnap.eventsPublished, byMatch: steadySnap.byMatch, durationMs: config.measureSeconds * 1000, matchPublished: steadySnap.matchPublished, lobbyPublished: steadySnap.lobbyPublished, matchAttempts: steadySnap.matchAttempts, lobbyAttempts: steadySnap.lobbyAttempts })
    await phaseBarrier("steady", "end")

    // Phase 3: Connection surge 60% -> 100% (§4.4: surge before peak scenarios)
    await phaseBarrier("surge", "start")
    metrics.beginPhase("surge")
    const connectionSurge = new ConnectionSurgeScenario(pool)
    const surgeResult = await connectionSurge.execute(ctx)
    metrics.endPhase()
    log(`  ${surgeResult.passed ? "PASS" : "FAIL"} ${surgeResult.name}: ${surgeResult.detail}`)
    // §4.6: Record phase snapshot
    const surgeSnap = publisher.snapshotAndReset()
    ctx.phaseSnapshots.push({ phase: "surge", eventsPublished: surgeSnap.eventsPublished, byMatch: surgeSnap.byMatch, durationMs: ctx._surgeHealth?.surge_elapsed_ms ?? 0, matchPublished: surgeSnap.matchPublished, lobbyPublished: surgeSnap.lobbyPublished, matchAttempts: surgeSnap.matchAttempts, lobbyAttempts: surgeSnap.lobbyAttempts })
    await phaseBarrier("surge", "end")

    // Aggregate target barrier: no peak-load scenario starts until all shards
    // have completed the surge and reported their time-aligned population.
    await phaseBarrier("target-barrier", "start")
    await sleep(1000)
    await phaseBarrier("target-barrier", "end")

    // Phase 4: Post-surge stabilization
    await phaseBarrier("stabilization", "start")
    metrics.beginPhase("post-surge")
    log(`--- PHASE: POST-SURGE STABILIZATION (${config.cooldownSeconds}s) ---`)
    await sleep(config.cooldownSeconds * 1000)
    metrics.endPhase()
    log("Post-surge stabilization complete")
    await phaseBarrier("stabilization", "end")

    // Phase 5: Late-join under peak load
    await phaseBarrier("late-join", "start")
    metrics.beginPhase("late-join")
    const lateJoinStart = ctx.clock.now()
    ctx._activePopulationStart = pool.size
    const lateJoin = new LateJoinScenario(pool)
    const lateJoinResult = publisherOwner
      ? await lateJoin.execute(ctx)
      : { name: "late-join", passed: true, detail: "not-participating: authoritative publisher-owner shard only" }
    const lateJoinDuration = ctx.clock.now() - lateJoinStart
    metrics.endPhase()
    log(`  ${lateJoinResult.passed ? "PASS" : "FAIL"} ${lateJoinResult.name}: ${lateJoinResult.detail}`)
    // §4.6: Record phase snapshot with actual duration
    const lateJoinSnap = publisher.snapshotAndReset()
    ctx.phaseSnapshots.push({ phase: "late-join", eventsPublished: lateJoinSnap.eventsPublished, byMatch: lateJoinSnap.byMatch, durationMs: lateJoinDuration, matchPublished: lateJoinSnap.matchPublished, lobbyPublished: lateJoinSnap.lobbyPublished, matchAttempts: lateJoinSnap.matchAttempts, lobbyAttempts: lateJoinSnap.lobbyAttempts })
    await phaseBarrier("late-join", "end")

    // Phase 6: Burst at peak
    await phaseBarrier("burst", "start")
    metrics.beginPhase("burst")
    ctx._activePopulationStart = pool.size
    const burst = new BurstScenario()
    const burstResult = publisherOwner
      ? await burst.execute(ctx)
      : (await sleep(config.burstSeconds * 1000), { name: "burst", passed: true, detail: "not-participating: observing authoritative burst" })
    metrics.endPhase()
    log(`  ${burstResult.passed ? "PASS" : "FAIL"} ${burstResult.name}: ${burstResult.detail}`)
    // §4.6: Record phase snapshot
    const burstSnap = publisher.snapshotAndReset()
    ctx.phaseSnapshots.push({ phase: "burst", eventsPublished: burstSnap.eventsPublished, byMatch: burstSnap.byMatch, durationMs: config.burstSeconds * 1000, matchPublished: burstSnap.matchPublished, lobbyPublished: burstSnap.lobbyPublished, matchAttempts: burstSnap.matchAttempts, lobbyAttempts: burstSnap.lobbyAttempts })
    await phaseBarrier("burst", "end")

    // Phase 7: Post-burst steady
    await phaseBarrier("post-burst", "start")
    metrics.beginPhase("post-burst")
    log(`--- PHASE: POST-BURST STEADY (${config.cooldownSeconds}s) ---`)
    if (publisherOwner) {
      await publisher.drain()
      publisher.burstMode = false
      publisher.start(true)
    }
    await sleep(config.cooldownSeconds * 1000)
    metrics.endPhase()
    log("Post-burst steady complete")
    // §4.6: Record phase snapshot
    const postBurstSnap = publisher.snapshotAndReset()
    ctx.phaseSnapshots.push({ phase: "post-burst", eventsPublished: postBurstSnap.eventsPublished, byMatch: postBurstSnap.byMatch, durationMs: config.cooldownSeconds * 1000, matchPublished: postBurstSnap.matchPublished, lobbyPublished: postBurstSnap.lobbyPublished, matchAttempts: postBurstSnap.matchAttempts, lobbyAttempts: postBurstSnap.lobbyAttempts })
    await phaseBarrier("post-burst", "end")

    // Phase 8: Reconnect while publishing
    await phaseBarrier("reconnect", "start")
    metrics.beginPhase("reconnect")
    const reconnectStart = ctx.clock.now()
    const reconnect = new ReconnectScenario(pool)
    const reconnectResult = await reconnect.execute(ctx)
    const reconnectDuration = ctx.clock.now() - reconnectStart
    metrics.endPhase()
    log(`  ${reconnectResult.passed ? "PASS" : "FAIL"} ${reconnectResult.name}: ${reconnectResult.detail}`)
    // §4.6: Record phase snapshot with actual duration
    const reconnectSnap = publisher.snapshotAndReset()
    ctx.phaseSnapshots.push({ phase: "reconnect", eventsPublished: reconnectSnap.eventsPublished, byMatch: reconnectSnap.byMatch, durationMs: reconnectDuration, matchPublished: reconnectSnap.matchPublished, lobbyPublished: reconnectSnap.lobbyPublished, matchAttempts: reconnectSnap.matchAttempts, lobbyAttempts: reconnectSnap.lobbyAttempts })
    await phaseBarrier("reconnect", "end")

    // Phase 9: Slow consumer / backpressure at frozen concurrency
    await phaseBarrier("slow-consumer", "start")
    metrics.beginPhase("slow-consumer")
    const slowConsumerStart = ctx.clock.now()
    ctx._activePopulationStart = pool.size
    const slowConsumer = new SlowConsumerScenario(pool)
    const slowResult = await slowConsumer.execute(ctx)
    const slowConsumerDuration = ctx.clock.now() - slowConsumerStart
    metrics.endPhase()
    log(`  ${slowResult.passed ? "PASS" : "FAIL"} ${slowResult.name}: ${slowResult.detail}`)
    // §4.6: Record phase snapshot with actual duration
    const slowSnap = publisher.snapshotAndReset()
    ctx.phaseSnapshots.push({ phase: "slow-consumer", eventsPublished: slowSnap.eventsPublished, byMatch: slowSnap.byMatch, durationMs: slowConsumerDuration, matchPublished: slowSnap.matchPublished, lobbyPublished: slowSnap.lobbyPublished, matchAttempts: slowSnap.matchAttempts, lobbyAttempts: slowSnap.lobbyAttempts })
    await phaseBarrier("slow-consumer", "end")

    // Phase 10: Nchan restart (cross-node Redis history or literal process restart)
    await phaseBarrier("restart-replacement", "start")
    metrics.beginPhase("nchan-restart")
    const restartStart = ctx.clock.now()
    ctx._activePopulationStart = pool.size
    const nchanRestart = new NchanRestartScenario(config.nchanSubUrl, config.nchanPubUrl, config.nchan2SubUrl, config.nchanControlUrl)
    const nchanResult = publisherOwner
      ? await nchanRestart.execute(ctx)
      : { name: "nchan-restart", passed: true, detail: "not-participating: authoritative publisher-owner shard only" }
    const restartDuration = ctx.clock.now() - restartStart
    metrics.endPhase()
    log(`  ${nchanResult.passed ? "PASS" : "FAIL"} ${nchanResult.name}: ${nchanResult.detail}`)
    // §4.6: Record phase snapshot with actual duration
    const restartSnap = publisher.snapshotAndReset()
    ctx.phaseSnapshots.push({ phase: "nchan-restart", eventsPublished: restartSnap.eventsPublished, byMatch: restartSnap.byMatch, durationMs: restartDuration, matchPublished: restartSnap.matchPublished, lobbyPublished: restartSnap.lobbyPublished, matchAttempts: restartSnap.matchAttempts, lobbyAttempts: restartSnap.lobbyAttempts })
    await phaseBarrier("restart-replacement", "end")

    // Collect metrics
    await phaseBarrier("final-metrics", "start")
    log("\n--- COLLECTING METRICS ---")
    resourceMonitor.stopEventLoopMonitor()
    resourceMonitor.measureCpu()
    const resourceSnap = resourceMonitor.snapshot()

    const phaseHists = metrics.snapshotPhaseHistograms()
    const aggregated = aggregateWorkerMetrics([metrics], ctx.phaseSnapshots, phaseHists)
    aggregated.build_identity = buildIdentity
    // §3.12: Wire clock validity into single-run aggregated metrics
    aggregated.clock_validity = {
      clock_model: clockEvidence.clock_model,
      nodes_covered: ["runner", "nchan-1", ...(config.nchan2SubUrl ? ["nchan-2"] : [])],
      measurement_method: "same-host-kernel-clock-verification",
      offset_or_guarantee: clockEvidence.cross_node_max_offset_ms,
      uncertainty_ms: 0,
      threshold_ms: clockEvidence.threshold_ms,
      validity_result: clockEvidence.passed ? "PASS" : "INCONCLUSIVE",
      nchan1_reachable: clockEvidence.nchan1_reachable,
      nchan2_reachable: clockEvidence.nchan2_reachable,
    }
    // §3.15: Campaign provenance — marks this as a single-run result
    aggregated.aggregate_type = "single_run"
    aggregated.run_count = 1
    // §3.2: Shard identity — detected from environment variables
    aggregated.shard_identity = {
      shard_id: shardId,
      shard_count: shardCount,
      source_ip_index: shardId,
    }
    aggregated.event_loop_delay_p99_ms = resourceSnap.eventLoopDelayP99Ms
    aggregated.memory_mb_peak = resourceSnap.memoryMbPeak
    aggregated.generator_cpu_percent_peak = resourceSnap.cpuPercentPeak
    aggregated.generator_event_loop_p99_ms = resourceSnap.eventLoopDelayP99Ms
    aggregated.nchan_memory_mb_peak = resourceSnap.nchanMemoryMbPeak
    aggregated.redis_memory_mb_peak = resourceSnap.redisMemoryMbPeak
    // §AC: Wire cgroup v2 runtime signals — deltas from run-start baseline
    aggregated.cpu_usage_usec = (resourceSnap.cpu_usage_usec ?? 0) - (cgroupBaseline.cpu_usage_usec ?? 0)
    aggregated.cpu_throttled_count = (resourceSnap.cpu_throttled_count ?? 0) - (cgroupBaseline.cpu_throttled_count ?? 0)
    aggregated.cpu_throttled_usec = (resourceSnap.cpu_throttled_usec ?? 0) - (cgroupBaseline.cpu_throttled_usec ?? 0)
    aggregated.memory_oom_events = (resourceSnap.memory_oom_events ?? 0) - (cgroupBaseline.memory_oom_events ?? 0)
    aggregated.memory_oom_kill_events = (resourceSnap.memory_oom_kill_events ?? 0) - (cgroupBaseline.memory_oom_kill_events ?? 0)
    aggregated.memory_current_bytes = resourceSnap.memory_current_bytes
    aggregated.memory_peak_bytes = resourceSnap.memory_peak_bytes
    aggregated.cpu_max_quota = resourceSnap.cpu_max_quota
    aggregated.cpu_max_period = resourceSnap.cpu_max_period
    aggregated.memory_max_bytes = resourceSnap.memory_max_bytes
    // §4.9: Wire Nchan container resource metrics — deltas for cumulative counters
    aggregated.nchan_cpu_usage_usec = resourceSnap.nchan_cpu_usage_usec !== null && cgroupBaseline.nchan_cpu_usage_usec !== null
      ? resourceSnap.nchan_cpu_usage_usec - cgroupBaseline.nchan_cpu_usage_usec
      : resourceSnap.nchan_cpu_usage_usec
    aggregated.nchan_cpu_throttled_count = resourceSnap.nchan_cpu_throttled_count !== null && cgroupBaseline.nchan_cpu_throttled_count !== null
      ? resourceSnap.nchan_cpu_throttled_count - cgroupBaseline.nchan_cpu_throttled_count
      : resourceSnap.nchan_cpu_throttled_count
    aggregated.nchan_cpu_throttled_usec = resourceSnap.nchan_cpu_throttled_usec !== null && cgroupBaseline.nchan_cpu_throttled_usec !== null
      ? resourceSnap.nchan_cpu_throttled_usec - cgroupBaseline.nchan_cpu_throttled_usec
      : resourceSnap.nchan_cpu_throttled_usec
    aggregated.nchan_memory_current_bytes = resourceSnap.nchan_memory_current_bytes
    aggregated.nchan_memory_peak_bytes = resourceSnap.nchan_memory_peak_bytes
    aggregated.nchan_memory_container_lifetime_peak_bytes = resourceSnap.nchan_memory_container_lifetime_peak_bytes
    aggregated.nchan_memory_oom_events = resourceSnap.nchan_memory_oom_events !== null && cgroupBaseline.nchan_memory_oom_events !== null
      ? resourceSnap.nchan_memory_oom_events - cgroupBaseline.nchan_memory_oom_events
      : resourceSnap.nchan_memory_oom_events
    aggregated.nchan_memory_oom_kill_events = resourceSnap.nchan_memory_oom_kill_events !== null && cgroupBaseline.nchan_memory_oom_kill_events !== null
      ? resourceSnap.nchan_memory_oom_kill_events - cgroupBaseline.nchan_memory_oom_kill_events
      : resourceSnap.nchan_memory_oom_kill_events
    // §4.9: Redis connected-client peak
    aggregated.redis_connected_clients_peak = resourceSnap.redis_connected_clients_peak
    // §3.8: Nchan/Redis CPU percent peaks
    aggregated.nchan_cpu_percent_peak = resourceSnap.nchan_cpu_percent_peak
    aggregated.redis_cpu_percent_peak = resourceSnap.redis_cpu_percent_peak
    // §3.9: Normalized CPU percent peaks — divide raw per-core % by core count
    // §3.8.B: Use actual cpu.max period from each service's own cgroup, not hard-coded 100000µs
    const runnerCpuPeriod = resourceSnap.cpu_max_period ?? 100_000
    const cpuLimitCores = effectiveCpuCapacity(resourceSnap.cpu_max_quota, runnerCpuPeriod, resourceSnap.runner_cpuset_effective_cpus)
    const containerMode = detectContainerMode(resourceSnap.cpu_max_quota)
    aggregated.resource_cpu_percent_peak = normalizeCpuPercent(resourceSnap.cpuPercentPeak, cpuLimitCores)
    aggregated.resource_cpu_baseline = baselineCpuPercent(containerMode)
    // §3.8.A/§3.9: Per-service CPU normalization — use each service's own cgroup limit AND period
    const nchanCpuPeriod = resourceSnap.nchan_cpu_max_period ?? runnerCpuPeriod
    const nchanCpuLimitCores = effectiveCpuCapacity(resourceSnap.nchan_cpu_max_quota, nchanCpuPeriod, resourceSnap.nchan_cpuset_effective_cpus) ?? cpuLimitCores
    const redisCpuPeriod = resourceSnap.redis_cpu_max_period ?? runnerCpuPeriod
    const redisCpuLimitCores = effectiveCpuCapacity(resourceSnap.redis_cpu_max_quota, redisCpuPeriod, resourceSnap.redis_cpuset_effective_cpus) ?? cpuLimitCores
    aggregated.nchan_resource_cpu_percent_peak = normalizeCpuPercent(resourceSnap.nchan_cpu_percent_peak, nchanCpuLimitCores)
    aggregated.redis_resource_cpu_percent_peak = normalizeCpuPercent(resourceSnap.redis_cpu_percent_peak, redisCpuLimitCores)
    // §4.2: Topology capacity
    aggregated.topology_capacity_sufficient = topologyPreflight.capacity_sufficient
    // §BL: Wire publisher backlog peak
    aggregated.generator_backlog_peak = metrics.snapshot().generator_backlog_peak
    // §BM: Wire publisher acceptance stats
    aggregated.publisher_attempts = nchanPublisher.stats.attempts
    aggregated.publisher_successes = nchanPublisher.stats.successes
    aggregated.publisher_definite_failures = nchanPublisher.stats.definiteFailures
    aggregated.publisher_ambiguous_failures = nchanPublisher.stats.ambiguousFailures
    aggregated.connections_target = config.targetConnections
    aggregated.run_profile = config.runProfile
    aggregated.burst_fan_out_p95_ms = burst.burstFanOutP95Ms
    aggregated.lobby_subscribers = pool.getSubscriberCount("lobby")
    aggregated.match_001_subscribers = pool.getSubscriberCount("match-001")
    aggregated.match_002_subscribers = pool.getSubscriberCount("match-002")
    aggregated.match_003_subscribers = pool.getSubscriberCount("match-003")
    aggregated.match_004_subscribers = pool.getSubscriberCount("match-004")
    aggregated.match_005_subscribers = pool.getSubscriberCount("match-005")
    aggregated.match_006_subscribers = pool.getSubscriberCount("match-006")
    aggregated.match_007_subscribers = pool.getSubscriberCount("match-007")
    aggregated.match_008_subscribers = pool.getSubscriberCount("match-008")
    // §R: Wire active connections peak from metrics recorder
    aggregated.active_connections_peak = metrics.snapshot().active_connections_peak ?? 0

    // §V: Log viewer concentration for evidence — all 8 matches
    const matchViewerCounts = MATCH_IDS.map(id => `${id}=${pool.getSubscriberCount(id)}`)
    const totalSubscribers = MATCH_IDS.reduce((sum, id) => sum + pool.getSubscriberCount(id), 0) + pool.getSubscriberCount("lobby")
    log(`§V viewer-concentration: lobby=${aggregated.lobby_subscribers}, ${matchViewerCounts.join(", ")}, total=${totalSubscribers}`)

    // §4.7: Wire slow-consumer metrics from scenario
    aggregated.slow_consumer_metrics = slowConsumer.slowMetrics
    aggregated.non_slow_p95_degradation_pct = slowConsumer.slowMetrics?.healthy_degradation_pct ?? 0

    // Parse nchan restart result
    aggregated.nchan_restart_history_replay_correct = nchanResult.passed && !nchanResult.detail.includes("skipped")
    aggregated.nchan_restart_missing_sequences = nchanResult.detail.includes("gap=true") ? 1 : 0
    aggregated.nchan_restart_skipped = nchanResult.detail.includes("skipped")

    // §BH: Wire surge existing-viewer health
    if (ctx._surgeHealth) {
      aggregated.surge_fan_out_p95_ms = ctx._surgeHealth.fan_out_p95_ms
      aggregated.surge_missing_sequences = ctx._surgeHealth.missing_sequences
      aggregated.surge_duplicates = ctx._surgeHealth.duplicates
      aggregated.surge_out_of_order = ctx._surgeHealth.out_of_order
      aggregated.surge_events_received = ctx._surgeHealth.events_received
      // §4.5: Surge timing metrics
      aggregated.surge_target_additions = ctx._surgeHealth.surge_target_additions
      aggregated.surge_attempted = ctx._surgeHealth.surge_attempted
      aggregated.surge_established = ctx._surgeHealth.surge_established
      aggregated.surge_failures = ctx._surgeHealth.surge_failures
      aggregated.surge_start_time = ctx._surgeHealth.surge_start_time
      aggregated.surge_end_time = ctx._surgeHealth.surge_end_time
      aggregated.surge_elapsed_ms = ctx._surgeHealth.surge_elapsed_ms
      aggregated.surge_timing_error_ms = ctx._surgeHealth.surge_timing_error_ms
      aggregated.attempt_rate_peak = ctx._surgeHealth.attempt_rate_peak
      aggregated.establishment_rate_peak = ctx._surgeHealth.establishment_rate_peak
      aggregated.surge_scheduler_lag_p95 = ctx._surgeHealth.scheduler_lag_p95
      aggregated.surge_scheduler_lag_max = ctx._surgeHealth.scheduler_lag_max
      aggregated.active_population_start = ctx._surgeHealth.active_population_start
      aggregated.active_population_end = ctx._surgeHealth.active_population_end
      aggregated.active_population_peak = ctx._surgeHealth.active_population_peak
    }
    // §3.15: Wire reconnect active concurrency from scenario
    if (ctx._reconnectHealth) {
      aggregated.reconnect_active_start = ctx._reconnectHealth.active_start
      aggregated.reconnect_active_peak = ctx._reconnectHealth.active_peak
      aggregated.reconnect_active_end = ctx._reconnectHealth.active_end
    }
    // §3.14: Wire remaining per-scenario active populations
    if (ctx._lateJoinActivePopulation) {
      aggregated.late_join_active_start = ctx._lateJoinActivePopulation.start
      aggregated.late_join_active_peak = ctx._lateJoinActivePopulation.peak
      aggregated.late_join_active_end = ctx._lateJoinActivePopulation.end
    }
    if (ctx._burstActivePopulation) {
      aggregated.burst_active_start = ctx._burstActivePopulation.start
      aggregated.burst_active_peak = ctx._burstActivePopulation.peak
      aggregated.burst_active_end = ctx._burstActivePopulation.end
    }
    if (ctx._slowConsumerActivePopulation) {
      aggregated.slow_consumer_active_start = ctx._slowConsumerActivePopulation.start
      aggregated.slow_consumer_active_peak = ctx._slowConsumerActivePopulation.peak
      aggregated.slow_consumer_active_end = ctx._slowConsumerActivePopulation.end
    }
    if (ctx._restartActivePopulation) {
      aggregated.restart_active_start = ctx._restartActivePopulation.start
      aggregated.restart_active_peak = ctx._restartActivePopulation.peak
      aggregated.restart_active_end = ctx._restartActivePopulation.end
    }

    const generatorHealthy = aggregated.generator_cpu_percent_peak < 90 && aggregated.event_loop_delay_p99_ms < 100
    const timingValid = aggregated.event_loop_delay_p99_ms < 200

    // A coordinated shard is classified only for its local validity. It cannot
    // substitute local active population for the simultaneous global target.
    const resourceEvidenceTarget = coordinatedMode ? globalTarget : config.targetConnections * shardCount
    const verdictResult = classifyResult(aggregated, generatorHealthy, timingValid, topologyPreflight, resourceEvidenceTarget)
    verdictVerdict = verdictResult.verdict

    printSummary(aggregated, publisher.totalPublished, verdictResult)

    // §6.24: Emit machine-readable JSON result to stdout
    emitMachineReadableResult(aggregated, publisher.totalPublished, verdictResult, {
      targetConnections: config.targetConnections,
      seed: config.seed,
      runProfile: config.runProfile,
      runMode: config.runMode,
      warmupSeconds: config.warmupSeconds,
      measureSeconds: config.measureSeconds,
      burstSeconds: config.burstSeconds,
      cooldownSeconds: config.cooldownSeconds,
      slowConsumerFraction: config.slowConsumerFraction,
      lobbyFraction: config.lobbyFraction,
      nchanPubUrl: config.nchanPubUrl,
      nchanSubUrl: config.nchanSubUrl,
      redisUrl: config.redisUrl,
      nchanControlUrl: config.nchanControlUrl,
    }, topologyPreflight, {
      reconnect_clients: ctx._reconnectPerClient ?? [],
      restart_replay: ctx._restartReplay ?? {},
    })

    if (coordinator) {
      const sampleSnapshot = metrics.snapshot()
      const validityReasons = [
        ...(!sourceCommit ? ["source commit unavailable"] : []),
        ...(!generatorHealthy ? ["generator CPU/event-loop saturation"] : []),
        ...(sampleSnapshot.generator_backlog_peak > 1000 ? [`generator backlog ${sampleSnapshot.generator_backlog_peak} > 1000`] : []),
        ...(!timingValid ? ["timing invalid"] : []),
        ...(!topologyPreflight.source_port_headroom_valid ? topologyPreflight.warnings : []),
        ...(!nginxRuntimePreflight?.sufficient ? [nginxRuntimePreflight?.reason ?? "Nginx worker preflight unavailable"] : []),
        ...(!clockEvidence.passed ? ["shared-kernel clock reachability invalid"] : []),
      ]
      const phaseRate = (phase: typeof aggregated.phase_publish_rates[number]) => {
        const durationMs = ctx.phaseSnapshots.find((snapshot) => snapshot.phase === phase.phase)?.durationMs ?? 0
        return {
          phase: phase.phase,
          attempted_per_sec: durationMs > 0 ? phase.totalEventsAttempted / (durationMs / 1000) : 0,
          accepted_per_sec: phase.totalEventsPerSec,
        }
      }
      const shardResult: ShardExperimentResult = {
        aggregate_scope: "shard",
        scope: "shard",
        global_direct_accept_eligible: false,
        experiment_run_id: coordinator.experimentRunId!,
        run_index: 0,
        shard_id: shardId,
        shard_count: shardCount,
        local_target: config.targetConnections,
        global_target: globalTarget,
        seed: config.seed,
        source_commit: sourceCommit!,
        publisher_owner: publisherOwner,
        verdict: verdictResult.verdict,
        validity: {
          generator_valid: generatorHealthy && sampleSnapshot.generator_backlog_peak <= 1000,
          source_port_headroom_valid: topologyPreflight.source_port_headroom_valid,
          nginx_worker_capacity_valid: nginxRuntimePreflight?.sufficient ?? false,
          environment_valid: clockEvidence.passed,
          timing_valid: timingValid,
          reasons: validityReasons,
        },
        samples: coordinator.stopSampling(),
        histograms: {
          fan_out: metrics.getFanOutHistogram().serialize(),
          late_join: metrics.getLateJoinHistogram().serialize(),
        },
        correctness_counters: {
          missing_sequences: aggregated.missing_sequences,
          duplicates: aggregated.duplicates,
          out_of_order: aggregated.out_of_order,
          reconnect_gaps: aggregated.reconnect_gaps,
          reconnect_duplicates: aggregated.reconnect_duplicates,
          reconnect_order_violations: aggregated.reconnect_order_violations,
          schema_validation_errors: aggregated.schema_validation_errors,
          sse_parse_errors: aggregated.sse_parse_errors,
          json_parse_errors: aggregated.json_parse_errors,
          restart_missing_sequences: aggregated.nchan_restart_missing_sequences,
        },
        workload: {
          events_published: publisher.totalPublished,
          phase_rates: aggregated.phase_publish_rates.map(phaseRate),
        },
        resources: {
          generator: {
            cpu_raw_percent_peak: resourceSnap.cpuPercentPeak,
            cpu_percent_of_capacity_peak: aggregated.resource_cpu_percent_peak,
            cpu_max_quota: resourceSnap.cpu_max_quota,
            cpu_max_period: resourceSnap.cpu_max_period,
            cpuset_effective_cpus: resourceSnap.runner_cpuset_effective_cpus,
            event_loop_p99_ms: resourceSnap.eventLoopDelayP99Ms,
            memory_peak_bytes: resourceSnap.memory_peak_bytes,
          },
          nchan: {
            cpu_raw_percent_peak: resourceSnap.nchan_cpu_percent_peak,
            cpu_percent_of_capacity_peak: aggregated.nchan_resource_cpu_percent_peak,
            cpu_max_quota: resourceSnap.nchan_cpu_max_quota,
            cpu_max_period: resourceSnap.nchan_cpu_max_period,
            cpuset_effective_cpus: resourceSnap.nchan_cpuset_effective_cpus,
            memory_peak_run_bytes: resourceSnap.nchan_memory_peak_bytes,
            memory_peak_container_lifetime_bytes: resourceSnap.nchan_memory_container_lifetime_peak_bytes ?? null,
          },
          redis: {
            cpu_raw_percent_peak: resourceSnap.redis_cpu_percent_peak,
            cpu_percent_of_capacity_peak: aggregated.redis_resource_cpu_percent_peak,
            cpu_max_quota: resourceSnap.redis_cpu_max_quota,
            cpu_max_period: resourceSnap.redis_cpu_max_period,
            cpuset_effective_cpus: resourceSnap.redis_cpuset_effective_cpus,
            memory_peak_run_mb: resourceSnap.redisMemoryMbPeak,
          },
        },
        scenarios: [
          { name: "late-join", participated: publisherOwner, passed: lateJoinResult.passed, detail: lateJoinResult.detail },
          { name: "burst", participated: publisherOwner, passed: burstResult.passed, detail: burstResult.detail },
          {
            name: "reconnect",
            participated: true,
            passed: reconnectResult.passed,
            detail: reconnectResult.detail,
            structured: { clients: ctx._reconnectPerClient ?? [] },
          },
          { name: "slow-consumer", participated: true, passed: slowResult.passed, detail: slowResult.detail },
          {
            name: "restart-replacement",
            participated: publisherOwner,
            passed: nchanResult.passed,
            detail: nchanResult.detail,
            structured: { paths: ctx._restartReplay ?? {} },
          },
        ],
      }
      await coordinator.submitResult(shardResult)
      await phaseBarrier("final-metrics", "end")
    }

    log("=== POC Runner Complete ===")
  } catch (error) {
    await coordinator?.abort(error instanceof Error ? error.message : String(error))
    throw error
  } finally {
    // §BS: Guaranteed cleanup on all exit paths
    clearTimeout(runTimer)
    if (loopMonitor) clearInterval(loopMonitor)
    await publisher.drain()
    await pool.disconnectAll().catch(() => {})
    if ("dispose" in resourceMonitor && typeof resourceMonitor.dispose === "function") {
      resourceMonitor.dispose()
    }
    log("Cleanup complete")
  }

  // §BS: Exit with code based on verdict (outside finally so process.exit works)
  process.exitCode = verdictVerdict === "ACCEPT" || verdictVerdict === "NOT_APPLICABLE" ? 0 : 1
}

main().catch((err) => {
  console.error("Fatal error:", err)
  process.exit(1)
})
