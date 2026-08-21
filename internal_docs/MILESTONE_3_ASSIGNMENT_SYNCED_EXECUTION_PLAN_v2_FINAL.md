# Milestone 3 — Run the Frozen POC and Produce Defensible Evidence — 100% End-to-End Plan

**Plan status:** FINAL PLANNING AUDIT COMPLETE — READY FOR EXECUTION ONLY AFTER ALL PRE-M3 GATES PASS  
**Planning date:** 2026-08-20  
**Repository:** `olejardamir/EA`  
**Audited planning baseline:** `a9d5ce2691919b5484ae961685d9780acee44460`  
**Active frozen contract:** `internal_docs/LIVE_MATCH_CENTRE_POC_EXPERIMENT_CONTRACT_v2_0_5.md`  
**Previous milestone:** Milestone 2 — DONE  
**This milestone:** Milestone 3 — RUN THE FROZEN POC AND PRODUCE EVIDENCE  
**Next milestone:** Milestone 4 — reconcile the measured result with the production architecture

---

# 0. Mission

Milestone 3 is **not another implementation milestone**.

Its purpose is to execute the already-frozen POC honestly, at the frozen qualifying scale, and produce one defensible measured campaign result that can later be summarized in the assignment's required README write-up.

The assignment asks for:

```text
one small runnable experiment
that tests the riskiest locally testable architecture assumption
and produces a measured result
```

The qualifying Milestone 3 result must therefore be:

```text
frozen before observation
locally executed
one-command at the normal POC entry point
cloud-free
measurement-based
reproducible
classified as ACCEPT / REJECT / INCONCLUSIVE
not cherry-picked
not threshold-adjusted after observation
```

A truthful `REJECT` or `INCONCLUSIVE` is a valid result.

A favorable result obtained by changing the test after seeing data is not.

---

# 1. Assignment source of truth

Use this precedence during Milestone 3:

1. `requirement.pdf` — original take-home assignment.
2. Explicit candidate decisions that do not contradict the assignment.
3. `internal_docs/AGENTS.md`.
4. `internal_docs/LIVE_MATCH_CENTRE_POC_EXPERIMENT_CONTRACT_v2_0_5.md`.
5. `internal_docs/TRACEABILITY_MATRIX.md`.
6. `internal_docs/LIVE_MATCH_CENTRE_ASSIGNMENT_MILESTONES (3).md`.
7. Current executable `poc/`.
8. Historical contracts/documents only for provenance.

If code, documentation, or an old result contradicts the original assignment, the assignment wins.

If executable behavior contradicts the active frozen contract, **do not reinterpret the result**. Stop the qualifying campaign and return to Milestone 2 correction/re-audit.

---

# 2. Direct assignment synchronization

The original assignment requires the POC to:

| PDF assignment requirement | Milestone 3 interpretation |
|---|---|
| Test the riskiest architecture-invalidating assumption | Test the frozen Nchan + Redis OSS + SSE local fan-out/history/resume assumption |
| If the genuine riskiest assumption cannot be tested locally, test the riskiest one that can and say so | Keep provider-feed semantics explicitly outside the local POC because no real provider/schema is supplied |
| Use the smallest experiment that produces a measured result | Run only the frozen POC; do not build the production system |
| Run locally with one command | Use the frozen local campaign launcher; no cloud account |
| Require nothing beyond a container runtime on the normal reviewer path | Do not introduce Node/npm/cloud tooling as a reviewer dependency |
| Produce a measured result, not a UI demonstration | Preserve machine evidence and campaign verdict; do not add a UI |
| Rough experiment-grade code is acceptable | Do not productize the POC during M3 |
| Simulate the event stream | Continue using the frozen simulator; do not connect to a real feed |
| No full implementation | Do not build the frontend, AWS production architecture, ingest stack, or production deployment |
| No cloud deployment / no real infrastructure spend | Run entirely locally |
| README later contains <=300-word assumption -> method -> result -> proposal-change write-up | M3 must preserve the exact measurements needed for that later write-up |
| Final `poc/` contains no generated artifacts/logs | Raw M3 evidence must not remain in final `poc/` |
| Every number and decision must be explainable | Preserve provenance for every reported measurement and classification |

---


## 2.1 Complete PDF scenario-to-M3 coverage audit

The assignment scenario contains many production obligations. Milestone 3 must not pretend that one
local POC proves all of them. Every scenario requirement is classified below so that the final write-up
cannot overclaim.

| Assignment scenario / constraint | M3 treatment | Evidence level |
|---|---|---|
| Public, anonymous, read-only, no accounts | Not implemented as product behavior; this is why SSE is an appropriate one-way transport | production design input |
| Lobby shows all live matches / score / minute | Lobby traffic/state is simulated; no production UI is built | workload/model evidence only |
| Goals/cards update live without refresh | Event delivery is exercised; browser rendering is not | local delivery measurement only |
| Late join sees everything so far | Explicit late-join retained-history scenario | directly exercised locally |
| Reload / phone wake recovery | Reconnect/resume is exercised as the local transport analogue; no real mobile browser sleep test | partial local analogue |
| Never blank / no manual refresh | Not a UI POC claim | production design inference |
| Score agrees with visible events | Late-join reconstruction must match frozen score/clock/head state | directly exercised in local event model |
| No duplicates | Frozen correctness gate | directly exercised |
| Nothing disappears | Frozen missing-sequence/replay gates after accepted publication | directly exercised after the provider boundary |
| Nothing arrives out of order | Frozen ordering gates | directly exercised |
| Goal p95 <=2s ingest->screen | POC measures a stricter delivery-layer sub-budget, not full ingest->screen | partial local measurement |
| Other-event p95 <=5s ingest->screen | Same limitation as goal latency | partial local measurement |
| Full history visible <=2s | Late-join catch-up p95/local observation <=2s | directly exercised at delivery layer |
| 8 live matches | Eight simulated match channels | directly shapes workload |
| ~10 events/s steady | Frozen simulator mapping (~9 match/s + lobby updates) | assignment fact -> experiment mapping |
| ~50 events/s burst | Frozen burst rate | directly shapes workload |
| Provider delivery is best-effort / no long retry | POC does NOT manufacture recovery for provider events never received; it tests application-induced loss only after local acceptance | external boundary limitation |
| 100,000 concurrent viewers | Four coordinated shards ×25,000 | directly exercised |
| +40,000 viewers within 2 min | 60,000 ->100,000 coordinated surge over 120s | directly exercised |
| Experience identical at 100 vs 100,000 | Qualifying POC measures peak/surge absolute correctness/latency; it does NOT perform a controlled 100-vs-100k differential comparison | partially evidenced; no differential claim |
| ~60% Europe / ~40% North America | Not locally reproduced; no geographic production claim from M3 | later production inference |
| <=$3,000/month peak | Not a local benchmark question | M5 cost model |
| Weekly deploys during live matches unnoticed | Literal restart/cross-node recovery is a local failure/recovery analogue only; it is not a production rolling-deploy proof | partial local analogue |
| Next.js App Router/component frontend | Out of POC scope | proposal requirement |
| AWS preferred / justify alternative | No cloud deployment in POC | proposal requirement |
| Score/clock derived from event stream | Local simulated canonical event/state model does this; does not prove production Lambda implementation | local model evidence |

