import type { WorkerMetrics, AggregatedMetrics } from "./types.js"

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

export function aggregateMetrics(workers: WorkerMetrics[]): AggregatedMetrics {
  const sum = (field: keyof WorkerMetrics) =>
    workers.reduce((acc, w) => acc + ((w[field] as number) ?? 0), 0)

  const allFanOut = workers.flatMap((w) => w.fan_out_latencies_ms).sort((a, b) => a - b)
  const allLateJoin = workers.flatMap((w) => w.late_join_latencies_ms).sort((a, b) => a - b)

  return {
    connections_attempted: sum("connections_attempted"),
    connections_established: sum("connections_established"),
    connection_failures: sum("connection_failures"),
    events_published: 0,
    events_received: sum("events_received"),
    missing_sequences: sum("missing_sequences"),
    duplicates: sum("duplicates"),
    out_of_order: sum("out_of_order"),
    fan_out_latency_p50_ms: percentile(allFanOut, 50),
    fan_out_latency_p95_ms: percentile(allFanOut, 95),
    fan_out_latency_p99_ms: percentile(allFanOut, 99),
    fan_out_latency_max_ms: allFanOut.length > 0 ? allFanOut[allFanOut.length - 1] : 0,
    late_join_p50_ms: percentile(allLateJoin, 50),
    late_join_p95_ms: percentile(allLateJoin, 95),
    late_join_p99_ms: percentile(allLateJoin, 99),
    late_join_max_ms: allLateJoin.length > 0 ? allLateJoin[allLateJoin.length - 1] : 0,
    reconnect_gaps: sum("reconnect_gaps"),
    reconnect_duplicates: sum("reconnect_duplicates"),
    reconnect_order_violations: sum("reconnect_order_violations"),
    slow_consumer_disconnects: sum("slow_consumer_disconnects"),
    event_loop_delay_p99_ms: Math.max(...workers.map((w) => w.event_loop_delay_p99_ms)),
    memory_mb_peak: Math.max(...workers.map((w) => w.memory_mb_peak)),
  }
}

export function printSummary(metrics: AggregatedMetrics, eventsPublished: number): void {
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
  console.log("")

  console.log("EVENTS")
  console.log(`  Published:         ${metrics.events_published}`)
  console.log(`  Received:          ${metrics.events_received}`)
  console.log(`  Missing seqs:      ${metrics.missing_sequences}`)
  console.log(`  Duplicates:        ${metrics.duplicates}`)
  console.log(`  Out of order:      ${metrics.out_of_order}`)
  console.log("")

  console.log("FAN-OUT LATENCY (publish → SSE frame receipt)")
  console.log(`  p50:               ${metrics.fan_out_latency_p50_ms}ms`)
  console.log(`  p95:               ${metrics.fan_out_latency_p95_ms}ms`)
  console.log(`  p99:               ${metrics.fan_out_latency_p99_ms}ms`)
  console.log(`  max:               ${metrics.fan_out_latency_max_ms}ms`)
  console.log("")

  console.log("LATE-JOIN (connection open → caught up)")
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

  console.log("RESOURCES")
  console.log(`  Event loop p99:    ${metrics.event_loop_delay_p99_ms}ms`)
  console.log(`  Memory peak:       ${metrics.memory_mb_peak}MB`)
  console.log("")

  // Verdict
  console.log("═══════════════════════════════════════════════════════════════")

  const verdicts: string[] = []

  if (metrics.fan_out_latency_p95_ms <= 500) {
    verdicts.push("PASS  fan_out_p95 <= 500ms")
  } else if (metrics.fan_out_latency_p95_ms <= 2000) {
    verdicts.push("WARN  fan_out_p95 <= 2s (assignment threshold)")
  } else {
    verdicts.push("FAIL  fan_out_p95 > 2s")
  }

  if (metrics.late_join_p95_ms <= 2000) {
    verdicts.push("PASS  late_join_p95 <= 2s")
  } else {
    verdicts.push("FAIL  late_join_p95 > 2s")
  }

  if (metrics.missing_sequences === 0) {
    verdicts.push("PASS  missing_sequences == 0")
  } else {
    verdicts.push("FAIL  missing_sequences > 0")
  }

  if (metrics.duplicates === 0) {
    verdicts.push("PASS  duplicates == 0")
  } else {
    verdicts.push("FAIL  duplicates > 0")
  }

  if (metrics.out_of_order === 0) {
    verdicts.push("PASS  out_of_order == 0")
  } else {
    verdicts.push("FAIL  out_of_order > 0")
  }

  if (metrics.reconnect_gaps === 0) {
    verdicts.push("PASS  reconnect_gaps == 0")
  } else {
    verdicts.push("FAIL  reconnect_gaps > 0")
  }

  for (const v of verdicts) {
    console.log(`  ${v}`)
  }

  const allPass = verdicts.every((v) => v.startsWith("PASS"))
  console.log("")
  console.log(`  VERDICT: ${allPass ? "ACCEPT" : "REJECT/INCONCLUSIVE"}`)
  console.log("═══════════════════════════════════════════════════════════════")
}
