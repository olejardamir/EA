# Milestone 2 — Close the Remaining Gap to 100%

You are working directly on:

https://github.com/olejardamir/EA

Your task is to **finish Milestone 2 completely**.

Do not merely review the repository, describe problems, propose changes, or stop after one implementation pass.

You must work **sequentially in a loop**:

1. inspect;
2. identify the next real remaining gap;
3. fix it;
4. test it;
5. measure it;
6. compare the result against the frozen Milestone 2 completion gate;
7. repeat from step 1.

Continue until the Milestone 2 completion gap is **100% closed**.

Do not manufacture cosmetic changes simply to continue the loop.

Keep the assignment's scope discipline binding throughout: this is the **smallest useful measured POC**, not a production implementation or demonstration UI.

Do not claim 100% unless every required completion condition is genuinely satisfied.

---

# 1. Governing objective

The objective is:

> **Milestone 2 must become a complete, correct, locally runnable, reproducible implementation of the frozen Nchan + Redis OSS + SSE POC experiment, with no known material implementation, measurement, orchestration, classification, reproducibility, or governance gap remaining.**

The expected end state is:

```text
Milestone 1 = DONE
Milestone 2 = DONE — 100%
Milestone 3 = NEXT
```

Milestone 3 must NOT be executed in this task.

---

# 2. Source-of-truth order

Before making any changes, read the current repository completely enough to understand the active state.

Use this precedence:

0. **The original take-home assignment itself**. If `requirement.pdf` is not present in the repository, use the embedded hard constraints in §2.0 below; repository documents may not weaken them.
1. `internal_docs/AGENTS.md`
2. `internal_docs/LIVE_MATCH_CENTRE_MINIMUM_DEFENSIBLE_ARCHITECTURE.md`
3. `internal_docs/LIVE_MATCH_CENTRE_FINAL_SIMPLIFICATION_AUDIT.md`
4. the **currently active frozen POC experiment contract** — initially `internal_docs/LIVE_MATCH_CENTRE_POC_EXPERIMENT_CONTRACT_v2_0_1.md`; if the mandatory consistency audit creates and freezes a legitimate successor, that successor immediately replaces v2.0.1 in this precedence order
5. `internal_docs/LIVE_MATCH_CENTRE_ASSIGNMENT_MILESTONES (3).md`
6. current `poc/`
7. older files only for historical context that has not been superseded

After any legitimate contract supersession, update the milestone reference in the same iteration and never continue implementing against the superseded contract. Do not edit the superseded frozen contract in place.

Do not let older raw-WebSocket, custom gateway, Valkey, Artillery, snapshot/replay, or other superseded decisions override the current architecture.

Do not create another milestone copy such as `(4)`.

Update only:

```text
internal_docs/LIVE_MATCH_CENTRE_ASSIGNMENT_MILESTONES (3).md
```

## 2.0 Embedded assignment hard constraints for this Milestone

Treat these as higher authority than the experiment contract or implementation. These are embedded here because the original `requirement.pdf` may not exist inside the repository.

### Scenario facts that the active POC contract may not weaken

```text
Product: public anonymous read-only Live Match Centre; no accounts.
Lobby: all live matches, current score and minute, goals/cards update live with no refresh.
Match page: late join, reload, or return after phone sleep shows everything so far immediately, then continues live.
Never a blank feed or manual refresh.
Trust invariant: score agrees with visible events; nothing duplicated, disappearing, or out of order.
Live feel: goals reach the viewer within a couple of seconds; routine events soon after.
Crowd invariance: materially identical experience at 100 vs 100,000 viewers, including kickoff rush.
Score and clock are derived from the third-party event stream.

Peak live matches: 8 concurrent.
Feed: ~10 events/s total, bursting to ~50/s.
Feed delivery: best-effort, no long retry window.
Peak concurrent viewers: 100,000.
Viewer surge: +40,000 viewers within 2 minutes.
Audience: ~60% Europe / ~40% North America.
Goal latency: p95 <= 2s from ingest to viewer screen.
All other event latency: p95 <= 5s.
Late join/reload: full match history visible within 2s.
Infrastructure budget: <= $3,000/month at peak.
Deploys: weekly, including during live matches; viewers must not notice.
Frontend: Next.js App Router with component-based architecture.
Infrastructure: AWS preferred, or justify an alternative.
```

These are production-scenario facts. Milestone 2 does **not** need to implement or locally prove every one of them; however, the POC contract may not contradict or silently weaken them, and the traceability matrix must identify which are:

```text
directly exercised by this POC
used only to shape the POC workload
outside the local POC and therefore a later proposal/inference concern
```

### Exact POC/delivery constraints

```text
POC tests the riskiest architecture-invalidating assumption that can be tested locally.
If the genuine riskiest assumption cannot be tested locally, test the riskiest locally testable one and say so.
The experiment must be the smallest experiment that produces a measured result.

POC runs locally with one command (docker compose up or equivalent).
No cloud account.
Nothing installed beyond a container runtime.
Measured result, not a demonstration UI.
Rough experiment-grade code is acceptable; this is a measurement, not a product.
Simulating the event stream is expected because no real feed is supplied.
The choice of what/how to test must follow from the riskiest part of the proposed design.
Do not build the full system; the POC is the only code expected.
No cloud deployment or real infrastructure spend.

Final `poc/` contains only source/config needed for the experiment — no node_modules, build artifacts, generated logs/results.
Final delivery later includes one README with run instructions, the <=300-word assumption -> method -> result -> proposal-change write-up, and a few sentences on AI-tool use.
Any AI agent instruction files actually used must be preserved for eventual delivery.
Every material number and decision in the eventual submission must remain explainable by the candidate.
```

Do not implement the future `proposal.md`, final `README.md`, <=300-word report, or final ZIP during Milestone 2; only preserve the evidence/provenance needed for those later milestones.

## 2.1 Mandatory frozen-contract self-consistency audit

Before treating `v2.0.1` as executable truth, perform a line-by-line consistency audit against:

1. the assignment requirements;
2. the governing minimum architecture;
3. the current implementation;
4. official Nchan 1.3.8 documentation/source for Nchan-specific semantics.

This audit is mandatory because the current frozen contract contains known statements that may be internally contradictory or inconsistent with documented Nchan behavior.

Do **not** run final evidence, and do not claim Milestone 2 = 100%, until these are reconciled.

Known items that MUST be resolved explicitly:

### A. Nchan transport ID vs canonical application sequence

The governing architecture requires:

```text
canonical_seq = application correctness identity/order
Nchan EventSource id = transport resume cursor
```

These are not the same concept.

If the contract says:

```text
id: <canonical_seq>
```

while the architecture says Nchan transport IDs are not canonical sports-event identity, reconcile the contradiction.

The correct implementation must keep `canonical_seq` in the JSON payload as application truth and use the actual Nchan transport message ID only for `Last-Event-ID` resume unless official Nchan behavior and the governing architecture explicitly justify otherwise.

Never use the Nchan transport ID to prove sports-event ordering.

### B. `newest` lobby semantics

Verify `nchan_subscriber_first_message` against official Nchan 1.3.8 documentation.

Official semantics must win over mistaken prose.

If `newest` means "wait for the next message" rather than "send the current buffered message", then a lobby channel with buffer length 1 cannot satisfy:

```text
new lobby viewer immediately receives current state
```

while configured with `newest`.

Fix the configuration/contract so a newly joining lobby subscriber receives the already-buffered latest full lobby state immediately, then continues with replacements.

Do not preserve incorrect documentation merely because it was previously frozen.

### C. 5,000-message history cap vs "full match history"

The contract currently uses a finite match buffer and also requires complete active-match history.

Audit the arithmetic.

If the contract states approximately 1.25 events/s per match for 90 minutes, that is approximately 6,750 events, which exceeds a 5,000-message buffer.

Also account for live messages arriving after prefill: if the buffer is exactly full before the late-join connection starts, subsequent live events can evict the oldest history before the late join consumes it.

This is a genuine correctness issue, not wording.

Resolve it before evidence.

Do not weaken the assignment's requirement that the viewer receive the complete history so far.

If resolving it changes a frozen buffer/history variable, create the minimal corrected contract version and freeze it before continuing.

### D. Load-generator topology contradiction

Audit whether the contract simultaneously says:

```text
runner spawns child-process load generators
```

and elsewhere requires/recommends multiple load-generator containers.

For 100,000 outbound TCP/SSE connections, also analyze the TCP 4-tuple / ephemeral-port ceiling.

Multiple child processes sharing one source IP do not by themselves create additional source-port space.

The evidence harness must be capable of attempting 100,000 connections without a known artificial single-source ephemeral-port ceiling.

Prefer actual load-generator shards with distinct network namespaces/source IPs when necessary.

Do not call a host/generator topology "100k-ready" if it is structurally incapable of opening 100k connections to the selected destination tuple.

If this requires changing a frozen topology statement, version and freeze the minimal correction first.

### E. Literal Nchan restart vs cross-node replacement

The frozen contract's restart requirement and any optional two-node replacement test are different claims.

Do not silently substitute:

```text
connect nchan-1 -> connect nchan-2
```

for:

```text
restart the Nchan process and recover
```

If the frozen contract requires an actual restart, automate an actual Nchan process restart without human interaction and without casually mounting the Docker socket.

A test-only in-container supervisor/control mechanism is acceptable if it is small, isolated to the POC, and does not alter the behavior being measured.

Cross-node replacement may be retained as an additional test, but it does not replace a literal restart unless the contract is explicitly corrected and re-frozen.

### F. Timing-clock contradiction

Audit any statement that says `process.hrtime.bigint()` is serialized as ISO 8601.

That is invalid: monotonic process time and wall-clock epoch time are different clocks.

Use:

```text
wall-clock epoch timestamp -> cross-component publisher T0 / receiver T1
monotonic clock            -> local elapsed durations
```

Measure/validate clock comparability before accepting cross-component latency.

If timing validity cannot be established, classification is `INCONCLUSIVE`.

### G. Burst-rate semantics

Resolve whether "~50 events/s burst" means:

```text
50 total messages/s including lobby
```

or:

```text
50 match events/s plus lobby
```

Do not let the implementation silently produce 51/s while claiming the frozen 50/s target.

Freeze one unambiguous interpretation before evidence.

### H. Scenario-sequencing contradiction

Audit the contract for conflicting statements such as:

```text
warm-up establishes all target connections
```

and later:

```text
surge begins at 60% and grows to 100%
```

Those cannot both describe the same evidence lifecycle without an explicit reset/repopulation boundary.

Freeze one coherent lifecycle before evidence.

### I. Redis local version vs production version

Keep the distinction explicit:

```text
local POC runtime Redis version
production ElastiCache Redis OSS version
```

Do not describe Redis 7.2 as literally Redis 7.1.

Compatibility/alignment is an inference and must be stated as such.

### J. Exact channel naming

Reconcile the governing/contract naming convention with the implementation.

If the active contract says:

```text
match:<match_id>
```

the implementation must not silently publish to a different namespace such as bare `match-001`.

Either implement the frozen naming or minimally correct and re-freeze the contract.

### K. Nchan directive semantics

For every Nchan directive that is architecture-critical, verify the exact Nchan 1.3.8 behavior from official documentation/source, including at minimum:

```text
nchan_subscriber_first_message
nchan_subscriber_last_message_id
nchan_message_buffer_length
nchan_message_timeout
nchan_redis_pass
EventSource resume semantics
```

Do not rely on remembered semantics.

If the frozen contract conflicts with official behavior, correct the contract before evidence.

Because the public Nchan documentation may describe the current project rather than a versioned snapshot, cross-check every result-affecting semantic against the **v1.3.8 tagged source/changelog** whenever the documentation is not explicitly versioned. Record which primary source established each critical semantic.

### L. 100,000-target ACCEPT contradiction

Audit the connection-count rules as a single logical system.

The current contract contains a material contradiction if one section says:

```text
failure to reach 100,000 because the host/generator saturates first -> INCONCLUSIVE
```

while another ACCEPT section allows:

```text
>= 10,000 connections
OR machine maximum + extrapolation -> ACCEPT
```

Those cannot both be true.

The assignment target is 100,000 concurrent viewers. A local run that physically reaches only 10,000 cannot be presented as direct proof of 100,000.

Before evidence, freeze one unambiguous rule. Unless the assignment itself is changed, the safe rule is:

```text
valid run physically reaches 100,000 under the frozen DUT resource envelope -> eligible for ACCEPT
host/generator/network ceiling prevents 100,000 before the DUT is falsified -> INCONCLUSIVE AT 100K SCALE
```

Per-resource extrapolation may be reported as a production inference, but it must not silently convert an untested 100k target into measured ACCEPT.

### M. ACCEPT / REJECT / INCONCLUSIVE must be exhaustive

Audit Sections 28-30 so every valid outcome maps to exactly one result.

There must be no undefined zone such as:

```text
ACCEPT requires fan_out_p95 <= 500ms
REJECT says only fan_out_p95 > 2000ms
```

with 501-2000ms left semantically ambiguous.

Freeze a mutually exclusive and exhaustive decision table **before evidence**.

Experiment-invalid conditions map to `INCONCLUSIVE` first.

For a valid experiment, every failed mandatory ACCEPT criterion must map deterministically to `REJECT` unless the contract explicitly defines a different valid non-accept outcome.

Do not invent a post-run warning state.

### N. Slow-client contract contradiction

Audit whether the contract simultaneously says:

```text
slow client may be disconnected OR may catch up safely
```

and:

```text
ACCEPT requires slow_consumer_disconnects > 0
```

Those are different acceptance rules.

Verify actual Nchan 1.3.8 slow-subscriber behavior and freeze the intended falsifiable rule before evidence.

The core property is bounded server behavior and no material harm to healthy clients. Do not require an implementation-specific disconnect merely because an earlier draft assumed it, unless that behavior is genuinely part of the frozen hypothesis.

### O. Auxiliary topology vs frozen resource envelope

If the corrected POC introduces:

```text
nchan-2
multiple load-generator containers
resource-probe sidecars
restart supervisor/control process
```

reconcile them with the frozen CPU/memory envelope.

Do not accidentally double the Nchan capacity under test by giving two Nchan nodes 4 CPU / 4 GB each and then claim the original single-node 4 CPU / 4 GB capacity assumption passed.

Freeze and report separately:

```text
DUT resource envelope
load-generator resource envelope
auxiliary/replacement-node resources
measurement-sidecar overhead
```

If load generation is split into multiple containers, their **aggregate** frozen load-generator CPU/memory limit must match the intended contract unless the contract is explicitly corrected.

### P. Hot-match denominator contradiction

Audit the phrase:

```text
80% of ALL events -> match-001
```

against the simultaneous lobby workload.

A lobby update cannot also be a match-001 event.

Freeze whether 80% means:

```text
80% of match events during the hot-match phase
```

or another explicitly defined denominator.

Use the same denominator in generation, metrics, tests, and final evidence.

### Q. Scenario timing contradiction

Audit the frozen timing table for impossible or inconsistent timestamps.

For example, if steady measurement lasts 120 seconds but reconnect is specified at `t=150s of steady measurement`, the schedule is impossible as written.

