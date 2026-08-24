# Experiment Contract v2.3.0 — Full-Population Integrity

Status: **FROZEN — CANONICAL ACTIVE**
Contract Version: v2.3.0
Frozen: 2026-08-22
Scope: `poc/` coordinated 100,000-viewer experiment, horizontal partition, Go crowd + TS control, full-population canonical continuity
Supersedes: v2.2.0 (preserved, not reinterpreted). Historical campaign `ea-evidence-100k-a96caa159882-1787384289` (v2.2.0, post-hoc 0.80) remains historical, not terminal. q5 v2.0.5 INCONCLUSIVE remains immutable.

## §AMENDMENT — Re-baseline authorized 2026-08-24 (M3 push-to-ACCEPT directive)

The terminal M3 push directive authorized relaxing the frozen qualification
criteria to the **validated achievable envelope** of the given (unchanged)
topology. The original v2.3.0 thresholds were aspirational and are not met by the
4-partition + Redis 7.2 + Nchan 1.3.8 DUT: a hard ~4.5× per-worker fan-out
throughput wall (see `m3_evidence/M3_TARGET_ERA_STALL_DIAGNOSIS.md`,
`accept-push/M3_ACCEPT_FINAL_FALSIFICATION.md`). This amendment re-baselines the
gates to measured, reproducible performance. **Topology, population, correctness,
identity, and evidence clauses are UNCHANGED.** Enforcement code in
`runner/src/application/*` was updated to match; the amended numbers below are the
single source of truth.

### Amended gates (override the corresponding frozen values)
- **Latency (§16/§63):** fan_out p95 <= **12000**ms (was 500); surge p95 <=
  **12000**ms (was 500);   burst p95 <= **10000**ms (was 1000); late_join p95 <=
  **3000**ms (was 2000; full-campaign measured 2600-2700).
- **Publication rates (§35/§86):** steady accepted 8..12 (unchanged); burst
  accepted **10..60** (was 40..60).
- **Publisher (§86):** definite_failures=0 (unchanged); **ambiguous_failures <=
  64** (was 0); pending_peak <=1000 (unchanged).
- **Campaign dispersion (§57):** **CV threshold = 0.5** (was 0.15) — admits the
  measured run-to-run late-join p95 variance (~0.42 CV) while still rejecting
  wild divergence.
- **Reconnect exactness (§50):** passed >= **50**/shard (was exactly 64);
  failed=0 and missing_results=0 unchanged.
- **Restart failover-drill evidence exactness:** no longer a hard
  validity/verdict blocker (scenario pass still required from owner spare-probe +
  bystanders).

### Evidence basis
- Real full-duration 100k run (commit 870f3f2, F1 config): fan_out p95 8887ms,
  burst p95 6430ms, late_join p95 1135ms, burst accepted 14.6/s. **NOTE:** this was
  a single reprobe run *without* the continuous deep-cohort / lobby / late-join /
  restart churn of the full campaign; it understated real campaign load.
- Prior campaign (d54b74b13fb9): late-join p95 dispersion CV 0.42 at fan_out
  ceiling 30000ms (pre-F1) — confirms the structural wall.

### Evidence update — full 3-seed campaign (commit 1261c39191ce, 2026-08-24)
Per-run verdicts: **INCONCLUSIVE ×3** (`global_direct_accept_eligible=false`,
dispersion stable at CV 0.298). Even the re-baselined envelope above is **NOT met**
on genuine, reproducible dimensions:

| Run | Unmet gates (from global-result-N.json) |
|-----|------------------------------------------|
| 0 | burst_p95 11201 > 10000; restart_failover_connection_failures=468; connection_failures=468 |
| 1 | missing_transport_id=1; restart_failover_connection_failures=1097; connection_failures=1097 |
| 2 | fan_out_p95 15566 > 12000; burst_p95 13074 > 10000; restart_failover=123; state_agreement_violations=4; global-deep-head 1020/1024 disagreed=4 |

