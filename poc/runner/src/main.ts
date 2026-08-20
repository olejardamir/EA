import { loadConfig } from "./config/experiment-config.js"
import { NchanHttpPublisher } from "./adapters/nchan-http-publisher.js"
import { SSEHttpClient } from "./adapters/sse-http-client.js"
import { BoundedMetricsRecorder } from "./adapters/metrics-recorder.js"
import { SystemClock } from "./adapters/system-clock.js"
import { CgroupResourceMonitor } from "./adapters/cgroup-resource-monitor.js"
import { MatchEventPublisher } from "./adapters/match-event-publisher.js"
import { ConnectionPool } from "./application/connection-pool.js"
import { createMatchHeadTracker } from "./domain/match-state.js"
import { WarmupScenario } from "./scenarios/warmup.js"
import { SteadyScenario } from "./scenarios/steady.js"
import { LateJoinScenario } from "./scenarios/late-join.js"
import { BurstScenario } from "./scenarios/burst.js"
import { ReconnectScenario } from "./scenarios/reconnect.js"
import { SlowConsumerScenario } from "./scenarios/slow-consumer.js"
import { aggregateWorkerMetrics, classifyResult } from "./application/result-classifier.js"
import { printSummary } from "./application/result-printer.js"
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

  const nchanPublisher = new NchanHttpPublisher(config.nchanPubUrl)
  const sseClient = new SSEHttpClient()
  const metrics = new BoundedMetricsRecorder()
  const clock = new SystemClock()
  const resourceMonitor = new CgroupResourceMonitor()
  const headTracker = createMatchHeadTracker()

  const publisher = new MatchEventPublisher({
    publisher: nchanPublisher,
    headTracker,
    burstMode: false,
  })

  const pool = new ConnectionPool(
    { subUrl: config.nchanSubUrl, matchIds: publisher.matchIds },
    metrics,
    clock,
  )

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
    log,
    sleep,
  }

  log("=== POC Runner Starting ===")
  log(`Config: ${config.workerCount} workers, ${config.targetConnections} target connections`)
  log(`Phases: warmup=${config.warmupSeconds}s, steady=${config.measureSeconds}s, burst=${config.burstSeconds}s`)

  // Phase 1: Warmup
  const warmup = new WarmupScenario(pool)
  const warmupResult = await warmup.execute(ctx)
  log(`  ${warmupResult.passed ? "PASS" : "FAIL"} ${warmupResult.name}: ${warmupResult.detail}`)

  // Phase 2: Steady
  const steady = new SteadyScenario(pool)
  const steadyResult = await steady.execute(ctx)
  log(`  ${steadyResult.passed ? "PASS" : "FAIL"} ${steadyResult.name}: ${steadyResult.detail}`)

  // Phase 2.5: Late-join (during steady, at t=10s)
  const lateJoin = new LateJoinScenario(pool)
  const lateJoinResult = await lateJoin.execute(ctx)
  log(`  ${lateJoinResult.passed ? "PASS" : "FAIL"} ${lateJoinResult.name}: ${lateJoinResult.detail}`)

  // Phase 3: Burst
  const burst = new BurstScenario()
  const burstResult = await burst.execute(ctx)
  log(`  ${burstResult.passed ? "PASS" : "FAIL"} ${burstResult.name}: ${burstResult.detail}`)

  // Phase 4: Post-burst steady
  log(`--- PHASE: POST-BURST STEADY (${config.cooldownSeconds}s) ---`)
  publisher.stop()
  await sleep(500)
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

  // Collect metrics
  log("\n--- COLLECTING METRICS ---")
  resourceMonitor.measureEventLoop()
  const resourceSnap = resourceMonitor.snapshot()

  const aggregated = aggregateWorkerMetrics([metrics])
  aggregated.event_loop_delay_p99_ms = resourceSnap.eventLoopDelayP99Ms
  aggregated.memory_mb_peak = resourceSnap.memoryMbPeak

  printSummary(aggregated, publisher.totalPublished)

  // Shutdown
  log("\nShutting down...")
  publisher.stop()
  await pool.disconnectAll()

  log("=== POC Runner Complete ===")
}

main().catch((err) => {
  console.error("Fatal error:", err)
  process.exit(1)
})
