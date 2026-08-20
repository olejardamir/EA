# Parameter Explainability Ledger (§AI / §6.44)

Every result-affecting non-assignment constant has a value, unit, classification, rationale, and usage location.

## Frozen Experiment Parameters

| Parameter | Value | Unit | Classification | Rationale | Where Used |
|---|---|---|---|---|---|
| TARGET_CONNECTIONS (evidence) | 100000 | connections | ASSIGNMENT_FACT | 100,000 concurrent viewers (assignment §2.0) | compose.evidence.yaml, experiment-config.ts |
| TARGET_CONNECTIONS (smoke) | 100 | connections | PLANNING_ASSUMPTION | Scaled-down for fast iteration; exercises same logic | compose.yaml, experiment-config.ts |
| WARMUP_SECONDS (evidence) | 30 | s | PLANNING_ASSUMPTION | Sufficient for 60k connections + events to stabilize | compose.evidence.yaml |
| WARMUP_SECONDS (smoke) | 5 | s | PLANNING_ASSUMPTION | Proportional reduction for 100-connection smoke | compose.yaml |
| MEASURE_SECONDS (evidence) | 120 | s | PLANNING_ASSUMPTION | 2 minutes of steady-state measurement at peak | compose.evidence.yaml |
| MEASURE_SECONDS (smoke) | 10 | s | PLANNING_ASSUMPTION | Proportional reduction for smoke | compose.yaml |
| BURST_SECONDS (evidence) | 30 | s | PLANNING_ASSUMPTION | Sufficient burst duration to saturate fan-out | compose.evidence.yaml |
| BURST_SECONDS (smoke) | 5 | s | PLANNING_ASSUMPTION | Proportional reduction for smoke | compose.yaml |
| COOLDOWN_SECONDS | 10 | s | PLANNING_ASSUMPTION | Post-burst drain before reconnect phase | compose.evidence.yaml, experiment-config.ts |
| Backpressure duration | 15 | s | PLANNING_ASSUMPTION | Duration of slow-consumer backpressure observation | slow-consumer.ts (BACKPRESSURE_DURATION_MS constant) |
| SEED | 42 | — | PLANNING_ASSUMPTION | Deterministic base seed; evidence suite derives 42+i | experiment-config.ts |
| SLOW_CONSUMER_FRACTION | 0.05 | fraction | ASSIGNMENT_FACT | 5% of viewers as slow consumers (assignment §20) | experiment-config.ts, slow-consumer.ts |
| LOBBY_FRACTION | 0.02 | fraction | PLANNING_ASSUMPTION | ~2% of connections are lobby viewers | experiment-config.ts |
| MATCH_COUNT | 8 | count | ASSIGNMENT_FACT | 8 concurrent live matches (assignment §2.0) | event.ts MATCH_IDS |

## Workload Generation Parameters

| Parameter | Value | Unit | Classification | Rationale | Where Used |
|---|---|---|---|---|---|
| Steady match event rate | 9 | events/s | PLANNING_ASSUMPTION | ~9 match events/s + ~1 lobby/s = ~10 total (assignment §2.0 says ~10 total) | match-event-publisher.ts:117 |
| Burst match event rate | 50 | events/s | ASSIGNMENT_FACT | ~50 events/s burst (assignment §2.0) | match-event-publisher.ts:117 |
| Lobby update interval | 1000 | ms | PLANNING_ASSUMPTION | 1 lobby update/s (assignment §2.0: ~10 total includes lobby) | match-event-publisher.ts:144 |
| Steady rate jitter | 30% | percentage | PLANNING_ASSUMPTION | ±30% random jitter on inter-event interval to avoid phase-lock | match-event-publisher.ts:119 |
| Burst hot-match concentration | 80% | percentage | ASSIGNMENT_FACT | 80% of burst events to match-001 (contract §14) | match-event-publisher.ts:77 |
| Burst other-match concentration | 20/7% each | percentage | DERIVED_VALUE | Remaining 20% split evenly across 7 other matches | match-event-publisher.ts:77 |

## Connection Parameters

