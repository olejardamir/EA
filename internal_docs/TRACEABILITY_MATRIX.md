# Traceability Matrix (§BO)

Purpose: Map every POC requirement to implementation, test, metric, and classification effect.

**Active contract (POC experiment):** `poc/internal_docs/EXPERIMENT_CONTRACT_v2_3_0.md` (FROZEN — CANONICAL ACTIVE, terminal M3 era). Historical `v2.0.5`/`v2.0.6` contracts are preserved as provenance only and are NOT the current terminal M3 contract. Requirement rows citing "Contract §N" refer to the v2.3.0 section numbering.

**Terminal M3 verdict:** INCONCLUSIVE at frozen v2.3.0. F1 (validated best effort): 100,000 active viewers, correctness 0, fan_out p95 2757 ms, burst p95 3707 ms. The archival fixed 4-partition single-primary 100k capacity assumption was withdrawn for production.

> **M4 architecture authority (2026-08-23):** The one-primary / 4-partition 100k topology traced in this matrix is the **POC contract topology**, NOT the final production design. The **final M4 production architecture** is the horizontally partitioned Nchan/SSE fleet (see `internal_docs/M4_FINAL_ARCHITECTURE.md`); it is the successor and now holds architecture authority. No traceability row here should be read as validating that topology for production. Cost/pricing: `internal_docs/M5_*.md` (selected M4 architecture WITHIN $3k/month). Generated from v10 closure prompt (SHA `e3e31916164ab700bc76beca9712fa428f269709ba76a13c923ceb2ef30bf597`), per `internal_docs/AI_INSTRUCTION_PROVENANCE.md`.

**Production architecture (post-M3):** horizontally partitioned self-hosted Nchan/Redis delivery fleet with match/hot-match sharding, DynamoDB canonical truth, API Gateway + SQS FIFO + Lambda ingest, CloudFront edge, Next.js static client. See `M4_FINAL_ARCHITECTURE.md`. No row below should be read as treating the old one-primary 100k architecture as the final design.

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
| AC-11 | Contract §28 | nchan history replay correct | NchanRestartScenario | result-classifier.test.ts | nchan_restart_history_replay_correct | evidence | REJECT (skipped → §3.10 campaign-only excluded from per-run gate) | PASS |
| AC-12 | Contract §28 §N §30 | slow consumer: bounded behavior, backpressure evidence is informational | SlowConsumerScenario → ThrottledSubscription | result-classifier.test.ts, slow-consumer.test.ts | slow_consumer_metrics.evidence_server_side_backpressure_reached | evidence | INCONCLUSIVE if no backpressure (§30), REJECT if non_slow_p95 > 5% | PASS |
| AC-13 | Contract §28 | non_slow_p95_degradation <= 5% | SlowConsumerScenario compare | result-classifier.test.ts | non_slow_p95_degradation_pct | evidence | REJECT | PASS |
| AC-14 | Contract §28 §4.11 §3.17 | nchan_memory_mb_peak < 7000 MB (87.5% of 8 GB DUT limit) | CgroupResourceMonitor (external) | result-classifier.test.ts | nchan_memory_mb_peak | evidence | REJECT (null → INCONCLUSIVE) | PASS |
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
| deliberate_disconnects | connection-pool.ts removeActiveEntry(category="deliberate") | deliberate_disconnects | PASS |
| unexpected_client_disconnects | connection-pool.ts removeActiveEntry(category="unexpected") | unexpected_client_disconnects | PASS |
| server_initiated_disconnects | connection-pool.ts removeActiveEntry(category="server_initiated") | server_initiated_disconnects | PASS |
| network_failures | connection-pool.ts removeActiveEntry(category="network") | network_failures | PASS |
| shutdown_cleanup_disconnects | connection-pool.ts disconnectAll() | shutdown_cleanup_disconnects | PASS |

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
| nchan-primary (DUT) | 4 | 8 GB | PASS |
| nchan-2 (replacement) | 4 | 4 GB | PASS (§O documented) |
| redis | 2 | 2 GB | PASS |
| runner | 8 | 8 GB | PASS |
| **Total evidence topology** | **18** | **22 GB** | **PASS (§4.10 reconciled in contract §O)** |

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
| §3.2: Multi-shard source IPs | topology-preflight.ts SHARD_TOTAL env (fallback SHARD_COUNT) | generator_topology.source_ip_count | PASS |
| §3.2: Aggregate target capacity | topology-preflight.ts | generator_topology.aggregate_target_connections | PASS |
| §3.2: Aggregate tuple capacity | topology-preflight.ts | generator_topology.aggregate_destination_tuple_capacity | PASS |
| §3.3: CPU quota from cpu.max | topology-preflight.ts readCpuQuota | generator_topology.cpu_quota | PASS |
| §3.3: Non-viewer FD overhead | topology-preflight.ts NON_VIEWER_FDS=100 | generator_topology.non_viewer_fds | PASS |

