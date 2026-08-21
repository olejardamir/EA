# Experiment Contract v2.0.6 — Post-Inconclusive Correction Freeze

Status: **FROZEN — CANONICAL ACTIVE**

Contract Version: v2.0.6

Frozen: 2026-08-20

Scope: `poc/` coordinated 100,000-viewer experiment and its reduced validation paths

Supersedes: v2.0.5, which remains historical evidence. This correction freeze does not retroactively reinterpret or promote any v2.0.5 result.

## Inherited experiment definition

Unless this document explicitly changes a rule, v2.0.5 thresholds, the exact four-shard topology (4 × 25,000 = 100,000), phase order, workload, correctness criteria, 3–8-run repetition rule, 15% sample-CV limit, and ACCEPT/REJECT/INCONCLUSIVE precedence remain unchanged.

A v2.0.5 result cannot qualify as v2.0.6 evidence. Every v2.0.6 shard, simultaneous-global-run, and campaign result uses the single version producer in `runner/src/domain/active-contract.ts`.

## Correction record

| Evidence area | Frozen v2.0.6 rule | Reason for correction |
|---|---|---|
| Coordinator barrier deadline | One explicit application deadline governs the complete HTTP request. The client must not inherit a shorter library headers timeout and must not retry a phase barrier. | q5 run 0 ended at the approximately 300-second Undici headers timeout while the contract allowed an 11-minute barrier wait. |
| Generator CPU | Raw process CPU is normalized by assigned CPU capacity before applying the 90% gate. For an 8-core runner, 400% raw means 50% of assigned capacity. | q5 compared multi-core raw CPU directly with a whole-capacity threshold. |
| Generator event loop | The maximum observed event-loop p99 is preserved through final snapshot; stopping the monitor must not erase it. Generator validity requires a numeric preserved value below 100 ms and backlog at most 1,000. | q5 stopped the monitor before its final snapshot and emitted a false zero/null-like value. |
| Nchan-2 clock health | The replacement publisher/control health endpoint is supplied explicitly. Subscriber URL rewriting is not a permitted way to derive a control URL. | q5 health probes targeted the subscriber port. |
| Nchan CPU units | cgroup `usage_usec` deltas are converted from microseconds exactly once. Raw 100% means one full CPU; capacity percent divides by assigned cores. | q5 over-reported Nchan CPU by a factor of 1,000. |
| Nchan capacity | The preflight reports per-worker configured ceiling, actual worker RLIMIT, 256-FD reserve, worker count, and the even-distribution theoretical aggregate separately. It may not claim that the theoretical sum proves practical distribution. | q5 warned at approximately 44k–50k and peaked around 66k despite a theoretical aggregate of 130,048 usable descriptors. |
| DUT OOM | With valid generator, timing, and environment evidence, a positive Nchan cgroup `oom_kill` delta is direct DUT capacity evidence and yields REJECT. Generator OOM remains INCONCLUSIVE. | q5 Nchan reached the exact frozen 8 GiB limit and was killed; this is not a generator defect. |
| Redis memory | Shared Redis evidence contains numeric `memory_used_bytes` from `INFO MEMORY`; MB may be retained only as a display derivative. Null bytes invalidate the global run. | q5 collected numeric MB but the global schema expected a different absent field. |
| Burst histogram | Each shard emits its full serialized burst fan-out distribution and overflow count. The coordinator and campaign perform lossless sparse-bucket merges. Empty or missing distributions cannot pass. | q5 retained local burst phase histograms but discarded them at global aggregation. |
| Late join | Exactly one publisher-owner late-join sample is required per valid simultaneous global run; non-owners record zero. A qualifying campaign therefore contains at least one sample per run and at least three samples. | A single synchronized late join per global run is intentional, but the former campaign rule did not enforce the repeated-run population. |
| Restart/replacement | Exactly one publisher-owner participates. It supplies both exact path objects and binding fields `campaign_id`, `experiment_run_id`, `run_index`, and `shard_id`. Every non-owner is non-participating and has no fabricated path evidence. | Participant-only aggregation could hide invalid non-owner evidence or accept stale copied evidence. |
| Campaign identity/freshness | Campaign identity is unique, equals the Compose project identity, starts with no labeled storage/container/network, uses one source SHA, exact contiguous seeds and run indices, and rejects results older than campaign start. Existing aggregate files or an unexpected result-file set are fatal. | Prevents stale volume or mixed-campaign evidence from masquerading as a fresh campaign. |
| Detached execution | The wrapper records quoted command, start/end time, wrapper and child PID, combined output, and exact numeric exit status. Signal exits are encoded as 128 + signal number. | Shell detachment must preserve terminal state instead of losing or rewriting it. |

## Frozen result semantics

The result dimensions remain:

```text
shard -> simultaneous global run -> repeated-run campaign
```

One global run is valid only if all registered shards share campaign/run identity, source SHA, seed, target, and shard count; all required barriers complete; all mandatory histograms and resource fields exist; and role-specific scenario evidence is exact. A campaign accepts only an exact input set of 3–8 fresh, contiguous global results. It never scans and silently ignores extra files.

Histogram summaries are recomputed from merged distributions. Percentile summaries are never averaged. Burst, fan-out, and late-join distributions retain overflow counts. Zero samples is missing evidence, not zero latency.

The late-join campaign population is deliberately one owner measurement per repetition. It is not a mass-client cohort. A campaign with `N` valid global runs must contain at least `N` late-join samples, and `N >= 3`.

Restart/replacement PASS requires the literal-restart and cross-node paths each to have a positive frozen range; exact unique received count; no missing required sequence; no duplicate or ordering violation; no before/after-range substitution; and target reached. The structured object must be bound to its current campaign, run, index, and owner shard.

## Capacity and resource interpretation

For the frozen primary Nchan configuration:

```text
workers                                      4
worker_connections per worker          32,768
per-worker evidence reserve                256
theoretical per-worker SSE capacity     32,512
theoretical even-distribution aggregate 130,048
```

This is a ceiling model, not observed load-balancing proof. Listener, upstream Redis, publisher, control, and other descriptors share worker limits. A runtime `worker_connections are not enough` warning is direct evidence that at least one worker reached its configured ceiling. The q5 combination of those warnings, an approximately 66k active peak, exact 8 GiB cgroup memory ceiling, positive Nchan OOM events, and a signal-9 worker death invalidates the assumption that raising only `worker_connections` safely enables 100k. v2.0.6 therefore does not raise that setting.

Runner/generator, Nchan/DUT, and Redis limits are evaluated independently. Generator saturation suppresses architecture verdicts. Once generator, timing, environment, and mandatory resource evidence are valid, Nchan OOM-kill is a direct DUT REJECT and must take precedence over downstream connection-failure symptoms.

## Qualifying evidence and milestone decision boundary

Smoke and reduced probes always return `NOT_APPLICABLE` or otherwise remain non-qualifying. They can validate machinery but cannot prove the 100,000-viewer claim.

The q5 campaign remains v2.0.5 INCONCLUSIVE. Its invalid measurement fields are not repaired after the fact. Milestone-4 reconciliation may nevertheless use direct architecture observations—Nchan OOM, worker-limit warnings, and active-population collapse—to revise or reject the single-node architecture assumption. If that decision is taken, no new qualifying rerun is required by this correction contract; corrected source is closed with a Milestone-2 re-audit and reduced validation only.
