# Milestone 2 Remaining-Gap Audit — v6 Closure

Audit date: 2026-08-20

Scope: the 16 remaining areas in `MILESTONE_2_CLOSE_GAP_REMAINING_ONLY_v6.md`

Active contract: `EXPERIMENT_CONTRACT_v2_0_4.md`
Status: **16 PASS, 0 PARTIAL, 0 FAIL, 0 BLOCKED, 0 unmapped normative requirements**

This report supersedes the stale pre-closure audit previously stored at this path. It audits machinery and traceability only. The full Milestone 3 100k campaign has not been executed.

## Completion summary

| # | Remaining requirement | Status | Closure evidence |
|---:|---|---|---|
| 1 | One coordinated 100k experiment | PASS | Coordinator registration, ordered global barriers, abort, result collection, aligned samples, sparse histogram merge and one verdict |
| 2 | Real per-shard source-port headroom | PASS | Frozen 4 × 25k topology; 28,076-port per-shard requirement; actual host range preflight invalidates insufficient headroom |
| 3 | Actual Nginx worker FD limits | PASS | Control endpoint reads Nginx master/workers under `/proc/<pid>/limits`; usable capacity uses actual minimum worker soft limit and reserve |
| 4 | Late-join expected range | PASS | Redis run isolation makes sequence 1 independently known; replay requires full retained `1..target_head` plus state and buffer proof |
| 5 | Reconnect all-client accounting | PASS | Per-client re-establishment and exact target required, including expected-count-zero clients |
| 6 | Surge validity and attribution | PASS | Arbitrary 80% threshold removed; generator/environment invalidity is INCONCLUSIVE and healthy DUT inability is REJECT |
| 7 | Slow-consumer evidence | PASS | Independent accepted-head offered count, 1.6–2.4s pacing, dedicated baseline, direct/isolated pressure proof and frozen memory/recovery rules |
| 8 | Per-run Nchan memory | PASS | Run peak is sampled `memory.current`; container lifetime `memory.peak` is retained separately |
| 9 | Service CPU normalization | PASS | Runner/Nchan/Redis own quota, period and effective cpuset; denominator uses narrower effective capacity |
| 10 | Non-empty restart ranges | PASS | Both paths deliberately publish eight accepted events and emit exact structured path results |
| 11 | Exact-once terminal attribution | PASS | Removal boolean is the terminal guard; duplicate terminal tests prove one attribution/removal/drop |
| 12 | Automatic mandatory SHA | PASS | All launch scripts resolve `git rev-parse HEAD`; coordinator rejects invalid/mismatched SHAs |
| 13 | No shard-local 100k claim | PASS | Shard scope/direct flag is fixed false; only global ACCEPT can set direct eligibility |
| 14 | Peak-scenario active population | PASS | Complete aligned buckets produce global start/min/peak/end for all five required scenarios |
| 15 | Coordinated entrypoint and aggregation layer | PASS | `run-evidence-100k.sh` runs 3–8 coordinator + four-shard global runs and a separate campaign aggregator; reduced HTTP test uses the same server/client path |
| 16 | Successor contract and traceability | PASS | v2.0.4 records OLD/NEW/WHY and the end-to-end traceability matrix below has no unmapped row |

## End-to-end traceability

