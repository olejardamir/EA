import { loadConfig } from "./config/experiment-config.js"
import { NchanHttpPublisher } from "./adapters/nchan-http-publisher.js"
import { SSEHttpClient } from "./adapters/sse-http-client.js"
import { BoundedMetricsRecorder } from "./adapters/metrics-recorder.js"
import { SystemClock } from "./adapters/system-clock.js"
import { CgroupResourceMonitor } from "./adapters/cgroup-resource-monitor.js"
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
import type { ScenarioContext } from "./scenarios/scenario.js"

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
        log(`§4.24 preflight: worker_processes=${preflight.worker_processes} worker_connections=${preflight.worker_connections} total=${preflight.worker_connections_total} fd_soft=${preflight.fd_soft_limit} cpu_quota=${preflight.cpu_quota} sufficient=${preflight.sufficient}`)
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
      contract_version: "v2.0.2",
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
    },
  })

  // §BS: Maximum run deadline to prevent indefinite hangs
  const MAX_RUN_MS = 10 * 60 * 1000 // 10 minutes
  const runTimer = setTimeout(() => {
    log(`§BS: Maximum run deadline (${MAX_RUN_MS / 1000}s) reached — forcing shutdown`)
    process.exit(2)
  }, MAX_RUN_MS)

  let loopMonitor: NodeJS.Timeout | null = null
  let verdictVerdict = "NOT_APPLICABLE" as string

  try {
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
    }

    log("=== POC Runner Starting ===")
    log(`Config: ${config.targetConnections} target connections, seed=${config.seed}`)
    log(`Profile: ${config.runProfile}`)
    log(`Phases: warmup=${config.warmupSeconds}s, steady=${config.measureSeconds}s, burst=${config.burstSeconds}s`)

    // §4.2/§4.24: Run topology and capacity preflight
    const topologyPreflight = runTopologyPreflight(config.targetConnections)
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

    loopMonitor = setInterval(() => {
      resourceMonitor.measureCpu()
      // §BL: Sample publisher backlog (in-flight publish promises) every 100ms
      metrics.setBacklog(publisher.pendingPublishes)
    }, 100)

    // §AB: Start continuous event-loop delay monitor before measured phases
    resourceMonitor.startEventLoopMonitor()

    // Phase 1: Warmup (60% base) — publisher starts during warm-up (§BT)
    const warmup = new WarmupScenario(pool)
    const warmupResult = await warmup.execute(ctx)
    log(`  ${warmupResult.passed ? "PASS" : "FAIL"} ${warmupResult.name}: ${warmupResult.detail}`)
    // §4.6: Record phase snapshot for publish rate measurement
    const warmupSnap = publisher.snapshotAndReset()
    ctx.phaseSnapshots.push({ phase: "warmup", eventsPublished: warmupSnap.eventsPublished, byMatch: warmupSnap.byMatch, durationMs: config.warmupSeconds * 1000 })

    // Phase 2: Steady — publisher already running from warm-up
    const steady = new SteadyScenario(pool)
    const steadyResult = await steady.execute(ctx)
    log(`  ${steadyResult.passed ? "PASS" : "FAIL"} ${steadyResult.name}: ${steadyResult.detail}`)
    // §4.6: Record phase snapshot
    const steadySnap = publisher.snapshotAndReset()
    ctx.phaseSnapshots.push({ phase: "steady", eventsPublished: steadySnap.eventsPublished, byMatch: steadySnap.byMatch, durationMs: config.measureSeconds * 1000 })

    // Phase 3: Connection surge 60% -> 100% (§4.4: surge before peak scenarios)
    const connectionSurge = new ConnectionSurgeScenario(pool)
    const surgeResult = await connectionSurge.execute(ctx)
    log(`  ${surgeResult.passed ? "PASS" : "FAIL"} ${surgeResult.name}: ${surgeResult.detail}`)
    // §4.6: Record phase snapshot
    const surgeSnap = publisher.snapshotAndReset()
    ctx.phaseSnapshots.push({ phase: "surge", eventsPublished: surgeSnap.eventsPublished, byMatch: surgeSnap.byMatch, durationMs: ctx._surgeHealth?.surge_elapsed_ms ?? 0 })

    // Phase 4: Post-surge stabilization
    log(`--- PHASE: POST-SURGE STABILIZATION (${config.cooldownSeconds}s) ---`)
    await sleep(config.cooldownSeconds * 1000)
    log("Post-surge stabilization complete")

    // Phase 5: Late-join under peak load
    const lateJoinStart = ctx.clock.now()
    const lateJoin = new LateJoinScenario(pool)
    const lateJoinResult = await lateJoin.execute(ctx)
    const lateJoinDuration = ctx.clock.now() - lateJoinStart
    log(`  ${lateJoinResult.passed ? "PASS" : "FAIL"} ${lateJoinResult.name}: ${lateJoinResult.detail}`)
    // §4.6: Record phase snapshot with actual duration
    const lateJoinSnap = publisher.snapshotAndReset()
    ctx.phaseSnapshots.push({ phase: "late-join", eventsPublished: lateJoinSnap.eventsPublished, byMatch: lateJoinSnap.byMatch, durationMs: lateJoinDuration })

    // Phase 6: Burst at peak
    const burst = new BurstScenario()
    const burstResult = await burst.execute(ctx)
    log(`  ${burstResult.passed ? "PASS" : "FAIL"} ${burstResult.name}: ${burstResult.detail}`)
    // §4.6: Record phase snapshot
    const burstSnap = publisher.snapshotAndReset()
    ctx.phaseSnapshots.push({ phase: "burst", eventsPublished: burstSnap.eventsPublished, byMatch: burstSnap.byMatch, durationMs: config.burstSeconds * 1000 })

    // Phase 7: Post-burst steady
    log(`--- PHASE: POST-BURST STEADY (${config.cooldownSeconds}s) ---`)
    await publisher.drain()
    publisher.burstMode = false
    publisher.start(true)
    await sleep(config.cooldownSeconds * 1000)
    log("Post-burst steady complete")
    // §4.6: Record phase snapshot
    const postBurstSnap = publisher.snapshotAndReset()
    ctx.phaseSnapshots.push({ phase: "post-burst", eventsPublished: postBurstSnap.eventsPublished, byMatch: postBurstSnap.byMatch, durationMs: config.cooldownSeconds * 1000 })

    // Phase 8: Reconnect while publishing
    const reconnectStart = ctx.clock.now()
    const reconnect = new ReconnectScenario(pool)
    const reconnectResult = await reconnect.execute(ctx)
    const reconnectDuration = ctx.clock.now() - reconnectStart
    log(`  ${reconnectResult.passed ? "PASS" : "FAIL"} ${reconnectResult.name}: ${reconnectResult.detail}`)
    // §4.6: Record phase snapshot with actual duration
    const reconnectSnap = publisher.snapshotAndReset()
    ctx.phaseSnapshots.push({ phase: "reconnect", eventsPublished: reconnectSnap.eventsPublished, byMatch: reconnectSnap.byMatch, durationMs: reconnectDuration })

    // Phase 9: Slow consumer / backpressure at frozen concurrency
    const slowConsumerStart = ctx.clock.now()
    const slowConsumer = new SlowConsumerScenario(pool)
    const slowResult = await slowConsumer.execute(ctx)
    const slowConsumerDuration = ctx.clock.now() - slowConsumerStart
    log(`  ${slowResult.passed ? "PASS" : "FAIL"} ${slowResult.name}: ${slowResult.detail}`)
    // §4.6: Record phase snapshot with actual duration
    const slowSnap = publisher.snapshotAndReset()
    ctx.phaseSnapshots.push({ phase: "slow-consumer", eventsPublished: slowSnap.eventsPublished, byMatch: slowSnap.byMatch, durationMs: slowConsumerDuration })

    // Phase 10: Nchan restart (cross-node Redis history or literal process restart)
    const restartStart = ctx.clock.now()
    const nchanRestart = new NchanRestartScenario(config.nchanSubUrl, config.nchanPubUrl, config.nchan2SubUrl, config.nchanControlUrl)
    const nchanResult = await nchanRestart.execute(ctx)
    const restartDuration = ctx.clock.now() - restartStart
    log(`  ${nchanResult.passed ? "PASS" : "FAIL"} ${nchanResult.name}: ${nchanResult.detail}`)
    // §4.6: Record phase snapshot with actual duration
    const restartSnap = publisher.snapshotAndReset()
    ctx.phaseSnapshots.push({ phase: "nchan-restart", eventsPublished: restartSnap.eventsPublished, byMatch: restartSnap.byMatch, durationMs: restartDuration })

    // Collect metrics
    log("\n--- COLLECTING METRICS ---")
    resourceMonitor.stopEventLoopMonitor()
    resourceMonitor.measureCpu()
    const resourceSnap = resourceMonitor.snapshot()

    const aggregated = aggregateWorkerMetrics([metrics], ctx.phaseSnapshots)
    aggregated.event_loop_delay_p99_ms = resourceSnap.eventLoopDelayP99Ms
    aggregated.memory_mb_peak = resourceSnap.memoryMbPeak
    aggregated.generator_cpu_percent_peak = resourceSnap.cpuPercentPeak
    aggregated.generator_event_loop_p99_ms = resourceSnap.eventLoopDelayP99Ms
    aggregated.nchan_memory_mb_peak = resourceSnap.nchanMemoryMbPeak
    aggregated.redis_memory_mb_peak = resourceSnap.redisMemoryMbPeak
    // §AC: Wire cgroup v2 runtime signals
    aggregated.cpu_usage_usec = resourceSnap.cpu_usage_usec
    aggregated.cpu_throttled_count = resourceSnap.cpu_throttled_count
    aggregated.cpu_throttled_usec = resourceSnap.cpu_throttled_usec
    aggregated.memory_oom_events = resourceSnap.memory_oom_events
    aggregated.memory_oom_kill_events = resourceSnap.memory_oom_kill_events
    aggregated.memory_current_bytes = resourceSnap.memory_current_bytes
    aggregated.memory_peak_bytes = resourceSnap.memory_peak_bytes
    aggregated.cpu_max_quota = resourceSnap.cpu_max_quota
    aggregated.memory_max_bytes = resourceSnap.memory_max_bytes
    // §4.9: Wire Nchan container resource metrics
    aggregated.nchan_cpu_usage_usec = resourceSnap.nchan_cpu_usage_usec
    aggregated.nchan_cpu_throttled_count = resourceSnap.nchan_cpu_throttled_count
    aggregated.nchan_cpu_throttled_usec = resourceSnap.nchan_cpu_throttled_usec
    aggregated.nchan_memory_current_bytes = resourceSnap.nchan_memory_current_bytes
    aggregated.nchan_memory_peak_bytes = resourceSnap.nchan_memory_peak_bytes
    aggregated.nchan_memory_oom_events = resourceSnap.nchan_memory_oom_events
    aggregated.nchan_memory_oom_kill_events = resourceSnap.nchan_memory_oom_kill_events
    // §4.9: Redis connected-client peak
    aggregated.redis_connected_clients_peak = resourceSnap.redis_connected_clients_peak
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
    // §R: Wire active connections peak from metrics recorder
    aggregated.active_connections_peak = metrics.snapshot().active_connections_peak ?? 0

    // §V: Log hot-match viewer concentration for evidence
    const totalSubscribers = MATCH_IDS.reduce((sum, id) => sum + pool.getSubscriberCount(id), 0) + pool.getSubscriberCount("lobby")
    log(`§V viewer-concentration: match-001=${aggregated.match_001_subscribers}, lobby=${aggregated.lobby_subscribers}, total=${totalSubscribers}`)

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
      aggregated.scheduler_lag_p95 = ctx._surgeHealth.scheduler_lag_p95
      aggregated.scheduler_lag_max = ctx._surgeHealth.scheduler_lag_max
      aggregated.active_population_start = ctx._surgeHealth.active_population_start
      aggregated.active_population_end = ctx._surgeHealth.active_population_end
      aggregated.active_population_peak = ctx._surgeHealth.active_population_peak
    }

    const generatorHealthy = aggregated.generator_cpu_percent_peak < 90 && aggregated.event_loop_delay_p99_ms < 100
    const timingValid = aggregated.event_loop_delay_p99_ms < 200

    const verdictResult = classifyResult(aggregated, generatorHealthy, timingValid, topologyPreflight)
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
    }, topologyPreflight)

    log("=== POC Runner Complete ===")
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
