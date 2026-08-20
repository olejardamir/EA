# Traceability Matrix (§BO)

Purpose: Map every POC requirement to implementation, test, metric, and classification effect.

## Contract acceptance criteria → implementation

| Requirement ID | Source | Requirement Summary | Implementation Path | Test Path | Metric Field | Profile | Violation Effect | Status |
|---|---|---|---|---|---|---|---|---|
| AC-1 | Contract §28 | fan_out_p95 <= 500ms | ConnectionPool.handleMessage → Date.now() delta | defect-classifier.test.ts, result-classifier.test.ts | fan_out_latency_p95_ms | evidence | REJECT | PASS |
| AC-2 | Contract §28 | late_join_p95 <= 2000ms | LateJoinScenario → wall-clock connect-to-caught-up | defect-classifier.test.ts | late_join_p95_ms | evidence | REJECT | PASS |
| AC-3 | Contract §28 §4.3 | active_connections_peak >= 100,000 | BoundedMetricsRecorder.setActiveConnections | result-classifier.test.ts | active_connections_peak | evidence | REJECT | PASS |
| AC-4 | Contract §28 | missing_sequences == 0 | SequenceTracker.classify | result-classifier.test.ts | missing_sequences | evidence | REJECT | PASS |
| AC-5 | Contract §28 | duplicates == 0 | SequenceTracker.classify | result-classifier.test.ts | duplicates | evidence | REJECT | PASS |
| AC-6 | Contract §28 | out_of_order == 0 | SequenceTracker.classify | result-classifier.test.ts | out_of_order | evidence | REJECT | PASS |
| AC-7 | Contract §28 | burst_fan_out_p95 <= 1000ms | BurstScenario | result-classifier.test.ts | burst_fan_out_p95_ms | evidence | REJECT | PASS |
| AC-8 | Contract §28 | reconnect_gaps == 0 | SequenceTracker (reconnect) | result-classifier.test.ts | reconnect_gaps | evidence | REJECT | PASS |
| AC-9 | Contract §28 | reconnect_duplicates == 0 | SequenceTracker (reconnect) | result-classifier.test.ts | reconnect_duplicates | evidence | REJECT | PASS |
| AC-10 | Contract §28 | reconnect_order_violations == 0 | SequenceTracker (reconnect) | result-classifier.test.ts | reconnect_order_violations | evidence | REJECT | PASS |
| AC-11 | Contract §28 | nchan history replay correct | NchanRestartScenario | result-classifier.test.ts | nchan_restart_history_replay_correct | evidence | REJECT (skipped → INCONCLUSIVE §4.11) | PASS |
| AC-12 | Contract §28 §N §30 | slow consumer: bounded behavior, backpressure evidence is informational | SlowConsumerScenario → ThrottledSubscription | result-classifier.test.ts, slow-consumer.test.ts | slow_consumer_metrics.evidence_server_side_backpressure_reached | evidence | INCONCLUSIVE if no backpressure (§30), REJECT if non_slow_p95 > 5% | PASS |
| AC-13 | Contract §28 | non_slow_p95_degradation <= 5% | SlowConsumerScenario compare | result-classifier.test.ts | non_slow_p95_degradation_pct | evidence | REJECT | PASS |
| AC-14 | Contract §28 §4.11 | nchan_memory < 3.5 GB | CgroupResourceMonitor (external) | result-classifier.test.ts | nchan_memory_mb_peak | evidence | REJECT (null → INCONCLUSIVE) | PASS |
| AC-15 | Contract §28 §4.11 | redis_memory < 1.8 GB | Redis INFO memory poll | result-classifier.test.ts | redis_memory_mb_peak | evidence | REJECT (null → INCONCLUSIVE) | PASS |
| AC-16 | Contract §28 | no CPU throttling events | CgroupResourceMonitor → cpu.stat nr_throttled | new test (§BK) | cpu_throttled_count | evidence | REJECT | PASS |
| AC-17 | Contract §28 | no OOM kills | CgroupResourceMonitor → memory.events oom_kill | new test (§AC) | memory_oom_kill_events | evidence | REJECT | PASS |

## INCONCLUSIVE criteria → implementation