### 2.1.1 Crowd-invariance wording rule

Do **not** write:

```text
the POC proved the experience is identical at 100 and 100,000 viewers
```

unless a controlled differential test is actually added under a newly frozen contract.

The current qualifying experiment may support only:

```text
the local delivery layer satisfied / failed / could not validly evaluate
the frozen correctness, latency, replay and surge criteria at the 100,000-viewer target.
```

The 100-viewer portable smoke is a validation profile, not a statistically controlled baseline for a
100-vs-100,000 equality claim.

### 2.1.2 Capacity-headroom wording rule

The active experiment targets the assignment-required 100,000 viewers. It does not intentionally
find the maximum capacity knee above 100,000.

Therefore an ACCEPT means:

```text
survived the frozen experiment at the required target
```

not:

```text
has proven spare production capacity above 100,000
```

Do not add >100k load after seeing the result merely to create a headroom claim. That would be a new
experiment.


# 3. What assumption Milestone 3 is actually testing

## 3.1 Genuine weakest overall assumption

The production architecture still depends on unknown third-party feed semantics.

The assignment gives:

```text
best-effort delivery
no long retry window
score and clock derived from the provider event stream
```

but does not provide a real feed or schema.

Therefore the POC cannot honestly prove:

```text
provider replay exists
provider sequence IDs exist
provider correction semantics
provider deduplication semantics
provider recovery of never-delivered events
```

This must remain an explicit production assumption.

## 3.2 Riskiest locally testable assumption

The frozen locally testable assumption is:

> A Nchan + shared Redis OSS + native SSE delivery layer can sustain the assignment-mapped live-match workload at 100,000 simultaneous viewers, including the +40,000/120s kickoff surge, while preserving required ordering/replay behavior, bounded slow-client behavior, acceptable late join, and adequate delivery latency without the generator or host invalidating the measurement.

This is the assumption Milestone 3 measures.

Do not silently broaden the POC into proof of the entire production architecture.

---

# 4. What the M3 result can and cannot prove

## Directly exercised in M3

The qualifying campaign directly exercises or materially measures:

```text
100,000 simultaneous viewers
+40,000-viewer / 120-second surge shape
8-match workload distribution
~10 events/s steady workload mapping
~50 events/s burst workload mapping
fan-out latency inside the local delivery experiment
late join / retained history
resume / reconnect
ordering
duplicates
missing sequences
hot-match concentration
slow-consumer behavior
Nchan restart / replacement replay
generator health
Nchan/Redis/runner resource behavior
multi-run stability
```

## Assignment requirement directly aligned

The assignment requires:

```text
full match history visible within 2s
```

The POC's frozen late-join gate is:

```text
late_join_p95 <= 2000 ms
```

That is a direct local test of the delivery-layer portion of this requirement.

## Assignment latency requirement only partially represented

The PDF requires:

```text
goal p95 <= 2s from ingest to viewer screen
all other event p95 <= 5s
```

The local POC's frozen fan-out criterion is tighter:

```text
fan_out_p95 <= 500 ms
burst_fan_out_p95 <= 1000 ms
```

This provides delivery-layer headroom.

It does **not** by itself prove the full production path:

```text
provider -> ingest -> processing -> network/edge -> browser render
```

Do not write that M3 directly proved the assignment's end-to-end screen latency.

That mapping belongs in M4/M5/M6.

## Outside M3

Do not turn these into additional M3 experiments:

```text
60% Europe / 40% North America production routing
AWS deployment
monthly production cost <= $3,000
Next.js frontend implementation
weekly production deployment continuity
real provider semantics
real browser rendering latency
full production security/observability
```

Those are proposal/inference/evidence tasks for later milestones.

---

# 5. Frozen experiment identity

Before the first qualifying run, freeze and record:

```text
source_commit
contract_version = v2.0.5
campaign run count
base seed
derived seeds
global target
shard count
local target per shard
publisher-owner shard
Compose file
campaign launcher
Docker Engine version
Docker Compose version
host OS/kernel
host CPU
host RAM
ephemeral port range
```

At the currently audited baseline:

```text
source commit:
a9d5ce2691919b5484ae961685d9780acee44460

contract:
v2.0.5

topology:
4 generator shards
25,000 viewers per shard
100,000 exact global target
one publisher-owner
one global coordinator

default campaign repetitions:
3

default base seed:
42

qualifying seeds if defaults are frozen:
42
43
44
```

If repository `HEAD` changes before the qualifying campaign:

```text
DO NOT simply substitute the new SHA and run.
```

First:

1. diff the new HEAD against the audited M2 baseline;
2. determine whether any POC behavior, contract, measurement, launcher, classifier, or evidence path changed;
3. re-run the relevant Milestone 2 regression audit;
4. only then freeze the new M3 baseline.

---


# 5.1 M3 number-provenance discipline

The assignment explicitly requires the candidate to stand behind every number and every decision.

Some internal historical ledgers label frozen experiment choices as `ASSIGNMENT_FACT` even though
they do not appear in the PDF. M3 must use the PDF itself as authority and correct the evidence level
when writing the M3 manifest or later README.

## Actual assignment facts relevant to M3

```text
8 concurrent matches
~10 events/s total steady
~50 events/s total burst
100,000 concurrent viewers
+40,000 viewers within 120 seconds
goal p95 <=2s ingest->screen
other-event p95 <=5s ingest->screen
full history <=2s
no cloud deployment / no real infrastructure spend
local one-command POC
simulated feed is expected
```

## Derived values

```text
60,000 pre-surge population = 100,000 - 40,000
4 x 25,000 generator shards = 100,000 global target
24 surge scheduling batches = 120s / 5s
```

## Frozen planning / experiment assumptions — NOT PDF facts

Examples include:

