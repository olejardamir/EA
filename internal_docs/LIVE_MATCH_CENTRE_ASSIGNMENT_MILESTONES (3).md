# Live Match Centre Take-Home — Complete Milestone Plan

**Source of truth:** `requirement.pdf` — *Take-Home Assignment: Senior Fullstack Engineer*  
**Planning inputs already completed:** `AGENTS.md` and `LIVE_MATCH_CENTRE_EQC_AC_ARCHITECTURE_CONTRACT_v0_24_2.md`  
**Purpose of this file:** turn the original assignment into an execution sequence with explicit completion gates, while preventing scope creep into building the full production system.

---

# 0. Current Position

The assignment asks for exactly two substantive deliverables:

1. a production **design proposal**; and
2. a small **proof of concept** that measures the riskiest relevant assumption.

The final submission package additionally needs the POC run/write-up instructions and any AI instruction files actually used.

The production architecture planning itself is already complete enough to begin execution. The remaining work is evidence, POC implementation/measurement, concise proposal writing, reproducibility, and packaging.

Current local artifact status:

```text
AGENTS.md                                             EXISTS
EQC-AC architecture contract                         EXISTS
POC experiment contract v2.0.0                        EXISTS (frozen)
POC experiment contract v2.0.1                        EXISTS (corrected, supersedes v2.0.0)
POC experiment contract v2.0.2                        EXISTS (corrected, supersedes v2.0.1 — resolves §B/§AA/§C)
POC experiment contract v2.0.3                        EXISTS (corrected, supersedes v2.0.2 — resolves resource-envelope/timing-text contradictions)
POC experiment contract v2.0.4                        EXISTS (historical — superseded by v2.0.5; two conflicting v2.0.4 files resolved)
POC experiment contract v2.0.5                        EXISTS (canonical active — freezes 4×25,000=100,000 exact topology, coordinated-shard lifecycle, one-publisher ownership, global barriers/histogram merge/simultaneous-global verdict, 3–8 global-run campaign, slow-client 1600–2400 ms pacing, restart exact-range proof, resolved machine provenance)
POC experiment contract v2.3.0                        EXISTS (TERMINAL M3 — frozen 4×25,000=100,000 exact topology; best validated F1 = 100k active, correctness 0, fan_out p95 2757 ms, burst p95 3707 ms; INCONCLUSIVE at 100k scale; latency gates NOT met)
poc/                                                  EXISTS (built, tested, PASS at 10k scale; evidence-100k runnable but INCONCLUSIVE at 100k)
proposal.md                                           DONE (2026-08-23, ≤1500 words, M4 partitioned architecture)
README.md                                             DONE (2026-08-23, run cmd + limitations + AI disclosure)
M4 architecture reconciliation                        DONE → internal_docs/M4_FINAL_ARCHITECTURE.md
M5 external evidence/cost                             DONE → internal_docs/M5_*.md (WITHIN $3k)
M7 source/result coherence                            DONE → internal_docs/M7_POC_SOURCE_RESULT_COHERENCE.md
final submission ZIP                                  NOT YET CREATED (out of scope of M4–M7 closure; proposal+README+internal_docs exist)
```

---

# Milestone 0 — Requirements and Architecture Planning

**Status: DONE**

## Goal

Understand the assignment and create the production architecture before writing POC code.

## Work already completed

- Extracted and preserved all scenario requirements.
- Covered the system from provider feed ingest to the fan's screen.
- Chosen the production architecture rather than leaving an undecided technology menu.
- Covered:
  - anonymous/read-only public use;
  - lobby behavior;
  - score/minute;
  - goals/cards/run of play;
  - late join/reload/phone wake;
  - no blank/manual refresh;
  - ordering/duplicate/history correctness;
  - score/clock derivation;
  - 8 live matches;
  - 10 events/s steady and 50/s burst;
  - 100,000 concurrent viewers;
  - +40,000 viewer surge in 2 minutes;
  - Europe/North America audience split;
  - 2s/5s latency requirements;
  - <=2s history join;
  - <=$3,000/month infrastructure budget;
  - weekly live deployments;
  - Next.js App Router/component architecture;
  - AWS production design.
- Compared important architecture alternatives.
- Recorded assumptions, risks, failure boundaries, state ownership, replay semantics, deployment strategy, cost sensitivity, security, observability, and validation needs.
- Identified the true least-trusted overall assumption and the riskiest locally testable assumption.

## Existing artifacts

```text
AGENTS.md
LIVE_MATCH_CENTRE_EQC_AC_ARCHITECTURE_CONTRACT_v0_24_2.md
```

## Completion gate

```text
PASS
```

