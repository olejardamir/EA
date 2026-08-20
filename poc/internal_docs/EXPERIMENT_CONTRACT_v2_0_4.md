# Experiment Contract v2.0.4 — Coordinated Global Evidence

Status: **FROZEN — active contract for Milestone 3**

Frozen: 2026-08-20

Scope: `poc/` coordinated 100,000-viewer experiment

## Contract lineage

- v2.0.2 is the historical initial freeze. It remains historical and is not edited.
- v2.0.3 is the historical correction contract for the single-runner evidence machinery. It remains historical and is not edited.
- v2.0.4 is the minimal successor that governs simultaneous multi-shard global evidence. Where this document changes a result-affecting v2.0.3 interpretation, v2.0.4 controls.

Milestone 2 freezes the machinery. It does **not** execute or claim the final Milestone 3 campaign.

## OLD / NEW / WHY change record

| Area | OLD | NEW | WHY |
|---|---|---|---|
| Experiment scope | Four independent shard runs | One coordinator-issued `experiment_run_id`, seed, target, lifecycle and verdict | A shard-local run cannot prove simultaneous 100k scale |
| Generator topology | Approximately 4 × 28k | Exactly 4 × 25,000, global target 100,000 | Preserve source-port headroom for TIME_WAIT and non-viewer traffic |
| Phase execution | Shards could advance independently | Every start/end boundary is a global barrier; any shard may globally abort | Align workload, concurrency and scenario evidence |
| Publisher workload | One publisher per shard | Exactly one publisher-owner shard; every non-owner publishes zero events | Prevent multiplying the frozen logical workload fourfold |
| Aggregation | Shard peaks/percentiles could be combined as summaries | One-second aligned samples, cumulative-counter deltas, lossless sparse histogram merge | Historical peaks and averaged percentiles are not global observations |
| Nginx capacity | Helper/runner `/proc/self/limits` | Actual master and worker `/proc/<pid>/limits`; usable capacity uses the minimum worker limit | Prove the DUT process limit that actually bounds SSE viewers |
| Late join | Prefill-only expected range | Full retained active-match history from sequence 1 through the frozen target head | Earlier valid same-run history is required evidence, not noise |
| Reconnect | Cohort accounting could count attempted clients | One structured record per intended client; re-established subscription and frozen target are mandatory | Remove the zero-event failed-client false PASS |
| Surge validity | Unfrozen approximate 80% sustained-rate tolerance | No arbitrary percentage tolerance; exact additions/attempts/establishments/failures and target are reported | Avoid a result-affecting rule absent from the frozen contract |
| Slow consumer | Offered equaled consumed; weak ≥1s pacing | Offered comes from accepted publisher-head deltas; every client must pace at 1.6–2.4s | Establish an independent backlog and the intended 2s model |
| Nchan memory | Container-lifetime `memory.peak` used as run peak | Run peak is max sampled `memory.current`; lifetime peak is retained separately | Prior runs must not contaminate a qualifying run |
| CPU normalization | Runner period reused for services | Each of runner, Nchan and Redis uses its own quota, period and effective cpuset; denominator is the smaller capacity | Report service utilization against the capacity actually assigned |
| Restart/replacement | Expected replay range could be empty | Publish and accept eight serialized events after the cursor, then freeze and require the exact range | A vacuous empty replay cannot prove recovery |
| Terminal attribution | Repeated terminal callbacks could increment twice | Pool removal is the exact-once guard for attribution and dropped count | One terminal connection must map to one terminal category |
| Source identity | Operator could omit `GIT_COMMIT_SHA` | Launch scripts resolve `git rev-parse HEAD`; coordinator requires one valid matching SHA | Evidence without immutable source provenance is invalid |
| Result eligibility | A shard could imply global direct acceptance | Shards are `scope=shard`, `aggregate_scope=shard`, direct eligibility false; only a valid global result may set true | Keep simultaneous-shard aggregation distinct from repeated-run aggregation |

## Frozen topology and launch paths

The final-scale topology is four runner containers with distinct bridge-network source IPs and local targets of 25,000. Nchan primary and Redis are shared DUT services. Nchan-2 is a replacement/recovery node and does not contribute primary live-viewer capacity.

Frozen source-port proof per shard for a 28,232-port range:

```text
viewer sockets                  25,000
reconnect/TIME_WAIT allowance    2,500  (10%)
non-viewer outbound sockets         64
safety margin                      512
required                         28,076
headroom                            156
```

The actual host range is read at preflight. Null or negative headroom invalidates the experiment. Nginx capacity is independently required to cover the 100,000 global target after a 256-FD reserve per actual worker.

Normal launch paths are:

```text
./run-smoke.sh
./run-evidence.sh
./run-evidence-100k.sh
```

Each path automatically resolves and validates the checkout SHA. The 100k path starts the same coordinator and shard clients used by the reduced HTTP integration test.

## Coordinated lifecycle

Every shard must register the same non-null source SHA, seed, global target and shard count with a unique `shard_id`. Exactly one registration has `publisher_owner=true`. Local targets must sum exactly to the global target.

Every shard reaches both boundaries, in order, for:

```text
preflight -> warmup -> steady -> surge -> target-barrier -> stabilization
-> late-join -> burst -> post-burst -> reconnect -> slow-consumer
-> restart-replacement -> final-metrics
```

