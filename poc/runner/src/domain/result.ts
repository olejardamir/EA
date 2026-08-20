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
  expected_fan_deliveries: number
  received_fan_deliveries: number
  connections_target: number
  burst_fan_out_p95_ms: number
  nchan_restart_history_replay_correct: boolean
  nchan_restart_missing_sequences: number
  non_slow_p95_degradation_pct: number
  nchan_memory_mb_peak: number | null
  redis_memory_mb_peak: number | null
  timing_valid: boolean
  generator_cpu_percent_peak: number
  generator_event_loop_p99_ms: number
  run_profile: "smoke" | "evidence"
}

export type Verdict = "ACCEPT" | "REJECT" | "INCONCLUSIVE"

export interface VerdictResult {
  verdict: Verdict
  checks: Array<{ name: string; passed: boolean; detail: string }>
}
