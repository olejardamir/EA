import type { Scenario, ScenarioContext } from "./scenario.js"
import type { ConnectionPool, ConnectionEntry } from "../application/connection-pool.js"
import type { EventStream, Subscription } from "../ports/event-stream.js"

export class ReconnectScenario implements Scenario {
  name = "reconnect"
  private pool: ConnectionPool

  constructor(pool: ConnectionPool) {
    this.pool = pool
  }

  async execute(ctx: ScenarioContext): Promise<{ name: string; passed: boolean; detail: string }> {
    ctx.log("--- PHASE: RECONNECT TEST ---")

    const all = [...this.pool.entries]
    if (all.length === 0) {
      return { name: this.name, passed: true, detail: "skipped (no connections)" }
    }

    const cohortSize = Math.max(1, Math.floor(all.length * 0.1))
    const cohort = all.slice(0, cohortSize)

    const saved = cohort.map((entry) => ({
      entry,
      lastEventId: entry.subscription.lastEventId,
      head: ctx.headTracker.getHead(entry.matchId),
      trackerLastSeq: entry.tracker.lastSeq,
    }))

    ctx.log(`Reconnect cohort: ${cohortSize}/${all.length} connections`)
    ctx.log(`Pre-disconnect heads: ${saved.map((s) => `${s.entry.matchId}=${s.head}`).join(", ")}`)

    for (const s of saved) {
      s.entry.subscription.close()
    }
    ctx.log(`Disconnected ${cohortSize} connections, publisher still running`)

    const eventsDuringDisconnect = ctx.metrics.snapshot().events_received
    await ctx.sleep(2000)
    const eventsAfterDisconnect = ctx.metrics.snapshot().events_received
    const eventsMissed = eventsAfterDisconnect - eventsDuringDisconnect

    ctx.log(`Events published during disconnect window: ${eventsMissed}`)

    const newSubscriptions: Array<{ entry: ConnectionEntry; subscription: Subscription; saved: typeof saved[number] }> = []
    for (const s of saved) {
      const matchId = s.entry.matchId
      const url = `${ctx.config.nchanSubUrl}/sub/${matchId}`

      try {
        const subscription = await ctx.eventStream.connect(url, s.lastEventId)
        s.entry.subscription = subscription
        s.entry.mode = "reconnect"

        subscription.onEvent((evt) => {
          if (!this.pool.running) return
          if (evt.type === "message") {
            this.pool.handleMessage(s.entry, evt.event.data)
          }
        })

        newSubscriptions.push({ entry: s.entry, subscription, saved: s })
      } catch {
        ctx.log(`Reconnect failed for connection ${s.entry.id}`)
      }
    }

    ctx.log(`Reconnected ${newSubscriptions.length}/${cohortSize} connections, waiting for catch-up...`)
    await ctx.sleep(5000)

    const snap = ctx.metrics.snapshot()
    const passed = snap.reconnect_gaps === 0 &&
      snap.reconnect_duplicates === 0 &&
      snap.reconnect_order_violations === 0 &&
      eventsMissed > 0

    const detail = [
      `gaps=${snap.reconnect_gaps}`,
      `dups=${snap.reconnect_duplicates}`,
      `ooo=${snap.reconnect_order_violations}`,
      `events_during_disconnect=${eventsMissed}`,
      `reconnected=${newSubscriptions.length}/${cohortSize}`,
    ].join(" ")

    ctx.log(`Reconnect result: ${passed ? "PASS" : "FAIL"} (${detail})`)
    return { name: this.name, passed, detail }
  }
}
