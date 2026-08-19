# AGENTS.md
## Live Match Centre Take-Home — AI/Implementation Control Contract

## Purpose

This is an **auxiliary AI instruction file**, not the design proposal. It governs AI-assisted research, drafting, coding, testing, and review for this take-home.

The objective is simple: preserve the assignment exactly, make the production design defensible, test one genuinely risky assumption with the smallest useful experiment, and report evidence without exaggeration.

The candidate owns every final architecture choice, assumption, number, benchmark interpretation, and claim.

---

# 1. Authority

Use this order when instructions conflict:

1. Take-home assignment
2. Explicit candidate decisions
3. Approved decisions in `proposal.md`
4. This `AGENTS.md`
5. POC experiment contract / `README.md`
6. Code
7. AI suggestions

Never silently change a higher-authority requirement. If evidence invalidates an approved design decision, surface the conflict, update the proposal explicitly, and explain why.

A failed or inconclusive experiment is valid evidence. Do not move the target to make the result look successful.

---

# 2. Fixed assignment facts

Treat these as immutable:

- 8 concurrent live matches at peak.
- Third-party feed pushes ~10 events/s total, bursting to ~50 events/s.
- Feed delivery is best-effort, with no long retry window.
- 100,000 concurrent viewers at peak.
- Viewer surge: +40,000 within 2 minutes.
- Audience: ~60% Europe / ~40% North America.
- Goal latency: p95 ≤ 2 s from ingest to the viewer's screen.
- Other-event latency: p95 ≤ 5 s.
- Late join/reload: full match history visible within 2 s.
- Infrastructure budget: ≤ $3,000/month at peak.
- Weekly deploys may occur during live matches and must not be noticeable.
- Frontend: Next.js App Router, component-based.
- AWS preferred; alternatives require justification.
- Fans are anonymous, public, read-only, with no accounts.
- Match score and clock are derived from the event stream.

The final delivery contains:

```text
proposal.md
README.md
poc/
AGENTS.md
[other agent instruction files only if actually used]
```

Do not round constraints into easier targets or add requirements that are not present.

---

# 3. Preserve the intended user experience

The architecture must satisfy the scenario, not only the numbers.

- **Lobby:** all live matches show current score/minute and state-changing events update without refresh.
- **Late join / reload / wake-up:** the fan sees coherent history/current state immediately, then continues live.
- **Trustworthy state:** the application does not create duplicates, disappearing events, ordering errors, or double-applied score changes.
- **Live feel:** user-facing latency, not only backend throughput, must meet the stated p95 targets.
- **Crowd invariance:** the experience remains materially equivalent at small audiences and at peak/surge load.

---

# 4. Provider-boundary honesty

The feed is best-effort. Do **not** assume replay, snapshots, reconciliation, provider sequence numbers, uniqueness, guaranteed redelivery, idempotency, or a second provider unless explicitly labelled as an external assumption.

Keep these separate:

```text
provider loss != application loss
```

The system may guarantee that an event successfully accepted at ingest is not duplicated, lost, or reordered by the application. It cannot guarantee recovery of an event the provider never delivered unless a real recovery source exists.

If the design depends on an unstated provider capability, name the assumption and state what changes if it is false.

---

# 5. Production design gate

Every major component in `proposal.md` must earn its place.

For each important choice, be able to explain:

1. which requirement it serves;
2. why it is needed;
3. the simpler alternative considered;
4. why the chosen option won;
5. its main failure mode;
6. its latency effect;
7. its cost effect;
8. its deployment behaviour;
9. its effect on consistency.

The full path must be clear:

```text
third-party feed
  -> ingest
  -> validation / normalization
  -> ordering / deduplication / state derivation
  -> current/history state
  -> fan-out / delivery
  -> geographic delivery
  -> Next.js client
  -> coherent lobby / match view
```

The proposal must address, proportionally and without service-catalogue overengineering:

- safe history/snapshot → live-stream handoff;
- reconnect/reload/sleep-wake recovery;
- viewer surge and backpressure;
- Europe/North America delivery;
- live-match deploy and rollback;
- feed interruption/resume;
- obvious failure domains / single points of failure;
- event schema evolution;
- public-endpoint abuse/DDoS protection;
- observability for latency, errors, drops, lag, and connection health;
- peak-month cost under $3,000.

Prefer a few well-justified components over a large architecture diagram full of unnecessary services.

---

# 6. Correctness invariants

Use explicit invariants instead of vague reliability claims.

1. **Stable event identity** — enough identity exists for the stated deduplication guarantee.
2. **Canonical ordering** — define match-event order; do not assume network arrival order is canonical.
3. **Idempotent application** — reprocessing an accepted event cannot duplicate it or apply its state mutation twice.
4. **Score/clock/history coherence** — visible derived state and visible history come from a compatible state boundary.
5. **Snapshot-to-live correctness** — events occurring during history load are neither missed nor shown twice when streaming begins.
6. **Recovery correctness** — reconnect, reload, sleep/wake, deploy, or downstream connection loss does not create application-induced gaps, duplicates, or reordering.
7. **Upstream-boundary honesty** — the application cannot manufacture an event never delivered by the provider.
8. **Clock semantics** — if the client extrapolates a running clock between feed updates, define correction/resynchronization behaviour.

