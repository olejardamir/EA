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
    nchan_memory_mb_peak: 200,
    redis_memory_mb_peak: 100,
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
    active_connections_peak: 10000,
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
    schema_validation_errors: 0,
    missing_transport_id: 0,
    fan_out_sample_count: 0,
    fan_out_overflow_count: 0,
    late_join_sample_count: 0,
    late_join_overflow_count: 0,
    latency_invalid_count: 0,
    latency_overflow_count: 0,
    topology_capacity_sufficient: true,
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
    surge_scheduler_lag_p95: 0,
    surge_scheduler_lag_max: 0,
    active_population_start: 0,
    active_population_end: 0,
    active_population_peak: 0,
    build_identity: { git_commit_sha: null, nginx_version: "1.27.4", nchan_version: "1.3.8", node_version: "", redis_version: "7.2" },
    phase_histograms: {},
    match_events_published: 0,
    lobby_events_published: 0,
    match_events_per_sec: 0,
    lobby_events_per_sec: 0,
    total_events_per_sec: 0,
    // §3.7: Attempted counts
    match_events_attempted: 0,
    lobby_events_attempted: 0,
    clock_validity: { clock_model: "unknown", nodes_covered: [], measurement_method: "unknown", offset_or_guarantee: -1, uncertainty_ms: -1, threshold_ms: -1, validity_result: "INCONCLUSIVE" as const, nchan1_reachable: false, nchan2_reachable: false },
    reconnect_active_start: 0,
    reconnect_active_peak: 0,
    reconnect_active_end: 0,
    ...overrides,
  }
}

