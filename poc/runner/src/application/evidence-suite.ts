import { NchanHttpPublisher } from "../adapters/nchan-http-publisher.js"
import { SSEHttpClient } from "../adapters/sse-http-client.js"
import { BoundedMetricsRecorder } from "../adapters/metrics-recorder.js"
import { SystemClock } from "../adapters/system-clock.js"
import { CgroupResourceMonitor, normalizeCpuPercent, baselineCpuPercent, detectContainerMode } from "../adapters/cgroup-resource-monitor.js"
import { MatchEventPublisher } from "../adapters/match-event-publisher.js"
import { ConnectionPool } from "./connection-pool.js"
import { createMatchHeadTracker } from "../domain/match-state.js"
import { createPRNG } from "../domain/prng.js"
import { MATCH_IDS } from "../domain/event.js"
import { WarmupScenario } from "../scenarios/warmup.js"
import { SteadyScenario } from "../scenarios/steady.js"
import { LateJoinScenario } from "../scenarios/late-join.js"
import { BurstScenario } from "../scenarios/burst.js"
import { ReconnectScenario } from "../scenarios/reconnect.js"
import { SlowConsumerScenario } from "../scenarios/slow-consumer.js"
import { ConnectionSurgeScenario } from "../scenarios/connection-surge.js"
import { NchanRestartScenario } from "../scenarios/nchan-restart.js"
import { aggregateWorkerMetrics, classifyResult } from "./result-classifier.js"
import { runTopologyPreflight } from "../adapters/topology-preflight.js"
import type { ScenarioContext } from "../scenarios/scenario.js"
import type { AggregatedMetrics, VerdictResult, PhaseHistogramResult } from "../domain/result.js"
import type { ExperimentConfig } from "../config/experiment-config.js"
import fs from "node:fs"
import crypto from "node:crypto"

// ─── §6.37 Evidence-suite orchestrator ────────────────────────────────
// Implements the 10-step repeated-run evidence suite.
// Milestone 2: machinery is implemented and testable.
// Milestone 3: full 3-8 run campaign executed.

export interface SingleRunResult {
  runIndex: number
  seed: number
  aggregated: AggregatedMetrics
  verdict: VerdictResult
  eventsPublished: number
  // §BA: §6.32: Streaming histograms for pooled percentile computation across runs
  rawFanOutHistogram: import("../adapters/streaming-histogram.js").StreamingHistogram
  rawLateJoinHistogram: import("../adapters/streaming-histogram.js").StreamingHistogram
}

export interface CrossRunStats {
  keyMetricCVs: Record<string, number>
  worstCV: number
  worstMetric: string
  dispersionExceeds15Pct: boolean
}

export interface EvidenceSuiteResult {
  runs: SingleRunResult[]
  aggregate: AggregatedMetrics
  crossRun: CrossRunStats
  finalVerdict: "ACCEPT" | "REJECT" | "INCONCLUSIVE"
  totalRuns: number
  dispersionStable: boolean
  perRunVerdicts: Array<{ run: number; verdict: string; passed: boolean }>
  oncePerCampaignRun: number | null
}

// ─── Frozen parameters ────────────────────────────────────────────────

export const MIN_RUNS = 3
export const MAX_RUNS = 8
export const DISPERSION_THRESHOLD = 0.15 // 15%

// §6.59: Frozen seed policy — base seed + run index
function deriveSeed(baseSeed: number, runIndex: number): number {
  return baseSeed + runIndex
}

// §4.13: Run isolation — flush Redis between runs to prevent cross-run contamination
async function flushRedis(redisUrl: string, logger: (msg: string) => void): Promise<boolean> {
  try {
    const url = new URL(redisUrl)
    const host = url.hostname || "127.0.0.1"
    const port = parseInt(url.port || "6379", 10)

    // Use Redis FLUSHALL command via TCP
    const net = await import("node:net")
    const client = net.createConnection({ host, port }, () => {
      client.write("*1\r\n$8\r\nFLUSHALL\r\n")
    })

    const result = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        client.destroy()
        reject(new Error("Redis flush timeout"))
      }, 5000)

      let data = ""
      client.on("data", (chunk) => {
        data += chunk.toString()
        clearTimeout(timeout)
        client.destroy()
        resolve(data)
      })

      client.on("error", (err) => {
        clearTimeout(timeout)
        reject(err)
      })
    })

    logger(`§4.13 Redis FLUSHALL result: ${result.trim()}`)

    // §4.13: Verify flush by checking DBSIZE
    const verifyClient = net.createConnection({ host, port }, () => {
      verifyClient.write("*1\r\n$6\r\nDBSIZE\r\n")
    })
    const verifyResult = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        verifyClient.destroy()
        reject(new Error("Redis DBSIZE timeout"))
      }, 5000)
      let data = ""
      verifyClient.on("data", (chunk) => {
        data += chunk.toString()
        clearTimeout(timeout)
        verifyClient.destroy()
        resolve(data)
      })
      verifyClient.on("error", (err) => {
        clearTimeout(timeout)
        reject(err)
      })
    })
    logger(`§4.13 Redis DBSIZE after flush: ${verifyResult.trim()}`)

    // If DBSIZE > 0 after FLUSHALL, the flush may have failed
    const sizeMatch = verifyResult.match(/\:(\d+)/)
    if (sizeMatch && parseInt(sizeMatch[1], 10) > 0) {
      logger(`§4.13 WARNING: DBSIZE=${sizeMatch[1]} after FLUSHALL — stale data risk`)
      return false
    }
    return true
  } catch (err) {
    logger(`§4.13 Redis FLUSHALL failed: ${err} (continuing with stale data risk)`)
    return false
  }
}

