# Parameter Explainability Ledger (§AI / §6.44)

Active contract: `internal_docs/LIVE_MATCH_CENTRE_POC_EXPERIMENT_CONTRACT_v2_0_5.md` (both v2.0.4 documents are historical/superseded).

Every result-affecting non-assignment constant has a value, unit, classification, rationale, and usage location.

## Frozen Experiment Parameters

| Parameter | Value | Unit | Classification | Rationale | Where Used |
|---|---|---|---|---|---|
| GLOBAL_TARGET (coordinated evidence) | 100000 | connections | ASSIGNMENT_FACT | 100,000 simultaneous global viewers | compose.evidence-100k.yaml, global-coordinator.ts |
| TARGET_CONNECTIONS (coordinated shard) | 25000 | connections/shard | DERIVED_VALUE | 4 × 25,000 = 100,000 while preserving frozen source-port reserves | compose.evidence-100k.yaml, topology-preflight.ts |
| TARGET_CONNECTIONS (legacy repeated single-runner evidence) | 100000 | connections | HISTORICAL_CONTRACT | v2.0.3 cross-run path; it is not direct global eligibility under the active v2.0.5 contract | compose.evidence.yaml, evidence-suite.ts |
| TARGET_CONNECTIONS (smoke) | 100 | connections | PLANNING_ASSUMPTION | Scaled-down for fast iteration; exercises same logic | compose.yaml, experiment-config.ts |
| WARMUP_SECONDS (evidence) | 30 | s | PLANNING_ASSUMPTION | Sufficient for 60k connections + events to stabilize | compose.evidence.yaml |
| WARMUP_SECONDS (smoke) | 5 | s | PLANNING_ASSUMPTION | Proportional reduction for 100-connection smoke | compose.yaml |
| MEASURE_SECONDS (evidence) | 120 | s | PLANNING_ASSUMPTION | 2 minutes of steady-state measurement at peak | compose.evidence.yaml |
| MEASURE_SECONDS (smoke) | 10 | s | PLANNING_ASSUMPTION | Proportional reduction for smoke | compose.yaml |
| BURST_SECONDS (evidence) | 30 | s | PLANNING_ASSUMPTION | Sufficient burst duration to saturate fan-out | compose.evidence.yaml |
| BURST_SECONDS (smoke) | 5 | s | PLANNING_ASSUMPTION | Proportional reduction for smoke | compose.yaml |
| COOLDOWN_SECONDS (evidence) | 10 | s | PLANNING_ASSUMPTION | Post-burst drain before reconnect phase | compose.evidence.yaml, experiment-config.ts |
| COOLDOWN_SECONDS (smoke) | 3 | s | PLANNING_ASSUMPTION | Proportional reduction for smoke | compose.yaml, experiment-config.ts |
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
| Surge duration | 120000 | ms | ASSIGNMENT_FACT | 120-second absolute-deadline surge window; no arbitrary 80% rate threshold | connection-surge.ts |
| Surge duration (smoke) | 5000 | ms | VALIDATION_SCALE | Short validation using the same scenario path; never direct evidence eligible | compose.yaml, experiment-config.ts |
| Surge batch count | 24 | count | DERIVED_VALUE | 120s / 5s per batch = 24 batches | connection-surge.ts:19-20 |
| Connection batch size | 50 | count | PLANNING_ASSUMPTION | HTTP connection batch size for backpressure control | connection-pool.ts:132 |
| Connection batch delay | 50 | ms | PLANNING_ASSUMPTION | 50ms pause between connection batches | connection-pool.ts:163 |
| Reconnect fraction | 10% | percentage | PLANNING_ASSUMPTION | 10% of connections disconnected for reconnect test | reconnect.ts (scenario) |
| Reconnect wait duration | 2000 | ms | PLANNING_ASSUMPTION | 2s disruption interval before reconnect | reconnect.ts (scenario) |
| Source-port reconnect/TIME_WAIT allowance | 10% of shard target | sockets | PLANNING_ASSUMPTION | Reserves ports for the frozen reconnect cohort and TIME_WAIT | topology-preflight.ts |
| Source-port non-viewer allowance | 64 | sockets/shard | PLANNING_ASSUMPTION | Publisher, Redis/control and other outbound sockets | topology-preflight.ts |
| Source-port safety margin | 512 | ports/shard | PLANNING_ASSUMPTION | Explicit margin beyond viewers and known overhead | topology-preflight.ts |
| Nginx per-worker FD reserve | 256 | FDs/worker | PLANNING_ASSUMPTION | Internal/listening/upstream descriptors are excluded from SSE capacity | control-server.js, topology-preflight.ts |

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
| nchan-primary | 4 | 8 GB | 200,000 | PLANNING_ASSUMPTION | Frozen DUT envelope (contract §6) |
| nchan-2 (evidence only) | 4 | 4 GB | 200,000 | PLANNING_ASSUMPTION | Cross-node replacement test resource |
| redis | 2 | 2 GB | — | PLANNING_ASSUMPTION | Local Redis for shared history |
| runner shard (×4) | 8 each | 8 GB each | 120,000 each | PLANNING_ASSUMPTION | Each shard supports 25k viewers plus reconnect and generator work |

