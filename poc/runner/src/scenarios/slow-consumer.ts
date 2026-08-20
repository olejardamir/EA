import type { Scenario, ScenarioContext } from "./scenario.js"
import type { ConnectionPool } from "../application/connection-pool.js"

export class SlowConsumerScenario implements Scenario {
  name = "slow-consumer"
  private pool: ConnectionPool

  constructor(pool: ConnectionPool) {
    this.pool = pool
  }

  async execute(ctx: ScenarioContext): Promise<{ name: string; passed: boolean; detail: string }> {
    ctx.log("Slow consumer test: pausing sockets to create backpressure...")

    const conns = [...this.pool.entries]
    for (const conn of conns) {
      conn.subscription.pause()
    }

    ctx.log(`${conns.length} connections paused (backpressure active)`)
    await ctx.sleep(15000)

    let disconnects = 0
    for (const conn of conns) {
      if (!conn.subscription.connected) {
        disconnects++
      }
    }

    for (const conn of conns) {
      try { conn.subscription.resume() } catch {}
    }

    const snap = ctx.metrics.snapshot()
    const totalDisconnects = snap.slow_consumer_disconnects + disconnects

    ctx.log(`Slow consumer: ${totalDisconnects} disconnects, ${conns.length} were paused`)

    return {
      name: this.name,
      passed: true,
      detail: `disconnects=${totalDisconnects} paused=${conns.length}`,
    }
  }
}
