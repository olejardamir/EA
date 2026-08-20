import type { MetricsRecorder, MetricsSnapshot } from "../ports/metrics.js"
import { StreamingHistogram } from "./streaming-histogram.js"

// §6.32: Bounded-memory metrics recorder using streaming histograms.
// Cumulative percentiles are computed from the histogram (preserves ALL samples).
// A small raw buffer (10k samples, FIFO) is kept for scenario-level phase-scoped queries
// (burst.ts, slow-consumer.ts, connection-surge.ts use array.slice for phase deltas).
const PHASE_BUFFER_MAX = 10_000

export class BoundedMetricsRecorder implements MetricsRecorder {
  private fanOutHistogram = new StreamingHistogram()
  private lateJoinHistogram = new StreamingHistogram()
  // Small FIFO buffer for the most recent samples (scenario phase-scoped queries)
  private fanOutBuffer: number[] = []
  private lateJoinBuffer: number[] = []
  private latencySampleCount = 0
  private latencyInvalidCount = 0
  private latencyOverflowCount = 0
  private eventsReceived = 0
  private expectedFanDeliveries = 0
  private receivedFanDeliveries = 0
  private missingSequences = 0
  private duplicates = 0
  private outOfOrder = 0
  private reconnectGaps = 0
  private reconnectDuplicates = 0
  private reconnectOrderViolations = 0
  private slowConsumerDisconnects = 0
  private connectionsAttempted = 0
  private connectionsEstablished = 0
  private connectionFailures = 0
  private connectionsDropped = 0
  private activeConnectionsCurrent = 0
  private activeConnectionsPeak = 0
  private currentBacklog = 0
  private backlogPeak = 0
  private sseParseErrors = 0
  private jsonParseErrors = 0
  private invalidTimestampCount = 0
  // §4.19: Schema validation error accounting
  private schemaValidationErrors = 0
  private missingTransportId = 0
  // §4.16: Separate live vs replay delivery accounting
  private liveExpectedDeliveries = 0
  private liveReceivedDeliveries = 0
  private lateJoinHistoryExpected = 0
  private lateJoinHistoryReceived = 0
  private reconnectReplayExpected = 0
  private reconnectReplayReceived = 0
  private restartReplayExpected = 0
  private restartReplayReceived = 0
  // §4.17: Disconnect attribution
  private deliberateDisconnects = 0
  private unexpectedClientDisconnects = 0
  private serverInitiatedDisconnects = 0
  private networkFailures = 0
  private shutdownCleanupDisconnects = 0

  recordFanOutLatency(ms: number): void {
    this.latencySampleCount++
    this.fanOutHistogram.record(ms)
    this.fanOutBuffer.push(ms)
    if (this.fanOutBuffer.length > PHASE_BUFFER_MAX) {
      this.fanOutBuffer = this.fanOutBuffer.slice(-PHASE_BUFFER_MAX)
    }
  }

  recordLateJoinLatency(ms: number): void {
    this.lateJoinHistogram.record(ms)
    this.lateJoinBuffer.push(ms)
    if (this.lateJoinBuffer.length > PHASE_BUFFER_MAX) {
      this.lateJoinBuffer = this.lateJoinBuffer.slice(-PHASE_BUFFER_MAX)
    }
  }

  incrementLatencyInvalid(): void { this.latencyInvalidCount++ }
  incrementLatencyOverflow(): void { this.latencyOverflowCount++ }
  incrementEventsReceived(): void { this.eventsReceived++ }
  incrementExpectedFanDeliveries(count: number): void { this.expectedFanDeliveries += count }
  incrementMissingSequences(count = 1): void { this.missingSequences += count }
  incrementDuplicates(): void { this.duplicates++ }
  incrementOutOfOrder(): void { this.outOfOrder++ }
  incrementReconnectGaps(count = 1): void { this.reconnectGaps += count }
  incrementReconnectDuplicates(): void { this.reconnectDuplicates++ }
  incrementReconnectOrderViolations(): void { this.reconnectOrderViolations++ }
  incrementSlowConsumerDisconnects(): void { this.slowConsumerDisconnects++ }
  incrementConnectionsAttempted(): void { this.connectionsAttempted++ }
  incrementConnectionsEstablished(): void { this.connectionsEstablished++ }
  incrementConnectionFailures(): void { this.connectionFailures++ }
  incrementConnectionsDropped(): void { this.connectionsDropped++ }
  setActiveConnections(count: number): void {
    this.activeConnectionsCurrent = count
    if (count > this.activeConnectionsPeak) this.activeConnectionsPeak = count
  }

