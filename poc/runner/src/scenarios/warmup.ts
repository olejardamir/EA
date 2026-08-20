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

    // §BT: Publisher begins generating events during warm-up (not after)
    if (ctx.publisherEnabled !== false) {
      ctx.publisher.start(true)
      ctx.log("Authoritative publisher started during warm-up")
    } else {
      ctx.log("Publisher disabled on non-owner shard")
    }

    // §BT: Remaining warm-up time allows events to flow to base connections
    const remainingWarmup = Math.max(0, ctx.config.warmupSeconds * 1000 - connectDuration)
    if (remainingWarmup > 0) {
      ctx.log(`Stabilizing for ${remainingWarmup}ms with events flowing...`)
      await ctx.sleep(remainingWarmup)
    }

    // §BT: 5-second stabilization pause after warm-up connections + events established
    ctx.log("5-second stabilization pause...")
    await ctx.sleep(5000)

    ctx.log("Warm-up complete")

    return {
      name: this.name,
      passed: true,
      detail: `${this.pool.size} connections established in ${connectDuration}ms (60% base of ${ctx.config.targetConnections}), publisher active, 5s stabilization`,
    }
  }
}