```text
3 qualifying global runs
base seed 42
15% cross-run CV threshold
5% slow-consumer cohort
2% lobby-viewer fraction
80% hot-match burst concentration
500ms normal fan-out delivery-layer p95 sub-budget
1000ms burst p95 sub-budget
30s warm-up
120s steady measurement interval
30s burst interval
10s cooldown
500-event late-join deterministic prefill
8-event restart exact-range depth
Nchan/Redis/runner CPU/memory envelopes
slow-consumer pacing/backpressure/recovery thresholds
```

These may remain binding because they were frozen before M3, but the final evidence must call them
**experiment choices / planning assumptions**, not assignment requirements.

## Production inferences — never local measurements

```text
CloudFront geographic behavior
real Internet latency
browser render latency
AWS deploy continuity
provider recovery semantics
monthly production cost
production headroom above the tested target
```

The evidence manifest must preserve these evidence levels.


# 6. Pre-M3 Gate A — working tree and code freeze

The qualifying campaign must not run against an ambiguous tree.

Require:

```text
git status --porcelain
```

to be empty for all code/config/contract files that affect the POC.

Record:

```text
git rev-parse HEAD
```

The SHA recorded in the machine output must equal that frozen source SHA.

No source edits are allowed between run 0 and the end of the campaign.

If a code/config change becomes necessary:

```text
STOP M3
make the correction
re-run relevant M2 tests/audit
freeze the new source SHA
restart the whole qualifying M3 campaign from run index 0
```

Never mix results from different source commits.

---

# 7. Pre-M3 Gate B — evidence isolation and campaign identity

This gate is mandatory.

The current `run-evidence-100k.sh` persists:

```text
global-result-0.json
global-result-1.json
...
campaign-result.json
```

in the Compose `global-evidence` named volume. The script deliberately continues after individual
global runs exit non-zero so the campaign aggregator can apply verdict precedence. `docker compose down`
does not remove that named volume.

Therefore stale evidence is a real integrity risk unless the campaign storage is isolated before run 0.

## 7.1 Freeze a unique Compose project identity

Before run 0 choose one unique qualifying campaign ID and freeze it, for example:

```text
m3-<12-char-source-sha>-q1
```

Set:

```text
COMPOSE_PROJECT_NAME=<that exact ID>
```

for the whole campaign.

Do not reuse a project name from any earlier qualifying or non-qualifying campaign.

The resulting Docker volumes must be new for this campaign, including:

```text
<project>_global-evidence
<project>_redis-cgroup-evidence
```

## 7.2 Prove storage is new

Before run 0, verify that the campaign's named evidence volume does not already contain results.

Acceptable proof:

```text
the project/volume did not previously exist
```

or:

```text
the volume exists but has been explicitly emptied before any qualifying container starts
```

A fresh unique project name is preferred because it avoids destructive ambiguity.

## 7.3 Result identity rules

Every result consumed by the campaign aggregator must be created by this campaign and must carry:

```text
current frozen source_commit
contract_version=v2.0.5
expected run_index
expected seed
expected global_target=100000
expected shard_count=4
unique experiment_run_id
```

No prior `global-result-N.json` or `campaign-result.json` may be accepted.

## 7.4 Failure rule

If evidence isolation cannot be proven:

```text
DO NOT RUN / DO NOT ACCEPT THE CAMPAIGN
```

Repair the evidence-isolation path, re-audit the affected Milestone 2 launcher/provenance code if code
changes, freeze the new source SHA, then restart M3 from run 0.

Never delete or replace a suspicious result **after seeing its verdict** and then continue the same
campaign.


# 8. Pre-M3 Gate C — assignment one-command / ZIP compatibility

This is an assignment compliance gate, not optional polish.

The PDF requires:

```text
runs locally with one command
no cloud account
nothing installed beyond a container runtime
```

The final ZIP contains `poc/`, not the repository's `.git/` directory.

At the current audited baseline, normal shell launchers call `git rev-parse` to obtain provenance.
Therefore the final reviewer path must be proven from a ZIP-like copy **before** final qualifying
evidence is frozen; otherwise a later launcher fix would change the measured source.

## 8.1 Clean extracted-copy test

Create a temporary copy containing only the intended POC source/config, with:

```text
no .git directory
no node_modules
no host Node/npm dependency
no cloud credentials
no hidden local service
no pre-generated result JSON
```

Run the intended documented POC command using only the container runtime.

If it fails because `git`, Node/npm, a hidden file, or another host dependency is required:

```text
M3 IS BLOCKED
```

Return to the minimum Milestone 2 reproducibility fix, re-run relevant tests/audit, freeze the new SHA,
then restart M3 planning identity.

## 8.2 Provenance must remain honest

Do not solve missing Git history by emitting:

```text
source_commit = unknown
```

while still permitting qualifying evidence.

A ZIP-compatible provenance mechanism must be deterministic and explainable. If it changes source/config,
it must be in the frozen code measured by M3.

## 8.3 Qualifying vs portable profile

The repository contains a portable 100-viewer smoke Compose profile. It is useful for reviewer sanity
on Docker Desktop, but it is explicitly non-qualifying.

Keep these claims separate:

```text
qualifying M3 campaign:
    coordinated 100,000-viewer evidence profile

portable smoke:
    fast measurement / path validation only
    NOT direct 100k evidence
    NOT a replacement for the qualifying campaign result
```

Later README instructions may offer both if useful, but must clearly identify which command produced
the reported qualifying result and which is only a portable smoke.

## 8.4 Platform scope

Record the OS/runtime used for qualifying evidence. If the 100k host-network topology is validated only
on Linux, say so. Do not silently generalize Linux benchmark evidence to Docker Desktop networking.


# 9. Pre-M3 Gate D — host suitability and frozen topology

The campaign is allowed to return `INCONCLUSIVE` when the host/generator prevents a valid test.

Do not weaken the target to fit the machine.

Verify the host can attempt the frozen topology.

Current selected resource envelopes are:

```text
Nchan primary: 4 CPU, 8 GiB
Nchan replacement: 4 CPU, 4 GiB
Redis: 2 CPU, 2 GiB
runner shard: 8 CPU, 8 GiB each container limit
4 runner shards

Nominal configured caps across Redis + Nchan primary + Nchan replacement + four runner shards sum to:

```text
42 CPU of container quota/caps
46 GiB memory caps
plus the coordinator process/container overhead
```

These are **not** claimed as minimum physical-host requirements; CPU limits are caps, not reservations.
The actual host may have less. However, if the host cannot drive the frozen workload without generator,
CPU, memory, FD, port or scheduler invalidity, the campaign must become INCONCLUSIVE rather than being
scaled down.

Record background host load and avoid knowingly running the qualifying campaign beside unrelated heavy
workloads. Do not invent a new pass/fail threshold for host idleness.

4 runner shards
```