No further architecture-document expansion is required merely to begin the assignment execution.


---

# Milestone 0.5 — Industry / Third-Party Solution Review

**Status: DONE**

## Goal

Check whether mature real-time sports architectures, managed fan-out platforms, recovery patterns, or reusable open-source components materially improve or invalidate the selected architecture before freezing the POC.

## Completed review

Compared:

```text
AWS AppSync Events
API Gateway WebSocket APIs
Ably
Pusher Channels
PubNub
Cloudflare Durable Objects
AWS live-sports reference architecture/code
Sportradar Push + REST recovery pattern
recent AWS sports architectures
Gorilla WebSocket
Grafana k6
```

## Result

```text
production architecture winner: CHANGED / SIMPLIFIED
selected local POC family:     NCHAN + REDIS OSS + SSE
old raw-ws POC contract:       SUPERSEDED
implementation direction:      REFINED
```

Managed per-delivery WebSocket services are technically strong but economically misaligned with the assignment's fan-out/budget combination under the current sensitivity model.

Cloudflare Durable Objects is the strongest external alternative because outgoing WebSocket messages and Workers egress are not billed in the same per-recipient way, but it loses the composed decision because it introduces a second cloud/vendor, requires hot-match sharding, departs from the assignment's AWS preference, and its real managed capacity cannot be validated by the required local-only POC.

Real sports-feed practice supports the durable-history + live-tail pattern. Sportradar explicitly documents stateless Push complemented by REST history/recovery.

For the POC, stay in the JavaScript/TypeScript ecosystem. Use Nchan 1.3.8 (built from source on a pinned Nginx base) with Redis OSS 7.2 as the shared backing store, and native browser EventSource/SSE for fan-out. If the frozen capacity test fails because of Nchan/runtime performance, evaluate scaling options before changing the fundamental architecture.

## Artifact

```text
LIVE_MATCH_CENTRE_THIRD_PARTY_RESEARCH.md
```

## Completion gate

```text
PASS
```

The research subsequently produced a material simplification: Nchan + shared Redis OSS 7.1 + native SSE replaces the custom WebSocket/snapshot/replay stack. The architecture must therefore be reconciled before implementation.

### FINAL SIMPLIFICATION STOP CONDITION

A final bounded simplification/falsification pass is complete.

```text
baseline WAF:                 REMOVED
Nchan shared store:           Redis OSS 7.1 (documented dependency)
Artillery SSE load generator: REMOVED
further safe simplification:  NONE FOUND
```

The production architecture is now considered the minimum defensible architecture until POC evidence changes it. Milestone 1 (freeze the new Nchan + Redis + SSE POC experiment contract) is now DONE. The old raw-`ws` contract was superseded; the replacement Nchan + Redis OSS + SSE experiment contract has been frozen as `LIVE_MATCH_CENTRE_POC_EXPERIMENT_CONTRACT_v2_0_0.md`.


---

# Milestone 1 — Freeze the POC Experiment Contract

**Status: DONE**

## Goal

Define exactly what the required local experiment is testing before writing its implementation.

## Architecture risk distinction

### Least-trusted overall assumption

```text
ASM-PROVIDER-SEMANTICS
```

The assignment does not provide the real third-party event schema or guarantee sufficient event identity, ordering, correction, or reconciliation semantics.

If those semantics are inadequate, strict claims such as:

```text
no duplicates
nothing out of order
score agrees with history
```

cannot be reconstructed perfectly downstream.

This is architecture-invalidating, but **cannot be tested locally from the supplied assignment** because there is no real provider feed/schema.

### Riskiest locally testable assumption

```text
ASM-GW-CAPACITY (refined for Nchan + Redis + SSE)
```

Can Nchan + Redis OSS + SSE provide the required fan-out, full-history catch-up, reconnect/resume and ordering behavior under an assignment-mapped workload?

This is therefore the correct POC target under the assignment's rule:

> if the genuine riskiest assumption cannot be tested locally, test the riskiest one that can and say so.

## Before implementation, freeze

- exact hypothesis;
- what the POC proves;
- what the POC does **not** prove;
- server implementation under test;
- client/load-generator model;
- simulated match/event model;
- steady event rate;
- burst event rate;
- hot-match concentration case;
- target connection count or scale-normalized mapping;
- +40,000 / 120-second surge mapping;
- event payload size(s);
- container CPU/memory/resource limits;
- measurement duration;
- warm-up period;
- reconnect behavior;
- metrics;
- acceptance criteria;
- `ACCEPT / REJECT / INCONCLUSIVE` decision rule.

## Required metrics

At minimum:

```text
successful connections
failed connections
connection-establishment rate
active connections
messages/events sent
events received
lost events
duplicates
out-of-order events
p50/p95/p99 fan-out latency
CPU
memory
network throughput
event-loop/runtime delay
slow-client/backpressure events
load-generator saturation indicators
```

## Critical rule

Success criteria are frozen **before the final evidence-producing run**.

The result cannot be observed first and then the threshold rewritten to make it pass.

## Output

An internal POC experiment contract/specification that directly drives `poc/`.

## Completion gate

Milestone 1 passes only when another engineer could read the experiment contract and know:

```text
what is being tested
why it is the correct local risk
how it is tested
what gets measured
what counts as pass/fail/inconclusive
```

without making new architecture decisions.

## Artifact

```text
LIVE_MATCH_CENTRE_POC_EXPERIMENT_CONTRACT_v2_0_5.md (active)
LIVE_MATCH_CENTRE_POC_EXPERIMENT_CONTRACT_v2_0_4.md (historical, superseded)
```

## Completion gate

```text
PASS
```

The experiment contract is frozen with all 32 sections covering hypothesis, versions, topology, configuration, schema, workload, metrics, and acceptance criteria. v2.0.2 resolved §B (lobby first_message), §AA (nchan_eventsource_event on match subscribers), and §C (buffer capacity prose) contradictions; v2.0.3 resolved resource-envelope/timing-text contradictions; v2.0.4 froze the phase schedule, slow-consumer thresholds, multi-shard topology, and surge attribution but produced two conflicting active documents (a stale top-level file freezing 4×28,000 and an accurate poc-internal file); v2.0.5 is the single canonical successor freezing the executable semantics: 4×25,000 = 100,000 exact global target, RUN_MODE=coordinated-shard lifecycle with ordered barriers, one publisher-owner, lossless histogram merge, simultaneous-global-run verdict, 3–8 global-run campaign, slow-client pacing of 1600–2400 ms per intended client median, restart exact-required-set proof, and resolved (non-hard-coded) machine provenance. Earlier versions are preserved as historical frozen state.

---

# Milestone 2 — Build the Smallest Runnable POC

**Status: DONE — 100% (gap closure complete per MILESTONE_2_CLOSE_GAP_REMAINING_ONLY_v5a.md; audit: poc/internal_docs/MILESTONE_2_AUDIT_GAP_REPORT.md)**

**Active contract:** `internal_docs/LIVE_MATCH_CENTRE_POC_EXPERIMENT_CONTRACT_v2_0_5.md` (frozen canonical successor; both v2.0.4 files are historical/superseded)

## Goal

Implement only the experiment necessary to test Milestone 1.

## Result

POC built, tested, and producing PASS verdicts at 10k scale (100k-scale verdict requires Milestone 3):

```text
poc/compose.yaml                     Docker Compose with host networking
poc/nchan/                           Nchan 1.3.8 built from source (Ubuntu 24.04 + Nginx 1.27.4)
poc/runner/                          Node 22 + TypeScript (eventsource + metrics)
```

## Test Results (10,000 connections, 4 workers)

```text
Connections:          10,000 attempted, 10,000 established, 0 failures
Events published:     443
Events received:      361,419 (fan-out working)
Missing sequences:    0
Duplicates:           0
Out of order:         0
Fan-out latency:      p50=28ms, p95=57ms, p99=81ms, max=177ms
Late-join latency:    p50=2ms, p95=2ms, p99=2ms, max=2ms
Reconnect:            gaps=0, duplicates=0, order violations=0
Event loop p99:       35.9ms
Memory peak:          561MB

VERDICT: PASS at 10k scale (scenario verdicts pass; 100k-scale verdict requires Milestone 3)
```

## Completion gate

```text
PASS
```

One command starts the experiment, it terminates with a measured summary, and no external cloud dependency exists.

---

# Milestone 3 — Run the Frozen POC and Produce Evidence

**Status: IN PROGRESS — acceptance recovery executing (q5 INCONCLUSIVE preserved below)**

> **Recovery note (2026-08-21).** The first qualifying campaign
> (`m3-c89159e88822-q5`, contract v2.0.5) ended INCONCLUSIVE and is preserved
> unchanged at `internal_docs/m3_evidence/m3-c89159e88822-q5/`. Milestone-4
> reconciliation chose Terminal A: the single-primary fan-out assumption is
> withdrawn. Acting on that decision, Milestone 3 reopens **under the same
> milestone name** (no "M3b") to repair the POC into a horizontally partitioned
> Nchan fan-out topology (4 partition nodes + spare replacement node, shared
> Redis canonical store), freeze contract v2.1.0, and produce a fresh repeated
> 100,000-viewer qualifying campaign (seeds 42/43/44) targeting machine verdict
> ACCEPT. Governing instruction artifact:
> `internal_docs/MILESTONE_3_ACCEPTANCE_RECOVERY_PROMPT_ARTIFACT.md`.
> The historical q5 record below is retained verbatim.