| Parameter | Value | Unit | Classification | Rationale | Where Used |
|---|---|---|---|---|---|
| Base connection fraction | 60% | percentage | ASSIGNMENT_FACT | 60% base → 40% surge (assignment §2.0: +40k within 2 min) | warmup.ts:15 |
| Surge duration | 120000 | ms | ASSIGNMENT_FACT | 120-second surge window (assignment §2.0) | connection-surge.ts:18 |
| Surge batch count | 24 | count | DERIVED_VALUE | 120s / 5s per batch = 24 batches | connection-surge.ts:19-20 |
| Connection batch size | 50 | count | PLANNING_ASSUMPTION | HTTP connection batch size for backpressure control | connection-pool.ts:132 |
| Connection batch delay | 50 | ms | PLANNING_ASSUMPTION | 50ms pause between connection batches | connection-pool.ts:163 |
| Reconnect fraction | 10% | percentage | PLANNING_ASSUMPTION | 10% of connections disconnected for reconnect test | reconnect.ts (scenario) |
| Reconnect wait duration | 2000 | ms | PLANNING_ASSUMPTION | 2s disruption interval before reconnect | reconnect.ts (scenario) |

## Nchan Configuration Parameters

| Parameter | Value | Unit | Classification | Rationale | Where Used |
|---|---|---|---|---|---|
| Match buffer length | 5000 | messages | PROTOCOL_REQUIREMENT | Retains ~9 min of history at ~9 events/s; exceeds 90-min need only with message_timeout | nchan.conf:58 |
| Lobby buffer length | 1 | message | PROTOCOL_REQUIREMENT | Latest-state-only lobby semantics (assignment: buffer length 1) | nchan.conf:47,106 |
| Message timeout | 2h | seconds | PLANNING_ASSUMPTION | Long enough that no test history expires during a run | nchan.conf:46,54 |
| Shared memory | 64m | bytes | PLANNING_ASSUMPTION | Sufficient for 8 match channels + lobby with 5000 buffer each | nchan.conf:28 |
| EventSource ping interval | 15 | seconds | PROTOCOL_REQUIREMENT | Nchan heartbeat; must be > socket timeout (§AF) | nchan.conf:80,108 |
| Redis connect timeout | 5s | seconds | PLANNING_ASSUMPTION | Reasonable Redis connection timeout | nchan.conf:24 |
| Redis command timeout | 5s | seconds | PLANNING_ASSUMPTION | Reasonable Redis command timeout | nchan.conf:25 |
| worker_processes | 4 | count | DERIVED_VALUE | Matches 4-CPU container quota (§BC) | nchan.conf:2 |
| worker_connections | 32768 | count | DERIVED_VALUE | 4 workers × 32768 = 131072 max connections; explicit headroom above 100k target (Redis/FD/control FDs consume non-viewer descriptors) | nchan.conf:7 |

## Resource Envelope

| Component | CPU | Memory | File Descriptors | Classification | Rationale |
|---|---|---|---|---|---|
| nchan-primary | 4 | 4 GB (evidence) / 8 GB (smoke) | 200,000 | ASSIGNMENT_FACT | Frozen DUT envelope (contract §6) |
| nchan-2 (evidence only) | 4 | 4 GB | 200,000 | PLANNING_ASSUMPTION | Cross-node replacement test resource |
| redis | 2 | 2 GB | — | PLANNING_ASSUMPTION | Local Redis for shared history |
| runner | 8 | 8 GB | 100,000 | PLANNING_ASSUMPTION | Must support 100k SSE connections + metrics |

## Latency and Histogram Parameters

| Parameter | Value | Unit | Classification | Rationale | Where Used |
|---|---|---|---|---|---|
| Fan-out latency threshold | 500 | ms | ASSIGNMENT_FACT | Goal p95 ≤ 2s; routine p95 ≤ 5s; fan-out threshold frozen at 500ms | result-classifier.ts:47 |
| Late-join latency threshold | 2000 | ms | ASSIGNMENT_FACT | Full history within 2s (assignment §2.0) | result-classifier.ts:53 |
| Burst fan-out threshold | 1000 | ms | PLANNING_ASSUMPTION | Relaxed threshold for burst-phase peak load | result-classifier.ts:83 |
| Latency histogram max | 30000 | ms | PLANNING_ASSUMPTION | Overflow bucket; ≥30s latencies counted but not discarded (§T) | connection-pool.ts:94 |
| Latency invalid threshold | 0 | ms | PROTOCOL_REQUIREMENT | Negative latency → timing validity failure (§T) | connection-pool.ts:91 |