Resolve every scenario timestamp/duration contradiction and freeze one executable schedule before Milestone 3.

The corrected schedule must still exercise late join, reconnect, burst/hot-match, restart, slow clients, and surge under the intended active load.

### R. Concurrent-viewer target must use active concurrency, not cumulative establishments

Audit every connection metric and acceptance check. `connections_established` is cumulative and can increase again during reconnects/replacements; it cannot by itself prove that 100,000 viewers were simultaneously connected.

Track at minimum:

```text
active_connections_current
active_connections_peak
unique_viewer_slots_targeted
connections_attempted
connections_established_total
connection_failures
unexpected_disconnects
expected/deliberate_disconnects
```

For the 100,000-viewer criterion, use the actual simultaneous active viewer population under the frozen viewer-to-connection model. Reconnect attempts must not make a cumulative establishment counter falsely satisfy the concurrency criterion. `pool.size` or an array length is not an active-connection metric if it still contains closed subscriptions.

### S. Frozen metric coverage must be complete

Build a metric-coverage matrix from both the active experiment contract and the active Milestone 2 requirements. For every required metric record:

```text
metric name
source
unit
phase/cohort
collection method
validity rule
classifier usage
test coverage
```

At minimum verify coverage for all required connection, event, latency, resource, slow-client, restart, and generator-health metrics, including:

```text
active_connections_peak
connection_establishment_rate_peak
unexpected_disconnects
network throughput/bytes where required by the governing milestone
redis_connected_clients_peak
load-generator CPU per shard
load-generator memory per shard
load-generator event-loop delay per shard
load-generator backlog/saturation
container OOM signals
CPU throttling signals
```

No required metric may remain a constant placeholder such as `0`, `null`, or a copied proxy while still being treated as measured. A mandatory evidence metric that cannot be measured must drive `INCONCLUSIVE`, not silent ACCEPT.

### T. No latency censoring or biased percentile sampling

Audit all latency collection code for silent sample rejection. Do not discard catastrophic latency with logic such as `if latency < 30000 then record it`.

Rules:

```text
negative cross-component latency -> timing validity failure / INCONCLUSIVE
valid very-large latency -> record it or an overflow bucket that necessarily fails the relevant threshold
parse/timestamp failure -> measurement validity failure, not silent drop
```

The bounded histogram must account for all eligible deliveries, not merely the latest N samples. Report `latency_sample_count`, `latency_invalid_count`, and `latency_overflow_count`.

### U. Slow-consumer workload fidelity

The active contract describes slow consumers reading approximately one event every 2 seconds. A complete socket pause is a different workload.

Implement transport-level throttling that approximates the frozen slow-consumer behavior while still creating genuine read-side backpressure. Verify the achieved receive rate. If exact transport mechanics make the frozen wording impossible or ambiguous, correct/re-freeze the minimal variable before evidence. Do not silently substitute a harsher zero-read client and claim the frozen case passed.

### V. Hot-match viewer concentration must be frozen

Concentrating 80% of events on match-001 does not by itself test hot-channel fan-out if viewers remain evenly distributed across eight match channels.

Reconcile and freeze the subscriber distribution used for the hot-match worst case. Evidence must state:

```text
active viewers on match-001
active viewers on each other match
lobby viewers
total viewers
connections per viewer
match-001 event rate
match-001 expected fan deliveries/s
```

If the design claims a worst-case single hot match, subscriber concentration must actually exercise that claim.

### W. Immutable/reproducible build inputs

Audit Nginx source, Nchan source, Redis image, Node/base images, OS/base image, and npm dependencies. Use HTTPS for source downloads. Pin versions, keep `package-lock.json`, and where practical verify source SHA-256 checksums and/or record immutable image digests.

Do not depend on an external floating `latest` image. A local image may be tagged `latest` only when Compose also contains its deterministic `build:` definition. Record resolved component versions/image IDs or digests in the machine-readable run result.

### X. Active channel state must drive expected-delivery accounting

Expected live deliveries must use currently connected subscribers on the specific channel at publish acceptance time, not array length, cumulative established count, or configured target. During reconnect, slow-client disconnect, node replacement, and surge phases, the active per-channel population changes. Deliberately disconnected viewers must not remain in the expected live-delivery denominator.

### Y. Frozen event schema and generated event set must agree

Audit the exact `event_type` values listed in the frozen schema against what the simulator can actually generate. Do not claim the POC exercised types that are never produced. Either generate the frozen event set or minimally correct/re-freeze the schema to the event set actually required by this POC.

### Z. Disconnect attribution must be explicit

Differentiate at least:

```text
deliberate disconnect
unexpected client-side disconnect
Nchan/server-initiated disconnect
network/connect failure
shutdown cleanup
```

Do not count normal teardown as an unexpected drop. Burst/surge criteria requiring no drops attributable to Nchan/Redis must use attributed unexpected drops, not a generic cleanup counter.

### AA. Per-message EventSource `event:` semantics must match the frozen framing

Audit the active contract's SSE framing against the Nchan configuration.

If the contract freezes:

```text
event: <event_type>
```

and the publisher sends `X-EventSource-Event: <event_type>`, then a subscriber-side directive such as:

```nginx
nchan_eventsource_event "update";
```

may override the per-message event metadata and make every match event appear as `event: update`. Official Nchan behavior must be verified.

Freeze one consistent rule before evidence. If the contract retains per-message event types, remove any overriding subscriber directive for match streams and integration-test at least two distinct event types on the actual wire. If the field is intentionally generic, minimally correct/re-freeze the contract and keep application `event_type` in JSON as the correctness source.

The lobby may intentionally use a fixed `event: lobby` only if that is explicitly frozen.

Do not claim the frozen wire schema passed when only the JSON body matched.

### AB. Event-loop-delay p99 must be a real phase measurement

Do not treat occasional `setImmediate` probes as a trustworthy frozen p99 event-loop-delay metric. Sparse probes can miss the exact stalls that invalidate a high-load run.

For every real Node load-generator shard, use a bounded monotonic event-loop-delay measurement suitable for percentiles, preferably Node's `perf_hooks.monitorEventLoopDelay()` or an equivalently justified mechanism.

Requirements:

```text
start monitor before the measured phase
reset or snapshot at phase boundaries
report sample/count or histogram validity
report p99/max as required
use p99 for the frozen saturation threshold
stop/disable cleanly at teardown
```

The metric must be per real shard, not copied from the orchestrator process. If the configured resolution or measurement overhead is too coarse to distinguish the frozen threshold, the run is `INCONCLUSIVE`.

Unit-test classifier behavior at the exact event-loop threshold boundary and integration-test that the metric reacts to an intentionally blocked event loop in a tiny diagnostic test.

### AC. CPU, throttling, and OOM metrics must use actual cgroup/runtime semantics

Define the resource measurement formulas before evidence.

For each DUT/load-generator container or real shard where the frozen contract requires resource health, derive CPU utilization from actual process/cgroup usage deltas over wall time and normalize against the container's effective CPU quota/assigned CPUs. Do not divide by host CPU count when the container is quota-limited.

Read actual runtime signals such as cgroup v2 where available:

```text
cpu.stat usage_usec
cpu.stat nr_throttled
cpu.stat throttled_usec
memory.current
memory.peak where available
memory.events oom / oom_kill
effective cpu.max / cpuset
effective memory.max
```

or a documented equivalent on the supported container runtime.

Required rules:

- `CPU percent` has an explicit denominator and unit.
- CPU throttling required by the frozen ACCEPT rule is measured, not inferred from high CPU.
- OOM kills are measured from runtime/cgroup evidence, not inferred from process disappearance.
- Resource counters are sampled at sufficient cadence to capture peaks.
- Unsupported runtime metrics are marked unavailable and make mandatory evidence `INCONCLUSIVE`; they are never replaced with fabricated zeros.
- Sidecar/probe overhead is excluded or separately accounted for.

Tests must cover counter deltas, quota normalization, counter reset/wrap handling where applicable, and `INCONCLUSIVE` behavior when mandatory runtime signals are unavailable.


### AD. Nchan servers sharing Redis must have compatible clocks

Nchan's own Redis guidance warns that Nchan servers sharing Redis must have synchronized clocks; otherwise missed or duplicate behavior can result.

Before any cross-node/restart result is considered valid, measure and record the wall-clock offset among every participating Nchan instance and the processes whose wall clocks are used for cross-component latency.

Do not merely assume Docker containers are synchronized. If the measured compatibility violates the active frozen clock-validity rule, the run is `INCONCLUSIVE`.

### AE. Late-join timing must include connection setup

Do not make the 2-second local late-join proxy easier by starting the timer after the SSE connection is already established.

Freeze:

```text
T_late_join_start =
  immediately before initiating the HTTP/SSE connection

T_late_join_end =
  after the frame containing the independently frozen head-at-start
  is fully received, SSE-parsed, canonical-sequence validated,
  and incorporated into the replay validator
```

Use a monotonic clock for this local elapsed duration. Keep the limitation explicit: the POC still does not measure real CloudFront/Internet/browser-render time.

Apply the same boundary discipline to reconnect timing.

### AF. Streaming UTF-8 and SSE response correctness

The raw SSE client must use an incremental UTF-8 decoder (`TextDecoder` streaming mode, `StringDecoder`, or equivalent) so a multibyte code point split across TCP chunks is not corrupted.

Verify the subscriber response is a valid streaming response with `Content-Type: text/event-stream` (parameters allowed).

Heartbeat/comment/control frames must not increment canonical-event, received-delivery, or latency metrics.

Add tests for split multibyte UTF-8 and for heartbeat/control frames followed by a normal event.

### AG. Load-generator HTTP/socket stack must not hide a client ceiling

For each real load-generator shard verify the effective client stack:

```text
HTTP Agent / maxSockets
socket pooling/reuse behavior
per-shard FD limit
connection-attempt concurrency
pending-connect queue
DNS/target resolution behavior
```

A runtime/library cap below the shard's assigned target is a generator bottleneck and therefore `INCONCLUSIVE`, not Nchan failure.

Expose pending connection attempts and categorized socket/connect failures.

### AH. Smallest-experiment / scope discipline is a hard requirement

The assignment asks for the **smallest experiment that produces a measured result**, permits rough experiment-grade code, and explicitly says not to build the full system.

Closing Milestone 2 to 100% does not authorize product scope.

For every POC service/file/dependency ask:

```text
Does this materially affect:
- frozen workload generation,
- Nchan/Redis DUT operation,
- measurement validity,
- deterministic orchestration,
- reproducibility,
- or classification?
```

If no, remove it.

Do not add a Next.js/React UI, demonstration dashboard, authentication/accounts, production database, AWS implementation, Terraform/CDK, Kubernetes, production observability stack, unrelated APIs, or a production admin/control plane.

At the final gate perform a deletion/scope-minimization pass and confirm no remaining component can be safely removed without weakening the measurement, validity, or reproducibility.

### AI. Every non-assignment number/decision must be explainable

Maintain a compact experiment-parameter ledger for every material result-affecting non-assignment constant, including as applicable payload sizes, history depth/margin, buffer length, heartbeat, timeouts, seed, viewer distribution, hot-match concentration, shard count/resources, histogram range/resolution, sampling cadence, ramp parameters, slow-consumer parameters, and latency budget margin.

For each record:

```text
value
unit
classification:
  ASSIGNMENT_FACT | PLANNING_ASSUMPTION | DERIVED_VALUE | PROTOCOL_REQUIREMENT
rationale/derivation
where used
```

No unexplained magic number may determine the result.

### AJ. Replay/lobby state must be coherent, not only sequential

For late join, independently reduce the replayed canonical history and verify at the frozen head-at-start:

```text
reconstructed score == committed publisher score
reconstructed clock/period == committed publisher state under the synthetic model
last canonical_seq == target head
```

For lobby validation, verify the buffered latest lobby score/minute for every match equals a coherent committed publisher state boundary.

This does not claim real-provider semantics; it prevents the synthetic POC from violating the assignment's score/history-coherence expectation itself.

### AK. Slow-client bounded-memory needs a frozen trend test

A single memory peak below the limit does not prove bounded behavior.

Before evidence, freeze a method using time-series samples:

```text
Nchan memory baseline
samples during slow period
memory at end of slow period
memory after recovery/disconnect and settling
growth / retained-delta rule
```

The rule must distinguish bounded temporary buffering from memory that keeps growing with backlog/time and does not settle.

Do not choose the rule after observing Milestone 3.

### AL. Clean-checkout validation must be genuinely clean

The final reproducibility check must run from a fresh temporary clone/worktree at the exact commit, or an equivalently strict clean-checkout procedure.

Verify:

```text
git status clean before run
no untracked dependency/build/result file is required
custom POC images are absent or deliberately rebuilt
Compose --build succeeds
only tracked source/config plus normal registry/network downloads are used
git status clean after run
```

Do not require destructive global Docker cleanup.

### AM. Milestone 2 completion is harness correctness, not forcing the DUT to pass

Separate:

```text
A. Is the experiment implementation complete and valid?
B. Does Nchan+Redis satisfy the hypothesis?
```

Milestone 2 answers **A**.

Implementation/unit/measurement-oracle tests must pass, and every mandatory smoke scenario must execute to a deterministic structured terminal result. A smoke scenario may truthfully report a genuine DUT `SMOKE_FAIL` or `SMOKE_INCONCLUSIVE`.

Do not weaken thresholds to make smoke favorable.

Milestone 2 may still be 100% if a non-passing smoke observation is confidently attributable to the DUT rather than a harness/environment defect. Final `ACCEPT/REJECT/INCONCLUSIVE` evidence remains Milestone 3.

If attribution is ambiguous, Milestone 2 remains open until the ambiguity is removed.

### AN. AI-instruction provenance must be preserved

This Markdown prompt is itself an AI instruction artifact if it is actually supplied to the coding agent.

If used, preserve its exact bytes/hash for later final-delivery inclusion under the assignment's AI-tool requirement. Do not place it in `poc/`. Do not reconstruct it later from memory.

### AO. Nginx/Nchan build wording must match the actual build

Audit active-contract wording against the real Dockerfile.

Do not simultaneously describe a "pinned official Nginx base image" and a build that actually starts from a base OS, downloads Nginx source, and compiles with `--add-module=<Nchan>`.

Freeze one truthful reproducible build description.

### AP. High-scale host tuning must not violate the one-command reviewer path

The normal smoke/reviewer path must require only a container runtime and one command. It must not require manual `sudo sysctl`, host package installation, or a second setup script.

For evidence mode, prefer container/network-namespace-scoped `ulimits`/`sysctls` encoded in Compose where possible.

If the physical 100k evidence host requires unavoidable host-level tuning, make it an explicit evidence-host prerequisite separate from the portable reviewer path. The POC must still start, validate its environment, and terminate truthfully with one command.

### AQ. Publisher timestamp boundary and scheduler lag must be explicit

Define exactly when `publish_timestamp` is captured. It must correspond to the frozen fan-out T0 boundary, not an arbitrary earlier simulation step.

Where useful record:

```text
scheduled_event_time
publish_attempt_start_time
publish_accept_time
subscriber_receive_time
```