The host does not need to be described as production hardware, but the actual environment must be recorded.

Preflight must verify at least:

```text
source-port headroom
actual Nginx worker FD limits
Nginx usable SSE capacity
runner FD limits
Nchan/Redis resource metric availability
clock model validity
Docker networking
four distinct generator shard source IPs
100,000 global target
25,000 local target per shard
one publisher owner
```

Failure to satisfy a mandatory environment/preflight condition is not a DUT PASS.

---

# 10. Pre-M3 Gate E — frozen campaign repetition and override policy

Do not choose the number of qualifying repetitions after seeing results.

For the current audited launcher, freeze:

```text
GLOBAL_RUNS=3
BASE_GLOBAL_SEED=42
```

which gives:

```text
run 0 -> seed 42
run 1 -> seed 43
run 2 -> seed 44
```

This is the smallest currently frozen repeated global campaign and satisfies the active contract's 3–8
run range.

## 10.1 Allowed qualifying command overrides

Freeze and record only the environment values needed to identify the campaign:

```text
GLOBAL_RUNS=3
BASE_GLOBAL_SEED=42
COMPOSE_PROJECT_NAME=<fresh unique qualifying project ID>
```

Use no ad-hoc Compose scaling flags and no hidden performance tuning.

Do not change during the campaign:

```text
TARGET_CONNECTIONS
GLOBAL_TARGET
SHARD_TOTAL
PUBLISHER_OWNER
event rates
phase durations
resource limits
slow-consumer settings
histogram limits
classifier thresholds
```

If any result-affecting override is required, stop and treat it as a new experiment/configuration that
must be frozen and re-audited before measurement.

## 10.2 No post-result extension

If the 3-run campaign is INCONCLUSIVE because cross-run dispersion exceeds the frozen 15% bound:

```text
do not append runs 3..7 to the already-observed campaign
```

Hand the result to M4. If the project later decides that a different predeclared repetition policy is
required, freeze that policy first and run a new campaign from index 0.

An adaptive 3->8 policy is allowed only if it is frozen in contract + executable machinery **before**
the qualifying run.


# 11. Pre-M3 Gate F — validation sanity check

Before the expensive qualifying campaign, confirm the frozen machinery still matches the audited state.

Recommended non-qualifying checks:

```text
runner typecheck
runner automated test suite
reduced coordinator integration test
smoke profile
machine-output/provenance probe
```

These are sanity checks.

They are **not** substitutes for the qualifying 100k campaign.

Current M2 audit recorded:

```text
372 tests passing
live non-qualifying smoke
coordinated-profile machine-output probe
```

If a sanity check fails:

```text
do not run the qualifying campaign
```

Investigate first.

---

# 12. Qualifying execution command and process-result capture

The frozen qualifying launcher is:

```text
poc/run-evidence-100k.sh
```

A qualifying invocation uses the frozen parameters and the fresh project identity, e.g. conceptually:

```bash
cd poc && \
GLOBAL_RUNS=3 \
BASE_GLOBAL_SEED=42 \
COMPOSE_PROJECT_NAME=<fresh-project-id> \
./run-evidence-100k.sh
```

Record the exact command actually used verbatim.

## 12.1 Non-zero exit is not automatically an invalid experiment

The campaign aggregator exits:

```text
0 -> campaign ACCEPT
non-zero -> campaign REJECT or INCONCLUSIVE, or an actual launcher/harness failure
```

Therefore an outer shell/CI wrapper must **not** automatically retry a non-zero exit.

Capture:

```text
process exit status
full stdout
full stderr
start/end wall-clock timestamps
```

Then inspect the machine campaign result to distinguish:

```text
valid REJECT
valid INCONCLUSIVE
unexpected launcher/harness failure
```

A valid REJECT/INCONCLUSIVE is evidence and must be preserved exactly.

## 12.2 Preserve the full console stream

Persist a raw qualifying log outside final `poc/`, for example:

```text
campaign-console.log
```

This is required because shard processes emit additional machine-readable provenance/limits to Compose
stdout that are not all duplicated in `campaign-result.json`.

Where practical, extract each shard's machine-readable JSON line into separate evidence files:

```text
run-0-shard-0-machine.json
...
run-2-shard-3-machine.json
```

Do not edit the raw console log.


# 13. What the launcher must execute

For each global run, the frozen path must:

1. create one global experiment identity;
2. start one coordinator;
3. start the shared Redis;
4. start the primary Nchan DUT;
5. start Nchan replacement/recovery node;
6. start four 25,000-viewer generator shards;
7. designate exactly one publisher-owner;
8. use coordinated start/end barriers;
9. reach the aligned 100,000-viewer population;
10. execute the frozen phases;
11. collect each shard result;
12. merge aligned samples;
13. merge histograms losslessly;
14. produce exactly one simultaneous-global-run result;
15. persist the result for that run.

The coordinated M3 path is the `run-evidence-100k.sh` global campaign path. Do not substitute the
legacy single-runner `run-evidence.sh` evidence-suite path.

In the coordinated path, restart/replacement exact evidence is required in **each simultaneous global run**;
do not apply the legacy single-runner "once per campaign" interpretation to M3.

After all three runs, the campaign aggregator must:

1. read exactly the three current global-run results;
2. confirm contract/source/target consistency;
3. enforce exact restart structured evidence;
4. evaluate cross-run dispersion;
5. produce one campaign result.

---

# 14. Frozen phase sequence

Do not reorder phases.

The active contract freezes:

```text
preflight
-> warmup
-> steady
-> surge
-> target-barrier
-> stabilization
-> late-join
-> burst
-> post-burst
-> reconnect
-> slow-consumer
-> restart-replacement
-> final-metrics
```

Every coordinated phase boundary must be released by all four shards.

A skipped/missing/aborted shard invalidates global evidence.

---

# 15. Assignment workload mapping that must remain intact

## Matches

```text
8 concurrent live matches
```

## Event rate

Assignment:

```text
~10 events/s total
burst ~50 events/s total
```

The campaign must preserve the frozen workload mapping; do not lower rates because the host struggles.

## Viewers

```text
100,000 simultaneous global target
4 x 25,000 local targets
```

## Kickoff surge

Assignment:

```text
+40,000 viewers within 120 seconds
```

The campaign's surge phase must represent the frozen 60% -> 100% increase:

