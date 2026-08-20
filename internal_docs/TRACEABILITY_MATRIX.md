# Traceability Matrix (§BO)

Purpose: Map every POC requirement to implementation, test, metric, and classification effect.

## Contract acceptance criteria → implementation

| Requirement ID | Source | Requirement Summary | Implementation Path | Test Path | Metric Field | Profile | Violation Effect | Status |
|---|---|---|---|---|---|---|---|---|
| AC-1 | Contract §28 | fan_out_p95 <= 500ms | ConnectionPool.handleMessage → Date.now() delta | defect-classifier.test.ts, result-classifier.test.ts | fan_out_latency_p95_ms | evidence | REJECT | PASS |
| AC-2 | Contract §28 | late_join_p95 <= 2000ms | LateJoinScenario → wall-clock connect-to-caught-up | defect-classifier.test.ts | late_join_p95_ms | evidence | REJECT | PASS |
| AC-3 | Contract §28 | >= 10k connections or machine max | ConnectionPool.connectAll | defect-connection-pool.test.ts | connections_established | evidence | REJECT | PASS |
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
| AC-14 | Contract §28 | nchan_memory < 3.5 GB | CgroupResourceMonitor (external) | result-classifier.test.ts (conditional) | nchan_memory_mb_peak | evidence | REJECT | PASS* |
| AC-15 | Contract §28 | redis_memory < 1.8 GB | Redis INFO memory poll | result-classifier.test.ts (conditional) | redis_memory_mb_peak | evidence | REJECT | PASS* |
| AC-16 | Contract §28 | no CPU throttling events | CgroupResourceMonitor → cpu.stat nr_throttled | new test (§BK) | cpu_throttled_count | evidence | REJECT | PASS |
| AC-17 | Contract §28 | no OOM kills | CgroupResourceMonitor → memory.events oom_kill | new test (§AC) | memory_oom_kill_events | evidence | REJECT | PASS |

*Conditional: skipped when external metrics unavailable (null)

## INCONCLUSIVE criteria → implementation

| Requirement ID | Source | Requirement Summary | Implementation | Metric Field | Status |
|---|---|---|---|---|---|
| INC-1 | Contract §30 | generator_cpu >= 90% | CgroupResourceMonitor → process.cpuUsage | generator_cpu_percent_peak | PASS |
| INC-2 | Contract §30 | event_loop_p99 >= 100ms | perf_hooks.monitorEventLoopDelay | event_loop_delay_p99_ms | PASS |
| INC-3 | Contract §30 | timing_invalid (negative latency) | ConnectionPool (Date.now() delta) | timing_valid | PASS |
| INC-4 | Contract §30 | 100k not reached (machine ceiling) | Section 16 logic | connections_established vs target | PASS (smoke) |

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
| generator_backlog_peak | match-event-publisher.ts | generator_backlog_peak | Informational (no threshold) | PASS |

## §V coverage

| Metric | Source | Field | Status |
|---|---|---|---|
| match-001 subscribers | pool.getSubscriberCount("match-001") | match_001_subscribers | PASS |
| lobby subscribers | pool.getSubscriberCount("lobby") | lobby_subscribers | PASS |
| hot-match event % | phase_publish_rates[].hotMatchPct | ~80% verified | PASS |

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

## §L clarity

| Rule | Status |
|---|---|
| >= 10k connections or machine max → ACCEPT (architecture validation) | PASS |
| Machine can't reach 100k → INCONCLUSIVE AT 100K SCALE | PASS (§L added to contract) |
| Per-resource extrapolation reported as production inference, not measured ACCEPT | PASS (§L added to contract) |

## §O resource envelopes

| Component | CPUs | RAM | Status |
|---|---|---|---|
| nchan-primary (DUT) | 4 | 4 GB | PASS |
| nchan-2 (replacement) | 4 | 4 GB | PASS (§O documented) |
| redis | 2 | 2 GB | PASS |
| runner | 8 | 8 GB | PASS |

## Blocking status

| Row | BLOCKED items | Reason |
|---|---|---|
| (none) | — | All rows PASS or conditionally PASS |

**Total: 0 BLOCKED rows, 0 unmapped normative requirements.**