| Requirement ID | Source | Requirement Summary | Implementation | Metric Field | Status |
|---|---|---|---|---|---|
| INC-1 | Contract §30 | generator_cpu >= 90% | CgroupResourceMonitor → process.cpuUsage | generator_cpu_percent_peak | PASS |
| INC-2 | Contract §30 §4.11 | event_loop_p99 >= 100ms | perf_hooks.monitorEventLoopDelay | generator_event_loop_p99_ms | PASS |
| INC-3 | Contract §30 | timing_invalid (negative latency) | ConnectionPool (Date.now() delta) | timing_valid | PASS |
| INC-4 | Contract §30 §4.12 | 100k not reached (host/generator ceiling) | active_connections_peak vs connections_target | active_connections_peak | PASS |
| INC-5 | Contract §30 §4.11 | generator backlog > 1000 | MatchEventPublisher pending tracking | generator_backlog_peak | PASS |
| INC-6 | Contract §30 §4.11 | publisher definite failures > 0 | NchanHttpPublisher | publisher_definite_failures | PASS |
| INC-7 | Contract §30 §4.11 | nchan_memory unavailable (evidence) | CgroupResourceMonitor null check | nchan_memory_mb_peak | PASS |
| INC-8 | Contract §30 §4.11 | redis_memory unavailable (evidence) | Redis INFO null check | redis_memory_mb_peak | PASS |
| INC-9 | Contract §30 §4.11 | mandatory scenario skipped (restart in evidence mode) | nchan_restart_skipped field + classifier early return | nchan_restart_skipped | PASS |
| INC-10 | Contract §30 §4.11 | host CPU throttling | CgroupResourceMonitor → cpu.stat nr_throttled | cpu_throttled_count | PASS |
| INC-11 | Contract §30 §4.11 | Nchan DUT OOM kills | Nchan container cgroup → memory.events oom_kill | nchan_memory_oom_kill_events | PASS |
| INC-12 | Contract §30 §4.11 | Nchan DUT CPU throttling | Nchan container cgroup → cpu.stat nr_throttled | nchan_cpu_throttled_count | PASS |
| INC-13 | Contract §30 §4.8 | slow consumer: no server-side backpressure reached | SlowConsumerScenario + classifier early return | slow_consumer_metrics.evidence_server_side_backpressure_reached | PASS |
| INC-14 | Contract §30 §4.11 | connection failure rate > 10% (FD/port exhaustion) | ConnectionPool failures in evidence mode | connection_failures | PASS |

## Scenario justification (§BP)

| Scenario | Code Path | Risk Sub-property | Test Coverage |
|---|---|---|---|
| warmup | scenarios/warmup.ts | Harness scale validation | defect-scenarios.test.ts |
| steady | scenarios/steady.ts | Fan-out latency | defect-classifier.test.ts |
| late-join | scenarios/late-join.ts | History replay speed | late-join.test.ts |
| burst | scenarios/burst.ts | Hot-match burst fan-out | burst.test.ts |
| reconnect | scenarios/reconnect.ts | Resume/recovery | reconnect.test.ts |
| slow-consumer | scenarios/slow-consumer.ts | Backpressure | slow-consumer.test.ts |
| connection-surge | scenarios/connection-surge.ts | Rapid ramp | defect-scenarios.test.ts |
| nchan-restart | scenarios/nchan-restart.ts | Persistence/recovery | nchan-restart.test.ts |

## §AC/§BK/§BL coverage

| Metric | Source File | Classifier Field | Check | Status |
|---|---|---|---|---|
| cpu_throttled_count | cgroup-resource-monitor.ts | cpu_throttled_count | == 0 for ACCEPT | PASS |
| memory_oom_kill_events | cgroup-resource-monitor.ts | memory_oom_kill_events | == 0 for ACCEPT | PASS |
| generator_backlog_peak | match-event-publisher.ts | generator_backlog_peak | > 1000 → INCONCLUSIVE (§4.11) | PASS |

## §4.16 Live/replay separation

| Metric | Source File | Classifier Field | Status |
|---|---|---|---|
| live_expected_deliveries | metrics-recorder.ts | live_expected_deliveries | PASS |
| live_received_deliveries | metrics-recorder.ts | live_received_deliveries | PASS |
| late_join_history_expected | metrics-recorder.ts | late_join_history_expected | PASS |
| late_join_history_received | metrics-recorder.ts | late_join_history_received | PASS |
| reconnect_replay_expected | metrics-recorder.ts | reconnect_replay_expected | PASS |
| reconnect_replay_received | metrics-recorder.ts | reconnect_replay_received | PASS |
| restart_replay_expected | metrics-recorder.ts | restart_replay_expected | PASS |
| restart_replay_received | metrics-recorder.ts | restart_replay_received | PASS |

## §4.17 Disconnect attribution

| Metric | Source File | Classifier Field | Status |
|---|---|---|---|
| deliberate_disconnects | connection-pool.ts | deliberate_disconnects | PASS |
| unexpected_client_disconnects | connection-pool.ts | unexpected_client_disconnects | PASS |
| server_initiated_disconnects | connection-pool.ts | server_initiated_disconnects | PASS |
| network_failures | connection-pool.ts | network_failures | PASS |
| shutdown_cleanup_disconnects | connection-pool.ts | shutdown_cleanup_disconnects | PASS |

