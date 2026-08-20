export interface WorkerMetrics {
  worker_id: number
  connections_attempted: number
  connections_established: number
  connection_failures: number
  events_received: number
  missing_sequences: number
  duplicates: number
  out_of_order: number
  fan_out_latencies_ms: number[]
  late_join_latencies_ms: number[]
  reconnect_gaps: number
  reconnect_duplicates: number
  reconnect_order_violations: number
  slow_consumer_disconnects: number
  event_loop_delay_p99_ms: number
  memory_mb_peak: number
  connections_dropped: number
}

// §3.2: Shard identity — identifies which generator shard produced these metrics
export interface ShardIdentity {
  shard_id: number
  shard_count: number
  source_ip_index: number
}

export interface AggregatedMetrics {
  // §3.2: Shard identity
  shard_identity: ShardIdentity | null
  connections_attempted: number
  connections_established: number
  connection_failures: number
  events_published: number
  events_received: number
  missing_sequences: number
  duplicates: number
  out_of_order: number
  fan_out_latency_p50_ms: number
  fan_out_latency_p95_ms: number
  fan_out_latency_p99_ms: number
  fan_out_latency_max_ms: number
  late_join_p50_ms: number
  late_join_p95_ms: number
  late_join_p99_ms: number
  late_join_max_ms: number
  reconnect_gaps: number
  reconnect_duplicates: number
  reconnect_order_violations: number
  slow_consumer_disconnects: number
  event_loop_delay_p99_ms: number
  memory_mb_peak: number
  connections_dropped: number
  expected_fan_deliveries: number
  received_fan_deliveries: number
  connections_target: number
  burst_fan_out_p95_ms: number
  nchan_restart_history_replay_correct: boolean
  nchan_restart_missing_sequences: number
  nchan_restart_skipped: boolean
  non_slow_p95_degradation_pct: number
  nchan_memory_mb_peak: number | null
  redis_memory_mb_peak: number | null
  // §4.9: Nchan container resource metrics
  nchan_cpu_usage_usec: number | null
  nchan_cpu_throttled_count: number | null
  nchan_cpu_throttled_usec: number | null
  nchan_memory_current_bytes: number | null
  nchan_memory_peak_bytes: number | null
  nchan_memory_oom_events: number | null
  nchan_memory_oom_kill_events: number | null
  timing_valid: boolean
  generator_cpu_percent_peak: number
  generator_event_loop_p99_ms: number
  run_profile: "smoke" | "evidence"
  lobby_subscribers: number
  match_001_subscribers: number
  match_002_subscribers: number
  match_003_subscribers: number
  match_004_subscribers: number
  match_005_subscribers: number
  match_006_subscribers: number
  match_007_subscribers: number
  match_008_subscribers: number
  phase_publish_rates: Array<{
    phase: string
    eventsPerSec: number
    hotMatchPct: number
    // §3.7: Workload-rate breakdown per phase
    matchEventsPerSec: number
    lobbyEventsPerSec: number
    totalEventsPerSec: number
    matchEventsPublished: number
    lobbyEventsPublished: number
    // §3.7: Attempted vs accepted per phase
    matchEventsAttempted: number
    lobbyEventsAttempted: number
    totalEventsAttempted: number
    totalEventsAccepted: number
  }>
  // §3.7: Aggregate workload-rate totals
  match_events_published: number
  lobby_events_published: number
  match_events_per_sec: number
  lobby_events_per_sec: number
  total_events_per_sec: number
  // §3.7: Aggregate attempted totals
  match_events_attempted: number
  lobby_events_attempted: number
  // §AC: cgroup v2 runtime signals — null when unsupported/unavailable
  cpu_usage_usec: number | null             // cpu.stat usage_usec — total CPU time in microseconds
  cpu_throttled_count: number | null      // §BK: nr_throttled — must be 0 for ACCEPT
  cpu_throttled_usec: number | null       // total throttled time in microseconds
  memory_oom_events: number | null        // OOM events from memory.events
  memory_oom_kill_events: number | null   // OOM kills from memory.events
  memory_current_bytes: number | null     // current memory usage in bytes
  memory_peak_bytes: number | null        // peak memory usage in bytes
  cpu_max_quota: number | null            // CPU quota in usec per period (null = unlimited)
  memory_max_bytes: number | null         // memory limit in bytes (null = unlimited)
  // §BL: generator backlog — max pending publish tasks during run
  generator_backlog_peak: number
  // §BM: Nchan publisher acceptance stats
  publisher_attempts: number
  publisher_successes: number
  publisher_definite_failures: number
  publisher_ambiguous_failures: number
  // §BJ: parse error accounting
  sse_parse_errors: number
  json_parse_errors: number
  invalid_timestamp_count: number
  // §4.19: Schema validation error accounting
  schema_validation_errors: number
  missing_transport_id: number
  // §BH: surge existing-viewer health — deltas during surge phase
  surge_fan_out_p95_ms: number
  surge_missing_sequences: number
  surge_duplicates: number
  surge_out_of_order: number
  surge_events_received: number
  // §4.5: Surge timing metrics
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
  surge_scheduler_lag_p95: number
  surge_scheduler_lag_max: number
  active_population_start: number
  active_population_end: number
  active_population_peak: number
  // §3.15: Per-scenario active concurrency for reconnect
  reconnect_active_start: number
  reconnect_active_peak: number
  reconnect_active_end: number
  // §R: active connections peak — separate from cumulative establishments
  active_connections_peak: number
  // §4.16: Live vs replay delivery accounting
  live_expected_deliveries: number
  live_received_deliveries: number
  late_join_history_expected: number
  late_join_history_received: number
  reconnect_replay_expected: number
  reconnect_replay_received: number
  restart_replay_expected: number
  restart_replay_received: number
  // §4.7: Slow-consumer metrics — populated by SlowConsumerScenario
  slow_consumer_metrics: SlowConsumerMetrics | null
  // §4.17: Disconnect attribution — each terminal event attributed exactly once
  // §3.14: slowConsumerDisconnects is informational-only (not one of the 5 attribution counters)
  deliberate_disconnects: number
  unexpected_client_disconnects: number
  server_initiated_disconnects: number
  network_failures: number
  // §3.14: Frozen as one cleanup operation per disconnectAll call (0 or 1), not per-connection
  shutdown_cleanup_disconnects: number
  // §4.9: Redis connected-client peak
  redis_connected_clients_peak: number | null
  // §3.8: Nchan/Redis CPU percent peaks
  nchan_cpu_percent_peak: number | null
  redis_cpu_percent_peak: number | null
  // §3.9: Normalized CPU percent peaks (0..100 of capacity, not per-core)
  resource_cpu_percent_peak: number | null
  resource_cpu_baseline: number | null
  nchan_resource_cpu_percent_peak: number | null
  redis_resource_cpu_percent_peak: number | null
  // §4.2: Topology capacity sufficient
  topology_capacity_sufficient: boolean
  // §4.25: Histogram sample population metadata
  fan_out_sample_count: number
  fan_out_overflow_count: number
  late_join_sample_count: number
  late_join_overflow_count: number
  // §3.9: Latency validity counters — negative/overflow latencies indicate measurement failure
  latency_invalid_count: number
  latency_overflow_count: number
  // §4.22: Build identity — immutable provenance
  build_identity: {
    git_commit_sha: string | null
    nginx_version: string
    nchan_version: string
    node_version: string
    redis_version: string
  }
  // §4.25: Per-phase latency histograms — each phase has isolated fan-out and late-join percentiles
  phase_histograms: Record<string, { fanOut: PhaseHistogramResult; lateJoin: PhaseHistogramResult }>
  // §3.12/§4.15: Clock validity evidence — shared-kernel-clock model
  clock_validity: {
    clock_model: string
    nodes_covered: string[]
    measurement_method: string
    offset_or_guarantee: number
    uncertainty_ms: number
    threshold_ms: number
    validity_result: "PASS" | "INCONCLUSIVE"
    nchan1_reachable: boolean
    nchan2_reachable: boolean
  }
  // §3.15: Campaign provenance — distinguishes per-run from campaign aggregate
  aggregate_type?: "single_run" | "campaign"
  run_count?: number
}

