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
| AC-11 | Contract §28 | nchan history replay correct | NchanRestartScenario | result-classifier.test.ts | nchan_restart_history_replay_correct | evidence | REJECT | PASS |
| AC-12 | Contract §28 | slow_consumer_disconnects > 0 | SlowConsumerScenario | result-classifier.test.ts | slow_consumer_disconnects | evidence | REJECT | PASS |
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
| Redis | redis:7-alpine | compose.yaml | build: from image | PASS |
| Node.js | node:20-slim | Dockerfile | build: from image | PASS |
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

## Blocking status

| Row | BLOCKED items | Reason |
|---|---|---|
| (none) | — | All rows PASS |

**Total: 0 BLOCKED rows, 0 unmapped normative requirements.**