## Latency and Histogram Parameters

| Parameter | Value | Unit | Classification | Rationale | Where Used |
|---|---|---|---|---|---|
| Fan-out latency threshold | 500 | ms | ASSIGNMENT_FACT | Goal p95 ≤ 2s; routine p95 ≤ 5s; fan-out threshold frozen at 500ms | result-classifier.ts:47 |
| Late-join latency threshold | 2000 | ms | ASSIGNMENT_FACT | Full history within 2s (assignment §2.0) | result-classifier.ts:53 |
| Burst fan-out threshold | 1000 | ms | PLANNING_ASSUMPTION | Relaxed threshold for burst-phase peak load | result-classifier.ts:83 |
| Latency histogram max | 30000 | ms | PLANNING_ASSUMPTION | Overflow bucket; ≥30s latencies counted but not discarded (§T) | connection-pool.ts:94 |
| Latency invalid threshold | 0 | ms | PROTOCOL_REQUIREMENT | Negative latency → timing validity failure (§T) | connection-pool.ts:91 |
| Fan-out sample count | dynamic | count | DERIVED_VALUE | Total valid fan-out samples; overflow counted separately (§4.25) | metrics-recorder.ts |
| Late-join sample count | dynamic | count | DERIVED_VALUE | Total valid late-join samples; overflow counted separately (§4.25) | metrics-recorder.ts |

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
| Slow pacing tolerance | 1600–2400 | ms median/client | PLANNING_ASSUMPTION | Frozen ±20% band around the intended 2-second application rate | slow-consumer.ts |
| Dedicated healthy baseline | 3000 | ms | PLANNING_ASSUMPTION | Isolates immediately-before-slow latency from prior phases | slow-consumer.ts |
| Slow recovery timeout | 10000 | ms | PLANNING_ASSUMPTION | Allows replay/drain after application throttling stops | slow-consumer.ts |
| Slow replay recovery | ≥95% | percentage | PLANNING_ASSUMPTION | Requires material recovery of independently measured backlog | slow-consumer.ts, result-classifier.ts |
| Slow max Nchan growth | <50 MiB and <10% | bytes/fraction | PLANNING_ASSUMPTION | Both absolute and relative run growth must be bounded | slow-consumer.ts |
| Slow max recovery delta | <50 MiB | bytes | PLANNING_ASSUMPTION | Post-throttle memory must return near baseline | slow-consumer.ts |
| Meaningful memory growth | >1 MiB and >5% | bytes/fraction | PLANNING_ASSUMPTION | Excludes ordinary memory noise from backpressure attribution | slow-consumer.ts |

