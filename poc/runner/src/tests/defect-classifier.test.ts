import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { classifyResult } from "../application/result-classifier.js"
import type { AggregatedMetrics } from "../domain/result.js"

function baseMetrics(overrides: Partial<AggregatedMetrics> = {}): AggregatedMetrics {
  return {
    connections_attempted: 10000,
    connections_established: 10000,
    connection_failures: 0,
    connections_dropped: 0,
    events_published: 500,
    events_received: 5000000,
    missing_sequences: 0,
    duplicates: 0,
    out_of_order: 0,
    fan_out_latency_p50_ms: 30,
    fan_out_latency_p95_ms: 80,
    fan_out_latency_p99_ms: 120,
    fan_out_latency_max_ms: 200,
    late_join_p50_ms: 5,
    late_join_p95_ms: 10,
    late_join_p99_ms: 15,
    late_join_max_ms: 20,
    reconnect_gaps: 0,
    reconnect_duplicates: 0,
    reconnect_order_violations: 0,
    slow_consumer_disconnects: 50,
    event_loop_delay_p99_ms: 35,
    memory_mb_peak: 400,
    expected_fan_deliveries: 5000000,
    received_fan_deliveries: 5000000,
    connections_target: 10000,
    burst_fan_out_p95_ms: 200,
    nchan_restart_history_replay_correct: true,
    nchan_restart_missing_sequences: 0,
    nchan_restart_skipped: false,
    non_slow_p95_degradation_pct: 1,
    nchan_memory_mb_peak: 100,
    redis_memory_mb_peak: 50,
    nchan_cpu_usage_usec: null, nchan_cpu_throttled_count: null, nchan_cpu_throttled_usec: null,
    nchan_memory_current_bytes: null, nchan_memory_peak_bytes: null,
    nchan_memory_oom_events: null, nchan_memory_oom_kill_events: null,
    redis_connected_clients_peak: null,
    nchan_cpu_percent_peak: null,
    redis_cpu_percent_peak: null,
    resource_cpu_percent_peak: null,
    resource_cpu_baseline: null,
    nchan_resource_cpu_percent_peak: null,
    redis_resource_cpu_percent_peak: null,
    timing_valid: true,
    generator_cpu_percent_peak: 75,
    generator_event_loop_p99_ms: 10,
    run_profile: "evidence" as const,
    lobby_subscribers: 200,
    match_001_subscribers: 800,
    match_002_subscribers: 0,
    match_003_subscribers: 0,
    match_004_subscribers: 0,
    match_005_subscribers: 0,
    match_006_subscribers: 0,
    match_007_subscribers: 0,
    match_008_subscribers: 0,
    phase_publish_rates: [],
    match_events_published: 0,
    lobby_events_published: 0,
    match_events_per_sec: 0,
    lobby_events_per_sec: 0,
    total_events_per_sec: 0,
    cpu_throttled_count: 0,
    cpu_throttled_usec: 0,
    cpu_usage_usec: 0,
    memory_oom_events: 0,
    memory_oom_kill_events: 0,
    memory_current_bytes: null,
    memory_peak_bytes: null,
    cpu_max_quota: null,
    memory_max_bytes: null,
    generator_backlog_peak: 0,
    publisher_attempts: 100,
    publisher_successes: 100,
    publisher_definite_failures: 0,
    publisher_ambiguous_failures: 0,
    sse_parse_errors: 0,
    json_parse_errors: 0,
    invalid_timestamp_count: 0,
    surge_fan_out_p95_ms: 0,
    surge_missing_sequences: 0,
    surge_duplicates: 0,
    surge_out_of_order: 0,
    surge_events_received: 0,
    active_connections_peak: 0,
    live_expected_deliveries: 0,
    live_received_deliveries: 0,
    late_join_history_expected: 0,
    late_join_history_received: 0,
    reconnect_replay_expected: 0,
    reconnect_replay_received: 0,
    restart_replay_expected: 0,
    restart_replay_received: 0,
    slow_consumer_metrics: null,
    deliberate_disconnects: 0,
    unexpected_client_disconnects: 0,
    server_initiated_disconnects: 0,
    network_failures: 0,
    shutdown_cleanup_disconnects: 0,
    surge_target_additions: 0,
    surge_attempted: 0,
    surge_established: 0,
    surge_failures: 0,
    surge_start_time: 0,
    surge_end_time: 0,
    surge_elapsed_ms: 0,
    surge_timing_error_ms: 0,
    attempt_rate_peak: 0,
    establishment_rate_peak: 0,
    scheduler_lag_p95: 0,
    scheduler_lag_max: 0,
    active_population_start: 0,
    active_population_end: 0,
    active_population_peak: 0,
    build_identity: { git_commit_sha: null, nginx_version: "1.27.4", nchan_version: "1.3.8", node_version: "", redis_version: "7.2" },
    schema_validation_errors: 0,
    missing_transport_id: 0,
    fan_out_sample_count: 0,
    fan_out_overflow_count: 0,
    late_join_sample_count: 0,
    late_join_overflow_count: 0,
    latency_invalid_count: 0,
    latency_overflow_count: 0,
    topology_capacity_sufficient: true,
    phase_histograms: {},
    clock_validity: { clock_model: "unknown", nodes_covered: [], measurement_method: "unknown", offset_or_guarantee: -1, uncertainty_ms: -1, threshold_ms: -1, validity_result: "INCONCLUSIVE" as const, nchan1_reachable: false, nchan2_reachable: false },
    ...overrides,
  }
}