Measure publisher scheduler lag/missed deadlines. If the simulator cannot sustain the frozen generation schedule because its own event loop is late, the run is generator-invalid/`INCONCLUSIVE`, not a DUT throughput failure.

Use deadline-based rate scheduling or an equivalently justified design that does not silently accumulate recursive timer drift.

### AR. The 120-second connection surge must be deadline-based

Do not implement the surge as `connect batch -> await variable duration -> sleep fixed interval` if that stretches the ramp.

Schedule against absolute monotonic deadlines and report actual start/end/duration, attempted and established additions, per-second rates, and scheduler lag.

Generator inability to issue the frozen ramp is `INCONCLUSIVE`.

### AS. Synthetic state commit must be atomic with accepted publish

Use an immutable candidate transition:

```text
previous committed state
  -> candidate next event/state
  -> unambiguous publish acceptance
  -> atomically commit seq + score + clock + head
```

A definite failed goal publish must not increment score without a corresponding committed event. An ambiguous outcome follows the frozen ambiguous-publish rule.

### AT. Shared-Redis restart/replacement validity includes Nchan clock compatibility

The restart/cross-node result is invalid unless every participating Nchan instance passes the frozen clock-compatibility rule. Record the measured offset in the scenario result.


### AU. Cross-run variance and threshold aggregation must be mathematically frozen

The contract's phrase such as "variance within ±15%" is not a complete mathematical definition.

Before evidence, freeze:

```text
which per-run metric values are compared
variance/dispersion formula
denominator
rounding/precision
minimum sample count
how the 15% boundary is treated
```

Also freeze whether latency acceptance is:

```text
every qualifying run must meet threshold
worst qualifying run
pooled histogram across runs
another explicit rule
```

Do not average p95/p99 values across runs and call the result a percentile.

Correctness invariants such as missing/duplicate/out-of-order must never be hidden by pooling/averaging.

### AV. Multi-shard percentile/concurrency aggregation must be time-aligned

With multiple load-generator shards:

- never average shard p95/p99 values;
- merge compatible histograms/counts to derive a global percentile, or use another mathematically correct frozen method;
- do not sum each shard's independent `active_connections_peak`, because those peaks may occur at different times;
- do not sum each shard's independent connection-rate peak unless the buckets are time-aligned.

Use common monotonic/wall-clock phase boundaries and aligned buckets/barriers so global active concurrency and peak establishment rate represent the same instant/window.

### AW. Distributed phase barriers are required for real generator shards

If load generation is sharded across processes/containers, all shards must enter and leave measured phases coherently.

Implement a small deterministic orchestrator/barrier so:

```text
base population ready
measurement reset
steady start/end
surge start/end
burst/hot-match start/end
slow cohort start/end
shutdown
```

are coordinated.

A shard still warming up while another is measured invalidates phase metrics.

Barrier/control traffic must be excluded from DUT data-plane metrics.

### AX. Peak must be reached before tests that claim 100k behavior

The contract/prompt must not run hot-match/burst or other "100,000 viewers" claims while only the 60% base population is connected.

Freeze one coherent lifecycle in which the 60% -> 100% surge reaches/stabilizes at peak **before any scenario whose claim requires peak concurrency**.

At minimum identify which of these require the 100% population:

```text
steady fan-out capacity claim
hot-match/burst capacity
late join under peak load if claimed
reconnect under peak load if claimed
slow-consumer impact at peak if claimed
restart/replacement at peak if claimed
```

The machine-readable result must state active concurrency for every scenario, not merely the run-wide peak.

### AY. Literal restart must freeze publisher behavior during the outage

A single Nchan process cannot accept publishes while it is stopped.

Before evidence, freeze what the restart scenario is actually proving:

```text
history survives a literal process restart with publishing paused
```

or:

```text
publishing continues through a surviving/replacement Nchan node while another node restarts
```

Do not continue advancing canonical state through an unavailable publisher endpoint and then blame replay for those unaccepted events.

Record the publisher path and accepted-event range during the outage.

### AZ. Slow-client workload must actually reach server-side backpressure

It is not enough to label clients "slow."

Before evidence, calculate and verify:

```text
offered event/byte rate to slow cohort
actual application read rate
expected backlog growth
test duration
socket/kernel buffering capacity implications
```

The scenario must be long/strong enough that genuine server-side backpressure is observed or demonstrably approached.

If the client is merely slow but the kernel receive buffer absorbs the whole test without pressuring Nchan/Nginx, the bounded-memory/disconnect result is `INCONCLUSIVE`, not PASS.

Use the smallest workload that reliably reaches the intended backpressure condition; do not arbitrarily make it harsher than the frozen model.

### BA. Percentile sample populations must be statistically meaningful and frozen

Do not report a p95 from an undefined/tiny sample population without stating what it means.

Before evidence, freeze the sample count/cohort for:

```text
late-join duration p95
reconnect duration p95
healthy-client p95 before/during slow clients
connection-establishment rate buckets
```

If only one late-join is executed per run, do not casually label a three-value maximum as a robust p95 without explicitly freezing that interpretation. Prefer a sufficient concurrent/sequential late-join cohort consistent with "smallest useful experiment."

### BB. Run isolation includes PRNG, metrics, resource counters, and process state

A new measured run must reset more than Redis channels.

Reset/recreate or correctly baseline:

```text
PRNG state
canonical match state
run/channel namespace
all counters/histograms
connection IDs
resource counter baselines
OOM/throttle counters
memory-peak measurement strategy
publisher scheduler state
```

Do not let cgroup lifetime peaks/cumulative counters from an earlier run leak into the next run. Recreate containers or use per-run sampled/baselined metrics where necessary.

### BC. Nginx worker count must match the effective DUT CPU model

`worker_processes auto` may observe more host CPUs than the Nchan container is allowed to use.

Freeze/verify the relationship among:

```text
worker_processes
effective cpu.max/cpuset
frozen 4-CPU DUT budget
worker_connections
```

Do not obtain apparent connection capacity by spawning a host-CPU-count worker fleet under a 4-CPU quota without understanding/measuring the effect.

Use an explicit worker count or prove the automatic count is appropriate under the runtime.

### BD. Portable service addressing must match the selected Compose network mode

When using normal Compose networking, `localhost`/`127.0.0.1` refers to the current container, not Redis/Nchan sibling services.

Audit all Nchan Redis upstreams and runner URLs for profile-correct service DNS names.

Smoke and evidence profiles may differ, but neither may rely on addresses that only worked under a superseded `network_mode: host`.

### BE. Docker build context must exclude generated/local artifacts

Use `.dockerignore` at the appropriate build contexts so local `node_modules`, `dist`, coverage, benchmark results, logs, editor files, and unrelated repository content cannot silently enter an image.

Use `npm ci` with the committed lockfile rather than `npm install` for reproducible runner builds.

A dirty developer machine must not change the built image's dependency graph.

### BF. Ports-and-Adapters type boundaries must be real, not bypassed

Do not preserve architecture in directory names while defeating it with broad casts such as `as any` at the composition root or unvalidated `any` payloads crossing ports.

Use concrete compatible interfaces and narrow type guards/parsers at I/O boundaries.

Experiment-grade code may be concise, but type erasure must not hide a mismatch that can invalidate measurement behavior.

### BG. Restart/replacement result must verify duplicates and ordering, not only history existence

For the literal restart and cross-node replacement scenario record and classify:

```text
history replay correct
missing canonical sequences
duplicates
out-of-order sequences
resume transport ID used
canonical start/end sequence
```

Do not treat "received at least one replay event" as proof of correct recovery.

### BH. Surge must measure existing-viewer experience during the ramp

The assignment's kickoff rush is not only a connection-establishment test.

During the 60% -> 100% surge, existing viewers must continue receiving events without Nchan/Redis-attributed drops, sequence violations, or latency degradation beyond the frozen threshold.

Maintain a phase-specific surge live-latency histogram and correctness/drop counters for the pre-existing cohort.

### BI. Subscriber eligibility boundaries must make delivery accounting exact enough

During connect/disconnect/reconnect/surge churn, "subscribers at time of publish" is not trivial to observe.

Freeze an explicit eligibility boundary for each live subscriber, for example using:

```text
connection established/handler ready
canonical baseline/head at join
disconnect/error boundary
```

Expected live delivery accounting must not charge a subscriber for events published before it became eligible or after it ceased being eligible.

If exact aggregate expected delivery at the Nchan publish instant cannot be known during churn, use per-client canonical continuity as the correctness source and treat aggregate delivery ratio as diagnostic rather than fabricating exact loss.

### BJ. Malformed/control-frame accounting must catch terminal errors

Track malformed SSE/application payload frames explicitly.

A malformed final event may never be followed by another sequence that exposes a gap, so parse/schema failures cannot simply be ignored.

At minimum record:

```text
sse_parse_errors
json_parse_errors
schema_validation_errors
missing_transport_id where required
invalid_timestamp_count
```

Mandatory application-frame parse/schema errors in a valid run must affect validity/correctness according to the frozen rule.


### BK. CPU-throttling acceptance semantics must be exact

If the active ACCEPT criteria say "no CPU throttling events," freeze exactly what runtime counter/value constitutes failure.

Cgroup CPU quota can produce `nr_throttled > 0` even when the service remains healthy, so do not silently reinterpret the wording after the run.

Before evidence define:

```text
counter(s) used
measurement interval
delta baseline
whether any event fails or a throttled-time/rate threshold is intended
boundary equality
```

If the existing contract truly means zero throttling events, encode that exact strict rule.

### BL. Generator backlog saturation metric must have a concrete definition

The contract's backlog threshold such as `>1000 pending events` is meaningless unless "pending" is defined.

Freeze which queue is measured, for example:

```text
pending publish tasks
pending SSE frame parse/metric tasks
pending connection attempts
or another explicit bounded queue
```

Record queue unit, sampling method, maximum, and threshold boundary.

Do not report a hard-coded zero because no queue was instrumented.

### BM. Nchan publisher acceptance status must be verified against v1.3.8

Do not define an accepted publish as generic `resp.ok` without verifying which Nchan 1.3.8 publisher response statuses/semantics mean the message was accepted/stored/published.

Freeze:

```text
accepted HTTP status(es)
definite rejection status(es)
ambiguous transport outcome handling
response/body fields used, if any
```

Use the v1.3.8 source/docs as primary truth.

### BN. Production `message_timeout` vs POC retention behavior

Reconcile the governing architecture's production statement that active-match history must remain available for the entire active match with any POC-specific finite `nchan_message_timeout` such as `2h`.

Do not silently turn a local test-retention convenience into a production design claim. Freeze and label the distinction explicitly:

```text
production requirement -> retain complete active-match history for as long as the match is active
POC retention setting  -> long enough that no required test history can expire during a valid run
```

The preflight must prove that the POC timeout cannot expire any message required by late-join/reconnect/restart scenarios in that run. If it can, the run is invalid.

### BO. Full assignment/contract/implementation traceability matrix

Before Milestone 2 can reach 100%, create an internal machine-readable + human-readable closure matrix covering **every applicable POC requirement**, not only the known defect list.

At minimum enumerate:

```text
original assignment POC requirements
active frozen contract sections and normative statements
Milestone 2 completion requirements
AGENTS.md constraints that apply to the POC
```

For every row record:

```text
requirement_id / source / exact requirement summary
implementation path(s)
test path(s)
metric/evidence field(s)
run profile(s) where exercised
classification effect if violated
status = PASS | NOT_APPLICABLE | BLOCKED
reason/provenance
```

Rules:

- `PASS` requires code + test/validation evidence, not file existence or prose.
- `NOT_APPLICABLE` requires a precise scope reason and cannot be used to evade a POC requirement.
- `BLOCKED` prevents Milestone 2 = 100%.
- No normative active-contract statement may be absent from the matrix.
- No assignment POC requirement may be weakened by the contract.

This matrix is the final anti-omission mechanism: after the enumerated audit finds no new issue, audit the matrix itself for uncovered requirements and repeat until there are zero `BLOCKED` rows and zero unmapped normative requirements.

Keep this internal; it is not a new final submission deliverable unless later packaging chooses to retain it as an agent/process artifact.

### BP. Risk-target alignment must remain explicit

The POC must remain one experiment aimed at one architecture-invalidating local risk, not become a collection of unrelated product tests.

Freeze the distinction:

```text
overall least-trusted assumption: real third-party provider semantics / recoverability (not locally testable from supplied assignment)
riskiest locally testable assumption: Nchan + Redis + SSE fan-out/history/resume behavior under the assignment-mapped workload
```

Every scenario retained in Milestone 2 must be justified as measuring a sub-property of that local risk or as validating the measurement harness itself. Remove unrelated tests/code.

### BQ. Exact AI-instruction artifact preservation

Because this `.md` is itself an agent instruction artifact when used, preserve the exact file supplied to the coding agent at the beginning of execution.

If it is available as a file, copy it byte-for-byte to a stable internal instruction-artifact location outside `poc/`, record its SHA-256, and never rewrite that preserved copy. If it was pasted rather than attached, save the exact received instruction text before implementation begins and hash it.

Record:

```text
artifact path
SHA-256
first-use timestamp/commit
purpose
```

The later final packaging milestone can include that exact instruction artifact as required by the assignment.

### BR. Eliminate duplicate/ambiguous configuration aliases

Audit configuration for multiple names representing the same frozen variable, especially patterns such as:

```text
MEASURE_SECONDS vs STEADY_DURATION
BURST_SECONDS vs BURST_DURATION
WARMUP_SECONDS vs WARMUP_DURATION
COOLDOWN_SECONDS vs COOLDOWN_DURATION
workerCount values that do not map to real shards
```

Each result-affecting variable must have exactly one canonical typed configuration field and one documented environment/config input unless an alias is intentionally supported and tested.

Do not allow one scenario to read one duration field while another reads a different alias. The machine-readable result must print the resolved canonical configuration used for the run.

### BS. All terminal paths must terminate deterministically

The one-command POC must terminate for every structured terminal outcome, including:

```text
SMOKE_PASS
SMOKE_FAIL
SMOKE_INCONCLUSIVE
ACCEPT
REJECT
INCONCLUSIVE
preflight invalidity
scenario timeout
measurement failure
```

No scenario may leave open timers, sockets, child processes, Nginx control processes, or resource-probe loops that keep the runner alive indefinitely.

Implement bounded scenario deadlines, central cancellation/cleanup, and a final teardown that is idempotent. Test failure paths, not only the happy path.

### BT. Warm-up and stabilization semantics must match the active contract

Audit the current orchestration against the frozen warm-up/stabilization requirements. If the contract says the publisher begins during warm-up and caches/history are populated, then warm-up may not consist only of opening subscribers and sleeping.

Freeze and implement exactly:

```text
when the publisher starts
when base connections start/finish establishing
whether warm-up traffic is excluded from measured histograms/counters
exact warm-up duration
exact stabilization duration
what state/cache/history must exist before measured steady begins
```

Reset/snapshot measured metrics at the correct boundary without deleting state that the warm-up is intentionally creating.

A missing 5-second (or otherwise frozen) stabilization period is a contract violation, not a harmless timing simplification.

### BU. External technical-source provenance

