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

    const connectionsPerWorker = Math.ceil(ctx.config.targetConnections / ctx.config.workerCount)
    ctx.log(`Connecting ${ctx.config.targetConnections} SSE clients...`)

    const connectStart = ctx.clock.now()
    await this.pool.connectAll(ctx.eventStream, connectionsPerWorker, 0)
    const connectDuration = ctx.clock.now() - connectStart
    ctx.log(`All connections established in ${connectDuration}ms`)

    await ctx.sleep(ctx.config.warmupSeconds * 1000)
    ctx.log("Warm-up complete")

    return {
      name: this.name,
      passed: true,
      detail: `${this.pool.size} connections established in ${connectDuration}ms`,
    }
  }
}
