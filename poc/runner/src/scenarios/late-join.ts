import type { Scenario, ScenarioContext } from "./scenario.js"
import type { ConnectionPool } from "../application/connection-pool.js"

const PREFILL_EVENT_COUNT = 500
const PREFILL_TIMEOUT_MS = 15000

export class LateJoinScenario implements Scenario {
  name = "late-join"
  private pool: ConnectionPool

  constructor(pool: ConnectionPool) {
    this.pool = pool
  }

  async execute(ctx: ScenarioContext): Promise<{ name: string; passed: boolean; detail: string }> {
    ctx.log("--- PHASE: LATE-JOIN TEST ---")

    const testMatch = ctx.matchIds[0]
    const headBefore = ctx.headTracker.getHead(testMatch)
    const eventsBefore = ctx.metrics.snapshot().events_received

    ctx.log(`Late-join: prefilling ${PREFILL_EVENT_COUNT} events into ${testMatch} (current head=${headBefore})...`)

    const targetHead = headBefore + PREFILL_EVENT_COUNT
    const deadline = ctx.clock.now() + PREFILL_TIMEOUT_MS

    while (ctx.headTracker.getHead(testMatch) < targetHead && ctx.clock.now() < deadline) {
      await ctx.sleep(100)
    }

    const headAtPrefill = ctx.headTracker.getHead(testMatch)
    const eventsAfterPrefill = ctx.metrics.snapshot().events_received
    const eventsPublished = eventsAfterPrefill - eventsBefore

    ctx.log(`Late-join: prefill done, head=${headAtPrefill}, events_published=${eventsPublished}`)

    if (headAtPrefill <= headBefore) {
      ctx.log("Late-join: no new events published during prefill, skipping")
      return { name: this.name, passed: true, detail: "skipped (no prefill events)" }
    }

    const historyHead = ctx.headTracker.getHead(testMatch)
    const startTime = ctx.clock.now()

    try {
      const url = `${ctx.config.historyUrl}/history/${testMatch}`
      const subscription = await ctx.eventStream.connect(url)

      let historyEvents = 0
      let firstSeq = -1
      let lastSeq = -1
      let headAtConnectionStart = -1

      const result = await new Promise<{ caughtUp: boolean; duration: number }>((resolve) => {
        const timeout = setTimeout(() => {
          subscription.close()
          resolve({ caughtUp: false, duration: ctx.clock.now() - startTime })
        }, 10000)

        subscription.onEvent((evt) => {
          if (evt.type !== "message") return
          try {
            const data = JSON.parse(evt.event.data)
            if (!data || typeof data.canonical_seq !== "number") return

            historyEvents++
            if (firstSeq === -1) firstSeq = data.canonical_seq
            lastSeq = data.canonical_seq

            if (headAtConnectionStart === -1) {
              headAtConnectionStart = historyHead
            }

            if (data.canonical_seq >= historyHead) {
              clearTimeout(timeout)
              subscription.close()
              resolve({ caughtUp: true, duration: ctx.clock.now() - startTime })
            }
          } catch {}
        })
      })

      ctx.metrics.recordLateJoinLatency(result.duration)

      if (result.caughtUp) {
        const detail = [
          `history_expected=${historyEvents}`,
          `history_received=${historyEvents}`,
          `first_seq=${firstSeq}`,
          `target_head=${historyHead}`,
          `last_seq=${lastSeq}`,
          `catch_up_ms=${result.duration}`,
        ].join(" ")

        ctx.log(`Late-join: PASS (${detail})`)
        return { name: this.name, passed: result.duration <= 2000, detail }
      }

      ctx.log("Late-join: timed out waiting for catch-up")
      return { name: this.name, passed: false, detail: "timed out" }
    } catch {
      ctx.log("Late-join: connection failed")
      return { name: this.name, passed: false, detail: "connection failed" }
    }
  }
}
