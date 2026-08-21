import type { Scenario, ScenarioContext } from "./scenario.js"
import type { ConnectionPool } from "../application/connection-pool.js"
import { MATCH_IDS } from "../domain/event.js"
import { redisSet, redisGet } from "../adapters/redis-run-isolation.js"

// §4.1: Frozen prefill depth — deterministic history depth for late-join test
// Must be <= 5000 (Nchan buffer length) and >= 100 (meaningful sample)
const PREFILL_DEPTH = 500
const NCHAN_BUFFER_CAPACITY = 5000
const ESTIMATED_EVENTS_PER_SEC = 60
const HISTORY_SAFETY_MARGIN = 256
// §v2.1.0: follower shards poll the shared Redis expectation key until the
// publisher-owner freezes it. Bounded so a lost owner cannot hang the run.
const FOLLOWER_POLL_TIMEOUT_MS = 90_000
const FOLLOWER_POLL_INTERVAL_MS = 500

// §v2.1.0 FROZEN INTERPRETATION: one late-join sample PER SHARD per run.
// Every shard probes its OWN partition node's /history endpoint against the
// same owner-frozen expectation, so no independent history/fan-out ownership
// domain can escape verification (§26). With S shards there are exactly S
// samples per run; the coordinator gates on count === shardCount.

// §4.1/§3.1.A: Reconstructed state from history replay
// Uses the frozen application event schema: clock.period is a string ("1H"/"2H"),
// clock.elapsed_seconds is a number. The head tracker stores numeric period (1/2) but
// replay comparison must use the raw event schema.
interface ReconstructedState {
  score: { home: number; away: number }
  clock: { period: string; elapsed_seconds: number }
}

// §v2.1.0: owner-frozen late-join expectation handed to every follower shard
// through the shared canonical Redis. Written AFTER prefill completes; the JSON
// payload is immutable evidence of the exact range and committed state.
export interface LateJoinExpectation {
  match_id: string
  expected_first_seq: number
  expected_last_seq: number
  frozen_state: {
    seq: number
    score: { home: number; away: number }
    clock: { period: string; elapsed: number }
  }
  prefill_events: number
}

export class LateJoinScenario implements Scenario {
  name = "late-join"
  private pool: ConnectionPool
  private role: "owner" | "follower"
  private experimentRunId: string

  constructor(pool: ConnectionPool, opts: { role: "owner" | "follower"; experimentRunId: string }) {
    this.pool = pool
    this.role = opts.role
    this.experimentRunId = opts.experimentRunId
  }

  async execute(ctx: ScenarioContext): Promise<{ name: string; passed: boolean; detail: string }> {
    if (this.role === "owner") {
      return this.executeOwner(ctx)
    }
    return this.executeFollower(ctx)
  }

  private expectationKey(): string {
    return `latejoin_expectation:${this.experimentRunId}`
  }

  // Owner: canonical prefill through the publisher state machine, freeze the
  // expectation into shared Redis, then probe its own partition node.
  private async executeOwner(ctx: ScenarioContext): Promise<{ name: string; passed: boolean; detail: string }> {
    ctx.log("--- PHASE: LATE-JOIN TEST (canonical prefill + per-partition sampling) ---")

    const testMatch = ctx.matchIds[0] || MATCH_IDS[0]

    // §3.1: Step 1 — Publish through canonical publisher state machine
    const publishStart = ctx.clock.now()
    const prefillResult = await ctx.publisher.publishPrefill(testMatch, PREFILL_DEPTH)
    const publishDuration = ctx.clock.now() - publishStart

    if (prefillResult.published < PREFILL_DEPTH) {
      ctx.log(`§3.1 Late-join: only published ${prefillResult.published}/${PREFILL_DEPTH} events in ${publishDuration}ms`)
      return { name: this.name, passed: false, detail: `prefill incomplete: ${prefillResult.published}/${PREFILL_DEPTH}` }
    }
    if (!prefillResult.frozenState) {
      ctx.log("§3.1 Late-join: publisher did not commit a frozen state snapshot")
      return { name: this.name, passed: false, detail: "prefill produced no frozen state" }
    }

    ctx.log(`§3.1 Late-join: canonical prefill complete, first=${prefillResult.firstSeq}, last=${prefillResult.lastSeq}, publish_time=${publishDuration}ms`)

    // §v2.1.0: Freeze the expectation and hand it to every follower shard via
    // the shared canonical Redis BEFORE any probe runs.
    const expectation: LateJoinExpectation = {
      match_id: testMatch,
      expected_first_seq: 1,
      expected_last_seq: prefillResult.lastSeq,
      frozen_state: prefillResult.frozenState,
      prefill_events: prefillResult.published,
    }
    try {
      await redisSet(ctx.config.redisUrl, this.expectationKey(), JSON.stringify(expectation))
    } catch (err) {
      ctx.log(`§v2.1.0 Late-join: failed to publish expectation to Redis: ${err}`)
      return { name: this.name, passed: false, detail: `expectation publish failed: ${err}` }
    }
    ctx.log(`§v2.1.0 Late-join: expectation frozen in Redis key=${this.expectationKey()}`)

    return this.runHistoryProbe(ctx, expectation)
  }