## Coordinated Global Parameters

| Parameter | Value | Unit | Classification | Rationale | Where Used |
|---|---|---|---|---|---|
| SHARD_TOTAL | 4 | shards | DERIVED_VALUE | Four distinct source network namespaces reach exactly 100k at 25k each | compose.evidence-100k.yaml |
| Aligned sample bucket | 1000 | ms | PLANNING_ASSUMPTION | Aggregates simultaneous concurrency and counter deltas without summing historical peaks | global-coordinator.ts |
| Live shard sample interval | 250 | ms | PLANNING_ASSUMPTION | Supplies several observations per aligned bucket | coordinator-client.ts |
| Publisher owners | exactly 1 | shard | PROTOCOL_REQUIREMENT | Preserves one authoritative logical event workload | global-coordinator.ts, main.ts |
| Restart replay depth | 8 | accepted events/path | PLANNING_ASSUMPTION | Small deterministic non-empty range for literal and replacement paths | nchan-restart.ts |
| Restart required membership | every integer in `[expected_first_seq, expected_last_seq]` exactly once and in order | canonical sequence set/path | PROTOCOL_REQUIREMENT | Prevents later/out-of-range frames from substituting for a missing frozen event; total frame count is not completeness proof | nchan-restart.ts (`evaluateRestartRequiredRange`) |
| Restart out-of-range allowance | 0 before; 0 after | events/path | PROTOCOL_REQUIREMENT | An out-of-range event invalidates the path and cannot increase `received_required_count` | nchan-restart.ts, restart-exact-range.test.ts |
| Late-join deterministic prefill | 500 | accepted events | PLANNING_ASSUMPTION | Meaningful deterministic retained-history extension | late-join.ts |
| Late-join live margin | 120 | events | DERIVED_VALUE | 60 events/s × 2-second catch-up bound | late-join.ts |
| Late-join safety margin | 256 | events | PLANNING_ASSUMPTION | Guards live-arrival and scheduling variation | late-join.ts |
| Scenario active minimum | 100% target; reconnect 90% | percentage | PROTOCOL_REQUIREMENT | Peak claims remain at target; reconnect permits its deliberate 10% cohort outage | global-coordinator.ts |
| Coordinated campaign runs | 3 minimum, 8 maximum | global runs | PLANNING_ASSUMPTION | Repeats complete simultaneous-global experiments without mixing shard/run dimensions | run-evidence-100k.sh, global-campaign.ts |
| Coordinated campaign dispersion | 15% | sample coefficient of variation (`n-1`) | PLANNING_ASSUMPTION | Frozen stability bound across global active peak and latency p95 metrics | global-campaign.ts |

## Machine Provenance Sources

| Field | Resolved source | Validity rule | Where Emitted |
|---|---|---|---|
| `contract_version` | `ACTIVE_CONTRACT_VERSION` in `domain/active-contract.ts` | every single/shard/global/campaign output must equal canonical v2.0.5 | result-printer, evidence-suite, main shard result, global coordinator, campaign |
| runner nofile soft/hard | current process `/proc/self/limits` | parsed actual values; unknown is explicit `null`, never a stale profile constant | `runtime_container_limits.runner`, shard generator resources |
| service CPU/memory/nofile envelope | launch-profile environment populated beside Compose service limits | selected profile and emitted values must agree; unavailable values are explicit `null` | `runtime_container_limits.nchan`, `.nchan2`, `.redis` |
| Nginx worker nofile soft/hard | Nchan control process scan of `/proc/<worker>/limits` | actual worker values required for Nginx capacity proof | Nginx preflight, shard Nchan resources |
| source commit | launch script `git rev-parse HEAD` | non-null full 40-hex SHA and identical across coordinated inputs | every result scope |
| target/topology/scope | resolved run config and coordinator registration | 25,000 × 4 = 100,000; one publisher owner; shard/global/campaign scopes cannot be confused | shard/global/campaign provenance |

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
