import type { MatchEvent, LobbyState } from "./types.js"

const MATCH_IDS = [
  "match-001", "match-002", "match-003", "match-004",
  "match-005", "match-006", "match-007", "match-008",
]

const MATCH_WEIGHTS = [2.0, 1.5, 1.5, 1.0, 1.0, 0.8, 0.7, 0.5]
const TOTAL_WEIGHT = MATCH_WEIGHTS.reduce((a, b) => a + b, 0)

const EVENT_TYPES = [
  { type: "corner", weight: 20 },
  { type: "free_kick", weight: 20 },
  { type: "substitution", weight: 15 },
  { type: "offside", weight: 15 },
  { type: "goal", weight: 15 },
  { type: "yellow_card", weight: 10 },
  { type: "red_card", weight: 3 },
  { type: "var_review", weight: 2 },
]
const EVENT_WEIGHT_TOTAL = EVENT_TYPES.reduce((a, b) => a + b.weight, 0)

const DESCRIPTIONS: Record<string, string[]> = {
  corner: ["Corner kick awarded", "Corner from the right", "Short corner taken"],
  free_kick: ["Free kick in dangerous position", "Direct free kick", "Free kick from distance"],
  substitution: ["Player substituted", "Tactical substitution", "Double substitution"],
  offside: ["Offside flagged", "VAR checks offside", "Offside decision confirmed"],
  goal: ["GOAL! Brilliant finish!", "GOAL from close range!", "GOAL with a header!"],
  yellow_card: ["Yellow card shown", "Caution for late tackle", "Yellow for dissent"],
  red_card: ["RED CARD! Sent off!", "Straight red for violent conduct", "Second yellow, red card"],
  var_review: ["VAR review in progress", "VAR overturns decision", "VAR confirms on-field call"],
}

interface MatchState {
  seq: number
  score: { home: number; away: number }
  clock: { period: string; elapsed_seconds: number }
  last_event_type: string
}

function weightedRandom(weights: number[]): number {
  const r = Math.random() * weights.reduce((a, b) => a + b, 0)
  let acc = 0
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i]
    if (r < acc) return i
  }
  return weights.length - 1
}

function padToSize(payload: string, targetBytes: number): string {
  const currentBytes = Buffer.byteLength(payload, "utf-8")
  if (currentBytes >= targetBytes) return ""
  const padLen = targetBytes - currentBytes
  return "A".repeat(padLen)
}

function createEventPayload(matchId: string, state: MatchState, eventType: string): MatchEvent {
  const descs = DESCRIPTIONS[eventType] ?? ["Event occurred"]
  const description = descs[state.seq % descs.length]
  const event: MatchEvent = {
    match_id: matchId,
    canonical_seq: state.seq,
    event_type: eventType,
    publish_timestamp: new Date().toISOString(),
    score: { ...state.score },
    clock: { ...state.clock },
    description,
    padding: "",
  }
  const targetSize = eventType === "goal" ? 350 : 250
  event.padding = padToSize(JSON.stringify(event), targetSize)
  return event
}

function createLobbyPayload(matchStates: MatchState[]): LobbyState {
  const lobby: LobbyState = {
    matches: matchStates.map((s, i) => ({
      match_id: MATCH_IDS[i],
      score: { ...s.score },
      clock: { ...s.clock },
      status: "live",
      last_event_type: s.last_event_type,
    })),
    timestamp: new Date().toISOString(),
  }
  const targetSize = 1200
  const payload = JSON.stringify(lobby)
  const currentBytes = Buffer.byteLength(payload, "utf-8")
  if (currentBytes < targetSize) {
    ;(lobby as any)._pad = "A".repeat(targetSize - currentBytes)
  }
  return lobby
}

async function postEvent(pubUrl: string, channel: string, body: string, eventType: string): Promise<boolean> {
  try {
    const resp = await fetch(`${pubUrl}/pub/${channel}`, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        "X-Event-Source-Event": eventType,
      },
      body,
      signal: AbortSignal.timeout(5000),
    })
    return resp.ok
  } catch {
    return false
  }
}

export interface PublisherConfig {
  pubUrl: string
  burstMode: boolean
  onHeadUpdate?: (matchId: string, seq: number) => void
  eventLog: Map<string, number[]>
}

export class Publisher {
  private matchStates: MatchState[]
  private config: PublisherConfig
  private running = false
  private lobbySeq = 0
  private timers: NodeJS.Timeout[] = []
  private eventsPublished = 0

  constructor(config: PublisherConfig) {
    this.config = config
    this.matchStates = MATCH_IDS.map(() => ({
      seq: 0,
      score: { home: 0, away: 0 },
      clock: { period: "1H", elapsed_seconds: 0 },
      last_event_type: "match_start",
    }))
  }

  get burstMode(): boolean {
    return this.config.burstMode
  }

  set burstMode(value: boolean) {
    this.config.burstMode = value
  }

  get totalPublished(): number {
    return this.eventsPublished
  }

  start(steadyRate = true): void {
    this.running = true

    // Schedule match events based on weights
    const scheduleMatchEvents = () => {
      if (!this.running) return

      const weights = this.config.burstMode
        ? MATCH_WEIGHTS.map((w, i) => (i === 0 ? w * 4 : w * 0.5))
        : MATCH_WEIGHTS

      const matchIdx = weightedRandom(weights)
      const state = this.matchStates[matchIdx]
      const eventTypeIdx = weightedRandom(EVENT_TYPES.map((e) => e.weight))
      const eventType = EVENT_TYPES[eventTypeIdx].type

      state.seq++
      state.last_event_type = eventType

      // Update score on goals
      if (eventType === "goal") {
        if (Math.random() < 0.5) state.score.home++
        else state.score.away++
      }

      // Advance clock
      state.clock.elapsed_seconds += Math.floor(Math.random() * 30) + 15
      if (state.clock.elapsed_seconds >= 2700) {
        state.clock.period = "2H"
      }

      const event = createEventPayload(MATCH_IDS[matchIdx], state, eventType)
      const body = JSON.stringify(event)

      // Store in event log for verification
      const log = this.config.eventLog.get(MATCH_IDS[matchIdx]) ?? []
      log.push(state.seq)
      this.config.eventLog.set(MATCH_IDS[matchIdx], log)

      this.config.onHeadUpdate?.(MATCH_IDS[matchIdx], state.seq)

      postEvent(this.config.pubUrl, MATCH_IDS[matchIdx], body, eventType).then((ok) => {
        if (ok) this.eventsPublished++
      })

      // Schedule next event
      const rate = this.config.burstMode ? 50 : 9
      const intervalMs = 1000 / (rate / MATCH_IDS.length)
      const jitter = intervalMs * 0.3 * (Math.random() - 0.5)
      const timer = setTimeout(scheduleMatchEvents, Math.max(10, intervalMs + jitter))
      this.timers.push(timer)
    }

    // Schedule lobby updates at 1/s
    const scheduleLobby = () => {
      if (!this.running) return
      this.lobbySeq++
      const lobby = createLobbyPayload(this.matchStates)
      const body = JSON.stringify(lobby)
      postEvent(this.config.pubUrl, "lobby", body, "lobby").then((ok) => {
        if (ok) this.eventsPublished++
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

  getMatchIds(): string[] {
    return [...MATCH_IDS]
  }
}

export function getMatchIds(): string[] {
  return [...MATCH_IDS]
}