## §4.19 Schema validation error accounting

| Metric | Source File | Classifier Field | Status |
|---|---|---|---|
| schema_validation_errors | metrics-recorder.ts | schema_validation_errors | PASS |
| missing_transport_id | metrics-recorder.ts | missing_transport_id | PASS |

## §4.18 Machine-readable output completeness

| Section | Field | Status |
|---|---|---|
| host_limits | fd_soft/hard, ephemeral_port_range/count | PASS |
| generator_topology | source_ip_count, tuple_capacity, nginx capacity, shard_count, recommended_shard_count, topology_note | PASS |
| clock_validity | method, note, max_skew_estimate_ms | PASS |
| claim_provenance | measured_at_scale, direct_accept_eligible (actual conditions) | PASS |
| viewer_model | viewer_count, sse_connection_count, connections_per_viewer, all 8 match + lobby counts | PASS |
| validity.reasons | structured inconclusive override details | PASS |
| scenario_active_concurrency | all 8 match + lobby + total | PASS |
| reconnect_health | active_start, active_peak, active_end | PASS |
| surge_active_population | start, end, peak | PASS |
| workload_rate_metrics | match/lobby/total published, match/lobby/total per-sec, match/lobby attempted | PASS |

## §4.14 Literal restart execution

| Rule | Implementation | Test | Status |
|---|---|---|---|
| Evidence mode executes literal restart AND cross-node when both available | nchan-restart.ts execute() | nchan-restart.test.ts | PASS |
| Literal restart via control server stop/restart | nchan-restart.ts literalRestartTest() | nchan-restart.test.ts | PASS |
| Cross-node via nchan-1 → nchan-2 with shared Redis | nchan-restart.ts crossNodeTest() | nchan-restart.test.ts | PASS |
| Restart skipped in evidence mode → campaign-only (not INCONCLUSIVE for later runs) | nchan_restart_skipped + nchan_restart_campaign_only | result-classifier.test.ts §4.11 test | PASS |
| Campaign classifier requires restart PASS | evidence-suite.ts campaign aggregate check | evidence-suite.test.ts | PASS |
| Expected count from head tracker (not derived from received) | nchan-restart.ts headAtRestart | nchan-restart.test.ts | PASS |
| Exact required-set predicate shared by BOTH paths: only unique in-range canonical sequences (expected_first_seq ≤ seq ≤ expected_last_seq) count toward received_required_count | nchan-restart.ts evaluateRestartRequiredRange() | restart-exact-range.test.ts (both-path matrix) | PASS |
| Literal restart completion: exact required set complete (received_required_count == expected_count, missing_required == 0, first and last present) — never seq >= target | nchan-restart.ts literalRestartTest → evaluateRestartRequiredRange().target_reached | restart-exact-range.test.ts, nchan-restart.test.ts | PASS |
| Cross-node completion: exact required set complete — a later seq > expected_last_seq while the set is incomplete fails immediately and can never substitute for a missing required sequence | nchan-restart.ts crossNodeTest → evaluateRestartRequiredRange().target_reached | restart-exact-range.test.ts, nchan-restart.test.ts | PASS |
| Expected replay count from head tracker, not from received replay count; total frame count is never proof of completeness | nchan-restart.ts frozenExpectedCount/frozenExpectedCount1 | restart-exact-range.test.ts | PASS |
| Structured per-path evidence reports exact-range values (missing_required_sequences, out_of_range_before_count, out_of_range_after_count, duplicates, out_of_order, target_reached) and path passed == exact-set complete AND all gates | scenario.ts RestartPathResult; nchan-restart.ts ctx._restartReplay.literal_restart / .cross_node | restart-exact-range.test.ts, nchan-restart.test.ts structured assertions | PASS |
| Scenario result consumes the exact-range predicate (passed: pathResult.passed); no stale aggregate boolean bypasses it; global verdict requires every shard/scenario accept; campaign consumes global verdicts | nchan-restart.ts execute()/literalRestartTest()/crossNodeTest(); global-coordinator.ts; global-campaign.ts | nchan-restart.test.ts, global-coordinator-adversarial.test.ts, global-campaign.test.ts | PASS | |

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
| Null nchan_memory_bounded → INCONCLUSIVE | result-classifier.ts null check | result-classifier.test.ts §3.8 test | PASS |
| Per-client median interval tracks 2s pacing | slow-consumer.ts per_client_median_event_interval_ms | slow-consumer.test.ts | PASS |

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