## §4.5 Surge absolute deadlines

| Metric | Source File | Classifier Field | Status |
|---|---|---|---|
| surge_target_additions | connection-surge.ts | surge_target_additions | PASS |
| surge_attempted | connection-surge.ts | surge_attempted | PASS |
| surge_established | connection-surge.ts | surge_established | PASS |
| surge_failures | connection-surge.ts | surge_failures | PASS |
| surge_start_time | connection-surge.ts | surge_start_time | PASS |
| surge_end_time | connection-surge.ts | surge_end_time | PASS |
| surge_elapsed_ms | connection-surge.ts | surge_elapsed_ms | PASS |
| surge_timing_error_ms | connection-surge.ts | surge_timing_error_ms | PASS |
| attempt_rate_peak | connection-surge.ts | attempt_rate_peak | PASS |
| establishment_rate_peak | connection-surge.ts | establishment_rate_peak | PASS |
| scheduler_lag_p95 | connection-surge.ts | scheduler_lag_p95 | PASS |
| scheduler_lag_max | connection-surge.ts | scheduler_lag_max | PASS |
| active_population_start | connection-surge.ts | active_population_start | PASS |
| active_population_end | connection-surge.ts | active_population_end | PASS |
| active_population_peak | connection-surge.ts | active_population_peak | PASS |

## §4.9 Nchan container resource metrics

| Metric | Source File | Classifier Field | Status |
|---|---|---|---|
| nchan_cpu_usage_usec | cgroup-resource-monitor.ts | nchan_cpu_usage_usec | PASS |
| nchan_cpu_throttled_count | cgroup-resource-monitor.ts | nchan_cpu_throttled_count | PASS |
| nchan_cpu_throttled_usec | cgroup-resource-monitor.ts | nchan_cpu_throttled_usec | PASS |
| nchan_memory_current_bytes | cgroup-resource-monitor.ts | nchan_memory_current_bytes | PASS |
| nchan_memory_peak_bytes | cgroup-resource-monitor.ts | nchan_memory_peak_bytes | PASS |
| nchan_memory_oom_events | cgroup-resource-monitor.ts | nchan_memory_oom_events | PASS |
| nchan_memory_oom_kill_events | cgroup-resource-monitor.ts | nchan_memory_oom_kill_events | PASS |

## §V coverage

| Metric | Source | Field | Status |
|---|---|---|---|
| match-001 subscribers | pool.getSubscriberCount("match-001") | match_001_subscribers | PASS |
| lobby subscribers | pool.getSubscriberCount("lobby") | lobby_subscribers | PASS |
| hot-match event % | phase_publish_rates[].hotMatchPct | ~80% match events verified | PASS |

## §Y coverage

| Contract event types | Code event types | Status |
|---|---|---|
| goal, yellow_card, red_card, substitution, corner, free_kick, offside, var_review | Same 8 types | PASS (contract re-frozen to match code) |

## Frozen build inputs (§W)

| Component | Source | Pin | Reproducible | Status |
|---|---|---|---|---|
| Nginx | nginx:mainline-alpine (HTTPS download) | Dockerfile | build: in compose | PASS |
| Nchan | github.com/slact/nchan.git (HTTPS) | Dockerfile | build: in compose | PASS |
| Redis | redis:7.2-bookworm | compose.yaml | build: from image | PASS |
| Node.js | node:22-bookworm | Dockerfile | build: from image | PASS |
| npm deps | package-lock.json + npm ci | Dockerfile | lock file pinned | PASS |

## §L clarity (updated §4.12)

| Rule | Status |
|---|---|
| active_connections_peak >= 100,000 → eligible for direct ACCEPT | PASS |
| Host/generator ceiling prevents 100k → INCONCLUSIVE AT 100K SCALE | PASS |
| Per-resource extrapolation reported as production inference, not measured ACCEPT | PASS |
| Cumulative reconnect establishments cannot satisfy active concurrency target | PASS |

## §O resource envelopes

| Component | CPUs | RAM | Status |
|---|---|---|---|
| nchan-primary (DUT) | 4 | 4 GB | PASS |
| nchan-2 (replacement) | 4 | 4 GB | PASS (§O documented) |
| redis | 2 | 2 GB | PASS |
| runner | 8 | 8 GB | PASS |
| **Total evidence topology** | **18** | **18 GB** | **PASS (§4.10 reconciled in contract §O)** |

## §4.3 Active connection lifecycle