describe("classifyResult", () => {
  it("returns ACCEPT when all checks pass", () => {
    const result = classifyResult(baseMetrics(), true, true)
    assert.equal(result.verdict, "ACCEPT")
    assert.ok(result.checks.every((c) => c.passed))
  })

  it("returns REJECT when fan-out p95 exceeds threshold", () => {
    const result = classifyResult(baseMetrics({ fan_out_latency_p95_ms: 600 }), true, true)
    assert.equal(result.verdict, "REJECT")
    const fanOutCheck = result.checks.find((c) => c.name === "fan_out_p95")
    assert.ok(fanOutCheck && !fanOutCheck.passed)
  })

  it("returns REJECT when missing sequences > 0", () => {
    const result = classifyResult(baseMetrics({ missing_sequences: 5 }), true, true)
    assert.equal(result.verdict, "REJECT")
  })

  it("returns REJECT when duplicates > 0", () => {
    const result = classifyResult(baseMetrics({ duplicates: 1 }), true, true)
    assert.equal(result.verdict, "REJECT")
  })

  it("returns REJECT when out_of_order > 0", () => {
    const result = classifyResult(baseMetrics({ out_of_order: 1 }), true, true)
    assert.equal(result.verdict, "REJECT")
  })

  it("returns REJECT when reconnect_gaps > 0", () => {
    const result = classifyResult(baseMetrics({ reconnect_gaps: 1 }), true, true)
    assert.equal(result.verdict, "REJECT")
  })

  it("returns INCONCLUSIVE when generator is saturated", () => {
    const result = classifyResult(baseMetrics(), false, true)
    assert.equal(result.verdict, "INCONCLUSIVE")
  })

  it("returns REJECT when late join exceeds threshold", () => {
    const result = classifyResult(baseMetrics({ late_join_p95_ms: 3000 }), true, true)
    assert.equal(result.verdict, "REJECT")
    const ljCheck = result.checks.find((c) => c.name === "late_join_p95")
    assert.ok(ljCheck && !ljCheck.passed)
  })

  it("INCONCLUSIVE overrides REJECT when generator saturates", () => {
    const result = classifyResult(baseMetrics({ missing_sequences: 10, duplicates: 5 }), false, true)
    assert.equal(result.verdict, "INCONCLUSIVE")
  })

  it("exercises every frozen rule: fan_out_p95", () => {
    const result = classifyResult(baseMetrics({ fan_out_latency_p95_ms: 501 }), true, true)
    assert.equal(result.verdict, "REJECT")
    assert.ok(result.checks.find((c) => c.name === "fan_out_p95")!.passed === false)
  })

  it("exercises every frozen rule: late_join_p95", () => {
    const result = classifyResult(baseMetrics({ late_join_p95_ms: 2001 }), true, true)
    assert.equal(result.verdict, "REJECT")
    assert.ok(result.checks.find((c) => c.name === "late_join_p95")!.passed === false)
  })

  it("exercises every frozen rule: missing_sequences", () => {
    const result = classifyResult(baseMetrics({ missing_sequences: 1 }), true, true)
    assert.equal(result.verdict, "REJECT")
    assert.ok(result.checks.find((c) => c.name === "missing_sequences")!.passed === false)
  })

  it("exercises every frozen rule: duplicates", () => {
    const result = classifyResult(baseMetrics({ duplicates: 1 }), true, true)
    assert.equal(result.verdict, "REJECT")
    assert.ok(result.checks.find((c) => c.name === "duplicates")!.passed === false)
  })

  it("exercises every frozen rule: out_of_order", () => {
    const result = classifyResult(baseMetrics({ out_of_order: 1 }), true, true)
    assert.equal(result.verdict, "REJECT")
    assert.ok(result.checks.find((c) => c.name === "out_of_order")!.passed === false)
  })

  it("exercises every frozen rule: reconnect_gaps", () => {
    const result = classifyResult(baseMetrics({ reconnect_gaps: 1 }), true, true)
    assert.equal(result.verdict, "REJECT")
    assert.ok(result.checks.find((c) => c.name === "reconnect_gaps")!.passed === false)
  })

  it("includes expected checks for evidence profile with all metrics available", () => {
    const result = classifyResult(baseMetrics(), true, true)
    const names = result.checks.map((c) => c.name)
    assert.ok(names.includes("fan_out_p95"))
    assert.ok(names.includes("late_join_p95"))
    assert.ok(names.includes("active_concurrency_target"))
    assert.ok(names.includes("missing_sequences"))
    assert.ok(names.includes("duplicates"))
    assert.ok(names.includes("out_of_order"))
    assert.ok(names.includes("burst_fan_out_p95"))
    assert.ok(names.includes("reconnect_gaps"))
    assert.ok(names.includes("reconnect_duplicates"))
    assert.ok(names.includes("reconnect_order_violations"))
    assert.ok(names.includes("nchan_history_replay"))
    assert.ok(names.includes("slow_consumer_disconnects"))
    assert.ok(names.includes("non_slow_impact"))
    assert.ok(names.includes("timing_valid"))
    assert.ok(names.includes("generator_not_saturated"))
    assert.ok(names.includes("nchan_memory"))
    assert.ok(names.includes("redis_memory"))
  })

  it("smoke-profile result cannot be labeled final ACCEPT", () => {
    const smokeMetrics = baseMetrics({
      connections_attempted: 10,
      connections_established: 10,
      events_received: 500,
      slow_consumer_disconnects: 0,
    })
    const result = classifyResult(smokeMetrics, false, true)
    assert.notEqual(result.verdict, "ACCEPT")
  })

  it("expected delivery accounting: events_received >= connections_established", () => {
    const m = baseMetrics({ connections_established: 10000, events_received: 5000000 })
    assert.ok(m.events_received >= m.connections_established)
    const result = classifyResult(m, true, true)
    assert.equal(result.verdict, "ACCEPT")
  })

  it("all checks pass at exact boundary values", () => {
    const result = classifyResult(baseMetrics({
      fan_out_latency_p95_ms: 500,
      late_join_p95_ms: 2000,
    }), true, true)
    assert.equal(result.verdict, "ACCEPT")
    assert.ok(result.checks.every((c) => c.passed))
  })

  it("REJECT when burst fan-out p95 exceeds threshold", () => {
    const result = classifyResult(baseMetrics({ burst_fan_out_p95_ms: 1001 }), true, true)
    assert.equal(result.verdict, "REJECT")
    assert.ok(result.checks.find((c) => c.name === "burst_fan_out_p95")!.passed === false)
  })

  it("REJECT when reconnect_duplicates > 0", () => {
    const result = classifyResult(baseMetrics({ reconnect_duplicates: 1 }), true, true)
    assert.equal(result.verdict, "REJECT")
    assert.ok(result.checks.find((c) => c.name === "reconnect_duplicates")!.passed === false)
  })

  it("REJECT when reconnect_order_violations > 0", () => {
    const result = classifyResult(baseMetrics({ reconnect_order_violations: 1 }), true, true)
    assert.equal(result.verdict, "REJECT")
    assert.ok(result.checks.find((c) => c.name === "reconnect_order_violations")!.passed === false)
  })

  it("ACCEPT when slow_consumer_disconnects == 0 (bounded healthy degradation per §4.8)", () => {
    const result = classifyResult(baseMetrics({ slow_consumer_disconnects: 0 }), true, true)
    assert.equal(result.verdict, "ACCEPT")
  })

  it("REJECT when non_slow_p95_degradation_pct > 5", () => {
    const result = classifyResult(baseMetrics({ non_slow_p95_degradation_pct: 6 }), true, true)
    assert.equal(result.verdict, "REJECT")
    assert.ok(result.checks.find((c) => c.name === "non_slow_impact")!.passed === false)
  })

  it("§4.8 INCONCLUSIVE when SlowConsumerMetrics present but backpressure not reached", () => {
    const result = classifyResult(baseMetrics({
      slow_consumer_metrics: {
        slow_clients: 5,
        healthy_clients: 95,
        slow_offered_event_count: 500,
        slow_application_read_count: 250,
        slow_backlog_growth: 250,
        backpressure_duration_ms: 0,
        evidence_server_side_backpressure_reached: false,
        healthy_p95_before_ms: 80,
        healthy_p95_during_slow_ms: 82,
        healthy_degradation_pct: 2.5,
        slow_disconnects: 0,
        healthy_before_sample_count: 0,
        healthy_during_sample_count: 0,
        nchan_memory_baseline_bytes: null,
        nchan_memory_during_bytes: null,
        nchan_memory_end_bytes: null,
        nchan_memory_recovery_bytes: null,
        nchan_memory_samples_during: [],
        per_client_event_timestamps_ms: [],
        slow_achieved_read_rate_events_per_sec: 0,
        per_client_median_event_interval_ms: [],
        slow_median_event_interval_ms: 0,
        slow_p95_event_interval_ms: 0,
        nchan_memory_bounded: true,
        nchan_memory_growth_bytes: null,
        nchan_memory_growth_pct: null,
      },
    }), true, true)
    assert.equal(result.verdict, "INCONCLUSIVE")
    assert.ok(result.checks.find((c) => c.name === "inconclusive_override")!.detail.includes("backpressure"))
  })

  it("§3.10 Campaign-only restart skip does not invalidate per-run classifier", () => {
    const result = classifyResult(baseMetrics({
      run_profile: "evidence",
      nchan_restart_skipped: true,
      nchan_restart_history_replay_correct: false,
    }), true, true)
    // §3.10: Intentional campaign-level skip is NOT INCONCLUSIVE
    // It should pass per-run classifier and be handled by campaign classifier separately
    assert.notEqual(result.verdict, "INCONCLUSIVE")
    const restartCheck = result.checks.find((c) => c.name === "nchan_restart_campaign_only")
    assert.ok(restartCheck, "should have nchan_restart_campaign_only check")
    assert.ok(restartCheck!.passed)
    assert.ok(restartCheck!.detail.includes("not_scheduled_by_frozen_matrix"))
  })

  it("returns INCONCLUSIVE when timing_valid is false", () => {
    const result = classifyResult(baseMetrics(), true, false)
    assert.equal(result.verdict, "INCONCLUSIVE")
    assert.ok(result.checks.find((c) => c.name === "timing_valid")!.passed === false)
  })

  it("INCONCLUSIVE overrides REJECT when timing invalid and generator saturated", () => {
    const result = classifyResult(baseMetrics({ missing_sequences: 1 }), false, false)
    assert.equal(result.verdict, "INCONCLUSIVE")
  })

  it("REJECT when nchan_memory exceeds threshold", () => {
    const result = classifyResult(baseMetrics({ nchan_memory_mb_peak: 7000 }), true, true)
    assert.equal(result.verdict, "REJECT")
    assert.ok(result.checks.find((c) => c.name === "nchan_memory")!.passed === false)
  })

  it("REJECT when redis_memory exceeds threshold", () => {
    const result = classifyResult(baseMetrics({ redis_memory_mb_peak: 1800 }), true, true)
    assert.equal(result.verdict, "REJECT")
    assert.ok(result.checks.find((c) => c.name === "redis_memory")!.passed === false)
  })

  it("§4.11 INCONCLUSIVE when nchan_memory unavailable in evidence mode", () => {
    const result = classifyResult(baseMetrics({ nchan_memory_mb_peak: null }), true, true)
    assert.equal(result.verdict, "INCONCLUSIVE")
    assert.ok(result.checks.find((c) => c.name === "inconclusive_override")!.detail.includes("nchan_memory"))
  })

  it("§4.11 INCONCLUSIVE when redis_memory unavailable in evidence mode", () => {
    const result = classifyResult(baseMetrics({ redis_memory_mb_peak: null }), true, true)
    assert.equal(result.verdict, "INCONCLUSIVE")
    assert.ok(result.checks.find((c) => c.name === "inconclusive_override")!.detail.includes("redis_memory"))
  })

  it("skips nchan_memory/redis_memory checks for smoke profile", () => {
    const result = classifyResult(baseMetrics({ run_profile: "smoke" }), true, true)
    assert.ok(!result.checks.some((c) => c.name === "nchan_memory"))
    assert.ok(!result.checks.some((c) => c.name === "redis_memory"))
  })

  it("REJECT when nchan history replay incorrect on evidence profile", () => {
    const result = classifyResult(baseMetrics({
      run_profile: "evidence",
      nchan_restart_history_replay_correct: false,
    }), true, true)
    assert.equal(result.verdict, "REJECT")
    assert.ok(result.checks.find((c) => c.name === "nchan_history_replay")!.passed === false)
  })

  it("REJECT when active_connections_peak below target", () => {
    const result = classifyResult(baseMetrics({
      active_connections_peak: 5000,
      connections_target: 10000,
    }), true, true)
    assert.equal(result.verdict, "REJECT")
    assert.ok(result.checks.find((c) => c.name === "active_concurrency_target")!.passed === false)
  })

  it("§4.3 uses active_connections_peak not connections_established", () => {
    const result = classifyResult(baseMetrics({
      connections_established: 20000,
      active_connections_peak: 5000,
      connections_target: 10000,
    }), true, true)
    assert.equal(result.verdict, "REJECT")
    const check = result.checks.find((c) => c.name === "active_concurrency_target")!
    assert.ok(!check.passed)
    assert.ok(check.detail.includes("active_peak=5000"))
  })

  it("§4.11 INCONCLUSIVE when generator event-loop p99 >= 100ms", () => {
    const result = classifyResult(baseMetrics({ generator_event_loop_p99_ms: 100 }), true, true)
    assert.equal(result.verdict, "INCONCLUSIVE")
    assert.ok(result.checks.find((c) => c.name === "inconclusive_override")!.detail.includes("event-loop"))
  })

  it("§4.11 INCONCLUSIVE when generator backlog > 1000", () => {
    const result = classifyResult(baseMetrics({ generator_backlog_peak: 1500 }), true, true)
    assert.equal(result.verdict, "INCONCLUSIVE")
    assert.ok(result.checks.find((c) => c.name === "inconclusive_override")!.detail.includes("backlog"))
  })

  it("§4.11 INCONCLUSIVE when publisher definite failures > 0", () => {
    const result = classifyResult(baseMetrics({ publisher_definite_failures: 1 }), true, true)
    assert.equal(result.verdict, "INCONCLUSIVE")
    assert.ok(result.checks.find((c) => c.name === "inconclusive_override")!.detail.includes("publisher"))
  })
})