## §3.12 Clock validity

| Rule | Implementation | Field | Status |
|---|---|---|---|
| Evidence suite computes clock_validity | evidence-suite.ts lines 477-504 | clock_validity | PASS |
| Single-run computes clock_validity | main.ts lines 160-191 → aggregated.clock_validity | clock_validity | PASS |
| Same-host-kernel-clock model | main.ts, evidence-suite.ts | clock_validity.clock_model | PASS |
| Unreachable Nchan → INCONCLUSIVE | main.ts clockEvidence.passed | clock_validity.validity_result | PASS |

## §3.15 Campaign provenance

| Rule | Implementation | Field | Status |
|---|---|---|---|
| Single-run marked aggregate_type=single_run | main.ts | aggregate_type | PASS |
| Campaign aggregate marked aggregate_type=campaign | evidence-suite.ts aggregateRuns() | aggregate_type | PASS |
| run_count tracks number of runs aggregated | evidence-suite.ts aggregateRuns() | run_count | PASS |
| Machine output emits aggregate_type and run_count | result-printer.ts | aggregate_type, run_count | PASS |

## §3.10 Campaign-only restart semantics

| Rule | Implementation | Field | Status |
|---|---|---|---|
| Non-run-0 runs skip nchan_history_replay check | result-classifier.ts lines 316-326 | nchan_restart_campaign_only | PASS |
| nchan_restart_skipped=true → nchan_history_replay excluded | result-classifier.ts if/else block | nchan_history_replay | PASS |
| Campaign classifier requires run 0 restart PASS | evidence-suite.ts line 792-799 | run0Result.aggregated.nchan_restart_history_replay_correct | PASS |

## §3.2 Multi-shard 100k topology

| Rule | Implementation | Field | Status |
|---|---|---|---|
| compose.evidence-100k.yaml defines 4 runner shards | compose.evidence-100k.yaml | runner-shard-0..3 | PASS |
| Each shard on distinct Docker bridge IP | compose.evidence-100k.yaml networks: shard-net | source_ip_count=4 | PASS |
| Aggregate capacity > 100k | topology-preflight.ts | aggregate_destination_tuple_capacity | PASS |
| Per-shard FD limits set to 120k | compose.evidence-100k.yaml ulimits.nofile | fd_soft_limit | PASS |

## §3.2 Multi-shard topology

| Metric | Source File | Field | Status |
|---|---|---|---|
| recommended_shard_count | topology-preflight.ts | generator_topology.recommended_shard_count | PASS |
| shard_capacity_each | topology-preflight.ts | generator_topology.shard_capacity_each | PASS |
| topology_note (single-IP insufficient) | topology-preflight.ts | generator_topology.topology_note | PASS |
| aggregate_target_connections | topology-preflight.ts | generator_topology.aggregate_target_connections | PASS |
| aggregate_destination_tuple_capacity | topology-preflight.ts | generator_topology.aggregate_destination_tuple_capacity | PASS |
| capacity_sufficient (aggregate) | topology-preflight.ts | generator_topology.capacity_sufficient | PASS |
| shard_identity (shard_id, shard_count, source_ip_index) | main.ts, evidence-suite.ts | shard_identity | PASS |

## §3.7 Workload-rate metrics

