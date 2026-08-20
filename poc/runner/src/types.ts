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
}

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
}

export type Phase =
  | "warmup"
  | "steady"
  | "burst"
  | "lobby"
  | "slow"
  | "reconnect"
  | "nchan_restart"
  | "cooldown"
  | "done"

export interface WorkerCommand {
  type: "start" | "stop" | "phase" | "late_join" | "reconnect" | "reconnect_to" | "shutdown"
  phase?: Phase
  target_connections?: number
  burst?: boolean
  reconnect_to_port?: number
}

export interface WorkerStatus {
  type: "status" | "ready" | "done" | "error" | "late_join_result" | "reconnect_result"
  worker_id?: number
  connections_established?: number
  error?: string
  late_join_latency_ms?: number
  reconnect_latency_ms?: number
  reconnect_gaps?: number
  reconnect_duplicates?: number
  reconnect_order_violations?: number
}