A boundary releases only after all registered shards arrive. Skips, duplicate arrivals, inconsistent registration, missing results, or a global abort invalidate the experiment.

## Global aggregation

Samples are assigned to aligned one-second buckets. A bucket is usable only when every shard contributes a sample from the same phase. The last sample per shard in that bucket is used.

```text
A_global(t) = sum(active_current_shard(t))
global_active_peak = max(A_global(t))
```

Global target evidence requires `global_active_peak >= global_target`. Attempt, establishment and failure rates are deltas of cumulative counters across consecutive complete aligned buckets. Histogram distributions are merged by sparse bucket counts; p50/p95/p99/max are recomputed from the merged population. Percentile summaries are never averaged or maximized.

Shared Nchan and Redis resource evidence is taken once from the publisher-owner shard. It is never summed across duplicate observers.

## Scenario rules

### Late join

Coordinated run isolation flushes Redis before viewers start and verifies an empty database. The oldest required sequence is therefore 1. After the canonical 500-event prefill, the frozen range is `1..prefill.lastSeq`. The frozen expected count, target score and target clock must all match replay. The 5,000-message buffer proof must cover expected depth + 120 live arrivals + 256 safety messages.

### Reconnect

Ten percent of each shard's clients form the cohort. Each client emits the fields required by `ReconnectClientResult`. PASS requires a real new subscription, the expected prefix, exact frozen required count, no missing/duplicate/out-of-order event and target reached. `expected_count=0` does not waive subscription re-establishment.

### Surge

The final-scale scheduled window is 120 seconds and additions are the exact difference from 60% active population to the local target. The duration is resolved configuration (`SURGE_SECONDS`); smoke freezes five seconds and is never direct-evidence eligible. There is no approximate 80% pass threshold. Generator CPU ≥90%, event-loop p99 ≥100ms, backlog >1,000, invalid topology/FD/ports or invalid environment produce INCONCLUSIVE. With healthy generator and valid environment, connection/surge inability to sustain target produces REJECT.

### Slow consumer

- slow cohort: 5%; intended application rate: one event per 2,000ms
- every intended slow client median interval: 1,600–2,400ms (±20%); otherwise INCONCLUSIVE
- offered source: accepted canonical publisher-head delta for the client's channel
- healthy baseline: dedicated 3-second interval immediately before throttling
- throttle observation: 15 seconds; recovery window: 10 seconds
- healthy p95 degradation: at most 5%
- replay recovery: at least 95%, and at least one client must miss a live event
- run memory growth must remain below both 50 MiB and 10% of baseline
- recovery memory delta must remain below 50 MiB
- memory-based backpressure is meaningful only when growth exceeds both 1 MiB and 5% and independent backlog grows
- a server disconnect is also direct backpressure evidence
- no proven backpressure, unknown memory boundedness, non-independent offered measurement, or failed pacing model yields INCONCLUSIVE
- disconnects are not mandatory when bounded server-side pressure and recovery are proven

### Restart and cross-node replacement

Each path freezes its own transport resume ID and canonical cursor, publishes eight accepted per-match-serialized events, freezes the last accepted sequence, and then restarts/replaces. PASS requires a positive expected count, exact received required count, zero missing required, no missing prefix, zero duplicates, zero out-of-order and target reached. Literal and cross-node structured path objects are both present in machine evidence.

### Active population

Late join, burst, reconnect, slow consumer and restart/replacement each report global aligned start/minimum/peak/end population. Reconnect permits a transient minimum of 90% of target because its frozen cohort is 10%; every other peak-scale scenario requires the global minimum to remain at target.

## Resource measurements

Runner, Nchan and Redis report raw CPU percent where 100% means one full CPU. Assigned-capacity percent divides by:

```text
min(cpu_max_quota / cpu_max_period, cpuset_effective_cpu_count)
```

when both limits exist, otherwise by the available limit. Runner reads its cgroup, Nchan exposes its cgroup through the control server, and Redis exports its cgroup files through the read-only evidence volume. Generator, DUT and Redis validity are assessed separately.

`nchan_memory_peak_run_bytes` is max sampled `memory.current` during the run. `nchan_memory_peak_container_lifetime_bytes` is cgroup `memory.peak` and is informational only. Classifier memory decisions use the run-scoped measurement.

## Result scopes and verdict

The aggregation dimensions are strictly:

```text
shard result
-> simultaneous global-run aggregate
-> repeated global runs
-> campaign aggregate
```

Cross-shard code must not call the repeated-run `aggregateRuns()` path.

Shard output contains `experiment_run_id`, `run_index`, `shard_id`, `shard_count`, `scope=shard`, `aggregate_scope=shard`, and `global_direct_accept_eligible=false`.

The coordinator emits one `contract_version=v2.0.4`, `scope=global`, `aggregate_scope=simultaneous_global_run` result. Invalid generator, timing, source, topology, barriers, environment or missing evidence produces INCONCLUSIVE. With all evidence valid, a DUT/correctness/scenario threshold failure produces REJECT. ACCEPT requires every shard and scenario to accept, exact publisher ownership, aligned target, non-empty merged histograms, shared resource evidence and zero correctness violations. Only this ACCEPT sets `global_direct_accept_eligible=true`.

## Milestone boundary

The executable machinery, focused tests, reduced coordinated validation and traceability audit complete Milestone 2. No full 100,000-viewer qualifying campaign is run here; that execution is Milestone 3.
