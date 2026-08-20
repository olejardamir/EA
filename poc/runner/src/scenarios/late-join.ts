import type { Scenario, ScenarioContext } from "./scenario.js"
import type { ConnectionPool } from "../application/connection-pool.js"
import { MATCH_IDS } from "../domain/event.js"

// §4.1: Frozen prefill depth — deterministic history depth for late-join test
// Must be <= 5000 (Nchan buffer length) and >= 100 (meaningful sample)
const PREFILL_DEPTH = 500
const NCHAN_BUFFER_CAPACITY = 5000
const ESTIMATED_EVENTS_PER_SEC = 60

// §BA FROZEN INTERPRETATION: Single late-join per run.
// With N=1 sample, p95 = p50 = p99 = max = the single observation.
// This is a frozen interpretation, NOT a robust statistical estimate.
// The evidence-suite orchestrator (§6.37) may run multiple late-join cohorts
// across repeated runs to build a meaningful sample population.

// §4.1: Reconstructed state from history replay
interface ReconstructedState {
  score: { home: number; away: number }
  clock: { period: number; elapsed: number }
}

export class LateJoinScenario implements Scenario {
  name = "late-join"
  private pool: ConnectionPool

  constructor(pool: ConnectionPool) {
    this.pool = pool
  }

  async execute(ctx: ScenarioContext): Promise<{ name: string; passed: boolean; detail: string }> {
    ctx.log("--- PHASE: LATE-JOIN TEST (canonical prefill) ---")

    const testMatch = ctx.matchIds[0] || MATCH_IDS[0]

    // §3.1: Step 1 — Publish through canonical publisher state machine
    // publishPrefill uses the same per-match serialization, candidate-state,
    // accepted-commit, and head-tracker logic as normal publishing.
    const publishStart = ctx.clock.now()
    const prefillResult = await ctx.publisher.publishPrefill(testMatch, PREFILL_DEPTH)
    const publishDuration = ctx.clock.now() - publishStart

    if (prefillResult.published < PREFILL_DEPTH) {
      ctx.log(`§3.1 Late-join: only published ${prefillResult.published}/${PREFILL_DEPTH} events in ${publishDuration}ms`)
      return { name: this.name, passed: false, detail: `prefill incomplete: ${prefillResult.published}/${PREFILL_DEPTH}` }
    }

    ctx.log(`§3.1 Late-join: canonical prefill complete, first=${prefillResult.firstSeq}, last=${prefillResult.lastSeq}, publish_time=${publishDuration}ms`)

    // §3.1: Step 2 — Freeze expected range BEFORE connection (independent of received history)
    const expectedFirstSeq = prefillResult.firstSeq
    const expectedLastSeq = prefillResult.lastSeq
    const historyExpected = expectedLastSeq - expectedFirstSeq + 1

    // §3.1: Step 3 — Freeze the committed state snapshot at the target head
    // This is the exact publisher-committed state that replay must match.
    // No fallback (score >= 0, clock >= 0) may count as successful reconstruction.
    const frozenState = prefillResult.frozenState

    // §3.1: Step 4 — Buffer capacity proof
    // The test must not be able to evict its own expected prefix during catch-up.
    // During catch-up (estimated ~2s), the publisher continues publishing live events.
    // required_capacity = expected history depth + live arrivals during catch-up
    // capacity_margin = buffer_capacity - required_capacity
    const estimatedCatchUpMs = 2000
    const liveArrivalMargin = Math.ceil((estimatedCatchUpMs / 1000) * ESTIMATED_EVENTS_PER_SEC)
    const requiredCapacity = historyExpected + liveArrivalMargin
    const capacityMargin = NCHAN_BUFFER_CAPACITY - requiredCapacity

    ctx.log(`§3.1 Late-join: buffer proof: capacity=${NCHAN_BUFFER_CAPACITY}, expected_depth=${historyExpected}, live_margin=${liveArrivalMargin}, required=${requiredCapacity}, margin=${capacityMargin}`)

    if (capacityMargin < 0) {
      ctx.log(`§3.1 Late-join: FAIL — buffer capacity insufficient: required=${requiredCapacity} > capacity=${NCHAN_BUFFER_CAPACITY}`)
      return { name: this.name, passed: false, detail: `buffer insufficient: required=${requiredCapacity} > capacity=${NCHAN_BUFFER_CAPACITY}` }
    }

    // §3.1: Step 5 — Start late-join timing immediately before connection initiation
    const startTime = ctx.clock.now()

    try {
      // §3.1: Step 6 — Connect to /history/ endpoint
      const url = `${ctx.config.historyUrl}/history/${testMatch}`
      const subscription = await ctx.eventStream.connect(url)

      // §3.1: Step 7 — Receive and validate history through frozen target head
      const historyEvents: string[] = []
      let receivedFirstSeq = -1
      let receivedLastSeq = -1
      let reconstructedState: ReconstructedState | null = null

      const result = await new Promise<{ caughtUp: boolean; duration: number }>((resolve) => {
        const timeout = setTimeout(() => {
          subscription.close()
          resolve({ caughtUp: false, duration: ctx.clock.now() - startTime })
        }, 15000)

        subscription.onEvent((evt) => {
          if (evt.type !== "message") return
          try {
            const data = JSON.parse(evt.event.data)
            if (!data || typeof data.canonical_seq !== "number") return

            historyEvents.push(evt.event.data)
            if (receivedFirstSeq === -1) receivedFirstSeq = data.canonical_seq
            receivedLastSeq = data.canonical_seq

            // §3.1: Reconstruct score/clock from replay (no fallback defaults)
            if (data.score && typeof data.score.home === "number" && typeof data.score.away === "number"
              && data.clock && typeof data.clock.period === "number" && typeof data.clock.elapsed === "number") {
              reconstructedState = {
                score: { home: data.score.home, away: data.score.away },
                clock: { period: data.clock.period, elapsed: data.clock.elapsed },
              }
            }

            // §3.1: Continue until we reach the frozen target head
            if (data.canonical_seq >= expectedLastSeq) {
              clearTimeout(timeout)
              subscription.close()
              resolve({ caughtUp: true, duration: ctx.clock.now() - startTime })
            }
          } catch {}
        })
      })

      ctx.metrics.recordLateJoinLatency(result.duration)

      // §3.1: Step 8 — Detect missing, duplicate, and out-of-order canonical sequences
      const { missing, duplicates, outOfOrder } = this.validateHistory(historyEvents)

      // §3.1: Step 9 — Compare reconstructed state with the frozen committed state snapshot
      // No fallback: if the frozen state is null (publisher never committed), comparison fails.
      const scoreMatches = this.compareScore(reconstructedState, frozenState)
      const clockMatches = this.compareClock(reconstructedState, frozenState)
      const headMatches = receivedLastSeq >= expectedLastSeq

      // §3.1: Step 10 — Wire delivery accounting (expected is independent of received)
      ctx.metrics.incrementLateJoinHistoryExpected(historyExpected)
      ctx.metrics.incrementLateJoinHistoryReceived(historyEvents.length)

      const detail = [
        `expected_first_seq=${expectedFirstSeq}`,
        `received_first_seq=${receivedFirstSeq}`,
        `expected_last_seq=${expectedLastSeq}`,
        `received_last_seq=${receivedLastSeq}`,
        `history_expected=${historyExpected}`,
        `history_received=${historyEvents.length}`,
        `missing_history_sequences=${missing}`,
        `duplicate_history_sequences=${duplicates}`,
        `out_of_order_history_sequences=${outOfOrder}`,
        `catch_up_ms=${result.duration}`,
        `reconstructed_score_matches=${scoreMatches}`,
        `reconstructed_clock_matches=${clockMatches}`,
        `reconstructed_head_matches=${headMatches}`,
        `buffer_capacity=${NCHAN_BUFFER_CAPACITY}`,
        `live_arrival_margin=${liveArrivalMargin}`,
        `prefill_events=${prefillResult.published}`,
        `prefill_ms=${publishDuration}`,
      ].join(" ")

      if (result.caughtUp && missing === 0 && duplicates === 0 && outOfOrder === 0) {
        ctx.log(`§3.1 Late-join: PASS (${detail})`)
        return { name: this.name, passed: result.duration <= 2000, detail }
      }

      if (!result.caughtUp) {
        ctx.log(`§3.1 Late-join: timed out waiting for catch-up`)
        return { name: this.name, passed: false, detail: `timed out: ${detail}` }
      }

      ctx.log(`§3.1 Late-join: FAIL (${detail})`)
      return { name: this.name, passed: false, detail }
    } catch (err) {
      ctx.log(`§3.1 Late-join: connection failed: ${err}`)
      return { name: this.name, passed: false, detail: `connection failed: ${err}` }
    }
  }

