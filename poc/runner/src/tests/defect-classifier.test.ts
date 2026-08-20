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
    non_slow_p95_degradation_pct: 1,
    nchan_memory_mb_peak: null,
    redis_memory_mb_peak: null,
    timing_valid: true,
    generator_cpu_percent_peak: 75,
    generator_event_loop_p99_ms: 10,
    run_profile: "evidence" as const,
    lobby_subscribers: 200,
    phase_publish_rates: [],
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

  it("accepts without hidden 10k default for connections_target", () => {
    const result = classifyResult(baseMetrics({
      connections_established: 100,
      connections_target: 100,
    }), true, true)
    const connCheck = result.checks.find((c) => c.name === "connections_target")
    assert.ok(connCheck!.passed)
  })

  it("rejects when connections below custom target", () => {
    const result = classifyResult(baseMetrics({
      connections_established: 50,
      connections_target: 100,
    }), true, true)
    assert.equal(result.verdict, "REJECT")
    assert.ok(result.checks.find((c) => c.name === "connections_target")!.passed === false)
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
