import type { Scenario, ScenarioContext } from "./scenario.js"
import type { ConnectionPool } from "../application/connection-pool.js"

const SLOW_FRACTION = 0.05
const BACKPRESSURE_DURATION_MS = 15000
const LATENCY_DEGRADATION_THRESHOLD = 0.05

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.ceil(sorted.length * p) - 1
  return sorted[Math.max(0, idx)]
}

export class SlowConsumerScenario implements Scenario {
  name = "slow-consumer"
  private pool: ConnectionPool

  constructor(pool: ConnectionPool) {
    this.pool = pool
  }

  async execute(ctx: ScenarioContext): Promise<{ name: string; passed: boolean; detail: string }> {
    ctx.log("--- PHASE: SLOW CONSUMER TEST ---")

    const all = [...this.pool.entries]
    if (all.length === 0) {
      return { name: this.name, passed: true, detail: "skipped (no connections)" }
    }

    const slowCount = Math.max(1, Math.floor(all.length * SLOW_FRACTION))
    const slowConnections = all.slice(0, slowCount)
    const healthyConnections = all.slice(slowCount)

    ctx.log(`Designating ${slowCount}/${all.length} connections as slow (${SLOW_FRACTION * 100}%)`)

    const snapBefore = ctx.metrics.snapshot()
    const latenciesBefore = [...snapBefore.fan_out_latencies_ms].sort((a, b) => a - b)
    const p95Before = percentile(latenciesBefore, 0.95)

    for (const conn of slowConnections) {
      conn.subscription.pause()
    }

    ctx.log(`${slowCount} slow connections paused, ${healthyConnections.length} healthy connections active`)
    await ctx.sleep(BACKPRESSURE_DURATION_MS)

    let slowDisconnects = 0
    for (const conn of slowConnections) {
      if (!conn.subscription.connected) {
        slowDisconnects++
      }
      try { conn.subscription.resume() } catch {}
    }

    const snapDuring = ctx.metrics.snapshot()
    const latenciesDuring = [...snapDuring.fan_out_latencies_ms].sort((a, b) => a - b)
    const p95During = percentile(latenciesDuring, 0.95)

    ctx.log(`Slow consumers: ${slowDisconnects}/${slowCount} disconnected by server`)
    ctx.log(`Healthy p95 latency: before=${p95Before}ms, with_slow=${p95During}ms`)

    const degradation = p95Before > 0
      ? (p95During - p95Before) / p95Before
      : 0

    const slowDisconnectsOk = slowDisconnects > 0
    const degradationOk = degradation <= LATENCY_DEGRADATION_THRESHOLD
    const passed = slowDisconnectsOk && degradationOk

    const detail = [
      `slow_disconnects=${slowDisconnects}/${slowCount}`,
      `p95_before=${p95Before}ms`,
      `p95_with_slow=${p95During}ms`,
      `degradation=${(degradation * 100).toFixed(1)}%`,
      `threshold=${(LATENCY_DEGRADATION_THRESHOLD * 100).toFixed(0)}%`,
    ].join(" ")

    ctx.log(`Slow consumer result: ${passed ? "PASS" : "FAIL"} (${detail})`)
    return { name: this.name, passed, detail }
  }
}
