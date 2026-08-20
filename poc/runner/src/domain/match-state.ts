import { MATCH_IDS } from "./event.js"

export interface MatchState {
  seq: number
  score: { home: number; away: number }
  clock: { period: string; elapsed_seconds: number }
  last_event_type: string
}

export function createInitialMatchStates(): MatchState[] {
  return MATCH_IDS.map(() => ({
    seq: 0,
    score: { home: 0, away: 0 },
    clock: { period: "1H", elapsed_seconds: 0 },
    last_event_type: "match_start",
  }))
}

export function advanceMatchState(state: MatchState, eventType: string): void {
  state.seq++
  state.last_event_type = eventType

  if (eventType === "goal") {
    if (Math.random() < 0.5) state.score.home++
    else state.score.away++
  }

  state.clock.elapsed_seconds += Math.floor(Math.random() * 30) + 15
  if (state.clock.elapsed_seconds >= 2700) {
    state.clock.period = "2H"
  }
}

export interface MatchHeadTracker {
  getHead(matchId: string): number
  updateHead(matchId: string, seq: number): void
}

export function createMatchHeadTracker(): MatchHeadTracker {
  const heads = new Map<string, number>()
  return {
    getHead(matchId: string): number {
      return heads.get(matchId) ?? 0
    },
    updateHead(matchId: string, seq: number): void {
      const current = heads.get(matchId) ?? 0
      if (seq > current) heads.set(matchId, seq)
    },
  }
}
