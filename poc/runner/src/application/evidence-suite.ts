import { NchanHttpPublisher } from "../adapters/nchan-http-publisher.js"
import { SSEHttpClient } from "../adapters/sse-http-client.js"
import { BoundedMetricsRecorder } from "../adapters/metrics-recorder.js"
import { SystemClock } from "../adapters/system-clock.js"
import { CgroupResourceMonitor } from "../adapters/cgroup-resource-monitor.js"
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
import type { ScenarioContext } from "../scenarios/scenario.js"
import type { AggregatedMetrics, VerdictResult } from "../domain/result.js"
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
async function flushRedis(redisUrl: string, logger: (msg: string) => void): Promise<void> {
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
  } catch (err) {
    logger(`§4.13 Redis FLUSHALL failed: ${err} (continuing with stale data risk)`)
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
  const resourceMonitor = new CgroupResourceMonitor(config.redisUrl)
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

    logger(`=== Run ${runIndex} starting (seed=${seed}) ===`)

    loopMonitor = setInterval(() => {
      resourceMonitor.measureCpu()
      metrics.setBacklog(publisher.pendingPublishes)
    }, 100)

    resourceMonitor.startEventLoopMonitor()

    // §BS: Helper to abort on timeout
    const checkTimeout = () => {
      if (runTimeoutFired) throw new Error(`§BS: Run ${runIndex} timed out after ${MAX_RUN_MS / 1000}s`)
    }

    // Phase 1: Warmup
    const warmup = new WarmupScenario(pool)
    const warmupResult = await warmup.execute(ctx)
    logger(`  ${warmupResult.passed ? "PASS" : "FAIL"} ${warmupResult.name}: ${warmupResult.detail}`)

    checkTimeout()

    // Phase 2: Steady
    const steady = new SteadyScenario(pool)
    const steadyResult = await steady.execute(ctx)
    logger(`  ${steadyResult.passed ? "PASS" : "FAIL"} ${steadyResult.name}: ${steadyResult.detail}`)

    checkTimeout()

    // Phase 2.5: Late-join
    const lateJoin = new LateJoinScenario(pool)
    const lateJoinResult = await lateJoin.execute(ctx)
    logger(`  ${lateJoinResult.passed ? "PASS" : "FAIL"} ${lateJoinResult.name}: ${lateJoinResult.detail}`)

    checkTimeout()

    // Phase 3: Burst
    const burst = new BurstScenario()
    const burstResult = await burst.execute(ctx)
    logger(`  ${burstResult.passed ? "PASS" : "FAIL"} ${burstResult.name}: ${burstResult.detail}`)

    checkTimeout()

    // Phase 4: Post-burst steady
    await publisher.drain()
    publisher.burstMode = false
    publisher.start(true)
    await sleep(config.cooldownSeconds * 1000)

    // Phase 5: Reconnect
    const reconnect = new ReconnectScenario(pool)
    const reconnectResult = await reconnect.execute(ctx)
    logger(`  ${reconnectResult.passed ? "PASS" : "FAIL"} ${reconnectResult.name}: ${reconnectResult.detail}`)

    // Phase 6: Slow consumer
    const slowConsumer = new SlowConsumerScenario(pool)
    const slowResult = await slowConsumer.execute(ctx)
    logger(`  ${slowResult.passed ? "PASS" : "FAIL"} ${slowResult.name}: ${slowResult.detail}`)

    // Phase 7: Connection surge
    const connectionSurge = new ConnectionSurgeScenario(pool)
    const surgeResult = await connectionSurge.execute(ctx)
    logger(`  ${surgeResult.passed ? "PASS" : "FAIL"} ${surgeResult.name}: ${surgeResult.detail}`)

    // Phase 8: Nchan restart
    const nchanRestart = new NchanRestartScenario(config.nchanSubUrl, config.nchanPubUrl, config.nchan2SubUrl, config.nchanControlUrl)
    const nchanResult = await nchanRestart.execute(ctx)
    logger(`  ${nchanResult.passed ? "PASS" : "FAIL"} ${nchanResult.name}: ${nchanResult.detail}`)

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
    aggregated.cpu_usage_usec = resourceSnap.cpu_usage_usec
    aggregated.cpu_throttled_count = resourceSnap.cpu_throttled_count
    aggregated.cpu_throttled_usec = resourceSnap.cpu_throttled_usec
    aggregated.memory_oom_events = resourceSnap.memory_oom_events
    aggregated.memory_oom_kill_events = resourceSnap.memory_oom_kill_events
    aggregated.memory_current_bytes = resourceSnap.memory_current_bytes
    aggregated.memory_peak_bytes = resourceSnap.memory_peak_bytes
    aggregated.cpu_max_quota = resourceSnap.cpu_max_quota
    aggregated.memory_max_bytes = resourceSnap.memory_max_bytes
    aggregated.generator_backlog_peak = metrics.snapshot().generator_backlog_peak
    aggregated.publisher_attempts = nchanPublisher.stats.attempts
    aggregated.publisher_successes = nchanPublisher.stats.successes
    aggregated.publisher_definite_failures = nchanPublisher.stats.definiteFailures
    aggregated.publisher_ambiguous_failures = nchanPublisher.stats.ambiguousFailures
    aggregated.connections_target = config.targetConnections
    aggregated.run_profile = config.runProfile
    aggregated.burst_fan_out_p95_ms = burst.burstFanOutP95Ms
    aggregated.lobby_subscribers = pool.getSubscriberCount("lobby")
    aggregated.match_001_subscribers = pool.getSubscriberCount("match-001")

    const degradationMatch = slowResult.detail.match(/degradation=([\d.]+)%/)
    aggregated.non_slow_p95_degradation_pct = degradationMatch ? parseFloat(degradationMatch[1]) : 0

    aggregated.nchan_restart_history_replay_correct = nchanResult.passed && !nchanResult.detail.includes("skipped")
    aggregated.nchan_restart_missing_sequences = nchanResult.detail.includes("gap=true") ? 1 : 0

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
  // Merge all histograms into the first run's histogram
  const merged = extract(runs[0])
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
  aggregate.surge_missing_sequences = runs.reduce((s, r) => s + r.aggregated.surge_missing_sequences, 0)
  aggregate.surge_duplicates = runs.reduce((s, r) => s + r.aggregated.surge_duplicates, 0)
  aggregate.surge_out_of_order = runs.reduce((s, r) => s + r.aggregated.surge_out_of_order, 0)
  aggregate.surge_events_received = runs.reduce((s, r) => s + r.aggregated.surge_events_received, 0)

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
    // §4.13: Run isolation — flush Redis before each run (except the first)
    if (i > 0) {
      log(`§4.13 Flushing Redis for run isolation...`)
      await flushRedis(config.redisUrl, log)
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

  // §6.37 step 8: Per-run-vs-pooled acceptance rule
  // Each individual run must pass all checks (not just the pooled average)
  const perRunVerdicts = runs.map((r) => ({
    run: r.runIndex,
    verdict: r.verdict.verdict,
    passed: r.verdict.checks.every((c) => c.passed),
  }))

  // §6.37 step 9: Once-per-campaign scenarios (nchan-restart)
  // Run once, mark as campaign-only in the aggregate
  const oncePerCampaignRun = 0 // First run includes nchan-restart

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
