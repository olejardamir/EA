// R04 surge machine-proof fixture: structured evidence whose global sums hit
// the frozen assignment numbers exactly (+40k attempted AND established,
// zero failures, within the 120s deadline, full post-surge ownership).
import {
  SURGE_DEADLINE_MS,
  SURGE_GLOBAL_ADDITIONS,
} from "../application/global-coordinator.js"

export interface SurgeIdentity {
  shard_id: number
  shard_count: number
  global_target?: number
}

function share(total: number, index: number, count: number): number {
  const base = Math.floor(total / count)
  return index < total % count ? base + 1 : base
}

export function validSurgeScenarioEvidence(
  identity: SurgeIdentity,
  overrides: Partial<Record<string, number>> = {},
): { name: "surge"; participated: boolean; passed: boolean; detail: string; structured: Record<string, unknown> } {
  const globalTarget = identity.global_target ?? 100
  const preGlobal = globalTarget === 100_000 ? 60_000 : globalTarget
  const startActive = share(preGlobal, identity.shard_id, identity.shard_count)
  const additions = share(SURGE_GLOBAL_ADDITIONS, identity.shard_id, identity.shard_count)
  // Production gives every shard an identical surgeLocal, so each shard ends
  // at the full post-surge ownership floor.
  const finalActive = Math.ceil((preGlobal + SURGE_GLOBAL_ADDITIONS) / identity.shard_count)
  const structured: Record<string, unknown> = {
    surge_start_active: startActive,
    surge_attempted_additions: additions,
    surge_established_additions: additions,
    surge_failed_additions: 0,
    surge_elapsed_ms: SURGE_DEADLINE_MS - 20_000,
    surge_final_active: finalActive,
    surge_peak_active: finalActive,
    ...overrides,
  }
  return {
    name: "surge",
    participated: true,
    passed: true,
    detail: "exact surge schedule",
    structured,
  }
}
