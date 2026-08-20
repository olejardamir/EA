import type { AggregatedMetrics, Verdict, VerdictResult } from "../domain/result.js"

export function classifyResult(
  metrics: AggregatedMetrics,
  generatorHealthy: boolean,
  timingValid: boolean,
): VerdictResult {
  const checks: Array<{ name: string; passed: boolean; detail: string }> = []

  checks.push({
    name: "fan_out_p95",
    passed: metrics.fan_out_latency_p95_ms <= 500,
    detail: `${metrics.fan_out_latency_p95_ms}ms <= 500ms`,
  })

  checks.push({
    name: "late_join_p95",
    passed: metrics.late_join_p95_ms <= 2000,
    detail: `${metrics.late_join_p95_ms}ms <= 2000ms`,
  })

  const connectionsTarget = metrics.connections_target || 10000
  checks.push({
    name: "connections_target",
    passed: metrics.connections_established >= connectionsTarget,
    detail: `${metrics.connections_established} >= ${connectionsTarget}`,
  })

  checks.push({
    name: "missing_sequences",
    passed: metrics.missing_sequences === 0,
    detail: `${metrics.missing_sequences} == 0`,
  })

  checks.push({
    name: "duplicates",
    passed: metrics.duplicates === 0,
    detail: `${metrics.duplicates} == 0`,
  })

  checks.push({
    name: "out_of_order",
    passed: metrics.out_of_order === 0,
    detail: `${metrics.out_of_order} == 0`,
  })

  checks.push({
    name: "burst_fan_out_p95",
    passed: metrics.burst_fan_out_p95_ms <= 1000,
    detail: `${metrics.burst_fan_out_p95_ms}ms <= 1000ms`,
  })

  checks.push({
    name: "reconnect_gaps",
    passed: metrics.reconnect_gaps === 0,
    detail: `${metrics.reconnect_gaps} == 0`,
  })

  checks.push({
    name: "reconnect_duplicates",
    passed: metrics.reconnect_duplicates === 0,
    detail: `${metrics.reconnect_duplicates} == 0`,
  })

  checks.push({
    name: "reconnect_order_violations",
    passed: metrics.reconnect_order_violations === 0,
    detail: `${metrics.reconnect_order_violations} == 0`,
  })

  if (metrics.run_profile === "evidence") {
    checks.push({
      name: "nchan_history_replay",
      passed: metrics.nchan_restart_history_replay_correct,
      detail: metrics.nchan_restart_history_replay_correct ? "replay correct" : "replay mismatch",
    })
  }

  checks.push({
    name: "slow_consumer_disconnects",
    passed: metrics.slow_consumer_disconnects > 0,
    detail: `${metrics.slow_consumer_disconnects} > 0`,
  })

  checks.push({
    name: "non_slow_impact",
    passed: metrics.non_slow_p95_degradation_pct <= 5,
    detail: `${metrics.non_slow_p95_degradation_pct}% <= 5%`,
  })

  if (metrics.nchan_memory_mb_peak !== null) {
    checks.push({
      name: "nchan_memory",
      passed: metrics.nchan_memory_mb_peak < 3500,
      detail: `${metrics.nchan_memory_mb_peak}MB < 3500MB`,
    })
  }

  if (metrics.redis_memory_mb_peak !== null) {
    checks.push({
      name: "redis_memory",
      passed: metrics.redis_memory_mb_peak < 1800,
      detail: `${metrics.redis_memory_mb_peak}MB < 1800MB`,
    })
  }

  checks.push({
    name: "timing_valid",
    passed: timingValid,
    detail: timingValid ? "timing measurements valid" : "timing measurements invalid",
  })

  checks.push({
    name: "generator_not_saturated",
    passed: generatorHealthy,
    detail: generatorHealthy ? "generator healthy" : "generator saturated",
  })

  const allPassed = checks.every((c) => c.passed)
  let verdict: Verdict

  if (!generatorHealthy) {
    verdict = "INCONCLUSIVE"
  } else if (allPassed) {
    verdict = "ACCEPT"
  } else {
    verdict = "REJECT"
  }

  return { verdict, checks }
}

export function aggregateWorkerMetrics(
  workerMetrics: Array<{ snapshot(): import("../ports/metrics.js").MetricsSnapshot }>,
): AggregatedMetrics {
  function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0
    const idx = Math.ceil((p / 100) * sorted.length) - 1
    return sorted[Math.max(0, idx)]
  }

  const allFanOut: number[] = []
  const allLateJoin: number[] = []

  let connections_attempted = 0
  let connections_established = 0
  let connection_failures = 0
  let events_received = 0
  let expected_fan_deliveries = 0
  let received_fan_deliveries = 0
  let missing_sequences = 0
  let duplicates = 0
  let out_of_order = 0
  let reconnect_gaps = 0
  let reconnect_duplicates = 0
  let reconnect_order_violations = 0
  let slow_consumer_disconnects = 0

  for (const wm of workerMetrics) {
    const s = wm.snapshot()
    connections_attempted += s.connections_attempted
    connections_established += s.connections_established
    connection_failures += s.connection_failures
    events_received += s.events_received
    expected_fan_deliveries += s.expected_fan_deliveries
    received_fan_deliveries += s.received_fan_deliveries
    missing_sequences += s.missing_sequences
    duplicates += s.duplicates
    out_of_order += s.out_of_order
    reconnect_gaps += s.reconnect_gaps
    reconnect_duplicates += s.reconnect_duplicates
    reconnect_order_violations += s.reconnect_order_violations
    slow_consumer_disconnects += s.slow_consumer_disconnects
    allFanOut.push(...s.fan_out_latencies_ms)
    allLateJoin.push(...s.late_join_latencies_ms)
  }

  allFanOut.sort((a, b) => a - b)
  allLateJoin.sort((a, b) => a - b)

  return {
    connections_attempted,
    connections_established,
    connection_failures,
    events_published: 0,
    events_received,
    expected_fan_deliveries,
    received_fan_deliveries,
    missing_sequences,
    duplicates,
    out_of_order,
    fan_out_latency_p50_ms: percentile(allFanOut, 50),
    fan_out_latency_p95_ms: percentile(allFanOut, 95),
    fan_out_latency_p99_ms: percentile(allFanOut, 99),
    fan_out_latency_max_ms: allFanOut.length > 0 ? allFanOut[allFanOut.length - 1] : 0,
    late_join_p50_ms: percentile(allLateJoin, 50),
    late_join_p95_ms: percentile(allLateJoin, 95),
    late_join_p99_ms: percentile(allLateJoin, 99),
    late_join_max_ms: allLateJoin.length > 0 ? allLateJoin[allLateJoin.length - 1] : 0,
    reconnect_gaps,
    reconnect_duplicates,
    reconnect_order_violations,
    slow_consumer_disconnects,
    event_loop_delay_p99_ms: 0,
    memory_mb_peak: 0,
    connections_target: 10000,
    burst_fan_out_p95_ms: 0,
    nchan_restart_history_replay_correct: false,
    nchan_restart_missing_sequences: 0,
    non_slow_p95_degradation_pct: 0,
    nchan_memory_mb_peak: null,
    redis_memory_mb_peak: null,
    timing_valid: true,
    generator_cpu_percent_peak: 0,
    generator_event_loop_p99_ms: 0,
    run_profile: "evidence" as const,
  }
}