  setBacklog(backlog: number): void {
    this.currentBacklog = backlog
    if (backlog > this.backlogPeak) this.backlogPeak = backlog
  }

  incrementSseParseErrors(): void { this.sseParseErrors++ }
  incrementJsonParseErrors(): void { this.jsonParseErrors++ }
  incrementInvalidTimestampCount(): void { this.invalidTimestampCount++ }
  // §4.19: Schema validation error accounting
  incrementSchemaValidationErrors(): void { this.schemaValidationErrors++ }
  incrementMissingTransportId(): void { this.missingTransportId++ }

  // §4.16: Live vs replay delivery accounting
  incrementLiveExpectedDeliveries(count = 1): void { this.liveExpectedDeliveries += count }
  incrementLiveReceivedDeliveries(count = 1): void { this.liveReceivedDeliveries += count }
  incrementLateJoinHistoryExpected(count: number): void { this.lateJoinHistoryExpected += count }
  incrementLateJoinHistoryReceived(count: number): void { this.lateJoinHistoryReceived += count }
  incrementReconnectReplayExpected(count: number): void { this.reconnectReplayExpected += count }
  incrementReconnectReplayReceived(count: number): void { this.reconnectReplayReceived += count }
  incrementRestartReplayExpected(count: number): void { this.restartReplayExpected += count }
  incrementRestartReplayReceived(count: number): void { this.restartReplayReceived += count }

  // §4.17: Disconnect attribution
  incrementDeliberateDisconnects(): void { this.deliberateDisconnects++ }
  incrementUnexpectedClientDisconnects(): void { this.unexpectedClientDisconnects++ }
  incrementServerInitiatedDisconnects(): void { this.serverInitiatedDisconnects++ }
  incrementNetworkFailures(): void { this.networkFailures++ }
  incrementShutdownCleanup(): void { this.shutdownCleanupDisconnects++ }

  // §6.32: Expose histograms for final percentile computation
  getFanOutHistogram(): StreamingHistogram { return this.fanOutHistogram }
  getLateJoinHistogram(): StreamingHistogram { return this.lateJoinHistogram }

  snapshot(): MetricsSnapshot {
    return {
      // §6.32: Raw arrays are a bounded recent buffer for scenario phase-scoped queries.
      // Final percentiles must be computed from the streaming histograms, not these arrays.
      fan_out_latencies_ms: [...this.fanOutBuffer],
      late_join_latencies_ms: [...this.lateJoinBuffer],
      latency_sample_count: this.latencySampleCount,
      latency_invalid_count: this.latencyInvalidCount,
      latency_overflow_count: this.latencyOverflowCount,
      events_received: this.eventsReceived,
      expected_fan_deliveries: this.expectedFanDeliveries,
      received_fan_deliveries: this.eventsReceived,
      missing_sequences: this.missingSequences,
      duplicates: this.duplicates,
      out_of_order: this.outOfOrder,
      reconnect_gaps: this.reconnectGaps,
      reconnect_duplicates: this.reconnectDuplicates,
      reconnect_order_violations: this.reconnectOrderViolations,
      slow_consumer_disconnects: this.slowConsumerDisconnects,
      connections_attempted: this.connectionsAttempted,
      connections_established: this.connectionsEstablished,
      connection_failures: this.connectionFailures,
      connections_dropped: this.connectionsDropped,
      active_connections_peak: this.activeConnectionsPeak,
      generator_backlog_peak: this.backlogPeak,
      sse_parse_errors: this.sseParseErrors,
      json_parse_errors: this.jsonParseErrors,
      invalid_timestamp_count: this.invalidTimestampCount,
      // §4.19: Schema validation error accounting
      schema_validation_errors: this.schemaValidationErrors,
      missing_transport_id: this.missingTransportId,
      // §4.16: Live vs replay delivery accounting
      live_expected_deliveries: this.liveExpectedDeliveries,
      live_received_deliveries: this.liveReceivedDeliveries,
      late_join_history_expected: this.lateJoinHistoryExpected,
      late_join_history_received: this.lateJoinHistoryReceived,
      reconnect_replay_expected: this.reconnectReplayExpected,
      reconnect_replay_received: this.reconnectReplayReceived,
      restart_replay_expected: this.restartReplayExpected,
      restart_replay_received: this.restartReplayReceived,
      // §4.17: Disconnect attribution
      deliberate_disconnects: this.deliberateDisconnects,
      unexpected_client_disconnects: this.unexpectedClientDisconnects,
      server_initiated_disconnects: this.serverInitiatedDisconnects,
      network_failures: this.networkFailures,
      shutdown_cleanup_disconnects: this.shutdownCleanupDisconnects,
    }
  }
}
