# Milestone 4 — q5 INCONCLUSIVE Reconciliation

Date: 2026-08-20

Decision: **Terminal A — revise the single-node fan-out assumption; do not run an artificial replacement M3 campaign**

Historical campaign: `m3-c89159e88822-q5`, source `c89159e8882206de9fffa2b170a38d76854288ce`, contract v2.0.5, machine verdict `INCONCLUSIVE`.

The q5 evidence is immutable. This document does not convert it to ACCEPT or REJECT. It separates defects that made the machine campaign inconclusive from direct observations that are sufficient for M4 to stop treating one frozen Nchan primary as a defensible 100,000-viewer architecture.

Evidence cited below is in the preserved top-level `internal_docs/m3_evidence/m3-c89159e88822-q5/` directory. No file in that directory was modified.

## Required observation classification

| q5 observation | Classification | Evidence | Cause confidence | Blocks ACCEPT/REJECT? | Code/config change? | Architecture change? |
|---|---|---|---|---|---|---|
| Run 0 shard fetch failure; 0/4 results | **A — harness defect** | At `reconnect:end`, shard 0 waited from approximately 02:36:12 until 02:42:03. Its stack is `requestJson -> phaseBarrier -> main`; the cause is Undici `UND_ERR_HEADERS_TIMEOUT`. The application supplied 660,000 ms, but Fetch inherited the approximately 300-second Undici headers deadline. Nchan had also emitted a signal-9 worker death at 02:40:37, but the exact failure type is the deterministic shorter client timeout. | High | Blocks both: no complete run can be classified. | Yes: one explicit whole-request deadline, no retry. | No by itself. |
| All generator shards invalid in runs 1–2 | **D — measurement/provenance limitation**, plus **D — clock endpoint construction defect**; **B/C not proven** | Raw runner CPU was 331.8–455.9%, but the already-emitted normalized values were only 41.48–56.99% of the assigned eight CPUs. Backlog was 0–5. The classifier used the raw value against 90%. Final event-loop p99 was zero because monitoring was stopped before a resetting snapshot. Every shard also marked environment invalid because Nchan-2 health was derived from an untransformable subscriber URL and hit the wrong port. No runner throttling or OOM was recorded. | High for measurement defects; low for any real generator or host saturation claim. | Blocks both under v2.0.5 because generator/environment validity is mandatory. | Yes: normalized gate, preserved event-loop peak, explicit Nchan-2 publisher/control URL. Thresholds unchanged. | No generator architecture change justified. |
| Global active peak only 65,015 / 66,251 | **E — genuine DUT/configuration limitation** and **F — architecture-significant result**, with downstream-consequence qualification | Both complete runs converged near 65–66k, far below 100k, while Nchan repeatedly reported worker-connection exhaustion and reached its exact 8 GiB cgroup ceiling. | High that the population was real; medium-high on the precise split between per-worker distribution and memory exhaustion. | Blocks ACCEPT. It cannot make historical q5 a clean REJECT because v2.0.5 validity failed first. | Improve capacity evidence; do not raise the limit blindly. | Yes: single-primary 100k assumption is withdrawn. |
| Surge established only roughly 30–41% of required additions | **E**, combined with downstream effects; **B/C not supported by recorded runner resources** | Run 1 shard surge deltas established 2,562/12,562, 4,205/9,288, 3,961/8,192, and 3,541/8,014 attempts. Run 2 remained failure-heavy. Runner capacity percent stayed below 57%, backlog at most 5, while Nchan warnings/OOM were present. | Medium-high | Blocks ACCEPT; does not independently cleanly reject historical q5. | Keep generator validity correction and surface DUT OOM in shard/global resources. | Yes in combination with the capacity evidence. |
| `32768 worker_connections are not enough, reusing connections` | **E — genuine configured per-worker ceiling** and **F — architecture signal**; the old aggregate preflight was also **D — an overclaiming model** | Four workers × 32,768 is 131,072 raw. With the frozen 256 reserve it is 32,512/worker and 130,048 theoretical even-distribution aggregate. Actual per-worker distribution/open-FD counts were not recorded. Repeated warnings prove at least one worker hit 32,768; practical observed active population topped at 66,251. | High for a reached per-worker ceiling; medium for exact practical ceiling. | Blocks ACCEPT. Historical clean REJECT remains blocked by validity defects. | Report ceiling/reserve/model/distribution separately. Frozen setting remains 32,768. | Yes: connection distribution/fleet shape must change. |
| Fan-out p95 1,135 / 1,267 ms | **E — real measurement at degraded sub-target load**, but not independent 100k evidence | The merged distributions contain 41,603,062 and 33,177,002 samples with no histogram overflow. The values are not fabricated, but occurred at 65–66k amid OOM, connection reuse, duplicates and invalid run-level evidence. | High for observed latency; medium for primary cause. | Blocks ACCEPT; cannot independently yield q5 REJECT. | Burst/global merge fixed separately; fan-out threshold unchanged. | Supports change, but is not the sole reason. |
| 1,910,652 / 1,179,447 duplicates | **E — observed correctness failure**, probably a downstream connection-reuse/recovery consequence | Global correctness counters are non-zero by millions in both complete runs, concurrent with worker reuse warnings and Nchan OOM. The evidence does not isolate which of connection reuse, recovery, or subscriber lifecycle produced each duplicate. | High for occurrence; medium for cause. | Blocks ACCEPT; invalid generator/environment blocks clean historical REJECT. | No threshold change. Retain exact counters and scenario binding. | Supports change. |
| Reconnect gaps 103,197 / 51,859 | **E — observed recovery failure**, downstream of connection exhaustion/collapse | Run 1 active population fell from 58,515 to 36,296 minimum and ended 36,591 during reconnect. Gaps accompany reconnect failures and the signal-9 Nchan worker loss. | High for occurrence; medium-high for downstream cause. | Blocks ACCEPT; not an independent clean historical REJECT. | No relaxation. Barrier transport fix is separate. | Supports change. |
| Slow-consumer failure | **E consequence**, not an independent backpressure conclusion | Run 1 entered slow-consumer at only 36,591 active; run 2 was below global target and later restart population was 38,140. The required target population was already absent, so the scenario cannot isolate slow-consumer behavior. | High | Blocks ACCEPT; cannot independently reject the architecture’s backpressure behavior. | No scenario-threshold change. | No separate change beyond fixing scale architecture. |
| Campaign CV 173.2% | **D — aggregation/provenance consequence**, not root cause | CV includes run 0’s zero/missing histograms against runs 1–2. The 173.2% late-join CV is mathematically consistent with counts 0/1/0, but measures abort/missing-evidence dispersion rather than repeatability of valid runs. | High | Blocks both through the frozen stability gate. | Fresh exact input set and mandatory populations; formula unchanged. | No. |
| Redis `memory_used_bytes = null` | **D — schema/field-path defect** | Owner resources already contained numeric `memory_peak_run_mb` (9.234 and 7.579 MiB). Collection succeeded; the global schema never emitted the mandatory byte field. | High | Blocks both because mandatory evidence is absent. | Yes: carry exact `INFO MEMORY used_memory` bytes through monitor, shard, global and campaign. | No. |
| Merged burst p95 `null` | **D — scenario/aggregation defect** | Local phase histograms existed with roughly 254k–304k samples/shard and p95 593–868 ms, but the shard/global schema had no burst distribution. `BurstScenario` also read a bounded raw-sample slice and reported p95=0 on the owner. | High | Blocks both because missing burst evidence cannot pass. | Yes: serialize full per-phase distribution and merge losslessly with overflow. | No. |
| Late join count 1 / 0 | Run 1 is **intentional owner-only semantics**; run 2 is **E downstream failure** (`prefill incomplete: 499/500`); the absent campaign minimum was **D** | Run 1 owner produced one exact 1..1062 replay sample and non-owners correctly produced zero. Run 2 owner recorded no latency because prefill accepted only 499/500. v2.0.5 did not enforce one sample per repetition/a campaign minimum. | High | Run 2 and a campaign cohort below run count block both. | Yes: exactly one owner sample per valid global run; campaign population at least run count and therefore at least three. | No. |
| Campaign restart-evidence complaint | **A — campaign role-aggregation defect**, while owner path failures are **E — real correctness failures** | Old aggregation required every detail, including legitimate non-owner `participated=false, paths={}`, to contain exact paths. Correct role semantics remove that false complaint. They do not repair owner evidence: run 1 missed sequence 1694 (7/8), run 2 missed 1403–1405 (5/8), and run 0 has none. | High | The aggregator defect blocks both. After correction the historical owner failures still block ACCEPT; q5 remains INCONCLUSIVE. | Yes: exact owner, three strict non-participants, run/campaign binding; adversarial cases required. | Owner failures support change but are not independently conclusive under invalid q5. |