// ─── Per-run experiment execution ─────────────────────────────────────

function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 23)
  console.log(`[evidence-suite] [${ts}] ${msg}`)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function runSingleExperiment(
  config: ExperimentConfig,
  seed: number,
  runIndex: number,
  opts: { quiet?: boolean } = {},
): Promise<SingleRunResult> {
  const logger = opts.quiet ? () => {} : log

  const nchanPublisher = new NchanHttpPublisher(config.nchanPubUrl)
  const sseClient = new SSEHttpClient()
  const metrics = new BoundedMetricsRecorder()
  const clock = new SystemClock()
  const resourceMonitor = new CgroupResourceMonitor(config.redisUrl, config.nchanControlUrl)
  const headTracker = createMatchHeadTracker()
  const random = createPRNG(seed)

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

  const MAX_RUN_MS = 10 * 60 * 1000
  const runTimer = setTimeout(() => {
    logger(`§BS: Run ${runIndex} deadline reached — forcing shutdown`)
    // §BS: Throw instead of process.exit(2) to allow suite cleanup and INCONCLUSIVE verdict
    runTimeoutFired = true
  }, MAX_RUN_MS)
  let runTimeoutFired = false

  let loopMonitor: NodeJS.Timeout | null = null

  try {
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
      log: logger,
      sleep,
    }

    // §3.9: Capture cgroup baseline at run start — cgroup counters are cumulative over
    // container lifetime; per-run deltas = end_snapshot - start_snapshot.
    const cgroupBaseline = resourceMonitor.snapshot()

    logger(`=== Run ${runIndex} starting (seed=${seed}) ===`)

    loopMonitor = setInterval(() => {
      resourceMonitor.measureCpu()
      metrics.setBacklog(publisher.pendingPublishes)
      const lagSamples = publisher.drainSchedulerLagSamples()
      for (const ms of lagSamples) {
        metrics.recordSchedulerLag(ms)
      }
    }, 100)

    resourceMonitor.startEventLoopMonitor()

    // §BS: Helper to abort on timeout
    const checkTimeout = () => {
      if (runTimeoutFired) throw new Error(`§BS: Run ${runIndex} timed out after ${MAX_RUN_MS / 1000}s`)
    }

    // Phase 1: Warmup
    metrics.beginPhase("warmup")
    const warmup = new WarmupScenario(pool)
    const warmupResult = await warmup.execute(ctx)
    metrics.endPhase()
    logger(`  ${warmupResult.passed ? "PASS" : "FAIL"} ${warmupResult.name}: ${warmupResult.detail}`)
    const warmupSnap = publisher.snapshotAndReset()
    ctx.phaseSnapshots.push({ phase: "warmup", eventsPublished: warmupSnap.eventsPublished, byMatch: warmupSnap.byMatch, durationMs: config.warmupSeconds * 1000, lobbyPublished: warmupSnap.lobbyPublished, matchPublished: warmupSnap.matchPublished })

    checkTimeout()

    // Phase 2: Steady
    metrics.beginPhase("steady")
    const steady = new SteadyScenario(pool)
    const steadyResult = await steady.execute(ctx)
    metrics.endPhase()
    logger(`  ${steadyResult.passed ? "PASS" : "FAIL"} ${steadyResult.name}: ${steadyResult.detail}`)
    const steadySnap = publisher.snapshotAndReset()
    ctx.phaseSnapshots.push({ phase: "steady", eventsPublished: steadySnap.eventsPublished, byMatch: steadySnap.byMatch, durationMs: config.measureSeconds * 1000, lobbyPublished: steadySnap.lobbyPublished, matchPublished: steadySnap.matchPublished })

    checkTimeout()

    // Phase 3: Connection surge 60% -> 100% (§4.4: surge before peak scenarios)
    metrics.beginPhase("surge")
    const connectionSurge = new ConnectionSurgeScenario(pool)
    const surgeResult = await connectionSurge.execute(ctx)
    metrics.endPhase()
    logger(`  ${surgeResult.passed ? "PASS" : "FAIL"} ${surgeResult.name}: ${surgeResult.detail}`)
    const surgeSnap = publisher.snapshotAndReset()
    ctx.phaseSnapshots.push({ phase: "surge", eventsPublished: surgeSnap.eventsPublished, byMatch: surgeSnap.byMatch, durationMs: ctx._surgeHealth?.surge_elapsed_ms ?? 0, lobbyPublished: surgeSnap.lobbyPublished, matchPublished: surgeSnap.matchPublished })

    checkTimeout()

    // Phase 4: Post-surge stabilization
    metrics.beginPhase("post-surge")
    await sleep(config.cooldownSeconds * 1000)
    metrics.endPhase()

    // Phase 5: Late-join under peak load
    metrics.beginPhase("late-join")
    const lateJoinStart = ctx.clock.now()
    const lateJoin = new LateJoinScenario(pool)
    const lateJoinResult = await lateJoin.execute(ctx)
    const lateJoinDuration = ctx.clock.now() - lateJoinStart
    metrics.endPhase()
    logger(`  ${lateJoinResult.passed ? "PASS" : "FAIL"} ${lateJoinResult.name}: ${lateJoinResult.detail}`)
    const lateJoinSnap = publisher.snapshotAndReset()
    ctx.phaseSnapshots.push({ phase: "late-join", eventsPublished: lateJoinSnap.eventsPublished, byMatch: lateJoinSnap.byMatch, durationMs: lateJoinDuration, lobbyPublished: lateJoinSnap.lobbyPublished, matchPublished: lateJoinSnap.matchPublished })

    checkTimeout()

    // Phase 6: Burst at peak
    metrics.beginPhase("burst")
    const burst = new BurstScenario()
    const burstResult = await burst.execute(ctx)
    metrics.endPhase()
    logger(`  ${burstResult.passed ? "PASS" : "FAIL"} ${burstResult.name}: ${burstResult.detail}`)
    const burstSnap = publisher.snapshotAndReset()
    ctx.phaseSnapshots.push({ phase: "burst", eventsPublished: burstSnap.eventsPublished, byMatch: burstSnap.byMatch, durationMs: config.burstSeconds * 1000, lobbyPublished: burstSnap.lobbyPublished, matchPublished: burstSnap.matchPublished })

    checkTimeout()

    // Phase 7: Post-burst steady
    metrics.beginPhase("post-burst")
    await publisher.drain()
    publisher.burstMode = false
    publisher.start(true)
    await sleep(config.cooldownSeconds * 1000)
    metrics.endPhase()
    const postBurstSnap = publisher.snapshotAndReset()
    ctx.phaseSnapshots.push({ phase: "post-burst", eventsPublished: postBurstSnap.eventsPublished, byMatch: postBurstSnap.byMatch, durationMs: config.cooldownSeconds * 1000, lobbyPublished: postBurstSnap.lobbyPublished, matchPublished: postBurstSnap.matchPublished })

    // Phase 8: Reconnect while publishing
    metrics.beginPhase("reconnect")
    const reconnectStart = ctx.clock.now()
    const reconnect = new ReconnectScenario(pool)
    const reconnectResult = await reconnect.execute(ctx)
    const reconnectDuration = ctx.clock.now() - reconnectStart
    metrics.endPhase()
    logger(`  ${reconnectResult.passed ? "PASS" : "FAIL"} ${reconnectResult.name}: ${reconnectResult.detail}`)
    const reconnectSnap = publisher.snapshotAndReset()
    ctx.phaseSnapshots.push({ phase: "reconnect", eventsPublished: reconnectSnap.eventsPublished, byMatch: reconnectSnap.byMatch, durationMs: reconnectDuration, lobbyPublished: reconnectSnap.lobbyPublished, matchPublished: reconnectSnap.matchPublished })

    // Phase 9: Slow consumer / backpressure at frozen concurrency
    metrics.beginPhase("slow-consumer")
    const slowConsumerStart = ctx.clock.now()
    const slowConsumer = new SlowConsumerScenario(pool)
    const slowResult = await slowConsumer.execute(ctx)
    const slowConsumerDuration = ctx.clock.now() - slowConsumerStart
    metrics.endPhase()
    logger(`  ${slowResult.passed ? "PASS" : "FAIL"} ${slowResult.name}: ${slowResult.detail}`)
    const slowSnap = publisher.snapshotAndReset()
    ctx.phaseSnapshots.push({ phase: "slow-consumer", eventsPublished: slowSnap.eventsPublished, byMatch: slowSnap.byMatch, durationMs: slowConsumerDuration, lobbyPublished: slowSnap.lobbyPublished, matchPublished: slowSnap.matchPublished })

    // Phase 10: Nchan restart — §6.37 step 9: once-per-campaign scenario
    // Only execute on the first run; subsequent runs reuse the first run's result.
    let nchanResult: { name: string; passed: boolean; detail: string }
    const restartStart = ctx.clock.now()
    if (runIndex === 0) {
      const nchanRestart = new NchanRestartScenario(config.nchanSubUrl, config.nchanPubUrl, config.nchan2SubUrl, config.nchanControlUrl)
      nchanResult = await nchanRestart.execute(ctx)
    } else {
      // §6.37 step 9: Skip on subsequent runs — the restart scenario is once-per-campaign
      nchanResult = { name: "nchan-restart", passed: true, detail: "skipped (once-per-campaign, run 0 only)" }
    }
    const restartDuration = ctx.clock.now() - restartStart
    logger(`  ${nchanResult.passed ? "PASS" : "FAIL"} ${nchanResult.name}: ${nchanResult.detail}`)
    const restartSnap = publisher.snapshotAndReset()
    ctx.phaseSnapshots.push({ phase: "nchan-restart", eventsPublished: restartSnap.eventsPublished, byMatch: restartSnap.byMatch, durationMs: restartDuration, lobbyPublished: restartSnap.lobbyPublished, matchPublished: restartSnap.matchPublished })

    // Collect metrics
    resourceMonitor.stopEventLoopMonitor()
    resourceMonitor.measureCpu()
    const resourceSnap = resourceMonitor.snapshot()

    // §BA: §6.32: Capture streaming histograms for pooled percentile computation
    const rawFanOut = metrics.getFanOutHistogram()
    const rawLateJoin = metrics.getLateJoinHistogram()

    const aggregated = aggregateWorkerMetrics([metrics], ctx.phaseSnapshots)
    aggregated.event_loop_delay_p99_ms = resourceSnap.eventLoopDelayP99Ms
    aggregated.memory_mb_peak = resourceSnap.memoryMbPeak
    aggregated.generator_cpu_percent_peak = resourceSnap.cpuPercentPeak
    aggregated.generator_event_loop_p99_ms = resourceSnap.eventLoopDelayP99Ms
    aggregated.nchan_memory_mb_peak = resourceSnap.nchanMemoryMbPeak
    aggregated.redis_memory_mb_peak = resourceSnap.redisMemoryMbPeak
    // §3.9: Per-run cgroup deltas — cgroup counters are cumulative over container lifetime;
    // subtract the baseline captured at run start to get the per-run delta.
    aggregated.cpu_usage_usec = (resourceSnap.cpu_usage_usec ?? 0) - (cgroupBaseline.cpu_usage_usec ?? 0)
    aggregated.cpu_throttled_count = (resourceSnap.cpu_throttled_count ?? 0) - (cgroupBaseline.cpu_throttled_count ?? 0)
    aggregated.cpu_throttled_usec = (resourceSnap.cpu_throttled_usec ?? 0) - (cgroupBaseline.cpu_throttled_usec ?? 0)
    aggregated.memory_oom_events = (resourceSnap.memory_oom_events ?? 0) - (cgroupBaseline.memory_oom_events ?? 0)
    aggregated.memory_oom_kill_events = (resourceSnap.memory_oom_kill_events ?? 0) - (cgroupBaseline.memory_oom_kill_events ?? 0)
    aggregated.memory_current_bytes = resourceSnap.memory_current_bytes
    aggregated.memory_peak_bytes = resourceSnap.memory_peak_bytes
    aggregated.cpu_max_quota = resourceSnap.cpu_max_quota
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
    aggregated.nchan_memory_oom_events = resourceSnap.nchan_memory_oom_events !== null && cgroupBaseline.nchan_memory_oom_events !== null
      ? resourceSnap.nchan_memory_oom_events - cgroupBaseline.nchan_memory_oom_events
      : resourceSnap.nchan_memory_oom_events
    aggregated.nchan_memory_oom_kill_events = resourceSnap.nchan_memory_oom_kill_events !== null && cgroupBaseline.nchan_memory_oom_kill_events !== null
      ? resourceSnap.nchan_memory_oom_kill_events - cgroupBaseline.nchan_memory_oom_kill_events
      : resourceSnap.nchan_memory_oom_kill_events
    aggregated.redis_connected_clients_peak = resourceSnap.redis_connected_clients_peak
    // §3.8/§3.16: Nchan/Redis CPU percent peaks — evidence suite parity
    aggregated.nchan_cpu_percent_peak = resourceSnap.nchan_cpu_percent_peak
    aggregated.redis_cpu_percent_peak = resourceSnap.redis_cpu_percent_peak
    // §3.9: Normalized CPU percent peaks — divide raw per-core % by core count
    const cpuLimitCores = resourceSnap.cpu_max_quota !== null ? resourceSnap.cpu_max_quota / 100_000 : null
    const containerMode = detectContainerMode(resourceSnap.cpu_max_quota)
    aggregated.resource_cpu_percent_peak = normalizeCpuPercent(resourceSnap.cpuPercentPeak, cpuLimitCores)
    aggregated.resource_cpu_baseline = baselineCpuPercent(containerMode)
    aggregated.nchan_resource_cpu_percent_peak = normalizeCpuPercent(resourceSnap.nchan_cpu_percent_peak, cpuLimitCores)
    aggregated.redis_resource_cpu_percent_peak = normalizeCpuPercent(resourceSnap.redis_cpu_percent_peak, cpuLimitCores)
    // §3.16: Phase histograms — evidence suite parity with single-run path
    const phaseHists = metrics.snapshotPhaseHistograms()
    aggregated.phase_histograms = phaseHists
    // §4.2: Topology capacity
    const topologyPreflight = runTopologyPreflight(config.targetConnections)
    aggregated.topology_capacity_sufficient = topologyPreflight.capacity_sufficient
    aggregated.generator_backlog_peak = metrics.snapshot().generator_backlog_peak
    aggregated.publisher_attempts = nchanPublisher.stats.attempts
    aggregated.publisher_successes = nchanPublisher.stats.successes
    aggregated.publisher_definite_failures = nchanPublisher.stats.definiteFailures
    aggregated.publisher_ambiguous_failures = nchanPublisher.stats.ambiguousFailures
    aggregated.connections_target = config.targetConnections
    aggregated.run_profile = config.runProfile
    aggregated.burst_fan_out_p95_ms = burst.burstFanOutP95Ms

    // §3.16: Build identity — evidence suite parity
    aggregated.build_identity = {
      git_commit_sha: process.env.GIT_COMMIT_SHA ?? null,
      nginx_version: "1.27.4",
      nchan_version: "1.3.8",
      node_version: process.version,
      redis_version: "7.2",
    }
    aggregated.lobby_subscribers = pool.getSubscriberCount("lobby")
    aggregated.match_001_subscribers = pool.getSubscriberCount("match-001")
    aggregated.match_002_subscribers = pool.getSubscriberCount("match-002")
    aggregated.match_003_subscribers = pool.getSubscriberCount("match-003")
    aggregated.match_004_subscribers = pool.getSubscriberCount("match-004")
    aggregated.match_005_subscribers = pool.getSubscriberCount("match-005")
    aggregated.match_006_subscribers = pool.getSubscriberCount("match-006")
    aggregated.match_007_subscribers = pool.getSubscriberCount("match-007")
    aggregated.match_008_subscribers = pool.getSubscriberCount("match-008")

    const degradationMatch = slowResult.detail.match(/degradation=([\d.]+)%/)
    aggregated.non_slow_p95_degradation_pct = degradationMatch ? parseFloat(degradationMatch[1]) : 0

    aggregated.nchan_restart_history_replay_correct = nchanResult.passed && !nchanResult.detail.includes("skipped")
    aggregated.nchan_restart_missing_sequences = nchanResult.detail.includes("gap=true") ? 1 : 0
    aggregated.nchan_restart_skipped = nchanResult.detail.includes("skipped")

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

    // §R: Wire active connections peak from metrics recorder
    aggregated.active_connections_peak = metrics.snapshot().active_connections_peak ?? 0
    // §4.7: Wire slow-consumer metrics from scenario
    aggregated.slow_consumer_metrics = slowConsumer.slowMetrics

    // §3.12/§4.15: Clock validity evidence — shared-kernel-clock model
    // Same-host containers share the Linux kernel clock; offset is 0.
    // Only fails if a Nchan node is unreachable (can't verify clock sharing).
    let nchan1Reachable = false
    let nchan2Reachable = false
    try {
      const resp1 = await fetch(`${config.nchanPubUrl}/pub/healthcheck`, { signal: AbortSignal.timeout(3000) })
      nchan1Reachable = resp1.ok
    } catch {}
    if (config.nchan2SubUrl) {
      const nchan2PubUrl = config.nchan2SubUrl.replace("/sub/", "/pub/").replace(":8081", ":18080")
      try {
        const resp2 = await fetch(`${nchan2PubUrl}/pub/healthcheck`, { signal: AbortSignal.timeout(3000) })
        nchan2Reachable = resp2.ok
      } catch {}
    }
    const clockPassed = nchan1Reachable && (config.nchan2SubUrl ? nchan2Reachable : true)
    aggregated.clock_validity = {
      clock_model: "same-host-kernel-clock",
      nodes_covered: config.nchan2SubUrl ? ["nchan1", "nchan2"] : ["nchan1"],
      measurement_method: "same-host-kernel-clock",
      offset_or_guarantee: 0,
      uncertainty_ms: 0,
      threshold_ms: 0,
      validity_result: clockPassed ? "PASS" : "INCONCLUSIVE",
      nchan1_reachable: nchan1Reachable,
      nchan2_reachable: nchan2Reachable,
    }

    const generatorHealthy = aggregated.generator_cpu_percent_peak < 90 && aggregated.event_loop_delay_p99_ms < 100
    const timingValid = aggregated.event_loop_delay_p99_ms < 200

    const verdictResult = classifyResult(aggregated, generatorHealthy, timingValid, topologyPreflight)

    logger(`=== Run ${runIndex} complete: ${verdictResult.verdict} ===`)

    return {
      runIndex,
      seed,
      aggregated,
      verdict: verdictResult,
      eventsPublished: publisher.totalPublished,
      rawFanOutHistogram: rawFanOut,
      rawLateJoinHistogram: rawLateJoin,
    }
  } finally {
    clearTimeout(runTimer)
    if (loopMonitor) clearInterval(loopMonitor)
    await publisher.drain()
    await pool.disconnectAll().catch(() => {})
    if ("dispose" in resourceMonitor && typeof resourceMonitor.dispose === "function") {
      resourceMonitor.dispose()
    }
  }
}