Any correction or implementation choice that depends on external technical facts — especially Nchan 1.3.8 directive semantics, Redis behavior, Node HTTP/SSE behavior, Docker/cgroup semantics, or image/version availability — must be traceable.

Maintain a small internal source ledger containing:

```text
claim/decision
source title/vendor
source URL or repository path/tag/commit
version/date accessed where relevant
what the source establishes
which contract/code change depends on it
```

Prefer official documentation/source over blogs or remembered behavior.

Do not copy large copyrighted passages; record concise findings and source references.

The candidate must be able to explain why every externally-derived configuration choice is correct.

### Contract-version rule

If any item A-BU requires a change to a genuinely frozen experimental variable or behavior, create the minimal next contract version, document `OLD / NEW / WHY`, freeze it, update the milestone reference, and continue the loop.

Do not use measured benchmark results to decide the correction.

---

# 3. Current architecture — preserve unless contradicted by evidence

The active production architecture remains conceptually:

```text
Fans
  |
CloudFront
  |----------------------|
  |                      |
S3                  private NLB
Next.js                  |
                         v
                    Nchan EC2 ASG
                         |
                         v
                ElastiCache Redis OSS
                         ^
                         |
                    internal publish
                         |
Provider -> API Gateway HTTP -> SQS FIFO -> TypeScript Lambda
                                      |
                                      v
                                  DynamoDB
```

The local POC tests only the locally testable realtime delivery risk:

```text
Nchan + Redis OSS + SSE
```

Do not redesign the production architecture unless the corrected POC implementation exposes a genuine contradiction.

If a genuine contradiction appears, document it and stop before falsely claiming Milestone 2 is complete.

---

# 4. Preserve the current code architecture

Keep the current small structured TypeScript architecture:

```text
domain/
ports/
adapters/
application/
scenarios/
config/
tests/
main.ts
```

Continue using:

- Ports and Adapters / Hexagonal Architecture
- Scenario Strategy
- Functional Core / Imperative Shell
- explicit Composition Root
- constructor/function injection

Do NOT add:

- NestJS
- Express
- Fastify server
- dependency-injection framework
- CQRS framework
- Mediator framework
- Repository pattern
- ORM
- Kafka
- NATS
- Kubernetes
- Terraform
- AWS CDK
- AWS SDK
- Go/Golang

Do not turn the POC into an enterprise-framework showcase.

Every abstraction must isolate a real responsibility.

---

# 5. Frozen experiment rules must not be weakened

Do not change acceptance thresholds to make implementation easier.

Preserve the frozen intent, including:

- 8 simulated live matches
- approximately 10 events/s total steady
- approximately 50 events/s total burst
- hot-match concentration case
- 100,000 concurrent viewer target
- 60,000 -> 100,000 connection surge over 120 seconds
- full retained match history for late join
- full-history catch-up <= 2 seconds
- no missing canonical sequence
- no user-visible duplicates
- no out-of-order canonical events
- reconnect/resume correctness
- shared Redis history behavior
- slow-consumer/backpressure behavior
- measured resource health
- local-only execution
- one-command execution
- no cloud account
- no host dependency beyond a container runtime
- exact final result classes:
  - `ACCEPT`
  - `REJECT`
  - `INCONCLUSIVE`

A development/smoke profile must never claim the final frozen architecture result is `ACCEPT`.

---

# 6. Important current known gaps

Treat the following as known issues to verify first.

Do not assume they are still present; inspect the latest code and resolve only what remains.

## 6.1 Clean-checkout build

Verify that both smoke and evidence Compose profiles contain valid `build:` definitions so a clean checkout can build:

- Nchan image
- TypeScript runner image

The reviewer must not need any prebuilt:

```text
poc-nchan:latest
poc-runner:latest
```

One command from repository root must build everything.

## 6.2 Connection target semantics

Verify that `TARGET_CONNECTIONS` means the **actual total number of viewer connections attempted**.

Do not divide it by `WORKER_COUNT` unless real independent worker shards are actually created.

Because the frozen contract currently describes load-generator workers/shards, do not simply delete `WORKER_COUNT` to avoid implementing the topology. First reconcile the contract's worker model with the 100k TCP/ephemeral-port requirement. If the frozen worker topology is retained, `WORKER_COUNT` must correspond to real execution shards and each shard's health/resource metrics must be measured independently.

The invariant after connection attempts settle must be:

```text
connections_attempted
=
connections_established
+
connection_failures
```

No swallowed failed attempts. No fake worker count.

## 6.3 Evidence profile target

The evidence profile must represent the frozen target:

```text
TARGET_CONNECTIONS=100000
```

The smoke profile may use a small target.

Do not silently convert 10,000 into proof of 100,000.

If the eventual Milestone 3 machine cannot reach 100,000:

```text
INCONCLUSIVE AT 100K SCALE
```

not `ACCEPT`.

## 6.4 Explicit full-history prefill

Late join must not rely on waiting for ordinary live traffic to accumulate a few hundred events.

Implement a deterministic explicit history-prefill mechanism.

It must:

1. target a known match;
2. publish the full frozen retained-history depth;
3. preserve canonical sequence correctness;
4. verify the actual prefilled range;
5. confirm Nchan retains the required history;
6. then run late join while ordinary live load and viewers are active.

Late-join metrics must independently report:

```text
history_expected
history_received
first_seq
target_head_at_connection_start
last_seq
missing_history_sequences
catch_up_ms
```

Never calculate `history_expected` by copying `history_received`.

## 6.5 Reconnect/resume must be real

For reconnect testing:

1. choose a cohort;
2. record each client's canonical sequence, transport Last-Event-ID, match, and head at disconnect;
3. disconnect;
4. keep publishing while disconnected;
5. wait the frozen disruption interval;
6. verify relevant match head actually advanced;
7. reconnect with Last-Event-ID;
8. preserve the existing canonical sequence tracker;
9. catch up to the independently frozen target head;
10. continue live.

Require:

```text
relevant_events_published_during_disconnect > 0
reconnect_gaps == 0
reconnect_duplicates == 0
reconnect_order_violations == 0
```

Do not use global `events_received` as a proxy for events published during the disconnect.

## 6.6 Connection lifecycle and surge composition

The lifecycle must correctly model:

```text
base = 60% of target
surge = remaining 40%
duration = 120 seconds
peak = 100% target
```

For 100,000 evidence target:

```text
60,000 -> 100,000
```

For 100-connection smoke target:

```text
60 -> 100
```

Never `100 -> 140`.

Warmup, base population, and surge must form one coherent lifecycle.

## 6.7 Two-node Nchan / shared Redis behavior

The POC must actually be able to execute the shared-Redis cross-node property.

The frozen restart claim must be implemented exactly unless the contract is explicitly corrected and re-frozen.

At minimum the harness must automate the literal Nchan-process restart required by the frozen contract, without human intervention and without casually mounting `/var/run/docker.sock`.

A small test-only supervisor/control mechanism inside the Nchan container is acceptable if it can:

```text
stop Nginx/Nchan
leave Redis running
wait the frozen outage interval
restart Nginx/Nchan
verify health
allow clients to resume from retained Redis history
```

If a second Nchan node is also used, a useful topology is:

```text
redis
nchan-1
nchan-2
runner/orchestrator
load-generator shard(s)
```

Both Nchan nodes must use the same Redis backing store.

The cross-node replacement test is supplemental unless the frozen contract is changed. Do not claim a literal restart if only a node switch occurred.

Do not mount `/var/run/docker.sock` merely for convenience.

## 6.8 Slow-consumer test

Use:

```text
slow cohort = 5%
healthy cohort = 95%
```

Only the slow cohort should experience actual transport/read backpressure.

Measure separately:

```text
healthy_p95_before
healthy_p95_during_slow
degradation_percent
slow_disconnects
slow_resume_gaps
slow_resume_duplicates
slow_resume_order_violations
Nchan memory before/during/after
```

Do not use one global cumulative latency histogram to infer healthy-client degradation.

Do not hard-code the scenario as passed.

## 6.9 Real resource measurements

Measure distinct resources honestly.

Required:

```text
runner_cpu_percent_peak
runner_memory_mb_peak
runner_event_loop_p99_ms

nchan_cpu_percent_peak
nchan_memory_mb_peak

redis_cpu_percent_peak
redis_memory_mb_peak
```

If multiple Nchan nodes exist, report each or aggregate clearly.

Do not report Node runner memory as Nchan memory.

Do not fake unavailable measurements.

Use container-local/cgroup/service-local mechanisms that do not require host tooling.

If a required evidence metric is unavailable, final evidence classification must not silently accept it.

## 6.10 Classification validity gates

There must be exactly one authoritative result-classification path.

Conceptually:

```text
environment validity
measurement validity
generator health
host/resource validity
        |
        v
ResultClassifier
        |
        +--> INCONCLUSIVE if experiment invalid
        |
        +--> ACCEPT / REJECT if experiment valid
```

INCONCLUSIVE must take precedence for:

- timing invalid
- generator saturation
- host OS limit hit before target
- ephemeral-port exhaustion before target
- Docker networking bottleneck first
- measurement bug
- required resource envelope not honored
- required evidence metric unavailable where mandatory

Only after validity passes should architecture checks decide ACCEPT/REJECT.

The printer must print the classifier result, not duplicate classification rules.

## 6.11 Smoke cannot produce architecture ACCEPT

Smoke mode exists only to validate the harness.

Smoke result must be something explicit such as:

```text
SMOKE_PASS
SMOKE_FAIL
```

or:

```text
NOT_APPLICABLE — SMOKE PROFILE
```

Do not output final frozen `ACCEPT` from a reduced smoke run.

## 6.12 Channel-aware expected fan deliveries

Expected delivery accounting must be based on the actual subscriber population of the published channel.

For a match event:

```text
expected deliveries = active subscribers to that match channel
```

For a lobby event:

```text
expected deliveries = active lobby subscribers
```

Do not use total pool size for every event.

Accumulate expected deliveries at publish time. Track actual matching deliveries independently.

## 6.13 Explicit lobby workload

Ensure the POC has real lobby subscribers.

The lobby must test:

```text
buffer length = 1
latest complete lobby state on join
subsequent full-state replacements
```

Do not assume match subscribers also test lobby behavior.

Define the viewer model clearly. Do not double-count viewers without saying so.

## 6.14 Measured publish rate

Do not trust timer configuration alone.

Measure per phase:

```text
phase duration
match events
lobby events
total events
match events/sec
lobby events/sec
total events/sec
per-match distribution
```

Verify actual steady workload is approximately:

```text
~9 match events/s
~1 lobby update/s
~10 total events/s
```

Verify the burst interpretation against the frozen contract.

If the frozen document says total burst is ~50 events/s, do not accidentally generate `50 match + 1 lobby = 51 total`.

If a real contract contradiction exists, resolve it before final evidence without looking at benchmark results first.

## 6.15 Hot-match measurement must be phase-scoped

The frozen hot-match case must be measured only during the hot-match/burst phase.

Do not calculate from lifetime cumulative counts.

Track phase snapshots/counters.

Measure:

```text
match-001 burst events / all burst match events
```

Expected: approximately 80%.

Use a documented tolerance.

## 6.16 Portable smoke execution

Audit `network_mode: host`.

Prefer ordinary Compose networking for the smoke profile.

If Linux host networking is materially necessary for very high-scale evidence, separate:

```text
portable smoke profile
Linux high-scale evidence profile
```

The normal reviewer smoke path should not unnecessarily depend on Linux host networking.

## 6.17 TCP/ephemeral-port readiness for 100k

A single source IP connecting to one destination IP:port has a finite ephemeral-port/4-tuple ceiling and may be unable to create 100,000 simultaneous TCP connections.

The evidence harness must explicitly avoid a topology that is known in advance to cap below 100k.

Before declaring evidence readiness:

1. calculate the available source-port space;
2. inspect the number of distinct generator source IPs/network namespaces;
3. inspect destination IP/port tuples;
4. prove the configured sharding can attempt 100,000 connections without deterministic 4-tuple exhaustion.

Prefer multiple load-generator containers with distinct source IPs on a Docker network if needed.

Each load-generator shard must report:

```text
connections_attempted
connections_established
connection_failures
CPU
memory
event_loop_delay
socket/connect errors by category
```

If the evidence host still hits an environmental ceiling first, Milestone 3 must classify the 100k result `INCONCLUSIVE`, but Milestone 2 must at least provide a topology capable of making a legitimate attempt.

## 6.18 Separate live-delivery and replay-delivery accounting

Do not combine all received frames into one delivery-ratio calculation.

Maintain separate accounting:

```text
live_expected_deliveries
live_received_deliveries

late_join_history_expected
late_join_history_received

reconnect_replay_expected
reconnect_replay_received
```

`live_expected_deliveries` is accumulated at publish time from active subscribers to the event's channel.

Late-join and reconnect replay expectations are derived independently from canonical sequence ranges.

History/replay deliveries to clients who were not subscribers at original publish time must not make the live delivery ratio exceed 100%.

## 6.19 Phase-boundary correctness and in-flight publish draining

Phase metrics must not be contaminated by asynchronous publishes started in a previous phase.

The publisher must either:

- await/drain all in-flight publishes before a hard phase boundary; or
- tag each publish with an immutable phase ID at scheduling time and account by that phase.

`stop()` must have a deterministic quiescence/drain contract.

Tests must prove phase-scoped steady/burst/hot-match counts cannot be contaminated by earlier/later asynchronous requests.

## 6.20 Publisher-side canonical ordering

The POC must not inject out-of-order events itself.

If multiple HTTP POSTs for the same match can overlap, preserve per-match publication order using a per-channel queue/serialization mechanism or an equivalent deterministic design.

Required invariant:

```text
for each match:
publish canonical_seq N completes/is accepted before canonical_seq N+1 can overtake it
```

The test is intended to measure Nchan/Redis/SSE behavior, not accidental reordering caused by the simulator's own concurrent HTTP requests.

Record publisher failures separately.

## 6.21 Run isolation / stale Redis history

Repeated smoke/evidence runs must not inherit stale channels, message IDs, sequence numbers, or history from a previous run.

Implement deterministic run isolation, for example:

- dedicated POC Redis with an explicit safe reset at run start; or
- run-scoped channel namespace/ID prefix.

Do not flush an arbitrary external Redis instance.

The POC Redis is dedicated and local, so any reset must be explicitly scoped and logged.

Tests must prove two sequential smoke runs do not contaminate each other's history or counters.

## 6.22 Lobby configuration must deliver current buffered state

Do not merely test that lobby messages eventually arrive.

A new lobby subscriber must connect after a full lobby state has already been published and must receive that current buffered state immediately, then receive a subsequent replacement.

Verify the actual Nchan `nchan_subscriber_first_message` semantics from official Nchan 1.3.8 documentation.

With a buffer length of 1, configure the subscriber behavior that actually returns the one retained state. Do not use a setting whose documented behavior is to wait for a future publication.

## 6.23 Transport cursor and canonical sequence must remain separate

Track both for every subscriber:

```text
transport_last_event_id
canonical_last_seq
```

Use:

```text
transport_last_event_id -> Nchan resume
canonical_last_seq      -> application gap/duplicate/order correctness
```

Do not assert they are numerically equal.

Tests must include a case where the transport ID is opaque/non-canonical and canonical correctness still works.

