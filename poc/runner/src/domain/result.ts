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

export interface AggregatedMetrics {
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
  phase_publish_rates: Array<{ phase: string; eventsPerSec: number; hotMatchPct: number }>
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
  active_population_start: number
  active_population_end: number
  active_population_peak: number
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
  // §4.17: Disconnect attribution
  deliberate_disconnects: number
  unexpected_client_disconnects: number
  server_initiated_disconnects: number
  network_failures: number
  shutdown_cleanup_disconnects: number
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
}

export type Verdict = "ACCEPT" | "REJECT" | "INCONCLUSIVE" | "NOT_APPLICABLE"

export interface VerdictResult {
  verdict: Verdict
  checks: Array<{ name: string; passed: boolean; detail: string }>
}