## Run 0 request and state reconstruction

The failed request was shard 0’s `POST /v1/barrier` for `reconnect:end`. The coordinator intentionally holds a barrier response until all four shards arrive. Shard 0 entered the wait at approximately 02:36:12; reconnect work continued elsewhere, Nchan’s worker 9 exited on signal 9 at 02:40:37, and shard 0 failed at 02:42:03—about 351 seconds later—with `HeadersTimeoutError` / `UND_ERR_HEADERS_TIMEOUT`. The configured barrier deadline was 11 minutes, but Node Fetch’s shorter default header timeout won.

The coordinator was alive and emitted the abort result. Redis was alive and completed background saves. Docker networking remained able to deliver logs and coordinator shutdown. Other runners were still doing reconnect work. Nchan was not healthy—it had lost a worker—but that resource event does not change the deterministic client-side error classification. Retrying the barrier would hide control-plane failure and was not added.

v2.0.6 uses `node:http` with exactly one application timeout over the request. Focused tests hold a response beyond the former short-test boundary and prove success inside the deadline, then prove one exact timeout with no retry.

## Generator and environment separation

The complete q5 shard results already contain the correct capacity-normalized runner CPU values:

```text
run 1: 42.72%, 48.00%, 56.92%, 56.99%
run 2: 41.48%, 43.14%, 47.72%, 56.29%
backlog peak: 0..5
runner throttle/OOM: zero
```

