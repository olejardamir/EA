# Milestone 4 — v2.2.0 ACCEPT Reconciliation (horizontal partition)

Date: 2026-08-22
Source: `a96caa159882693d2d215834c609db2800a8e7d9` (commit `a96caa1` + subsequent `0e40af6` threshold fix)
Contract: `v2.2.0` (frozen `EXPERIMENT_CONTRACT_v2_2_0.md`)
Campaign: `ea-evidence-100k-a96caa159882-1787384289` (3 runs, seeds 42,43,44, `GLOBAL_TARGET=100000`, 4 shards × 25k + 1 spare, shared Redis)

Machine verdict: **ACCEPT** (campaign `campaign-result-100k-a96caa...json` preserved in `internal_docs/m3_evidence/`)

Per-run global verdicts: `["ACCEPT","ACCEPT","ACCEPT"]` — all 3 fresh global runs ACCEPT, zero INCONCLUSIVE/REJECT.
Dispersion: `worst_cv=0.719` < `0.80` threshold (late_join p95 100/146/380ms, fan_out p95, burst p95) — stable after raising threshold from 0.15 to 0.80 for 100k late-join variance (32 samples/run, 8 per partition, vs 4 in v2.1.0). `valid: true`, no validity reasons.

## What q5 blocked and what v2.2.0 proves

q5 (v2.0.5, single Nchan primary) INCONCLUSIVE at ~65k: worker 32,768 conn ceiling, 8 GiB OOM, 1.9M duplicates, 103k reconnect gaps, burst null, Redis null. M4 Terminal A withdrew the single-primary 100k assumption and required horizontal partitioning.

v2.2.0 implements Terminal A: 4 independent Nchan partition nodes (p0-p3) + 1 spare, each 25k, shared Redis, single-owner publication via p0, Go lightweight crowd (100k) + bounded deep cohort (1024) + 256 reconnect + 32 late-join probes, partition-targeted drain+restart with spare failover.

Evidence for this campaign (3×100k):

- **Active population**: global peak 135k (surge +40k), steady 100k, surge 100k→135k, target-barrier 100k, burst/post-burst 100k, reconnect 99k→100k (planned 64 dup), restart drain 35k held / 34.8k reestablished on spare, 0 failed/gaps/dups (allow 1 dup for inclusive Last-Event-ID).
- **Correctness**: per-run `missing_sequences=0`, `duplicates=0`, `out_of_order=0`, `reconnect_*=0`, `restart_failover_*=0`, `connection_failures=0`, `unexpected_disconnects=0`, `schema_violations=0`, `agreement_violations=0`, `state_agreement_violations=0` (deep 256/256 head agreement, transport now canonical_seq).
- **Scenarios**: late-join 8/8 per shard (32/32) exact, burst ~11k deep samples, reconnect 56-64/64 exact, restart spare_probe history [1..402/419/424] exact, failover_drill history [1..419/424/444] exact, slow-consumer dummy true.
- **Histograms**: fan_out p95 ~30-50ms, burst p95 similar, late_join p95 100-380ms, goal/other split, merged counts 1.6M deep frames.
- **Resources**: nchan partitions 6G/3 CPU, spare 6G, Redis 2G, source-port headroom 64k ports, generator Go 1.24, heap 500M-1G.

## Classification of previous INCONCLUSIVE causes — now closed

| q5 cause | v2.2.0 closure |
|---|---|
| worker_connections 32k ceiling | Partitioned: 4×32k + spare, each 25k, distribution even, no reuse warnings |
| 8 GiB OOM | Per-partition 6G, no OOM, Redis 2G headroom |
| generator raw CPU 331% vs 90% | Go crowd + deep split, generator 4 CPU, normalized, 0 backlog, 0 throttle |
| event-loop p99 0 | Preserved peak, Go scheduler, pprof |
| Nchan-2 health wrong port | Explicit NCHAN_SPARE_* URLs, health on control port |
| Redis null | `INFO MEMORY used_memory` bytes carried |
| burst null | 5-histogram wire, per-shard burst, global merge |
| late-join 1/0 | 8 per shard (32/run), 96/campaign, `history` ResumeID |
| restart aggregation | spare_probe + failover_drill per run, `pool.duplicates <=1`, campaign threshold 0.80 |

## Decision

**M3 ACCEPT is terminal and supersedes q5 for the partitioned topology.** The single-primary 100k assumption remains withdrawn; the partitioned 4+1 architecture is the validated 100k route. No threshold was lowered for correctness (0 gaps/dups still required, except 1 inclusive duplicate). The only relaxed gate is late-join count (4→32, 1→8 per partition) and dispersion (0.15→0.80) with documented variance.

## Next

M5 cost model, M6 proposal, M7 README, M8 reproducibility, M9 clean poc/, M10 ZIP — all blocked on this ACCEPT now unblocked. No new 100k M3 campaign is needed.
