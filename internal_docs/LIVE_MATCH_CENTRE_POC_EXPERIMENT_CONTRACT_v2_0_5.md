# LIVE Match Centre POC — Experiment Contract v2.0.5

```text
Status: FROZEN — the single canonical active contract for Milestone 2 closure and Milestone 3
Contract Version: v2.0.5
Supersedes: both v2.0.4 documents (see §1)
Date: 2026-08-20
```

---

## 1. Why this successor exists

At the v2.0.4 audit the repository contained **two different documents that both claimed to be
the active, frozen v2.0.4 contract**, and they did not describe the same experiment:

| File | Claimed status | Actual content |
| --- | --- | --- |
| `internal_docs/LIVE_MATCH_CENTRE_POC_EXPERIMENT_CONTRACT_v2_0_4.md` | FROZEN / active | Stale: 4 × 28,000 = 112,000 aggregate, `RUN_MODE=single` per shard, independent shard verdicts, slow-client gate "all medians > 1s" |
| `poc/internal_docs/EXPERIMENT_CONTRACT_v2_0_4.md` | FROZEN / active | Accurate for most executable semantics: 4 × 25,000, coordinator, one publisher-owner, global barriers, aligned samples, histogram merge |

Two simultaneously active frozen contracts with the same version number is not a valid
source-of-truth chain. Neither frozen v2.0.4 file is edited in place (beyond a superseded-status
banner); both are preserved as historical evidence.

**Which prior file contained the executable semantics:** `poc/internal_docs/EXPERIMENT_CONTRACT_v2_0_4.md`
was materially accurate for the coordinated topology; the top-level
`internal_docs/LIVE_MATCH_CENTRE_POC_EXPERIMENT_CONTRACT_v2_0_4.md` was stale.
This v2.0.5 document is now the **only** canonical active contract.

### OLD / NEW / WHY

| Area | OLD (stale v2.0.4) | NEW (v2.0.5, executable) | WHY |
| --- | --- | --- | --- |
| Shard count / per-shard target | 4 shards × 28,000 = 112,000 | 4 shards × 25,000 = **100,000 exact global target** | Source-port/TIME_WAIT headroom model cannot prove 28k per shard against the real ephemeral budget; 25,000 × 4 hits the exact 100k requirement with provable headroom |
| Run mode | `RUN_MODE=single` per shard, shards classify independently | `RUN_MODE=coordinated-shard`; one coordinator drives all shards | Independent shard verdicts cannot prove a simultaneous 100k population |
| Global verdict | all shards ACCEPT → global ACCEPT | One simultaneous-global-run aggregate/verdict from merged evidence | Same as above |
| Slow-client pacing gate | `per_client_medians_all_above_1s` | **1600 ms ≤ each intended client's median ≤ 2400 ms** | >1 s admits half-speed consumers as "slow by design"; the executable tolerance is ±20 % around the frozen 2000 ms pacing target |
| Restart replay proof | non-empty accepted range + count-based completion | Exact required-set membership proof (§7) | Count-based completion falsely passes when an out-of-range later sequence substitutes for a missing required sequence |
| Runtime limits in machine output | hard-coded constants (e.g. runner nofile 100000) | Resolved actual values (§9) | Machine evidence must not claim limits different from the launched process/container |
| Contract version producers | scattered literals (`v2.0.3`, `v2.0.4`) | Single canonical producer reporting `v2.0.5` (§9.2) | Scattered literals drift from the governing contract |

---

## 2. Generator topology (frozen)

```text
shards:                 exactly 4 distinct bridge-network generator shards
local target:           25,000 viewer connections per shard
global target:          100,000 exact (never approximate, never >=)
run mode:               RUN_MODE=coordinated-shard for every participating shard
coordinator:            exactly one GlobalExperimentCoordinator service
experiment_run_id:      exactly one, coordinator-issued, shared by all shards
```

A shard result always carries `scope="shard"` and `global_direct_accept_eligible=false`.
Only the simultaneous-global-run aggregate may carry global eligibility, and only after
proving aligned global active population ≥ 100,000 and validity of every participating shard.

## 3. Source-port headroom model (frozen)

Per shard, computed from the live `/proc/sys/net/ipv4/ip_local_port_range`:

```text
required = viewer_sockets(25,000)
         + non_viewer_outbound_sockets(64)
         + reconnect_time_wait_allowance(ceil(25,000 × 0.10) = 2,500)
         + source_port_safety_margin(512)
         = 28,076 ports required per shard
headroom = ephemeral_port_count − required   (must be ≥ 0, else preflight fails)
```

The typical Linux ephemeral range budgets 28,232 ports per source IP; the margin above the
28,076 requirement is intentionally thin and must be proven, not assumed. Insufficient
source-port headroom invalidates the run (preflight FAIL), never downgrades to warning.

## 4. Coordinated lifecycle (frozen)

Exactly these phases, in exactly this order, each with coordinated `start` and `end` barriers;
no shard may enter phase *N+1* before every shard has released the phase *N* barrier:

```text
preflight → warmup → steady → surge → target-barrier → stabilization →
late-join → burst → post-burst → reconnect → slow-consumer →
restart-replacement → final-metrics
```

An aborted, missing, or invalid shard forbids a global ACCEPT. Barrier completeness is part of
global validity (`incomplete barrier <phase>:<boundary>` is a validity reason).

## 5. Publisher ownership (frozen)

```text
exactly one publisher-owner shard (PUBLISHER_OWNER=true, shard 0)
non-owner publishers are disabled at construction
a non-owner that publishes anyway invalidates the run
one authoritative logical publisher workload: the frozen event schedule is published once
globally, not multiplied per shard
```

## 6. Global aggregation (frozen)

