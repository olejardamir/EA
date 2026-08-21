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
  // §3.7: Attempted (scheduled) counts vs accepted (successfully published) counts
  matchAttempts: number
  lobbyAttempts: number
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
  // In coordinated mode exactly one shard owns the logical publisher workload.
  publisherEnabled?: boolean
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
  // §3.15: Reconnect scenario writes active concurrency for machine-readable output
  _reconnectHealth?: {
    active_start: number
    active_peak: number
    active_end: number
  }
  // §M2-5: Per-client reconnect results — one record per intended client
  _reconnectPerClient?: ReconnectClientResult[]
  // §M2-10: Both restart paths emit their independently frozen canonical range.
  _restartReplay?: {
    literal_restart?: RestartPathResult
    cross_node?: RestartPathResult
    // §v2.1.0: partitioned-topology restart paths
    spare_probe?: RestartPathResult
    failover_drill?: RestartPathResult
  }
  // §v2.1.0: planned partition-failover pool health (target shard only)
  _failoverHealth?: {
    attempted: number
    reestablished: number
    failed: number
    gaps: number
    duplicates: number
    order_violations: number
    planned_disconnects: number
    restart_ms: number
  }
  // §v2.1.0: run identity for structured evidence binding (set by main.ts)
  _runIdentity?: {
    campaignId: string
    experimentRunId: string
    runIndex: number
    shardId: number
  }
  // §3.11.C: Per-scenario active population tracking for peak-load scenarios
  _lateJoinActivePopulation?: { start: number; peak: number; end: number }
  _burstActivePopulation?: { start: number; peak: number; end: number }
  _slowConsumerActivePopulation?: { start: number; peak: number; end: number }
  _restartActivePopulation?: { start: number; peak: number; end: number }
  // §3.11.C: Pool size snapshot — main.ts sets this before each scenario so scenarios without direct pool access can report active population
  _activePopulationStart?: number
}

export interface ScenarioResult {
  name: string
  passed: boolean
  detail: string
  structured?: Record<string, unknown>
}

// §M2-5: Structured per-client reconnect result.
// PASS requires every intended client to have subscription_reestablished=true
// and target_reached=true. A client with expected_count=0/received=0 only counts
// as reconnected when subscription_reestablished is true.
export interface ReconnectClientResult {
  connection_id: number
  match_id: string
  subscription_reestablished: boolean
  saved_last_seq: number
  expected_first_seq: number
  expected_last_seq: number
  expected_count: number
  first_received_seq: number | null
  received_required_count: number
  missing: number
  duplicates: number
  out_of_order: number
  target_reached: boolean
  catch_up_ms: number
}

export interface RestartPathResult {
  transport_resume_id: string | null
  expected_first_seq: number | null
  expected_last_seq: number | null
  received_first_seq: number | null
  received_last_seq: number | null
  expected_count: number
  received_required_count: number
  missing_required: number
  missing_required_sequences: number[]
  duplicates: number
  out_of_order: number
  out_of_range_before_count: number
  out_of_range_after_count: number
  missing_prefix: boolean
  target_reached: boolean
  recovery_ms: number
  passed: boolean
}

export interface Scenario {
  name: string
  execute(ctx: ScenarioContext): Promise<ScenarioResult>
}
