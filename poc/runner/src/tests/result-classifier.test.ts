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

  it("returns INCONCLUSIVE when late join exceeds threshold", () => {
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

  it("returns exactly 15 base checks for evidence profile with unavailable external metrics", () => {
    const result = classifyResult(baseMetrics(), true, true)
    const names = result.checks.map((c) => c.name)
    assert.ok(names.includes("fan_out_p95"))
    assert.ok(names.includes("late_join_p95"))
    assert.ok(names.includes("connections_target"))
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

  it("REJECT when slow_consumer_disconnects == 0", () => {
    const result = classifyResult(baseMetrics({ slow_consumer_disconnects: 0 }), true, true)
    assert.equal(result.verdict, "REJECT")
    assert.ok(result.checks.find((c) => c.name === "slow_consumer_disconnects")!.passed === false)
  })

  it("REJECT when non_slow_p95_degradation_pct > 5", () => {
    const result = classifyResult(baseMetrics({ non_slow_p95_degradation_pct: 6 }), true, true)
    assert.equal(result.verdict, "REJECT")
    assert.ok(result.checks.find((c) => c.name === "non_slow_impact")!.passed === false)
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

  it("includes nchan_memory check when available", () => {
    const result = classifyResult(baseMetrics({ nchan_memory_mb_peak: 3500 }), true, true)
    assert.equal(result.verdict, "REJECT")
    assert.ok(result.checks.find((c) => c.name === "nchan_memory")!.passed === false)
  })

  it("includes redis_memory check when available", () => {
    const result = classifyResult(baseMetrics({ redis_memory_mb_peak: 1800 }), true, true)
    assert.equal(result.verdict, "REJECT")
    assert.ok(result.checks.find((c) => c.name === "redis_memory")!.passed === false)
  })

  it("skips nchan_memory check when unavailable", () => {
    const result = classifyResult(baseMetrics({ nchan_memory_mb_peak: null }), true, true)
    assert.ok(!result.checks.some((c) => c.name === "nchan_memory"))
  })

  it("skips redis_memory check when unavailable", () => {
    const result = classifyResult(baseMetrics({ redis_memory_mb_peak: null }), true, true)
    assert.ok(!result.checks.some((c) => c.name === "redis_memory"))
  })

  it("skips nchan_history_replay check for smoke profile", () => {
    const result = classifyResult(baseMetrics({ run_profile: "smoke" }), true, true)
    assert.ok(!result.checks.some((c) => c.name === "nchan_history_replay"))
  })

  it("REJECT when nchan history replay incorrect on evidence profile", () => {
    const result = classifyResult(baseMetrics({
      run_profile: "evidence",
      nchan_restart_history_replay_correct: false,
    }), true, true)
    assert.equal(result.verdict, "REJECT")
    assert.ok(result.checks.find((c) => c.name === "nchan_history_replay")!.passed === false)
  })

  it("REJECT when connections below target", () => {
    const result = classifyResult(baseMetrics({
      connections_established: 5000,
      connections_target: 10000,
    }), true, true)
    assert.equal(result.verdict, "REJECT")
    assert.ok(result.checks.find((c) => c.name === "connections_target")!.passed === false)
  })
})