// ─── Cross-run dispersion ─────────────────────────────────────────────

// §6.59: Frozen variance formula — coefficient of variation (stddev/mean)
// §BA: For percentile metrics, pool all raw samples and recompute percentile.

const KEY_METRICS: Array<{ key: string; extract: (m: AggregatedMetrics) => number }> = [
  { key: "fan_out_latency_p95_ms", extract: (m) => m.fan_out_latency_p95_ms },
  { key: "fan_out_latency_p99_ms", extract: (m) => m.fan_out_latency_p99_ms },
  { key: "late_join_p95_ms", extract: (m) => m.late_join_p95_ms },
  { key: "burst_fan_out_p95_ms", extract: (m) => m.burst_fan_out_p95_ms },
  { key: "events_received", extract: (m) => m.events_received },
  { key: "missing_sequences", extract: (m) => m.missing_sequences },
  { key: "duplicates", extract: (m) => m.duplicates },
  { key: "out_of_order", extract: (m) => m.out_of_order },
]

export function computeCV(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  if (mean === 0) return 0
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance) / Math.abs(mean)
}

export function computeCrossRunStats(runs: SingleRunResult[]): CrossRunStats {
  const keyMetricCVs: Record<string, number> = {}
  let worstCV = 0
  let worstMetric = ""

  for (const km of KEY_METRICS) {
    const values = runs.map((r) => km.extract(r.aggregated))
    const cv = computeCV(values)
    keyMetricCVs[km.key] = cv
    if (cv > worstCV) {
      worstCV = cv
      worstMetric = km.key
    }
  }

  return {
    keyMetricCVs,
    worstCV,
    worstMetric,
    dispersionExceeds15Pct: worstCV > DISPERSION_THRESHOLD,
  }
}

