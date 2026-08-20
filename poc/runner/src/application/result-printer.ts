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
  console.log(`  [§BA: single-sample frozen interpretation — p95=p50=p99=max]`)
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

  console.log("PUBLISHER (§BM)")
  console.log(`  Attempts:          ${metrics.publisher_attempts}`)
  console.log(`  Successes:         ${metrics.publisher_successes}`)
  console.log(`  Definite failures: ${metrics.publisher_definite_failures}`)
  console.log(`  Ambiguous:         ${metrics.publisher_ambiguous_failures}`)
  console.log(`  Backlog peak:      ${metrics.generator_backlog_peak}`)
  console.log("")

  console.log("PARSE ERRORS (§BJ)")
  console.log(`  SSE parse errors:  ${metrics.sse_parse_errors}`)
  console.log(`  JSON parse errors: ${metrics.json_parse_errors}`)
  console.log(`  Invalid timestamps:${metrics.invalid_timestamp_count}`)
  console.log("")

  console.log("SURGE HEALTH (§BH)")
  console.log(`  Events received:   ${metrics.surge_events_received}`)
  console.log(`  Missing sequences: ${metrics.surge_missing_sequences}`)
  console.log(`  Duplicates:        ${metrics.surge_duplicates}`)
  console.log(`  Out of order:      ${metrics.surge_out_of_order}`)
  console.log(`  Fan-out p95:       ${metrics.surge_fan_out_p95_ms}ms`)
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

// §6.24: Machine-readable JSON result emitted to stdout after human summary
export function emitMachineReadableResult(
  metrics: AggregatedMetrics,
  eventsPublished: number,
  verdictResult: VerdictResult,
  config: { targetConnections: number; seed: number; runProfile: string; warmupSeconds: number; measureSeconds: number; burstSeconds: number; cooldownSeconds: number; slowConsumerFraction: number; lobbyFraction: number },
): void {
  metrics.events_published = eventsPublished

  const result = {
    contract_version: "v2.0.2",
    run_profile: config.runProfile,
    seed: config.seed,
    resolved_config: {
      target_connections: config.targetConnections,
      warmup_seconds: config.warmupSeconds,
      measure_seconds: config.measureSeconds,
      burst_seconds: config.burstSeconds,
      cooldown_seconds: config.cooldownSeconds,
      slow_consumer_fraction: config.slowConsumerFraction,
      lobby_fraction: config.lobbyFraction,
    },
    scenario_results: verdictResult.checks.map((c) => ({
      name: c.name,
      passed: c.passed,
      detail: c.detail,
    })),
    connection_metrics: {
      connections_attempted: metrics.connections_attempted,
      connections_established: metrics.connections_established,
      connection_failures: metrics.connection_failures,
      connections_dropped: metrics.connections_dropped,
      connections_target: metrics.connections_target,
      active_connections_peak: metrics.active_connections_peak ?? 0,
    },
    event_metrics: {
      events_published: metrics.events_published,
      events_received: metrics.events_received,
      missing_sequences: metrics.missing_sequences,
      duplicates: metrics.duplicates,
      out_of_order: metrics.out_of_order,
    },
    live_delivery_accounting: {
      expected_fan_deliveries: metrics.expected_fan_deliveries,
      received_fan_deliveries: metrics.received_fan_deliveries,
    },
    latency_metrics: {
      fan_out_p50_ms: metrics.fan_out_latency_p50_ms,
      fan_out_p95_ms: metrics.fan_out_latency_p95_ms,
      fan_out_p99_ms: metrics.fan_out_latency_p99_ms,
      fan_out_max_ms: metrics.fan_out_latency_max_ms,
      late_join_p50_ms: metrics.late_join_p50_ms,
      late_join_p95_ms: metrics.late_join_p95_ms,
      late_join_p99_ms: metrics.late_join_p99_ms,
      late_join_max_ms: metrics.late_join_max_ms,
    },
    reconnect_metrics: {
      gaps: metrics.reconnect_gaps,
      duplicates: metrics.reconnect_duplicates,
      order_violations: metrics.reconnect_order_violations,
    },
    slow_client_metrics: {
      disconnects: metrics.slow_consumer_disconnects,
      non_slow_p95_degradation_pct: metrics.non_slow_p95_degradation_pct,
    },
    restart_metrics: {
      history_replay_correct: metrics.nchan_restart_history_replay_correct,
      missing_sequences: metrics.nchan_restart_missing_sequences,
    },
    resource_metrics: {
      event_loop_delay_p99_ms: metrics.event_loop_delay_p99_ms,
      memory_mb_peak: metrics.memory_mb_peak,
      nchan_memory_mb_peak: metrics.nchan_memory_mb_peak,
      redis_memory_mb_peak: metrics.redis_memory_mb_peak,
      generator_cpu_percent_peak: metrics.generator_cpu_percent_peak,
      generator_event_loop_p99_ms: metrics.generator_event_loop_p99_ms,
      generator_backlog_peak: metrics.generator_backlog_peak,
      cpu_usage_usec: metrics.cpu_usage_usec,
      cpu_throttled_count: metrics.cpu_throttled_count,
      cpu_throttled_usec: metrics.cpu_throttled_usec,
      memory_oom_events: metrics.memory_oom_events,
      memory_oom_kill_events: metrics.memory_oom_kill_events,
      memory_current_bytes: metrics.memory_current_bytes,
      memory_peak_bytes: metrics.memory_peak_bytes,
      cpu_max_quota: metrics.cpu_max_quota,
      memory_max_bytes: metrics.memory_max_bytes,
    },
    publisher_metrics: {
      attempts: metrics.publisher_attempts,
      successes: metrics.publisher_successes,
      definite_failures: metrics.publisher_definite_failures,
      ambiguous_failures: metrics.publisher_ambiguous_failures,
    },
    parse_error_metrics: {
      sse_parse_errors: metrics.sse_parse_errors,
      json_parse_errors: metrics.json_parse_errors,
      invalid_timestamp_count: metrics.invalid_timestamp_count,
    },
    surge_health: {
      fan_out_p95_ms: metrics.surge_fan_out_p95_ms,
      missing_sequences: metrics.surge_missing_sequences,
      duplicates: metrics.surge_duplicates,
      out_of_order: metrics.surge_out_of_order,
      events_received: metrics.surge_events_received,
    },
    phase_publish_rates: metrics.phase_publish_rates,
    viewer_concentration: {
      lobby_subscribers: metrics.lobby_subscribers,
      match_001_subscribers: metrics.match_001_subscribers,
    },
    validity: {
      timing_valid: metrics.timing_valid,
      generator_healthy: metrics.generator_cpu_percent_peak < 90 && metrics.generator_event_loop_p99_ms < 100,
    },
    classification: {
      verdict: verdictResult.verdict,
      checks: verdictResult.checks,
    },
  }

  // Emit as a single JSON line on stdout for machine parsing
  console.log(JSON.stringify(result))
}