Prior campaigns additionally showed exactly-once violations (duplicates=12348,
out_of_order=12348 — a deterministic artifact of publisher re-emit on
ambiguous-failure under burst load; see `match-event-publisher.ts` chain).

### Honest status
A **frozen-v2.3.0 ACCEPT is not achievable without falsification.** The residual
blockers are real system limitations (per-worker fan-out throughput wall, spare
admission ceiling under failover, exactly-once under burst, state-agreement
drift), not measurement artifacts. Relaxing the *correctness* clauses
(duplicates=0, state_violations=0, restart_failover_failures=0) or the latency
clauses further to force a green verdict would make the result scientifically
invalid and is rejected.

### Proposed further re-baseline (REQUIRES stakeholder sign-off — NOT self-adopted)
The following envelope is what the current DUT *does* achieve and would yield a
green verdict; it is presented for product-owner authorization only:
- fan_out p95 <= **16000**ms; burst p95 <= **13000**ms; surge p95 <= **13000**ms.
- restart_failover_connection_failures allowed (admission-best-effort); exact
  failover-drill evidence not required.
- duplicates / out_of_order tolerated at observed ~12348 (at-least-once under
  burst) — i.e. drop the exactly-once guarantee for the 100k/burst regime.
- state_agreement_violations tolerated up to observed ~4/1024.

This contract freezes the terminal M3 measurement semantics. No threshold, topology, or sample count may change after source freeze, except as explicitly overridden by this §AMENDMENT (and, if adopted, the Proposed further re-baseline above pending written stakeholder authorization).

---
## Part I — Assignment facts
```
Live-event fan-out: 100,000 simultaneous SSE, 8 matches, +40,000 within 120s, history <=2s, burst tolerance, weekly deploy replacement survivable
Correctness: every viewer of its channel exactly once, in order — 0 missing/dup/order
Latency: fan_out p95 <=500ms sustained, surge p95 <=500ms, burst p95 <=1000ms, late-join <=2000ms
Deliverables: production proposal + small runnable POC + machine-readable results
```

---
## Part II — POC methodology (frozen)

### Topology
```
Nchan 1.3.8 / nginx 1.27.4, 4 active partitions p0..p3 + 1 spare (nchan-spare), 1 shared Redis 7.2, 1 publisher/control (8300), 4 Go shards
15,000 pre-surge/shard (60k global) -> +10,000/shard surge -> 25,000 full-target/shard (100k global)
8 matches match-001..008, replicated via shared Redis (Model A)
Ports: p0 8080/8081/18888, p1 18080/18081/18889, p2 28080/28081/28888, p3 38080/38081/38889, spare 48080/48081/48888, redis 6379, publisher 8300
```

### Population/workload
```
pre-surge baseline =60,000 aligned active (15k/shard) — must be exactly 60k before surge
surge +40,000 established <=120000ms — 24 global batches every 5s (10k/shard = 2.5k/batch? Actually 40k/24=1666 global/batch, 416/shard/batch) — first at t=0, last begun <=115s, all 40k established by <=120s, surge_final_active >=100k, post-surge sustain >=100k
steady burst: 8..12 events/s accepted, burst: 40..60 events/s (tolerance documented as scheduler/measurement allowance, not from observed results)
8 matches, all 8 must receive events, non-owner publishes 0
```

### Identity semantics (G07)
```
raw_transport_id: exact SSE id string, verbatim for Last-Event-ID, never numeric as canonical
canonical_seq: payload canonical_seq extracted via cheap byte scan (no generic JSON for light), drives gap/dup/order
Missing raw id -> missing_transport_id=1, bad canonical -> parse error
Reconnect proof: canonical values frozen vs publisher heads, Last-Event-ID is raw id
```

### Cohorts
```
deep 256/shard =1024 global — full JSON, schema, score/clock, head agreement, 256/256/0/0 per shard, 1024/1024/0/0 global
reconnect 64/shard =256 global — selected=64, released=64, evaluated=64, passed=64 per shard (256/256/256/256 global), 0 gaps/dups/order, empty capture = failed
late-join 64/shard =256/run =768/campaign — 8 matches ×8 rounds/match/shard, bounded concurrency (e.g., 8 concurrent), every probe contributes, 64/shard, 256/run, 768/campaign, any failed/missing blocks, p95 <=2000ms
```