Qualifying source SHA: `c89159e8882206de9fffa2b170a38d76854288ce`
Contract: v2.0.5
Global runs: 3
Seeds: 42,43,44
Campaign verdict: INCONCLUSIVE
Evidence manifest: `internal_docs/m3_evidence/m3-c89159e88822-q5/MILESTONE_3_EVIDENCE_MANIFEST.md`

Summary of the measured outcome (full detail in the manifest): run 0 aborted before any
shard result was collected; runs 1–2 completed all coordinated phases but were ruled
invalid because all four generator shards saturated (CPU/event-loop) — the environment,
not a frozen DUT criterion, prevented a defensible conclusion. Additional machine-recorded
facts: global active peak 65,015–66,251 of the 100,000 target; surge established only
~30–41% of attempted connections while nchan exhausted its frozen worker_connections
limit; cross-run dispersion 173% against the frozen 15% bound. Per plan §20/§32 this is
a valid INCONCLUSIVE: no manual override to ACCEPT or REJECT, no reruns appended, result
preserved outside `poc/` and handed to M4.

## Goal

Run the experiment exactly as frozen and obtain a defensible measured result.

## Execution sequence

1. Confirm containers/resources match the frozen experiment contract.
2. Confirm load-generator health.
3. Run warm-up.
4. Run the measured workload.
5. Run the hot-match/worst-concentration case.
6. Run the connection-surge case.
7. Capture the predefined metrics.
8. Repeat enough runs to detect obvious instability rather than relying on one lucky run.
9. Preserve the final measured summary used in the README/proposal reasoning.

## Result classification

### `ACCEPT`

The measured local evidence supports continuing with the Nchan + Redis OSS fan-out architecture under the stated mapping/assumptions.

### `REJECT`

The result contradicts a critical assumption strongly enough that the selected gateway architecture must be revisited.

### `INCONCLUSIVE`

The experiment itself prevents a valid conclusion, for example:

```text
load generator saturated first
host resource ceiling prevented intended test
measurement was broken
results were unstable outside the frozen interpretation
```

`INCONCLUSIVE` is not converted to `ACCEPT`.

## Output

A frozen result set containing the numbers needed for the submission write-up.

## Completion gate

The result can be reproduced and classified without changing the acceptance criteria after the run.

---

# Milestone 4 — Reconcile the POC Result with the Architecture

**Status: DONE (2026-08-23)**

**Terminal M3 truth:** hard-stopped without ACCEPT at frozen `EXPERIMENT_CONTRACT_v2_3_0.md`; best validated F1 = 100k active, correctness 0, fan_out p95 2757 ms, burst p95 3707 ms. Fixed 4-partition topology latency gates missed; config-only tuning exhausted; terminal three-run campaign not run.

## Goal

Make the design proposal and measured evidence agree.

## If result = ACCEPT

- retain the Nchan + Redis + SSE fan-out decision;
- record what was actually measured;
- avoid claiming the POC proved the full production system;
- use it as evidence supporting the relevant architecture assumption.

## If result = REJECT

- reopen the affected architecture decision;
- compare the viable alternatives again;
- revise the architecture;
- revise cost implications;
- define a new experiment if the changed architecture creates another critical locally testable uncertainty;
- repeat Milestones 1–4 as required.

## If result = INCONCLUSIVE

- determine why;
- fix the experimental limitation;
- freeze the corrected test;
- rerun;
- do not proceed as though the architecture passed.

## Completion gate

The architecture and POC result no longer contradict one another.

This is the final point at which the fundamental production design should change before writing the concise final proposal.

---

# Milestone 5 — External Evidence Closure and Current Pricing

**Status: DONE (2026-08-23)**

## Goal

Attach current (2026) official AWS pricing/quotas and external facts to every selected M4 component; build a complete parametric cost model; state geography decision and provider-supply uncertainty honestly.

## Done

- `M5_CURRENT_EXTERNAL_EVIDENCE_LEDGER.md` — current-source facts, quotas, pricing (URL+date), decision provenance §K, truthful classification table.
- `M5_PARAMETRIC_COST_MODEL.md` — viewer-delivery math, payload assumption, DTO sensitivity, fleet sizing, full ledger, budget conclusion, latency budget, hidden infra, margin.
- `M5_FINAL_PROPOSAL_EVIDENCE_CLOSURE.md` — final evidence closure certification.
- Conclusion: selected M4 architecture is WITHIN $3k/month budget (≈$2,318 base, ~23% margin); CONDITIONALLY WITHIN BUDGET beyond ~440 peak-hours/month.