---

# 7. Cost discipline

Exact cloud prices or quotas must come from current authoritative sources.

Include the material cost drivers of the chosen architecture, as applicable:

- compute;
- connection/fan-out service;
- request/message volume;
- data transfer/egress;
- CDN/edge;
- storage;
- cross-region traffic;
- observability;
- reasonable operating margin.

Do not omit a dominant cost to force the model under $3,000. If a price is uncertain, label it rather than using false precision.

---

# 8. Select one architecture-critical POC assumption

The POC tests **one** assumption.

Rank candidates using:

- **impact:** how much of the architecture changes if false?
- **uncertainty:** how little confidence exists without measurement?
- **local measurability:** can a local experiment produce useful evidence?
- **relevance:** does it map directly to an assignment constraint?

Use this test:

> If this assumption is false, would I materially change the proposed architecture?

If no, it is probably not risky enough.

Possible candidates include fan-out under connection surge, snapshot-to-live correctness, reconnect recovery, or another architecture-specific risk. These are examples only; select the risk after the design establishes what is genuinely uncertain.

If the true highest-risk assumption cannot be tested locally, say so and test the riskiest locally testable one, as the assignment permits.

---

# 9. Freeze the experiment before final measurement

Record the experiment contract before the final measured run.

## Assumption
One falsifiable sentence.

## Architecture dependency
Which production decision changes if the assumption is false?

## Local-test limitation
What production claim can this local experiment **not** prove?

## Workload
Declare, where relevant:

- matches;
- steady/burst event rate;
- viewer/connection count;
- connection ramp/surge shape;
- payload size;
- duration;
- warm-up;
- measured repetitions;
- resource limits;
- random seed if randomness affects results.

## Metrics
Collect only what decides the assumption, for example:

- throughput;
- p50/p95/p99 latency;
- drops;
- duplicates;
- out-of-order events;
- connection establishment/sustained connections;
- history load time;
- handoff errors;
- reconnect time;
- CPU/memory.

## Acceptance criteria
Freeze success/failure thresholds before the final measured run.

Changing a threshold after seeing results creates a **new experiment** and must be recorded as such.

---

# 10. Measurement integrity

## Measure the boundary you claim
A measurement of:

```text
ingest -> server receiver
```

is not the same as:

```text
ingest -> viewer screen
```

If browser rendering, Internet transit, edge/CDN, geographic propagation, or another segment is absent, state that limitation.

## Timing and percentiles
Use a monotonic clock for elapsed timing where practical. Define metric start/end points and the sample population used for p95/p99.

## Runs
Do not cherry-pick the best run. Use repeated runs when variance matters. Separate warm-up from measured intervals.

## Environment
Record enough local context to interpret results: CPU, memory, container limits, runtime versions, and relevant host limits.

## Capacity tests
If the assumption concerns capacity, do not merely prove that one load level “worked.” Where practical, increase load enough to identify the performance knee or failure region and report headroom.

## Synthetic-load limits
Detect/disclose when file descriptors, ephemeral ports, loopback networking, scheduler limits, or the load generator itself dominate the result.

## No unjustified extrapolation
A local or reduced-scale benchmark does not directly prove 100,000-user production capacity. Any scaling argument is an inference and must be labelled as such.

Valid outcomes:

```text
ACCEPT
REJECT
INCONCLUSIVE
```

`ACCEPT` means the assumption survived the declared experiment, not that the whole architecture is proven.

---

# 11. Workload fidelity

When relevant, model:

- ~10 events/s steady;
- ~50 events/s burst;
- up to 8 matches;
- +40,000 viewers in 2 minutes, or a clearly stated reduced-scale analogue;
- late join/reload;
- reconnect;
- goal/card/routine classes if they affect measurement.

If reduced scale is used, state:

1. what was reduced;
2. what property is intended to remain comparable;
3. why the analogue is informative;
4. that full production scale was **not** measured.

Simulation choices are experiment choices, not assignment facts.

---

# 12. AI implementation rules

AI may assist with research, architecture comparison, drafting, code, tests, Docker, workload generation, metrics, calculations, and consistency review.

AI must not:

- invent requirements/provider capabilities;
- alter numeric constraints;
- silently change assumption/workload/metric/acceptance criteria;
- broaden POC scope without justification;
- invent APIs/dependencies to make code compile;
- claim a benchmark ran when it did not;
- fabricate output;
- hide failed/inconclusive results;
- present extrapolation as measurement;
- add architecture the candidate cannot explain;
- make final claims the candidate has not reviewed.

When required information is missing, state the uncertainty or return `BLOCKED` rather than guessing.

---

# 13. Smallest satisfying implementation

Before adding a POC component, ask:

> Does this materially affect the selected measurement?

If no, omit it.

