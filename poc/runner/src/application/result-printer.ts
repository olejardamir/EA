import type { AggregatedMetrics, VerdictResult } from "../domain/result.js"
import { runTopologyPreflight, type TopologyPreflight } from "../adapters/topology-preflight.js"

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

  console.log("SLOW CLIENT (§4.7)")
  const sc = metrics.slow_consumer_metrics
  if (sc) {
    console.log(`  Slow clients:      ${sc.slow_clients}/${sc.slow_clients + sc.healthy_clients}`)
    console.log(`  Slow offered:      ${sc.slow_offered_event_count} events`)
    console.log(`  Slow consumed:     ${sc.slow_application_read_count} events`)
    console.log(`  Backlog growth:    ${sc.slow_backlog_growth} events`)
    console.log(`  Backpressure:      ${sc.evidence_server_side_backpressure_reached ? "YES" : "NO"}`)
    console.log(`  Healthy p95 before:${sc.healthy_p95_before_ms}ms`)
    console.log(`  Healthy p95 during:${sc.healthy_p95_during_slow_ms}ms`)
    console.log(`  Healthy degrade:   ${sc.healthy_degradation_pct.toFixed(1)}%`)
    console.log(`  Disconnects:       ${sc.slow_disconnects}`)
  } else {
    console.log(`  Disconnects:       ${metrics.slow_consumer_disconnects} (legacy)`)
  }
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
  config: { targetConnections: number; seed: number; runProfile: string; runMode?: string; warmupSeconds: number; measureSeconds: number; burstSeconds: number; cooldownSeconds: number; slowConsumerFraction: number; lobbyFraction: number; nchanPubUrl?: string; nchanSubUrl?: string; redisUrl?: string; nchanControlUrl?: string },
  topologyPreflight?: TopologyPreflight,
): void {
  metrics.events_published = eventsPublished

  // §4.2/§4.24: Run topology preflight if not provided
  const preflight = topologyPreflight ?? runTopologyPreflight(config.targetConnections)

  const result = {
    contract_version: "v2.0.2",
    run_profile: config.runProfile,
    run_mode: config.runMode ?? "single",
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
    // §4.18: Environment and preflight
    environment: {
      node_version: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
    },
    preflight: {
      nchan_pub_url: config.nchanPubUrl,
      nchan_sub_url: config.nchanSubUrl,
      redis_url: config.redisUrl,
      nchan_control_url: config.nchanControlUrl || null,
    },
    // §4.2/§4.24: Topology and capacity preflight
    host_limits: {
      fd_soft_limit: preflight.fd_soft_limit,
      fd_hard_limit: preflight.fd_hard_limit,
      ephemeral_port_range: preflight.ephemeral_port_range,
      ephemeral_port_count: preflight.ephemeral_port_count,
    },
    // §4.18: Runtime container resource limits (from compose deployment)
    runtime_container_limits: {
      nchan: { cpus: 4, memory_gb: 8, nofile_soft: 200000, nofile_hard: 200000 },
      nchan_2: { cpus: 4, memory_gb: 4, nofile_soft: 200000, nofile_hard: 200000 },
      redis: { cpus: 2, memory_gb: 2 },
      runner: { cpus: 8, memory_gb: 8, nofile_soft: 100000, nofile_hard: 100000 },
    },
    generator_topology: {
      source_ip_count: preflight.source_ip_count,
      destination_tuple_capacity: preflight.destination_tuple_capacity,
      nginx_worker_processes: preflight.nginx_worker_processes,
      nginx_worker_connections: preflight.nginx_worker_connections,
      nginx_max_sse_capacity: preflight.nginx_max_sse_capacity,
      capacity_sufficient: preflight.capacity_sufficient,
      warnings: preflight.warnings,
      // §4.24: Enhanced capacity proof
      non_viewer_fds: preflight.non_viewer_fds,
      fd_headroom: preflight.fd_headroom,
      subscribers_per_nchan_node: preflight.subscribers_per_nchan_node,
      nchan_node_count: preflight.nchan_node_count,
      cpu_quota: preflight.cpu_quota,
      cpu_count: preflight.cpu_count,
    },
    scenario_active_concurrency: {
      lobby_subscribers: metrics.lobby_subscribers,
      match_001_subscribers: metrics.match_001_subscribers,
      total_active_subscribers: (metrics.lobby_subscribers || 0) + (metrics.match_001_subscribers || 0),
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
      // §4.17: Disconnect attribution
      deliberate_disconnects: metrics.deliberate_disconnects ?? 0,
      unexpected_client_disconnects: metrics.unexpected_client_disconnects ?? 0,
      server_initiated_disconnects: metrics.server_initiated_disconnects ?? 0,
      network_failures: metrics.network_failures ?? 0,
      shutdown_cleanup_disconnects: metrics.shutdown_cleanup_disconnects ?? 0,
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
      // §4.16: Live vs replay separation
      live_expected_deliveries: metrics.live_expected_deliveries,
      live_received_deliveries: metrics.live_received_deliveries,
      late_join_history_expected: metrics.late_join_history_expected,
      late_join_history_received: metrics.late_join_history_received,
      reconnect_replay_expected: metrics.reconnect_replay_expected,
      reconnect_replay_received: metrics.reconnect_replay_received,
      restart_replay_expected: metrics.restart_replay_expected,
      restart_replay_received: metrics.restart_replay_received,
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
      expected: metrics.reconnect_replay_expected,
      received: metrics.reconnect_replay_received,
    },
    slow_client_metrics: {
      disconnects: metrics.slow_consumer_disconnects,
      non_slow_p95_degradation_pct: metrics.non_slow_p95_degradation_pct,
      // §4.7: Detailed slow-consumer metrics from scenario
      ...(metrics.slow_consumer_metrics ? {
        slow_clients: metrics.slow_consumer_metrics.slow_clients,
        healthy_clients: metrics.slow_consumer_metrics.healthy_clients,
        slow_offered_event_count: metrics.slow_consumer_metrics.slow_offered_event_count,
        slow_application_read_count: metrics.slow_consumer_metrics.slow_application_read_count,
        slow_backlog_growth: metrics.slow_consumer_metrics.slow_backlog_growth,
        backpressure_duration_ms: metrics.slow_consumer_metrics.backpressure_duration_ms,
        evidence_server_side_backpressure_reached: metrics.slow_consumer_metrics.evidence_server_side_backpressure_reached,
        healthy_p95_before_ms: metrics.slow_consumer_metrics.healthy_p95_before_ms,
        healthy_p95_during_slow_ms: metrics.slow_consumer_metrics.healthy_p95_during_slow_ms,
        healthy_degradation_pct: metrics.slow_consumer_metrics.healthy_degradation_pct,
      } : {}),
    },
    restart_metrics: {
      history_replay_correct: metrics.nchan_restart_history_replay_correct,
      missing_sequences: metrics.nchan_restart_missing_sequences,
      skipped: metrics.nchan_restart_skipped,
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
      // §4.9: Nchan container resource metrics
      nchan_cpu_usage_usec: metrics.nchan_cpu_usage_usec,
      nchan_cpu_throttled_count: metrics.nchan_cpu_throttled_count,
      nchan_cpu_throttled_usec: metrics.nchan_cpu_throttled_usec,
      nchan_memory_current_bytes: metrics.nchan_memory_current_bytes,
      nchan_memory_peak_bytes: metrics.nchan_memory_peak_bytes,
      nchan_memory_oom_events: metrics.nchan_memory_oom_events,
      nchan_memory_oom_kill_events: metrics.nchan_memory_oom_kill_events,
      // §4.9: Redis connected-client peak
      redis_connected_clients_peak: metrics.redis_connected_clients_peak,
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
      // §4.19: Schema validation error accounting
      schema_validation_errors: metrics.schema_validation_errors,
      missing_transport_id: metrics.missing_transport_id,
    },
    surge_health: {
      fan_out_p95_ms: metrics.surge_fan_out_p95_ms,
      missing_sequences: metrics.surge_missing_sequences,
      duplicates: metrics.surge_duplicates,
      out_of_order: metrics.surge_out_of_order,
      events_received: metrics.surge_events_received,
      // §4.5: Surge timing metrics
      surge_target_additions: metrics.surge_target_additions,
      surge_attempted: metrics.surge_attempted,
      surge_established: metrics.surge_established,
      surge_failures: metrics.surge_failures,
      surge_start_time: metrics.surge_start_time,
      surge_end_time: metrics.surge_end_time,
      surge_elapsed_ms: metrics.surge_elapsed_ms,
      surge_timing_error_ms: metrics.surge_timing_error_ms,
      attempt_rate_peak: metrics.attempt_rate_peak,
      establishment_rate_peak: metrics.establishment_rate_peak,
      scheduler_lag_p95: metrics.scheduler_lag_p95,
      scheduler_lag_max: metrics.scheduler_lag_max,
      active_population_start: metrics.active_population_start,
      active_population_end: metrics.active_population_end,
      active_population_peak: metrics.active_population_peak,
    },
    phase_publish_rates: metrics.phase_publish_rates,
    // §4.18: Workload rate metrics with separate match/lobby/total rates
    workload_rate_metrics: {
      total_events_per_sec: metrics.events_published > 0 && metrics.phase_publish_rates.length > 0
        ? metrics.phase_publish_rates.reduce((sum, pr) => sum + pr.eventsPerSec, 0) / metrics.phase_publish_rates.length
        : 0,
      match_events_per_sec: metrics.phase_publish_rates.length > 0
        ? metrics.phase_publish_rates.filter(pr => !pr.phase.toLowerCase().includes('lobby')).reduce((sum, pr) => sum + pr.eventsPerSec, 0) / Math.max(1, metrics.phase_publish_rates.filter(pr => !pr.phase.toLowerCase().includes('lobby')).length)
        : 0,
      lobby_events_per_sec: 0,
      phase_rates: metrics.phase_publish_rates,
    },
    // §4.18: Scheduler lag metrics (separate from surge health)
    scheduler_lag_metrics: {
      p95_ms: metrics.scheduler_lag_p95,
      max_ms: metrics.scheduler_lag_max,
    },
    // §4.18: Connection establishment rate metrics
    connection_establishment_rate_metrics: {
      attempt_rate_peak: metrics.attempt_rate_peak,
      establishment_rate_peak: metrics.establishment_rate_peak,
    },
    // §4.18: Disconnect attribution (separate section for machine-readable)
    disconnect_attribution: {
      deliberate_disconnects: metrics.deliberate_disconnects ?? 0,
      unexpected_client_disconnects: metrics.unexpected_client_disconnects ?? 0,
      server_initiated_disconnects: metrics.server_initiated_disconnects ?? 0,
      network_failures: metrics.network_failures ?? 0,
      shutdown_cleanup_disconnects: metrics.shutdown_cleanup_disconnects ?? 0,
    },
    // §4.18: Late-join metrics (separate structured section)
    late_join_metrics: {
      p50_ms: metrics.late_join_p50_ms,
      p95_ms: metrics.late_join_p95_ms,
      p99_ms: metrics.late_join_p99_ms,
      max_ms: metrics.late_join_max_ms,
      history_expected: metrics.late_join_history_expected,
      history_received: metrics.late_join_history_received,
      history_missing: (metrics.late_join_history_expected ?? 0) - (metrics.late_join_history_received ?? 0),
    },
    viewer_concentration: {
      lobby_subscribers: metrics.lobby_subscribers,
      match_001_subscribers: metrics.match_001_subscribers,
      total_active_subscribers: (metrics.lobby_subscribers || 0) + (metrics.match_001_subscribers || 0),
    },
    validity: {
      timing_valid: metrics.timing_valid,
      generator_healthy: metrics.generator_cpu_percent_peak < 90 && metrics.generator_event_loop_p99_ms < 100,
      // §4.18: Structured validity reasons from failed inconclusive checks
      reasons: verdictResult.checks
        .filter((c) => c.name.startsWith("inconclusive_override") && !c.passed)
        .map((c) => c.detail),
    },
    // §4.18: Measurement validity — conditions that could invalidate measurement
    measurement_validity: {
      timing_valid: metrics.timing_valid,
      generator_healthy: metrics.generator_cpu_percent_peak < 90 && metrics.generator_event_loop_p99_ms < 100,
      topology_capacity_sufficient: metrics.topology_capacity_sufficient,
      no_schema_errors: (metrics.schema_validation_errors + metrics.missing_transport_id) === 0,
      no_parse_errors: (metrics.sse_parse_errors + metrics.json_parse_errors) === 0,
    },
    // §4.25: Histogram sample populations and overflow
    histogram_populations: {
      fan_out: {
        sample_count: metrics.fan_out_sample_count,
        overflow_count: metrics.fan_out_overflow_count,
      },
      late_join: {
        sample_count: metrics.late_join_sample_count,
        overflow_count: metrics.late_join_overflow_count,
      },
    },
    // §4.25: Per-phase latency histograms — each phase has isolated fan-out and late-join percentiles
    phase_latency_histograms: metrics.phase_histograms,
    // §4.15/§4.18: Clock validity — same-host containers share Linux kernel clock
    // Not RTT-based. All containers on the same Docker host share monotonic and wall clocks.
    clock_validity: {
      method: "same-host-kernel-clock",
      note: "Same-host containers share the Linux kernel clock. No RTT-based offset estimation needed. Verified by checking both Nchan nodes are reachable.",
      max_skew_estimate_ms: 0,
      nchan1_reachable: null,
      nchan2_reachable: null,
    },
    // §4.18: Claim provenance — distinguish POC measurement from production inference
    claim_provenance: {
      measured_at_scale: config.targetConnections,
      direct_accept_eligible: config.targetConnections >= 100000,
      production_inference_only: config.targetConnections < 100000,
      note: config.targetConnections >= 100000
        ? "Direct local measurement at 100k target"
        : "Lower-scale result — production inference only, not direct 100k proof",
    },
    // §4.18: Frozen viewer model
    viewer_model: {
      viewer_count: config.targetConnections,
      sse_connection_count: config.targetConnections,
      connections_per_viewer: 1,
      note: "1 SSE connection per viewer (anonymous read-only)",
    },
    classification: {
      verdict: verdictResult.verdict,
      checks: verdictResult.checks,
    },
    // §4.22: Build identity — exact upstream versions and commit
    build_identity: metrics.build_identity,
  }

  // Emit as a single JSON line on stdout for machine parsing
  console.log(JSON.stringify(result))
}
