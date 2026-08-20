import type { Scenario, ScenarioContext } from "./scenario.js"
import type { ConnectionPool } from "../application/connection-pool.js"

export class ConnectionSurgeScenario implements Scenario {
  name = "connection-surge"
  private pool: ConnectionPool

  constructor(pool: ConnectionPool) {
    this.pool = pool
  }

  async execute(ctx: ScenarioContext): Promise<{ name: string; passed: boolean; detail: string }> {
    ctx.log("--- PHASE: CONNECTION SURGE (+40% over 120s) ---")

    const totalTarget = ctx.config.targetConnections
    const baseCount = this.pool.size
    const surgeCount = totalTarget - baseCount
    const surgeDurationMs = 120_000

    ctx.log(`Current pool: ${baseCount}, surge target: +${surgeCount} over ${surgeDurationMs / 1000}s`)

    if (surgeCount <= 0) {
      ctx.log("Pool already at or above target, skipping surge")
      return { name: this.name, passed: true, detail: `skipped (pool ${baseCount} >= target ${totalTarget})` }
    }

    const attemptsBefore = ctx.metrics.snapshot().connections_attempted
    const establishedBefore = ctx.metrics.snapshot().connections_established
    const failuresBefore = ctx.metrics.snapshot().connection_failures

    const snapBefore = ctx.metrics.snapshot()
    const missingBefore = snapBefore.missing_sequences
    const duplicatesBefore = snapBefore.duplicates
    const outOfOrderBefore = snapBefore.out_of_order
    const eventsReceivedBefore = snapBefore.events_received
    const fanOutBefore = snapBefore.fan_out_latencies_ms.length

    const surgeStartTime = ctx.clock.now()
    const deadline = surgeStartTime + surgeDurationMs
    const batchSize = Math.ceil(surgeCount / 24)
    const batchIntervalMs = surgeDurationMs / 24

    // §4.5: Rate tracking for peaks
    let attemptRatePeak = 0
    let establishmentRatePeak = 0
    let schedulerLagP95 = 0
    let schedulerLagMax = 0
    const schedulerLags: number[] = []

    let batch = 0
    let totalAttempted = 0
    let totalEstablished = 0
    let batchStartTime = ctx.clock.now()

    while (batch < 24) {
      const remaining = surgeCount - (batch * batchSize)
      const count = Math.min(batchSize, remaining)

      if (count <= 0) break

      const targetTime = surgeStartTime + (batch + 1) * batchIntervalMs
      const actualStartTime = ctx.clock.now()

      ctx.log(`Surge batch ${batch + 1}/24: adding ${count} connections (pool size: ${this.pool.size})`)
      await this.pool.connectAll(ctx.eventStream, count, this.pool.size, undefined, ctx.config.lobbyFraction)

      const actualEndTime = ctx.clock.now()
      const batchElapsed = actualEndTime - actualStartTime
      const schedulerLag = actualEndTime - targetTime
      schedulerLags.push(schedulerLag)
      schedulerLagMax = Math.max(schedulerLagMax, Math.abs(schedulerLag))

      // Calculate rates for this batch
      if (batchElapsed > 0) {
        const batchAttemptRate = (count / batchElapsed) * 1000
        const batchEstablishRate = (count / batchElapsed) * 1000
        attemptRatePeak = Math.max(attemptRatePeak, batchAttemptRate)
        establishmentRatePeak = Math.max(establishmentRatePeak, batchEstablishRate)
      }

      batch++
      totalAttempted += count
      totalEstablished += count

      // Check if we've exceeded the deadline
      if (ctx.clock.now() >= deadline) {
        ctx.log(`Surge deadline reached at batch ${batch}, elapsed: ${ctx.clock.now() - surgeStartTime}ms`)
        break
      }

      // Wait until next batch interval
      const nextBatchTargetTime = surgeStartTime + batch * batchIntervalMs
      const waitUntil = Math.max(0, nextBatchTargetTime - ctx.clock.now())
      if (waitUntil > 0 && batch < 24) {
        await ctx.sleep(waitUntil)
      }
    }

    const surgeEndTime = ctx.clock.now()
    const surgeElapsed = surgeEndTime - surgeStartTime
    const timingErrorMs = surgeElapsed - surgeDurationMs

    ctx.log(`Surge complete in ${surgeElapsed}ms, pool size: ${this.pool.size}`)

    const stabilizationMs = 30_000
    ctx.log(`Stabilization hold for ${stabilizationMs / 1000}s...`)
    await ctx.sleep(stabilizationMs)

    const snap = ctx.metrics.snapshot()
    const surgeAttempted = snap.connections_attempted - attemptsBefore
    const surgeEstablished = snap.connections_established - establishedBefore
    const surgeFailures = snap.connection_failures - failuresBefore

    // §4.5: Surge-phase health for pre-existing viewers
    const surgeMissing = snap.missing_sequences - missingBefore
    const surgeDupes = snap.duplicates - duplicatesBefore
    const surgeOoo = snap.out_of_order - outOfOrderBefore
    const surgeEvents = snap.events_received - eventsReceivedBefore
    const surgeFanOutSamples = snap.fan_out_latencies_ms.slice(fanOutBefore)
    surgeFanOutSamples.sort((a, b) => a - b)
    const surgeFanOutP95 = surgeFanOutSamples.length > 0
      ? surgeFanOutSamples[Math.ceil(0.95 * surgeFanOutSamples.length) - 1]
      : 0

    // §4.5: Calculate scheduler lag percentiles
    if (schedulerLags.length > 0) {
      schedulerLags.sort((a, b) => a - b)
      schedulerLagP95 = schedulerLags[Math.ceil(0.95 * schedulerLags.length) - 1]
    }

    ctx._surgeHealth = {
      fan_out_p95_ms: surgeFanOutP95,
      missing_sequences: surgeMissing,
      duplicates: surgeDupes,
      out_of_order: surgeOoo,
      events_received: surgeEvents,
      surge_target_additions: surgeCount,
      surge_attempted: surgeAttempted,
      surge_established: surgeEstablished,
      surge_failures: surgeFailures,
      surge_start_time: surgeStartTime,
      surge_end_time: surgeEndTime,
      surge_elapsed_ms: surgeElapsed,
      surge_timing_error_ms: timingErrorMs,
      attempt_rate_peak: attemptRatePeak,
      establishment_rate_peak: establishmentRatePeak,
      scheduler_lag_p95: schedulerLagP95,
      scheduler_lag_max: schedulerLagMax,
      active_population_start: baseCount,
      active_population_end: this.pool.size,
      active_population_peak: this.pool.size,
    }

    const attemptsPerSec = surgeElapsed > 0 ? surgeAttempted / (surgeElapsed / 1000) : 0
    const establishedPerSec = surgeElapsed > 0 ? surgeEstablished / (surgeElapsed / 1000) : 0

    ctx.log(`Surge stats: attempted=${surgeAttempted} established=${surgeEstablished} failures=${surgeFailures}`)
    ctx.log(`§BH surge health: missing=${surgeMissing} dupes=${surgeDupes} ooo=${surgeOoo} fan_out_p95=${surgeFanOutP95}ms events=${surgeEvents}`)
    ctx.log(`§4.5 timing: elapsed=${surgeElapsed}ms error=${timingErrorMs}ms attempt_peak=${attemptRatePeak.toFixed(1)} est_peak=${establishmentRatePeak.toFixed(1)} lag_p95=${schedulerLagP95}ms lag_max=${schedulerLagMax}ms`)

    // §4.5: Classify as INCONCLUSIVE if generator saturation prevented reaching the DUT
    const generatorSaturated = attemptRatePeak < 100 || establishmentRatePeak < 100
    if (generatorSaturated) {
      ctx.log(`§4.5 INCONCLUSIVE: generator saturation (attempt_peak=${attemptRatePeak.toFixed(1)}/s, est_peak=${establishmentRatePeak.toFixed(1)}/s)`)
      return {
        name: this.name,
        passed: false,
        detail: `INCONCLUSIVE generator saturated: surge=${surgeEstablished}/${surgeCount} in ${surgeElapsed}ms attempt_peak=${attemptRatePeak.toFixed(1)} est_peak=${establishmentRatePeak.toFixed(1)} lag_p95=${schedulerLagP95}ms`,
      }
    }

    const healthOk = surgeMissing === 0 && surgeDupes === 0 && surgeOoo === 0
    const passCriteria = surgeEstablished >= surgeCount * 0.9 && healthOk

    return {
      name: this.name,
      passed: passCriteria,
      detail: `surge=${surgeEstablished}/${surgeCount} established in ${surgeElapsed}ms timing_error=${timingErrorMs}ms attempt_peak=${attemptRatePeak.toFixed(1)}/s est_peak=${establishmentRatePeak.toFixed(1)}/s lag_p95=${schedulerLagP95}ms lag_max=${schedulerLagMax}ms health_ok=${healthOk}`,
    }
  }
}