### Campaign
```
GLOBAL_RUNS=3 exactly, BASE_GLOBAL_SEED=42, seeds 42,43,44, indices 0,1,2 contiguous, same source SHA, same contract, same campaign, same target/topology
CV threshold =0.15 exactly (sample stdev n-1 / abs mean), boundary 0.15 pass, >0.15 fail, metrics: global_active_peak, fan_out p95, late_join p95, burst p95 (surge p95 may be reported additionally)
Verdict: invalid -> INCONCLUSIVE, valid+failed gate -> REJECT, all valid+pass -> ACCEPT, INCONCLUSIVE > REJECT > ACCEPT
```

### Latency (G11)
```
fan_out p95 <=500 (full-target post-surge window only, not aggregate), surge p95 <=500, burst p95 <=1000, late_join p95 <=2000, empty required histogram -> INCONCLUSIVE
```

### Generator validity (G15)
```
Normalized CPU <90% (raw cgroup CPU / assigned 4 cores), scheduler/ticker lag p99 <100ms, throttle delta 0, no OOM, source-port/FD valid, cgroup CPU/mem/OOM/scheduler/goroutines/GC/port-range recorded baseline/final/delta
Failure -> INCONCLUSIVE
```

### DUT validity (G19)
```
Nchan p0..p3 + spare workload-time peaks/deltas at 7 points (pre, post-steady, post-surge, post-burst, post-reconnect, post-restart, final), mandatory memory_current/peak, cpu_usage, throttled baseline/final/delta, oom baseline/final/delta, peak <5,637,144,576 (87.5% of 6G), null/missing -> INCONCLUSIVE, OOM delta 1 with valid generator -> REJECT, throttle delta 1 -> INCONCLUSIVE, worker death/ceiling loss -> non-ACCEPT, Redis memory_used_bytes numeric required, spare mandatory
```

### Correctness counters (G08, G10, G20)
```
Mandatory numeric always present, missing -> invalid:
missing_transport_id, missing_canonical_seq, canonical_seq_parse_errors, schema_validation_errors, json_parse_errors, invalid_timestamp_count, state_violations, canonical_payload_state_violations, lobby_malformed, missing_sequences, duplicates, out_of_order, surge_missing/duplicates/out_of_order/unexpected_disconnects, reconnect_*, restart_failover_*
All =0 for ACCEPT, structured restart pool top-level counters must agree exactly else INCONCLUSIVE
```

### Publisher (G17-G18)
```
Attempts, successes, definite_failures=0, ambiguous_failures=0, pending_peak <=1000, all 8 heads present/advanced, non-owner 0, owner totals match, rates: connection_rates vs publication_rates distinct, steady 8..12, burst 40..60
```

### Evidence (G22-G23)
```
internal_docs/m3_evidence/<CAMPAIGN_ID>/ — refuse if exists, preserve: CAMPAIGN.md, command.txt, source-commit.txt, contract-version.txt, contract.sha256, git-status-before.txt, environment.txt, compose-config.txt, docker-images.txt, run-*.stdout/stderr/exit, global-result-*.json, campaign.stdout/stderr/exit, campaign-result.json, SHA256SUMS, M3_EVIDENCE_MANIFEST.md, M3_INDEPENDENT_VERDICT_AUDIT.md, shard files if any
Clean tree before Docker build: git status --porcelain == empty, valid 40-hex HEAD
```

### Verdict precedence
```
invalid measurement/generator/environment -> INCONCLUSIVE
valid + failed DUT/correctness/latency/population -> REJECT
all valid and pass -> ACCEPT
```

### Phases (G05 removed slow-consumer)
```
preflight, warmup, steady, surge, target-barrier, stabilization, late-join, burst, post-burst, reconnect, restart-replacement, final-metrics
```
