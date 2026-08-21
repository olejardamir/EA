# Experiment Contract v2.0.5 — POC Implementation Reference

Status: **NON-CANONICAL IMPLEMENTATION REFERENCE**

Canonical source of truth: `internal_docs/LIVE_MATCH_CENTRE_POC_EXPERIMENT_CONTRACT_v2_0_5.md`. If this implementation reference ever differs from that file, the canonical top-level contract controls.

Frozen: 2026-08-20

Supersedes: `internal_docs/LIVE_MATCH_CENTRE_POC_EXPERIMENT_CONTRACT_v2_0_4.md` (historical, stale topology/verdict) and `poc/internal_docs/EXPERIMENT_CONTRACT_v2_0_4.md` (historical, materially correct but ambiguous dual-active state)

Scope: `poc/` coordinated 100,000-viewer experiment

## Contract lineage

- v2.0.2 is the historical initial freeze. It remains historical and is not edited.
- v2.0.3 is the historical correction contract for the single-runner evidence machinery. It remains historical and is not edited.
- v2.0.4 existed in two simultaneous documents with the same frozen version number but different experiment descriptions. Both are now historical. `poc/internal_docs/EXPERIMENT_CONTRACT_v2_0_4.md` contained the materially correct executable semantics; `internal_docs/LIVE_MATCH_CENTRE_POC_EXPERIMENT_CONTRACT_v2_0_4.md` described a stale 4×28k/112k topology with independent shard verdicts.
- v2.0.5 is the single canonical active successor version; its canonical document is `internal_docs/LIVE_MATCH_CENTRE_POC_EXPERIMENT_CONTRACT_v2_0_5.md`. This file maps the `poc/` implementation to it and is not a second contract source.

Milestone 2 freezes the machinery. It does **not** execute or claim the final Milestone 3 campaign.

## OLD / NEW / WHY change record

| Area | OLD (v2.0.4 ambiguous state) | NEW (v2.0.5 canonical) | WHY |
|---|---|---|---|
| Active contract identity | Two documents both claim active frozen v2.0.4 | One canonical v2.0.5 supersedes both; both v2.0.4 files are historical | Two simultaneous active frozen contracts is not a valid source-of-truth chain |
| Topology (stale v2.0.4) | 4 shards × 28,000 = 112,000 aggregate | Exactly 4 × 25,000 = 100,000 exact global target | §3.1: executable code runs 25k/shard with frozen source-port headroom model |
| Verdict model (stale v2.0.4) | Each shard classifies independently; all shards must ACCEPT | One simultaneous-global-run aggregate/verdict; 3–8 repeated global runs; separate campaign aggregate | Shard-local runs cannot prove simultaneous 100k scale |
| RUN_MODE (stale v2.0.4) | RUN_MODE=single per shard | RUN_MODE=coordinated-shard for 100k path | §2.3: coordinated launcher drives coordinator/shards, not independent suites |
| Slow-consumer pacing (stale v2.0.4) | per_client_medians_all_above_1s | Every intended client median 1,600–2,400ms (±20%) | Tighter frozen range matches executable tolerance |
| Restart replay counting | Could count total frame count as proof of completeness | Only unique canonical sequences within the frozen expected range count; later out-of-range events cannot substitute | §3.2: total frame count allows missing required sequences to pass |
| Restart completion boundary | seq ≥ expected_last_seq treated as complete | All required canonical sequences in frozen set must be received exactly once | §3.2.D: target_reached means exact required set complete |
| Restart structured evidence | Missing required sequences list absent | missing_required_sequences, out_of_range_before_count, out_of_range_after_count explicitly reported | §3.2.E: exact-range values must be machine-readable |
| Machine provenance runtime limits | Hard-coded runner nofile=100000 | Actual runtime value from preflight/compose; coordinated 100k profile uses 120000 | §3.3.A: machine evidence must not claim a limit different from the actual process |
| Contract version source | Scattered hard-coded string literals (v2.0.3, v2.0.4) | One canonical contract_version source; all machine outputs reference v2.0.5 | §3.3.B: one canonical producer prevents accidental drift |

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

Each path automatically resolves and validates the checkout SHA. The 100k path starts the same coordinator and shard clients used by the reduced HTTP integration test. It freezes 3–8 repeated simultaneous-global runs (`GLOBAL_RUNS`, default 3), derives seed `base + run_index`, recreates DUT/generator containers for isolation, persists each global result, and then emits a distinct campaign aggregate.

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