## 6.24 Machine-readable result and exit-code contract

The runner must emit:

1. a concise human-readable summary; and
2. one machine-readable JSON result to stdout.

The JSON must include at minimum:

```text
contract_version
run_profile
seed
environment/preflight
scenario_results
workload_rate_metrics
connection_metrics
live_delivery_accounting
late_join_metrics
reconnect_metrics
restart_metrics
slow_client_metrics
resource_metrics
validity_reasons
classification
```

Smoke JSON must identify itself as smoke and must not contain final architecture `ACCEPT`.

Define deterministic exit codes.

At minimum:

```text
0 = harness/smoke completed successfully, or valid evidence ACCEPT
non-zero = harness failure, invalid run, smoke failure, evidence REJECT/INCONCLUSIVE
```

If a different mapping is used, document it clearly and make Compose `--exit-code-from runner` meaningful.

Do not leave final classification only in human log text.

## 6.25 Evidence preflight without privileged mutation

Before a high-scale evidence run, inspect and report:

```text
available CPU
available memory
file-descriptor limits
ephemeral-port range
relevant TCP/socket limits
Docker/container limits
generator shard count/source IPs
configured target
```

Do not automatically run privileged host `sysctl` mutations from the POC.

No extra software installation may be required.

If host tuning is required for a conclusive 100k run, document the required OS settings and fail/preflight as `INCONCLUSIVE` rather than silently altering the host.

The one-command rule applies to running the POC once the documented host prerequisites are met; it does not authorize hidden privileged host modification.

## 6.26 Verify declared container resource limits are actually enforced

Do not assume a Compose YAML declaration proves the runtime resource envelope.

During validation, read the actual cgroup/container limits visible to each service and report them.

The evidence run must verify that the frozen CPU/memory envelope is genuinely applied.

If it is not applied, evidence classification is `INCONCLUSIVE`.

Instrumentation overhead must be bounded and reported if it materially affects the experiment.

## 6.27 Evidence scenario order must be frozen and reproducible

After reconciling the contract contradictions, define one exact evidence scenario order.

The order must explicitly cover a coherent lifecycle. Unless the corrected frozen contract deliberately chooses another valid sequence, prefer:

```text
environment preflight
run isolation/reset
history prefill
connect/stabilize 60% base viewer population
start steady publication
60% -> 100% surge over 120s while measuring existing-viewer experience
stabilize at 100% peak
steady measurement at peak
late join under peak steady load
hot-match/burst at peak
post-burst steady
reconnect while publishing at the frozen concurrency
literal Nchan restart recovery under the explicitly frozen publisher-outage behavior
optional cross-node replacement
slow-client/backpressure at the frozen concurrency/distribution
post-run validation
resource finalization
classification
```

Every scenario result must record the actual active viewer/SSE population at its start and peak.

Do not run a scenario that claims 100,000-viewer behavior while only the 60% base population is present.

If the final corrected contract chooses a different order, follow it exactly.

Do not let individual scenarios independently start/stop/restart the publisher in ways that invalidate another scenario's assumptions.

## 6.28 Verify all frozen scenario results affect authoritative classification

A scenario must not log `FAIL` while the final classifier ignores it.

Create one structured `ScenarioResult` collection.

Every mandatory evidence scenario must contribute either:

```text
PASS
FAIL
INVALID/INCONCLUSIVE
```

to the authoritative classifier.

No mandatory scenario may be silently skipped in evidence mode.

A skipped mandatory evidence scenario is `INCONCLUSIVE`, not `PASS`.

Smoke mode may skip high-scale-only work, but must report the skip explicitly and can only produce smoke status.

## 6.29 Publisher acceptance, canonical commit, and ambiguous outcomes

The simulator must never create a canonical gap or ordering failure merely because its own HTTP publish failed.

Current-style logic that does this is invalid:

```text
advance state/seq/head
start HTTP POST
POST fails
next event advances to seq+1
```

Freeze an explicit publisher commit rule.

A canonical event becomes committed to the POC's published history only after an unambiguous successful Nchan publisher response.

Before success:

```text
canonical_seq must not be permanently advanced past a failed event
head tracker must not advance
score/clock state must not commit
expected-delivery accounting must not increment
```

For a definite failure, either retry the **same immutable event/sequence** under a bounded policy or invalidate the scenario according to the frozen rule.

For an ambiguous outcome such as a timeout after the request may have reached Nchan, do not blindly retry and risk creating a duplicate transport message. Record an ambiguous-publish validity failure and classify the evidence run `INCONCLUSIVE` unless the harness has a deterministic way to reconcile it.

Measure separately:

```text
publish_attempts
publish_successes
publish_definite_failures
publish_ambiguous_failures
publish_latency
```

Unit-test state/head behavior on success, definite failure, and ambiguous failure.

## 6.30 SSE connection-handshake race and long-lived timeout correctness

Audit the raw SSE client carefully.

A subscriber must not lose the first history/live frames because the HTTP response begins streaming before the caller registers its event handler.

Use one safe design, for example:

```text
handler/callback supplied before stream consumption starts
```

or buffer parsed frames until the handler is attached.

Do not discard chunks simply because `_handler` is not yet installed.

Also separate:

```text
connection-handshake timeout
long-lived SSE idle behavior
```

A 10-second socket/request timeout must not kill a healthy stream when Nchan heartbeat is 15 seconds.

After HTTP 200 / SSE establishment, clear the handshake timeout or use a documented stream-idle policy safely longer than the heartbeat interval.

Validate response `Content-Type` as `text/event-stream`.

Handle and measure all relevant stream termination signals, including:

```text
end
error
aborted
close
```

Unexpected termination must increment the correct metric.

Add integration coverage that keeps an SSE connection open longer than the heartbeat interval without an application event and proves it remains healthy.

## 6.31 Correct initial canonical-sequence baseline for live-only subscribers

A live-capacity subscriber starting at Nchan `newest` does not necessarily begin at canonical sequence 1.

Do not initialize every live subscriber's correctness tracker to zero and then count intentionally skipped pre-join history as a gap.

Freeze separate baseline rules:

```text
live/newest capacity subscriber:
  first received canonical_seq establishes the live baseline;
  contiguity is enforced from that point onward

late-join/oldest subscriber:
  expected first sequence and target range are independently known

reconnect subscriber:
  expected sequence continues from the client's preserved pre-disconnect canonical state
```

Tests must prove a live subscriber that legitimately begins at seq 100 does not report 1-99 as lost, while a later jump 100 -> 102 is still detected as a real gap.

## 6.32 Percentile/histogram correctness at 100k scale

Do not calculate final percentiles from a tail-truncated array such as only the latest 100,000 deliveries.

At 100,000 viewers, that can represent only a tiny and biased slice of the run.

Use a bounded-memory **streaming histogram** that preserves the distribution of all eligible samples in the phase/cohort, for example an integer-millisecond fixed histogram over a frozen bounded latency range or a well-understood HDR histogram.

The histogram must support:

```text
count
p50
p95
p99
max
overflow count
```

Maintain separate histograms where the contract needs separate populations/phases:

```text
steady live
burst/hot-match live
healthy-before-slow
healthy-during-slow
late join
reconnect
```

No unbounded per-delivery arrays.

Unit-test percentile calculations and histogram overflow behavior.

## 6.33 Effective Nchan lobby buffer and emitted SSE metadata

Verify the **effective** channel configuration, not only the subscriber block.

If the generic publisher location configures a 5,000-message buffer for `/pub/(.+)`, then publishing `lobby` through that location may defeat the intended lobby buffer length of 1 even if the subscriber location says 1.

Create explicit publisher configuration as needed so the lobby channel actually retains exactly the intended latest state.

Integration-test that after multiple lobby publishes, a new lobby subscriber gets the current/latest state and does not replay stale older lobby states.

Also verify official Nchan 1.3.8 publisher metadata/header names and resulting wire frames.

Do not assume a header such as `X-Event-Source-Event` is correct without checking official Nchan behavior.

Capture an actual SSE frame in integration testing and verify:

```text
transport id exists and is usable for resume
event field has the intended value if required
data payload is exact JSON
canonical_seq remains in data payload
```

Do not conflate the transport `id:` with `canonical_seq`.

## 6.34 Nginx/Nchan connection-capacity preflight

Before calling the evidence topology 100k-ready, verify server-side connection ceilings as configured.

At minimum audit:

```text
worker_processes
worker_connections
process/file-descriptor limit
listen backlog / relevant accept capacity
assigned viewer connections per Nchan node
additional Redis/upstream/control FDs
```

Require explicit headroom; a configured ceiling exactly equal to the target is not sufficient because Nginx needs non-viewer descriptors too.

If one Nchan node cannot structurally accept its assigned share of the 100,000 connections under the frozen resource envelope, fix the configuration or minimally correct/re-freeze the topology before evidence.

Add a preflight calculation to the machine-readable result.

## 6.35 Freeze the viewer-to-SSE-connection model

The assignment specifies 100,000 concurrent viewers, not an abstract number of sockets.

Freeze exactly how a viewer maps to SSE connections in this POC.

For example, a viewer may be on either:

```text
lobby page -> one lobby SSE stream
match page -> one selected match SSE stream
```

or another explicitly justified model.

Do not silently add lobby subscribers on top of 100,000 match subscribers and claim the assignment target remained 100,000 viewers.

Do not silently test fewer viewers because some hold multiple connections.

The evidence output must state:

```text
viewer_count
SSE_connection_count
lobby_viewer_count
match_viewer_count by channel
connections_per_viewer model
```

Expected-delivery accounting must follow this same model.

## 6.36 Exact frozen validity thresholds and resource failure metrics

Implement the actual frozen INCONCLUSIVE thresholds, not ad-hoc substitutes.

At minimum reconcile and encode the active contract's thresholds for:

```text
loadgen CPU saturation
loadgen event-loop delay
loadgen backlog saturation
clock offset/timing invalidity
file-descriptor exhaustion
ephemeral-port exhaustion
Docker/networking bottleneck
resource-envelope mismatch
measurement bug
run-count/variance instability
```

Also collect the frozen resource-failure signals required by ACCEPT/REJECT logic, including:

```text
container OOM kills
CPU throttling events/time
```

Do not infer `generator healthy` from only one metric such as event-loop delay.

The validity report must identify every reason evaluated and the measured value/threshold.

## 6.37 Repeated-run evidence suite must already be implemented

Milestone 3 requires at least 3 measured runs and consistency checking; Milestone 2 must provide the runnable machinery for that before it can be 100% complete.

Prepare an evidence-suite orchestrator that, when Milestone 3 is run, can:

1. execute the frozen run in an isolated state;
2. reset/rebaseline PRNG, channel, metric, connection, and resource-counter state;
3. collect its machine-readable result;
4. repeat for the minimum 3 measured runs using the pre-frozen seed policy;
5. compute cross-run dispersion using the exact pre-frozen formula for the frozen key metrics;
6. if dispersion exceeds 15%, continue up to the frozen maximum of 8 runs;
7. classify persistent >15% instability after the allowed runs as `INCONCLUSIVE`;
8. apply the frozen per-run-vs-pooled acceptance rule without averaging percentiles;
9. execute any scenario designated "once per campaign" exactly once and keep it out of per-run variance unless the active contract says otherwise;
10. emit one aggregate evidence JSON plus per-run summaries.

Do not execute this full evidence suite in Milestone 2.

Smoke mode may unit/integration-test the suite logic using synthetic run summaries or very short reduced runs.

The final Milestone 3 command must still be one command.

## 6.38 Exact scenario schedule must be executable

After the contract audit resolves timing contradictions, encode the scenario schedule as data/configuration rather than scattered sleeps that can drift semantically.

The harness must be able to print the frozen schedule before a run and verify that every event is scheduled within the run's defined phase.

No scenario may claim to run at a timestamp outside its containing phase.

Tests must validate the schedule mathematically before Docker execution.

## 6.39 No per-event/per-client logging at evidence scale

Logging itself must not become the load-generator bottleneck.

Evidence mode must not print one line per client connection or per delivered event.

This applies to **all components**, including runner/load-generator logs and Nginx access logging. Disable or suitably bound Nginx per-request access logs in evidence mode so 100,000 connection open/close records do not become a Docker logging bottleneck.

Use bounded periodic progress summaries and final structured output.

Count/log aggregation must not materially alter fan-out latency.

If verbose diagnostics exist, keep them disabled by default in evidence mode.

## 6.40 Scenario-level publish failures cannot be misattributed to Nchan delivery

Separate:

```text
publisher acceptance failure
Nchan/Redis fan-out failure after accepted publish
subscriber/load-generator failure
```

Only events with an unambiguous accepted-publish record belong in expected live delivery and canonical delivery-correctness denominators.

If publisher acceptance itself fails because the Nchan publisher endpoint is overloaded, that is still a DUT observation and must be classified according to the frozen experiment rules; it must not appear as a mysterious canonical sequence gap.

Preserve the raw failure reason/status so Milestone 3 can distinguish these cases.

## 6.41 Simulator score/clock/event coherence

The generated sports stream must be internally self-consistent so the POC does not create impossible viewer state.

Freeze and test simulator invariants at minimum:

```text
canonical_seq increments exactly once per committed match event
goal changes exactly one team's score by exactly +1 unless the active frozen schema explicitly models corrections
non-goal events do not silently change score
emitted score equals committed match state after that event
match clock never regresses within the same period except where an explicitly modeled period transition permits it
period transitions are valid and deterministic
head tracker equals the highest successfully committed canonical_seq
```

The POC does not claim to validate real provider semantics, but its own synthetic stream must not violate the assignment's visible invariant that score agrees with event history.

A failed or ambiguous publish must not leave score/clock/head advanced beyond the last unambiguously committed event.

## 6.42 Claim provenance in machine-readable evidence

The active contract distinguishes assignment facts, POC measurements, planning assumptions, production inferences, and unresolved external assumptions. Preserve that distinction in the evidence machinery so Milestone 3 cannot accidentally turn an inference into a measurement.

At minimum the machine-readable result or its accompanying generated summary schema must make it possible to distinguish:

```text
ASSIGNMENT_FACT
POC_MEASUREMENT
PLANNING_ASSUMPTION
PRODUCTION_INFERENCE
UNRESOLVED_EXTERNAL_ASSUMPTION
```

Do not claim that a local Docker measurement proves AWS, CloudFront, NLB, ElastiCache, geographic latency, real-provider semantics, or the production cost ceiling.

This does not require drafting the future proposal during Milestone 2. It only prevents the POC/evidence artifact from overstating what was directly measured.

---


## 6.43 Scope-minimization / no-UI audit

The final `poc/` must remain an experiment, not a partial product. Remove any service/file/dependency that does not materially support the frozen workload, DUT, measurement, orchestration, validity, classification, or reproducibility.

Explicitly verify there is no demonstration UI/frontend or production-system implementation.

## 6.44 Parameter/decision explainability ledger

Every result-affecting constant must come from the active contract/config ledger and have a rationale/classification. Do not keep contradictory hidden copies in source.

## 6.45 Late-join/reconnect timing boundaries