## Generator Health Thresholds

| Parameter | Value | Unit | Classification | Rationale | Where Used |
|---|---|---|---|---|---|
| Generator CPU saturation | 90 | % | PLANNING_ASSUMPTION | Above 90% CPU → generator may be bottleneck, not DUT | result-classifier (classifyResult) |
| Event-loop delay saturation | 100 | ms p99 | PLANNING_ASSUMPTION | Above 100ms event-loop p99 → generator saturated | result-classifier (classifyResult) |
| Event-loop delay timing validity | 200 | ms p99 | PLANNING_ASSUMPTION | Above 200ms → timing measurements unreliable | result-classifier (classifyResult) |

## Evidence Suite Parameters

| Parameter | Value | Unit | Classification | Rationale | Where Used |
|---|---|---|---|---|---|
| MIN_RUNS | 3 | count | PLANNING_ASSUMPTION | Minimum runs for cross-run variance check | evidence-suite.ts:62 |
| MAX_RUNS | 8 | count | PLANNING_ASSUMPTION | Maximum runs before declaring INCONCLUSIVE on variance | evidence-suite.ts:63 |
| Dispersion threshold | 15% | CV | PLANNING_ASSUMPTION | Coefficient of variation ≤ 15% for stable dispersion | evidence-suite.ts:64 |
| Max run timeout | 600000 | ms | PLANNING_ASSUMPTION | 10-minute hard limit per run to prevent infinite hangs | evidence-suite.ts:115 |

## Slow Consumer Parameters

| Parameter | Value | Unit | Classification | Rationale | Where Used |
|---|---|---|---|---|---|
| Slow event interval | 2000 | ms | ASSIGNMENT_FACT | ~1 event per 2 seconds (contract §20 / assignment §U) | slow-consumer.ts:8 |
| Backpressure duration | 15000 | ms | PLANNING_ASSUMPTION | 15s observation window for backpressure effects | slow-consumer.ts:6 |
| Latency degradation threshold | 5% | percentage | PLANNING_ASSUMPTION | Healthy clients must not degrade >5% during slow-consumer phase | slow-consumer.ts:7 |

## Publisher Parameters

| Parameter | Value | Unit | Classification | Rationale | Where Used |
|---|---|---|---|---|---|
| Publish jitter | 30% | percentage | PLANNING_ASSUMPTION | ±30% random jitter to prevent phase-locking across match channels | match-event-publisher.ts:119 |
| Min timer interval | 10 | ms | PLANNING_ASSUMPTION | Prevent timer collapse under heavy jitter | match-event-publisher.ts:120 |

## Resolved Canonical Configuration Snapshot

All resolved values for a smoke run:

```
RUN_PROFILE: smoke
TARGET_CONNECTIONS: 100
WARMUP_SECONDS: 5
MEASURE_SECONDS: 10
BURST_SECONDS: 5
COOLDOWN_SECONDS: 3
SEED: 42
SLOW_CONSUMER_FRACTION: 0.05
LOBBY_FRACTION: 0.02
BACKPRESSURE_DURATION_MS: 15000
NCHAN_PUB_URL: http://localhost:8080
NCHAN_SUB_URL: http://localhost:8081
REDIS_URL: redis://localhost:6379
```

All resolved values for an evidence run:

```
RUN_PROFILE: evidence
TARGET_CONNECTIONS: 100000
WARMUP_SECONDS: 30
MEASURE_SECONDS: 120
BURST_SECONDS: 30
COOLDOWN_SECONDS: 10
SEED: 42
SLOW_CONSUMER_FRACTION: 0.05
LOBBY_FRACTION: 0.02
BACKPRESSURE_DURATION_MS: 15000
NCHAN_PUB_URL: http://localhost:8080
NCHAN_SUB_URL: http://localhost:8081
NCHAN2_SUB_URL: http://localhost:18081
REDIS_URL: redis://localhost:6379
```