## Completion gate

Every selected component has current-source backing, a cost line, a geographic/provider boundary, and a defendable decision record; no number lacks provenance.

---

# Milestone 6 — Concise Final Proposal

**Status: DONE (2026-08-23)**

## Goal

Write `proposal.md` (final architecture only, ≤1500 prose words, full assignment coverage) and `README.md` (run command + ≤300-word writeup + limitations + AI disclosure).

## Done

- `proposal.md` — 100-vs-100k crowd invariance, provider-ingress assumption explicit, schema/accepted-event failure handling, honest 2s/5s budget, production SLO observability, coverage of all assignment questions.
- `README.md` — run command (`poc/run-arch-revision-probe.sh`), ≤300-word writeup, explicit limitations, AI disclosure.

## Completion gate

Proposal/README are internally consistent with M4–M5 and do not overclaim POC or unvalidated topology.

---

# Milestone 7 — POC/Source Result Coherence

**Status: DONE (2026-08-23)**

## Goal

Record honest M3→production coherence; ensure no value is promoted to a stronger evidence level than measured.

## Done

- `M7_POC_SOURCE_RESULT_COHERENCE.md` — evidence-level classification (ASSIGNMENT_FACT / POC_OBSERVATION / CALCULATION / PLANNING_ASSUMPTION / CURRENT_OFFICIAL_FACT / PRODUCTION_INFERENCE / UNRESOLVED_EXTERNAL_ASSUMPTION), explicit "never validated by M3" topology labeling, provider-supply and NA-RTT honesty, coverage matrix.

## Completion gate

Every claim carries an explicit evidence level; the never-validated partitioned topology is clearly labeled and pre-launch validation is required.

---

# Final Closure Status

- All five milestones (M3 terminal at v2.3.0/F1 INCONCLUSIVE; M4 architecture reconciliation; M5 external evidence/cost; M6 proposal/README; M7 coherence) are CLOSED.
- No fundamental design change remains before submission.
- Generated purely from the v10 closure prompt (SHA `e3e31916164ab700bc76beca9712fa428f269709ba76a13c923ceb2ef30bf597`), per `internal_docs/AI_INSTRUCTION_PROVENANCE.md`.

---

# Milestone 5 — Close the Proposal Evidence and Cost Model

**Status: DONE (2026-08-23)**

## Goal

Gather enough current, explainable evidence to make the production proposal defensible without pretending the assignment requires an actual production deployment.

## Required work

### 5.1 Current AWS capability verification

Recheck official/current sources for architecture-critical claims that may change, including the services actually named in the final proposal.

Examples:

```text
CloudFront WebSocket behavior
ALB WebSocket/connection behavior
SQS FIFO ordering semantics
DynamoDB consistency/transaction behavior
S3 behavior used by snapshots
relevant service limits/quotas used in calculations
```

### 5.2 Final cost calculation

Calculate the proposed production architecture using current prices and the workload assumptions we are prepared to defend.

The cost ledger must include every selected resource that materially contributes, including support-network resources if they exist.

The result must:

```text
state the currency
state the workload assumptions
state peak viewer-hour interpretation
state payload/event assumptions
state current rate source/date
avoid omitted infrastructure
show whether <=$3,000/month is met
```

If the PDF leaves a workload variable unknown, state the assumption and sensitivity rather than inventing an assignment fact.

### 5.3 POC-to-production mapping

Explain what the local POC result can and cannot say about production:

```text
measured locally
inferred for production
still dependent on AWS/service limits
still dependent on provider schema
```

### 5.4 Geographic reasoning

Explain the ~60% Europe / ~40% North America decision and its trade-off.

The assignment does **not** require us to deploy production infrastructure just to run geographic tests. Any unmeasured geographic claim remains a design inference rather than fabricated evidence.

### 5.5 Provider semantics honesty

Keep the real provider schema issue explicit:

```text
overall weakest architecture assumption
cannot be locally tested because real feed/schema was not supplied
would require validation before real production launch
```

## Important scope boundary

Milestone 5 does **not** mean deploying the full architecture to AWS.

The assignment expressly says:

```text
no cloud deployment
no real infrastructure spend
POC is the only expected code
```

## Completion gate

Every material number and architecture decision that appears in the final proposal has one of these labels conceptually clear:

```text
assignment fact
current authoritative source fact
calculation
planning assumption
POC measurement
production inference
unresolved external assumption
```