```text
60,000 -> 100,000 global viewers
+40,000 in 120 seconds
```

## Hot match

Preserve the frozen hot-match concentration rather than evenly distributing traffic just to improve results.

---

# 16. Metrics that must be preserved

Do not report only the final word `ACCEPT`.

Preserve the actual measured basis.

At minimum preserve:

## Connection scale

```text
connections attempted
connections established
connection failures
active population start/end/peak/minimum
aligned global active peak
per-scenario active population
surge attempt/establishment rates
surge elapsed time
```

## Correctness

```text
missing sequences
duplicates
out of order
reconnect gaps
reconnect duplicates
reconnect order violations
schema validation errors
SSE parse errors
JSON parse errors
invalid timestamp count
missing transport ID
surge missing sequences
surge duplicates
surge out of order
unexpected client disconnects
server-initiated disconnects
network failures
restart exact-range evidence
```

## Latency

```text
fan-out p50/p95/p99/max
burst fan-out p95
late-join p50/p95/p99/max
surge fan-out p95
histogram sample counts
histogram overflow counts
```

## Late-join state coherence

Preserve the late-join detail fields proving the assignment's local score/history coherence analogue:

```text
expected_first_seq
expected_last_seq
history_expected
history_received_required
missing_required_sequences
duplicate_required_sequences
out_of_order_required_sequences
missing_prefix
reconstructed_score_matches
reconstructed_clock_matches
reconstructed_head_matches
count_matches
catch_up_ms
buffer_capacity / margins
```

A later write-up must not reduce this to a bare `late_join=PASS` if the underlying fields were not retained.

## Workload

```text
events attempted
events accepted/published
match rate
lobby rate
phase rates
hot-match concentration
```

## Slow consumer

```text
intended slow-client count
per-client median pacing
offered count
application-read count
missed live traffic
recovery coverage
backpressure evidence
healthy baseline p95
healthy-during p95
healthy degradation %
Nchan memory growth
memory boundedness/recovery
```

## Restart/replacement

For **both** literal restart and cross-node replacement:

```text
transport_resume_id
expected_first_seq
expected_last_seq
received_first_seq
received_last_seq
expected_count
received_required_count
missing_required
missing_required_sequences
duplicates
out_of_order
out_of_range_before_count
out_of_range_after_count
missing_prefix
target_reached
recovery_ms
passed
```

## Resources / validity

```text
generator CPU
generator event-loop p99
generator backlog
Nchan CPU
Nchan CPU throttling
Nchan run-scoped memory
Nchan OOM
Redis CPU
Redis memory
runner cgroup values
timing validity
source-port validity
Nginx worker capacity validity
actual runtime container limits
```

## Provenance

```text
source_commit
contract_version
run_index
seed
experiment_run_id
shard identity
scope / aggregate_scope
Docker versions
host environment
exact command
```

---

# 17. Executable conclusive gates — current audited classifier

The active machine classifier, plus the global coordinator/campaign aggregator, owns classification.
Documentation summaries must not override executable semantics.

At the audited baseline, a conclusive ACCEPT path includes all applicable gates below.

## Delivery / correctness

```text
fan_out_latency_p95_ms <= 500
late_join_p95_ms <= 2000
active concurrency target reached
missing_sequences == 0
duplicates == 0
out_of_order == 0
burst_fan_out_p95_ms <= 1000
reconnect_gaps == 0
reconnect_duplicates == 0
reconnect_order_violations == 0
restart exact structured evidence passes for literal + cross-node paths
```

## Slow consumer / resource boundedness

```text
independent slow offered measurement valid
slow-client pacing model valid within frozen band
slow replay recovery >=95% when field is produced
non-slow healthy degradation <=5%
Nchan slow-phase memory boundedness known and true
server-side backpressure actually reached, otherwise INCONCLUSIVE
Nchan run memory <7000 MB
Redis memory <1800 MB
```

## Parsing / schema / transport

```text
sse_parse_errors == 0
json_parse_errors == 0
invalid_timestamp_count == 0
schema_validation_errors == 0
missing_transport_id == 0
```

## Surge existing-viewer correctness

```text
surge_missing_sequences == 0
surge_duplicates == 0
surge_out_of_order == 0
surge_fan_out_p95_ms <= 500
```

## Unexpected disconnect attribution

```text
unexpected_client_disconnects == 0
server_initiated_disconnects == 0
network_failures == 0
```

## Global coordinated gates

```text
4 registered/participating shards
local targets sum exactly to 100000
exactly one publisher owner
all required start/end barriers complete
no non-owner publication
authoritative publisher produced workload
complete aligned concurrency buckets exist
aligned global active peak >=100000
global fan-out histogram non-empty
all scenario participants passed
restart exact structured evidence present
scenario active minimum:
    late-join >=100000
    burst >=100000
    slow-consumer >=100000
    restart-replacement >=100000
    reconnect >=90000
zero aggregated correctness violations
```

Only a simultaneous-global-run ACCEPT is globally direct-eligible.

# 18. Executable INCONCLUSIVE / invalid-measurement conditions

At the current audited classifier/coordinator/campaign path, examples include:

```text
timing invalid
generator saturated
generator event-loop p99 >=100ms
generator backlog >1000
publisher definite failures >0
generator/host cpu_throttled_count >0
generator memory OOM / OOM kill
connection failure rate >5%
topology capacity insufficient
mandatory Nchan/Redis CPU evidence unavailable at 100k
Nchan CPU throttling >0
Nchan OOM kill
latency_invalid_count >0
latency_overflow_count >0
mandatory Nchan/Redis memory evidence unavailable
slow offered measurement not independent
slow pacing invalid
slow Nchan memory boundedness unknown
no demonstrated server-side slow-consumer backpressure
invalid source-port headroom
invalid Nginx worker capacity
clock/timing/environment invalidity
missing/mismatched source SHA
missing/mismatched shard registration/result
incomplete coordinated barrier
missing complete aligned active-population evidence
campaign input identity mismatch
campaign missing exact restart evidence
campaign run count outside frozen policy/range
cross-run dispersion >15%
```

Important correction:

```text
connection failure >5% is already an INCONCLUSIVE environment/network gate
```

Do not use an older 10% summary as the operative threshold.

CPU throttling in the current executable path is treated as experiment-invalidating/INCONCLUSIVE before
later acceptance-summary checks. Use the machine verdict, not a stale traceability prose label.

## 18.1 Conclusive REJECT examples

With generator/environment/timing evidence valid, conclusive DUT/scenario failures can produce REJECT,
including:

```text
healthy-generator surge failures
failure of latency/correctness/replay/resource gates
global active target failure
required scenario failure
```

