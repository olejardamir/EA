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
    }
  }
}
