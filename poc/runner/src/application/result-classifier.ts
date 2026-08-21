import type { AggregatedMetrics, Verdict, VerdictResult, SlowConsumerMetrics, PhaseHistogramResult } from "../domain/result.js"
import type { TopologyPreflight } from "../adapters/topology-preflight.js"
import type { PhaseSnapshot } from "../scenarios/scenario.js"

export function classifyResult(
  metrics: AggregatedMetrics,
  generatorHealthy: boolean,
  timingValid: boolean,
  topologyPreflight?: TopologyPreflight,
  campaignConnectionsTarget?: number,
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

  // §4.11: Additional INCONCLUSIVE conditions — experiment-invalid before architecture pass/fail

  // Generator event-loop saturation
  if (metrics.generator_event_loop_p99_ms >= 100) {
    checks.push({
      name: "inconclusive_override",
      passed: false,
      detail: `generator event-loop p99=${metrics.generator_event_loop_p99_ms}ms >= 100ms — generator saturated`,
    })
    return { verdict: "INCONCLUSIVE", checks }
  }

  // Generator backlog saturation
  if (metrics.generator_backlog_peak > 1000) {
    checks.push({
      name: "inconclusive_override",
      passed: false,
      detail: `generator backlog peak=${metrics.generator_backlog_peak} > 1000 — publisher scheduler saturated`,
    })
    return { verdict: "INCONCLUSIVE", checks }
  }

  // Publisher definite failures indicate scheduler/transport breakdown
  if (metrics.publisher_definite_failures > 0) {
    checks.push({
      name: "inconclusive_override",
      passed: false,
      detail: `publisher definite failures=${metrics.publisher_definite_failures} > 0 — publisher saturated`,
    })
    return { verdict: "INCONCLUSIVE", checks }
  }

  // §4.11: CPU throttling indicates host capacity exceeded
  if (metrics.cpu_throttled_count !== null && metrics.cpu_throttled_count > 0) {
    checks.push({
      name: "inconclusive_override",
      passed: false,
      detail: `cpu_throttled_count=${metrics.cpu_throttled_count} > 0 — host CPU throttled`,
    })
    return { verdict: "INCONCLUSIVE", checks }
  }

  // §4.11: OOM events indicate memory exhaustion
  if (metrics.memory_oom_events !== null && metrics.memory_oom_events > 0) {
    checks.push({
      name: "inconclusive_override",
      passed: false,
      detail: `memory_oom_events=${metrics.memory_oom_events} > 0 — generator memory exhausted`,
    })
    return { verdict: "INCONCLUSIVE", checks }
  }

  // §4.11: OOM kills are fatal
  if (metrics.memory_oom_kill_events !== null && metrics.memory_oom_kill_events > 0) {
    checks.push({
      name: "inconclusive_override",
      passed: false,
      detail: `memory_oom_kill_events=${metrics.memory_oom_kill_events} > 0 — generator killed by OOM`,
    })
    return { verdict: "INCONCLUSIVE", checks }
  }

  // v2.0.6: this is a DUT cgroup, not a generator cgroup. Once generator and
  // timing validity have passed, an OOM kill is direct frozen-capacity evidence.
  // Check it before downstream connection failures caused by the killed worker.
  if (metrics.nchan_memory_oom_kill_events !== null && metrics.nchan_memory_oom_kill_events > 0) {
    checks.push({
      name: "dut_memory_capacity_reject",
      passed: false,
      detail: `nchan_memory_oom_kill_events=${metrics.nchan_memory_oom_kill_events} > 0 — DUT exceeded its frozen memory capacity`,
    })
    return { verdict: "REJECT", checks }
  }

  // §4.11: High connection failure rate indicates environment/network bottleneck
  if (metrics.connections_attempted > 0) {
    const failureRate = metrics.connection_failures / metrics.connections_attempted
    if (failureRate > 0.05) {
      checks.push({
        name: "inconclusive_override",
        passed: false,
        detail: `connection_failure_rate=${(failureRate * 100).toFixed(1)}% > 5% — environment/network bottleneck`,
      })
      return { verdict: "INCONCLUSIVE", checks }
    }
  }

  // §3.6.D/§4.11: Surge failures during ramp — DUT capacity failure (REJECT), not environment bottleneck.
  // All generator/host/network INCONCLUSIVE checks precede this point; if we reach here with
  // surge_failures > 0, the generator is healthy and Nchan cannot accept/sustain the target.
  if (metrics.surge_failures > 0) {
    checks.push({
      name: "surge_capacity_reject",
      passed: false,
      detail: `surge_failures=${metrics.surge_failures} > 0 — healthy generator but DUT cannot sustain target`,
    })
    return { verdict: "REJECT", checks }
  }

  // §4.11: Topology/FD/port capacity — must be structurally capable of 100k attempt
  if (topologyPreflight && !topologyPreflight.capacity_sufficient) {
    checks.push({
      name: "inconclusive_override",
      passed: false,
      detail: `topology capacity insufficient — ${topologyPreflight.warnings.join("; ")}`,
    })
    return { verdict: "INCONCLUSIVE", checks }
  }

  // §4.11: Host FD exhaustion — runner soft limit must exceed target + overhead
  if (metrics.run_profile === "evidence") {
    const overheadFds = 100
    const requiredFds = metrics.connections_target + overheadFds
    // Check if we actually hit the FD ceiling during the run
    if (metrics.connection_failures > 0 && metrics.connections_attempted > 0) {
      const failureRate = metrics.connection_failures / metrics.connections_attempted
      if (failureRate > 0.10) {
        checks.push({
          name: "inconclusive_override",
          passed: false,
          detail: `connection_failure_rate=${(failureRate * 100).toFixed(1)}% > 10% — possible FD/port exhaustion`,
        })
        return { verdict: "INCONCLUSIVE", checks }
      }
    }

    // §3.9: Mandatory resource metric availability — do not silently accept missing CPU/throttle/OOM evidence
    // Only enforce at evidence scale (100k+) where resource evidence is structurally required
    // §3.8.E: Use campaign-level aggregate target for multi-shard 100k campaigns
    const effectiveTarget = campaignConnectionsTarget ?? metrics.connections_target
    if (effectiveTarget >= 100000) {
      if (metrics.nchan_cpu_percent_peak === null) {
        checks.push({
          name: "inconclusive_override",
          passed: false,
          detail: `nchan_cpu_percent_peak=null — Nchan CPU evidence unavailable`,
        })
        return { verdict: "INCONCLUSIVE", checks }
      }
      if (metrics.redis_cpu_percent_peak === null) {
        checks.push({
          name: "inconclusive_override",
          passed: false,
          detail: `redis_cpu_percent_peak=null — Redis CPU evidence unavailable`,
        })
        return { verdict: "INCONCLUSIVE", checks }
      }
      if (metrics.cpu_throttled_count === null) {
        checks.push({
          name: "inconclusive_override",
          passed: false,
          detail: `cpu_throttled_count=null — CPU throttle evidence unavailable`,
        })
        return { verdict: "INCONCLUSIVE", checks }
      }
    }
  }

  // §4.11: Nchan CPU throttling — host capacity exceeded for the DUT
  if (metrics.nchan_cpu_throttled_count !== null && metrics.nchan_cpu_throttled_count > 0) {
    checks.push({
      name: "inconclusive_override",
      passed: false,
      detail: `nchan_cpu_throttled_count=${metrics.nchan_cpu_throttled_count} > 0 — Nchan host CPU throttled`,
    })
    return { verdict: "INCONCLUSIVE", checks }
  }

  // §3.9: Negative latency / invalid timing — measurement failure
  if (metrics.latency_invalid_count > 0) {
    checks.push({
      name: "inconclusive_override",
      passed: false,
      detail: `latency_invalid_count=${metrics.latency_invalid_count} > 0 — negative/invalid latency detected`,
    })
    return { verdict: "INCONCLUSIVE", checks }
  }

  // §3.9: Latency overflow — measurements exceeded histogram bounds
  if (metrics.latency_overflow_count > 0) {
    checks.push({
      name: "inconclusive_override",
      passed: false,
      detail: `latency_overflow_count=${metrics.latency_overflow_count} > 0 — latency measurements overflow`,
    })
    return { verdict: "INCONCLUSIVE", checks }
  }

  // Required resource metrics must not be null in evidence mode
  if (metrics.run_profile === "evidence") {
    if (metrics.nchan_memory_mb_peak === null) {
      checks.push({
        name: "inconclusive_override",
        passed: false,
        detail: "nchan_memory_mb_peak unavailable — mandatory resource metric missing",
      })
      return { verdict: "INCONCLUSIVE", checks }
    }
    if (metrics.redis_memory_mb_peak === null) {
      checks.push({
        name: "inconclusive_override",
        passed: false,
        detail: "redis_memory_mb_peak unavailable — mandatory resource metric missing",
      })
      return { verdict: "INCONCLUSIVE", checks }
    }
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

  // §4.3: Use simultaneous active concurrency, not cumulative establishment
  checks.push({
    name: "active_concurrency_target",
    passed: metrics.active_connections_peak >= metrics.connections_target,
    detail: `active_peak=${metrics.active_connections_peak} >= target=${metrics.connections_target}`,
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

  // §v2.1.0: planned partition-failover correctness — deltas across the restart
  // drill window must be zero (subset of the global counters, gated explicitly).
  checks.push({
    name: "restart_failover_gaps",
    passed: metrics.restart_failover_gaps === 0,
    detail: `${metrics.restart_failover_gaps} == 0`,
  })

  checks.push({
    name: "restart_failover_duplicates",
    passed: metrics.restart_failover_duplicates === 0,
    detail: `${metrics.restart_failover_duplicates} == 0`,
  })

  checks.push({
    name: "restart_failover_order_violations",
    passed: metrics.restart_failover_order_violations === 0,
    detail: `${metrics.restart_failover_order_violations} == 0`,
  })

  // §3.10: Campaign-only restart scenario — excluded from per-run classifier when intentionally
  // not scheduled. The campaign classifier separately requires the once-per-campaign restart result
  // to PASS. Per-run classifier must not mark a deliberate campaign-level omission as INCONCLUSIVE.
  // distinction: "not_scheduled_by_frozen_matrix" (deliberate) vs "unexpectedly_skipped" (defect)
  if (metrics.nchan_restart_skipped) {
    checks.push({
      name: "nchan_restart_campaign_only",
      passed: true,
      detail: "not_scheduled_by_frozen_matrix — campaign-only scenario, excluded from per-run gate",
    })
  } else {
    checks.push({
      name: "nchan_history_replay",
      passed: metrics.nchan_restart_history_replay_correct,
      detail: metrics.nchan_restart_history_replay_correct ? "replay correct" : "replay mismatch",
    })
  }

  // §4.8: Slow consumer check — resolved contradiction:
  // The scenario must demonstrate bounded behavior (healthy clients not degraded).
  // Server-side backpressure evidence is informational, not a pass/fail gate.
  // Zero disconnects with bounded healthy-client behavior is ACCEPT.
  // If no server-side backpressure reached, it is INCONCLUSIVE (not REJECT).
  const slowMetrics = metrics.slow_consumer_metrics
  if (slowMetrics) {
    const boundedHealthyOk = slowMetrics.healthy_degradation_pct <= 5
    const evidenceBackpressure = slowMetrics.evidence_server_side_backpressure_reached
    checks.push({
      name: "slow_consumer_disconnects",
      passed: evidenceBackpressure,
      detail: `backpressure=${evidenceBackpressure ? "YES" : "NO"} (informational)`,
    })
    if (slowMetrics.independent_offered_measurement === false) {
      checks.push({ name: "inconclusive_override", passed: false, detail: "slow offered count is not independent of application consumption" })
      return { verdict: "INCONCLUSIVE", checks }
    }
    if (slowMetrics.pacing_valid === false) {
      checks.push({ name: "inconclusive_override", passed: false, detail: "slow-client 2-second pacing model was not achieved within frozen ±20% tolerance" })
      return { verdict: "INCONCLUSIVE", checks }
    }
    // §M3-HVR: replay_recovery_pct is TRUE Last-Event-ID replay coverage from
    // the detach/reattach probe. null means retention could not be measured
    // (no successful reattach or nothing was missed) — an explicit failed
    // check, not a silent pass.
    if (slowMetrics.replay_recovery_pct != null) {
      checks.push({
        name: "slow_replay_recovery",
        passed: slowMetrics.replay_recovery_pct >= 95,
        detail: `${slowMetrics.replay_recovery_pct.toFixed(1)}% >= 95%`,
      })
    } else {
      checks.push({
        name: "slow_replay_recovery",
        passed: false,
        detail: "Last-Event-ID replay coverage unmeasurable (no successful probe or nothing missed)",
      })
    }
    checks.push({
      name: "non_slow_impact",
      passed: boundedHealthyOk,
      detail: `healthy_degradation=${slowMetrics.healthy_degradation_pct.toFixed(1)}% <= 5%`,
    })
    // §3.8: If Nchan memory boundedness is unknown (null), INCONCLUSIVE
    if (slowMetrics.nchan_memory_bounded === null) {
      checks.push({
        name: "inconclusive_override",
        passed: false,
        detail: `§3.8: nchan_memory_bounded=null — Nchan memory data unavailable, cannot verify boundedness`,
      })
      return { verdict: "INCONCLUSIVE", checks }
    }
    // §4.8: If no server-side backpressure reached, override to INCONCLUSIVE
    if (!evidenceBackpressure) {
      checks.push({
        name: "inconclusive_override",
        passed: false,
        detail: `§4.8: no server-side backpressure reached — test absorbed by kernel buffers`,
      })
      return { verdict: "INCONCLUSIVE", checks }
    }
  } else {
    checks.push({
      name: "slow_consumer_disconnects",
      passed: true,
      detail: `slow_consumer_disconnects=${metrics.slow_consumer_disconnects} (no SlowConsumerMetrics — informational only)`,
    })
    checks.push({
      name: "non_slow_impact",
      passed: metrics.non_slow_p95_degradation_pct <= 5,
      detail: `${metrics.non_slow_p95_degradation_pct}% <= 5%`,
    })
  }

  // §4.11: Nchan memory — mandatory in evidence mode, skip in smoke.
  // §v2.1.0: envelope-aware — the frozen limit is the per-node container memory
  // (NCHAN_MEMORY_GB, default 8); gate at 87.5% of that envelope.
  if (metrics.nchan_memory_mb_peak !== null) {
    const nchanMemoryGb = Number.parseInt(process.env.NCHAN_MEMORY_GB ?? "8", 10) || 8
    const memoryLimitMb = nchanMemoryGb * 1024 * 0.875
    checks.push({
      name: "nchan_memory",
      passed: metrics.nchan_memory_mb_peak < memoryLimitMb,
      detail: `${metrics.nchan_memory_mb_peak}MB < ${memoryLimitMb}MB (87.5% of ${nchanMemoryGb} GB DUT limit)`,
    })
  }

  // §4.11: Redis memory — mandatory in evidence mode, skip in smoke
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

  // §4.19: Schema validation errors — frozen rule: no schema/type violations
  checks.push({
    name: "schema_validation_errors",
    passed: metrics.schema_validation_errors === 0,
    detail: `${metrics.schema_validation_errors} == 0`,
  })

  checks.push({
    name: "missing_transport_id",
    passed: metrics.missing_transport_id === 0,
    detail: `${metrics.missing_transport_id} == 0`,
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

  // §4.17: Disconnect attribution — unexpected/server-initiated/network failures must be zero
  checks.push({
    name: "unexpected_client_disconnects",
    passed: metrics.unexpected_client_disconnects === 0,
    detail: `${metrics.unexpected_client_disconnects} == 0`,
  })

  checks.push({
    name: "server_initiated_disconnects",
    passed: metrics.server_initiated_disconnects === 0,
    detail: `${metrics.server_initiated_disconnects} == 0`,
  })

  checks.push({
    name: "network_failures",
    passed: metrics.network_failures === 0,
    detail: `${metrics.network_failures} == 0`,
  })

  // §4.17: deliberate_disconnects and shutdown_cleanup_disconnects are informational only
  // (not gating — deliberate disconnects are expected during slow-consumer test)

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
  workerMetrics: Array<{
    snapshot(): import("../ports/metrics.js").MetricsSnapshot
    getFanOutHistogram?(): import("../adapters/streaming-histogram.js").StreamingHistogram
    getLateJoinHistogram?(): import("../adapters/streaming-histogram.js").StreamingHistogram
  }>,
  phaseSnapshots?: Array<PhaseSnapshot>,
  phaseHistograms?: Record<string, { fanOut: PhaseHistogramResult; lateJoin: PhaseHistogramResult }>,
): AggregatedMetrics {
  // §6.32: Use streaming histograms for final percentile computation when available.
  // Falls back to sorted-array computation when histograms are not provided (tests/mocks).
  function percentileFromSorted(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0
    const idx = Math.ceil((p / 100) * sorted.length) - 1
    return sorted[Math.max(0, idx)]
  }

  // §6.32: Merge streaming histograms from all workers for final percentile computation
  const mergedFanOut = workerMetrics[0]?.getFanOutHistogram?.()
  const mergedLateJoin = workerMetrics[0]?.getLateJoinHistogram?.()
  if (mergedFanOut && workerMetrics.length > 1) {
    for (let i = 1; i < workerMetrics.length; i++) {
      const h = workerMetrics[i].getFanOutHistogram?.()
      if (h) mergedFanOut.merge(h)
    }
  }
  if (mergedLateJoin && workerMetrics.length > 1) {
    for (let i = 1; i < workerMetrics.length; i++) {
      const h = workerMetrics[i].getLateJoinHistogram?.()
      if (h) mergedLateJoin.merge(h)
    }
  }

  // Fallback arrays for when histograms are unavailable (test mocks)
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
  // §4.19: Schema validation error accounting
  let schema_validation_errors = 0
  let missing_transport_id = 0
  // §4.16: Live vs replay delivery accounting
  let live_expected_deliveries = 0
  let live_received_deliveries = 0
  let late_join_history_expected = 0
  let late_join_history_received = 0
  let reconnect_replay_expected = 0
  let reconnect_replay_received = 0
  let restart_replay_expected = 0
  let restart_replay_received = 0
  // §3.9: Separated literal restart and cross-node replacement metrics
  let literal_restart_expected = 0
  let literal_restart_received = 0
  let cross_node_expected = 0
  let cross_node_received = 0
  // §4.17: Disconnect attribution
  let deliberate_disconnects = 0
  let unexpected_client_disconnects = 0
  let server_initiated_disconnects = 0
  let network_failures = 0
  let shutdown_cleanup_disconnects = 0
  let planned_restart_disconnects = 0
  // §3.7: Latency validity counters
  let latency_invalid_count = 0
  let latency_overflow_count = 0
  // §4.25: Population metadata must represent all samples, including
  // histogram overflow, rather than the bounded diagnostic arrays below.
  let fan_out_sample_count = 0
  let fan_out_overflow_count = 0
  let late_join_sample_count = 0
  let late_join_overflow_count = 0
  // §3.7: Accumulate global scheduler lag across all workers (max of p95/max)
  let scheduler_lag_p95_ms = 0
  let scheduler_lag_max_ms = 0
  // §3.7: Aggregate match/lobby attempted counts across phases
  let total_match_attempts = 0
  let total_lobby_attempts = 0

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
    // §4.19: Schema validation error accounting
    schema_validation_errors += s.schema_validation_errors
    missing_transport_id += s.missing_transport_id
    allFanOut.push(...s.fan_out_latencies_ms)
    allLateJoin.push(...s.late_join_latencies_ms)
    // §4.16: Live vs replay delivery accounting
    live_expected_deliveries += s.live_expected_deliveries
    live_received_deliveries += s.live_received_deliveries
    late_join_history_expected += s.late_join_history_expected
    late_join_history_received += s.late_join_history_received
    reconnect_replay_expected += s.reconnect_replay_expected
    reconnect_replay_received += s.reconnect_replay_received
    restart_replay_expected += s.restart_replay_expected
    restart_replay_received += s.restart_replay_received
    // §3.9: Separated literal restart and cross-node replacement metrics
    literal_restart_expected += s.literal_restart_expected
    literal_restart_received += s.literal_restart_received
    cross_node_expected += s.cross_node_expected
    cross_node_received += s.cross_node_received
    // §4.17: Disconnect attribution
    deliberate_disconnects += s.deliberate_disconnects
    unexpected_client_disconnects += s.unexpected_client_disconnects
    server_initiated_disconnects += s.server_initiated_disconnects
    network_failures += s.network_failures
    shutdown_cleanup_disconnects += s.shutdown_cleanup_disconnects
    planned_restart_disconnects += s.planned_restart_disconnects
    // §3.9: Latency validity counters
    latency_invalid_count += s.latency_invalid_count
    latency_overflow_count += s.latency_overflow_count
    fan_out_sample_count += s.fan_out_sample_count
    fan_out_overflow_count += s.fan_out_overflow_count
    late_join_sample_count += s.late_join_sample_count
    late_join_overflow_count += s.late_join_overflow_count
    // §3.7: Accumulate global scheduler lag (max across workers)
    if (s.scheduler_lag_p95_ms > scheduler_lag_p95_ms) scheduler_lag_p95_ms = s.scheduler_lag_p95_ms
    if (s.scheduler_lag_max_ms > scheduler_lag_max_ms) scheduler_lag_max_ms = s.scheduler_lag_max_ms
  }

  allFanOut.sort((a, b) => a - b)
  allLateJoin.sort((a, b) => a - b)

  // §6.32: Final percentiles from streaming histograms (preserves all samples)
  // Falls back to sorted arrays when histograms are unavailable (test mocks)
  const fanOutP50 = mergedFanOut ? mergedFanOut.p50() : percentileFromSorted(allFanOut, 50)
  const fanOutP95 = mergedFanOut ? mergedFanOut.p95() : percentileFromSorted(allFanOut, 95)
  const fanOutP99 = mergedFanOut ? mergedFanOut.p99() : percentileFromSorted(allFanOut, 99)
  const fanOutMax = mergedFanOut ? mergedFanOut.max : (allFanOut.length > 0 ? allFanOut[allFanOut.length - 1] : 0)
  const lateJoinP50 = mergedLateJoin ? mergedLateJoin.p50() : percentileFromSorted(allLateJoin, 50)
  const lateJoinP95 = mergedLateJoin ? mergedLateJoin.p95() : percentileFromSorted(allLateJoin, 95)
  const lateJoinP99 = mergedLateJoin ? mergedLateJoin.p99() : percentileFromSorted(allLateJoin, 99)
  const lateJoinMax = mergedLateJoin ? mergedLateJoin.max : (allLateJoin.length > 0 ? allLateJoin[allLateJoin.length - 1] : 0)

  const phaseRates = (phaseSnapshots ?? []).map((ps) => {
    const total = Array.from(ps.byMatch.values()).reduce((a, b) => a + b, 0)
    const hotMatch = ps.byMatch.get("match-001") ?? 0
    const hotMatchPct = total > 0 ? (hotMatch / total) * 100 : 0
    // §3.7: Lobby vs match breakdown
    const matchPublished = ps.matchPublished
    const lobbyPublished = ps.lobbyPublished
    const matchAttempts = ps.matchAttempts
    const lobbyAttempts = ps.lobbyAttempts
    total_match_attempts += matchAttempts
    total_lobby_attempts += lobbyAttempts
    const durationSec = ps.durationMs / 1000
    const matchEventsPerSec = durationSec > 0 ? matchPublished / durationSec : 0
    const lobbyEventsPerSec = durationSec > 0 ? lobbyPublished / durationSec : 0
    const totalEventsPerSec = durationSec > 0 ? ps.eventsPublished / durationSec : 0
    return {
      phase: ps.phase,
      eventsPerSec: Math.round(totalEventsPerSec * 10) / 10,
      hotMatchPct: Math.round(hotMatchPct * 10) / 10,
      matchEventsPerSec: Math.round(matchEventsPerSec * 10) / 10,
      lobbyEventsPerSec: Math.round(lobbyEventsPerSec * 10) / 10,
      totalEventsPerSec: Math.round(totalEventsPerSec * 10) / 10,
      matchEventsPublished: matchPublished,
      lobbyEventsPublished: lobbyPublished,
      // §3.7: Attempted vs accepted — attempted = scheduled for publish, accepted = successfully published
      matchEventsAttempted: matchAttempts,
      lobbyEventsAttempted: lobbyAttempts,
      totalEventsAttempted: matchAttempts + lobbyAttempts,
      totalEventsAccepted: matchPublished + lobbyPublished,
    }
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
    fan_out_latency_p50_ms: fanOutP50,
    fan_out_latency_p95_ms: fanOutP95,
    fan_out_latency_p99_ms: fanOutP99,
    fan_out_latency_max_ms: fanOutMax,
    late_join_p50_ms: lateJoinP50,
    late_join_p95_ms: lateJoinP95,
    late_join_p99_ms: lateJoinP99,
    late_join_max_ms: lateJoinMax,
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
    nchan_restart_skipped: false,
    non_slow_p95_degradation_pct: 0,
    nchan_memory_mb_peak: null,
    redis_memory_mb_peak: null,
    // §4.9: Nchan container resource metrics — wired from resource monitor in main.ts
    nchan_cpu_usage_usec: null,
    nchan_cpu_throttled_count: null,
    nchan_cpu_throttled_usec: null,
    nchan_memory_current_bytes: null,
    nchan_memory_peak_bytes: null,
    nchan_memory_oom_events: null,
    nchan_memory_oom_kill_events: null,
    timing_valid: true,
    generator_cpu_percent_peak: 0,
    generator_event_loop_p99_ms: 0,
    run_profile: "evidence" as const,
    lobby_subscribers: 0,
    match_001_subscribers: 0,
    match_002_subscribers: 0,
    match_003_subscribers: 0,
    match_004_subscribers: 0,
    match_005_subscribers: 0,
    match_006_subscribers: 0,
    match_007_subscribers: 0,
    match_008_subscribers: 0,
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
    cpu_max_period: null,
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
    // §4.19: Schema validation error accounting
    schema_validation_errors,
    missing_transport_id,
    // §BH: surge health — defaults, wired from surge scenario in main.ts
    surge_fan_out_p95_ms: 0,
    surge_missing_sequences: 0,
    surge_duplicates: 0,
    surge_out_of_order: 0,
    surge_events_received: 0,
    // §4.5: Surge timing metrics — defaults
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
    scheduler_lag_p95: scheduler_lag_p95_ms,
    scheduler_lag_max: scheduler_lag_max_ms,
    surge_scheduler_lag_p95: 0,
    surge_scheduler_lag_max: 0,
    active_population_start: 0,
    active_population_end: 0,
    active_population_peak: 0,
    // §3.15: Per-scenario active concurrency for reconnect
    reconnect_active_start: 0,
    reconnect_active_peak: 0,
    reconnect_active_end: 0,
    // §3.11.C: Per-scenario active concurrency for other peak-load scenarios
    late_join_active_start: 0,
    late_join_active_peak: 0,
    late_join_active_end: 0,
    burst_active_start: 0,
    burst_active_peak: 0,
    burst_active_end: 0,
    slow_consumer_active_start: 0,
    slow_consumer_active_peak: 0,
    slow_consumer_active_end: 0,
    restart_active_start: 0,
    restart_active_peak: 0,
    restart_active_end: 0,
    // §R: active connections peak — wired from metrics recorder in main.ts
    active_connections_peak: 0,
    // §4.16: Live vs replay delivery accounting
    live_expected_deliveries,
    live_received_deliveries,
    late_join_history_expected,
    late_join_history_received,
    reconnect_replay_expected,
    reconnect_replay_received,
    restart_replay_expected,
    restart_replay_received,
    // §3.9: Separated literal restart and cross-node replacement metrics
    literal_restart_expected,
    literal_restart_received,
    cross_node_expected,
    cross_node_received,
    // §4.7: Slow-consumer metrics — wired from SlowConsumerScenario in main.ts
    slow_consumer_metrics: null,
    // §4.17: Disconnect attribution
    deliberate_disconnects,
    unexpected_client_disconnects,
    server_initiated_disconnects,
    network_failures,
    shutdown_cleanup_disconnects,
    // §v2.1.0: planned failover accounting — deltas wired from main.ts
    planned_restart_disconnects,
    restart_failover_gaps: 0,
    restart_failover_duplicates: 0,
    restart_failover_order_violations: 0,
    // §4.9: Redis connected-client peak — wired from resource monitor in main.ts
    redis_connected_clients_peak: null,
    // §3.8: Nchan/Redis CPU percent peaks
    nchan_cpu_percent_peak: null,
    redis_cpu_percent_peak: null,
    // §3.9: Normalized CPU percent peaks — wired from resource monitor in main.ts
    resource_cpu_percent_peak: null,
    resource_cpu_baseline: null,
    nchan_resource_cpu_percent_peak: null,
    redis_resource_cpu_percent_peak: null,
    // §4.2: Topology capacity — wired from preflight in main.ts
    topology_capacity_sufficient: true,
    // §4.25: Histogram sample population metadata — exact worker sums
    fan_out_sample_count,
    fan_out_overflow_count,
    late_join_sample_count,
    late_join_overflow_count,
    // §3.9: Latency validity counters
    latency_invalid_count,
    latency_overflow_count,
    // §4.22: Build identity — defaults, overwritten in main.ts
    build_identity: {
      git_commit_sha: null,
      nginx_version: "1.27.4",
      nchan_version: "1.3.8",
      node_version: process.version,
      redis_version: "7.2",
    },
    // §4.25: Per-phase latency histograms
    phase_histograms: phaseHistograms ?? {},
    // §3.7: Aggregate workload-rate totals
    match_events_published: phaseRates.reduce((s, p) => s + p.matchEventsPublished, 0),
    lobby_events_published: phaseRates.reduce((s, p) => s + p.lobbyEventsPublished, 0),
    match_events_per_sec: (() => {
      const totalDurationSec = (phaseSnapshots ?? []).reduce((s, p) => s + p.durationMs, 0) / 1000
      const totalMatch = phaseRates.reduce((s, p) => s + p.matchEventsPublished, 0)
      return totalDurationSec > 0 ? Math.round((totalMatch / totalDurationSec) * 10) / 10 : 0
    })(),
    lobby_events_per_sec: (() => {
      const totalDurationSec = (phaseSnapshots ?? []).reduce((s, p) => s + p.durationMs, 0) / 1000
      const totalLobby = phaseRates.reduce((s, p) => s + p.lobbyEventsPublished, 0)
      return totalDurationSec > 0 ? Math.round((totalLobby / totalDurationSec) * 10) / 10 : 0
    })(),
    total_events_per_sec: (() => {
      const totalDurationSec = (phaseSnapshots ?? []).reduce((s, p) => s + p.durationMs, 0) / 1000
      return totalDurationSec > 0 ? Math.round((events_received / totalDurationSec) * 10) / 10 : 0
    })(),
    // §3.7: Aggregate attempted totals
    match_events_attempted: total_match_attempts,
    lobby_events_attempted: total_lobby_attempts,
    // §3.12/§4.15: Clock validity — default (unknown) when not wired from main.ts
    clock_validity: {
      clock_model: "unknown",
      nodes_covered: [],
      measurement_method: "unknown",
      offset_or_guarantee: -1,
      uncertainty_ms: -1,
      threshold_ms: -1,
      validity_result: "INCONCLUSIVE" as const,
      nchan1_reachable: false,
      nchan2_reachable: false,
    },
    // §3.15: Default aggregate provenance
    aggregate_type: "single_run",
    run_count: 1,
    // §3.2: Shard identity — null for single-shard runs, wired from env in main.ts
    shard_identity: null,
  }
}
