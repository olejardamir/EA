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
    const baseCount = Math.floor(totalTarget * 0.6)
    const surgeCount = totalTarget - baseCount
    const surgeDurationMs = 120_000
    const batchSize = Math.ceil(surgeCount / 24)
    const batchIntervalMs = surgeDurationMs / 24

    ctx.log(`Base: ${baseCount}, surge target: ${surgeCount} over 120s (${batchSize} per ${batchIntervalMs}ms batch)`)

    const attemptsBefore = ctx.metrics.snapshot().connections_attempted
    const establishedBefore = ctx.metrics.snapshot().connections_established
    const failuresBefore = ctx.metrics.snapshot().connection_failures
    const dropsBefore = ctx.metrics.snapshot().connections_dropped

    const surgeStart = ctx.clock.now()

    for (let batch = 0; batch < 24; batch++) {
      const offset = this.pool.size
      const remaining = surgeCount - (batch * batchSize)
      const count = Math.min(batchSize, remaining)

      if (count <= 0) break

      ctx.log(`Surge batch ${batch + 1}/24: adding ${count} connections (pool size: ${this.pool.size})`)
      await this.pool.connectAll(ctx.eventStream, count, offset)

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

    const attemptsPerSec = surgeAttempted / (surgeElapsed / 1000)
    const establishedPerSec = surgeEstablished / (surgeElapsed / 1000)

    ctx.log(`Surge stats: attempted=${surgeAttempted} established=${surgeEstablished} failures=${surgeFailures} drops=${surgeDrops}`)
    ctx.log(`Rates: ${attemptsPerSec.toFixed(1)} att/s, ${establishedPerSec.toFixed(1)} est/s`)

    const poolDelta = this.pool.size - baseCount
    const passCriteria = poolDelta >= surgeCount * 0.9 && surgeDrops === 0

    return {
      name: this.name,
      passed: passCriteria,
      detail: `surge=${surgeEstablished}/${surgeCount} established in ${surgeElapsed}ms failures=${surgeFailures} drops=${surgeDrops} att/s=${attemptsPerSec.toFixed(1)} est/s=${establishedPerSec.toFixed(1)}`,
    }
  }
}
