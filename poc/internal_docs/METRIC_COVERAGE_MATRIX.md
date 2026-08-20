# Metric Coverage Matrix (§S)

Purpose: Verify every required metric record from the frozen contract and Milestone 2 requirements is collected, sourced, and classified.

| Metric | Source | Unit | Phase | Collection Method | Validity Rule | Classifier Usage | Test Coverage |
|---|---|---|---|---|---|---|---|
| fan_out_latency_p95_ms | ConnectionPool.handleMessage | ms | steady | Date.now() delta: publish_timestamp → SSE frame arrival | All samples recorded; invalid/overflow counted separately | REJECT if > 500ms | defect-classifier, result-classifier |
| fan_out_latency_p50_ms | ConnectionPool.handleMessage | ms | steady | Same as p95 | All samples recorded | Informational | result-classifier |
| fan_out_latency_p99_ms | ConnectionPool.handleMessage | ms | steady | Same as p95 | All samples recorded | Informational | result-classifier |
| fan_out_latency_max_ms | ConnectionPool.handleMessage | ms | steady | Same as p95 | All samples recorded | Informational | result-classifier |
| late_join_p95_ms | LateJoinScenario | ms | late-join | Wall-clock from HTTP connect initiation to caught-up | T0 = before HTTP connection | REJECT if > 2000ms | defect-classifier |
| connections_established | ConnectionPool | count | all | Incremented on successful SSE connect | Must >= targetConnections | REJECT if < target | defect-connection-pool |
| connections_attempted | ConnectionPool | count | all | Incremented on each connect attempt | Monotonic | Informational | defect-connection-pool |
| connection_failures | ConnectionPool | count | all | Incremented on connect error/timeout | >= 0 | Informational | defect-connection-pool |
| connections_dropped | ConnectionPool | count | all | Incremented on unexpected disconnect | >= 0 | Informational | defect-connection-pool |
| active_connections_peak | BoundedMetricsRecorder | count | all | setActiveConnections() on connect/disconnect | >= 0 | Informational | defect-measurement |
| events_received | BoundedMetricsRecorder | count | all | Incremented per SSE frame | >= 0 | Informational | defect-measurement |
| expected_fan_deliveries | BoundedMetricsRecorder | count | all | Sum of per-channel subscriber counts at publish time | >= events_received | Informational | defect-measurement |
| missing_sequences | SequenceTracker | count | all | Detected via monotonic seq check | = 0 for ACCEPT | REJECT if > 0 | result-classifier |
| duplicates | SequenceTracker | count | all | Detected via seq equality | = 0 for ACCEPT | REJECT if > 0 | result-classifier |
| out_of_order | SequenceTracker | count | all | Detected via seq decrease | = 0 for ACCEPT | REJECT if > 0 | result-classifier |
| reconnect_gaps | SequenceTracker | count | reconnect | Detected during reconnect replay | = 0 for ACCEPT | REJECT if > 0 | result-classifier |
| reconnect_duplicates | SequenceTracker | count | reconnect | Detected during reconnect replay | = 0 for ACCEPT | REJECT if > 0 | result-classifier |
| reconnect_order_violations | SequenceTracker | count | reconnect | Detected during reconnect replay | = 0 for ACCEPT | REJECT if > 0 | result-classifier |
| burst_fan_out_p95_ms | BurstScenario | ms | burst | Same method as steady fan_out | All samples recorded | REJECT if > 1000ms | result-classifier |
| slow_consumer_disconnects | ConnectionPool | count | slow-consumer | Incremented on slow-consumer disconnect | > 0 for ACCEPT | INCONCLUSIVE if = 0 (§30), not REJECT | result-classifier |
| non_slow_p95_degradation_pct | SlowConsumerScenario | % | slow-compare | Compare non-slow p95 before/after slow consumer | >= 0 | REJECT if > 5% | result-classifier |
| event_loop_delay_p99_ms | perf_hooks.monitorEventLoopDelay | ms | all | Continuous histogram, 10ms resolution | < 200ms for valid timing | INCONCLUSIVE if >= 100ms | defect-measurement |
| memory_mb_peak | process.memoryUsage | MB | all | Snapshot at collection time | >= 0 | Informational | defect-scenarios |
| generator_cpu_percent_peak | process.cpuUsage | % | all | Delta CPU time / delta wall time * 100 | < 90% for healthy | INCONCLUSIVE if >= 90% | defect-scenarios |
| nchan_memory_mb_peak | N/A (external) | MB | all | null in smoke profile | < 3500 MB for ACCEPT | REJECT if >= 3500 | result-classifier (conditional) |
| redis_memory_mb_peak | Redis INFO memory | MB | all | Polled every 5s via TCP | < 1800 MB for ACCEPT | REJECT if >= 1800 | result-classifier (conditional) |
| nchan_restart_history_replay_correct | NchanRestartScenario | bool | nchan-restart | SSE replay verification | true for ACCEPT | REJECT if false | result-classifier |
| nchan_restart_missing_sequences | NchanRestartScenario | count | nchan-restart | Gap detection during replay | = 0 for ACCEPT | REJECT if > 0 | result-classifier |
| cpu_throttled_count | cgroup v2 cpu.stat | count | all | Read nr_throttled from /sys/fs/cgroup/cpu.stat | = 0 for ACCEPT | REJECT if > 0 (§BK) | new (§AC) |
| cpu_throttled_usec | cgroup v2 cpu.stat | usec | all | Read throttled_usec from /sys/fs/cgroup/cpu.stat | >= 0 | Informational | new (§AC) |
| memory_oom_events | cgroup v2 memory.events | count | all | Read oom from /sys/fs/cgroup/memory.events | = 0 for ACCEPT | Informational | new (§AC) |
| memory_oom_kill_events | cgroup v2 memory.events | count | all | Read oom_kill from /sys/fs/cgroup/memory.events | = 0 for ACCEPT | REJECT if > 0 | new (§AC) |
| memory_current_bytes | cgroup v2 memory.current | bytes | all | Read from /sys/fs/cgroup/memory.current | >= 0 | Informational | new (§AC) |
| memory_peak_bytes | cgroup v2 memory.peak | bytes | all | Read from /sys/fs/cgroup/memory.peak (may not exist) | >= 0 | Informational | new (§AC) |
| cpu_max_quota | cgroup v2 cpu.max | usec/period | all | Read from /sys/fs/cgroup/cpu.max | null = unlimited | Informational (denominator) | new (§AC) |
| memory_max_bytes | cgroup v2 memory.max | bytes | all | Read from /sys/fs/cgroup/memory.max | null = unlimited | Informational (denominator) | new (§AC) |
| generator_backlog_peak | MatchEventPublisher | count | all | In-flight publish promises (pending before POST, resolved after) | >= 0 | Informational | new (§BL) |
| lobby_subscribers | ConnectionPool | count | all | getSubscriberCount("lobby") | >= 0 | Informational | §V reporting |
| match_001_subscribers | ConnectionPool | count | all | getSubscriberCount("match-001") | >= 0 | Informational | §V reporting |
| latency_sample_count | BoundedMetricsRecorder | count | all | Incremented per valid sample | >= 0 | Informational | defect-measurement |
| latency_invalid_count | BoundedMetricsRecorder | count | all | Incremented per parse/timestamp failure | >= 0 | Informational | defect-measurement |
| latency_overflow_count | BoundedMetricsRecorder | count | all | Incremented per sample > max histogram range | >= 0 | Informational | defect-measurement |
| fan_out_sample_count | BoundedMetricsRecorder | count | all | Incremented per valid fan-out latency sample | >= 0 | Informational | defect-measurement, milestone2-gap-closure |
| fan_out_overflow_count | BoundedMetricsRecorder | count | all | Incremented per negative fan-out latency (overflow) | = 0 for ACCEPT | REJECT if > 0 | milestone2-gap-closure (§4.25) |
| late_join_sample_count | BoundedMetricsRecorder | count | late-join | Incremented per valid late-join latency sample | >= 0 | Informational | defect-measurement, milestone2-gap-closure |
| late_join_overflow_count | BoundedMetricsRecorder | count | late-join | Incremented per negative late-join latency (overflow) | = 0 for ACCEPT | REJECT if > 0 | milestone2-gap-closure (§4.25) |
| schema_validation_errors | BoundedMetricsRecorder | count | all | Incremented per event failing schema validation (missing match_id/event_type/score/clock) | = 0 for ACCEPT | REJECT if > 0 (§4.19) | defect-classifier |
| missing_transport_id | BoundedMetricsRecorder | count | all | Incremented per SSE event missing transport ID (event.id) | = 0 for ACCEPT | REJECT if > 0 (§4.19) | defect-classifier |
| publisher_attempts | NchanHttpPublisher | count | all | Incremented per publish() call | >= 0 | Informational (§BM) | defect-classifier |
| publisher_successes | NchanHttpPublisher | count | all | Incremented per 2xx response | >= 0 | Informational (§BM) | defect-classifier |
| publisher_definite_failures | NchanHttpPublisher | count | all | Non-2xx or non-timeout error | >= 0 | Informational (§BM) | defect-classifier |
| publisher_ambiguous_failures | NchanHttpPublisher | count | all | Timeout-after-connect errors | >= 0 | Informational (§BM) | defect-classifier |
| sse_parse_errors | BoundedMetricsRecorder | count | all | Incremented per malformed SSE frame | = 0 for ACCEPT | REJECT if > 0 (§BJ) | defect-classifier |
| json_parse_errors | BoundedMetricsRecorder | count | all | Incremented per JSON parse failure in handleMessage | = 0 for ACCEPT | REJECT if > 0 (§BJ) | defect-classifier |
| invalid_timestamp_count | BoundedMetricsRecorder | count | all | Incremented per NaN publish_timestamp | = 0 for ACCEPT | REJECT if > 0 (§BJ) | defect-classifier |
| surge_fan_out_p95_ms | ConnectionSurgeScenario | ms | surge | Same method as steady fan_out, delta before/after surge | All samples recorded | REJECT if > 500ms (§BH) | defect-classifier |
| surge_missing_sequences | ConnectionSurgeScenario | count | surge | Delta missing_sequences before/after surge | = 0 for ACCEPT | REJECT if > 0 (§BH) | defect-classifier |
| surge_duplicates | ConnectionSurgeScenario | count | surge | Delta duplicates before/after surge | = 0 for ACCEPT | REJECT if > 0 (§BH) | defect-classifier |
| surge_out_of_order | ConnectionSurgeScenario | count | surge | Delta out_of_order before/after surge | = 0 for ACCEPT | REJECT if > 0 (§BH) | defect-classifier |
| surge_events_received | ConnectionSurgeScenario | count | surge | Delta events_received before/after surge | >= 0 | Informational (§BH) | defect-classifier |