Late-join timing starts before connection initiation and ends only after target-head receipt, parse, canonical validation, and replay-state incorporation. Reconnect uses its frozen boundary with the same precision.

## 6.46 Incremental UTF-8 SSE decoding and heartbeat exclusion

Use incremental UTF-8 decoding, validate `text/event-stream`, and exclude heartbeat/control frames from canonical delivery and latency metrics.

## 6.47 Generator HTTP/socket-stack preflight

Verify each real generator shard's effective HTTP Agent/maxSockets, FD limit, pending-connect behavior, and categorized socket errors.

## 6.48 Cross-Nchan clock compatibility

Measure and validate clocks for all Nchan instances sharing Redis before accepting cross-node/restart results.

## 6.49 Replay and lobby state reconstruction

Late-join replay must reconstruct the correct score/clock/head. Lobby buffered state must match a coherent committed publisher boundary.

## 6.50 Slow-client memory trend

Measure Nchan memory before/during/after backpressure and apply the pre-frozen trend/settling rule.

## 6.51 Fresh-checkout proof

The final clean-run audit must execute from an exact clean commit/worktree and record the commit SHA.

## 6.52 Harness-complete vs DUT-pass separation

Represent harness validity separately from DUT smoke outcome. A genuine `SMOKE_FAIL` caused by Nchan/Redis may coexist with `HARNESS_VALID`; a harness/environment ambiguity may not.

## 6.53 AI instruction artifact provenance

If this exact prompt is used, preserve its exact bytes/hash for later final packaging.

## 6.54 Build-description consistency

Ensure the active contract truthfully describes the actual Nginx/Nchan build.

## 6.55 One-command path vs host tuning

Portable smoke must need no manual privileged host tuning. Evidence-only unavoidable host prerequisites must remain explicit and separate.

## 6.56 Rate scheduler and T0 validity

Measure scheduler lag/actual phase rates and capture `publish_timestamp` at the exact frozen T0 boundary.

## 6.57 Deadline-based 120-second surge

Use absolute monotonic deadlines so connection-establishment time cannot silently stretch the ramp.

## 6.58 Atomic synthetic-state commit

Commit seq/score/clock/head only after unambiguous accepted publication.

---

## 6.59 Repeated-run math / seed / scenario-repetition policy

Before Milestone 3, the active contract must define:

```text
primary seed policy across qualifying runs
cross-run variance/dispersion formula
percentile aggregation rule
which mandatory criteria must pass every run
which scenarios repeat every run
which scenarios run once per campaign
```

No post-run choice of the most favorable aggregation.

## 6.60 Multi-shard barriers and global metric aggregation

Real load-generator shards must use coordinated phase barriers.

Global percentiles come from merged compatible histograms, not averaged shard percentiles.

Global active concurrency and connection-rate peaks must use aligned time snapshots/buckets, not sums of independent shard peaks.

## 6.61 Peak-concurrency scenario validity

Any scenario whose claim says "at 100,000 viewers" must execute after the 60% -> 100% surge reaches and stabilizes at peak. Record scenario-local active concurrency.

## 6.62 Restart publisher-outage semantics

The restart scenario must state whether publishing is paused or routed through a surviving node during the literal Nchan outage. Accepted canonical state may not advance through an unavailable publisher.

## 6.63 Slow-client backpressure sufficiency

Calculate offered rate, read rate, backlog growth, duration, and buffering implications. Verify genuine server-side backpressure is reached; otherwise the slow-client result is inconclusive.

## 6.64 Percentile sample adequacy

Freeze enough late-join/reconnect/slow-client samples to make each reported percentile meaningful under the chosen nearest-rank/histogram method.

## 6.65 Full per-run reset

Reset/rebaseline PRNG, match state, metrics, connections, resource counters, scheduler state, and run namespace between qualifying runs.

## 6.66 Nginx worker/CPU alignment

Verify `worker_processes` and `worker_connections` against the effective 4-CPU DUT quota/cpuset and target subscriber count.

## 6.67 Compose service addressing

No portable-profile service may incorrectly use `localhost` for a sibling container. Verify Redis/Nchan/service DNS endpoints under each network mode.

## 6.68 Docker context reproducibility

Use `.dockerignore` and `npm ci`; local generated files may not enter the runner/Nchan image or alter dependencies.

## 6.69 Type-safe ports and payload boundaries

Remove unsafe type erasure at architecture seams. Validate JSON/SSE payloads with concise type guards/parsers before they influence correctness metrics.

## 6.70 Restart/replacement canonical correctness

Restart/cross-node scenarios verify missing/duplicate/order, not merely that some history exists.

## 6.71 Surge-phase viewer experience

Measure existing-viewer latency, unexpected drops, gaps, duplicates, and ordering during the 120-second surge itself.

## 6.72 Subscriber eligibility / exact delivery accounting

Define join/leave eligibility boundaries for live delivery accounting. Do not count impossible deliveries during connection churn.

## 6.73 Malformed-frame/payload accounting

Record SSE parse, JSON parse, schema, timestamp, and required-ID errors so a terminal malformed event cannot disappear silently.

---

# 7. Additional correctness checks beyond the known list

After fixing the known issues, do not stop.

Run a complete repository audit for additional material gaps.

Specifically inspect:

- Nchan config correctness
- Redis config correctness
- Last-Event-ID semantics
- SSE parser correctness
- partial-frame handling
- multi-line `data:`
- heartbeat/comment handling
- canonical sequence tracking
- late join boundary
- reconnect boundary
- publisher id/sequence continuity
- lobby semantics
- payload sizes
- deterministic seed behavior
- timeout behavior
- cleanup
- timer cancellation
- connection leak risk
- memory growth risk
- metrics sample bounding
- classification consistency
- scenario sequencing
- evidence profile consistency
- smoke profile consistency
- resource envelopes
- exit codes
- generated artifacts
- reproducibility

Do not stop just because the explicitly listed defects are fixed.

---

# 8. Test suite required before 100%

Add or retain automated tests for at least the following.

## Domain / deterministic workload

- same seed -> same generated sequence
- different seed -> different sequence
- payload sizes match target
- canonical sequence monotonically increases
- match state evolution is deterministic
- goal events update score exactly once and emitted score matches committed state
- non-goal events do not change score unexpectedly
- clock/period state obeys the active frozen monotonic/transition rules
- failed/ambiguous publish cannot leave score, clock or head ahead of committed history

## Scheduler / workload

- steady aggregate rate within tolerance
- lobby rate within tolerance
- total steady rate within tolerance
- burst rate within tolerance
- hot-match phase approximately 80% match-001
- hot-match calculation is phase scoped

## Sequence validator

- NEXT
- DUPLICATE
- GAP
- OUT_OF_ORDER
- reconnect continuation from prior sequence

## SSE parser

- normal event
- fragmented event
- multiple events per chunk
- CRLF
- LF
- multiline data
- id parsing
- event parsing
- heartbeat/comment
- final partial line behavior
- malformed frame tolerance
- first frames arriving before caller handler registration are buffered/not lost
- handshake timeout is cleared or separated from long-lived stream idle behavior
- connection stays healthy beyond one heartbeat interval
- `Content-Type: text/event-stream` is validated
- `end`, `error`, `aborted`, and unexpected `close` are observable

## Publisher acceptance / ordering

- definite failed publish does not permanently advance canonical seq/head/state
- ambiguous publish outcome produces the frozen validity behavior, not a blind duplicate-prone retry
- accepted publishes advance canonical state exactly once
- per-match async HTTP cannot overtake canonical publication order
- publisher failure/status counters are correct
- actual Nchan publisher metadata/header names produce the expected wire framing

## Connection accounting

- target connections means total actual attempts
- attempted = established + failed
- failures are not swallowed
- per-channel subscriber counts are correct

## Late join

- explicit prefill publishes configured depth
- expected history is independently derived
- frozen head-at-start is used
- missing history is detected
- moving live head does not invalidate the target

## Reconnect

- Last-Event-ID preserved
- canonical tracker preserved
- relevant head advances while disconnected
- relevant events published during outage > 0
- gap/duplicate/order errors are detected

## Surge

- starts at 60%
- ends at 100%
- never 140%
- surge duration mapping correct
- failures/drops recorded

## Slow consumers

- exactly ~5% selected
- healthy cohort remains separate
- latency before/during uses separate windows
- disconnects recorded in shared metrics
- resume correctness recorded

## Lobby

- latest-state join
- buffer length 1 semantics
- later full replacement delivered

## Result classifier

- valid ACCEPT case
- valid REJECT case
- generator CPU threshold -> INCONCLUSIVE
- generator event-loop threshold -> INCONCLUSIVE
- generator backlog threshold -> INCONCLUSIVE
- timing offset threshold -> INCONCLUSIVE
- host resource limit -> INCONCLUSIVE
- ephemeral-port exhaustion -> INCONCLUSIVE
- networking bottleneck -> INCONCLUSIVE
- frozen resource-envelope mismatch -> INCONCLUSIVE
- measurement bug -> INCONCLUSIVE
- unavailable mandatory evidence metric -> INCONCLUSIVE
- persistent cross-run variance beyond frozen limit -> INCONCLUSIVE
- valid mandatory ACCEPT criterion failure -> REJECT
- no valid metric range is left unclassified
- smoke profile cannot return architecture ACCEPT

## Configuration

- evidence target = 100000
- smoke target small
- evidence frozen durations
- invalid values fail fast
- seed loaded correctly
- resource limits represented correctly

## Connection/concurrency correctness

- active connection count excludes closed/disconnected entries
- active peak is measured independently of cumulative establishments
- reconnects cannot falsely satisfy the viewer-concurrency target
- deliberate teardown does not count as unexpected disconnect
- per-channel active counts change correctly during disconnect/reconnect/surge

## Metrics coverage / latency integrity

- every frozen/milestone-required metric has a real producer and classifier/test mapping
- no mandatory evidence metric remains a constant placeholder
- connection establishment rate peak, unexpected disconnects, Redis connected-client peak, generator shard health, OOM, CPU throttling and required network-throughput metrics are covered
- valid latency above the histogram range cannot disappear
- negative/invalid cross-component latency invalidates timing rather than being discarded
- percentile histograms account for all eligible samples, not a latest-N tail

## Slow-consumer fidelity

- slow consumer achieves approximately the frozen one-event-per-2-seconds behavior
- slow consumer produces genuine transport backpressure
- a complete socket pause is not silently substituted for the frozen workload

## Hot-viewer concentration

- hot-match subscriber distribution is explicitly frozen
- measured match-001 subscriber count matches that model
- total viewers/connections remain consistent with the viewer model
- hot-match expected fan deliveries/s uses both event rate and subscriber concentration

## Build reproducibility

- external source downloads use HTTPS
- Nginx/Nchan source versions are pinned and verified/identified immutably
- resolved Redis/Node/base image versions or digests are recorded
- package-lock is present and used
- no external floating `latest` dependency is required

## Contract/Nchan semantics

- lobby join after state already exists receives the buffered current state immediately
- `newest`/`oldest` behavior is tested or integration-verified against the chosen Nchan config
- transport EventSource ID is not assumed equal to `canonical_seq`
- Last-Event-ID resume works with opaque transport IDs
- channel naming exactly matches the active frozen contract
- buffer capacity can retain the complete frozen history plus required live-arrival margin
- literal Nchan restart recovery is tested if required by the active frozen contract

## EventSource wire metadata

- two distinct match event types produce the frozen `event:` values on the actual SSE wire if the active contract requires per-message event types
- subscriber configuration does not accidentally override publisher event metadata
- lobby fixed event metadata, if used, matches the active contract

## Runtime resource instrumentation

- event-loop delay uses a real bounded percentile monitor per load-generator shard
- event-loop threshold boundary behavior is tested
- CPU usage deltas are normalized to effective container CPU quota/cpuset
- CPU throttling counters are collected and interpreted explicitly
- OOM/OOM-kill counters are collected explicitly
- unavailable mandatory runtime signal -> INCONCLUSIVE
- resource peak sampling is phase-aware and bounded

## Delivery accounting

- live expected deliveries are channel-aware
- replay deliveries are excluded from live expected/received ratio
- late-join expected history is independently derived
- reconnect replay expected count is independently derived
- no accounting path can exceed 100% merely because replay traffic was mixed into live delivery

## Phase isolation / repeatability

- in-flight publishes cannot contaminate adjacent phase metrics
- per-match publisher order cannot be overtaken by async HTTP requests
- two sequential runs do not share stale Redis/channel history
- mandatory scenario failure cannot be ignored by final classification
- mandatory evidence scenario skip -> INCONCLUSIVE
- live/newest first canonical sequence establishes a baseline instead of a false historical gap
- phase-specific streaming histograms contain all samples without tail truncation bias
- histogram p50/p95/p99/max and overflow are correct
- evidence-suite 3-run variance calculation is correct
- evidence-suite extends toward 8 runs only under the frozen variance rule

## Evidence topology/preflight

- configured generator shards provide enough distinct TCP source tuple capacity to legitimately attempt 100k
- actual container CPU/memory limits are read back and verified
- unavailable/mismatched frozen resource limits -> INCONCLUSIVE
- evidence preflight reports FD and ephemeral-port constraints without silently mutating host sysctls

## Output contract

- human summary emitted
- machine-readable JSON emitted
- JSON contains run profile, contract version, resolved canonical configuration, validity reasons, scenario results, metrics and classification
- smoke output cannot claim final ACCEPT
- exit code matches documented result semantics

## Requirement traceability / terminal cleanup

- every applicable assignment POC requirement is mapped to implementation/test/evidence
- every normative active-contract statement is mapped or explicitly justified NOT_APPLICABLE
- closure matrix contains zero BLOCKED and zero unmapped normative rows before 100%
- duplicate configuration aliases cannot produce divergent scenario settings
- exact AI instruction artifact is preserved and hashed if this prompt is used
- every success/failure/inconclusive/preflight terminal path tears down and exits deterministically
- warm-up publisher/stabilization behavior matches the active frozen schedule exactly
- external Nchan/Redis/Node/Docker facts used for corrections have authoritative source provenance

---


## Scope / smallest experiment

- no demonstration UI/frontend
- no production application component
- every POC service/dependency/file is justified by the frozen experiment
- final deletion audit finds no unnecessary scope

## Parameter explainability

- all result-affecting non-assignment constants have ledger entries/rationales
- no contradictory hidden magic numbers
- resolved parameters are recoverable from structured output

## Timing / parser / generator stack

- late-join timer includes connection setup and validated catch-up
- reconnect boundary is tested
- split multibyte UTF-8 decodes correctly
- heartbeat/control frames do not enter canonical metrics
- subscriber response requires `text/event-stream`
- HTTP Agent/socket settings cannot silently cap generator shards
- pending-connect/error categories are observable

## Cross-node time / state reconstruction

- Nchan instances sharing Redis pass clock compatibility
- late-join replay reconstructs score/clock/head
- lobby buffered state matches a committed state boundary

## Memory boundedness

- slow-client Nchan memory sampled before/during/after
- frozen trend/settling rule applied

## Fresh-checkout / harness semantics

- final validation uses an exact clean commit/worktree
- commit SHA recorded
- harness validity separate from DUT smoke pass/fail
- prompt bytes/hash preserved if this file was actually used

