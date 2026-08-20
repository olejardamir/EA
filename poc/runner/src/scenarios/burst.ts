import type { Scenario, ScenarioContext } from "./scenario.js"

export class BurstScenario implements Scenario {
  name = "burst"
  burstFanOutP95Ms = 0

  async execute(ctx: ScenarioContext): Promise<{ name: string; passed: boolean; detail: string }> {
    ctx.log(`--- PHASE: BURST (${ctx.config.burstSeconds}s) ---`)

    const preBurstCount = ctx.metrics.snapshot().fan_out_latencies_ms.length

    ctx.publisher.stop()
    await ctx.publisher.drain()
    ctx.publisher.burstMode = true
    ctx.publisher.start(false)

    await ctx.sleep(ctx.config.burstSeconds * 1000)

    const postBurstSnap = ctx.metrics.snapshot()
    const burstLatencies = postBurstSnap.fan_out_latencies_ms.slice(preBurstCount)
    burstLatencies.sort((a, b) => a - b)

    if (burstLatencies.length > 0) {
      const idx = Math.ceil(0.95 * burstLatencies.length) - 1
      this.burstFanOutP95Ms = burstLatencies[Math.max(0, idx)]
    }

    ctx.log(`Burst complete, fan-out p95=${this.burstFanOutP95Ms}ms (${burstLatencies.length} samples)`)

    // §3.11.C: Record active population for this scenario (burst doesn't change connection count)
    const startPop = ctx._activePopulationStart ?? 0
    ctx._burstActivePopulation = { start: startPop, peak: startPop, end: startPop }

    return {
      name: this.name,
      passed: true,
      detail: `burst for ${ctx.config.burstSeconds}s, fan-out p95=${this.burstFanOutP95Ms}ms active_start=${startPop} active_peak=${startPop} active_end=${startPop}`,
    }
  }
}