| Metric | Source File | Field | Status |
|---|---|---|---|
| match_events_published | match-event-publisher.ts | match_events_published | PASS |
| lobby_events_published | match-event-publisher.ts | lobby_events_published | PASS |
| match_events_attempted | match-event-publisher.ts → phaseSnapshots | match_events_attempted | PASS |
| lobby_events_attempted | match-event-publisher.ts → phaseSnapshots | lobby_events_attempted | PASS |
| match_events_per_sec | result-classifier.ts | match_events_per_sec | PASS |
| lobby_events_per_sec | result-classifier.ts | lobby_events_per_sec | PASS |
| total_events_per_sec | result-classifier.ts | total_events_per_sec | PASS |
| phase_publish_rates[].matchEventsPerSec | result-classifier.ts | phase_publish_rates | PASS |
| phase_publish_rates[].lobbyEventsPerSec | result-classifier.ts | phase_publish_rates | PASS |
| phase_publish_rates[].matchEventsAttempted | result-classifier.ts | phase_publish_rates | PASS |
| phase_publish_rates[].lobbyEventsAttempted | result-classifier.ts | phase_publish_rates | PASS |
| scheduler_lag_p95 | main.ts (publisher samples) | scheduler_lag_p95 | PASS |
| surge_scheduler_lag_p95 | main.ts (surge phase) | surge_scheduler_lag_p95 | PASS |

## §3.8 Slow-consumer per-client metrics

| Metric | Source File | Field | Status |
|---|---|---|---|
| per_client_median_event_interval_ms | slow-consumer.ts | slow_consumer_metrics.per_client_median_event_interval_ms | PASS |
| per_client_event_timestamps_ms | slow-consumer.ts | slow_consumer_metrics.per_client_event_timestamps_ms | PASS |
| slow_achieved_read_rate_events_per_sec | slow-consumer.ts | slow_consumer_metrics.slow_achieved_read_rate_events_per_sec | PASS |
| slow_median_event_interval_ms | slow-consumer.ts | slow_consumer_metrics.slow_median_event_interval_ms | PASS |
| slow_p95_event_interval_ms | slow-consumer.ts | slow_consumer_metrics.slow_p95_event_interval_ms | PASS |
| nchan_memory_bounded (null → INCONCLUSIVE) | slow-consumer.ts, result-classifier.ts | slow_consumer_metrics.nchan_memory_bounded | PASS |
| nchan_memory_growth_bytes | slow-consumer.ts | slow_consumer_metrics.nchan_memory_growth_bytes | PASS |
| nchan_memory_growth_pct | slow-consumer.ts | slow_consumer_metrics.nchan_memory_growth_pct | PASS |
| server-side backpressure requires disconnect OR meaningful memory growth | slow-consumer.ts | slow_consumer_metrics.evidence_server_side_backpressure_reached | PASS |
| offered==consumed by construction (TCP backpressure architectural note) | slow-consumer.ts ThrottledSubscription | slow_offered_event_count == slow_application_read_count | PASS |

## §3.9 Mandatory resource metric null handling

| Metric | Source File | Classifier Rule | Status |
|---|---|---|---|
| nchan_cpu_percent_peak null → INCONCLUSIVE at 100k+ | evidence-suite.ts, result-classifier.ts | mandatory_metric check | PASS |
| redis_cpu_percent_peak null → INCONCLUSIVE at 100k+ | evidence-suite.ts, result-classifier.ts | mandatory_metric check | PASS |
| cpu_throttled_count null → INCONCLUSIVE at 100k+ | evidence-suite.ts, result-classifier.ts | mandatory_metric check | PASS |
| Cross-run null preservation (any run null → aggregate null) | evidence-suite.ts | anyNchanCpuNull / anyRedisCpuNull | PASS |
| CPU normalization documented (100% = 1 core) | cgroup-resource-monitor.ts | normalizeCpuPercent() | PASS |
| Per-run cgroup baselines (deltas, not lifetime) | evidence-suite.ts | cgroupBaseline snapshot | PASS |

## §3.12 Clock validity evidence path

| Metric | Source File | Field | Status |
|---|---|---|---|
| clock_model (same-host-kernel-clock) | evidence-suite.ts | clock_validity.clock_model | PASS |
| validity_result (PASS/INCONCLUSIVE) | evidence-suite.ts | clock_validity.validity_result | PASS |
| Propagated from first run to campaign aggregate | evidence-suite.ts | aggregate clock_validity | PASS |
| Single-run path also wired | main.ts | clock_validity | PASS |

