import type { Scenario, ScenarioContext } from "./scenario.js"
import type { ConnectionPool } from "../application/connection-pool.js"

export class LateJoinScenario implements Scenario {
  name = "late-join"
  private pool: ConnectionPool

  constructor(pool: ConnectionPool) {
    this.pool = pool
  }

  async execute(ctx: ScenarioContext): Promise<{ name: string; passed: boolean; detail: string }> {
    ctx.log("Executing late-join test...")

    const testMatch = ctx.matchIds[0]
    const head = ctx.headTracker.getHead(testMatch)

    if (head <= 0) {
      ctx.log("Late-join: no events published yet, skipping")
      return { name: this.name, passed: true, detail: "skipped (no events)" }
    }

    const startTime = ctx.clock.now()

    try {
      const url = `${ctx.config.historyUrl}/history/${testMatch}`
      const subscription = await ctx.eventStream.connect(url)

      let caughtUp = false
      const result = await new Promise<number>((resolve) => {
        const timeout = setTimeout(() => {
          if (!caughtUp) {
            subscription.close()
            resolve(-1)
          }
        }, 10000)

        subscription.onEvent((evt) => {
          if (caughtUp || evt.type !== "message") return
          try {
            const data = JSON.parse(evt.event.data)
            if (data && typeof data.canonical_seq === "number" && data.canonical_seq >= head) {
              caughtUp = true
              clearTimeout(checkTimeout)
              subscription.close()
              resolve(Date.now() - startTime)
            }
          } catch {}
        })

        const checkTimeout = timeout
      })

      if (result >= 0) {
        ctx.metrics.recordLateJoinLatency(result)
        ctx.log(`Late-join: caught up to seq ${head} in ${result}ms`)
        return { name: this.name, passed: result <= 2000, detail: `${result}ms to seq ${head}` }
      }

      ctx.log("Late-join: timed out")
      return { name: this.name, passed: false, detail: "timed out" }
    } catch {
      ctx.log("Late-join: connection failed")
      return { name: this.name, passed: false, detail: "connection failed" }
    }
  }
}