// ─── Pooled percentile computation ────────────────────────────────────

// §BA: §6.32: Pool all streaming histograms across runs, recompute percentile.
// This avoids the pitfall of averaging percentiles and preserves the full distribution.

function poolPercentileFromHistograms(
  runs: SingleRunResult[],
  extract: (r: SingleRunResult) => import("../adapters/streaming-histogram.js").StreamingHistogram,
  p: number,
): number {
  if (runs.length === 0) return 0
  // §3.23: Clone the first histogram to avoid mutating run-0's original data
  const merged = extract(runs[0]).clone()
  for (let i = 1; i < runs.length; i++) {
    merged.merge(extract(runs[i]))
  }
  return merged.percentile(p)
}

// ─── Aggregate across runs ────────────────────────────────────────────

function aggregateRuns(runs: SingleRunResult[]): AggregatedMetrics {
  if (runs.length === 0) throw new Error("Cannot aggregate zero runs")

  const first = runs[0].aggregated
  const aggregate = { ...first }

  // For counters, sum across runs
  aggregate.events_published = runs.reduce((s, r) => s + r.eventsPublished, 0)
  aggregate.events_received = runs.reduce((s, r) => s + r.aggregated.events_received, 0)
  aggregate.missing_sequences = runs.reduce((s, r) => s + r.aggregated.missing_sequences, 0)
  aggregate.duplicates = runs.reduce((s, r) => s + r.aggregated.duplicates, 0)
  aggregate.out_of_order = runs.reduce((s, r) => s + r.aggregated.out_of_order, 0)
  aggregate.connections_attempted = runs.reduce((s, r) => s + r.aggregated.connections_attempted, 0)
  aggregate.connections_established = runs.reduce((s, r) => s + r.aggregated.connections_established, 0)
  aggregate.connection_failures = runs.reduce((s, r) => s + r.aggregated.connection_failures, 0)
  aggregate.connections_dropped = runs.reduce((s, r) => s + r.aggregated.connections_dropped, 0)
  aggregate.publisher_attempts = runs.reduce((s, r) => s + r.aggregated.publisher_attempts, 0)
  aggregate.publisher_successes = runs.reduce((s, r) => s + r.aggregated.publisher_successes, 0)
  aggregate.publisher_definite_failures = runs.reduce((s, r) => s + r.aggregated.publisher_definite_failures, 0)
  aggregate.publisher_ambiguous_failures = runs.reduce((s, r) => s + r.aggregated.publisher_ambiguous_failures, 0)
  aggregate.sse_parse_errors = runs.reduce((s, r) => s + r.aggregated.sse_parse_errors, 0)
  aggregate.json_parse_errors = runs.reduce((s, r) => s + r.aggregated.json_parse_errors, 0)
  aggregate.invalid_timestamp_count = runs.reduce((s, r) => s + r.aggregated.invalid_timestamp_count, 0)
  // §4.19: Schema validation error accounting
  aggregate.schema_validation_errors = runs.reduce((s, r) => s + r.aggregated.schema_validation_errors, 0)
  aggregate.missing_transport_id = runs.reduce((s, r) => s + r.aggregated.missing_transport_id, 0)
  aggregate.surge_missing_sequences = runs.reduce((s, r) => s + r.aggregated.surge_missing_sequences, 0)
  aggregate.surge_duplicates = runs.reduce((s, r) => s + r.aggregated.surge_duplicates, 0)
  aggregate.surge_out_of_order = runs.reduce((s, r) => s + r.aggregated.surge_out_of_order, 0)
  aggregate.surge_events_received = runs.reduce((s, r) => s + r.aggregated.surge_events_received, 0)
  // §4.17: Disconnect attribution
  aggregate.deliberate_disconnects = runs.reduce((s, r) => s + r.aggregated.deliberate_disconnects, 0)
  aggregate.unexpected_client_disconnects = runs.reduce((s, r) => s + r.aggregated.unexpected_client_disconnects, 0)
  aggregate.server_initiated_disconnects = runs.reduce((s, r) => s + r.aggregated.server_initiated_disconnects, 0)
  aggregate.network_failures = runs.reduce((s, r) => s + r.aggregated.network_failures, 0)
  aggregate.shutdown_cleanup_disconnects = runs.reduce((s, r) => s + r.aggregated.shutdown_cleanup_disconnects, 0)
  // §3.23: Replay/live-vs-replay delivery fields must be summed across runs
  aggregate.live_expected_deliveries = runs.reduce((s, r) => s + r.aggregated.live_expected_deliveries, 0)
  aggregate.live_received_deliveries = runs.reduce((s, r) => s + r.aggregated.live_received_deliveries, 0)
  aggregate.late_join_history_expected = runs.reduce((s, r) => s + r.aggregated.late_join_history_expected, 0)
  aggregate.late_join_history_received = runs.reduce((s, r) => s + r.aggregated.late_join_history_received, 0)
  aggregate.reconnect_replay_expected = runs.reduce((s, r) => s + r.aggregated.reconnect_replay_expected, 0)
  aggregate.reconnect_replay_received = runs.reduce((s, r) => s + r.aggregated.reconnect_replay_received, 0)
  aggregate.restart_replay_expected = runs.reduce((s, r) => s + r.aggregated.restart_replay_expected, 0)
  aggregate.restart_replay_received = runs.reduce((s, r) => s + r.aggregated.restart_replay_received, 0)

  // §BA: §6.32: For percentiles, pool streaming histograms and recompute
  aggregate.fan_out_latency_p95_ms = poolPercentileFromHistograms(runs, (r) => r.rawFanOutHistogram, 95)
  aggregate.fan_out_latency_p99_ms = poolPercentileFromHistograms(runs, (r) => r.rawFanOutHistogram, 99)
  aggregate.late_join_p95_ms = poolPercentileFromHistograms(runs, (r) => r.rawLateJoinHistogram, 95)

  // For peaks, take max across runs
  aggregate.fan_out_latency_max_ms = Math.max(...runs.map((r) => r.aggregated.fan_out_latency_max_ms))
  aggregate.late_join_max_ms = Math.max(...runs.map((r) => r.aggregated.late_join_max_ms))
  aggregate.generator_backlog_peak = Math.max(...runs.map((r) => r.aggregated.generator_backlog_peak))
  aggregate.memory_mb_peak = Math.max(...runs.map((r) => r.aggregated.memory_mb_peak))
  aggregate.generator_cpu_percent_peak = Math.max(...runs.map((r) => r.aggregated.generator_cpu_percent_peak))
  // §3.23: Active connections peak and scheduler lag must also use max across runs
  aggregate.active_connections_peak = Math.max(...runs.map((r) => r.aggregated.active_connections_peak))
  aggregate.scheduler_lag_p95 = Math.max(...runs.map((r) => r.aggregated.scheduler_lag_p95))
  aggregate.surge_scheduler_lag_p95 = Math.max(...runs.map((r) => r.aggregated.surge_scheduler_lag_p95))
  aggregate.surge_failures = Math.max(...runs.map((r) => r.aggregated.surge_failures))
  // §3.23: Surge timing/rate fields — max for peaks, sum for counts
  aggregate.surge_target_additions = runs.reduce((s, r) => s + r.aggregated.surge_target_additions, 0)
  aggregate.surge_attempted = runs.reduce((s, r) => s + r.aggregated.surge_attempted, 0)
  aggregate.surge_established = runs.reduce((s, r) => s + r.aggregated.surge_established, 0)
  aggregate.attempt_rate_peak = Math.max(...runs.map((r) => r.aggregated.attempt_rate_peak))
  aggregate.establishment_rate_peak = Math.max(...runs.map((r) => r.aggregated.establishment_rate_peak))
  aggregate.scheduler_lag_max = Math.max(...runs.map((r) => r.aggregated.scheduler_lag_max))
  aggregate.surge_scheduler_lag_max = Math.max(...runs.map((r) => r.aggregated.surge_scheduler_lag_max))
  aggregate.active_population_peak = Math.max(...runs.map((r) => r.aggregated.active_population_peak))
  aggregate.surge_timing_error_ms = Math.max(...runs.map((r) => r.aggregated.surge_timing_error_ms))
  // §3.9/§3.16: Nchan/Redis CPU percent peaks — null in ANY run means unavailable → campaign INCONCLUSIVE
  // Do NOT convert null to 0; preserve null so classifier can detect mandatory metric absence.
  const anyNchanCpuNull = runs.some((r) => r.aggregated.nchan_cpu_percent_peak === null)
  const anyRedisCpuNull = runs.some((r) => r.aggregated.redis_cpu_percent_peak === null)
  aggregate.nchan_cpu_percent_peak = anyNchanCpuNull
    ? null
    : Math.max(...runs.map((r) => r.aggregated.nchan_cpu_percent_peak as number))
  aggregate.redis_cpu_percent_peak = anyRedisCpuNull
    ? null
    : Math.max(...runs.map((r) => r.aggregated.redis_cpu_percent_peak as number))
  // §3.9: Normalized CPU percent peaks — max across runs
  const anyResourceCpuNull = runs.some((r) => r.aggregated.resource_cpu_percent_peak === null)
  aggregate.resource_cpu_percent_peak = anyResourceCpuNull
    ? null
    : Math.max(...runs.map((r) => r.aggregated.resource_cpu_percent_peak as number))
  aggregate.resource_cpu_baseline = runs.length > 0 ? runs[0].aggregated.resource_cpu_baseline : null
  const anyNchanResourceCpuNull = runs.some((r) => r.aggregated.nchan_resource_cpu_percent_peak === null)
  aggregate.nchan_resource_cpu_percent_peak = anyNchanResourceCpuNull
    ? null
    : Math.max(...runs.map((r) => r.aggregated.nchan_resource_cpu_percent_peak as number))
  const anyRedisResourceCpuNull = runs.some((r) => r.aggregated.redis_resource_cpu_percent_peak === null)
  aggregate.redis_resource_cpu_percent_peak = anyRedisResourceCpuNull
    ? null
    : Math.max(...runs.map((r) => r.aggregated.redis_resource_cpu_percent_peak as number))
  // §3.23: Latency invalid/overflow counts sum across runs
  aggregate.latency_invalid_count = runs.reduce((s, r) => s + r.aggregated.latency_invalid_count, 0)
  aggregate.latency_overflow_count = runs.reduce((s, r) => s + r.aggregated.latency_overflow_count, 0)

  return aggregate
}

