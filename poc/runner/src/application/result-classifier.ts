import type { AggregatedMetrics, Verdict, VerdictResult } from "../domain/result.js"

export function classifyResult(
  metrics: AggregatedMetrics,
  generatorHealthy: boolean,
  timingValid: boolean,
): VerdictResult {
  const checks: Array<{ name: string; passed: boolean; detail: string }> = []

  if (metrics.run_profile === "smoke") {
    checks.push({
      name: "smoke_gate",
      passed: true,
      detail: "smoke profile: measurement-only, not ACCEPT/REJECT",
    })
    return { verdict: "NOT_APPLICABLE", checks }
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

  if (!timingValid || !generatorHealthy) {
    const reason = !timingValid && !generatorHealthy
      ? "timing invalid + generator saturated"
      : !timingValid
        ? "timing measurements invalid"
        : "generator saturated"
    checks.push({
      name: "inconclusive_override",
      passed: false,
      detail: `${reason} — all other checks suppressed`,
    })
    return { verdict: "INCONCLUSIVE", checks }
  }

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

  checks.push({
    name: "connections_target",
    passed: metrics.connections_established >= metrics.connections_target,
    detail: `${metrics.connections_established} >= ${metrics.connections_target}`,
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

  checks.push({
    name: "nchan_history_replay",
    passed: metrics.nchan_restart_history_replay_correct,
    detail: metrics.nchan_restart_history_replay_correct ? "replay correct" : "replay mismatch",
  })

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

  // §BK: CPU throttling acceptance — frozen rule: nr_throttled must be 0
  // Counter is sampled from cgroup v2 cpu.stat at end of run.
  // If cgroup v2 is unavailable, check is skipped (not INCONCLUSIVE).
  if (metrics.cpu_throttled_count !== null) {
    checks.push({
      name: "cpu_throttling",
      passed: metrics.cpu_throttled_count === 0,
      detail: `nr_throttled=${metrics.cpu_throttled_count} == 0`,
    })
  }

  // §AC: OOM kill detection — frozen rule: no container OOM kills
  // Counter is sampled from cgroup v2 memory.events oom_kill at end of run.
  if (metrics.memory_oom_kill_events !== null) {
    checks.push({
      name: "oom_kills",
      passed: metrics.memory_oom_kill_events === 0,
      detail: `oom_kill=${metrics.memory_oom_kill_events} == 0`,
    })
  }

  // §BJ: Parse error accounting — frozen rule: no malformed/control-frame errors
  checks.push({
    name: "sse_parse_errors",
    passed: metrics.sse_parse_errors === 0,
    detail: `${metrics.sse_parse_errors} == 0`,
  })

  checks.push({
    name: "json_parse_errors",
    passed: metrics.json_parse_errors === 0,
    detail: `${metrics.json_parse_errors} == 0`,
  })

  checks.push({
    name: "invalid_timestamp_count",
    passed: metrics.invalid_timestamp_count === 0,
    detail: `${metrics.invalid_timestamp_count} == 0`,
  })

  // §BH: Surge existing-viewer health — frozen rule: no correctness degradation during ramp
  checks.push({
    name: "surge_missing_sequences",
    passed: metrics.surge_missing_sequences === 0,
    detail: `${metrics.surge_missing_sequences} == 0`,
  })

  checks.push({
    name: "surge_duplicates",
    passed: metrics.surge_duplicates === 0,
    detail: `${metrics.surge_duplicates} == 0`,
  })

  checks.push({
    name: "surge_out_of_order",
    passed: metrics.surge_out_of_order === 0,
    detail: `${metrics.surge_out_of_order} == 0`,
  })

  checks.push({
    name: "surge_fan_out_p95",
    passed: metrics.surge_fan_out_p95_ms <= 500,
    detail: `${metrics.surge_fan_out_p95_ms}ms <= 500ms`,
  })

  const allPassed = checks.every((c) => c.passed)
  let verdict: Verdict

  if (allPassed) {
    verdict = "ACCEPT"
  } else {
    verdict = "REJECT"
  }

  return { verdict, checks }
}

export function aggregateWorkerMetrics(
  workerMetrics: Array<{ snapshot(): import("../ports/metrics.js").MetricsSnapshot }>,
  phaseSnapshots?: Array<{ phase: string; eventsPublished: number; byMatch: Map<string, number>; durationMs: number }>,
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
  let connections_dropped = 0
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
  let sse_parse_errors = 0
  let json_parse_errors = 0
  let invalid_timestamp_count = 0

  for (const wm of workerMetrics) {
    const s = wm.snapshot()
    connections_attempted += s.connections_attempted
    connections_established += s.connections_established
    connection_failures += s.connection_failures
    connections_dropped += s.connections_dropped
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
    sse_parse_errors += s.sse_parse_errors
    json_parse_errors += s.json_parse_errors
    invalid_timestamp_count += s.invalid_timestamp_count
    allFanOut.push(...s.fan_out_latencies_ms)
    allLateJoin.push(...s.late_join_latencies_ms)
  }

  allFanOut.sort((a, b) => a - b)
  allLateJoin.sort((a, b) => a - b)

  const phaseRates = (phaseSnapshots ?? []).map((ps) => {
    const rate = ps.durationMs > 0 ? ps.eventsPublished / (ps.durationMs / 1000) : 0
    const total = Array.from(ps.byMatch.values()).reduce((a, b) => a + b, 0)
    const hotMatch = ps.byMatch.get("match-001") ?? 0
    const hotMatchPct = total > 0 ? (hotMatch / total) * 100 : 0
    return { phase: ps.phase, eventsPerSec: Math.round(rate * 10) / 10, hotMatchPct: Math.round(hotMatchPct * 10) / 10 }
  })

  return {
    connections_attempted,
    connections_established,
    connection_failures,
    connections_dropped,
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
    connections_target: 0,
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
    lobby_subscribers: 0,
    match_001_subscribers: 0,
    phase_publish_rates: phaseRates,
    // §AC: cgroup v2 — wired from resource monitor in main.ts
    cpu_usage_usec: null,
    cpu_throttled_count: null,
    cpu_throttled_usec: null,
    memory_oom_events: null,
    memory_oom_kill_events: null,
    memory_current_bytes: null,
    memory_peak_bytes: null,
    cpu_max_quota: null,
    memory_max_bytes: null,
    // §BL: wired from publisher in main.ts
    generator_backlog_peak: 0,
    // §BM: wired from nchan publisher in main.ts
    publisher_attempts: 0,
    publisher_successes: 0,
    publisher_definite_failures: 0,
    publisher_ambiguous_failures: 0,
    // §BJ: parse error accounting
    sse_parse_errors,
    json_parse_errors,
    invalid_timestamp_count,
    // §BH: surge health — defaults, wired from surge scenario in main.ts
    surge_fan_out_p95_ms: 0,
    surge_missing_sequences: 0,
    surge_duplicates: 0,
    surge_out_of_order: 0,
    surge_events_received: 0,
    // §R: active connections peak — wired from metrics recorder in main.ts
    active_connections_peak: 0,
  }
}
