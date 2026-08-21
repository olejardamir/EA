# Milestone 2 Post-q5 Regression Re-audit — v2.0.6

Audit date: 2026-08-20

Scope: every path changed after the immutable q5 INCONCLUSIVE campaign: runner/scenario/generator behavior, Nchan/Redis instrumentation, coordinator, campaign aggregator, launchers, Compose topology, resource evidence, metric schema, restart semantics, and source/freshness provenance.

Active contract: `poc/internal_docs/EXPERIMENT_CONTRACT_v2_0_6.md`

M4 decision: Terminal A in `MILESTONE_4_INCONCLUSIVE_RECONCILIATION.md`; no new qualifying M3 run is required or authorized by this audit.

Status: **VALIDATION IN PROGRESS**

## Correction traceability

| Area | q5 failure | Corrected implementation/evidence | Focused regression |
|---|---|---|---|
| Restart campaign semantics | non-owner empty paths treated as missing exact evidence | raw shard roles; exactly one owner with literal/cross-node exact paths bound to campaign/run/index/shard; strict non-owner non-participation/no fabricated paths | valid 1+3; missing/out-of-range owner; false non-owner; multiple/no owner; stale binding |
| Barrier transport | Fetch’s shorter Undici headers timeout defeated 660s application deadline | native HTTP request with one explicit deadline and no retries | delayed success plus exact timeout/no-retry |
| Generator health | raw multi-core CPU compared with 90% capacity; event-loop peak erased | normalized assigned-capacity CPU; event-loop maximum survives stop/final snapshot | classifier, normalization, monitor-stop preservation |
| Clock reachability | replacement control URL incorrectly derived from subscriber URL | explicit `NCHAN2_PUB_URL` for all coordinated shards | config/Compose static contract plus reduced live path |
| Nchan capacity/CPU/OOM | theoretical worker sum presented as practical proof; usec ×1,000 error; OOM not carried globally | per-worker/model flags; exact microsecond conversion; OOM/throttle fields in shard Nchan resources; valid-context OOM kill is DUT REJECT | exact CPU-unit, infrastructure-model, classifier precedence |
| Redis memory | numeric MB existed but mandatory byte field was absent | parse `INFO MEMORY used_memory`, retain exact byte peak, owner-scope global field, campaign mandatory check | parser plus coordinator/campaign missing-field cases |
| Burst | local phase population discarded; bounded raw slice could emit zero | full sparse phase distribution/overflow in shard schema; global and campaign merges/recomputed percentiles; empty invalid | burst scenario plus merge, overflow and empty adversarial cases |
| Late join | 1/0 samples lacked campaign population contract | exactly one owner sample/valid run; non-owner zero; campaign count ≥run count/minimum three | coordinator and campaign population/empty tests |
| Detached exit | only “non-zero” survived q5 detachment | unique record with start/end, launcher/child PID, exact quoted command, combined output and numeric exit | exit 0, exit 37, signal 15→143, overwrite refusal |
| Stale evidence | corrections risk accepting prior files/roles | unique campaign=Compose identity; refuse labeled resources; exact file set; mtime/result time/source/run/seed/campaign/shard binding; refuse prior campaign result | policy mismatch, stale shard/restart, launcher/CLI infrastructure guards |

## Semantic audit

- Thresholds were not loosened. Generator CPU remains `<90%` of assigned capacity, event-loop p99 `<100 ms`, backlog `≤1,000`, fan-out p95 `≤500 ms`, burst p95 `≤1,000 ms`, and late join `≤2,000 ms`.
- Four shards × 25,000, one publisher owner, seeds 42/43/44 by default, source-port reserves, scenario order and 3–8 campaign repetitions remain frozen.
- New semantics are limited to evidence correctness: v2.0.6 identity/freshness, exact role binding, required Redis bytes, burst distribution, one late-join sample per repetition, exact detached status, and direct Nchan OOM classification after generator/timing/environment validity.
- Nchan `worker_connections=32768`, 4 workers and the 8 GiB primary envelope were not raised. The theoretical 130,048 reserved aggregate is now labelled an even-distribution ceiling, not practical proof.
- Smoke/reduced probes remain non-qualifying and cannot emit a direct architecture ACCEPT.

## End-to-end changed-path map

| Producer | Schema/wiring | Validity/verdict consumer | Evidence guard |
|---|---|---|---|
| event-loop monitor and runner cgroup CPU | `ResourceSnapshot` -> normalized `AggregatedMetrics` -> shard generator resources | shard classifier and global validity | preserved peak and mandatory numeric health fields |
| Nchan control cgroup metrics | resource monitor -> shard Nchan map -> publisher-owner global resource | classifier direct DUT OOM and campaign retained resources | delta from baseline; usec exact conversion; no cross-shard sum |
| Redis INFO memory | exact byte parser -> monitor peak -> shard owner -> global/campaign | mandatory global/campaign validity | null/non-numeric invalid; no hard-coded fallback |
| per-phase metric recorder | serialized burst distribution -> shard -> global merge -> campaign merge | non-empty histogram and burst threshold | total/bucket/overflow consistency; no percentile averaging |
| late-join owner | owner histogram 1, non-owner 0 -> global count 1 -> campaign count N | per-run and campaign population validity | prefill failure yields zero and invalid, never zero latency PASS |
| restart owner/non-owners | structured raw shard records retained inside global result | coordinator and campaign exact role/path validators | binding tuple prevents stale reuse |
| launcher/coordinator clock | campaign/source/run/index/seed and timestamps on every scope | campaign policy | exact files, mtime/start, current IDs, no prior Compose resources |
| detached worker | filesystem terminal record | human/automation handoff | exit-status file is written last as completion marker |

## Required validation record

The completion gate requires:

```text
typecheck
full automated test suite
focused adversarial tests for every changed path
reduced coordinated HTTP integration
portable non-qualifying Docker smoke
machine inspection of Redis bytes, burst population, late-join population,
generator capacity CPU/event-loop, clock reachability and direct eligibility=false
```

Results are intentionally populated only after commands finish; no anticipated PASS is recorded.

## Completion gate

```text
false PASS:                       pending validation
unmapped changed requirement:     0
qualifying M3 rerun:               NO — M4 Terminal A
M2 post-q5 re-audit:               IN PROGRESS
```