The v2.0.5 `generatorHealthy` expression mistakenly used raw CPU (100% per core) against a 90% whole-allocation threshold. That is a classifier wiring defect, not evidence for increasing CPU allocation. Event-loop evidence is unknowable after the fact because stop/reset ordering emitted zero; v2.0.6 preserves its observed peak. Nchan-2 reachability was also unknowable to the old check because `http://host.docker.internal:18081` had neither `/sub/` nor `:8081`, so its string replacement did nothing and probed the subscriber port. The publisher/control endpoint is now explicit.

The host exposed 12 CPUs while configured quotas summed well above 12 across four runners, primary/replacement Nchan and Redis. That is potential oversubscription, but q5 recorded no runner or Nchan throttling and did not record a host scheduling trace. M4 therefore does not promote potential host contention to a proven C-class cause.

## Nchan capacity model

The q5 preflight proved limits, not distribution:

```text
Nginx workers                              4
worker_connections per worker         32,768
worker RLIMIT_NOFILE                  200,000
frozen per-worker reserve                 256
theoretical per-worker SSE ceiling     32,512
theoretical aggregate (even load)     130,048
primary Nchan CPU limit                     4
primary Nchan memory limit              8 GiB
observed global active peak        65,015 / 66,251
observed primary memory peak     8,589,934,592 bytes
observed Nchan cgroup events       oom=1, oom_kill=1
```

Listener, accepted subscriber, publisher, control, IPC, Redis-upstream and other descriptors all consume worker connections/FDs. q5 did not preserve per-worker FD distribution or a point-in-time total open-connection census, so an exact analytical practical ceiling cannot honestly be claimed. The defensible practical bound for this configuration is observational: it failed to exceed 66,251, one or more workers reached 32,768, and Nchan exhausted 8 GiB. Raising `worker_connections` alone would increase a theoretical descriptor ceiling while the tested process was already memory-killed; it is not a justified correction.

The old Nchan CPU numbers (up to hundreds of thousands of percent) are invalid by exactly ×1,000 because `usage_usec` was divided by 1,000 while wall time was in seconds. v2.0.6 divides by 1,000,000 and tests that one million microseconds over one second equals 100% of one CPU.

## Corrective closure

| Remaining item | Closure |
|---|---|
| R1 M4 classification | Closed by the table and causal analysis above. |
| R2 restart aggregation | Exact owner evidence plus strict non-owner non-participation and campaign/run/shard binding; seven adversarial classes covered. |
| R3 run-0 fetch | One explicit whole-request timeout; delayed-success and exact-timeout/no-retry tests. |
| R4 generator validity | Capacity-normalized CPU, preserved event-loop peak, explicit Nchan-2 health URL; thresholds unchanged. |
| R5 Nchan capacity separation | Theoretical/per-worker model exposed; CPU units corrected; OOM carried in shard evidence and classified as DUT capacity only after generator/timing validity. No limit increase. |
| R6 Redis memory | Exact numeric bytes carried end-to-end and required at global/campaign scope. |
| R7 burst | Full phase distribution, global/campaign lossless merge, overflow and empty-evidence guards. |
| R8 late join | Exactly one owner sample per valid global run; qualifying campaign cohort at least run count/minimum three. |
| R9 exact exit | Detached wrapper records timestamps, launcher/child PIDs, quoted command, combined output and exact exit status; tests cover 0, 37 and signal 15 → 143. |
| R10 stale evidence | Unique campaign/Compose identity, refusal of labeled prior resources, exact result filename set, timestamp/mtime/source/seed/run/campaign/shard checks, and refusal to overwrite campaign/detached outputs. |

All material semantic and schema corrections are frozen as contract v2.0.6. v2.0.5 and q5 remain historical.

## Terminal decision

M4 chooses Terminal A. q5 did not validate the architecture and its machine verdict did not reject it. However, M4 has enough direct evidence to reject the *assumption* that the frozen one-primary-node shape is a credible route to 100,000 simultaneous viewers:

- the primary reached the exact 8 GiB limit and recorded OOM plus OOM kill in every surviving shard observation;
- Nginx repeatedly hit at least one 32,768 per-worker connection ceiling and began reusing connections;
- active population converged at approximately 65–66k in both complete attempts;
- millions of duplicates, tens of thousands of reconnect gaps, failed exact restart replay and >1-second fan-out p95 occurred at that sub-target population;
- corrected generator arithmetic does not support the claim that runner saturation caused the ceiling.

The architecture must be reframed around explicit horizontal connection partitioning and capacity isolation—multiple independently bounded fan-out nodes/fleet shards with routing and failure-domain ownership—or a different fan-out technology. Any later test must target that revised assumption. It must not silently raise the current primary’s worker or memory limit and call the same design validated.

Accordingly, no new qualifying 100,000-viewer M3 campaign is launched. The remaining work is the v2.0.6 M2 re-audit and reduced non-qualifying validation of corrected machinery. Those validations do not replace q5 and cannot produce an architecture ACCEPT.