---

# Milestone 6 — Write Final `proposal.md`

**Status: DONE (2026-08-23)**

## Goal

Compress the complete architecture and evidence into the actual Design Proposal required by the assignment.

## Hard format requirement

```text
proposal.md
maximum 1,500 words
diagrams excluded from word count
Markdown
```

## Required content

The proposal must let the reviewer understand the whole production system from:

```text
third-party feed
    ->
ingest/durability/order/state
    ->
snapshot/replay/live fan-out
    ->
Next.js browser
    ->
visible fan experience
```

It should cover enough to make the case for:

- correctness;
- live latency;
- late join/reload/wake;
- scale;
- connection surge;
- geographic distribution;
- cost;
- deployment continuity;
- failure/recovery;
- frontend architecture;
- why the selected architecture is preferable to major alternatives.

## Decisions and trade-offs

Include only the decisions important enough to help the reviewer understand why the system looks this way.

The architecture contract is the source; the final proposal is not a 29,000-word architecture dump.

## POC relationship

The proposal must explicitly state:

1. the assumption in the design trusted least;
2. why the genuine overall weakest assumption cannot be tested locally if applicable;
3. the riskiest locally testable assumption actually selected;
4. what the POC measured;
5. whether the result supported or changed the architecture.

## Diagram

Include at least one concise end-to-end diagram if it improves clarity. ASCII or Mermaid is allowed by the assignment.

## Completion gate

Before approval:

```text
word count <= 1,500 excluding diagrams
all hard assignment constraints addressed
architecture is one coherent selected design
important alternatives/trade-offs visible
POC result reflected accurately
no unsupported performance/cost certainty
no conflict with README or POC
```

---

# Milestone 7 — Write Final `README.md`

**Status: DONE (2026-08-23)**

## Goal

Create the single README required by the delivery instructions.

## Part A — How to run the POC

The instructions must be sufficient for a reviewer with only a container runtime.

Example form:

```text
docker compose up --build
```

Use the actual final command.

State:
- what starts;
- expected runtime;
- where/when the measured summary appears;
- how to interpret the result if necessary.

## Part B — POC write-up

Maximum:

```text
<=300 words
```

Must cover exactly:

```text
assumption
    ->
method
    ->
result
    ->
what it changes in the proposal
```

Use actual measured values.

## Part C — AI tools process

Add a few sentences explaining how AI was directed.

This should be factual, for example that the AI was instructed to:

- preserve assignment requirements;
- separate assumptions from evidence;
- avoid changing experiment criteria after measurement;
- use the smallest POC;
- validate calculations/sources;
- keep the final candidate responsible for decisions.

`AGENTS.md` is included because it was actually used.

## Completion gate

```text
run instructions tested
POC summary <=300 words
measured values match final POC output
proposal impact matches proposal.md
AI process section present
```

---

# Milestone 8 — Explainability and Reproducibility Audit

**Status: NOT STARTED**

## Goal

Meet the assignment's requirement that every number and every decision is something the candidate can stand behind and explain.

## 8.1 Clean-room POC test

Test from a clean local state:

- no existing containers required;
- no installed project dependencies;
- no hidden local services;
- no credentials;
- no cloud account;
- only the documented container runtime;
- execute the documented one command.

## 8.2 Number audit

For every number in `proposal.md` and `README.md`, know whether it is:

```text
given by assignment
measured
calculated
assumed
quoted from current official documentation/pricing
```

Remove unexplained precision.

## 8.3 Decision audit

Be able to explain:

```text
Why Nchan + SSE instead of custom WebSocket server?
Why not managed fan-out (AppSync, Ably, etc.)?
Why this persistence/order model?
Why Nchan buffer instead of S3 snapshots for late join?
Why this region strategy?
Why this POC?
Why this cost model?
What happens if provider semantics are insufficient?
What happens if the POC fails?
```

## 8.4 Consistency audit

Check for contradictions among:

```text
proposal.md
README.md
POC output
AGENTS.md
architecture working document
```

Only `proposal.md`, `README.md`, POC code, and actual agent instruction files are final deliverables, but the internal documents should still agree with them.

## Completion gate

A reviewer can run the POC and the candidate can explain every submitted claim without relying on hidden chat history.

---

# Milestone 9 — Clean the POC Directory for Submission

**Status: NOT STARTED**

## Goal

Ensure the `poc/` directory contains only source/configuration needed to reproduce the experiment.

## Remove generated material

Do not ship:

```text
node_modules/
build/
dist/
generated logs
temporary benchmark output
cache files
IDE metadata
OS junk
credentials
cloud state
```

