import type { Scenario, ScenarioContext } from "./scenario.js"
import type { ConnectionPool, ConnectionEntry } from "../application/connection-pool.js"
import type { EventStream, Subscription } from "../ports/event-stream.js"

const CATCH_UP_POLL_MS = 200
const CATCH_UP_TIMEOUT_MS = 10000

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

    // §3.4/§3.5: Save state BEFORE disconnect — frozen at disconnect boundary
    const saved = cohort.map((entry) => ({
      entry,
      lastEventId: entry.subscription.lastEventId,
      headBefore: ctx.headTracker.getHead(entry.matchId),
      trackerLastSeq: entry.tracker.lastSeq,
      trackerReceivedBefore: entry.tracker.totalReceived,
    }))

    ctx.log(`Reconnect cohort: ${cohortSize}/${all.length} connections`)
    ctx.log(`Pre-disconnect heads: ${saved.map((s) => `${s.entry.matchId}=${s.headBefore}`).join(", ")}`)

    // §3.4: Remove cohort from active pool BEFORE closing streams
    for (const s of saved) {
      s.entry.subscription.close()
      this.pool.removeActiveEntry(s.entry, "deliberate_reconnect_cohort")
    }
    ctx.log(`Disconnected ${cohortSize} connections and removed from active pool`)

    // §3.5: Freeze target head at disconnect boundary — independent of subsequent events
    const targetHeadAtDisconnect = new Map<string, number>()
    for (const s of saved) {
      targetHeadAtDisconnect.set(s.entry.matchId, ctx.headTracker.getHead(s.entry.matchId))
    }

    const activeAtScenarioStart = this.pool.size
    ctx.log(`active_at_scenario_start=${activeAtScenarioStart}`)

    await ctx.sleep(2000)

    const eventsDuringDisconnect = saved.map((s) => {
      const headAfter = ctx.headTracker.getHead(s.entry.matchId)
      return headAfter - s.headBefore
    }).reduce((a, b) => a + b, 0)

    ctx.log(`Events published during disconnect window: ${eventsDuringDisconnect}`)

    // §3.5: Per-client frozen expected replay — independent of received data
    const perClientExpected = saved.map((s) => {
      const targetHead = targetHeadAtDisconnect.get(s.entry.matchId) ?? s.headBefore
      const expectedFirst = (s.trackerLastSeq ?? 0) + 1
      const expectedLast = targetHead
      const expectedCount = Math.max(0, expectedLast - expectedFirst + 1)
      return {
        entryId: s.entry.id,
        matchId: s.entry.matchId,
        savedLastSeq: s.trackerLastSeq ?? 0,
        targetHead,
        expectedFirst,
        expectedLast,
        expectedCount,
        caughtUpAt: 0 as number,
      }
    })

    const newSubscriptions: Array<{ entry: ConnectionEntry; subscription: Subscription; saved: typeof saved[number]; perClient: typeof perClientExpected[number] }> = []
    for (const s of saved) {
      const matchId = s.entry.matchId
      const url = `${ctx.config.nchanSubUrl}/sub/${matchId}`
      const pc = perClientExpected.find((p) => p.entryId === s.entry.id)

      try {
        const subscription = await ctx.eventStream.connect(url, s.lastEventId)
        s.entry.subscription = subscription
        s.entry.mode = "reconnect"

        subscription.onEvent((evt) => {
          if (!this.pool.running) return
          if (evt.type === "message") {
            // §3.5: Pass transport ID through
            this.pool.handleMessage(s.entry, evt.event.data, evt.event.id)
          } else if (evt.type === "error") {
            // §3.4: Terminal stream error — remove from active pool
            this.pool.removeActiveEntry(s.entry, "reconnected_stream_error")
          }
        })

        this.pool.addActiveEntry(s.entry)
        newSubscriptions.push({ entry: s.entry, subscription, saved: s, perClient: pc! })
      } catch {
        ctx.log(`Reconnect failed for connection ${s.entry.id}`)
      }
    }

    const activeAfterReconnect = this.pool.size
    ctx.log(`Reconnected ${newSubscriptions.length}/${cohortSize} connections (active=${activeAfterReconnect})`)

    // §3.5: Poll for catch-up — transition each client to live mode when caught up
    const catchUpStart = ctx.clock.now()
    let allCaughtUp = false
    while (!allCaughtUp && (ctx.clock.now() - catchUpStart) < CATCH_UP_TIMEOUT_MS) {
      await ctx.sleep(CATCH_UP_POLL_MS)
      allCaughtUp = true
      for (const ns of newSubscriptions) {
        const currentSeq = ns.entry.tracker.lastSeq
        if (currentSeq < ns.perClient.expectedLast) {
          allCaughtUp = false
        } else if (ns.perClient.caughtUpAt === 0) {
          ns.perClient.caughtUpAt = ctx.clock.now() - catchUpStart
        }
      }
    }

    // §3.5: Transition to live/steady mode
    for (const ns of newSubscriptions) {
      ns.entry.mode = "steady"
    }

    // Brief steady period to verify live delivery works post-catch-up
    await ctx.sleep(1000)

    const activeAtScenarioEnd = this.pool.size

    // §3.5: Replay accounting from frozen expected, not received
    let totalExpectedReplay = 0
    for (const pc of perClientExpected) {
      totalExpectedReplay += pc.expectedCount
    }

    let cohortReplayReceived = 0
    for (const ns of newSubscriptions) {
      cohortReplayReceived += ns.entry.tracker.totalReceived - ns.saved.trackerReceivedBefore
    }

    ctx.metrics.incrementReconnectReplayExpected(totalExpectedReplay)
    ctx.metrics.incrementReconnectReplayReceived(cohortReplayReceived)

    const avgCatchUpMs = perClientExpected.reduce((s, p) => s + p.caughtUpAt, 0) / perClientExpected.length
    const maxTargetHead = Math.max(...perClientExpected.map((p) => p.targetHead))

    const snap = ctx.metrics.snapshot()
    const passed = snap.reconnect_gaps === 0 &&
      snap.reconnect_duplicates === 0 &&
      snap.reconnect_order_violations === 0 &&
      eventsDuringDisconnect > 0

    const detail = [
      `gaps=${snap.reconnect_gaps}`,
      `dups=${snap.reconnect_duplicates}`,
      `ooo=${snap.reconnect_order_violations}`,
      `events_during_disconnect=${eventsDuringDisconnect}`,
      `reconnected=${newSubscriptions.length}/${cohortSize}`,
      `reconnect_expected=${totalExpectedReplay}`,
      `reconnect_received=${cohortReplayReceived}`,
      `reconnect_target_head=${maxTargetHead}`,
      `reconnect_caught_up_ms=${Math.round(avgCatchUpMs)}`,
      `active_at_scenario_start=${activeAtScenarioStart}`,
      `active_at_scenario_end=${activeAtScenarioEnd}`,
      `active_peak=${Math.max(activeAtScenarioStart, activeAfterReconnect)}`,
    ].join(" ")

    ctx.log(`Reconnect result: ${passed ? "PASS" : "FAIL"} (${detail})`)
    return { name: this.name, passed, detail }
  }
}
