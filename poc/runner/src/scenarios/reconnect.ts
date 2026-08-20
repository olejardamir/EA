import type { Scenario, ScenarioContext } from "./scenario.js"
import type { ReconnectClientResult } from "./scenario.js"
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

    // §3.5.F: Capture active population BEFORE removing cohort — true pre-disconnect population
    const activeBeforeDisconnect = this.pool.size

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
    ctx.log(`active_before_disconnect=${activeBeforeDisconnect}`)

    // §3.4: Remove cohort from active pool BEFORE closing streams
    for (const s of saved) {
      s.entry.subscription.close()
      this.pool.removeActiveEntry(s.entry, "deliberate_reconnect_cohort")
    }
    ctx.log(`Disconnected ${cohortSize} connections and removed from active pool`)

    const activeDuringDisconnect = this.pool.size
    ctx.log(`active_during_disconnect=${activeDuringDisconnect}`)

    // §3.5.A: Wait for the disconnected publication window — publisher continues during this time
    await ctx.sleep(2000)

    // §3.5.A: Freeze target head AFTER the disconnected publication window
    // This includes the events that are the main point of the reconnect test
    const targetHeadAtReconnectStart = new Map<string, number>()
    for (const s of saved) {
      targetHeadAtReconnectStart.set(s.entry.matchId, ctx.headTracker.getHead(s.entry.matchId))
    }

    const eventsDuringDisconnect = saved.map((s) => {
      const headAfter = ctx.headTracker.getHead(s.entry.matchId)
      return headAfter - s.headBefore
    }).reduce((a, b) => a + b, 0)

    ctx.log(`Events published during disconnect window: ${eventsDuringDisconnect}`)

    // §3.5: Per-client frozen expected replay — independent of received data
    // Expected = events between saved cursor and head at reconnect start (after disconnected window)
    const perClientExpected = saved.map((s) => {
      const targetHead = targetHeadAtReconnectStart.get(s.entry.matchId) ?? s.headBefore
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
        replayReceived: 0 as number,
        firstReceivedSeq: null as number | null,
        // §M2-5: Per-client replay integrity counters
        duplicates: 0 as number,
        outOfOrder: 0 as number,
        reestablished: false,
      }
    })

    const newSubscriptions: Array<{ entry: ConnectionEntry; subscription: Subscription; saved: typeof saved[number]; perClient: typeof perClientExpected[number] }> = []
    // §M2-5: Track which intended clients actually re-established their subscription.
    // A client only counts as reconnected when connect() succeeded — not merely because
    // it appears in the expected list (or because expected=0/received=0 trivially matches).
    const reestablishedIds = new Set<number>()
    for (const s of saved) {
      const matchId = s.entry.matchId
      const url = `${ctx.config.nchanSubUrl}/sub/${matchId}`
      const pc = perClientExpected.find((p) => p.entryId === s.entry.id)

      try {
        const subscription = await ctx.eventStream.connect(url, s.lastEventId)
        s.entry.subscription = subscription
        s.entry.mode = "reconnect"
        reestablishedIds.add(s.entry.id)

        // §3.5.B: Track replay received per-client, stop counting at frozen target
        let replayStopped = false
        // §M2-5: Per-client replay integrity tracking within the frozen range
        const seenSeqs = new Set<number>()
        let prevSeq: number | null = null
        subscription.onEvent((evt) => {
          if (!this.pool.running) return
          if (evt.type === "message") {
            if (!replayStopped && pc) {
              try {
                const data = JSON.parse(evt.event.data)
                if (typeof data.canonical_seq === "number") {
                  const seq = data.canonical_seq as number
                  if (pc.firstReceivedSeq === null) pc.firstReceivedSeq = seq
                  // §3.5.B: Only count replay frames up to the frozen target
                  if (seq <= pc.targetHead) {
                    pc.replayReceived++
                    // §M2-5: Per-client duplicate/out-of-order detection within required range
                    if (seenSeqs.has(seq)) pc.duplicates++
                    else seenSeqs.add(seq)
                    if (prevSeq !== null && seq < prevSeq) pc.outOfOrder++
                    prevSeq = seq
                  } else {
                    replayStopped = true
                  }
                }
              } catch {}
            }
            // §3.5: Pass transport ID through
            this.pool.handleMessage(s.entry, evt.event.data, evt.event.id)
          } else if (evt.type === "error") {
            // §3.4/§3.14: Terminal stream error — remove from active pool with proper attribution
            const msg = evt.error?.message ?? ""
            let category: "deliberate" | "network" | "server_initiated" | "unexpected" = "unexpected"
            if (/ECONNREFUSED|ETIMEDOUT|ECONNRESET|EPIPE|socket hang up|network|fetch failed/i.test(msg)) {
              category = "network"
            } else if (/stream ended/i.test(msg)) {
              category = "server_initiated"
            }
            this.pool.removeActiveEntry(s.entry, "reconnected_stream_error", category)
          }
        })

        this.pool.addActiveEntry(s.entry)
        newSubscriptions.push({ entry: s.entry, subscription, saved: s, perClient: pc! })
      } catch {
        ctx.log(`Reconnect failed for connection ${s.entry.id}`)
      }
    }

    // §M2-5: Mark which clients actually re-established
    for (const pc of perClientExpected) {
      pc.reestablished = reestablishedIds.has(pc.entryId)
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
    // §M2-5: allReconnectedCount counts only clients whose subscription was actually
    // re-established — never the full expected cohort by construction.
    let totalExpectedReplay = 0
    let totalReceivedReplay = 0
    let allReconnectedCount = 0
    let allReachedTarget = 0
    let missingPrefixCount = 0

    for (const pc of perClientExpected) {
      totalExpectedReplay += pc.expectedCount
      totalReceivedReplay += Math.min(pc.replayReceived, pc.expectedCount)
      if (pc.reestablished) allReconnectedCount++
      // §M2-5: target_reached requires re-establishment AND full required replay.
      // expected=0/received=0 alone does NOT count as success.
      const targetReached = pc.reestablished && pc.replayReceived >= pc.expectedCount
      if (targetReached) allReachedTarget++
      // §3.5.E: Missing prefix detection
      if (pc.expectedFirst > 0 && pc.firstReceivedSeq !== null && pc.firstReceivedSeq !== pc.expectedFirst) {
        missingPrefixCount++
      }
    }

    // §M2-5: Structured per-client results
    const perClientResults: ReconnectClientResult[] = perClientExpected.map((pc) => ({
      connection_id: pc.entryId,
      match_id: pc.matchId,
      subscription_reestablished: pc.reestablished,
      saved_last_seq: pc.savedLastSeq,
      expected_first_seq: pc.expectedFirst,
      expected_last_seq: pc.expectedLast,
      expected_count: pc.expectedCount,
      first_received_seq: pc.firstReceivedSeq,
      received_required_count: Math.min(pc.replayReceived, pc.expectedCount),
      missing: Math.max(0, pc.expectedCount - pc.replayReceived),
      duplicates: pc.duplicates,
      out_of_order: pc.outOfOrder,
      target_reached: pc.reestablished && pc.replayReceived >= pc.expectedCount,
      catch_up_ms: pc.caughtUpAt,
    }))
    ctx._reconnectPerClient = perClientResults

    ctx.metrics.incrementReconnectReplayExpected(totalExpectedReplay)
    ctx.metrics.incrementReconnectReplayReceived(totalReceivedReplay)

    const avgCatchUpMs = perClientExpected.reduce((s, p) => s + p.caughtUpAt, 0) / perClientExpected.length
    const maxTargetHead = Math.max(...perClientExpected.map((p) => p.targetHead))

    const snap = ctx.metrics.snapshot()

    // §3.5.C-F: PASS requires ALL of:
    // - no sequence tracker gaps/duplicates/order violations
    // - events were published during disconnect window
    // - all intended clients reconnected (subscription_reestablished per client — §M2-5)
    // - all intended clients reached frozen target (requires re-establishment — §M2-5)
    // - expected replay count == received replay count (per frozen target range)
    // - no missing prefix
    const allClientsReconnected = allReconnectedCount === cohortSize
    const allClientsCaughtUp = allReachedTarget === cohortSize
    const replayCountMatch = totalReceivedReplay === totalExpectedReplay
    const noMissingPrefix = missingPrefixCount === 0

    const passed = snap.reconnect_gaps === 0 &&
      snap.reconnect_duplicates === 0 &&
      snap.reconnect_order_violations === 0 &&
      eventsDuringDisconnect > 0 &&
      allClientsReconnected &&
      allClientsCaughtUp &&
      replayCountMatch &&
      noMissingPrefix

    const detail = [
      `gaps=${snap.reconnect_gaps}`,
      `dups=${snap.reconnect_duplicates}`,
      `ooo=${snap.reconnect_order_violations}`,
      `events_during_disconnect=${eventsDuringDisconnect}`,
      `reconnected=${newSubscriptions.length}/${cohortSize}`,
      `all_reconnected=${allClientsReconnected}`,
      `all_reached_target=${allClientsCaughtUp}`,
      `reconnect_expected=${totalExpectedReplay}`,
      `reconnect_received=${totalReceivedReplay}`,
      `replay_count_match=${replayCountMatch}`,
      `missing_prefix_count=${missingPrefixCount}`,
      `per_client_reestablished=[${perClientResults.map((r) => r.subscription_reestablished ? 1 : 0).join(",")}]`,
      `per_client_target_reached=${allReachedTarget}/${cohortSize}`,
      `reconnect_target_head=${maxTargetHead}`,
      `reconnect_caught_up_ms=${Math.round(avgCatchUpMs)}`,
      `active_before_disconnect=${activeBeforeDisconnect}`,
      `active_min_during_disconnect=${activeDuringDisconnect}`,
      `active_after_reconnect=${activeAfterReconnect}`,
      `active_at_scenario_end=${activeAtScenarioEnd}`,
      `active_peak=${Math.max(activeBeforeDisconnect, activeAfterReconnect)}`,
    ].join(" ")

    ctx.log(`Reconnect result: ${passed ? "PASS" : "FAIL"} (${detail})`)
    // §3.15: Write active concurrency to context for machine-readable output
    // §3.5.F: Use true pre-disconnect population for active_start
    ctx._reconnectHealth = {
      active_start: activeBeforeDisconnect,
      active_peak: Math.max(activeBeforeDisconnect, activeAfterReconnect),
      active_end: activeAtScenarioEnd,
    }
    return { name: this.name, passed, detail }
  }
}
