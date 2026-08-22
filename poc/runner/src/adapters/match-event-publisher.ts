import type { EventPublisher } from "../ports/event-publisher.js"
import type { MatchHeadTracker } from "../domain/match-state.js"
import {
  MATCH_IDS, MATCH_WEIGHTS, EVENT_TYPES,
  weightedRandom, createEventPayload, createLobbyPayload,
} from "../domain/event.js"
import { createInitialMatchStates, advanceMatchState, type MatchState } from "../domain/match-state.js"

// Non-qualifying development diagnostics (probe-only, never set in qualifying runs).
const PUB_DEBUG = process.env.PUB_DEBUG === "1"

// Busy-skip retry spin (ms). Short by design: the weighted-hot match is
// frequently in flight during burst, and a full-interval backoff here would
// collapse the effective publication rate below the frozen 40..60 window.
const BUSY_RETRY_MS = 2

// Frozen workload rates (contract §workload): steady 9/s nominal inside the
// frozen [8, 12] accepted window; burst nominal calibrated so the MEASURED
// accepted rate lands inside the frozen [40, 60] window under realistic
// event-loop lag (see finalize pacing below).
const STEADY_RATE_PER_SEC = 9
const BURST_RATE_PER_SEC = 55

export interface MatchEventPublisherConfig {
  publisher: EventPublisher
  headTracker: MatchHeadTracker
  burstMode: boolean
  random: () => number
  onPublish?: (channel: string, expectedForChannel: number) => void
  getSubscriberCount?: (channel: string) => number
}

export class MatchEventPublisher {
  private matchStates: MatchState[]
  private config: MatchEventPublisherConfig
  private running = false
  private timers: NodeJS.Timeout[] = []
  private _eventsPublished = 0
  private _totalPublished = 0
  private _eventsPublishedByMatch: Map<string, number> = new Map()
  // §3.7: Separate lobby vs match event tracking for workload-rate breakdown
  private _lobbyPublished = 0
  private _matchPublished = 0
  private _matchAttempts = 0
  private _lobbyAttempts = 0
  // §BL: Track in-flight publish promises — backlog = number of unresolved tasks
  private _pendingPublishes = 0
  // §3.5: Publisher scheduler lag tracking
  private _schedulerLagSamples: number[] = []
  // §6.20: Per-match publish lock — prevents concurrent same-match publishes from overtaking canonical order
  private _matchBusy = new Map<string, boolean>()

  constructor(config: MatchEventPublisherConfig) {
    this.config = config
    this.matchStates = createInitialMatchStates()
  }

  get burstMode(): boolean {
    return this.config.burstMode
  }

  set burstMode(value: boolean) {
    this.config.burstMode = value
  }

  get totalPublished(): number {
    return this._totalPublished
  }

  // §BL: Number of publish tasks not yet resolved (in-flight to Nchan)
  get pendingPublishes(): number {
    return this._pendingPublishes
  }

  // §3.5: Publisher scheduler lag statistics
  get schedulerLagP95(): number {
    if (this._schedulerLagSamples.length === 0) return 0
    const sorted = [...this._schedulerLagSamples].sort((a, b) => a - b)
    const idx = Math.floor(sorted.length * 0.95)
    return sorted[Math.min(idx, sorted.length - 1)]
  }

  get schedulerLagMax(): number {
    return this._schedulerLagSamples.length > 0 ? Math.max(...this._schedulerLagSamples) : 0
  }

  // §3.5: Drain accumulated scheduler lag samples and return them
  drainSchedulerLagSamples(): number[] {
    const samples = this._schedulerLagSamples
    this._schedulerLagSamples = []
    return samples
  }

  get eventsPublishedByMatch(): ReadonlyMap<string, number> {
    return this._eventsPublishedByMatch
  }

  // §3.7: Lobby vs match event counts for workload-rate breakdown
  get lobbyPublished(): number { return this._lobbyPublished }
  get matchPublished(): number { return this._matchPublished }
  get matchAttempts(): number { return this._matchAttempts }
  get lobbyAttempts(): number { return this._lobbyAttempts }

  get matchIds(): string[] {
    return [...MATCH_IDS]
  }

  snapshotAndReset(): { eventsPublished: number; byMatch: Map<string, number>; lobbyPublished: number; matchPublished: number; matchAttempts: number; lobbyAttempts: number } {
    const snapshot = {
      eventsPublished: this._eventsPublished,
      byMatch: new Map(this._eventsPublishedByMatch),
      lobbyPublished: this._lobbyPublished,
      matchPublished: this._matchPublished,
      matchAttempts: this._matchAttempts,
      lobbyAttempts: this._lobbyAttempts,
    }
    this._eventsPublished = 0
    this._eventsPublishedByMatch.clear()
    this._lobbyPublished = 0
    this._matchPublished = 0
    this._matchAttempts = 0
    this._lobbyAttempts = 0
    return snapshot
  }

