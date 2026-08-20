import type { EventStream } from "../ports/event-stream.js"
import type { MetricsRecorder } from "../ports/metrics.js"
import type { Clock } from "../ports/clock.js"
import type { ResourceMonitor } from "../ports/resource-monitor.js"
import type { MatchHeadTracker } from "../domain/match-state.js"
import type { ExperimentConfig } from "../config/experiment-config.js"
import type { MatchEventPublisher } from "../adapters/match-event-publisher.js"

export interface PhaseSnapshot {
  phase: string
  eventsPublished: number
  byMatch: Map<string, number>
  durationMs: number
  // §3.7: Separate match/lobby counts for workload-rate breakdown
  matchPublished: number
  lobbyPublished: number
}

export interface ScenarioContext {
  publisher: MatchEventPublisher
  eventStream: EventStream
  metrics: MetricsRecorder
  clock: Clock
  resourceMonitor: ResourceMonitor
  headTracker: MatchHeadTracker
  config: ExperimentConfig
  matchIds: string[]
  phaseSnapshots: PhaseSnapshot[]
  log: (msg: string) => void
  sleep: (ms: number) => Promise<void>
  // §BH: surge scenario writes health metrics here for main.ts aggregation
  _surgeHealth?: {
    fan_out_p95_ms: number
    missing_sequences: number
    duplicates: number
    out_of_order: number
    events_received: number
    surge_target_additions: number
    surge_attempted: number
    surge_established: number
    surge_failures: number
    surge_start_time: number
    surge_end_time: number
    surge_elapsed_ms: number
    surge_timing_error_ms: number
    attempt_rate_peak: number
    establishment_rate_peak: number
    scheduler_lag_p95: number
    scheduler_lag_max: number
    active_population_start: number
    active_population_end: number
    active_population_peak: number
  }
}

export interface ScenarioResult {
  name: string
  passed: boolean
  detail: string
}

export interface Scenario {
  name: string
  execute(ctx: ScenarioContext): Promise<ScenarioResult>
}