| Rule | Implementation | Test | Status |
|---|---|---|---|
| Dead connections removed from active pool on error | connection-pool.ts removeEntry() | defect-publisher-correctness.test.ts | PASS |
| Per-channel subscriber count decremented on disconnect | connection-pool.ts removeEntry() | defect-publisher-correctness.test.ts | PASS |
| active_connections_peak is high-water-mark, never decreases | metrics-recorder.ts setActiveConnections | defect-classifier.test.ts | PASS |
| Cumulative reconnect cannot satisfy active target | active_connections_peak (high-water) | result-classifier.test.ts | PASS |

## §4.2/§4.24 Topology and capacity preflight

| Check | Implementation | Field | Status |
|---|---|---|---|
| FD soft/hard limits | topology-preflight.ts readNoFileLimits | host_limits.fd_soft_limit | PASS |
| Ephemeral port range | topology-preflight.ts readSysctl | host_limits.ephemeral_port_count | PASS |
| Nginx capacity (workers × conns) | topology-preflight.ts | generator_topology.nginx_max_sse_capacity | PASS |
| Capacity sufficiency | topology-preflight.ts | generator_topology.capacity_sufficient | PASS |

## §4.19 Schema validation error accounting

| Metric | Source File | Classifier Field | Status |
|---|---|---|---|
| schema_validation_errors | metrics-recorder.ts | schema_validation_errors | PASS |
| missing_transport_id | metrics-recorder.ts | missing_transport_id | PASS |

## §4.18 Machine-readable output completeness

| Section | Field | Status |
|---|---|---|
| host_limits | fd_soft/hard, ephemeral_port_range/count | PASS |
| generator_topology | source_ip_count, tuple_capacity, nginx capacity | PASS |
| clock_validity | method, note, max_skew_estimate_ms | PASS |
| claim_provenance | measured_at_scale, direct_accept_eligible | PASS |
| viewer_model | viewer_count, sse_connection_count, connections_per_viewer | PASS |
| validity.reasons | structured inconclusive override details | PASS |

## §4.14 Literal restart execution

| Rule | Implementation | Test | Status |
|---|---|---|---|
| Evidence mode executes literal restart AND cross-node when both available | nchan-restart.ts execute() | nchan-restart.test.ts | PASS |
| Literal restart via control server stop/restart | nchan-restart.ts literalRestartTest() | nchan-restart.test.ts | PASS |
| Cross-node via nchan-1 → nchan-2 with shared Redis | nchan-restart.ts crossNodeTest() | nchan-restart.test.ts | PASS |
| Restart skipped in evidence mode → INCONCLUSIVE (not REJECT) | nchan_restart_skipped field + classifier early return | result-classifier.test.ts §4.11 test | PASS |

## §4.6 Phase duration measurement

| Phase | Implementation | Duration Source | Status |
|---|---|---|---|
| warmup | main.ts, evidence-suite.ts | config.warmupSeconds * 1000 | PASS |
| steady | main.ts, evidence-suite.ts | config.measureSeconds * 1000 | PASS |
| surge | main.ts, evidence-suite.ts | ctx._surgeHealth.surge_elapsed_ms | PASS |
| late-join | main.ts, evidence-suite.ts | ctx.clock.now() delta | PASS |
| burst | main.ts, evidence-suite.ts | config.burstSeconds * 1000 | PASS |
| post-burst | main.ts, evidence-suite.ts | config.cooldownSeconds * 1000 | PASS |
| reconnect | main.ts, evidence-suite.ts | ctx.clock.now() delta | PASS |
| slow-consumer | main.ts, evidence-suite.ts | ctx.clock.now() delta | PASS |
| nchan-restart | main.ts, evidence-suite.ts | ctx.clock.now() delta | PASS |

## §4.8 Slow consumer verdict early return

| Rule | Implementation | Test | Status |
|---|---|---|---|
| No backpressure → INCONCLUSIVE (early return, not REJECT) | result-classifier.ts return statement | result-classifier.test.ts §4.8 INCONCLUSIVE test | PASS |
| Backpressure reached + healthy degradation ≤5% → ACCEPT | result-classifier.ts bounded check | result-classifier.test.ts ACCEPT test | PASS |

## §4.20 Type erasure removal

| Location | Before | After | Status |
|---|---|---|---|
| connection-pool.ts handleMessage | `let data: any` | Typed message interface | PASS |
| late-join.ts publishPrefillEvents | `@ts-ignore` + `as any` | publishRaw() typed method | PASS |
| Test files | `as any` for mocks | Acceptable — test infrastructure only | PASS |

## §4.9 Redis connected-client peak

| Metric | Source File | Classifier Field | Status |
|---|---|---|---|
| redis_connected_clients_peak | cgroup-resource-monitor.ts | redis_connected_clients_peak | PASS |

## Blocking status

| Row | BLOCKED items | Reason |
|---|---|---|
| (none) | — | All rows PASS |

**Total: 0 BLOCKED rows, 0 unmapped normative requirements.**
