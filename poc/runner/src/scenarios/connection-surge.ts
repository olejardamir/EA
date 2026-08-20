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
    const batchSize = Math.ceil(surgeCount / 24)
    const batchIntervalMs = surgeDurationMs / 24

    ctx.log(`Current pool: ${baseCount}, surge target: +${surgeCount} over 120s (${batchSize} per ${Math.round(batchIntervalMs)}ms batch)`)

    if (surgeCount <= 0) {
      ctx.log("Pool already at or above target, skipping surge")
      return { name: this.name, passed: true, detail: `skipped (pool ${baseCount} >= target ${totalTarget})` }
    }

    const attemptsBefore = ctx.metrics.snapshot().connections_attempted
    const establishedBefore = ctx.metrics.snapshot().connections_established
    const failuresBefore = ctx.metrics.snapshot().connection_failures
    const dropsBefore = ctx.metrics.snapshot().connections_dropped

    // §BH: Snapshot correctness counters before surge
    const snapBefore = ctx.metrics.snapshot()
    const missingBefore = snapBefore.missing_sequences
    const duplicatesBefore = snapBefore.duplicates
    const outOfOrderBefore = snapBefore.out_of_order
    const eventsReceivedBefore = snapBefore.events_received
    const fanOutBefore = snapBefore.fan_out_latencies_ms.length

    const surgeStart = ctx.clock.now()

    for (let batch = 0; batch < 24; batch++) {
      const remaining = surgeCount - (batch * batchSize)
      const count = Math.min(batchSize, remaining)

      if (count <= 0) break

      ctx.log(`Surge batch ${batch + 1}/24: adding ${count} connections (pool size: ${this.pool.size})`)
      await this.pool.connectAll(ctx.eventStream, count, this.pool.size, undefined, ctx.config.lobbyFraction)

      if (batch < 23) {
        await ctx.sleep(batchIntervalMs)
      }
    }

    const surgeElapsed = ctx.clock.now() - surgeStart

    ctx.log(`Surge complete in ${surgeElapsed}ms, pool size: ${this.pool.size}`)

    const stabilizationMs = 30_000
    ctx.log(`Stabilization hold for ${stabilizationMs / 1000}s...`)
    await ctx.sleep(stabilizationMs)

    const snap = ctx.metrics.snapshot()
    const surgeAttempted = snap.connections_attempted - attemptsBefore
    const surgeEstablished = snap.connections_established - establishedBefore
    const surgeFailures = snap.connection_failures - failuresBefore
    const surgeDrops = snap.connections_dropped - dropsBefore

    // §BH: Surge-phase health for pre-existing viewers
    const surgeMissing = snap.missing_sequences - missingBefore
    const surgeDupes = snap.duplicates - duplicatesBefore
    const surgeOoo = snap.out_of_order - outOfOrderBefore
    const surgeEvents = snap.events_received - eventsReceivedBefore
    const surgeFanOutSamples = snap.fan_out_latencies_ms.slice(fanOutBefore)
    surgeFanOutSamples.sort((a, b) => a - b)
    const surgeFanOutP95 = surgeFanOutSamples.length > 0
      ? surgeFanOutSamples[Math.ceil(0.95 * surgeFanOutSamples.length) - 1]
      : 0

    // Store surge health on context for aggregation in main.ts
    ctx._surgeHealth = {
      fan_out_p95_ms: surgeFanOutP95,
      missing_sequences: surgeMissing,
      duplicates: surgeDupes,
      out_of_order: surgeOoo,
      events_received: surgeEvents,
    }

    const attemptsPerSec = surgeElapsed > 0 ? surgeAttempted / (surgeElapsed / 1000) : 0
    const establishedPerSec = surgeElapsed > 0 ? surgeEstablished / (surgeElapsed / 1000) : 0

    ctx.log(`Surge stats: attempted=${surgeAttempted} established=${surgeEstablished} failures=${surgeFailures} drops=${surgeDrops}`)
    ctx.log(`§BH surge health: missing=${surgeMissing} dupes=${surgeDupes} ooo=${surgeOoo} fan_out_p95=${surgeFanOutP95}ms events=${surgeEvents}`)
    ctx.log(`Rates: ${attemptsPerSec.toFixed(1)} att/s, ${establishedPerSec.toFixed(1)} est/s`)

    const poolDelta = this.pool.size - baseCount
    const healthOk = surgeMissing === 0 && surgeDupes === 0 && surgeOoo === 0
    const passCriteria = poolDelta >= surgeCount * 0.9 && surgeDrops === 0 && healthOk

    return {
      name: this.name,
      passed: passCriteria,
      detail: `surge=${surgeEstablished}/${surgeCount} established in ${surgeElapsed}ms failures=${surgeFailures} drops=${surgeDrops} att/s=${attemptsPerSec.toFixed(1)} est/s=${establishedPerSec.toFixed(1)} health_ok=${healthOk}`,
    }
  }
}
