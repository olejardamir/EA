import type { Scenario, ScenarioContext } from "./scenario.js"

export class BurstScenario implements Scenario {
  name = "burst"
  burstFanOutP95Ms = 0

  async execute(ctx: ScenarioContext): Promise<{ name: string; passed: boolean; detail: string }> {
    ctx.log(`--- PHASE: BURST (${ctx.config.burstSeconds}s) ---`)

    ctx.publisher.stop()
    await ctx.publisher.drain()
    ctx.publisher.burstMode = true
    ctx.publisher.start(false)

    await ctx.sleep(ctx.config.burstSeconds * 1000)

    // The dedicated streaming phase histogram retains the full distribution;
    // the bounded recent-sample buffer can wrap during evidence-scale bursts.
    const burstHistogram = ctx.metrics.snapshotPhaseHistograms().burst?.fanOut
    this.burstFanOutP95Ms = burstHistogram?.p95 ?? 0
    const burstSampleCount = burstHistogram?.count ?? 0

    ctx.log(`Burst complete, fan-out p95=${this.burstFanOutP95Ms}ms (${burstSampleCount} samples)`)

    // §3.11.C: Record active population for this scenario (burst doesn't change connection count)
    const startPop = ctx._activePopulationStart ?? 0
    ctx._burstActivePopulation = { start: startPop, peak: startPop, end: startPop }

    return {
      name: this.name,
      passed: burstSampleCount > 0,
      detail: `burst for ${ctx.config.burstSeconds}s, fan-out p95=${this.burstFanOutP95Ms}ms samples=${burstSampleCount} active_start=${startPop} active_peak=${startPop} active_end=${startPop}`,
    }
  }
}
