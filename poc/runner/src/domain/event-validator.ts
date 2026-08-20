import { EVENT_TYPES } from "./event.js"

const VALID_EVENT_TYPES = new Set(EVENT_TYPES.map((e) => e.type))

export interface ValidMatchEvent {
  match_id: string
  canonical_seq: number
  event_type: string
  publish_timestamp: string
  score: { home: number; away: number }
  clock: { period: string; elapsed_seconds: number }
}

export interface SchemaValidationResult {
  valid: boolean
  error: string | null
}

export function validateMatchEventPayload(raw: unknown): SchemaValidationResult {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return { valid: false, error: "not an object" }
  }

  const obj = raw as Record<string, unknown>

  if (typeof obj.canonical_seq !== "number" || !Number.isFinite(obj.canonical_seq)) {
    return { valid: false, error: "canonical_seq missing or not a finite number" }
  }

  if (typeof obj.match_id !== "string" || obj.match_id.length === 0) {
    return { valid: false, error: "match_id missing or empty" }
  }

  if (typeof obj.event_type !== "string" || !VALID_EVENT_TYPES.has(obj.event_type)) {
    return { valid: false, error: `event_type "${String(obj.event_type)}" not in frozen schema` }
  }

  if (typeof obj.publish_timestamp !== "string" || isNaN(new Date(obj.publish_timestamp).getTime())) {
    return { valid: false, error: "publish_timestamp missing or unparseable" }
  }

  if (
    !obj.score ||
    typeof obj.score !== "object" ||
    typeof (obj.score as Record<string, unknown>).home !== "number" ||
    typeof (obj.score as Record<string, unknown>).away !== "number"
  ) {
    return { valid: false, error: "score missing or malformed" }
  }

  if (
    !obj.clock ||
    typeof obj.clock !== "object" ||
    typeof (obj.clock as Record<string, unknown>).period !== "string" ||
    typeof (obj.clock as Record<string, unknown>).elapsed_seconds !== "number"
  ) {
    return { valid: false, error: "clock missing or malformed" }
  }

  return { valid: true, error: null }
}
