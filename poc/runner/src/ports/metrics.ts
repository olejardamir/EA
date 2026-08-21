import type { PhaseHistogramResult } from "../domain/result.js"

export interface MetricsRecorder {
  recordFanOutLatency(ms: number): void
  recordLateJoinLatency(ms: number): void
  incrementLatencyInvalid(): void
  incrementLatencyOverflow(): void
  incrementEventsReceived(): void
  incrementExpectedFanDeliveries(count: number): void
  incrementMissingSequences(count?: number): void
  incrementDuplicates(): void
  incrementOutOfOrder(): void
  incrementReconnectGaps(count?: number): void
  incrementReconnectDuplicates(): void
  incrementReconnectOrderViolations(): void
  incrementSlowConsumerDisconnects(): void
  incrementConnectionsAttempted(): void
  incrementConnectionsEstablished(): void
  incrementConnectionFailures(): void
  incrementConnectionsDropped(): void
  setActiveConnections(count: number): void
  // §BL: generator backlog — pending publish tasks not yet accepted by Nchan
  setBacklog(backlog: number): void
  // §BJ: parse error accounting
  incrementSseParseErrors(): void
  incrementJsonParseErrors(): void
  incrementInvalidTimestampCount(): void
  // §4.19: Schema validation error accounting
  incrementSchemaValidationErrors(): void
  incrementMissingTransportId(): void
  // §4.16: Live vs replay delivery accounting
  incrementLiveExpectedDeliveries(count?: number): void
  incrementLiveReceivedDeliveries(count?: number): void
  incrementLateJoinHistoryExpected(count: number): void
  incrementLateJoinHistoryReceived(count: number): void
  incrementReconnectReplayExpected(count: number): void
  incrementReconnectReplayReceived(count: number): void
  incrementRestartReplayExpected(count: number): void
  incrementRestartReplayReceived(count: number): void
  // §3.9: Separated literal restart and cross-node replacement metrics
  incrementLiteralRestartExpected(count: number): void
  incrementLiteralRestartReceived(count: number): void
  incrementCrossNodeExpected(count: number): void
  incrementCrossNodeReceived(count: number): void
  // §4.17: Disconnect attribution
  incrementDeliberateDisconnects(): void
  incrementUnexpectedClientDisconnects(): void
  incrementServerInitiatedDisconnects(): void
  incrementNetworkFailures(): void
  incrementShutdownCleanup(): void
  // v2.1.0: planned partition-restart failover disconnects (client-side, pre-emptive)
  incrementPlannedRestartDisconnects(): void
  // §3.5: Event-publisher scheduler lag
  recordSchedulerLag(ms: number): void
  // §3.7: Per-client gauge metrics
  gauge(name: string, value: number): void
  // §4.25: Per-phase histogram isolation
  beginPhase(name: string): void
  endPhase(): void
  snapshotPhaseHistograms(): Record<string, { fanOut: PhaseHistogramResult; lateJoin: PhaseHistogramResult }>
  snapshot(): MetricsSnapshot
}

export interface MetricsSnapshot {
  fan_out_latencies_ms: number[]
  late_join_latencies_ms: number[]
  latency_sample_count: number
  latency_invalid_count: number
  latency_overflow_count: number
  events_received: number
  expected_fan_deliveries: number
  received_fan_deliveries: number
  missing_sequences: number
  duplicates: number
  out_of_order: number
  reconnect_gaps: number
  reconnect_duplicates: number
  reconnect_order_violations: number
  slow_consumer_disconnects: number
  connections_attempted: number
  connections_established: number
  connection_failures: number
  connections_dropped: number
  active_connections_peak: number
  // §BL: peak backlog observed across all samples
  generator_backlog_peak: number
  // §BJ: parse error accounting
  sse_parse_errors: number
  json_parse_errors: number
  invalid_timestamp_count: number
  // §4.19: Schema validation error accounting
  schema_validation_errors: number
  missing_transport_id: number
  // §4.16: Live vs replay delivery accounting
  live_expected_deliveries: number
  live_received_deliveries: number
  late_join_history_expected: number
  late_join_history_received: number
  reconnect_replay_expected: number
  reconnect_replay_received: number
  restart_replay_expected: number
  restart_replay_received: number
  // §3.9: Separated literal restart and cross-node replacement metrics
  literal_restart_expected: number
  literal_restart_received: number
  cross_node_expected: number
  cross_node_received: number
  // §4.17: Disconnect attribution
  deliberate_disconnects: number
  unexpected_client_disconnects: number
  server_initiated_disconnects: number
  network_failures: number
  shutdown_cleanup_disconnects: number
  planned_restart_disconnects: number
  // §4.25: Histogram sample population metadata
  fan_out_sample_count: number
  fan_out_overflow_count: number
  late_join_sample_count: number
  late_join_overflow_count: number
  // §3.5: Event-publisher scheduler lag
  scheduler_lag_p95_ms: number
  scheduler_lag_max_ms: number
}