Potentially unnecessary elements include authentication, unrelated databases, polished frontend work, Kubernetes, Terraform, full observability stacks, CI/CD, cloud SDKs, and unrelated APIs.

Experiment-grade code is expected and acceptable.

---

# 14. Reproducible one-command execution

The POC must run locally with one command, for example:

```bash
docker compose up --build
```

The command must:

1. build what is required;
2. start the experiment;
3. generate the declared workload;
4. collect the declared measurements;
5. print a clear result;
6. make completion/failure obvious.

Rules:

- no cloud account;
- nothing beyond a container runtime;
- no hidden local files or credentials;
- clean checkout must be enough;
- pin material versions where practical;
- use fixed/configurable seeds when randomness affects comparability.

Example result shape:

```text
Experiment: <name>
Measured runs: ...
Events generated: ...
Events delivered: ...
Dropped: ...
Duplicates: ...
Out of order: ...

Latency:
p50: ...
p95: ...
p99: ...

Acceptance criterion: ...
Decision: ACCEPT | REJECT | INCONCLUSIVE
```

Print only metrics relevant to the selected assumption. Do not package generated logs/results in `poc/`.

---

# 15. Proposal ↔ POC traceability

Maintain this exact reasoning chain:

```text
assignment requirement
  -> architecture decision
  -> risky assumption
  -> local experiment
  -> measured result
  -> ACCEPT / REJECT / INCONCLUSIVE
  -> proposal confirmation or change
```

If an arrow cannot be explained, fix the reasoning before submission.

---

# 16. README and package

`README.md` must contain:

- one-command run instructions;
- the required ≤300-word write-up in the order **assumption → method → result → proposal impact**;
- material limitations;
- a short truthful explanation of how AI tools were directed.

Keep the package clean. Do not include:

- `node_modules`;
- build artifacts;
- generated logs/results;
- temporary files;
- editor metadata;
- secrets;
- cloud state;
- unrelated notes.

---

# 17. Proposal word-budget discipline

`proposal.md` is limited to 1,500 words excluding diagrams.

Use the space for decisions and reasoning, not generic technology explanations.

Prioritize:

1. end-to-end architecture;
2. consistency/state model;
3. live delivery and late join;
4. scale/latency;
5. failure/recovery/deployment;
6. cost;
7. alternatives/trade-offs;
8. the risky assumption leading to the POC.

A diagram should reduce prose, not duplicate it.

---

# 18. Final gate

Do not package until all of the following are true:

### Proposal
- [ ] Every fixed fact in §2 is addressed.
- [ ] End-to-end ingest → fan path is clear.
- [ ] Provider best-effort limitations are represented honestly.
- [ ] Ordering, deduplication, idempotency, state coherence, and snapshot→live handoff are clear.
- [ ] Reconnect, surge/backpressure, failure, deployment/rollback, geography, and cost are addressed.
- [ ] Observability and public-endpoint protection are proportionate to a production design.
- [ ] Exact current prices/limits are sourced where used.
- [ ] Important alternatives/trade-offs are visible.
- [ ] The riskiest assumption is named.
- [ ] `proposal.md` is ≤1,500 words excluding diagrams.
- [ ] Every material decision can be defended by the candidate.

### POC
- [ ] Tests one falsifiable architecture-critical assumption.
- [ ] Experiment contract was frozen before final measurement.
- [ ] Runs with one command and only a container runtime.
- [ ] Requires no cloud account.
- [ ] Produces measured evidence, not a demonstration UI.
- [ ] Measurement/proxy boundaries are explicit.
- [ ] Percentile method/population is defined.
- [ ] Results are not cherry-picked.
- [ ] Environment and host/load-generator limits are disclosed.
- [ ] Capacity headroom/saturation is reported where practical.
- [ ] No local benchmark is misrepresented as direct proof of production scale.
- [ ] Outcome follows frozen criteria.

### README / package
- [ ] Clean-checkout instructions are sufficient.
- [ ] Required POC write-up is ≤300 words.
- [ ] Write-up covers assumption → method → result → proposal impact.
- [ ] Material limitations are stated.
- [ ] AI use is described truthfully.
- [ ] Every agent instruction file actually used is included.
- [ ] No generated dependencies, artifacts, logs, secrets, or unrelated files are packaged.

---

# 19. Stop conditions

Stop AI-assisted implementation when:

1. the selected assumption has a valid measured outcome or is correctly marked inconclusive;
2. the result is reflected honestly in `proposal.md`;
3. every assignment constraint is covered;
4. `README.md` accurately describes the experiment and AI use;
5. the final gate passes;
6. further work would add scope or polish without improving validity.

---

# Core operating principle

```text
Preserve the assignment.
Make every architecture choice earn its place.
Do not invent upstream guarantees.
Freeze the experiment before final measurement.
Measure the smallest thing that can falsify the risky belief.
Measure the boundary you claim to measure.
Separate evidence from extrapolation.
Treat failed results as useful evidence.
Never change the problem to make the result look better.
Ship only what the reviewer asked for.
```