---

## Repeated-run / shard aggregation

- same frozen seed policy is applied as declared
- run reset removes PRNG/metric/resource/channel leakage
- variance formula boundary cases are tested
- percentile aggregation never averages shard/run p95 values
- merged-histogram global p95 is tested
- simultaneous global active peak uses aligned snapshots
- shard phase barrier prevents one shard measuring while another warms up
- "once per campaign" scenarios are not accidentally repeated/pooled

## Peak/restart/surge validity

- peak-required scenarios cannot start before 100% target stabilization
- restart cannot commit canonical events through an unavailable publisher path
- restart/replacement detects missing, duplicate, and out-of-order sequences
- surge phase has its own live-latency/correctness/drop measurements

## Backpressure/sample adequacy

- slow-client test proves a positive backlog and actual server-side backpressure condition
- an absorbed-without-backpressure slow test is INCONCLUSIVE
- late-join/reconnect p95 sample population meets the frozen minimum

## Build/network/type integrity

- Nginx worker count respects effective CPU model
- portable Compose uses service DNS rather than invalid sibling `localhost`
- `.dockerignore` excludes generated artifacts
- runner Dockerfile uses `npm ci`
- incompatible port interfaces cannot be hidden by `as any`
- malformed JSON/schema/application frames are counted and affect result validity/correctness

---

# 9. One-command clean-checkout requirement

From a clean checkout, smoke mode must work with:

```bash
docker compose -f poc/compose.yaml up --build \
  --abort-on-container-exit \
  --exit-code-from runner
```

No prior `npm install`, `docker build`, `redis-server`, `nginx`, `node`, or `tsx` may be required on the host.

Only the container runtime may be assumed.

All typecheck/unit/integration validation required for Milestone 2 must also be runnable through containers; do not require host-installed Node/npm/Redis/Nginx.

The final reproducibility validation must use a fresh/clean checkout at a recorded commit SHA and must not rely on pre-existing custom images or untracked files.

The evidence command must be prepared as one command, for Milestone 3:

```bash
docker compose -f poc/compose.evidence.yaml up --build \
  --abort-on-container-exit \
  --exit-code-from runner
```

Do not execute the full evidence campaign during this task.

---

# 10. Development validation loop

After each meaningful repair, execute the relevant tests.

Then repeatedly run this full loop:

```text
PASS 1   inspect repository / identify remaining gaps
PASS 2   typecheck
PASS 3   unit tests
PASS 4   clean Docker build
PASS 5   nginx -t
PASS 6   Redis health
PASS 7   Nchan-1 health
PASS 8   Nchan-2 health
PASS 9   basic publish -> SSE receive
PASS 10  lobby state test
PASS 11  history prefill + replay
PASS 12  late join under live load
PASS 13  Last-Event-ID reconnect while publishing
PASS 14  cross-node shared-Redis resume
PASS 15  slow-client/backpressure
PASS 16  scaled connection surge
PASS 17  resource measurements
PASS 18  classification validity
PASS 19  clean one-command smoke run reaches a deterministic structured terminal result; verify harness validity separately from DUT smoke outcome
PASS 20  source-tree cleanliness
PASS 21  publisher failure/ambiguous-outcome validation
PASS 22  SSE first-frame + heartbeat-duration validation
PASS 23  streaming histogram/phase-metric validation
PASS 24  Nginx/FD/ephemeral-port topology preflight
PASS 25  frozen decision-table + repeated-run-suite validation
PASS 26  full completion-gate audit
```

If any pass fails:

```text
fix
rerun the failed pass
rerun any dependent passes
continue
```

Do not skip failed checks.

---

# 11. Sequential gap-closing loop

Use this exact control logic:

```text
LOOP:

1. Calculate current Milestone 2 completion state from objective gates.
2. Find the highest-impact remaining real gap.
3. Fix only that gap and its required dependencies.
4. Run focused tests.
5. Run regression tests.
6. Recalculate completion.
7. If < 100%, return to step 2.
8. If 100%, run the entire Milestone 2 completion gate once more from start to finish.
9. Then run a separate adversarial pass whose sole purpose is to find an internal contradiction, unmeasured mandatory variable, easier-than-frozen proxy, hidden generator/server limit, reproducibility dependency, or unnecessary scope.
10. If either the full gate or adversarial pass finds anything material, completion returns below 100% and the loop continues.
11. Stop only when both the full gate and adversarial pass find no material gap.
```

Do not define completion by lines of code or number of files.

Completion is defined only by the objective gate below.

---

# 12. Milestone 2 objective completion gate

Milestone 2 is 100% complete only if **all** are true:

## Governance

- v2.0.1 remains the active frozen contract unless a genuine frozen-variable contradiction required a new version
- milestone file truthfully reflects state
- historical smoke results are not misrepresented as final evidence
- Milestone 3 has not been executed

## Architecture

- Ports/Adapters structure remains clean
- no unnecessary framework introduced
- no obsolete raw-WebSocket architecture reintroduced

## Reproducibility

- clean checkout
- one Docker Compose command
- all images build automatically
- no host Node/Redis/Nginx dependency
- package lock retained
- generated junk ignored

## Workload

- deterministic seed
- 8 matches
- scheduled/attempted steady generation rate matches the frozen workload when the generator is healthy
- scheduled/attempted burst generation rate matches the frozen workload when the generator is healthy
- accepted-publish rate is measured separately and may truthfully expose a DUT failure
- lobby workload correct
- hot-match distribution correct
- phase-scoped rate/distribution metrics
- publisher scheduler lag/backlog can distinguish generator inability from DUT publish rejection

## Connection load

- target means actual total target
- attempt accounting correct
- evidence profile target = 100000
- coherent 60% -> 100% surge
- surge duration = 120s in evidence profile

## Correctness

- measurement/oracle tests correctly detect missing sequences, duplicates, and out-of-order sequences
- smoke integration reports any observed DUT gap/duplicate/order violation truthfully rather than requiring a fabricated pass
- sequence validator tested
- live/newest subscriber baseline cannot create false pre-join gaps
- canonical state/head advances only on an unambiguous accepted publish
- ambiguous publish outcomes follow frozen validity semantics
- per-match publisher requests cannot overtake canonical order
- expected delivery accounting channel-aware
- synthetic score agrees with committed event history
- synthetic clock/period transitions are coherent and deterministic
- failed/ambiguous publish cannot leave simulator state ahead of committed history
- SSE first-frame handler race is eliminated
- long-lived SSE timeout is compatible with heartbeat interval

## Late join

- explicit full-history prefill
- independently known expected history
- late-join harness verifies and reports received/missing/order/state reconstruction truthfully
- late join targets frozen head-at-start
- catch-up timing measured with the frozen boundary
- <=2s criterion represented exactly in the classifier
- a genuine smoke miss/timeout is preserved as a DUT observation rather than making the harness incomplete

## Reconnect

- Last-Event-ID retained
- canonical state retained
- relevant publishing continues during outage according to the frozen scenario
- relevant head advancement/accepted-event range is independently observed
- catch-up target is independently frozen
- harness detects and reports reconnect gaps, user-visible duplicates, and order violations
- frozen reconnect correctness criteria are encoded exactly
- a genuine smoke reconnect failure is preserved as a DUT observation rather than making the harness incomplete

## Shared Redis / Nchan replacement

- two-node topology actually executable
- both nodes share Redis
- cross-node history/resume actually tested
- claim wording matches what was really tested

## Slow clients

- only 5% slowed
- actual read-side backpressure
- healthy cohort measured separately
- slow disconnect/resume metrics recorded
- no fake unconditional pass

## Resource health

- runner/load-generator CPU/memory/event loop measured per real shard
- load-generator event-loop p99 comes from a real bounded phase monitor, not sparse probes
- Nchan CPU/memory measured
- Redis CPU/memory measured
- CPU percentages are normalized to effective runtime quotas/cpusets
- container OOM/OOM-kill state measured explicitly
- CPU throttling events/time measured explicitly
- exact frozen generator-saturation thresholds implemented
- actual cgroup/container resource limits read back and match the frozen evidence envelope
- instrumentation/logging overhead is bounded/understood
- unavailable required evidence metrics cannot silently pass

## Concurrency and metric integrity

- 100,000 criterion uses actual simultaneous active viewer concurrency, not cumulative connection establishments
- active/per-channel subscriber counts exclude disconnected entries
- unexpected disconnects are separated from deliberate teardown/reconnect actions
- every metric required by the active contract/milestone has a real measured source or forces INCONCLUSIVE if unavailable
- no valid slow-latency sample is silently censored
- bounded percentile structures represent all eligible samples and report invalid/overflow counts

## Workload fidelity

- slow consumers implement the frozen receive-rate behavior, not an arbitrary stronger pause
- hot-match subscriber concentration is frozen and actually exercised
- viewer count, SSE connection count, and per-channel distribution are mutually consistent
- generated event types match the active frozen schema/workload

## Build identity

- source downloads are HTTPS and pinned
- reproducible component versions/image identities are recorded
- no external floating image is required for a clean build

## Contract and Nchan semantics

- no unresolved contradiction remains in the active frozen contract
- official Nchan 1.3.8 behavior has been used to resolve Nchan-specific semantics
- lobby join returns the already-buffered current state immediately
- transport resume cursor remains separate from canonical application sequence
- history buffer is large enough for the complete frozen history plus live-arrival margin
- literal restart behavior is implemented if required by the active frozen contract
- channel names match the active frozen contract exactly
- actual match SSE `event:` metadata matches the active frozen wire contract and is not accidentally overridden by subscriber configuration

## Evidence topology

- viewer-to-SSE-connection model is frozen and totals are explicit
- the configured generator topology is structurally capable of attempting 100,000 viewer connections without a known single-source ephemeral-port ceiling
- Nginx/Nchan worker/file-descriptor capacity has explicit headroom for the assigned connections
- load-generator shards are real, not just a numeric `WORKER_COUNT`
- each shard has health/resource metrics
- auxiliary/replacement-node resources are separated from the DUT resource envelope
- high-scale host preflight identifies environmental limits without privileged mutation

## Accounting and repeatability

- live and replay delivery accounting are separated
- expected live deliveries are channel-aware and use frozen subscription/publish boundaries
- phase boundaries cannot be contaminated by in-flight publishes
- streaming histograms preserve all eligible samples in bounded memory
- simulator preserves per-match publisher order
- repeated runs are isolated from stale Redis/channel state
- evidence-suite orchestration for minimum 3 / maximum 8 variance handling is implemented
- one mandatory scenario result collection feeds the authoritative classifier

## Output contract

- human summary emitted
- machine-readable JSON emitted
- machine-readable result contains contract/run profile/validity/scenario/metrics/classification fields
- exit-code behavior is documented and deterministic

## Smallest-experiment scope

- no demonstration UI or production application code exists in `poc/`
- every remaining service/dependency/file materially supports the frozen experiment
- final deletion audit found no safe scope reduction preserving validity

## Parameter explainability

- every material non-assignment number has a classification and rationale/derivation
- no result-affecting magic number exists only in source
- resolved run parameters are recoverable from structured output

## Timing / protocol correctness

- late-join timing includes connection setup and ends after validated catch-up
- reconnect timing boundary is implemented consistently
- streaming UTF-8 decode is correct across chunk boundaries
- heartbeat/control frames are excluded from canonical metrics
- subscriber Content-Type is validated
- generator HTTP/socket settings cannot silently cap assigned population
- shared-Redis Nchan-node clock compatibility is measured

## State/memory correctness

- late-join replay reconstructs score/clock/head
- lobby buffered state matches a committed state boundary
- slow-client memory boundedness uses the frozen before/during/after trend/settling rule
- synthetic score/clock/seq/head commit is atomic with accepted publish

## Harness-vs-DUT separation

- harness validity is explicit and independent of the DUT smoke observation
- Milestone 2 does not require a favorable Nchan/Redis smoke result
- genuine DUT failures remain findings for Milestone 3 instead of being "fixed" by threshold changes

## Repeated-run / distributed aggregation

- primary seed policy is frozen
- cross-run dispersion formula and boundary are frozen
- run-vs-pooled acceptance rule is frozen
- per-run state/resource baselines are reset
- shard phases use barriers
- global percentiles merge histograms rather than average p95/p99
- global active/connection-rate peaks are time-aligned
- scenario repetition matrix distinguishes per-run from once-per-campaign work

## Peak / restart / surge validity

- every peak-required scenario records and meets its required active concurrency
- restart publisher behavior during outage is explicit and canonical-safe
- restart/replacement checks missing/duplicate/order
- surge phase measures existing-viewer latency/correctness/drop behavior

## Backpressure / sample adequacy

- slow-client scenario demonstrably reaches server-side backpressure under the frozen receive rate
- Nchan bounded-memory conclusion uses sufficient duration and the frozen trend rule
- each reported p95 has the frozen adequate sample population

## Build/network/type integrity

- Nginx worker count aligns with the effective CPU quota/cpuset
- Compose service addressing is correct for each network profile
- `.dockerignore` prevents local generated artifacts entering images
- runner dependency installation uses `npm ci`
- port/domain boundaries do not rely on unsafe `as any` casts
- malformed/control/application-frame errors are accounted and cannot disappear silently

## Traceability / configuration / lifecycle closure

- full assignment/contract/Milestone-2 traceability matrix exists internally
- zero BLOCKED rows
- zero unmapped normative active-contract requirements
- every PASS row has executable implementation + validation evidence
- canonical configuration has no unresolved duplicate aliases
- resolved run configuration is emitted in machine-readable output
- exact AI instruction artifact used for this work is preserved/hash-recorded
- all terminal paths have bounded deadlines, idempotent teardown, and deterministic process exit
- warm-up traffic/state/stabilization boundaries match the active contract and measured metrics begin at the correct boundary
- external technical facts used to correct the contract/harness are captured in an authoritative source ledger

## Classification

- exactly one authoritative classifier
- smoke cannot return final ACCEPT
- invalid experiment -> INCONCLUSIVE
- valid failed architecture criterion -> REJECT
- valid all-pass evidence -> ACCEPT

## Testing

- typecheck passes
- all implementation/unit/measurement-oracle tests pass
- Nginx config test passes
- integration harness tests execute required paths and their assertions about measurement machinery pass
- one-command smoke run reaches the documented structured terminal result and exit code
- any genuine DUT smoke PASS/FAIL/INCONCLUSIVE is preserved rather than converted into a harness-pass requirement
- clean tree after run
- final reproducibility run uses an exact clean commit/worktree

Only after **every item above passes** may Milestone 2 be marked:

```text
DONE — 100%
```

---

# 13. Contract contradiction handling

Do not create a new experiment contract version for implementation bugs or wording cleanup.

Create a new version only if a genuine frozen experimental variable is internally contradictory and impossible to satisfy consistently.

If that occurs:

1. identify the exact contradiction;
2. cite the conflicting frozen statements;
3. define the minimal correction;
4. document OLD / NEW / WHY;
5. freeze the corrected version;
6. update the milestone reference;
7. continue the Milestone 2 loop.

Never use benchmark results to choose a more favorable threshold.

---

# 14. Failure semantics

If the corrected implementation reveals Nchan/Redis cannot meet a frozen criterion during a valid development-scale test, do not hide it.

