import type { Scenario, ScenarioContext } from "./scenario.js"
import type { ConnectionPool } from "../application/connection-pool.js"

export class ReconnectScenario implements Scenario {
  name = "reconnect"
  private pool: ConnectionPool

  constructor(pool: ConnectionPool) {
    this.pool = pool
  }

  async execute(ctx: ScenarioContext): Promise<{ name: string; passed: boolean; detail: string }> {
    ctx.log("--- PHASE: RECONNECT TEST ---")
    ctx.publisher.stop()
    await ctx.sleep(500)

    ctx.log("Disconnecting connections for reconnect test...")
    await this.pool.reconnectAll(ctx.eventStream, 2000)

    await ctx.sleep(10000)
    ctx.log("Reconnect test complete")

    const snap = ctx.metrics.snapshot()
    const passed = snap.reconnect_gaps === 0 &&
      snap.reconnect_duplicates === 0 &&
      snap.reconnect_order_violations === 0

    return {
      name: this.name,
      passed,
      detail: `gaps=${snap.reconnect_gaps} dups=${snap.reconnect_duplicates} ooo=${snap.reconnect_order_violations}`,
    }
  }
}
