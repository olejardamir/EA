import type { EventPublisher } from "../ports/event-publisher.js"
import type { MatchHeadTracker } from "../domain/match-state.js"
import {
  MATCH_IDS, MATCH_WEIGHTS, EVENT_TYPES,
  weightedRandom, createEventPayload, createLobbyPayload,
} from "../domain/event.js"
import { createInitialMatchStates, advanceMatchState, type MatchState } from "../domain/match-state.js"

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
  // §BL: Track in-flight publish promises — backlog = number of unresolved tasks
  private _pendingPublishes = 0
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

  get eventsPublishedByMatch(): ReadonlyMap<string, number> {
    return this._eventsPublishedByMatch
  }

  get matchIds(): string[] {
    return [...MATCH_IDS]
  }

  snapshotAndReset(): { eventsPublished: number; byMatch: Map<string, number> } {
    const snapshot = {
      eventsPublished: this._eventsPublished,
      byMatch: new Map(this._eventsPublishedByMatch),
    }
    this._eventsPublished = 0
    this._eventsPublishedByMatch.clear()
    return snapshot
  }

  start(steadyRate = true): void {
    this.running = true
    this._eventsPublished = 0

    const scheduleMatchEvents = () => {
      if (!this.running) return

      const weights = this.config.burstMode
        ? [80, 20 / 7, 20 / 7, 20 / 7, 20 / 7, 20 / 7, 20 / 7, 20 / 7]
        : MATCH_WEIGHTS

      const random = this.config.random
      const matchIdx = weightedRandom(weights, random)
      const matchId = MATCH_IDS[matchIdx]

      // §6.20: If this match already has a publish in-flight, skip this tick
      // to preserve per-match canonical ordering. The next timer will retry.
      if (this._matchBusy.get(matchId)) {
        const rate = this.config.burstMode ? 50 : 9
        const intervalMs = 1000 / rate
        const timer = setTimeout(scheduleMatchEvents, Math.max(10, intervalMs))
        this.timers.push(timer)
        return
      }

      this._matchBusy.set(matchId, true)

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

      const event = createEventPayload(matchId, candidate.seq, eventType, candidate.score, candidate.clock)
      const body = JSON.stringify(event)

      const finalize = () => {
        this._matchBusy.set(matchId, false)
        const rate = this.config.burstMode ? 50 : 9
        const intervalMs = 1000 / rate
        const jitter = intervalMs * 0.3 * (random() - 0.5)
        const timer = setTimeout(scheduleMatchEvents, Math.max(10, intervalMs + jitter))
        this.timers.push(timer)
      }

      this._pendingPublishes++
      this.config.publisher.publish(matchId, body, eventType).then((ok) => {
        this._pendingPublishes--
        if (ok) {
          // §AQ: Set publish_timestamp to Nchan acceptance time (post-POST)
          event.publish_timestamp = new Date().toISOString()
          // §AS: Atomically commit candidate state only after Nchan acceptance
          state.seq = candidate.seq
          state.score = candidate.score
          state.clock = candidate.clock
          state.last_event_type = candidate.last_event_type
          // §AS: Only commit head tracker and counters after Nchan acceptance
          this.config.headTracker.updateHead(matchId, state.seq)
          this._eventsPublished++
          this._totalPublished++
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
      this.config.publisher.publish("lobby", body, "lobby").then((ok) => {
        this._pendingPublishes--
        if (ok) {
          this._eventsPublished++
          this._totalPublished++
          const expected = this.config.getSubscriberCount?.("lobby") ?? 0
          this.config.onPublish?.("lobby", expected)
        }
      }).catch(() => {
        this._pendingPublishes--
      })
      const timer = setTimeout(scheduleLobby, 1000)
      this.timers.push(timer)
    }

    scheduleMatchEvents()
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
}