## §3.14 Disconnect attribution exact-once

| Metric | Source File | Field | Status |
|---|---|---|---|
| deliberate_disconnects (guard: only when entry found) | connection-pool.ts | deliberate_disconnects | PASS |
| unexpected_client_disconnects | connection-pool.ts | unexpected_client_disconnects | PASS |
| server_initiated_disconnects | connection-pool.ts | server_initiated_disconnects | PASS |
| network_failures | connection-pool.ts | network_failures | PASS |
| shutdown_cleanup_disconnects (one per disconnectAll) | connection-pool.ts | shutdown_cleanup_disconnects | PASS |
| Reconnected stream terminal errors categorized | reconnect.ts | removeActiveEntry(category) | PASS |
| connections_dropped exact-once (removeEntry handles increment) | connection-pool.ts connectOne error handler | connections_dropped | PASS |

## §3.8.A Per-service CPU normalization

| Metric | Source File | Field | Status |
|---|---|---|---|
| nchan_resource_cpu_percent_peak uses nchan_cpu_max_quota | main.ts normalizeCpuPercent | nchan_resource_cpu_percent_peak | PASS |
| redis_resource_cpu_percent_peak uses redis_cpu_max_quota | main.ts normalizeCpuPercent | redis_resource_cpu_percent_peak | PASS |
| resource_cpu_percent_peak uses runner cpu_max_quota | main.ts normalizeCpuPercent | resource_cpu_percent_peak | PASS |
| NCHAN_CPU_MAX_QUOTA passed via compose files | compose.yaml, compose.evidence.yaml, compose.evidence-100k.yaml | nchanCpuMaxQuota | PASS |
| REDIS_CPU_MAX_QUOTA passed via compose files | compose.yaml, compose.evidence.yaml, compose.evidence-100k.yaml | redisCpuMaxQuota | PASS |

## §3.4.D Topology preflight primary-only subscriber capacity

| Rule | Implementation | Field | Status |
|---|---|---|---|
| subscribers_per_nchan_node = targetConnections (primary-only) | topology-preflight.ts | subscribers_per_nchan_node | PASS |
| nchanNodes default changed from 2 to 1 | topology-preflight.ts runTopologyPreflight | nchan_node_count | PASS |

## §3.12.C Campaign aggregation: memory peaks use max across runs

| Rule | Implementation | Field | Status |
|---|---|---|---|
| nchan_memory_mb_peak: max across runs (not first-run inheritance) | evidence-suite.ts aggregateRuns | nchan_memory_mb_peak | PASS |
| redis_memory_mb_peak: max across runs (not first-run inheritance) | evidence-suite.ts aggregateRuns | redis_memory_mb_peak | PASS |
| nchan_memory_peak_bytes: max across runs (null-safe) | evidence-suite.ts aggregateRuns | nchan_memory_peak_bytes | PASS |

## §3.11.A GIT_COMMIT_SHA wired through all compose files

| Rule | Implementation | Field | Status |
|---|---|---|---|
| compose.yaml passes GIT_COMMIT_SHA env to runner | compose.yaml | GIT_COMMIT_SHA | PASS |
| compose.evidence.yaml passes GIT_COMMIT_SHA env to runner | compose.evidence.yaml | GIT_COMMIT_SHA | PASS |
| compose.evidence-100k.yaml passes GIT_COMMIT_SHA to all 4 shards | compose.evidence-100k.yaml | GIT_COMMIT_SHA | PASS |

## §3.2.G Multi-shard env var consistency

| Rule | Implementation | Field | Status |
|---|---|---|---|
| compose.evidence-100k.yaml uses SHARD_ID (not SHARD_INDEX) | compose.evidence-100k.yaml | SHARD_ID | PASS |
| compose.evidence-100k.yaml uses SHARD_TOTAL (not SHARD_COUNT) | compose.evidence-100k.yaml | SHARD_TOTAL | PASS |
| main.ts reads SHARD_ID with fallback to SHARD_COUNT | main.ts | shard_identity | PASS |
| evidence-suite.ts reads SHARD_TOTAL with fallback to SHARD_COUNT | evidence-suite.ts | shardCount | PASS |
| topology-preflight.ts reads SHARD_TOTAL with fallback to SHARD_COUNT | topology-preflight.ts | shardCount | PASS |