// §4.7: Slow-consumer result metrics — computed in the scenario, consumed by classifier
export interface SlowConsumerMetrics {
  slow_clients: number
  healthy_clients: number
  slow_offered_event_count: number
  slow_application_read_count: number
  slow_backlog_growth: number
  backpressure_duration_ms: number
  evidence_server_side_backpressure_reached: boolean
  healthy_p95_before_ms: number
  healthy_p95_during_slow_ms: number
  healthy_degradation_pct: number
  slow_disconnects: number
  // §3.6: Dedicated healthy-cohort histograms
  healthy_before_sample_count: number
  healthy_during_sample_count: number
  // §3.6: Nchan memory during slow phase
  nchan_memory_baseline_bytes: number | null
  nchan_memory_during_bytes: number | null
  nchan_memory_end_bytes: number | null
  nchan_memory_recovery_bytes: number | null
  nchan_memory_samples_during: number[]
  // §3.8: Per-client event timestamps (not merged) — proves per-client 2-second pacing
  per_client_event_timestamps_ms: number[][]
  slow_achieved_read_rate_events_per_sec: number
  // §3.8: Per-client median intervals — each should achieve ~2s independently
  per_client_median_event_interval_ms: number[]
  // §3.8: Aggregated interval stats (all clients merged)
  slow_median_event_interval_ms: number
  slow_p95_event_interval_ms: number
  // §3.8: Memory boundedness trend
  nchan_memory_bounded: boolean | null
  nchan_memory_growth_bytes: number | null
  nchan_memory_growth_pct: number | null
}

export type Verdict = "ACCEPT" | "REJECT" | "INCONCLUSIVE" | "NOT_APPLICABLE"

export interface PhaseHistogramResult {
  p50: number
  p95: number
  p99: number
  max: number
  count: number
}

export interface VerdictResult {
  verdict: Verdict
  checks: Array<{ name: string; passed: boolean; detail: string }>
}
