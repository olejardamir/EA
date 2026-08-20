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
}