## §3.11.F Clock validity propagation

| Rule | Implementation | Field | Status |
|---|---|---|---|
| Single-run path propagates actual measured clock_validity | main.ts → result-printer.ts | clock_validity | PASS |
| Fallback uses typed fields (not ad-hoc method/note/max_skew) | result-printer.ts | clock_validity | PASS |

## §3.15 Machine-readable output fields

| Field | Source File | Output Location | Status |
|---|---|---|---|
| all 8 match viewer counts + lobby | connection-pool.ts → result-printer.ts | scenario_active_concurrency | PASS |
| reconnect_active_start/peak/end | reconnect.ts → result-printer.ts | reconnect_health | PASS |
| direct_accept_eligible (actual conditions) | result-printer.ts | claim_provenance | PASS |
| git_commit_sha (env var fallback) | main.ts | build_identity | PASS |
| surge_active_population_start/end/peak | result-printer.ts | surge_active_population | PASS |

## §3.3.C Machine provenance: runtime limits use actual resolved values

| Field | Source File | Test | Status |
|---|---|---|---|
| runtime_container_limits.runner: live /proc/self/limits RLIMIT_NOFILE + self cgroup cpu.max/memory.max (never hard-coded; unknown → null) | adapters/runtime-container-limits.ts → result-printer.ts emitMachineReadableResult | runtime-container-limits.test.ts (runner-from-proc, stale-100000-drift, unreadable→nulls) | PASS |
| runtime_container_limits DUT services: launcher-provided env (NCHAN*/NCHAN2*/REDIS_* CPU_MAX_QUOTA/PERIOD, MEMORY_GB, NOFILE_SOFT/HARD); compose.evidence-100k.yaml exports them per service | adapters/runtime-container-limits.ts serviceLimitsFromEnv(); compose.evidence-100k.yaml env blocks | runtime-container-limits.test.ts (env resolution, null-when-unknown) | PASS |
| contract_version: one canonical producer for single/evidence/shard/global/campaign outputs | domain/active-contract.ts ACTIVE_CONTRACT_VERSION | runtime-container-limits.test.ts canonical-source tests; contract-governance.test.ts; defect-publisher-correctness.test.ts machine-JSON assertion | PASS |

## §3.16 Cross-run null preservation

| Metric | Source File | Aggregation Rule | Status |
|---|---|---|---|
| nchan_cpu_percent_peak: any null → aggregate null | evidence-suite.ts | anyNchanCpuNull | PASS |
| redis_cpu_percent_peak: any null → aggregate null | evidence-suite.ts | anyRedisCpuNull | PASS |
| resource_cpu_percent_peak: any null → aggregate null | evidence-suite.ts | anyResourceCpuNull | PASS |
| Mandatory null at evidence scale → campaign INCONCLUSIVE | result-classifier.ts | mandatory_metric check | PASS |

## §3.17 Contract resource-envelope consistency

| Component | Contract §O | compose.yaml | Classifier Threshold | Status |
|---|---|---|---|---|
| nchan-primary | 4 CPU / 8 GB | memory: 8G | nchan_memory_mb_peak < 7000 MB | PASS |
| nchan-2 (replacement) | 4 CPU / 4 GB | memory: 4G | (cross-node only) | PASS |
| redis | 2 CPU / 2 GB | memory: 2G | redis_memory_mb_peak < 1800 MB | PASS |
| runner | 8 CPU / 8 GB | memory: 8G | (generator) | PASS |

## §3.2.A-I Coordinated multi-shard experiment (global coordinator)