Never convert a valid REJECT to INCONCLUSIVE merely because it is unfavorable.


# 19. Cross-run stability

The campaign uses the frozen coefficient-of-variation threshold:

```text
CV <= 15%
```

for exactly the coordinated campaign metrics currently implemented:

```text
global_active_peak
fan_out_p95_ms
late_join_p95_ms
```

The implementation uses sample standard deviation (`n-1`) divided by the absolute mean.



The campaign aggregator, not manual judgment, owns the final stability result.

Do not:

```text
discard an outlier because it looks strange
average only favorable runs
rerun a failed seed and replace it
select the best three runs
```

Every qualifying run started under the frozen campaign belongs to the campaign unless the entire campaign is invalidated by a documented external interruption that makes its evidence unusable.

If the whole campaign must be restarted:

```text
discard the entire campaign as non-qualifying
fix the external issue without changing experiment semantics
clear evidence storage
restart at run 0 with the same frozen policy
```

Document why.

---

# 20. Result precedence

## Campaign `ACCEPT`

Treat M3 as `ACCEPT` only when the campaign machine result says `ACCEPT`.

This means the frozen experiment validly supports the local Nchan + Redis + SSE assumption under the tested conditions.

It does **not** prove the full production system.

## Campaign `REJECT`

Treat M3 as `REJECT` when:

```text
measurement validity is intact
but a frozen DUT/correctness/scenario criterion fails
```

Do not repair the architecture inside M3.

Preserve the result and hand it to M4.

## Campaign `INCONCLUSIVE`

Treat M3 as `INCONCLUSIVE` when:

```text
the generator/environment/measurement/campaign stability prevents a defensible conclusion
```

Do not proceed as if Nchan passed.

M4 determines the next step.

---

# 21. No manual verdict override

The following are forbidden:

```text
"it was close enough"
"100k almost reached"
"one seed was weird"
"the average looks fine"
"ignore the restart failure"
"ignore missing metric"
"we can extrapolate from 80k"
"the machine is small so call it a pass"
```

The POC exists to falsify a risky assumption.

A negative result is useful.

---

# 22. Evidence preservation and export

The assignment prohibits generated artifacts in final `poc/`.

Therefore qualifying M3 evidence must be preserved **outside the final `poc/` tree**.

Recommended working location:

```text
<repo>/internal_docs/m3_evidence/<campaign-id>/
```

or an external sibling directory that is not packaged as `poc/`.

At minimum preserve:

```text
campaign-console.log
process-exit-status.txt
command.txt
environment.txt
global-result-0.json
global-result-1.json
global-result-2.json
campaign-result.json
checksums.sha256
MILESTONE_3_EVIDENCE_MANIFEST.md
```

Where extractable, also preserve per-shard machine JSON emitted in the console.

## 22.1 Export from Docker evidence volume

The canonical global/campaign JSON files live in the campaign's named Docker evidence volume.

After the campaign process exits:

1. **do not delete the project volume yet**;
2. copy the current campaign JSON files out using Docker/container-runtime operations;
3. verify they match the console-emitted machine results;
4. compute hashes;
5. only after preservation is verified may the campaign project/volumes be removed.

Do not rely on the Docker volume as the only durable copy.

## 22.2 Generated-artifact delivery rule

Raw M3 evidence, logs, and internal manifests are working evidence.

They are **not** placed inside final `poc/`.

The final ZIP later contains only the assignment-allowed artifacts. The final README reports measured
values derived from this preserved evidence.


# 23. Evidence manifest

Create an internal:

```text
MILESTONE_3_EVIDENCE_MANIFEST.md
```

containing at least:

```text
qualifying/non-qualifying status
source SHA
contract version
date/time
host description
Docker Engine version
Docker Compose version
Docker image IDs/digests used for the qualifying run where practical
exact command
process exit status
campaign console-log hash
GLOBAL_RUNS
BASE_GLOBAL_SEED
per-run seed
per-run experiment_run_id
per-run verdict
campaign verdict
campaign dispersion values
global active peak
fan-out p95/p99
burst p95
late-join p95
surge result
correctness counters
reconnect result
slow-consumer result
restart literal result
restart cross-node result
Nchan resource peaks
Redis resource peaks
generator validity
all INCONCLUSIVE reasons if any
number/evidence-level classification for decisive values
SHA-256 of each raw JSON artifact
```

Do not copy only favorable metrics.

---

# 24. Validate evidence file identity

For every `global-result-N.json`, verify:

```text
contract_version == v2.0.5
aggregate_scope == simultaneous_global_run
scope == global
run_index == N
seed == 42 + N
global_target == 100000
shard_count == 4
source_commit == frozen HEAD
participating_shard_ids == [0,1,2,3]
exactly one publisher owner
```

For `campaign-result.json`, verify:

```text
contract_version == v2.0.5
aggregate_scope == campaign
scope == campaign
run_count == 3
run_indices == [0,1,2]
source_commit == frozen HEAD
global_target == 100000
```

Reject the evidence set as non-qualifying if identity is inconsistent.

---

# 25. Validate scenario evidence before accepting the campaign file

Even though the code now guards these paths, perform an evidence audit rather than trusting a label.

At minimum verify:

## 100k scale

```text
aligned global active population reached the target
```

## Surge

```text
the +40k / 120s mapping actually occurred
```

## Late join

```text
required retained history was complete
state matched
p95 <= 2s if campaign is conclusive ACCEPT
```

## Reconnect

```text
all required clients actually re-established
exact expected ranges received
no gaps/duplicates/order violations
```

## Restart/replacement

Both paths contain exact structured evidence and cannot be satisfied by later out-of-range events.

## Slow consumer

The pacing model was actually achieved and the result did not rely on a tautological offered=consumed counter.

## Generator validity

No campaign `ACCEPT` is allowed if the generator saturated first.

---


# 25.1 AI-instruction provenance during M3

The assignment requires delivery of any agent instruction files actually used and a few sentences explaining
how AI was directed.

`AGENTS.md` is already an instruction artifact. A separate M3 plan becomes an assignment-relevant agent
instruction artifact **only if it is actually used to direct an AI agent during M3 execution/review**.

Before AI-assisted M3 execution:

1. decide whether this plan file is being used as an operative AI instruction;
2. if yes, preserve the exact used copy under `internal_docs/` without later mutation;
3. compute its SHA-256;
4. record purpose + first-use source commit in `internal_docs/AI_INSTRUCTION_PROVENANCE.md`;
5. do not silently omit it at final packaging;
6. if it was not actually used as an agent instruction, do not add it merely because it exists.