If a small static result file is genuinely part of the reproducible POC design, confirm that it does not violate the assignment's explicit "nothing generated" requirement. Prefer generating measurements during the reviewer's run and reporting the submission result in `README.md`.

## Completion gate

The POC directory is small, understandable, reproducible, and contains no generated/development debris.

---

# Milestone 10 — Build and Audit the Final ZIP

**Status: NOT STARTED**

## Goal

Produce exactly the package the assignment asks for.

## Final ZIP contents

```text
proposal.md
README.md
poc/
AGENTS.md
```

Include another agent instruction file only if it was genuinely used.

## Do not include

```text
requirement.pdf
EQC-AC standards
the 29k-word internal architecture contract
research notes
pricing scratch files
temporary experiment contracts
generated POC output
chat exports
unrequested documentation
```

unless the assignment is explicitly changed.

## Final package checks

- `proposal.md` <=1,500 words excluding diagrams.
- `README.md` POC write-up <=300 words.
- POC runs using the README command.
- Only container runtime required.
- No cloud account required.
- POC produces a measured result.
- POC simulates its feed.
- No full-system implementation accidentally included.
- No generated POC artifacts.
- AI process disclosed.
- Agent instruction files actually used are present.
- Every submitted number/decision is defensible.
- ZIP contains **only** allowed files.

## Completion gate

Open the ZIP as though you are the reviewer, follow `README.md`, run the experiment, read `proposal.md`, and confirm nothing outside the ZIP is needed.

---

# Assignment Coverage Audit

The milestone sequence above was checked directly against the original assignment.

| Assignment obligation | Covered by |
|---|---|
| Design an application for production | M0, M6 |
| Design Proposal in Markdown | M6 |
| `proposal.md` <=1,500 words excluding diagrams | M6, M10 |
| Full stack from feed ingest to fan screen | M0, M6 |
| Show whole system and reasoning | M0, M6 |
| Explain decisions, options weighed, why winners won | M0, M6 |
| Name assumption trusted least | M1, M6 |
| Identify architecture-invalidating risk | M1 |
| If true highest risk cannot be local, say so and test riskiest local one | M1, M6, M7 |
| Small POC rather than full system | M1, M2 |
| POC runs locally | M2, M8 |
| POC runs with one command | M2, M7, M8 |
| Nothing installed beyond container runtime | M2, M8 |
| No cloud account | M2, M8 |
| Measured result, not demo UI | M2, M3 |
| Rough experiment-grade code acceptable | M2 |
| Simulate event stream | M2 |
| POC choice follows own design risk | M1 |
| <=300-word POC write-up | M7, M10 |
| Write-up covers assumption -> method -> result -> proposal impact | M7 |
| Do not build full system | M2, M10 |
| No cloud deployment | M2, M5 |
| No real infrastructure spend | M2, M5 |
| Clarity over formatting | M6, M7 |
| AI tools may be used | all milestones as needed |
| Include actual AI instruction files used | M7, M10 |
| Explain how AI tools were directed | M7 |
| Candidate must stand behind every number/decision | M5, M8 |
| Final ZIP contains `proposal.md` | M10 |
| Final ZIP contains `poc/` with nothing generated | M9, M10 |
| Final ZIP contains `README.md` | M7, M10 |
| Final ZIP contains actual agent instruction files used | M10 |
| Final ZIP contains only requested items | M10 |

---

# Scenario Requirement Coverage Audit

The final proposal must make the case that the production design meets all of these. They do **not** each require a separate POC.

| Scenario requirement | Planning / execution milestone |
|---|---|
| Anonymous/read-only/public/no accounts | M0 -> M6 |
| Lobby contains all live matches | M0 -> M6 |
| Lobby score/minute | M0 -> M6 |
| Goals/cards live without refresh | M0 -> M6 |
| Late join | M0 -> M6 |
| Reload recovery | M0 -> M6 |
| Phone wake recovery | M0 -> M6 |
| Everything-so-far then live stream | M0 -> M6 |
| Never blank/manual refresh | M0 -> M6 |
| Score agrees with visible history | M0 -> M6 |
| No duplicates | M0 -> M6 |
| Nothing disappears | M0 -> M6 |
| No out-of-order display | M0 -> M6 |
| Goal p95 <=2s ingest->screen | M0 -> M5/M6; production validation remains an honest inference unless separately measured |
| Other p95 <=5s | M0 -> M5/M6 |
| Full history <=2s | M0 -> M5/M6; POC measured 2ms (local) |
| 8 live matches | M0 -> M2/M6 |
| ~10 events/s, burst ~50/s | M0 -> M2/M6 |
| Best-effort/no long retry | M0 -> M6 |
| 100,000 concurrent viewers | M0 -> M2/M6; POC tested 10k, scaling inference for 100k |
| +40,000 viewers/2 min | M0 -> M2/M6 |
| ~60% Europe/~40% North America | M0 -> M5/M6 |
| <=$3,000/month | M0 -> M5/M6 |
| Weekly live deploy, viewers do not notice | M0 -> M6 |
| Next.js App Router | M0 -> M6 |
| Component-based frontend | M0 -> M6 |
| AWS preferred / alternative justified | M0 -> M5/M6 |
| Score and clock derived from event stream | M0 -> M6 |