| Rule | Implementation | Focused test | Status |
|---|---|---|---|
| One frozen run ID / seed / global target issued at registration | global-coordinator.ts register() | global-coordinator.test.ts "rejects inconsistent seeds...", adversarial "binds every barrier receipt..." | PASS |
| Phase barriers release only when every registered shard arrives | GlobalExperimentCoordinator.arrive() | "does not release a phase until every shard reaches the same barrier" | PASS |
| A shard cannot skip an earlier phase boundary | arrive() ordering check | adversarial "detects a shard skipping an earlier phase boundary" | PASS |
| Global abort propagates to shards waiting at barriers | abort() rejects pending barriers | "propagates a global abort..." + adversarial "keeps the first abort reason..." | PASS |
| Exactly one authoritative publisher; non-owner publishing invalidates | publisher_owner registration, ctx.publisherEnabled, buildGlobalResult non-owner check | adversarial "flags non-owner shards that published workload" | PASS |
| Aggregate active concurrency from time-aligned shard samples (not summed peaks) | alignSamples() bucketing, CoordinatedShardClient.startSampling(pool.size) | "computes aligned concurrency instead of summing unrelated shard peaks" + adversarial "never sums peaks from buckets where a shard is missing" | PASS |
| Cross-phase buckets excluded from aligned evidence | alignSamples() phases.size check | adversarial "excludes cross-phase buckets from aligned concurrency evidence" | PASS |
| Aligned attempt/establishment/failure rates from counter deltas | alignSamples() delta computation | "computes aligned concurrency... establishments_per_sec" assertion | PASS |
| Global histograms merged from populations; percentiles recomputed | mergeHistograms() + histogramSummary() | "merges actual histogram populations and recomputes global percentiles" + adversarial merge tests | PASS |
| Local targets must sum to the global target | buildGlobalResult() sum check | adversarial "marks the aggregate invalid when local targets do not sum..." | PASS |
| Per-shard source-port headroom validated; failure invalidates aggregate | topology-preflight.ts sourcePortHeadroom + ShardValidity.source_port_headroom_valid | adversarial "treats a failed per-shard source-port headroom flag as invalidating" | PASS |
| Shard-local verdicts can never produce a global ACCEPT alone | submitResult scope guard + aligned-peak >= target gate | adversarial "prevents a shard-local direct/global acceptance claim", "does not let a single 28k-scale shard verdict stand in..." | PASS |
| Missing shard result → INCONCLUSIVE (no partial global verdict) | buildGlobalResult() completeness checks | adversarial "returns INCONCLUSIVE when a shard never submits a result" | PASS |
| Correctness counters summed across shards; nonzero → REJECT | buildGlobalResult() counter aggregation | adversarial "reports REJECT when any correctness counter is nonzero across shards" | PASS |
| Generator/environment invalidity → INCONCLUSIVE; healthy-generator capacity deficit → REJECT | buildGlobalResult() verdict logic | "returns INCONCLUSIVE for generator/environment invalidity and REJECT for healthy DUT capacity failure" | PASS |

## §3.2.H/§3.11.G/§3.12.D-E Coordinator executable path and campaign provenance

| Rule | Implementation | Focused test | Status |
|---|---|---|---|
| RUN_MODE=coordinated-shard selects coordinated path | experiment-config.ts loadConfig | evidence-suite.test.ts §3.3 "100k shards use RUN_MODE=coordinated-shard..." | PASS |
| compose.evidence-100k.yaml runs one coordinator service + 4 shards with COORDINATOR_URL | compose.evidence-100k.yaml coordinator + runner-shard-0..3 | evidence-suite.test.ts §3.3 assertions (coordinated-shard, no independent campaigns, COORDINATOR_URL present) | PASS |
| Shards register, sample aligned state, barrier per phase, submit typed results | main.ts CoordinatedShardClient wiring (register/startSampling/phaseBarrier/submitResult) | global-coordinator.test.ts + adversarial suite (typed result contract enforced at submitResult) | PASS |
| One global machine-readable result emitted by the coordinator (not per-shard) | coordinator-server.ts persistGlobalResult() → GLOBAL_RESULT_PATH + stdout | global-coordinator.test.ts "produces one global ACCEPT..." (aggregate_scope=simultaneous_global_run) | PASS |
| Campaign-level provenance: participating shard IDs, validity, histogram provenance, verdict, direct-accept eligibility | GlobalExperimentResult fields | global-coordinator.test.ts assertions on scope/publisher_owner_shard_id/histograms/global_direct_accept_eligible | PASS |
| Cross-shard aggregation is separate from repeated-run aggregation | alignSamples()/mergeHistograms() vs evidence-suite.ts aggregateRuns() | distinct modules + tests in both files | PASS |
| Shared DUT resources observed once (publisher-owner), not summed across shards | buildGlobalResult() resources from ownerResult | "produces one global ACCEPT..." resources.nchan assertion | PASS |
| Final 100k-scale measured verdict remains Milestone 3 | reduced-scale machinery proof only; no M3 campaign executed | — (by design; see gap doc §5/§8) | PASS |
| Reduced end-to-end HTTP integration: real coordinator server + 2 HTTP shard clients complete a full barrier lifecycle and persist one ACCEPT global result | coordinator-server.ts + coordinator-client.ts | coordinator-http-integration.test.ts "registers shards over HTTP..." (exit code 0, persisted global-result.json verified) | PASS |
| One shard's abort rejects other shards' subsequent barriers over HTTP | coordinator.abort → pending/rejected barriers | coordinator-http-integration.test.ts "aborts the whole experiment when one shard reports failure" | PASS |