AI may help inspect logs, calculate summaries, and review evidence, but it must never:

```text
invent a run
invent missing metrics
discard unfavorable runs
change a threshold
reinterpret REJECT/INCONCLUSIVE as ACCEPT
claim end-to-end production latency from local delivery latency
claim provider guarantees not supplied by the PDF
```

The candidate remains responsible for the final interpretation.


# 26. Output summary for later README/proposal use

Do **not** write the final README in M3.

Instead create a concise internal result block with the exact facts that M7 will later compress to <=300 words.

Use this structure:

```text
ASSUMPTION
The locally testable assumption that was measured.

METHOD
Exact frozen topology, workload, repetitions, and criteria.

RESULT
Campaign verdict plus the smallest set of decisive measured numbers.

PROPOSAL IMPACT INPUT
What M4 must decide based on the result.

LIMITATIONS
At minimum state:
- no real provider feed/schema;
- local single-host networking rather than EU/NA Internet delivery;
- no browser render path;
- no controlled 100-vs-100k differential equality test;
- no >100k capacity-knee measurement;
- no AWS deploy/cost proof.
```

Do not write the final "what it changes in the proposal" conclusion until M4 reconciles the architecture.

---

# 27. What not to do in Milestone 3

Do not:

```text
change architecture
change frozen thresholds
change workload
change target viewer count
change surge duration
change event rates
change slow-client thresholds
change seeds after seeing results
change run count after seeing results
build AWS infrastructure
build Next.js UI
connect to a real provider
write proposal.md
write final README.md
write the final <=300-word submission text
calculate final AWS cost model
package final ZIP
clean away evidence before it is recorded
commit generated evidence into final poc/
```

---

# 28. Handling a genuine harness defect discovered during M3

If M3 exposes a **measurement/harness defect**, distinguish it from a DUT failure.

Examples:

```text
stale evidence consumed
wrong source SHA
wrong contract version
broken histogram serialization
misclassified generator failure
missing shard result accepted
campaign aggregator reads wrong run
stale Docker-volume evidence is consumed
qualifying console/raw machine output is not preservable
measurement field impossible/null due harness bug
reviewer one-command path cannot start from final ZIP-like layout
```

Procedure:

1. mark the attempted M3 campaign **NON-QUALIFYING**;
2. preserve the failure evidence;
3. do not call it `REJECT` against Nchan;
4. return to Milestone 2;
5. fix the minimum defect;
6. run focused tests and M2 regression audit;
7. freeze the new source SHA;
8. clear evidence storage;
9. restart M3 from run 0.

Do not patch midway through a qualifying campaign.

---

# 29. Handling an external interruption

Examples:

```text
machine reboot
Docker daemon crash unrelated to DUT
disk exhaustion outside frozen containers
operator kills the run
host suspend
unrelated process consumes host resources
```

If the interruption destroys measurement validity:

```text
invalidate the whole qualifying campaign
```

Do not preserve already favorable runs and replace only the interrupted one.

Record:

```text
why the campaign was invalidated
which artifacts belong to the invalid attempt
when the replacement campaign began
```

Then rerun the same frozen campaign from run 0.

---

# 30. M3 completion gate

Milestone 3 is complete only when all of the following are true:

## Assignment compliance

- [ ] POC was run locally.
- [ ] No cloud account was used.
- [ ] No real infrastructure spend was required.
- [ ] The event feed was simulated.
- [ ] No full product/UI was built.
- [ ] The experiment produced a measured result.
- [ ] The normal reviewer path remains one-command/container-runtime-only.

## Freeze integrity

- [ ] One source SHA governed the whole campaign.
- [ ] Active contract was `v2.0.5`.
- [ ] No experiment criterion changed after observation.
- [ ] `GLOBAL_RUNS` and seed policy were fixed before run 0.
- [ ] A fresh unique Compose project/evidence volume identity was frozen before run 0.
- [ ] Evidence storage was proven clean/new before the campaign.

## Scale/protocol

- [ ] Four coordinated shards participated.
- [ ] Each shard targeted 25,000 viewers.
- [ ] Global target was exactly 100,000.
- [ ] Exactly one publisher-owner existed.
- [ ] All required phase barriers completed.
- [ ] +40,000/120s surge mapping was exercised.
- [ ] Hot-match concentration remained frozen.

## Evidence

- [ ] All global-run result files are present.
- [ ] Campaign result is present.
- [ ] All result identities match frozen SHA/contract/seeds.
- [ ] Raw evidence checksums are preserved.
- [ ] Environment/provenance is recorded.
- [ ] Full qualifying stdout/stderr is preserved and hashed.
- [ ] Process exit status is preserved and interpreted via machine verdict.
- [ ] Exact restart structured evidence is present.
- [ ] Generator validity is recorded.
- [ ] Cross-run dispersion is recorded for global_active_peak, fan_out_p95_ms, and late_join_p95_ms.
- [ ] No stale result can have entered aggregation.

## Classification

- [ ] One authoritative campaign verdict exists; shell exit status alone is not the verdict.
- [ ] Verdict is exactly `ACCEPT`, `REJECT`, or `INCONCLUSIVE`.
- [ ] No manual override was applied.
- [ ] Decisive measured values are recorded.
- [ ] Scope/limitations of the POC are recorded, including no browser/geography/provider proof and no 100-vs-100k differential claim.
- [ ] Decisive numbers are labelled as PDF fact, derived value, frozen experiment assumption, local measurement, or production inference.

## Handoff

- [ ] Internal M3 evidence manifest exists.
- [ ] M3 status in the milestone document can be updated truthfully.
- [ ] Milestone 4 receives the campaign verdict and evidence.
- [ ] Final README/proposal wording has **not** been prematurely finalized.
- [ ] AI instruction artifacts actually used during M3 are recorded for eventual delivery.

---

# 31. Required Milestone 3 result record

When M3 finishes, update:

```text
internal_docs/LIVE_MATCH_CENTRE_ASSIGNMENT_MILESTONES (3).md
```

from:

```text
Milestone 3 — NOT STARTED
```

to the truthful measured outcome.

Recommended form:

```text
Milestone 3 — DONE

Qualifying source SHA: <sha>
Contract: v2.0.5
Global runs: 3
Seeds: 42,43,44
Campaign verdict: ACCEPT | REJECT | INCONCLUSIVE
Evidence manifest: <path>
```

Do not mark M4 complete.

---

# 32. Milestone 4 handoff

M3 stops after producing and preserving the measured campaign result.

