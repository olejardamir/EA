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
  onPublish?: () => void
}

export class MatchEventPublisher {
  private matchStates: MatchState[]
  private config: MatchEventPublisherConfig
  private running = false
  private timers: NodeJS.Timeout[] = []
  private _eventsPublished = 0
  private _totalPublished = 0

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

  get matchIds(): string[] {
    return [...MATCH_IDS]
  }

  start(steadyRate = true): void {
    this.running = true
    this._eventsPublished = 0

    const scheduleMatchEvents = () => {
      if (!this.running) return

      const weights = this.config.burstMode
        ? MATCH_WEIGHTS.map((w, i) => (i === 0 ? w * 4 : w * 0.5))
        : MATCH_WEIGHTS

      const matchIdx = weightedRandom(weights)
      const state = this.matchStates[matchIdx]
      const eventTypeIdx = weightedRandom(EVENT_TYPES.map((e) => e.weight))
      const eventType = EVENT_TYPES[eventTypeIdx].type

      advanceMatchState(state, eventType)

      const event = createEventPayload(MATCH_IDS[matchIdx], state.seq, eventType, state.score, state.clock)
      const body = JSON.stringify(event)

      this.config.headTracker.updateHead(MATCH_IDS[matchIdx], state.seq)

      this.config.publisher.publish(MATCH_IDS[matchIdx], body, eventType).then((ok) => {
        if (ok) {
          this._eventsPublished++
          this._totalPublished++
        }
        this.config.onPublish?.()
      })

      const rate = this.config.burstMode ? 50 : 9
      const intervalMs = 1000 / (rate / MATCH_IDS.length)
      const jitter = intervalMs * 0.3 * (Math.random() - 0.5)
      const timer = setTimeout(scheduleMatchEvents, Math.max(10, intervalMs + jitter))
      this.timers.push(timer)
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
      this.config.publisher.publish("lobby", body, "lobby").then((ok) => {
        if (ok) {
          this._eventsPublished++
          this._totalPublished++
        }
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

  getMatchHead(matchId: string): number {
    const idx = MATCH_IDS.indexOf(matchId)
    return idx >= 0 ? this.matchStates[idx].seq : 0
  }
}