  start(steadyRate = true): void {
    this.running = true
    this._eventsPublished = 0

    // One serialized publication chain PER MATCH. §6.20 requires per-match
    // canonical ordering, which a per-match serial chain provides by
    // construction while letting up to |MATCH_IDS| publishes be in flight
    // concurrently across matches. The previous single self-rescheduling loop
    // chained its continuation behind every publish's completion, so at most
    // ONE publish was ever in flight — capping throughput at 1/publish-RTT,
    // far below the frozen burst window whenever Nchan latency rises.
    // Per-chain nominal rate = global rate × match weight share, which keeps
    // the frozen workload distribution exact without per-tick reselection.
    const totalWeight = MATCH_WEIGHTS.reduce((sum, weight) => sum + weight, 0)
    MATCH_WEIGHTS.forEach((weight, matchIdx) => {
      const matchId = MATCH_IDS[matchIdx]
      const share = weight / totalWeight

      const scheduleMatchEvents = () => {
        if (!this.running) return

        const random = this.config.random

        const state = this.matchStates[matchIdx]
        const eventTypeIdx = weightedRandom(EVENT_TYPES.map((e) => e.weight), random)
        const eventType = EVENT_TYPES[eventTypeIdx].type

        // §AS: Build candidate state without mutating the committed state.
        // Clone current state, advance the clone, and build the payload from it.
        // The committed state is only updated after an unambiguous Nchan acceptance.
        const candidate: MatchState = {
          seq: state.seq,
          score: { ...state.score },
          clock: { ...state.clock },
          last_event_type: state.last_event_type,
        }
        advanceMatchState(candidate, eventType, random)

        // §3.5: Freeze T0 at creation time — this is what gets serialized and transmitted.
        // publish_timestamp in the JSON body is the transmitted clock reference.
        // Acceptance time is measured separately for scheduler lag computation.
        const publishStartMs = Date.now()
        const transmitTimestamp = new Date().toISOString()
        const event = createEventPayload(matchId, candidate.seq, eventType, candidate.score, candidate.clock, transmitTimestamp)
        const body = JSON.stringify(event)

        const finalize = () => {
          this._matchBusy.set(matchId, false)
          // Nominal 55/s burst target split by match share: measured accepted
          // rate must land inside the frozen [40, 60] events/s window;
          // event-loop lag and in-flight latency consume part of a naive
          // schedule, so aim above the window midpoint below its ceiling.
          const rate = (this.config.burstMode ? BURST_RATE_PER_SEC : STEADY_RATE_PER_SEC) * share
          const intervalMs = 1000 / rate
          const jitter = intervalMs * 0.3 * (random() - 0.5)
          // Pace from the START of the previous publication: the in-flight
          // round-trip is part of the interval, not additive to it.
          const elapsedMs = Date.now() - publishStartMs
          const waitMs = Math.max(BUSY_RETRY_MS, intervalMs + jitter - elapsedMs)
          const timer = setTimeout(scheduleMatchEvents, waitMs)
          this.timers.push(timer)
        }

        this._pendingPublishes++
        this._matchAttempts++
        // Hold the per-match busy lock across the in-flight publish so the
        // prefill path (spare-probe) waits for chain quiescence (§3.1.G).
        this._matchBusy.set(matchId, true)
        this.config.publisher.publish(matchId, body, eventType).then((ok) => {
          this._pendingPublishes--
          if (ok) {
            // §3.5: Measure scheduler lag (acceptance - transmission), do NOT mutate event timestamp
            const acceptanceTime = new Date().toISOString()
            const transmitMs = new Date(transmitTimestamp).getTime()
            const acceptMs = new Date(acceptanceTime).getTime()
            const schedulerLagMs = acceptMs - transmitMs
            this._schedulerLagSamples.push(schedulerLagMs)
            // §AS: Atomically commit candidate state only after Nchan acceptance
            state.seq = candidate.seq
            state.score = candidate.score
            state.clock = candidate.clock
            state.last_event_type = candidate.last_event_type
            // §AS/§4.1: Only commit head tracker and counters after Nchan acceptance
            // §4.1: Update head state with score/clock for late-join reconstruction verification
            this.config.headTracker.updateHeadState(matchId, state.seq, state.score, { period: state.clock.period, elapsed: state.clock.elapsed_seconds })
            this._eventsPublished++
            this._totalPublished++
            this._matchPublished++
            if (PUB_DEBUG) {
              console.log(`PUBDBG ${JSON.stringify({ t: acceptMs, match: matchId, seq: candidate.seq, ev: eventType })}`)
            }
            const prev = this._eventsPublishedByMatch.get(matchId) ?? 0
            this._eventsPublishedByMatch.set(matchId, prev + 1)
            const expected = this.config.getSubscriberCount?.(matchId) ?? 0
            this.config.onPublish?.(matchId, expected)
          }
          // §AS: On failure, committed state is unchanged — no revert needed
          finalize()
        }).catch(() => {
          // §AS: On exception, committed state is unchanged — no revert needed
          this._pendingPublishes--
          finalize()
        })
      }

      // Stagger chain start slightly so the chains do not tick in lockstep.
      setTimeout(scheduleMatchEvents, matchIdx * 5)
    })

    const scheduleLobby = () => {
      if (!this.running) return
      const lobbyStates = this.matchStates.map((s, i) => ({
        matchId: MATCH_IDS[i],
        score: s.score,
        clock: s.clock,
        lastEventType: s.last_event_type,
      }))
      const lobby = createLobbyPayload(lobbyStates)
      const body = JSON.stringify(lobby)
      this._pendingPublishes++
      this._lobbyAttempts++
      this.config.publisher.publish("lobby", body, "lobby").then((ok) => {
        this._pendingPublishes--
        if (ok) {
          this._eventsPublished++
          this._totalPublished++
          this._lobbyPublished++
          const expected = this.config.getSubscriberCount?.("lobby") ?? 0
          this.config.onPublish?.("lobby", expected)
        }
      }).catch(() => {
        this._pendingPublishes--
      })
      const timer = setTimeout(scheduleLobby, 1000)
      this.timers.push(timer)
    }

    scheduleLobby()
  }