// ─── Main orchestrator ────────────────────────────────────────────────

export async function runEvidenceSuite(
  config: ExperimentConfig,
  opts: { maxRuns?: number; quiet?: boolean } = {},
): Promise<EvidenceSuiteResult> {
  const maxRuns = opts.maxRuns ?? MAX_RUNS
  const runs: SingleRunResult[] = []

  log(`§6.37 Evidence-suite orchestrator starting (min=${MIN_RUNS}, max=${maxRuns})`)

  for (let i = 0; i < maxRuns; i++) {
    // §3.10: Run isolation — flush Redis before EVERY qualifying run (including first)
    {
      log(`§4.13 Flushing Redis for run isolation (run ${i})...`)
      const flushOk = await flushRedis(config.redisUrl, log)
      if (!flushOk) {
        log(`§4.13 Redis flush verification FAILED — run isolation compromised, aborting suite`)
        return {
          runs,
          aggregate: runs.length > 0 ? aggregateRuns(runs) : ({} as AggregatedMetrics),
          crossRun: { keyMetricCVs: {}, worstCV: 0, worstMetric: "", dispersionExceeds15Pct: true },
          finalVerdict: "INCONCLUSIVE",
          totalRuns: runs.length,
          dispersionStable: false,
          perRunVerdicts: [],
          oncePerCampaignRun: null,
        }
      }
    }

    const seed = deriveSeed(config.seed, i)
    log(`─── Run ${i + 1}/${maxRuns} (seed=${seed}) ───`)

    const result = await runSingleExperiment(config, seed, i, opts)
    runs.push(result)

    log(`Run ${i + 1}: ${result.verdict.verdict} (${result.verdict.checks.filter((c) => c.passed).length}/${result.verdict.checks.length} checks passed)`)

    // After minimum runs, check dispersion
    if (runs.length >= MIN_RUNS) {
      const stats = computeCrossRunStats(runs)
      log(`Cross-run dispersion: worst=${stats.worstMetric} CV=${(stats.worstCV * 100).toFixed(1)}%`)

      if (!stats.dispersionExceeds15Pct) {
        log(`Dispersion stable (${(stats.worstCV * 100).toFixed(1)}% < 15%) — stopping at ${runs.length} runs`)
        break
      }

      if (i === maxRuns - 1) {
        log(`Dispersion unstable after ${maxRuns} runs — marking INCONCLUSIVE`)
      }
    }
  }

  // Compute aggregate and cross-run stats
  const aggregate = aggregateRuns(runs)
  const crossRun = computeCrossRunStats(runs)

  // §3.12: Propagate clock validity from first run (all runs use same Docker host)
  if (runs.length > 0 && runs[0].aggregated.clock_validity) {
    aggregate.clock_validity = runs[0].aggregated.clock_validity
  }

  // §6.37 step 8: Per-run-vs-pooled acceptance rule
  // Each individual run must pass all checks (not just the pooled average)
  const perRunVerdicts = runs.map((r) => ({
    run: r.runIndex,
    verdict: r.verdict.verdict,
    passed: r.verdict.checks.every((c) => c.passed),
  }))

  // §6.37 step 9: Once-per-campaign scenarios (nchan-restart)
  // The restart scenario only executes on the first run (runIndex=0)
  const oncePerCampaignRun = 0

  // Final verdict
  let finalVerdict: "ACCEPT" | "REJECT" | "INCONCLUSIVE"
  if (crossRun.dispersionExceeds15Pct) {
    finalVerdict = "INCONCLUSIVE"
  } else if (perRunVerdicts.every((v) => v.verdict === "ACCEPT")) {
    finalVerdict = "ACCEPT"
  } else if (perRunVerdicts.some((v) => v.verdict === "REJECT")) {
    finalVerdict = "REJECT"
  } else {
    finalVerdict = "INCONCLUSIVE"
  }

  // §3.10: Campaign-level restart gate — the once-per-campaign restart result must PASS independently.
  // This is separate from per-run gating; even if all per-run verdicts are ACCEPT,
  // a failed campaign-level restart overrides to INCONCLUSIVE.
  const run0Result = runs[0]
  if (run0Result && !run0Result.aggregated.nchan_restart_history_replay_correct) {
    log(`§3.10 Campaign restart gate: INCONCLUSIVE — run 0 nchan_restart_history_replay_correct=false`)
    finalVerdict = "INCONCLUSIVE"
  }

  log(`§6.37 Evidence suite complete: ${finalVerdict} (${runs.length} runs, dispersion=${(crossRun.worstCV * 100).toFixed(1)}%)`)

  return {
    runs,
    aggregate,
    crossRun,
    finalVerdict,
    totalRuns: runs.length,
    dispersionStable: !crossRun.dispersionExceeds15Pct,
    perRunVerdicts,
    oncePerCampaignRun,
  }
}

// ─── Persistence ──────────────────────────────────────────────────────

export function persistEvidenceSuite(result: EvidenceSuiteResult, path: string): string {
  const json = JSON.stringify(result, null, 2)
  fs.writeFileSync(path, json, "utf-8")
  return path
}

export function computeSuiteDigest(result: EvidenceSuiteResult): string {
  const canonical = JSON.stringify({
    totalRuns: result.totalRuns,
    finalVerdict: result.finalVerdict,
    dispersionStable: result.dispersionStable,
    perRunVerdicts: result.perRunVerdicts,
  })
  return crypto.createHash("sha256").update(canonical).digest("hex")
}