### Coverage notes

- **§AC**: cgroup v2 fields are null when the runtime doesn't support cgroup v2 (e.g., macOS Docker Desktop). When null, the corresponding classifier check is skipped (not INCONCLUSIVE). In Docker on Linux with cgroup v2, these fields are populated from `/sys/fs/cgroup/`.
- **§BK**: CPU throttling acceptance is `nr_throttled == 0`. If cgroup v2 is unavailable, the check is skipped. The frozen contract says "no container CPU throttling events" → REJECT if observed.
- **§BL**: Generator backlog measures in-flight publish promises. The peak value is recorded. A sustained backlog > 1000 would indicate the generator cannot keep up, but no hard threshold is currently enforced in the classifier (informational).
- **§V**: Hot-match viewer concentration is reported via `match_001_subscribers` and `lobby_subscribers`. The `hotMatchPct` in phase_publish_rates verifies ~80% of events go to match-001.
- **§BM**: Publisher acceptance stats track the Nchan HTTP publisher's attempts, successes, and failure modes. Definite failures are non-2xx responses or connection failures; ambiguous failures are timeouts-after-connect where the outcome is unknown.
- **§BJ**: Parse error accounting covers SSE framing errors (`sse_parse_errors`), JSON payload parse failures (`json_parse_errors`), and invalid timestamps (`invalid_timestamp_count`). All must be 0 for ACCEPT verdict.
- **§BH**: Surge health metrics capture the correctness impact on pre-existing viewers during the connection-surge phase. Deltas are computed by snapshotting counters before and after the surge, then computing p95 fan-out from the delta latency samples.
- **§4.19**: Schema validation and transport-ID accounting. Events missing required fields (`match_id`, `event_type`, `score`, `clock`) increment `schema_validation_errors` and are rejected before reaching latency collectors. Events missing SSE `event.id` (transport ID) increment `missing_transport_id`. Both must be zero for ACCEPT verdict.
- **§4.25**: Histogram sample count and overflow tracking. `fan_out_sample_count` and `late_join_sample_count` track total samples processed by the bounded recorder. Overflow counts (`fan_out_overflow_count`, `late_join_overflow_count`) track negative latencies, which are invalid and must be zero for ACCEPT. Very-high positive latencies are bucketed at the histogram max (not lost), so overflow only means invalid negative values.
