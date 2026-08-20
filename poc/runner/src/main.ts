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
  const resourceMonitor = new CgroupResourceMonitor(config.redisUrl)
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

    // §AD: Measure wall-clock offset between runner and Nchan.
    async function measureClockOffset(url: string, label: string): Promise<void> {
      try {
        const start = Date.now()
        const resp = await fetch(`${url}/pub/healthcheck`, { signal: AbortSignal.timeout(3000) })
        const end = Date.now()
        if (resp.ok) {
          const rtt = end - start
          log(`§AD clock-offset ${label}: RTT=${rtt}ms (max skew estimate: ${Math.round(rtt / 2)}ms)`)
        }
      } catch (err) {
        log(`§AD clock-offset ${label}: FAILED (${err})`)
      }
    }

    await measureClockOffset(config.nchanPubUrl, "nchan-1")
    if (config.nchan2SubUrl) {
      const nchan2PubUrl = config.nchan2SubUrl.replace("/sub/", "/pub/").replace(":8081", ":18080")
      await measureClockOffset(nchan2PubUrl, "nchan-2")
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

    // Phase 2: Steady — publisher already running from warm-up
    const steady = new SteadyScenario(pool)
    const steadyResult = await steady.execute(ctx)
    log(`  ${steadyResult.passed ? "PASS" : "FAIL"} ${steadyResult.name}: ${steadyResult.detail}`)

    // Phase 2.5: Late-join (during steady)
    const lateJoin = new LateJoinScenario(pool)
    const lateJoinResult = await lateJoin.execute(ctx)
    log(`  ${lateJoinResult.passed ? "PASS" : "FAIL"} ${lateJoinResult.name}: ${lateJoinResult.detail}`)

    // Phase 3: Burst
    const burst = new BurstScenario()
    const burstResult = await burst.execute(ctx)
    log(`  ${burstResult.passed ? "PASS" : "FAIL"} ${burstResult.name}: ${burstResult.detail}`)

    // Phase 4: Post-burst steady
    log(`--- PHASE: POST-BURST STEADY (${config.cooldownSeconds}s) ---`)
    await publisher.drain()
    publisher.burstMode = false
    publisher.start(true)
    await sleep(config.cooldownSeconds * 1000)
    log("Post-burst steady complete")

    // Phase 5: Reconnect
    const reconnect = new ReconnectScenario(pool)
    const reconnectResult = await reconnect.execute(ctx)
    log(`  ${reconnectResult.passed ? "PASS" : "FAIL"} ${reconnectResult.name}: ${reconnectResult.detail}`)

    // Phase 6: Slow consumer
    const slowConsumer = new SlowConsumerScenario(pool)
    const slowResult = await slowConsumer.execute(ctx)
    log(`  ${slowResult.passed ? "PASS" : "FAIL"} ${slowResult.name}: ${slowResult.detail}`)

    // Phase 7: Connection surge (+40%)
    const connectionSurge = new ConnectionSurgeScenario(pool)
    const surgeResult = await connectionSurge.execute(ctx)
    log(`  ${surgeResult.passed ? "PASS" : "FAIL"} ${surgeResult.name}: ${surgeResult.detail}`)

    // Phase 8: Nchan restart (cross-node Redis history or literal process restart)
    const nchanRestart = new NchanRestartScenario(config.nchanSubUrl, config.nchanPubUrl, config.nchan2SubUrl, config.nchanControlUrl)
    const nchanResult = await nchanRestart.execute(ctx)
    log(`  ${nchanResult.passed ? "PASS" : "FAIL"} ${nchanResult.name}: ${nchanResult.detail}`)

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

    // §BH: Wire surge existing-viewer health
    if (ctx._surgeHealth) {
      aggregated.surge_fan_out_p95_ms = ctx._surgeHealth.fan_out_p95_ms
      aggregated.surge_missing_sequences = ctx._surgeHealth.missing_sequences
      aggregated.surge_duplicates = ctx._surgeHealth.duplicates
      aggregated.surge_out_of_order = ctx._surgeHealth.out_of_order
      aggregated.surge_events_received = ctx._surgeHealth.events_received
    }

    const generatorHealthy = aggregated.generator_cpu_percent_peak < 90 && aggregated.event_loop_delay_p99_ms < 100
    const timingValid = aggregated.event_loop_delay_p99_ms < 200

    const verdictResult = classifyResult(aggregated, generatorHealthy, timingValid)
    verdictVerdict = verdictResult.verdict

    printSummary(aggregated, publisher.totalPublished, verdictResult)

    // §6.24: Emit machine-readable JSON result to stdout
    emitMachineReadableResult(aggregated, publisher.totalPublished, verdictResult, {
      targetConnections: config.targetConnections,
      seed: config.seed,
      runProfile: config.runProfile,
      warmupSeconds: config.warmupSeconds,
      measureSeconds: config.measureSeconds,
      burstSeconds: config.burstSeconds,
      cooldownSeconds: config.cooldownSeconds,
      slowConsumerFraction: config.slowConsumerFraction,
      lobbyFraction: config.lobbyFraction,
    })

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
