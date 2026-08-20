import type { Scenario, ScenarioContext } from "./scenario.js"
import type { ConnectionEntry, ConnectionPool } from "../application/connection-pool.js"

export class SlowConsumerScenario implements Scenario {
  name = "slow-consumer"
  private pool: ConnectionPool
  private slowConnections: ConnectionEntry[] = []

  constructor(pool: ConnectionPool) {
    this.pool = pool
  }

  registerSlowConnection(entry: ConnectionEntry): void {
    this.slowConnections.push(entry)
  }

  async execute(ctx: ScenarioContext): Promise<{ name: string; passed: boolean; detail: string }> {
    ctx.log("Slow consumer test: pausing sockets to create backpressure...")

    for (const conn of this.slowConnections) {
      conn.subscription.pause()
    }

    ctx.log(`${this.slowConnections.length} connections paused (backpressure active)`)
    await ctx.sleep(15000)

    let disconnects = 0
    for (const conn of this.slowConnections) {
      if (!conn.subscription.connected) {
        disconnects++
      }
    }

    for (const conn of this.slowConnections) {
      try { conn.subscription.resume() } catch {}
    }

    const snap = ctx.metrics.snapshot()
    const totalDisconnects = snap.slow_consumer_disconnects + disconnects

    ctx.log(`Slow consumer: ${totalDisconnects} disconnects, ${this.slowConnections.length} were paused`)

    return {
      name: this.name,
      passed: true,
      detail: `disconnects=${totalDisconnects} paused=${this.slowConnections.length}`,
    }
  }
}