  // Follower: poll the shared expectation, then probe its OWN partition node's
  // /history endpoint against the identical frozen range/state.
  private async executeFollower(ctx: ScenarioContext): Promise<{ name: string; passed: boolean; detail: string }> {
    ctx.log("--- PHASE: LATE-JOIN TEST (follower: per-partition history sampling) ---")

    const deadline = Date.now() + FOLLOWER_POLL_TIMEOUT_MS
    let raw: string | null = null
    while (Date.now() < deadline) {
      try {
        raw = await redisGet(ctx.config.redisUrl, this.expectationKey())
      } catch (err) {
        ctx.log(`§v2.1.0 Late-join follower: Redis poll error (will retry): ${err}`)
      }
      if (raw !== null) break
      await ctx.sleep(FOLLOWER_POLL_INTERVAL_MS)
    }
    if (raw === null) {
      return { name: this.name, passed: false, detail: `expectation key ${this.expectationKey()} not published within ${FOLLOWER_POLL_TIMEOUT_MS}ms` }
    }

    let expectation: LateJoinExpectation
    try {
      expectation = JSON.parse(raw) as LateJoinExpectation
    } catch (err) {
      return { name: this.name, passed: false, detail: `expectation malformed: ${err}` }
    }
    if (typeof expectation.expected_last_seq !== "number"
      || typeof expectation.expected_first_seq !== "number"
      || !expectation.frozen_state
      || typeof expectation.match_id !== "string") {
      return { name: this.name, passed: false, detail: "expectation failed schema validation" }
    }

    ctx.log(`§v2.1.0 Late-join follower: probing own partition for ${expectation.match_id} range=[${expectation.expected_first_seq}..${expectation.expected_last_seq}]`)
    return this.runHistoryProbe(ctx, expectation)
  }