describe("Classifier defect fixes", () => {
  it("smoke profile returns NOT_APPLICABLE regardless of metrics", () => {
    const result = classifyResult(baseMetrics({ run_profile: "smoke" }), true, true)
    assert.equal(result.verdict, "NOT_APPLICABLE")
    assert.ok(result.checks.some((c) => c.name === "smoke_gate"))
  })

  it("smoke profile returns NOT_APPLICABLE even with bad metrics", () => {
    const result = classifyResult(baseMetrics({
      run_profile: "smoke",
      missing_sequences: 100,
      fan_out_latency_p95_ms: 5000,
    }), true, true)
    assert.equal(result.verdict, "NOT_APPLICABLE")
  })

  it("timing_invalid returns INCONCLUSIVE before any measurement checks", () => {
    const result = classifyResult(baseMetrics({ missing_sequences: 100 }), true, false)
    assert.equal(result.verdict, "INCONCLUSIVE")
    assert.ok(result.checks.find((c) => c.name === "timing_valid")!.passed === false)
    assert.ok(!result.checks.some((c) => c.name === "missing_sequences"))
  })

  it("generator_saturated returns INCONCLUSIVE before any measurement checks", () => {
    const result = classifyResult(baseMetrics({ duplicates: 50 }), false, true)
    assert.equal(result.verdict, "INCONCLUSIVE")
    assert.ok(result.checks.find((c) => c.name === "generator_not_saturated")!.passed === false)
    assert.ok(!result.checks.some((c) => c.name === "duplicates"))
  })

  it("both timing_invalid + generator_saturated returns INCONCLUSIVE", () => {
    const result = classifyResult(baseMetrics(), false, false)
    assert.equal(result.verdict, "INCONCLUSIVE")
  })

  it("accepts when active connections meet target", () => {
    const result = classifyResult(baseMetrics({
      active_connections_peak: 100,
      connections_target: 100,
    }), true, true)
    const connCheck = result.checks.find((c) => c.name === "active_concurrency_target")
    assert.ok(connCheck!.passed)
  })

  it("rejects when active connections below target", () => {
    const result = classifyResult(baseMetrics({
      active_connections_peak: 50,
      connections_target: 100,
    }), true, true)
    assert.equal(result.verdict, "REJECT")
    assert.ok(result.checks.find((c) => c.name === "active_concurrency_target")!.passed === false)
  })

  it("nchan_history_replay always checked for evidence profile", () => {
    const result = classifyResult(baseMetrics({ run_profile: "evidence" }), true, true)
    assert.ok(result.checks.some((c) => c.name === "nchan_history_replay"))
  })

  it("does not include inconclusive_override when timing and generator are valid", () => {
    const result = classifyResult(baseMetrics(), true, true)
    assert.ok(!result.checks.some((c) => c.name === "inconclusive_override"))
  })

  it("includes inconclusive_override when timing invalid", () => {
    const result = classifyResult(baseMetrics(), true, false)
    assert.ok(result.checks.some((c) => c.name === "inconclusive_override"))
  })

  it("includes inconclusive_override when generator saturated", () => {
    const result = classifyResult(baseMetrics(), false, true)
    assert.ok(result.checks.some((c) => c.name === "inconclusive_override"))
  })
})
