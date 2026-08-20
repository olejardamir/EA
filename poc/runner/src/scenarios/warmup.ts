import type { Scenario, ScenarioContext } from "./scenario.js"
import type { ConnectionPool } from "../application/connection-pool.js"

export class WarmupScenario implements Scenario {
  name = "warmup"
  private pool: ConnectionPool

  constructor(pool: ConnectionPool) {
    this.pool = pool
  }

  async execute(ctx: ScenarioContext): Promise<{ name: string; passed: boolean; detail: string }> {
    ctx.log(`--- PHASE: WARMUP (${ctx.config.warmupSeconds}s) ---`)

    const baseCount = Math.floor(ctx.config.targetConnections * 0.6)
    ctx.log(`Connecting ${baseCount} SSE clients (60% of ${ctx.config.targetConnections})...`)

    const connectStart = ctx.clock.now()
    await this.pool.connectAll(ctx.eventStream, baseCount, 0, undefined, ctx.config.lobbyFraction)
    const connectDuration = ctx.clock.now() - connectStart
    ctx.log(`All connections established in ${connectDuration}ms (pool size: ${this.pool.size})`)

    await ctx.sleep(ctx.config.warmupSeconds * 1000)
    ctx.log("Warm-up complete")

    return {
      name: this.name,
      passed: true,
      detail: `${this.pool.size} connections established in ${connectDuration}ms (60% base of ${ctx.config.targetConnections})`,
    }
  }
}