  // Shared probe: connect to THIS shard's configured history URL (its own
  // partition node), validate the full frozen range and reconstructed state.
  private async runHistoryProbe(
    ctx: ScenarioContext,
    expectation: LateJoinExpectation,
  ): Promise<{ name: string; passed: boolean; detail: string }> {
    const testMatch = expectation.match_id
    const expectedFirstSeq = expectation.expected_first_seq
    const expectedLastSeq = expectation.expected_last_seq
    const frozenState = expectation.frozen_state
    const historyExpected = expectedLastSeq - expectedFirstSeq + 1

    // §3.1: Step 4 — Buffer capacity proof
    const estimatedCatchUpMs = 2000
    const liveArrivalMargin = Math.ceil((estimatedCatchUpMs / 1000) * ESTIMATED_EVENTS_PER_SEC)
    const requiredCapacity = historyExpected + liveArrivalMargin + HISTORY_SAFETY_MARGIN
    const capacityMargin = NCHAN_BUFFER_CAPACITY - requiredCapacity

    ctx.log(`§3.1 Late-join: buffer proof: oldest_required_seq=${expectedFirstSeq}, target_head=${expectedLastSeq}, capacity=${NCHAN_BUFFER_CAPACITY}, expected_depth=${historyExpected}, live_margin=${liveArrivalMargin}, safety_margin=${HISTORY_SAFETY_MARGIN}, required=${requiredCapacity}, margin=${capacityMargin}`)

    if (capacityMargin < 0) {
      ctx.log(`§3.1 Late-join: FAIL — buffer capacity insufficient: required=${requiredCapacity} > capacity=${NCHAN_BUFFER_CAPACITY}`)
      return { name: this.name, passed: false, detail: `buffer insufficient: required=${requiredCapacity} > capacity=${NCHAN_BUFFER_CAPACITY}` }
    }

    // §3.1: Step 5 — Start late-join timing immediately before connection initiation
    const startTime = ctx.clock.now()

    try {
      // §3.1: Step 6 — Connect to /history/ endpoint on this shard's partition node
      const url = `${ctx.config.historyUrl}/history/${testMatch}`
      const subscription = await ctx.eventStream.connect(url)

      // §3.1: Step 7 — Receive and validate history through frozen target head
      const historyEvents: string[] = []
      let receivedFirstSeq = -1
      let receivedLastSeq = -1
      let reconstructedState: ReconstructedState | null = null
      let replayComplete = false

      const result = await new Promise<{ caughtUp: boolean; duration: number }>((resolve) => {
        const timeout = setTimeout(() => {
          subscription.close()
          resolve({ caughtUp: false, duration: ctx.clock.now() - startTime })
        }, 15000)

        subscription.onEvent((evt) => {
          if (evt.type !== "message" || replayComplete) return
          try {
            const data = JSON.parse(evt.event.data)
            if (!data || typeof data.canonical_seq !== "number") return

            historyEvents.push(evt.event.data)
            if (receivedFirstSeq === -1) receivedFirstSeq = data.canonical_seq
            receivedLastSeq = data.canonical_seq

            // §3.1.A: Reconstruct score/clock from replay using the actual event schema.
            if (data.canonical_seq <= expectedLastSeq
              && data.score && typeof data.score.home === "number" && typeof data.score.away === "number"
              && data.clock && typeof data.clock.period === "string" && typeof data.clock.elapsed_seconds === "number") {
              reconstructedState = {
                score: { home: data.score.home, away: data.score.away },
                clock: { period: data.clock.period, elapsed_seconds: data.clock.elapsed_seconds },
              }
            }

            // §3.1: Continue until we reach the frozen target head
            if (data.canonical_seq >= expectedLastSeq) {
              replayComplete = true
              clearTimeout(timeout)
              subscription.close()
              resolve({ caughtUp: true, duration: ctx.clock.now() - startTime })
            }
          } catch {}
        })
      })

      ctx.metrics.recordLateJoinLatency(result.duration)

      // Validate full retained active-match history, including same-run events
      // published before the deterministic prefill.
      const { missing, duplicates, outOfOrder } = this.validateHistoryRange(historyEvents, expectedFirstSeq, expectedLastSeq)

      // §3.1.C/E: Missing prefix detection
      const receivedRequiredSeqs = new Set<number>()
      for (const raw of historyEvents) {
        try {
          const data = JSON.parse(raw)
          if (typeof data.canonical_seq === "number" && data.canonical_seq >= expectedFirstSeq && data.canonical_seq <= expectedLastSeq) {
            receivedRequiredSeqs.add(data.canonical_seq)
          }
        } catch {}
      }
      const prefixMatches = receivedRequiredSeqs.has(expectedFirstSeq)
      const missingPrefix = !prefixMatches

      // §3.1: Step 10 — Compare reconstructed state with the frozen committed state snapshot
      const scoreMatches = this.compareScore(reconstructedState, frozenState)
      const clockMatches = this.compareClock(reconstructedState, frozenState)
      const headMatches = receivedLastSeq >= expectedLastSeq

      // §3.1.E: Count events within the required range only
      const requiredRangeCount = receivedRequiredSeqs.size

      // §3.1: Step 11 — Wire delivery accounting (expected is independent of received)
      ctx.metrics.incrementLateJoinHistoryExpected(historyExpected)
      ctx.metrics.incrementLateJoinHistoryReceived(requiredRangeCount)

      const detail = [
        `role=${this.role}`,
        `partition_node=${ctx.config.historyUrl}`,
        `expected_first_seq=${expectedFirstSeq}`,
        `oldest_required_seq=${expectedFirstSeq}`,
        `received_first_seq=${receivedFirstSeq}`,
        `expected_last_seq=${expectedLastSeq}`,
        `received_last_seq=${receivedLastSeq}`,
        `history_expected=${historyExpected}`,
        `history_received_total=${historyEvents.length}`,
        `history_received_required=${requiredRangeCount}`,
        `missing_required_sequences=${missing}`,
        `duplicate_required_sequences=${duplicates}`,
        `out_of_order_required_sequences=${outOfOrder}`,
        `missing_prefix=${missingPrefix}`,
        `prefix_matches=${prefixMatches}`,
        `catch_up_ms=${result.duration}`,
        `reconstructed_score_matches=${scoreMatches}`,
        `reconstructed_clock_matches=${clockMatches}`,
        `reconstructed_head_matches=${headMatches}`,
        `count_matches=${requiredRangeCount === historyExpected}`,
        `buffer_capacity=${NCHAN_BUFFER_CAPACITY}`,
        `buffer_safety_margin=${HISTORY_SAFETY_MARGIN}`,
        `live_arrival_margin=${liveArrivalMargin}`,
        `prefill_events=${expectation.prefill_events}`,
        `active_start=${ctx._activePopulationStart ?? this.pool.size}`,
        `active_peak=${(ctx._activePopulationStart ?? this.pool.size) + 1}`,
        `active_end=${this.pool.size}`,
      ].join(" ")

      // §3.1.B-F: PASS requires ALL of:
      // - caughtUp within timeout
      // - no missing/duplicate/out-of-order within required range
      // - required first seq present in received stream
      // - required range count == expected count
      // - reconstruction all matches (score, clock, head)
      // - catch_up_ms <= 2000
      const countMatches = requiredRangeCount === historyExpected

      if (result.caughtUp && missing === 0 && duplicates === 0 && outOfOrder === 0
        && scoreMatches && clockMatches && headMatches && prefixMatches && countMatches) {
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
    } finally {
      // §3.11.C/§3.14: Record active population for this scenario
      const startPop = ctx._activePopulationStart ?? this.pool.size
      ctx._lateJoinActivePopulation = {
        start: startPop,
        peak: startPop + 1,
        end: this.pool.size,
      }
    }
  }

  // §3.1.E: Validate history replay within a required range only.
  // Events outside [rangeStart, rangeEnd] are accepted but not validated.
  // Gaps, duplicates, and out-of-order are counted only within the required range.
  private validateHistoryRange(events: string[], rangeStart: number, rangeEnd: number): { missing: number; duplicates: number; outOfOrder: number } {
    let missing = 0
    let duplicates = 0
    let outOfOrder = 0
    const seen = new Set<number>()
    let prevSeq: number | null = null

    for (const raw of events) {
      try {
        const data = JSON.parse(raw)
        if (typeof data.canonical_seq !== "number") continue
        const seq = data.canonical_seq

        // Only validate events within the required range
        if (seq < rangeStart || seq > rangeEnd) continue

        if (seen.has(seq)) {
          duplicates++
        }
        seen.add(seq)

        if (prevSeq !== null && seq < prevSeq) {
          outOfOrder++
        }

        if (prevSeq !== null && seq > prevSeq + 1) {
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
    frozenState: { seq: number; score: { home: number; away: number }; clock: { period: string; elapsed: number } } | null,
  ): boolean {
    if (!reconstructed || !frozenState) return false
    return reconstructed.score.home === frozenState.score.home
      && reconstructed.score.away === frozenState.score.away
  }

  // §3.1.A: Compare reconstructed clock with the frozen state snapshot.
  private compareClock(
    reconstructed: ReconstructedState | null,
    frozenState: { seq: number; score: { home: number; away: number }; clock: { period: string; elapsed: number } } | null,
  ): boolean {
    if (!reconstructed || !frozenState) return false
    return reconstructed.clock.period === frozenState.clock.period
      && reconstructed.clock.elapsed_seconds === frozenState.clock.elapsed
  }
}