Each path freezes its own transport resume ID and canonical cursor, publishes eight accepted per-match-serialized events, freezes the last accepted sequence, and then restarts/replaces.

PASS requires ALL of the following:

```text
positive expected count
received_required_count == expected_count (unique canonical sequences within frozen range)
missing_required == 0
no missing prefix
duplicates == 0 (within required set)
out_of_order == 0 (within required set)
target_reached == true (all required sequences received)
```

A canonical sequence satisfying `expected_first_seq <= seq <= expected_last_seq` may count toward `received_required_count`. A later event with `seq > expected_last_seq` must never substitute for a missing required sequence. Total replay-frame count is never used as proof of exact replay completeness.

Literal and cross-node structured path objects are both present in machine evidence. Each path result includes:

```text
missing_required_sequences: number[]  (explicit list of missing canonical sequences)
out_of_range_before_count: number    (events received below expected_first_seq)
out_of_range_after_count: number     (events received above expected_last_seq)
```

### Active population

Late join, burst, reconnect, slow consumer and restart/replacement each report global aligned start/minimum/peak/end population. Reconnect permits a transient minimum of 90% of target because its frozen cohort is 10%; every other peak-scale scenario requires the global minimum to remain at target.

## Resource measurements

Runner, Nchan and Redis report raw CPU percent where 100% means one full CPU. Assigned-capacity percent divides by:

```text
min(cpu_max_quota / cpu_max_period, cpuset_effective_cpu_count)
```

when both limits exist, otherwise by the available limit. Runner reads its cgroup, Nchan exposes its cgroup through the control server, and Redis exports its cgroup files through the read-only evidence volume. Generator, DUT and Redis validity are assessed separately.

`nchan_memory_peak_run_bytes` is max sampled `memory.current` during the run. `nchan_memory_peak_container_lifetime_bytes` is cgroup `memory.peak` and is informational only. Classifier memory decisions use the run-scoped measurement.

## Machine provenance and runtime limits

Machine evidence must report actual runtime values, not hard-coded assumptions:

```text
runner nofile soft/hard: actual value from compose profile or preflight measurement
  (coordinated 100k profile: 120000; smoke/evidence profile: as configured)
contract_version: from the canonical top-level v2.0.5 contract, implemented by
  `runner/src/domain/active-contract.ts`
source SHA: non-null, valid 40-hex, resolved at launch time
```

All machine outputs (single run, evidence suite, coordinated shard, simultaneous global run, campaign) must use the same canonical contract version source. Stale hard-coded version strings are not permitted.

## Result scopes and verdict

The aggregation dimensions are strictly:

```text
shard result
-> simultaneous global-run aggregate
-> repeated global runs
-> campaign aggregate
```

Cross-shard code must not call the repeated-run `aggregateRuns()` path.

The v2.0.5 campaign aggregator accepts only `aggregate_scope=simultaneous_global_run` inputs with unique contiguous run indices and run IDs, common target/source/shard count, and 3–8 runs. It pools the already-global histogram distributions, sums correctness counters, retains per-run resources/workload, and applies the frozen 15% cross-run coefficient-of-variation bound using sample variance (`n-1`), matching the existing evidence machinery. Invalid/inconclusive inputs or unstable dispersion produce campaign INCONCLUSIVE; stable runs with any conclusive REJECT produce campaign REJECT; all stable global ACCEPT runs produce campaign ACCEPT.

Shard output contains `experiment_run_id`, `run_index`, `shard_id`, `shard_count`, `scope=shard`, `aggregate_scope=shard`, and `global_direct_accept_eligible=false`.

The coordinator emits one `contract_version=v2.0.5`, `scope=global`, `aggregate_scope=simultaneous_global_run` result. Invalid generator, timing, source, topology, barriers, environment or missing evidence produces INCONCLUSIVE. With all evidence valid, a DUT/correctness/scenario threshold failure produces REJECT. ACCEPT requires every shard and scenario to accept, exact publisher ownership, aligned target, non-empty merged histograms, shared resource evidence and zero correctness violations. Only this ACCEPT sets `global_direct_accept_eligible=true`.

## Milestone boundary

The executable machinery, focused tests, reduced coordinated validation and traceability audit complete Milestone 2. No full 100,000-viewer qualifying campaign is run here; that execution is Milestone 3.
