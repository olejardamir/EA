import type { MetricsRecorder, MetricsSnapshot } from "../ports/metrics.js"

export class BoundedMetricsRecorder implements MetricsRecorder {
  private fanOutLatencies: number[] = []
  private lateJoinLatencies: number[] = []
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

  private maxLatencySamples = 100_000

  private trimArray(arr: number[]): number[] {
    if (arr.length > this.maxLatencySamples) {
      return arr.slice(arr.length - this.maxLatencySamples)
    }
    return arr
  }

  recordFanOutLatency(ms: number): void {
    this.latencySampleCount++
    this.fanOutLatencies.push(ms)
    if (this.fanOutLatencies.length > this.maxLatencySamples) {
      this.fanOutLatencies = this.trimArray(this.fanOutLatencies)
    }
  }

  recordLateJoinLatency(ms: number): void {
    this.lateJoinLatencies.push(ms)
    if (this.lateJoinLatencies.length > this.maxLatencySamples) {
      this.lateJoinLatencies = this.trimArray(this.lateJoinLatencies)
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

  snapshot(): MetricsSnapshot {
    return {
      fan_out_latencies_ms: [...this.fanOutLatencies],
      late_join_latencies_ms: [...this.lateJoinLatencies],
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