  stop(): void {
    this.running = false
    for (const t of this.timers) clearTimeout(t)
    this.timers = []
  }

  // §6.19: Drain in-flight publishes with a bounded timeout.
  // Stops the publisher and waits for all pending HTTP POSTs to settle.
  async drain(timeoutMs = 5000): Promise<void> {
    this.stop()
    const deadline = Date.now() + timeoutMs
    while (this._pendingPublishes > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10))
    }
  }

  getMatchHead(matchId: string): number {
    const idx = MATCH_IDS.indexOf(matchId)
    return idx >= 0 ? this.matchStates[idx].seq : 0
  }

  // §3.1.G: Canonical prefill — atomic per-match serialized operation.
  // Holds the per-match busy lock for the ENTIRE prefill range to prevent interleaving
  // with normal publication. This makes the prefill range deterministic and independently
  // frozen expected range/state provable.
  // §v2.2.0: the event type is caller-selected (frozen restart drill uses
  // "corner"); the default preserves historical behavior.
  async publishPrefill(
    matchId: string,
    count: number,
    eventType = "corner",
  ): Promise<{
    published: number
    firstSeq: number
    lastSeq: number
    frozenState: { seq: number; score: { home: number; away: number }; clock: { period: string; elapsed: number } } | null
  }> {
    const idx = MATCH_IDS.indexOf(matchId)
    if (idx < 0) return { published: 0, firstSeq: 0, lastSeq: 0, frozenState: null }

    // §3.1.G: Wait for and hold the per-match busy lock for the entire prefill
    while (this._matchBusy.get(matchId)) {
      await new Promise((r) => setTimeout(r, 5))
    }
    this._matchBusy.set(matchId, true)

    let published = 0
    let firstSeq = -1
    let lastSeq = -1

    try {
      for (let i = 0; i < count; i++) {
        try {
          const state = this.matchStates[idx]
          // §AS: Clone candidate, advance, publish, commit only on acceptance
          const candidate: MatchState = {
            seq: state.seq,
            score: { ...state.score },
            clock: { ...state.clock },
            last_event_type: state.last_event_type,
          }
          advanceMatchState(candidate, eventType, this.config.random)

          const transmitTimestamp = new Date().toISOString()
          const event = createEventPayload(matchId, candidate.seq, eventType, candidate.score, candidate.clock, transmitTimestamp)
          const body = JSON.stringify(event)

          this._pendingPublishes++
          const ok = await this.config.publisher.publish(matchId, body, eventType)
          this._pendingPublishes--

          if (ok) {
            // §3.5: Scheduler lag for prefill
            const acceptanceTime = new Date().toISOString()
            const transmitMs = new Date(transmitTimestamp).getTime()
            const acceptMs = new Date(acceptanceTime).getTime()
            this._schedulerLagSamples.push(acceptMs - transmitMs)

            // §AS: Commit state only after acceptance
            state.seq = candidate.seq
            state.score = candidate.score
            state.clock = candidate.clock
            state.last_event_type = candidate.last_event_type

            // §4.1: Update head tracker with full state
            this.config.headTracker.updateHeadState(matchId, state.seq, state.score, { period: state.clock.period, elapsed: state.clock.elapsed_seconds })

            this._eventsPublished++
            this._totalPublished++
            const prev = this._eventsPublishedByMatch.get(matchId) ?? 0
            this._eventsPublishedByMatch.set(matchId, prev + 1)
            const expected = this.config.getSubscriberCount?.(matchId) ?? 0
            this.config.onPublish?.(matchId, expected)

            if (firstSeq === -1) firstSeq = candidate.seq
            lastSeq = candidate.seq
            published++
          }
        } catch {
          // §AS: On exception, committed state unchanged
        }
      }
    } finally {
      // §3.1.G: Release the busy lock only after ALL prefill events are published
      this._matchBusy.set(matchId, false)
    }

    // §3.1: Freeze the committed state snapshot after all prefill events
    const frozenState = this.config.headTracker.getHeadState(matchId)
    return { published, firstSeq, lastSeq, frozenState }
  }
}