## §3.3 Nginx worker RLIMIT_NOFILE preflight

| Rule | Implementation | Focused test | Status |
|---|---|---|---|
| Actual Nginx container FD limits read from /preflight API (not runner's /proc/self/limits) | topology-preflight.ts nginxFdLimits parameter + NginxPreflight.fd_soft_limit/hard_limit | topology-preflight.ts test with explicit Nginx FD limits | PASS |
| Runner-vs-Nginx CPU coupling removed | topology-preflight.ts: no cpuQuota < nginxWorkers warning | code inspection | PASS |
| Control server /preflight reads Nginx container's /proc/self/limits | control-server.js lines 131-140 | infrastructure-contract.test.ts | PASS |

## §3.9 Per-service CPU normalization with independent periods

| Rule | Implementation | Focused test | Status |
|---|---|---|---|
| Nchan cpu_max_period from control server /metrics | control-server.js cpu_max_period field + cgroup-resource-monitor.ts nchanCpuMaxPeriod | control-server metrics test | PASS |
| Redis cpu_max_period from env var | REDIS_CPU_MAX_PERIOD env + cgroup-resource-monitor.ts redisCpuMaxPeriod | code inspection | PASS |
| Per-service effective_cores = min(quota/period, cpuset) | main.ts + evidence-suite.ts: separate nchanCpuPeriod/redisCpuPeriod | code inspection | PASS |
| Runner CPU normalized by runner's own period; Nchan by Nchan's; Redis by Redis's | main.ts lines 456-465, evidence-suite.ts lines 400-412 | code inspection | PASS |

## §3.14 Per-scenario active population output

| Rule | Implementation | Focused test | Status |
|---|---|---|---|
| Surge active population in machine-readable JSON | main.ts ctx._surgeHealth wiring + result-printer.ts surge_active_population | code inspection | PASS |
| Reconnect active population in machine-readable JSON | main.ts ctx._reconnectHealth wiring + result-printer.ts reconnect_health | code inspection | PASS |
| Late-join active population wired in single-run mode | main.ts ctx._lateJoinActivePopulation wiring | code inspection | PASS |
| Burst active population wired in single-run mode | main.ts ctx._burstActivePopulation wiring | code inspection | PASS |
| Slow-consumer active population wired in single-run mode | main.ts ctx._slowConsumerActivePopulation wiring | code inspection | PASS |
| Restart active population wired in single-run mode | main.ts ctx._restartActivePopulation wiring | code inspection | PASS |
| Per-scenario detail strings include active_start/peak/end | burst.ts, late-join.ts, slow-consumer.ts, nchan-restart.ts detail strings | code inspection | PASS |

## §3.17-§3.19 Source-port safety margin + commit identity + documentation

| Rule | Implementation | Focused test | Status |
|---|---|---|---|
| Per-shard target 25000 (safe within ~28k ephemeral range) | compose.evidence-100k.yaml TARGET_CONNECTIONS=25000 | code inspection | PASS |
| GIT_COMMIT_SHA required (no unknown fallback) | compose files: ${GIT_COMMIT_SHA:?Set via: ...}, Dockerfile ARG without default | code inspection | PASS |
| Traceability matrix covers §3.3/§3.9/§3.14 | This file | — | PASS |

## Blocking status

| Row | BLOCKED items | Reason |
|---|---|---|
| (none) | — | All rows PASS |

**Total: 0 BLOCKED rows, 0 unmapped normative requirements.**
