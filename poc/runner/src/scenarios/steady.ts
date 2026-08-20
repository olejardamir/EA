import type { Scenario, ScenarioContext } from "./scenario.js"
import type { ConnectionPool } from "../application/connection-pool.js"

export class SteadyScenario implements Scenario {
  name = "steady"
  private pool: ConnectionPool

  constructor(pool: ConnectionPool) {
    this.pool = pool
  }

  async execute(ctx: ScenarioContext): Promise<{ name: string; passed: boolean; detail: string }> {
    ctx.log(`--- PHASE: STEADY MEASUREMENT (${ctx.config.measureSeconds}s) ---`)

    const loopMonitor = setInterval(() => {
      ctx.resourceMonitor.measureEventLoop()
    }, 100)

    const steadyStart = ctx.clock.now()

    await ctx.sleep(ctx.config.measureSeconds * 1000)

    const steadyDuration = ctx.clock.now() - steadyStart
    clearInterval(loopMonitor)
    ctx.log(`Steady measurement complete (${steadyDuration}ms)`)

    return {
      name: this.name,
      passed: true,
      detail: `measured ${steadyDuration}ms`,
    }
  }
}
