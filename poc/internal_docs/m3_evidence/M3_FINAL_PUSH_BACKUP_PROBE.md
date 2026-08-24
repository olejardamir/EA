# M3 Final Push — backup candidate probe (2026-08-24)

## Command
```
cd poc && ./run-probe.sh 4000        # 4k smoke, backup config applied to nchan-2/3/4/spare
```
Stack: `m3-final-push` branch, HEAD after `97c11f7` (coordinator resolve-once harness fix).
nchan config: `nchan_redis_storage_mode backup;` present in nchan-2/3/4/spare (exact G1 candidate from `ffe3ae6`); nchan.conf (p0) unchanged (matches the recorded G1 config).

## Phase A result — COORDINATOR DNS BLOCKER: FIXED
No `lookup coordinator … server misbehaving`. All 12 phase barriers advanced past
`late-join:start` for all 4 shards, e.g.:
```
loadgen-shard-0-1 | [loadgen ...] barrier late-join:start released
```
The resolve-once pinned-transport harness fix removed the Docker DNS churn that
aborted G1/G1b/H1/H2 at the late-join barrier.

## Phase B/C result — backup candidate: INVALID (late-join correctness regression)
The run no longer aborts on DNS; it now reaches the late-join scenario, where a
DUT-semantics regression under `storage_mode backup` blocks completion:

- shard 0 (owner p0): completed all 64 late-join rounds instantly
  (`match-008 round 7 passed=true recovery_ms=1 missing=0`).
- shards 1/2/3 (non-owner p1/p2/p3): every late-join round failed with
  `passed=false recovery_ms=30000 missing=190` (history replay delivers 190
  missing messages). They never reach `late-join:end`, so shard 0's barrier call
  hangs until the 11-minute timeout:
```
loadgen-shard-0-1 | barrier late-join:end failed: Post "http://coordinator:3000/v1/barrier": context deadline exceeded (Client.Timeout exceeded while awaiting headers)
loadgen-shard-0-1 | run aborted: late-join end barrier
loadgen-shard-0-1 | result submitted verdict=INCONCLUSIVE
```

## Interpretation
`storage_mode backup` serves late-join `/history/` (oldest) replay from the
partition-local memory store. Non-owner partitions (p1/p2/p3) do not hold the
full pre-existing channel history in local memory, so the reconnect/late-join
cohort observes missing messages and the run cannot satisfy the frozen
correctness gate (0 missing/dup/order). This is a DUT-storage-semantics change,
not a harness/control-plane defect — the harness DNS fix is confirmed working.

## Decision (per prompt §9 Case 4 / §14B)
`backup` regresses correctness/validity → preserve this probe, revert the backup
candidate to the clean F1 baseline, and stop M3 performance tuning. No further
knobs, no topology/binary/gate changes. Best validated result remains **F1**
(fan_out p95 2757 ms, burst p95 3707 ms, correctness 0, peak 100k).

## Evidence
- Container logs: `poc/evidence-launches/ea-probe-4000-20260823t220646/run-probe-4000.log.txt`
- No global-result JSON emitted (coordinator `persistGlobalResult` aborted on null
  redis info after the late-join barrier hang; verdict INCONCLUSIVE).
