export interface MatchEvent {
  match_id: string
  canonical_seq: number
  event_type: string
  publish_timestamp: string
  score: { home: number; away: number }
  clock: { period: string; elapsed_seconds: number }
  description: string
  padding: string
}

export interface LobbyState {
  matches: Array<{
    match_id: string
    score: { home: number; away: number }
    clock: { period: string; elapsed_seconds: number }
    status: string
    last_event_type: string
  }>
  timestamp: string
  _pad?: string
}

export const MATCH_IDS = [
  "match-001", "match-002", "match-003", "match-004",
  "match-005", "match-006", "match-007", "match-008",
]

export const MATCH_WEIGHTS = [2.0, 1.5, 1.5, 1.0, 1.0, 0.8, 0.7, 0.5]

export const EVENT_TYPES = [
  { type: "corner", weight: 20 },
  { type: "free_kick", weight: 20 },
  { type: "substitution", weight: 15 },
  { type: "offside", weight: 15 },
  { type: "goal", weight: 15 },
  { type: "yellow_card", weight: 10 },
  { type: "red_card", weight: 3 },
  { type: "var_review", weight: 2 },
]

export const DESCRIPTIONS: Record<string, string[]> = {
  corner: ["Corner kick awarded", "Corner from the right", "Short corner taken"],
  free_kick: ["Free kick in dangerous position", "Direct free kick", "Free kick from distance"],
  substitution: ["Player substituted", "Tactical substitution", "Double substitution"],
  offside: ["Offside flagged", "VAR checks offside", "Offside decision confirmed"],
  goal: ["GOAL! Brilliant finish!", "GOAL from close range!", "GOAL with a header!"],
  yellow_card: ["Yellow card shown", "Caution for late tackle", "Yellow for dissent"],
  red_card: ["RED CARD! Sent off!", "Straight red for violent conduct", "Second yellow, red card"],
  var_review: ["VAR review in progress", "VAR overturns decision", "VAR confirms on-field call"],
}

export function weightedRandom(weights: number[], random: () => number): number {
  const total = weights.reduce((a, b) => a + b, 0)
  const r = random() * total
  let acc = 0
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i]
    if (r < acc) return i
  }
  return weights.length - 1
}

export function padToSize(payload: string, targetBytes: number): string {
  const currentBytes = Buffer.byteLength(payload, "utf-8")
  if (currentBytes >= targetBytes) return ""
  return "A".repeat(targetBytes - currentBytes)
}

export function createEventPayload(matchId: string, seq: number, eventType: string, score: { home: number; away: number }, clock: { period: string; elapsed_seconds: number }, publishTimestamp?: string): MatchEvent {
  const descs = DESCRIPTIONS[eventType] ?? ["Event occurred"]
  const description = descs[seq % descs.length]
  const event: MatchEvent = {
    match_id: matchId,
    canonical_seq: seq,
    event_type: eventType,
    publish_timestamp: publishTimestamp ?? new Date().toISOString(),
    score: { ...score },
    clock: { ...clock },
    description,
    padding: "",
  }
  const targetSize = eventType === "goal" ? 350 : 250
  event.padding = padToSize(JSON.stringify(event), targetSize)
  return event
}

export function createLobbyPayload(matchStates: Array<{ matchId: string; score: { home: number; away: number }; clock: { period: string; elapsed_seconds: number }; lastEventType: string }>): LobbyState {
  const lobby: LobbyState = {
    matches: matchStates.map((s) => ({
      match_id: s.matchId,
      score: { ...s.score },
      clock: { ...s.clock },
      status: "live",
      last_event_type: s.lastEventType,
    })),
    timestamp: new Date().toISOString(),
  }
  const targetSize = 1200
  const payload = JSON.stringify(lobby)
  const currentBytes = Buffer.byteLength(payload, "utf-8")
  if (currentBytes < targetSize) {
    lobby._pad = "A".repeat(targetSize - currentBytes)
  }
  return lobby
}
