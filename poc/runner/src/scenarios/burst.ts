import type { Scenario, ScenarioContext } from "./scenario.js"

export class BurstScenario implements Scenario {
  name = "burst"

  async execute(ctx: ScenarioContext): Promise<{ name: string; passed: boolean; detail: string }> {
    ctx.log(`--- PHASE: BURST (${ctx.config.burstSeconds}s) ---`)

    ctx.publisher.stop()
    await ctx.sleep(500)
    ctx.publisher.burstMode = true
    ctx.publisher.start(false)

    await ctx.sleep(ctx.config.burstSeconds * 1000)
    ctx.log("Burst complete")

    return {
      name: this.name,
      passed: true,
      detail: `burst for ${ctx.config.burstSeconds}s`,
    }
  }
}
