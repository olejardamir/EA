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

    // §3.4: Derived required ramp rate from the frozen target
    const requiredRampRate = surgeCount / (surgeDurationMs / 1000)
    ctx.log(`§3.4 required ramp rate: ${requiredRampRate.toFixed(2)} connections/s (surgeCount=${surgeCount} / ${surgeDurationMs / 1000}s)`)

    const snapBefore = ctx.metrics.snapshot()
    const attemptsBefore = snapBefore.connections_attempted
    const establishedBefore = snapBefore.connections_established
    const failuresBefore = snapBefore.connection_failures
    const droppedBefore = snapBefore.connections_dropped
    const missingBefore = snapBefore.missing_sequences
    const duplicatesBefore = snapBefore.duplicates
    const outOfOrderBefore = snapBefore.out_of_order
    const eventsReceivedBefore = snapBefore.events_received

    // §4.5: Use monotonic clock for absolute deadline enforcement
    const surgeStartTime = performance.now()
    const deadline = surgeStartTime + surgeDurationMs
    const batchSize = Math.ceil(surgeCount / 24)
    const batchIntervalMs = surgeDurationMs / 24

    // §4.5: Rate tracking for peaks — use ACTUAL deltas per batch, not requested count
    let attemptRatePeak = 0
    let establishmentRatePeak = 0
    let schedulerLagP95 = 0
    let schedulerLagMax = 0
    const schedulerLags: number[] = []

    // §3.4: Per-bucket actual deltas
    const bucketActualAttempts: number[] = []
    const bucketActualEstablished: number[] = []
    const bucketActualFailures: number[] = []

    let batch = 0
    let batchStartTime = performance.now()
    let prevAttempts = attemptsBefore
    let prevEstablished = establishedBefore
    let prevFailures = failuresBefore

    while (batch < 24) {
      const remaining = surgeCount - (batch * batchSize)
      const count = Math.min(batchSize, remaining)

      const targetTime = surgeStartTime + (batch + 1) * batchIntervalMs
      const actualStartTime = performance.now()

      if (count > 0) {
        ctx.log(`Surge batch ${batch + 1}/24: requesting ${count} connections (pool size: ${this.pool.size})`)
        await this.pool.connectAll(ctx.eventStream, count, this.pool.size, undefined, ctx.config.lobbyFraction)
      } else {
        ctx.log(`Surge batch ${batch + 1}/24: all connections allocated, waiting for deadline`)
      }

      const actualEndTime = performance.now()
      const batchElapsed = actualEndTime - actualStartTime
      const schedulerLag = actualEndTime - targetTime
      schedulerLags.push(schedulerLag)
      schedulerLagMax = Math.max(schedulerLagMax, Math.abs(schedulerLag))

      // §3.4: Compute ACTUAL deltas from metrics, not requested count
      const currentSnap = ctx.metrics.snapshot()
      const actualAttempts = currentSnap.connections_attempted - prevAttempts
      const actualEstablished = currentSnap.connections_established - prevEstablished
      const actualFailures = currentSnap.connection_failures - prevFailures

      bucketActualAttempts.push(actualAttempts)
      bucketActualEstablished.push(actualEstablished)
      bucketActualFailures.push(actualFailures)

      prevAttempts = currentSnap.connections_attempted
      prevEstablished = currentSnap.connections_established
      prevFailures = currentSnap.connection_failures

      // §3.4: Compute rates from actual deltas
      if (batchElapsed > 0) {
        const batchAttemptRate = (actualAttempts / batchElapsed) * 1000
        const batchEstablishRate = (actualEstablished / batchElapsed) * 1000
        attemptRatePeak = Math.max(attemptRatePeak, batchAttemptRate)
        establishmentRatePeak = Math.max(establishmentRatePeak, batchEstablishRate)
      }

      batch++

      // §4.5: Absolute deadline enforcement — break immediately if over
      const now = performance.now()
      if (now >= deadline) {
        ctx.log(`Surge deadline reached at batch ${batch}, elapsed: ${(now - surgeStartTime).toFixed(1)}ms`)
        break
      }

      // Wait until next batch interval using monotonic target
      const nextBatchTargetTime = surgeStartTime + batch * batchIntervalMs
      const waitUntil = Math.max(0, nextBatchTargetTime - performance.now())
      if (waitUntil > 0) {
        await ctx.sleep(waitUntil)
      }
    }

    const surgeEndTime = performance.now()
    const surgeElapsed = surgeEndTime - surgeStartTime
    const timingErrorMs = surgeElapsed - surgeDurationMs

    ctx.log(`Surge complete in ${surgeElapsed.toFixed(1)}ms, pool size: ${this.pool.size}`)

    const snap = ctx.metrics.snapshot()
    const surgeAttempted = snap.connections_attempted - attemptsBefore
    const surgeEstablished = snap.connections_established - establishedBefore
    const surgeFailures = snap.connection_failures - failuresBefore

    // §3.4: Unexpected disconnects during surge
    const surgeDropped = snap.connections_dropped - droppedBefore

    // §3.4: Surge-phase health for pre-existing viewers
    const surgeMissing = snap.missing_sequences - missingBefore
    const surgeDupes = snap.duplicates - duplicatesBefore
    const surgeOoo = snap.out_of_order - outOfOrderBefore
    const surgeEvents = snap.events_received - eventsReceivedBefore

    // §3.6: Populate dedicated surge-phase histogram from phase histogram machinery
    // (not from rolling raw-sample slice which can be truncated)
    const phaseHists = ctx.metrics.snapshotPhaseHistograms()
    const surgePhaseHist = phaseHists["surge"]
    const surgeFanOutP95 = surgePhaseHist?.fanOut?.p95 ?? 0

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

    ctx.log(`§3.4 surge stats: attempted=${surgeAttempted} established=${surgeEstablished} failures=${surgeFailures} dropped=${surgeDropped}`)
    ctx.log(`§BH surge health: missing=${surgeMissing} dupes=${surgeDupes} ooo=${surgeOoo} fan_out_p95=${surgeFanOutP95}ms events=${surgeEvents}`)
    ctx.log(`§3.4 bucket deltas: attempts=[${bucketActualAttempts.join(",")}] established=[${bucketActualEstablished.join(",")}] failures=[${bucketActualFailures.join(",")}]`)
    ctx.log(`§3.4 derived required_ramp=${requiredRampRate.toFixed(2)}/s actual_avg_established=${establishedPerSec.toFixed(2)}/s`)
    ctx.log(`§4.5 timing: elapsed=${surgeElapsed}ms error=${timingErrorMs}ms attempt_peak=${attemptRatePeak.toFixed(1)} est_peak=${establishmentRatePeak.toFixed(1)} lag_p95=${schedulerLagP95}ms lag_max=${schedulerLagMax}ms`)

    // §3.6.B/§3.6.D: Always populate surge health with actual deficit.
    // No arbitrary 80% threshold — the classifier decides REJECT vs INCONCLUSIVE
    // based on generator health (all generator/environment INCONCLUSIVE checks precede classification).
    const exactTargetReached = surgeEstablished >= surgeCount
    ctx._surgeHealth = {
      fan_out_p95_ms: surgeFanOutP95,
      missing_sequences: surgeMissing,
      duplicates: surgeDupes,
      out_of_order: surgeOoo,
      events_received: surgeEvents,
      surge_target_additions: surgeCount,
      surge_attempted: surgeAttempted,
      surge_established: surgeEstablished,
      surge_failures: exactTargetReached ? 0 : surgeCount - surgeEstablished,
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

    // §3.4: Unexpected disconnects during surge — any drop is REJECT
    if (surgeDropped > 0) {
      ctx.log(`§3.4 REJECT: ${surgeDropped} unexpected disconnects during surge`)
      return {
        name: this.name,
        passed: false,
        detail: `REJECT: ${surgeDropped} disconnects during surge=${surgeEstablished}/${surgeCount} in ${surgeElapsed}ms`,
      }
    }

    const healthOk = surgeMissing === 0 && surgeDupes === 0 && surgeOoo === 0
    const passCriteria = exactTargetReached && healthOk

    return {
      name: this.name,
      passed: passCriteria,
      detail: `surge=${surgeEstablished}/${surgeCount} established in ${surgeElapsed}ms timing_error=${timingErrorMs}ms attempt_peak=${attemptRatePeak.toFixed(1)}/s est_peak=${establishmentRatePeak.toFixed(1)}/s required_ramp=${requiredRampRate.toFixed(2)}/s avg_established=${establishedPerSec.toFixed(2)}/s lag_p95=${schedulerLagP95}ms lag_max=${schedulerLagMax}ms dropped=${surgeDropped} fan_out_p95=${surgeFanOutP95}ms health_ok=${healthOk} exact_target=${exactTargetReached}`,
    }
  }
}
