// R10 timing-evidence fixture: structured phase-boundary record matching the
// production wire shape exposed by the Go loadgen under
// resources.generator.timing. Covers every coordinated phase with internally
// consistent, positive durations inside a plausible run window.
import { COORDINATED_PHASES } from "../application/global-coordinator.js"

export function validTimingEvidence(): Record<string, unknown> {
  const now = Date.now()
  const out: Record<string, unknown> = {
    run_start_ms: now - 3_600_000,
    run_end_ms: now - 60_000,
  }
  let cursor = now - 3_600_000
  for (const phase of COORDINATED_PHASES) {
    const durationMs = 10_000
    const start = cursor
    cursor += durationMs
    const end = cursor
    cursor += 2_000
    out[phase] = { start_ms: start, end_ms: end, duration_ms: durationMs }
  }
  return out
}
