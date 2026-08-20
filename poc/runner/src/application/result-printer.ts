import type { AggregatedMetrics, VerdictResult } from "../domain/result.js"

export function printSummary(
  metrics: AggregatedMetrics,
  eventsPublished: number,
  verdictResult: VerdictResult,
): void {
  metrics.events_published = eventsPublished

  console.log("")
  console.log("═══════════════════════════════════════════════════════════════")
  console.log("                    POC RESULTS SUMMARY                       ")
  console.log("═══════════════════════════════════════════════════════════════")
  console.log("")

  console.log("CONNECTIONS")
  console.log(`  Attempted:         ${metrics.connections_attempted}`)
  console.log(`  Established:       ${metrics.connections_established}`)
  console.log(`  Failures:          ${metrics.connection_failures}`)
  console.log(`  Target:            ${metrics.connections_target}`)
  console.log("")

  console.log("EVENTS")
  console.log(`  Published:         ${metrics.events_published}`)
  console.log(`  Received:          ${metrics.events_received}`)
  console.log(`  Missing seqs:      ${metrics.missing_sequences}`)
  console.log(`  Duplicates:        ${metrics.duplicates}`)
  console.log(`  Out of order:      ${metrics.out_of_order}`)
  console.log("")

  console.log("FAN-DELIVERY ACCOUNTING")
  console.log(`  Expected:          ${metrics.expected_fan_deliveries}`)
  console.log(`  Received:          ${metrics.received_fan_deliveries}`)
  const deliveryRatio = metrics.expected_fan_deliveries > 0
    ? ((metrics.received_fan_deliveries / metrics.expected_fan_deliveries) * 100).toFixed(2)
    : "N/A"
  console.log(`  Delivery ratio:    ${deliveryRatio}%`)
  console.log("")

  console.log("FAN-OUT LATENCY (publish -> SSE frame receipt)")
  console.log(`  p50:               ${metrics.fan_out_latency_p50_ms}ms`)
  console.log(`  p95:               ${metrics.fan_out_latency_p95_ms}ms`)
  console.log(`  p99:               ${metrics.fan_out_latency_p99_ms}ms`)
  console.log(`  max:               ${metrics.fan_out_latency_max_ms}ms`)
  console.log("")

  console.log("LATE-JOIN (connection open -> caught up)")
  console.log(`  p50:               ${metrics.late_join_p50_ms}ms`)
  console.log(`  p95:               ${metrics.late_join_p95_ms}ms`)
  console.log(`  p99:               ${metrics.late_join_p99_ms}ms`)
  console.log(`  max:               ${metrics.late_join_max_ms}ms`)
  console.log("")

  console.log("RECONNECT/RESUME")
  console.log(`  Gaps:              ${metrics.reconnect_gaps}`)
  console.log(`  Duplicates:        ${metrics.reconnect_duplicates}`)
  console.log(`  Order violations:  ${metrics.reconnect_order_violations}`)
  console.log("")

  console.log("SLOW CLIENT")
  console.log(`  Disconnects:       ${metrics.slow_consumer_disconnects}`)
  console.log("")

  console.log("LOBBY")
  console.log(`  Subscribers:       ${metrics.lobby_subscribers}`)
  console.log("")

  console.log("RESOURCES")
  console.log(`  Event loop p99:    ${metrics.event_loop_delay_p99_ms}ms`)
  console.log(`  Memory peak:       ${metrics.memory_mb_peak}MB`)
  if (metrics.nchan_memory_mb_peak !== null) {
    console.log(`  Nchan memory peak: ${metrics.nchan_memory_mb_peak}MB`)
  } else {
    console.log(`  Nchan memory peak: unavailable (requires Docker socket)`)
  }
  if (metrics.redis_memory_mb_peak !== null) {
    console.log(`  Redis memory peak: ${metrics.redis_memory_mb_peak}MB`)
  } else {
    console.log(`  Redis memory peak: unavailable`)
  }
  console.log("")

  if (metrics.phase_publish_rates.length > 0) {
    console.log("PHASE PUBLISH RATES")
    for (const pr of metrics.phase_publish_rates) {
      console.log(`  ${pr.phase.padEnd(12)} ${pr.eventsPerSec} evt/s  hot-match: ${pr.hotMatchPct}%`)
    }
    console.log("")
  }

  console.log("═══════════════════════════════════════════════════════════════")

  for (const check of verdictResult.checks) {
    const status = check.passed ? "PASS" : "FAIL"
    console.log(`  ${status.padEnd(5)} ${check.name}: ${check.detail}`)
  }

  console.log("")
  console.log(`  VERDICT: ${verdictResult.verdict}`)
  console.log("═══════════════════════════════════════════════════════════════")
}