  // §3.1: Validate history replay for missing/duplicate/out-of-order sequences
  private validateHistory(events: string[]): { missing: number; duplicates: number; outOfOrder: number } {
    let missing = 0
    let duplicates = 0
    let outOfOrder = 0
    const seen = new Set<number>()
    let prevSeq = -1

    for (const raw of events) {
      try {
        const data = JSON.parse(raw)
        if (typeof data.canonical_seq !== "number") continue

        const seq = data.canonical_seq

        if (seen.has(seq)) {
          duplicates++
        }
        seen.add(seq)

        if (prevSeq !== -1 && seq < prevSeq) {
          outOfOrder++
        }

        if (prevSeq !== -1 && seq > prevSeq + 1) {
          missing += seq - prevSeq - 1
        }

        prevSeq = seq
      } catch {}
    }

    return { missing, duplicates, outOfOrder }
  }

  // §3.1: Compare reconstructed score with the exact frozen state snapshot
  // No fallback: null frozenState means publisher never committed → comparison fails.
  private compareScore(
    reconstructed: ReconstructedState | null,
    frozenState: { seq: number; score: { home: number; away: number }; clock: { period: number; elapsed: number } } | null,
  ): boolean {
    if (!reconstructed || !frozenState) return false
    return reconstructed.score.home === frozenState.score.home
      && reconstructed.score.away === frozenState.score.away
  }

  // §3.1: Compare reconstructed clock with the exact frozen state snapshot
  private compareClock(
    reconstructed: ReconstructedState | null,
    frozenState: { seq: number; score: { home: number; away: number }; clock: { period: number; elapsed: number } } | null,
  ): boolean {
    if (!reconstructed || !frozenState) return false
    return reconstructed.clock.period === frozenState.clock.period
      && reconstructed.clock.elapsed === frozenState.clock.elapsed
  }
}
