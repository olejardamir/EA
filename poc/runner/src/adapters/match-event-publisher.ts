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
      const state = this.matchStates[matchIdx]
      const eventTypeIdx = weightedRandom(EVENT_TYPES.map((e) => e.weight), random)
      const eventType = EVENT_TYPES[eventTypeIdx].type

      advanceMatchState(state, eventType, random)

      const event = createEventPayload(MATCH_IDS[matchIdx], state.seq, eventType, state.score, state.clock)
      const body = JSON.stringify(event)

      this.config.headTracker.updateHead(MATCH_IDS[matchIdx], state.seq)

      this.config.publisher.publish(MATCH_IDS[matchIdx], body, eventType).then((ok) => {
        if (ok) {
          this._eventsPublished++
          this._totalPublished++
          const prev = this._eventsPublishedByMatch.get(MATCH_IDS[matchIdx]) ?? 0
          this._eventsPublishedByMatch.set(MATCH_IDS[matchIdx], prev + 1)
          const channel = MATCH_IDS[matchIdx]
          const expected = this.config.getSubscriberCount?.(channel) ?? 0
          this.config.onPublish?.(channel, expected)
        }
      })

      const rate = this.config.burstMode ? 50 : 9
      const intervalMs = 1000 / rate
      const jitter = intervalMs * 0.3 * (random() - 0.5)
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
          const expected = this.config.getSubscriberCount?.("lobby") ?? 0
          this.config.onPublish?.("lobby", expected)
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