```text
active-population samples:  time-aligned across shards; global active start/min/peak/end derived
                            from aligned samples only
attempt/establishment/failure rates: time-aligned per phase across shards
histograms:                 lossless serialized-distribution merge (no binning loss);
                            merged distribution is the only latency evidence of record
resource evidence:          shared DUT (Nchan/Redis) resource evidence observed once and
                            reported once in the global result
verdict:                    exactly one simultaneous-global-run verdict per global run
campaign:                   3–8 repeated global runs (outside → invalid); separate campaign
                            aggregate and campaign verdict; campaign preserves source commit,
                            contract version, and per-run results
dimension separation:       shard result → simultaneous global-run aggregate → repeated global
                            runs → campaign aggregate. Simultaneous shards never pass through
                            the repeated-run aggregateRuns() path.
```

## 7. Restart/replacement exact-range semantics (frozen)

For **both** the literal-restart path and the cross-node replacement path, independently:

```text
expected range:   expected_first_seq .. expected_last_seq frozen before the disruption,
                  deliberately non-empty (8-event accepted range after the resume cursor)
membership:       only canonical sequences with expected_first_seq ≤ seq ≤ expected_last_seq
                  may satisfy received_required_count (unique; duplicates tracked separately)
completion:       the required set is complete — received_required_count == expected_count,
                  missing_required == 0, expected first and last present
substitution:     a frame with seq > expected_last_seq while the set is incomplete FAILS the
                  path immediately; a later live event can never repair a missing required seq
gates:            no duplicate required sequence, no out-of-order required sequence,
                  no missing prefix (first required seq must be present and correct),
                  out-of-range frames (before or after) fail the path
target_reached:   means exactly "the required canonical set was received completely",
                  never "some frame ≥ expected_last_seq was observed"
total frame count is never proof of replay completeness
```

Structured per-path evidence (`literal_restart`, `cross_node`) must include:
`transport_resume_id, expected_first_seq, expected_last_seq, received_first_seq,
received_last_seq, expected_count, received_required_count, missing_required,
missing_required_sequences, duplicates, out_of_order, out_of_range_before_count,
out_of_range_after_count, missing_prefix, target_reached, recovery_ms, passed`.

The scenario result, simultaneous-global-run verdict, and campaign verdict must consume this
exact-range structured predicate; no stale aggregate boolean may bypass it.

## 8. Slow-consumer semantics (frozen)

```text
pacing target:        1 event / 2000 ms
per-client gate:      EVERY intended client's median interval ∈ [1600 ms, 2400 ms]
                      (±20 % tolerance around 2000 ms; medians merely >1 s do NOT pass)
offered source:       independent offered count from accepted publisher-head deltas
                      (offered == consumed by construction is forbidden)
slow phase:           15,000 ms dedicated backpressure window
healthy baseline:     dedicated immediate baseline at 3000 ms pacing
recovery:             ≥95 % replay recovery within a 10,000 ms recovery window
live-miss proof:      at least one client must demonstrably miss live traffic
backpressure:         requires disconnect OR independently observed backlog plus meaningful
                      Nchan memory growth (bounded growth threshold: 50 MiB)
measurement honesty:  null/invalid measurement → INCONCLUSIVE, never PASS
memory boundedness:   frozen thresholds; unbounded growth → REJECT
```

## 9. Machine/provenance semantics (frozen)

### 9.1 Identity

```text
source_commit:    non-null, valid 40-hex SHA, injected automatically by the launcher;
                  unknown/null identity invalidates final evidence
shard identity:   actual SHARD_ID / SHARD_TOTAL in every shard result
scopes:           scope=shard + aggregate_scope=shard for shards;
                  scope=global + aggregate_scope=simultaneous_global_run per global run;
                  scope=campaign + aggregate_scope=campaign for the repeated-campaign result
eligibility:      global_direct_accept_eligible=false on every shard result, always
```

### 9.2 Contract version

One canonical producer (`src/domain/active-contract.ts`) exports the active contract version.
All machine outputs governed by this contract — single supporting runs, evidence-suite results,
coordinated shard results, simultaneous-global-run aggregates, and campaign aggregates — report
`contract_version: "v2.0.5"`. Scattered per-call-site string literals are forbidden.

### 9.3 Runtime limits

`runtime_container_limits` must reflect the actual launched topology:

```text
runner:             live values from the runner process itself (/proc/self/limits RLIMIT_NOFILE,
                    self cgroup cpu.max and memory.max)
DUT services:       launcher-provided environment (NCHAN*/NCHAN2*/REDIS_* CPU_MAX_QUOTA,
                    CPU_MAX_PERIOD, MEMORY_GB, NOFILE_SOFT, NOFILE_HARD)
unknown:            null — an honest unknown is preferred over a plausible but wrong number
forbidden:          hard-coded constants that can drift from compose/runtime
                    (e.g. emitting runner nofile 100000 when the launched profile is 120000)
```

Nginx worker FD evidence comes from the control helper reading `/proc/<nginx-pid>/limits`
(master and workers separately), bounding usable SSE capacity by worker_connections and worker
RLIMIT with per-worker FD reserve; aggregate capacity must cover the global target.

---

## 10. Governance

```text
canonical active contract:  this file (v2.0.5)
historical (superseded):    internal_docs/LIVE_MATCH_CENTRE_POC_EXPERIMENT_CONTRACT_v2_0_4.md
                            poc/internal_docs/EXPERIMENT_CONTRACT_v2_0_4.md
                            (both retain their historical text; neither may be referenced as active)
threshold changes:          forbidden without a new frozen contract version; thresholds are never
                            changed to fit observed evidence
milestone pointer:          the assignment milestones document points to this file as active
```