Milestone 2 can still be implementation-complete even if Milestone 3 may later produce REJECT, provided the harness faithfully measures the frozen experiment.

Milestone 2 is about:

```text
correct experiment implementation
```

not:

```text
guaranteeing the architecture passes
```

Do not distort implementation to force `ACCEPT`.

---

# 15. External execution blocker handling

The instruction is to continue until 100%.

Therefore, if an execution problem occurs:

1. diagnose it;
2. attempt all reasonable fixes within repository scope;
3. try an alternative repository-local approach;
4. rerun;
5. continue.

Examples:

- Docker build failure -> fix Dockerfile/Compose
- port collision -> eliminate fragile host networking or use configurable ports
- container health failure -> fix config/healthcheck
- Nchan build mismatch -> fix pinned build
- resource probe unavailable -> implement a different safe service-local probe
- test timeout -> determine whether code or test is wrong; do not simply increase timeout blindly

Only if there is a genuine external impossibility outside repository control may you stop short of 100%.

If that happens:

- do not claim completion;
- leave Milestone 2 open;
- state the exact blocker;
- state exactly which completion-gate items remain unverified.

---

# 16. Do not start Milestone 3

This task ends when Milestone 2 is 100%.

Do NOT:

- run 3-5 final evidence repetitions
- perform the full 100k evidence campaign
- declare final production architecture ACCEPT/REJECT from final evidence
- write `proposal.md`
- complete final cost model
- create final submission README
- package final ZIP
- deploy AWS resources

The exact next task after successful completion is:

```text
Milestone 3 — Run the Frozen POC and Produce Evidence
```

---

# 17. Milestone file update at completion

When and only when the full completion gate passes, update:

```text
internal_docs/LIVE_MATCH_CENTRE_ASSIGNMENT_MILESTONES (3).md
```

to reflect:

```text
Milestone 1 — DONE
Milestone 2 — DONE — 100%
Milestone 3 — NEXT
```

The Milestone 2 section must summarize what is now actually implemented.

Do not include final Milestone 3 benchmark results because they have not been run yet.

---

# 18. Final self-audit before stopping

Before stopping, answer all of these from actual repository state:

1. Can a clean reviewer clone the repo and run smoke mode with one command?
2. Does Compose build all custom images automatically?
3. Does target connection count mean the real total?
4. Does evidence mode target 100,000?
5. Is the surge 60% -> 100%, not 100% -> 140%?
6. Is the publisher deterministic?
7. Are steady/burst scheduled/attempted rates measured against the frozen workload, with accepted-publish rate reported separately?
8. Is hot-match concentration phase scoped and approximately 80%?
9. Does the lobby have real subscribers and latest-state semantics?
10. Is full retained history explicitly prefilled?
11. Is expected history independently known?
12. Is late join measured to a frozen head-at-start?
13. Does reconnect keep publishing?
14. Does reconnect preserve Last-Event-ID?
15. Does reconnect preserve canonical sequence state?
16. Does the relevant match head advance during outage?
17. Is cross-node Redis history actually executed?
18. Are only 5% of clients slowed?
19. Is backpressure real at the read/socket level?
20. Are healthy-client metrics isolated from slow-client metrics?
21. Are Nchan resource metrics real?
22. Are Redis resource metrics real?
23. Are runner/generator resource metrics real?
24. Is expected fan delivery channel-aware?
25. Is there only one authoritative classifier?
26. Does invalid timing cause INCONCLUSIVE?
27. Does generator saturation cause INCONCLUSIVE?
28. Does host exhaustion before 100k cause INCONCLUSIVE?
29. Can smoke mode ever incorrectly print architecture ACCEPT?
30. Do all tests pass?
31. Does `nginx -t` pass?
32. Does the clean one-command smoke run reach the documented deterministic structured terminal result, with harness validity separated from DUT smoke outcome?
33. Is the source tree clean afterward?
34. Does a new lobby subscriber receive the already-buffered current lobby state immediately?
35. Are Nchan transport IDs treated as opaque transport cursors rather than canonical sports-event IDs?
36. Can the retained buffer hold the complete frozen history plus live-arrival margin without eviction?
37. Is the literal Nchan restart test actually automated if the active frozen contract requires it?
38. Can the configured generator topology legitimately attempt 100,000 TCP connections without a deterministic single-source ephemeral-port ceiling?
39. Are live deliveries and replay deliveries accounted separately?
40. Are phase metrics protected from in-flight publish contamination?
41. Can async publisher requests never overtake canonical per-match order?
42. Are sequential runs isolated from stale Redis/channel history?
43. Are actual container CPU/memory limits verified at runtime?
44. Does every mandatory evidence scenario feed the authoritative classifier?
45. Does the runner emit a machine-readable JSON result with deterministic exit semantics?
46. Can the SSE client receive initial frames without a handler-registration race?
47. Is the long-lived SSE timeout safely compatible with the heartbeat interval?
48. Does a live/newest subscriber avoid false gaps for history that predates its subscription?
49. Does canonical state/head advance only after unambiguous publish acceptance?
50. Are ambiguous publisher outcomes handled without blind duplicate-prone retries?
51. Are percentile metrics based on all eligible phase samples rather than a tail-truncated array?
52. Is the effective lobby publisher buffer actually 1, not only the subscriber-side setting?
53. Are official Nchan publisher metadata headers/wire framing integration-verified?
54. Is Nginx/Nchan FD/worker capacity structurally sufficient with headroom for the assigned evidence connections?
55. Is the viewer-to-connection model explicit and consistent with the 100,000-viewer assignment target?
56. Are the exact frozen generator/timing/resource INCONCLUSIVE thresholds encoded?
57. Is the minimum-3 / up-to-8 repeated-run evidence orchestration implemented and variance-tested?
58. Is the frozen scenario schedule mathematically executable with no event scheduled outside its phase?
59. Are the contract's 100k ACCEPT rules internally consistent and free of a 10k/extrapolation shortcut?
60. Are ACCEPT, REJECT, and INCONCLUSIVE mutually exclusive and exhaustive for every valid result?
61. Is the slow-client acceptance rule internally consistent?
62. Are auxiliary/replacement-node resources separated from the DUT resource envelope?
63. Is the hot-match 80% denominator unambiguous?
64. Does the synthetic score agree exactly with successfully committed event history?
65. Are synthetic clock/period transitions coherent and deterministic, including across failed/ambiguous publishes?
66. If a corrected contract superseded v2.0.1, did the implementation and milestone reference switch immediately to the new active frozen version without editing the superseded frozen file in place?
67. Can the result artifact distinguish assignment facts, direct POC measurements, planning assumptions, production inferences, and unresolved external assumptions?
68. Is there any unresolved contradiction in the active frozen contract?
69. Does the 100,000-viewer criterion use simultaneous active concurrency rather than cumulative establishments?
70. Are expected deliveries driven by currently connected per-channel subscribers?
71. Are unexpected disconnects separated from deliberate teardown/reconnect?
72. Is every frozen/milestone-required metric either truly measured or treated as an evidence validity blocker?
73. Can no valid high-latency sample disappear because of filtering or histogram truncation?
74. Does the slow-consumer implementation match the frozen receive-rate behavior rather than an arbitrary full pause?
75. Is viewer concentration on the hot match explicitly frozen and actually exercised?
76. Are build/source/image identities sufficiently pinned and recorded for reproducibility?
77. Does the generated event-type set agree with the active frozen schema?
78. If the active contract requires per-message SSE event types, do distinct event types survive Nchan onto the actual wire without a hard-coded subscriber override?
79. Is load-generator event-loop p99 measured with a real phase-aware percentile mechanism rather than sparse probes?
80. Are CPU percentages normalized to effective container quotas/cpusets, with throttling measured explicitly?
81. Are OOM/OOM-kill signals measured explicitly rather than inferred?
82. Is the POC still the smallest experiment that measures the selected risk, with no demonstration UI or production-system scope?
83. Can every material non-assignment number/decision be explained from a parameter ledger rather than hidden source constants?
84. Does late-join timing start before connection initiation and end after canonical catch-up validation?
85. Does the SSE parser preserve multibyte UTF-8 split across transport chunks?
86. Are heartbeat/control frames excluded from canonical delivery/latency metrics?
87. Can no Node HTTP Agent/socket default silently cap a generator shard below its assigned target?
88. Are all Nchan instances sharing Redis verified to have compatible clocks?
89. Does late-join replay reconstruct score/clock/head coherently at the frozen boundary?
90. Does the lobby buffered state equal a coherent committed publisher state boundary?
91. Does the slow-client test use a pre-frozen memory trend/settling rule rather than one peak?
92. Was the final one-command proof run from an exact clean commit/worktree without hidden local artifacts?
93. Is Milestone 2 harness validity explicitly independent of whether the DUT smoke observation is favorable?
94. If this prompt was actually used as an AI instruction artifact, is its exact bytes/hash preserved?
95. Does the active contract truthfully describe how Nginx/Nchan are built?
96. Does the portable one-command smoke path avoid manual privileged host tuning?
97. Is the publisher fan-out T0 captured at the exact frozen boundary and is scheduler lag measured?
98. Is the 120-second surge deadline-based rather than stretched by sequential batch connection time?
99. Can a failed/ambiguous goal publish never partially advance score/clock/seq/head?
100. Is the cross-run variance formula, seed policy, and per-run-vs-pooled acceptance rule frozen before evidence?
101. Are shard percentiles merged mathematically rather than averaged, and are global peaks time-aligned?
102. Do all real generator shards obey coordinated phase barriers?
103. Do all scenarios that claim 100k behavior actually execute at stabilized 100k concurrency?
104. Is publisher behavior during literal Nchan downtime explicitly frozen and canonical-safe?
105. Does the slow-client case demonstrably reach server-side backpressure rather than merely fill client/kernel buffers?
106. Are late-join/reconnect percentile sample populations adequate and frozen?
107. Does each qualifying run reset/rebaseline PRNG, metrics, channel state, connection state, and resource counters?
108. Does Nginx worker count align with the effective DUT CPU quota/cpuset?
109. Are all Compose sibling-service addresses correct for the selected network mode?
110. Do `.dockerignore` and `npm ci` prevent local-machine dependency/build contamination?
111. Are Ports-and-Adapters boundaries type-safe rather than papered over with `as any`?
112. Does restart/replacement validation include missing/duplicate/order checks?
113. Does the surge phase measure existing-viewer latency, correctness, and unexpected drops?
114. Are subscriber eligibility boundaries defined strongly enough for delivery accounting during churn?
115. Are malformed SSE/JSON/schema/timestamp/ID errors counted rather than ignored?
116. Is there any unresolved contradiction in the active frozen contract?
117. Does the full requirement-traceability matrix have zero BLOCKED rows and zero unmapped normative requirements?
118. Are all result-affecting configuration values resolved from one canonical source without conflicting aliases?
119. Is the exact AI instruction artifact used for this work preserved byte-for-byte with SHA-256?
120. Do all success/failure/inconclusive/preflight paths tear down and terminate deterministically?
121. Is the POC still the smallest experiment focused on the single locally testable architecture risk rather than unrelated product scope?
122. Does warm-up actually run the frozen publisher/state-population behavior and the exact stabilization boundary before measured steady state?
123. Are all external technical facts used to correct the contract/harness recorded with authoritative source provenance?
124. Is there any known material Milestone 2 defect left?

If the answer to #116 or #124 is YES:

```text
DO NOT STOP.
CONTINUE THE LOOP.
```

Only if all required answers are satisfactory, #116 is NO, #117-#123 are YES, and #124 is NO may you stop.

---

# 19. Final response format

When the gap is truly 100% closed, report only:

## Completion

```text
Milestone 2 completion: 100%
Milestone 2 status: DONE
Milestone 3 status: NEXT
```

## Repository changes

- files created
- files modified
- files removed

## Final validation

- typecheck command + result
- unit-test command + result
- Docker clean-build command + result
- `nginx -t` result
- one-command smoke run + result
- explicit HARNESS_VALID / HARNESS_INVALID status
- truthful DUT smoke observation (`SMOKE_PASS`, `SMOKE_FAIL`, or `SMOKE_INCONCLUSIVE`)
- machine-readable JSON schema/result validation
- documented exit-code behavior + observed smoke exit code
- exact clean-checkout commit SHA used for final validation

## Smoke measurements

- actual target attempted
- established
- failed
- steady events/sec
- burst events/sec
- hot-match percentage
- lobby behavior
- history depth prefilled
- history depth received
- late-join catch-up time
- reconnect relevant events published while disconnected
- reconnect gaps/duplicates/order violations
- surge start -> end population
- cross-node Redis result
- slow-client result
- Nchan resource metrics
- Redis resource metrics
- runner resource metrics
- actual runtime CPU/memory limits
- live expected vs received deliveries
- replay expected vs received deliveries
- lobby buffered-current-state join result
- literal Nchan restart result
- transport-ID vs canonical-sequence validation
- run-isolation validation
- load-generator shard/source-IP topology
- simultaneous active-concurrency peak and per-channel viewer distribution
- connection-establishment peak rate
- unexpected vs deliberate disconnect counts
- metric-coverage matrix status
- latency invalid/overflow counts
- slow-consumer achieved receive rate
- hot-match subscriber concentration and expected fan deliveries/s
- resolved build component versions/image digests or IDs
- actual SSE `event:` metadata validation result
- load-generator event-loop p99 measurement method/result per shard
- CPU quota-normalized utilization and throttling counters
- OOM/OOM-kill counters
- Nchan-node clock compatibility result
- late-join reconstructed score/clock/head comparison
- lobby committed-state comparison
- slow-client memory trend/settling result
- publisher scheduler lag
- actual 120-second surge timing error
- parameter/decision ledger completeness
- scope-minimization/deletion-audit result
- AI instruction artifact/hash if this prompt was used
- cross-run variance formula and seed policy
- shard barrier/global percentile aggregation validation
- peak-required scenario concurrency checks
- restart publisher-outage behavior
- slow-client backpressure sufficiency result
- late-join/reconnect sample counts
- Nginx worker/effective-CPU alignment
- Compose service-addressing validation
- `.dockerignore`/`npm ci` reproducibility checks
- malformed-frame/payload error counts
- surge-phase existing-viewer latency/correctness/drop metrics
- requirement-traceability matrix closure status
- resolved canonical configuration snapshot
- AI-instruction artifact path + SHA-256
- terminal-path cleanup/exit validation
- warm-up/stabilization contract validation
- external technical-source provenance ledger status

## Evidence readiness

- evidence target viewer count and SSE connection count
- viewer-to-connection model
- load-generator shard/source-IP/destination topology
- Nginx/Nchan capacity preflight result
- frozen durations and executable scenario schedule
- frozen DUT resource envelope vs auxiliary/load-generator resources
- exact frozen INCONCLUSIVE thresholds
- evidence-suite minimum/maximum run count and variance rule
- exact one-command evidence command
- confirmation that full Milestone 3 evidence campaign was NOT run

## Remaining blockers

Must be:

```text
NONE
```

if claiming 100%.

Do not paste the full source code into the response.

Do the work in the repository.
Do not stop at a percentage below 100%.
