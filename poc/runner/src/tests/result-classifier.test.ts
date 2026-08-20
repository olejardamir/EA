import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { classifyResult } from "../application/result-classifier.js"
import type { AggregatedMetrics } from "../domain/result.js"

function baseMetrics(overrides: Partial<AggregatedMetrics> = {}): AggregatedMetrics {
  return {
    connections_attempted: 10000,
    connections_established: 10000,
    connection_failures: 0,
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
    ...overrides,
  }
}

describe("classifyResult", () => {
  it("returns ACCEPT when all checks pass", () => {
    const result = classifyResult(baseMetrics(), true)
    assert.equal(result.verdict, "ACCEPT")
    assert.ok(result.checks.every((c) => c.passed))
  })

  it("returns REJECT when fan-out p95 exceeds threshold", () => {
    const result = classifyResult(baseMetrics({ fan_out_latency_p95_ms: 600 }), true)
    assert.equal(result.verdict, "REJECT")
    const fanOutCheck = result.checks.find((c) => c.name === "fan_out_p95")
    assert.ok(fanOutCheck && !fanOutCheck.passed)
  })

  it("returns REJECT when missing sequences > 0", () => {
    const result = classifyResult(baseMetrics({ missing_sequences: 5 }), true)
    assert.equal(result.verdict, "REJECT")
  })

  it("returns REJECT when duplicates > 0", () => {
    const result = classifyResult(baseMetrics({ duplicates: 1 }), true)
    assert.equal(result.verdict, "REJECT")
  })

  it("returns REJECT when out_of_order > 0", () => {
    const result = classifyResult(baseMetrics({ out_of_order: 1 }), true)
    assert.equal(result.verdict, "REJECT")
  })

  it("returns REJECT when reconnect_gaps > 0", () => {
    const result = classifyResult(baseMetrics({ reconnect_gaps: 1 }), true)
    assert.equal(result.verdict, "REJECT")
  })

  it("returns INCONCLUSIVE when generator is saturated", () => {
    const result = classifyResult(baseMetrics(), false)
    assert.equal(result.verdict, "INCONCLUSIVE")
  })

  it("returns REJECT when late join exceeds threshold", () => {
    const result = classifyResult(baseMetrics({ late_join_p95_ms: 3000 }), true)
    assert.equal(result.verdict, "REJECT")
    const ljCheck = result.checks.find((c) => c.name === "late_join_p95")
    assert.ok(ljCheck && !ljCheck.passed)
  })
})