The next step is Milestone 4.

## If M3 = ACCEPT

M4 asks:

```text
Does the measured local result justify retaining Nchan + Redis + SSE?
What exactly was measured?
What remains an inference?
```

## If M3 = REJECT

M4 reopens the affected architecture decision.

Do not hide the rejection.

## If M3 = INCONCLUSIVE

M4 identifies why the experiment could not answer the question.

If the cause is a harness/environment limitation that can be corrected, the workflow may loop back to M1/M2/M3.

---

# 33. Final stop condition

Stop Milestone 3 when:

```text
the frozen qualifying campaign has completed,
the raw evidence is preserved,
the campaign verdict is verified,
the evidence manifest is complete,
and the result has been handed to Milestone 4.
```

Do not continue into:

```text
architecture reconciliation
final cost model
proposal.md
README.md
final packaging
```

unless explicitly instructed to start the next milestone.

---

# 34. Short execution checklist

```text
[ ] Re-read requirement.pdf and confirm no assignment facts changed
[ ] Confirm current HEAD and clean tree
[ ] Confirm active contract v2.0.5
[ ] Confirm no POC-affecting code changed since M2 audit
[ ] Classify decisive numbers correctly: PDF fact vs derived vs experiment assumption
[ ] If this plan will direct AI execution, freeze/hash/record it as an instruction artifact
[ ] Test final intended POC command from a no-.git ZIP-like copy using only container runtime
[ ] Distinguish qualifying 100k profile from portable 100-viewer smoke
[ ] Capture host OS/kernel/CPU/RAM and Docker Engine/Compose versions
[ ] Record nominal configured topology (4x25k; 42 CPU / 46 GiB caps + coordinator) without calling it a physical minimum
[ ] Choose a fresh unique COMPOSE_PROJECT_NAME and prove evidence volumes are new
[ ] Freeze GLOBAL_RUNS=3 and BASE_GLOBAL_SEED=42 before run 0
[ ] Use no hidden result-affecting overrides
[ ] Run non-qualifying sanity checks; stop if harness validation fails
[ ] Start raw stdout/stderr capture
[ ] Record exact qualifying command and start timestamp
[ ] Execute coordinated 100,000-viewer campaign
[ ] Preserve non-zero exit as evidence; do not automatically retry
[ ] Record end timestamp and process exit status
[ ] Export global-result-0/1/2 and campaign-result from the current Docker evidence volume
[ ] Preserve/hash campaign-console.log and exported JSON
[ ] Extract/hash per-shard machine JSON from console where practical
[ ] Verify all result identities: SHA, contract, project, run index, seeds, shard count, target
[ ] Verify exactly one publisher owner and no non-owner publication
[ ] Verify all coordinated barriers and aligned population evidence
[ ] Verify aligned global peak >=100,000
[ ] Verify scenario active minimums (100k except reconnect >=90k)
[ ] Verify +40,000/120s surge and surge existing-viewer correctness
[ ] Verify 8-match + ~10/s steady + ~50/s burst workload mapping
[ ] Verify fan-out, burst and surge p95 gates
[ ] Verify late-join <=2s plus score/clock/head/history exactness fields
[ ] Verify reconnect exact ranges and zero gap/dup/order violations
[ ] Verify slow-client independence, pacing, backpressure, recovery and bounded memory
[ ] Verify literal + cross-node restart exact structured evidence in every global run
[ ] Verify parse/schema/timestamp/transport-ID errors are zero
[ ] Verify unexpected/server/network disconnect counters are zero
[ ] Verify generator, Nchan, Redis and host validity/resource evidence
[ ] Verify connection-failure >5% rule is not misread as an old 10% threshold
[ ] Verify campaign CV for global_active_peak, fan_out_p95_ms, late_join_p95_ms
[ ] Accept the machine campaign verdict without manual override
[ ] Do not append extra runs after seeing a 3-run result
[ ] Record limitations: no real provider, browser, geography, differential 100-vs-100k, or >100k knee proof
[ ] Create M3 evidence manifest with evidence-level labels and hashes
[ ] Ensure raw evidence remains outside final poc/
[ ] Update only the existing Milestone 3 status record truthfully
[ ] Hand the measured result to M4
[ ] STOP — do not write final proposal/README/package inside M3
```


---

# 35. Planning completeness / zero-gap audit

This plan is complete only if a fresh review can answer **YES** to every question below without inventing
new M3 work.

## PDF obligation coverage

```text
Does the plan preserve the riskiest-assumption logic? YES
Does it keep the true untestable provider risk explicit? YES
Does it test the riskiest locally testable risk? YES
Does it keep the POC local? YES
Does it require one-command / container-runtime-only reviewer compatibility? YES
Does it forbid cloud deployment/spend? YES
Does it preserve simulated-feed scope? YES
Does it require a measured result rather than a UI? YES
Does it avoid full-system implementation? YES
Does it preserve inputs needed for the <=300-word later write-up? YES
Does it preserve AI-instruction provenance? YES
Does it preserve number/decision explainability? YES
Does it keep generated evidence out of final poc/? YES
```

## Experiment-integrity coverage

```text
Frozen source/config identity? YES
Clean tree / no mixed commits? YES
Fresh evidence storage? YES
Frozen run count/seeds? YES
Exact coordinated topology? YES
Exact workload/surge mapping? YES
Generator validity? YES
Host/port/FD validity? YES
All executable classifier gates represented? YES
Global coordinator gates represented? YES
Campaign aggregation/dispersion represented? YES
All three verdict branches represented? YES
Valid non-zero exits preserved? YES
No cherry-picking/replacement runs? YES
Harness-defect loop-back defined? YES
External-interruption restart rule defined? YES
Raw console + machine-result preservation defined? YES
Result identity/hash validation defined? YES
M4 handoff defined? YES
```

## Claim-boundary coverage

```text
No provider guarantee fabricated? YES
No browser-screen e2e latency fabricated? YES
No geographic production latency fabricated? YES
No AWS deploy proof fabricated? YES
No cost proof fabricated? YES
No controlled 100-vs-100k equality claim fabricated? YES
No >100k capacity headroom fabricated? YES
```

If a future code/contract/assignment change invalidates any `YES`, this plan is no longer 100% current and
must be re-audited before qualifying execution.

At the audited baseline:

```text
repository HEAD: a9d5ce2691919b5484ae961685d9780acee44460
active contract: v2.0.5
planning gap found on final pass: NONE
Milestone 3 planning completeness: 100%
Milestone 3 execution completeness: 0% until the qualifying campaign is actually run
```