---

# Work That Is Explicitly NOT a Milestone

To avoid scope creep, the following are **not** required before submission:

```text
building the full Live Match Centre
deploying the production architecture
opening an AWS account for the POC
spending money on production infrastructure
implementing every architecture component
performing every production validation listed in the internal EQC-AC contract
connecting to a real third-party feed
```

The internal architecture contract contains a production-readiness validation backlog because it describes a real production design. The take-home assignment, however, asks for **one small measured POC** and a defensible proposal, not proof that every production component has been deployed.

Any unexecuted production validation should be described with appropriate uncertainty rather than turned into unnecessary take-home implementation work.

---

# Final Milestone Sequence

```text
M0  Requirements + architecture planning                DONE
     |
M0.5 Industry / third-party solution review             DONE
     |
M1  Freeze POC contract for Nchan + Redis + SSE        DONE
     |
M2  Build smallest runnable POC                         DONE — 100% (gap closure per v5a)
     |
M3  Run POC and produce measured result                 DONE — 100% (hard-stopped without ACCEPT at frozen v2.3.0; F1 = 100k active, correctness 0, fan_out 2757ms, burst 3707ms; terminal three-run campaign not run)
     |
M4  Reconcile result with architecture                  DONE — 100% (fixed 4-partition capacity assumption withdrawn; horizontally partitioned production architecture selected — see M4_FINAL_ARCHITECTURE.md)
     |     \
     |      -> if rejected/inconclusive, loop to M1   (loop executed: INCONCLUSIVE -> architecture revised, not rerun)
     |
M5  Close current evidence + final cost model           DONE — 100% (M5_PARAMETRIC_COST_MODEL.md, M5_CURRENT_EXTERNAL_EVIDENCE_LEDGER.md, M5_FINAL_PROPOSAL_EVIDENCE_CLOSURE.md; conclusion CONDITIONALLY WITHIN BUDGET)
     |
M6  Write proposal.md <=1,500 words                    DONE — 100% (repo-root proposal.md; 1,016 prose words, diagram excluded)
     |
M7  Write README.md + <=300-word POC report + AI process DONE — 100% (repo-root README.md; POC write-up 196 words; M7_POC_SOURCE_RESULT_COHERENCE.md)
     |
M8  Explainability + clean-room reproducibility audit   NEXT — NOT STARTED
     |
M9  Clean poc/ for delivery
     |
M10 Build and audit final ZIP
```

---

# Completeness Verdict

**YES — this milestone plan covers all work explicitly required by the original assignment.**

The earlier milestone list was fundamentally correct, but this audit makes three important refinements:

1. **Production validation backlog is not the same thing as take-home milestones.**  
   We must not turn the assignment into a full cloud implementation.

2. **Explainability deserves its own completion gate.**  
   The assignment explicitly says every number and decision must be something the candidate can stand behind and explain.

3. **Final delivery cleanup deserves separate milestones.**  
   The PDF is strict that `poc/` contains nothing generated and that the ZIP contains only the requested artifacts.

Because the architecture changed after the original freeze, the Nchan + Redis OSS + SSE POC experiment contract has been frozen as `LIVE_MATCH_CENTRE_POC_EXPERIMENT_CONTRACT_v2_0_0.md`, corrected to v2.0.1, further corrected to v2.0.2 (resolving §B/§AA/§C contradictions verified against Nchan 1.3.8 docs), corrected again to v2.0.3 (resolving resource-envelope and timing-text contradictions), and corrected to v2.0.4 (freezing phase schedule, slow-consumer thresholds, multi-shard topology, and surge attribution). M2 (Build the Smallest Runnable POC) is DONE — 100% — remaining-gap closure per MILESTONE_2_CLOSE_GAP_REMAINING_ONLY_v5a.md is complete (canonical v2.0.5 contract, restart exact-range proof, resolved machine provenance, reconciled traceability). The correct next task after full gap closure is **Milestone 3: Run the POC and produce measured result** — repeat runs, scale to higher connection counts, and capture frozen evidence for the proposal.
