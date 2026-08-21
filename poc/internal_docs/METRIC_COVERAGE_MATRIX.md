# Metric Coverage Matrix — Active v2.1.0

Every result-affecting v2.1.0 metric has a producer, validity rule, machine-readable destination and focused coverage. The active contract is `poc/internal_docs/EXPERIMENT_CONTRACT_v2_1_0.md` (partitioned fan-out freeze); v2.0.6, v2.0.5 and q5 are historical. Rows below remain accurate except where v2.1.0 supersedes them (per-partition resource evidence incl. numeric `oom_kill_events`, per-shard late-join samples merged to shard count, role-exact restart drill evidence). Shard metrics are never presented as global unless they pass through the simultaneous global coordinator.

| Metric/evidence | Producer | Frozen rule | Machine-readable destination | Focused coverage |
|---|---|---|---|---|
| campaign/run identity, seed, shard IDs/count, creation time | launcher + coordinator registration | fresh campaign; exact current campaign/run/index/seed/source bindings | shard/global/campaign provenance | coordinator core, stale/misbound adversarial, HTTP integration |
| `source_commit` | launch script + shard registration | non-null valid SHA; identical on all shards/results | shard and global provenance | infrastructure contract, coordinator mismatch tests |
| publisher ownership/events | registrations and publisher counters | exactly one owner; non-owner events = 0; owner events > 0 | publisher owner ID, workload | coordinator tests |
| phase start/end | global barriers | every shard at every ordered boundary | `phase_timings` | barrier/order/abort tests |
| shard `active_current` | live pool sampler | sampled throughout coordinated phases | shard `samples` | coordinator integration |
| global active peak | aligned sample aggregator | complete same-phase buckets only; peak ≥ global target | `active_population.global_active_peak` | alignment/adversarial tests |
| scenario active start/min/peak/end | aligned phase buckets | reconnect min ≥90%; others min ≥ target | `active_population.scenarios`, scenario result | coordinator tests/integration |
| attempt/establishment/failure rates | cumulative shard counters | deltas across consecutive complete aligned buckets | active-population buckets | coordinator histogram/alignment tests |
| fan-out distribution | streaming sparse histograms | non-empty; merge counts, then recompute percentiles | global histogram and distribution | histogram merge/overflow tests |
| burst fan-out distribution | per-phase streaming histogram | every participating shard emits full sparse distribution; non-empty global/campaign population; overflow retained | shard `histograms.burst`, global/campaign burst histogram | burst scenario, merge/overflow/empty-evidence tests |
| late-join distribution | publisher-owner late-join timer | exactly one sample per valid global run, zero on non-owners; campaign cohort ≥ run count and ≥3 | global/campaign late-join histogram | late-join, coordinator and campaign population tests |
| source-port viewer/reserve/headroom | topology preflight | viewers + 10% TIME_WAIT + 64 + 512 ≤ actual range | topology and shard validity | resource normalization |
| Nginx process limits/capacity model | Nchan control `/proc/<pid>/limits` | report per-worker ceiling/reserve and theoretical even-distribution aggregate separately; do not claim observed worker distribution | Nginx preflight and shard validity, including model/distribution flags | infrastructure contract + Docker preflight |
| late-join range/state | canonical publisher + history subscriber | sequence 1 through target, exact count/prefix/order/state; capacity proof | history counters/hist/detail | earlier-history late-join test |
| reconnect client result | reconnect scenario | every intended client re-established and caught exact frozen target | `structured_scenario_evidence.reconnect_clients`; global structured detail | reconnect failed-client/field tests |
| surge exact additions/attempts/results | surge scenario | exact target scheduling; no arbitrary rate tolerance | surge fields and aligned rates | scenario/classifier tests |
| generator health | runner CPU, preserved event-loop peak, backlog | assigned-capacity CPU <90%, p99 <100ms, backlog ≤1,000; raw per-core CPU is not compared to capacity threshold | shard validity and generator resources | classifier/resource tests and reduced smoke |
| slow offered/read/backlog | accepted canonical head + app callback | independent offered source; missed live event and ≥95% replay recovery | slow metrics | independent-source tests |
| slow per-client pacing | throttled app timestamps | every intended median 1,600–2,400ms | slow metrics | pacing tolerance test |
| slow healthy p95 | dedicated before/during histograms | immediately-before baseline; degradation ≤5% | slow metrics | slow scenario/classifier tests |
| slow backpressure | disconnect OR independent backlog + meaningful memory growth | growth >1MiB and >5%; memory alone is insufficient | slow metrics | slow scenario/classifier tests |
| slow memory boundedness | sampled Nchan current | growth <50MiB and <10%; recovery delta <50MiB | slow metrics | classifier/scenario tests |
| Nchan run memory peak | max sampled `memory.current` | run-scoped; mandatory evidence | `memory_peak_run_bytes` | resource normalization test |
| Nchan lifetime peak | cgroup `memory.peak` | informational only | `memory_peak_container_lifetime_bytes` | resource monitor output coverage |
| runner CPU and FD capacity | runner cgroup plus `/proc/self/limits` | own quota/period/cpuset, narrower CPU limit wins; nofile soft/hard are measured for the current process | generator resource raw/capacity fields and `runtime_container_limits.runner` | resource normalization + runtime-container-limits tests + selected-profile JSON inspection |
| Nchan CPU capacity | Nchan control cgroup | `usage_usec` converted once (1,000,000 usec/s = 100% of one CPU); own quota/period/cpuset denominator | Nchan resource raw/capacity fields | exact-unit and resource-normalization tests |
| Nchan OOM evidence | Nchan control cgroup `memory.events` | after valid generator/timing/environment, positive `oom_kill` delta is direct DUT capacity REJECT; generator OOM remains INCONCLUSIVE | shard Nchan resources, classifier/global result | classifier precedence and resource tests |
| Redis CPU capacity | exported Redis cgroup + INFO CPU | own quota/period/cpuset, narrower limit wins | Redis resource raw/capacity fields | resource normalization/infrastructure |
| Redis memory bytes | Redis `INFO MEMORY` parser | numeric `used_memory` bytes mandatory; publisher-owner scope once; never hard-coded or summed | shard/global/campaign `memory_used_bytes` | exact parser, coordinator and missing-field campaign tests |
| literal restart range | serialized accepted publisher range + `evaluateRestartRequiredRange()` | unique in-range set exactly equals the frozen range; no missing/prefix/required-duplicate/required-order/out-of-range error; `target_reached` means set complete | structured literal path, explicit missing-sequence/out-of-range fields, and exact counters | literal matrix in `restart-exact-range.test.ts`; live Docker smoke exact 8/8 path |
| cross-node replacement range | same canonical evaluator, with node-2 resume | same exact-set predicates; later live sequence cannot substitute for a missing required sequence | structured cross-node path, explicit missing-sequence/out-of-range fields, and exact counters | cross-node matrix in `restart-exact-range.test.ts` + live-path assertions in `nchan-restart.test.ts` |
| terminal disconnect attribution | connection pool terminal removal | one removal, one category, one dropped increment when applicable | attribution counters | duplicate-terminal tests |
| global restart/correctness proof | coordinator/campaign validates raw role records | exactly one owner with both exact bound paths; non-owners non-participating with no fabricated paths; stale `passed=true` cannot bypass structure | raw shard results, global scenario and campaign verdict | owner/non-owner/stale/multiple/no-owner/out-of-range adversarial matrix |
| Nchan/Redis shared resources | publisher-owner shard | observe once, never sum duplicate observers | global `resources` | coordinator shared-resource tests |
| shard eligibility | shard result builder | scope/aggregate scope shard; direct eligibility false | shard JSON | direct-claim tests |
| global verdict/eligibility | coordinator | invalid evidence INCONCLUSIVE; valid DUT failure REJECT; all valid/pass ACCEPT | one global result | global classifier/adversarial/integration |
| campaign freshness and exact input set | launcher + campaign CLI | unique Compose/campaign identity; no prior labeled resources/output; exact filenames; result mtime/timestamp after start; exact source/seed/index/run/shard binding | campaign policy and retained runs | infrastructure and stale-evidence adversarial tests |
| campaign dispersion/verdict | global campaign aggregator | 3–8 fresh global runs; common provenance; CV ≤15%; no inconclusive input | campaign result with retained global runs | global-campaign tests |
| detached terminal state | detached wrapper | start/end, launcher/child PID, exact quoted command, combined output and numeric exit; signal = 128+number | one unique launch record directory | exit 0, exit 37, signal 15→143, overwrite-refusal tests |

## Verdict precedence

1. Missing, inconsistent or invalid source/generator/environment/timing/topology/barrier/resource evidence: **INCONCLUSIVE**.
2. With generator/timing/environment validity, direct Nchan OOM-kill or another target, correctness, DUT or required-scenario failure: **REJECT**.
3. Only all-valid/all-pass global evidence: **ACCEPT**, with `global_direct_accept_eligible=true`.

Smoke output and every shard result have direct eligibility false.