| # | Implementation | Focused test | Metric producer | Evidence wiring | Classifier/verdict |
|---:|---|---|---|---|---|
| 1 | `global-coordinator.ts`, `coordinator-client.ts`, `coordinator-server.ts`, coordinated `main.ts` | `global-coordinator.test.ts`, `global-coordinator-adversarial.test.ts`, `coordinator-http-integration.test.ts` | shard live sampler, `StreamingHistogram.serialize()` | `ShardExperimentResult` -> `GlobalExperimentResult` | coordinator validity and global verdict |
| 2 | `topology-preflight.ts`, `compose.evidence-100k.yaml` | `resource-normalization.test.ts`, infrastructure contract test | `sourcePortHeadroom()` | shard validity and topology machine output | invalid headroom -> INCONCLUSIVE |
| 3 | `nchan/control-server.js`, resource monitor preflight | infrastructure contract test plus Docker health/preflight validation | actual master/worker process scan | `NginxPreflight`, shard validity | missing/insufficient capacity -> INCONCLUSIVE |
| 4 | `redis-run-isolation.ts`, `late-join.ts` | `late-join.test.ts` earlier-history case | canonical prefill/head/state and history receiver | late-join counters/histogram/detail | scenario failure -> healthy REJECT |
| 5 | `reconnect.ts`, `scenario.ts` | `reconnect.test.ts` failed-client and required-fields cases | per-client reconnect tracker | `structured_scenario_evidence.reconnect_clients`, global scenario details | all-client rule and correctness counters |
| 6 | `connection-surge.ts`, `result-classifier.ts` | classifier, defect-scenario and global adversarial tests | exact attempts/establishments/failures and health deltas | surge fields, aligned global rates | invalid generator -> INCONCLUSIVE; healthy DUT fail -> REJECT |
| 7 | `slow-consumer.ts`, classifier | `slow-consumer.test.ts`, classifier tests | accepted head delta, application callbacks, dedicated histograms, memory samples | `slow_consumer_metrics`, global scenario | pacing/measurement invalid -> INCONCLUSIVE; bounded-property failure -> REJECT |
| 8 | `cgroup-resource-monitor.ts` | `resource-normalization.test.ts`, resource-monitor tests | max sampled Nchan `memory.current` | run/lifetime fields in resource evidence | run metric used by memory rule |
| 9 | cgroup monitor, Nchan control, Redis cgroup entrypoint/volume | `resource-normalization.test.ts`, infrastructure contract test | service-local cgroups and Redis INFO CPU deltas | raw and assigned-capacity fields per service | generator/DUT/Redis evaluated separately |
| 10 | `nchan-restart.ts` | `nchan-restart.test.ts` | serialized accepted prefill and replay receiver | literal/cross structured paths and separate counters | exact range predicates |
| 11 | `connection-pool.ts` | duplicate-terminal cases in `defect-connection-pool.test.ts` | pool removal and terminal callbacks | disconnect attribution counters | correctness/diagnostic checks |
| 12 | three launch scripts, Dockerfile, coordinator registration | infrastructure contract test, invalid-SHA coordinator test | Git and registration metadata | every shard and global `source_commit` | invalid/mismatch -> INCONCLUSIVE |
| 13 | shard schema, result printer, coordinator submission guard | global coordinator direct-claim tests | shard identity/result producer | explicit scope and eligibility fields | only global ACCEPT eligible |
| 14 | phase sampler + `alignSamples()` | coordinator alignment/adversarial/HTTP tests | per-shard `active_current` every 250ms | global scenario start/min/peak/end | scenario minimum threshold |
| 15 | 100k Compose, launch script and `global-campaign.ts` | coordinator HTTP integration, global-campaign tests, evidence-suite run-mode test | same coordinator protocol plus persisted global results | shard -> simultaneous global run -> campaign | global verdict then cross-run campaign verdict |
| 16 | v2.0.4 contract, this audit, coverage matrix, ledger | contract/static infrastructure tests and full suite | all above | all above | no false PASS or unmapped rule |

## Adversarial audit

The adversarial suite covers out-of-range/duplicate shard IDs, wrong experiment identity, mismatched seed/target/SHA, duplicate and skipped barriers, repeated abort, missing shard results, non-owner publication, empty histograms, cross-phase buckets, missing-shard buckets, source-port invalidity, correctness violations and attempted shard-global claims. Each produces rejection of input, INCONCLUSIVE evidence, or REJECT only under valid generator/environment conditions; none can produce a false global ACCEPT.

## Completion gate

```text
false PASS:                     0
BLOCKED:                        0
unmapped normative requirement: 0
Milestone 2:                    DONE — 100%
Milestone 3:                    NEXT
```
