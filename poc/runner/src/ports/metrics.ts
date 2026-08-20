export interface MetricsRecorder {
  recordFanOutLatency(ms: number): void
  recordLateJoinLatency(ms: number): void
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
  snapshot(): MetricsSnapshot
}

export interface MetricsSnapshot {
  fan_out_latencies_ms: number[]
  late_join_latencies_ms: number[]
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
}
