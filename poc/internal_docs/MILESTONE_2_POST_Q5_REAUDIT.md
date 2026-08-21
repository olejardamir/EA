# Milestone 2 Post-q5 Regression Re-audit — v2.0.6

Audit opened: 2026-08-20

Audit completed: 2026-08-21 (America/Toronto)

Scope: every path changed after the immutable q5 INCONCLUSIVE campaign: runner/scenario/generator behavior, Nchan/Redis instrumentation, coordinator, campaign aggregator, launchers, Compose topology, resource evidence, metric schema, restart semantics, and source/freshness provenance.

Active contract: `poc/internal_docs/EXPERIMENT_CONTRACT_v2_0_6.md`

M4 decision: Terminal A in `MILESTONE_4_INCONCLUSIVE_RECONCILIATION.md`; no new qualifying M3 run is required or authorized by this audit.

Validated corrected source: `b143e6679269b99cc04be20eee98c3ba96e8dd1b`

Status: **PASS — NON-QUALIFYING CORRECTIVE RE-AUDIT COMPLETE**

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

## Validation record

| Validation | Result |
|---|---|
| TypeScript | `npm run typecheck` passed with no errors. |
| Full automated suite | 396/396 passed across 83 suites; 0 failed, cancelled, skipped or todo. |
| Focused final-regression set | 90/90 passed for measurement output, aggregation and Milestone-2 gap closure. |
| Changed-path/adversarial and reduced coordinated HTTP set | 65/65 passed across coordinator deadline/HTTP, global coordinator, campaign, restart roles/freshness, detached launcher, resources and infrastructure. The HTTP tests use the real coordinator server and delayed responses rather than a stubbed classification result. |
| Static launch/config audit | Both portable-smoke and qualifying-evidence Compose files passed `docker compose config --quiet`; all four launch scripts passed `bash -n`; `git diff --check` passed. |
| Fresh images | Current Nchan and runner images were built from corrected source `b143e6679269b99cc04be20eee98c3ba96e8dd1b`. BuildKit's default isolated network could not resolve Ubuntu mirrors in this host environment; the same pinned Dockerfiles built successfully with Docker's host build network. This changed build transport only, not runtime topology or experiment semantics. |
| Portable non-qualifying smoke | `SMOKE_NO_BUILD=1 ./run-smoke.sh` then ran those fresh images and exited 0. It established exactly 100/100 connections, completed all phases and cleaned its unique Compose project. The profile correctly emitted `NOT_APPLICABLE`, `direct_accept_eligible=false`, and cannot stand in for a 100k result. |

Final machine inspection from the fresh-image smoke:

```text
contract/source                 v2.0.6 / b143e6679269b99cc04be20eee98c3ba96e8dd1b
Redis memory_used_bytes         3,185,440 (numeric)
burst distribution              2,777 samples, p95 8 ms, overflow 0
late-join distribution          exactly 1 owner sample, p95 13 ms, overflow 0
generator CPU                   raw 113.895%; 14.236875% of assigned 8-core capacity
generator event-loop/backlog    p99 11.747327 ms / peak 1
generator throttle/OOM          0 / 0
Nchan CPU/capacity              raw 6.4648%; normalized 1.6162%; throttle/OOM 0 / 0
clock                           PASS; runner+nchan-1 same-host kernel clock
direct architecture eligibility false
classification                 NOT_APPLICABLE
```

The portable single-node profile intentionally has no `nchan-2`; its machine output therefore records `nchan2_reachable=false` while the evidence Compose/static contract proves all four coordinated shards use the explicit Nchan-2 publisher health port `18080`. The smoke's reconnect and slow-consumer scenario observations are retained but do not become qualifying ACCEPT/REJECT evidence under the smoke gate.

## Completion gate

```text
false PASS:                       0
unmapped changed requirement:     0
qualifying M3 rerun:               NO — M4 Terminal A
M2 post-q5 re-audit:               PASS
```
