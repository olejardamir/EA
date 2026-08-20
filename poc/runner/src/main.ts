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
import { printSummary } from "./application/result-printer.js"
import type { ScenarioContext, PhaseSnapshot } from "./scenarios/scenario.js"

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

  await waitForNchan(config.nchanPubUrl)

  const ctx: ScenarioContext = {
    publisher: publisher as any,
    eventStream: sseClient as any,
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

  const loopMonitor = setInterval(() => {
    resourceMonitor.measureEventLoop()
    resourceMonitor.measureCpu()
  }, 100)

  // Phase 1: Warmup (60% base)
  const warmup = new WarmupScenario(pool)
  const warmupResult = await warmup.execute(ctx)
  log(`  ${warmupResult.passed ? "PASS" : "FAIL"} ${warmupResult.name}: ${warmupResult.detail}`)
  const warmupSnap = publisher.snapshotAndReset()
  ctx.phaseSnapshots.push({ phase: "warmup", eventsPublished: warmupSnap.eventsPublished, byMatch: warmupSnap.byMatch, durationMs: config.warmupSeconds * 1000 })

  // Phase 2: Steady
  const steady = new SteadyScenario(pool)
  const steadyResult = await steady.execute(ctx)
  log(`  ${steadyResult.passed ? "PASS" : "FAIL"} ${steadyResult.name}: ${steadyResult.detail}`)
  const steadySnap = publisher.snapshotAndReset()
  ctx.phaseSnapshots.push({ phase: "steady", eventsPublished: steadySnap.eventsPublished, byMatch: steadySnap.byMatch, durationMs: config.measureSeconds * 1000 })

  // Phase 2.5: Late-join (during steady)
  const lateJoin = new LateJoinScenario(pool)
  const lateJoinResult = await lateJoin.execute(ctx)
  log(`  ${lateJoinResult.passed ? "PASS" : "FAIL"} ${lateJoinResult.name}: ${lateJoinResult.detail}`)

  // Phase 3: Burst
  const burst = new BurstScenario()
  const burstResult = await burst.execute(ctx)
  log(`  ${burstResult.passed ? "PASS" : "FAIL"} ${burstResult.name}: ${burstResult.detail}`)
  const burstSnap = publisher.snapshotAndReset()
  ctx.phaseSnapshots.push({ phase: "burst", eventsPublished: burstSnap.eventsPublished, byMatch: burstSnap.byMatch, durationMs: config.burstSeconds * 1000 })

  // Phase 4: Post-burst steady
  log(`--- PHASE: POST-BURST STEADY (${config.cooldownSeconds}s) ---`)
  publisher.stop()
  await sleep(500)
  publisher.burstMode = false
  publisher.start(true)
  await sleep(config.cooldownSeconds * 1000)
  log("Post-burst steady complete")
  const cooldownSnap = publisher.snapshotAndReset()
  ctx.phaseSnapshots.push({ phase: "cooldown", eventsPublished: cooldownSnap.eventsPublished, byMatch: cooldownSnap.byMatch, durationMs: config.cooldownSeconds * 1000 })

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

  // Phase 8: Nchan restart (cross-node Redis history)
  const nchanRestart = new NchanRestartScenario(config.nchanSubUrl, config.nchan2SubUrl)
  const nchanResult = await nchanRestart.execute(ctx)
  log(`  ${nchanResult.passed ? "PASS" : "FAIL"} ${nchanResult.name}: ${nchanResult.detail}`)

  clearInterval(loopMonitor)

  // Collect metrics
  log("\n--- COLLECTING METRICS ---")
  resourceMonitor.measureEventLoop()
  resourceMonitor.measureCpu()
  const resourceSnap = resourceMonitor.snapshot()

  const aggregated = aggregateWorkerMetrics([metrics], ctx.phaseSnapshots)
  aggregated.event_loop_delay_p99_ms = resourceSnap.eventLoopDelayP99Ms
  aggregated.memory_mb_peak = resourceSnap.memoryMbPeak
  aggregated.generator_cpu_percent_peak = resourceSnap.cpuPercentPeak
  aggregated.generator_event_loop_p99_ms = resourceSnap.eventLoopDelayP99Ms
  aggregated.nchan_memory_mb_peak = resourceSnap.nchanMemoryMbPeak
  aggregated.redis_memory_mb_peak = resourceSnap.redisMemoryMbPeak
  aggregated.connections_target = config.targetConnections
  aggregated.run_profile = config.runProfile
  aggregated.burst_fan_out_p95_ms = burst.burstFanOutP95Ms
  aggregated.lobby_subscribers = pool.getSubscriberCount("lobby")

  // Parse slow consumer degradation from result detail
  const degradationMatch = slowResult.detail.match(/degradation=([\d.]+)%/)
  aggregated.non_slow_p95_degradation_pct = degradationMatch ? parseFloat(degradationMatch[1]) : 0

  // Parse nchan restart result
  aggregated.nchan_restart_history_replay_correct = nchanResult.passed && !nchanResult.detail.includes("skipped")
  aggregated.nchan_restart_missing_sequences = nchanResult.detail.includes("gap=true") ? 1 : 0

  const generatorHealthy = aggregated.generator_cpu_percent_peak < 90 && aggregated.event_loop_delay_p99_ms < 100
  const timingValid = aggregated.event_loop_delay_p99_ms < 200

  const verdictResult = classifyResult(aggregated, generatorHealthy, timingValid)

  printSummary(aggregated, publisher.totalPublished, verdictResult)

  // Shutdown
  log("\nShutting down...")
  publisher.stop()
  await pool.disconnectAll()

  if ("dispose" in resourceMonitor && typeof resourceMonitor.dispose === "function") {
    resourceMonitor.dispose()
  }

  log("=== POC Runner Complete ===")
}

main().catch((err) => {
  console.error("Fatal error:", err)
  process.exit(1)
})
