import { loadConfig } from "./config/experiment-config.js"
import { ACTIVE_CONTRACT_VERSION } from "./domain/active-contract.js"
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
import { ConnectionSurgeScenario } from "./scenarios/connection-surge.js"
import { NchanRestartScenario, type RestartScenarioRole } from "./scenarios/nchan-restart.js"
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
      contract_version: suiteResult.contract_version,
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

  // §v2.1.0: coordinated-mode shard identity for partition wiring
  const coordinatedModeEarly = config.runMode === "coordinated-shard"
  const shardIdEarly = parseInt(process.env.SHARD_ID ?? "0", 10)
  // §v2.1.0: the restart-target shard additionally monitors the SPARE node so
  // per-node resource evidence covers every fan-out node incl. the replacement.
  const isRestartTargetShard = coordinatedModeEarly && shardIdEarly === config.restartTargetShard
  const spareMonitor = isRestartTargetShard && config.nchanSpareControlUrl
    ? new CgroupResourceMonitor(undefined, config.nchanSpareControlUrl)
    : null

  const random = createPRNG(config.seed)

  const pool = new ConnectionPool(
    {
      subUrl: config.nchanSubUrl,
      matchIds: [...MATCH_IDS],
      onCanonicalHead: (matchId, canonicalSeq) => headTracker.updateHead(matchId, canonicalSeq),
    },
    metrics,
    clock,
  )

  // §M3-HVR repair #5: Expected-delivery accounting scope. In coordinated mode
  // exactly one shard owns the logical publisher workload and publishes to ALL
  // partitions through the shared canonical Redis store, while every shard
  // holds an equal target allocation. The owner's local pool therefore sees
  // only ~1/shardCount of the true global subscriber population; counting it
  // raw undercounted global expected fan-out by ~shardCount× and skewed the
  // coordinator's aggregate delivery ratio. Scale the owner's per-channel
  // count by shardCount (equal-allocation estimate); non-owner shards never
  // start the publisher, so their counts stay local-scope and unused.
  const expectedScopeMultiplier = coordinatedModeEarly && process.env.PUBLISHER_OWNER === "true"
    ? Math.max(1, parseInt(process.env.SHARD_TOTAL ?? process.env.SHARD_COUNT ?? "1", 10) || 1)
    : 1

  const publisher = new MatchEventPublisher({
    publisher: nchanPublisher,
    headTracker,
    burstMode: false,
    random,
    getSubscriberCount: (channel) => pool.getSubscriberCount(channel) * expectedScopeMultiplier,
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
  const campaignId = process.env.CAMPAIGN_ID ?? "single-run"
  if (coordinatedMode && !process.env.CAMPAIGN_ID?.trim()) throw new Error("CAMPAIGN_ID is required in coordinated mode")
  const sourceCommit = getGitCommitSha()
  const coordinator = coordinatedMode
      ? new CoordinatedShardClient(process.env.COORDINATOR_URL ?? "http://coordinator:3000", {
        campaign_id: campaignId,
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

  // §BS: Maximum run deadline to prevent indefinite hangs.
  // Default 600 s preserved for single-run/smoke profiles; the coordinated 100k
  // profile overrides it via RUNNER_MAX_RUN_MS in compose.evidence-100k.yaml so
  // valid phase overruns (surge barrier wait, late-join prefill) cannot destroy
  // the measurement before the classifier produces a global verdict.
  const parsedMaxRunMs = Number.parseInt(process.env.RUNNER_MAX_RUN_MS ?? "", 10)
  const MAX_RUN_MS = Number.isFinite(parsedMaxRunMs) && parsedMaxRunMs > 0 ? parsedMaxRunMs : 10 * 60 * 1000
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
    // We verify connectivity to this shard's partition node (+ spare when configured)
    // and document the clock model. Field mapping: nchan1_reachable = own partition
    // node; nchan2_reachable = spare node when configured, else true (not applicable).
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
    if (config.nchanSpareSubUrl) {
      const sparePubUrl = config.nchanSparePubUrl ?? (() => {
        const url = new URL(config.nchanSpareSubUrl)
        url.pathname = ""
        return url.toString().replace(/\/$/, "")
      })()
      try {
        const resp2 = await fetch(`${sparePubUrl}/pub/healthcheck`, { signal: AbortSignal.timeout(3000) })
        clockEvidence.nchan2_reachable = resp2.ok
      } catch {}
    }

    // Same-host containers: clock offset is 0 (shared kernel clock)
    // Only fails if a required Nchan node is unreachable (can't verify clock sharing)
    clockEvidence.passed = clockEvidence.nchan1_reachable &&
      (config.nchanSpareSubUrl ? clockEvidence.nchan2_reachable : true)

    log(`§4.15 clock-compat: model=${clockEvidence.clock_model} partition=${clockEvidence.nchan1_reachable} spare=${config.nchanSpareSubUrl ? clockEvidence.nchan2_reachable : "n/a"} offset=${clockEvidence.cross_node_max_offset_ms}ms threshold=${clockEvidence.threshold_ms}ms passed=${clockEvidence.passed}`)
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
    // §v2.1.0: run identity for structured evidence binding (registration already done)
    ctx._runIdentity = {
      campaignId,
      experimentRunId: coordinator?.experimentRunId ?? "single-run",
      runIndex: parseInt(process.env.GLOBAL_RUN_INDEX ?? "0", 10),
      shardId,
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
      // §v2.1.0: per-node preflight — each shard validates its OWN partition node
      // against its local expected population (~25k), not the global 100k target.
      const nginxPreflight = await rm.preflight(config.nchanControlUrl, config.targetConnections)
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
    if ((!coordinator || publisherOwner)) {
      await resetRedisForExperiment(config.redisUrl)
      log("Redis history reset and verified for run isolation")
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
      spareMonitor?.measureCpu()
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
    let spareBaseline: Awaited<ReturnType<CgroupResourceMonitor["snapshot"]>> | null = null
    if (spareMonitor) {
      await spareMonitor.ready()
      spareBaseline = spareMonitor.snapshot()
      log(`§v2.1.0 spare-node monitoring active (restart target shard ${shardId})`)
    }
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
    // §v2.1.0: every shard samples its OWN partition node against the one
    // owner-frozen expectation — no independent history/fan-out ownership domain
    // can escape verification (one sample per shard per run).
    await phaseBarrier("late-join", "start")
    metrics.beginPhase("late-join")
    const lateJoinStart = ctx.clock.now()
    ctx._activePopulationStart = pool.size
    const lateJoin = new LateJoinScenario(pool, {
      role: publisherOwner ? "owner" : "follower",
      experimentRunId: coordinator?.experimentRunId ?? `${campaignId}-single`,
    })
    const lateJoinResult = await lateJoin.execute(ctx)
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

    // Phase 9: Nchan restart — §v2.1.0 partition-targeted drill.
    // owner (publisher-owner shard): spare-node cross-node probe.
    // target (restartTargetShard): literal partition restart + planned pool failover.
    // bystander: records non-participation with no fabricated paths.
    await phaseBarrier("restart-replacement", "start")
    metrics.beginPhase("nchan-restart")
    const restartStart = ctx.clock.now()
    ctx._activePopulationStart = pool.size
    const restartRole: RestartScenarioRole = publisherOwner
      ? "owner"
      : shardId === config.restartTargetShard ? "target" : "bystander"
    const nchanRestart = new NchanRestartScenario({
      role: restartRole,
      ownSubUrl: config.nchanSubUrl,
      ownPubUrl: config.nchanPubUrl,
      spareSubUrl: config.nchanSpareSubUrl,
      controlUrl: config.nchanControlUrl,
      pool,
      restartTargetShard: config.restartTargetShard,
      shardId,
    })
    const nchanResult = await nchanRestart.execute(ctx)
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
    resourceMonitor.measureCpu()
    const resourceSnap = resourceMonitor.snapshot()
    // §v2.1.0: spare-node final snapshot (restart-target shard only)
    let spareSnap: Awaited<ReturnType<CgroupResourceMonitor["snapshot"]>> | null = null
    if (spareMonitor) {
      spareMonitor.measureCpu()
      spareSnap = spareMonitor.snapshot()
    }
    resourceMonitor.stopEventLoopMonitor()

    const phaseHists = metrics.snapshotPhaseHistograms()
    const aggregated = aggregateWorkerMetrics([metrics], ctx.phaseSnapshots, phaseHists)
    aggregated.build_identity = buildIdentity
    // §3.12: Wire clock validity into single-run aggregated metrics
    aggregated.clock_validity = {
      clock_model: clockEvidence.clock_model,
      nodes_covered: ["runner", "nchan-p" + shardId, ...(config.nchanSpareSubUrl ? ["nchan-spare"] : [])],
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
    aggregated.redis_memory_used_bytes = resourceSnap.redisMemoryBytesPeak ?? null
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

    // Parse nchan restart result
    aggregated.nchan_restart_history_replay_correct = nchanResult.passed && !nchanResult.detail.includes("skipped")
    aggregated.nchan_restart_missing_sequences = Object.values(ctx._restartReplay ?? {})
      .reduce((sum, path) => sum + (path?.missing_required ?? 0), 0)
    aggregated.nchan_restart_skipped = nchanResult.detail.includes("skipped")
    // §v2.1.0: planned failover-window correctness deltas — gated explicitly by the
    // classifier and by the coordinator's restart-target pool-health check.
    if (ctx._failoverHealth) {
      aggregated.restart_failover_gaps = ctx._failoverHealth.gaps
      aggregated.restart_failover_duplicates = ctx._failoverHealth.duplicates
      aggregated.restart_failover_order_violations = ctx._failoverHealth.order_violations
    }

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
    if (ctx._restartActivePopulation) {
      aggregated.restart_active_start = ctx._restartActivePopulation.start
      aggregated.restart_active_peak = ctx._restartActivePopulation.peak
      aggregated.restart_active_end = ctx._restartActivePopulation.end
    }

    const generatorHealthy = aggregated.resource_cpu_percent_peak !== null
      && aggregated.resource_cpu_percent_peak < 90
      && aggregated.event_loop_delay_p99_ms < 100
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
      surgeSeconds: config.surgeSeconds,
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
        contract_version: ACTIVE_CONTRACT_VERSION,
        aggregate_scope: "shard",
        scope: "shard",
        global_direct_accept_eligible: false,
        experiment_run_id: coordinator.experimentRunId!,
        campaign_id: campaignId,
        run_index: parseInt(process.env.GLOBAL_RUN_INDEX ?? "0", 10),
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
          // §v2.2.0: class-split publish->wire latency is measured by the Go
          // deep cohort (which decodes payloads). This legacy TypeScript
          // runner cannot attribute classes without reintroducing the
          // per-frame payload parsing cost that motivated the reset, so it
          // honestly reports empty splits; the coordinator treats them as
          // missing evidence (INCONCLUSIVE) rather than zero latency.
          goal_fan_out: { max_ms: 30_000, total_count: 0, overflow_count: 0, buckets: [] },
          other_fan_out: { max_ms: 30_000, total_count: 0, overflow_count: 0, buckets: [] },
          late_join: metrics.getLateJoinHistogram().serialize(),
          burst: phaseHists.burst?.fanOut.distribution
            ?? { max_ms: 30_000, total_count: 0, overflow_count: 0, buckets: [] },
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
            nofile_soft: topologyPreflight.fd_soft_limit,
            nofile_hard: topologyPreflight.fd_hard_limit,
          },
          nchan: {
            cpu_raw_percent_peak: resourceSnap.nchan_cpu_percent_peak,
            cpu_percent_of_capacity_peak: aggregated.nchan_resource_cpu_percent_peak,
            cpu_max_quota: resourceSnap.nchan_cpu_max_quota,
            cpu_max_period: resourceSnap.nchan_cpu_max_period,
            cpuset_effective_cpus: resourceSnap.nchan_cpuset_effective_cpus,
            memory_peak_run_bytes: resourceSnap.nchan_memory_peak_bytes,
            memory_peak_container_lifetime_bytes: resourceSnap.nchan_memory_container_lifetime_peak_bytes ?? null,
            oom_events: aggregated.nchan_memory_oom_events,
            oom_kill_events: aggregated.nchan_memory_oom_kill_events,
            cpu_throttled_count: aggregated.nchan_cpu_throttled_count,
            cpu_throttled_usec: aggregated.nchan_cpu_throttled_usec,
            nginx_worker_fd_soft: nginxRuntimePreflight?.nginx_worker_fd_soft ?? null,
            nginx_worker_fd_hard: nginxRuntimePreflight?.nginx_worker_fd_hard ?? null,
          },
          redis: {
            cpu_raw_percent_peak: resourceSnap.redis_cpu_percent_peak,
            cpu_percent_of_capacity_peak: aggregated.redis_resource_cpu_percent_peak,
            cpu_max_quota: resourceSnap.redis_cpu_max_quota,
            cpu_max_period: resourceSnap.redis_cpu_max_period,
            cpuset_effective_cpus: resourceSnap.redis_cpuset_effective_cpus,
            memory_peak_run_mb: resourceSnap.redisMemoryMbPeak,
            memory_used_bytes: resourceSnap.redisMemoryBytesPeak ?? null,
          },
          // §v2.1.0: spare-node evidence — recorded by the restart-target shard only
          ...(spareMonitor && spareBaseline && spareSnap ? {
            spare: {
              cpu_raw_percent_peak: spareSnap.nchan_cpu_percent_peak,
              cpu_max_quota: spareSnap.nchan_cpu_max_quota,
              cpu_max_period: spareSnap.nchan_cpu_max_period,
              cpuset_effective_cpus: spareSnap.nchan_cpuset_effective_cpus,
              memory_peak_run_bytes: spareSnap.nchan_memory_peak_bytes,
              memory_peak_container_lifetime_bytes: spareSnap.nchan_memory_container_lifetime_peak_bytes ?? null,
              oom_events: (spareSnap.nchan_memory_oom_events ?? 0) - (spareBaseline.nchan_memory_oom_events ?? 0),
              oom_kill_events: (spareSnap.nchan_memory_oom_kill_events ?? 0) - (spareBaseline.nchan_memory_oom_kill_events ?? 0),
              cpu_throttled_count: (spareSnap.nchan_cpu_throttled_count ?? 0) - (spareBaseline.nchan_cpu_throttled_count ?? 0),
              cpu_throttled_usec: (spareSnap.nchan_cpu_throttled_usec ?? 0) - (spareBaseline.nchan_cpu_throttled_usec ?? 0),
            },
          } : {}),
        },
        scenarios: [
          {
            name: "late-join",
            participated: publisherOwner,
            passed: lateJoinResult.passed,
            detail: lateJoinResult.detail,
            structured: {
              expected_sample_count: publisherOwner ? 1 : 0,
              recorded_sample_count: phaseHists["late-join"]?.lateJoin.count ?? 0,
            },
          },
          { name: "burst", participated: publisherOwner, passed: burstResult.passed, detail: burstResult.detail },
          {
            name: "reconnect",
            participated: true,
            passed: reconnectResult.passed,
            detail: reconnectResult.detail,
            structured: { clients: ctx._reconnectPerClient ?? [] },
          },
          {
            name: "restart-replacement",
            participated: restartRole !== "bystander",
            passed: nchanResult.passed,
            detail: nchanResult.detail,
            structured: {
              campaign_id: campaignId,
              experiment_run_id: coordinator.experimentRunId!,
              run_index: parseInt(process.env.GLOBAL_RUN_INDEX ?? "0", 10),
              shard_id: shardId,
              role: restartRole,
              paths: ctx._restartReplay ?? {},
              ...(ctx._failoverHealth ? { pool: ctx._failoverHealth } : {}),
            },
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
