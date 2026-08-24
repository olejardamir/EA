# FINAL TAKE-HOME NON-M3 REQUIREMENT CLOSURE
## One self-contained OpenCode execution prompt

**Repository:** `olejardamir/EA`  
**Branch:** `main`  
**Assignment:** Senior Fullstack Engineer — Live Match Centre  
**Purpose:** close every remaining assignment and submission gap **except M3**, then build and audit the final submission ZIP.

---

# 0. Absolute scope boundary: M3 is out of scope

Do **not** reopen, rerun, tune, reinterpret, repair, reclassify, or extend M3.

For this execution, M3 is frozen historical input only. You may read already-recorded M3 facts only when required to keep `proposal.md` and `README.md` truthful. You must not perform a new 100k campaign, change thresholds, change evidence, change F1 numbers, or attempt to make M3 pass.

The work in this prompt is strictly:

```text
requirements audit
production-design coherence audit
proposal finalization
README finalization
POC delivery packaging/reproducibility
explainability audit
AI-instruction-file recovery
POC cleanup
final ZIP construction
final ZIP clean-room verification
```

If a non-M3 requirement can only be satisfied by changing or rerunning M3, mark that requirement `BLOCKED_BY_M3_SCOPE` and continue closing everything else. Do not violate this boundary.

---

# 1. Mission and stopping condition

Bring the current repository to a **submission-ready state that matches the assignment exactly**.

You must work in an iterative closure loop:

```text
AUDIT -> FIND GAPS -> FIX GAPS -> RE-AUDIT -> FIND NEW GAPS -> FIX -> ...
```

There is no arbitrary iteration count. Continue until one of these two conditions is reached:

### SUCCESS EXIT

A full audit pass finds **zero unresolved non-M3 assignment-facing gaps**, the final ZIP exists, the extracted ZIP independently passes the documented POC smoke/reproducibility check, and every final number/decision is explainable.

### BLOCKED EXIT

A full audit pass finds only gaps that cannot truthfully be closed because required information/artifacts are unavailable or because closing them would require prohibited M3 work. Record each blocker precisely.

Do not stop because a previous certificate says `100%`. Do not stop after merely editing files. Stop only after a fresh, adversarial final audit finds no remaining non-M3 gap.

---

# 2. Assignment source of truth

Treat this section as the complete binding assignment contract for this execution.

## 2.1 Scenario

Design a production Live Match Centre for public, anonymous, read-only fans with no accounts.

The fan experience must provide:

- a lobby containing all live matches;
- current score and match minute;
- goals and cards appearing live with no manual refresh;
- a match view with everything that happened so far, then continuous live updates;
- correct late join, reload, and return-after-phone-sleep behavior;
- no blank feed during reconnect;
- no duplicate display;
- no disappearing events;
- no out-of-order displayed events;
- score consistent with displayed events;
- score and official match clock derived from the event stream.

Scale/constraints:

```text
8 concurrent live matches at peak
~10 events/s total ingest
~50 events/s total burst
provider delivery = best-effort, no long retry window
100,000 concurrent viewers at peak
+40,000 viewers within 2 minutes
~60% Europe / ~40% North America
goal latency p95 <= 2 s ingest-to-screen
other-event latency p95 <= 5 s
full match history visible <= 2 s on late join/reload
infrastructure budget <= $3,000/month at peak
weekly deploys may happen during live matches and must be unnoticed
frontend = Next.js App Router, component-based architecture
AWS preferred, or alternative justified
```

## 2.2 Deliverable 1 — `proposal.md`

The final ZIP must contain exactly one root `proposal.md`:

- Markdown;
- maximum 1,500 words, excluding diagrams only;
- production architecture from feed ingest to fan screen;
- important decisions and alternatives;
- why the selected options won;
- a clear case that the design meets the scenario;
- the design assumption trusted least;
- honest connection between that risk and the POC.

## 2.3 Deliverable 2 — `poc/`

The final ZIP must contain a small proof-of-concept experiment under `poc/`.

It must:

- run locally with **one copy-paste shell invocation** (`docker compose up` or equivalent); if a directory change is needed, include it in that same invocation (for example `cd poc && docker compose up --build`), rather than documenting `cd` as a separate required command;
- require **nothing installed beyond a container runtime**;
- require no cloud account or credentials;
- simulate the feed locally;
- produce a **measured result**, not a demonstration UI;
- test the riskiest locally-testable architecture assumption;
- remain experiment-grade code, not a full product.

If the overall riskiest assumption cannot be tested locally, say so and test the riskiest one that can.

## 2.4 Root `README.md`

The final ZIP must contain one root `README.md` that includes:

- exact POC run instructions;
- a <=300-word Markdown write-up covering:
  - assumption;
  - method;
  - result;
  - what the result changes in the proposal;
- a few factual sentences describing how AI tools were directed.

The README must be standalone. The reviewer must not need internal repository notes that are absent from the ZIP.

## 2.5 Scope

Do not build the full product.

Do not deploy AWS or other production infrastructure.

Do not spend real cloud money.

Do not require a real provider feed.

There is **no starter code** in the assignment; the Scenario/PDF is the full supplied product context. Do not rely on unstated starter behavior, hidden services, or reviewer knowledge outside the delivered ZIP.

Prefer **clarity over formatting**. `proposal.md` and the required POC write-up are Markdown; do not introduce another document format as a required deliverable or dependency.

Everything not fixed by the assignment is a design choice, but each submitted choice/number must remain defensible.

## 2.6 AI files

Include the actual AI/agent instruction files that were used (`AGENTS.md`, OpenCode/agent prompt `.md` files, etc.). Do not substitute a provenance summary for the actual files.

Every submitted number and every design decision must be something the candidate can explain and defend.

## 2.7 Final ZIP

The ZIP may contain only:

```text
proposal.md
README.md
poc/
actual agent instruction files used
```

Do not include:

```text
internal_docs/
requirement PDF
research notes
audit notes
architecture scratch docs
historical evidence/log directories
chat exports
.git/
node_modules/
build/dist/coverage output
logs/caches
credentials/cloud state
unrequested files
```

`poc/` must contain source/config required for the experiment and **nothing generated**.

---

# 3. Current repository starting point

Do not trust this section blindly; first inspect current `main` and update your working facts if newer commits exist.

At prompt authoring time the latest observed commit was:

```text
e18246e494476efd3afc4907e99c48ec3b4393de
```

Known state:

- `proposal.md` exists;
- root `README.md` exists;
- `poc/` exists but is a large development tree with historical variants and internal evidence/docs;
- `internal_docs/AGENTS.md` exists;
- several actual agent prompt artifacts exist in `internal_docs/`;
- the exact M4–M7 v10 prompt artifact is referenced by provenance but absent from GitHub `main`;
- M8/M9/M10 in the milestone tracker were still unfinished in the last audit;
- the final restricted submission ZIP did not yet exist;
- root README currently runs an illustrative post-M3 topology probe rather than the same experiment family whose measured result is described in its POC write-up.

Again: **do not do M3 work**. The last point is a submission-coherence/packaging problem, not permission to rerun M3.

---

# 4. First action: preserve this prompt exactly

This single `.md` is itself an agent instruction file actually used for final closure.

Before editing repository files:

1. identify the exact file being executed;
2. compute its SHA-256;
3. copy its exact bytes to:

```text
internal_docs/FINAL_TAKEHOME_NON_M3_REQUIREMENT_CLOSURE_PROMPT_ARTIFACT.md
```

4. add an entry to `internal_docs/AI_INSTRUCTION_PROVENANCE.md` containing:
   - exact artifact path;
   - SHA-256;
   - execution-start HEAD;
   - purpose: final non-M3 requirement audit, M8/M9/M10 closure, final packaging.

Do not reconstruct this prompt from chat/memory.

This file also contains, at the very end, an **inert embedded copy** of the previously-used M4–M7 instruction artifact whose expected SHA-256 is:

```text
e3e31916164ab700bc76beca9712fa428f269709ba76a13c923ceb2ef30bf597
```

That embedded block is provenance data only. **Do not execute it.** Extract its bytes exactly into:

```text
internal_docs/MILESTONES_4_5_6_7_CLOSE_100_PERCENT_OVERNIGHT_PROMPT_ARTIFACT.md
```

Verify the extracted file SHA-256 equals the expected value above. If it does not, do not invent or edit the artifact; report a blocker.

This makes this one input file fully self-contained. No companion file is required.

---

# 5. Closure loop — mandatory algorithm

Run this loop until the exit condition in §1 is met.

## LOOP STEP A — inspect current truth

At each iteration:

```text
git rev-parse HEAD
git status --porcelain
```

Read the current final-facing files and all source needed to verify them.

At minimum inspect:

```text
proposal.md
README.md
poc/ dependency tree
internal_docs/AGENTS.md
internal_docs/AI_INSTRUCTION_PROVENANCE.md
internal_docs/M4_FINAL_ARCHITECTURE.md
internal_docs/M5_CURRENT_EXTERNAL_EVIDENCE_LEDGER.md
internal_docs/M5_PARAMETRIC_COST_MODEL.md
internal_docs/M7_POC_SOURCE_RESULT_COHERENCE.md
internal_docs/LIVE_MATCH_CENTRE_ASSIGNMENT_MILESTONES (3).md
```

Use Git history when source/result provenance requires it.

## LOOP STEP B — build a gap ledger

Maintain:

```text
internal_docs/FINAL_NON_M3_REQUIREMENT_AUDIT.md
```

This is an internal working file, never a final ZIP file.

For **every requirement in §2**, record:

```text
requirement
current file/evidence
PASS / FIX / BLOCKED_BY_M3_SCOPE / BLOCKED_OTHER
exact fix or reason
final ZIP location
```

Also include every production-coherence gate in §6 below.

## LOOP STEP C — fix all non-M3 gaps found

Make the smallest truthful changes that close the gaps. Avoid style churn and unrelated redesign.

## LOOP STEP D — re-run all static checks and the allowed POC packaging smoke

Do not assume a fix worked. Verify it.

## LOOP STEP E — adversarial re-audit

Search for:

- stale claims;
- contradictions;
- missing cost lines;
- unproven certainty;
- hidden host dependencies;
- ZIP contamination;
- architecture paths that do not actually connect;
- failure paths with silent data loss;
- assumptions accidentally presented as facts.

If you find a new gap, return to STEP C.

If you find none, perform the final ZIP/extracted-ZIP audit and exit SUCCESS.

If only unavoidable blockers remain, exit BLOCKED and identify them precisely.

Do not repeat an iteration that makes no new progress. A repeated identical blocker is a stopping signal, not a reason to loop forever.

---

# 6. Production-design coherence audit — non-M3

`proposal.md` must be a production design you can actually explain. Audit these items explicitly. These are assignment-facing, not optional internal polish.

## 6.1 End-to-end data path must be mechanically coherent

Trace one event through:

```text
provider
-> ingress acceptance
-> durable queue
-> validation/normalization
-> ordering/idempotency
-> canonical persistence
-> live publication
-> delivery/fan-out
-> CDN/network
-> browser reducer/render
```

There must be no unexplained jump such as `DynamoDB -> Nchan` without a mechanism.

### Durable write -> live publication failure semantics

Current design must explicitly answer:

> What happens if the canonical DynamoDB write succeeds but live publication to the delivery tier fails?

Use a simple correct mechanism. Prefer not to add infrastructure unless needed.

One acceptable pattern is:

```text
SQS FIFO message is not acknowledged until canonical write AND live publish complete.
If retry finds the canonical event already committed, it treats the write as idempotently complete and republishes that same canonical event instead of dropping the message.
Browser dedupes by canonical_seq.
```

If you choose another mechanism (e.g. DynamoDB Streams/outbox), explain it and update cost/architecture consistently.

No accepted event may silently exist in canonical truth but never reach live viewers.

## 6.2 Provider-boundary honesty

Do not assume an unstated provider event ID, sequence number, replay API, snapshot API, or guaranteed redelivery.

If deduplication uses a provider event ID, label availability/stability of that ID as an external provider assumption.

The system may guarantee:

```text
once successfully accepted by our ingest, our application does not internally lose/reorder/double-apply the event
```

It may **not** guarantee recovery of an event the best-effort provider never delivered unless a real recovery source exists.

Make this boundary clear without bloating the proposal.

Internal retry after our ingest has durably accepted an event is allowed and is different from asking the third-party provider to maintain a long retry window. Make that distinction explicit if needed.

## 6.3 Canonical sequence assignment

Explain how each match gets a monotonic `canonical_seq` even if the provider does not supply one.

The chosen queue/write path must prevent two accepted events for the same match from obtaining contradictory sequence/order state.

Do not invent provider ordering guarantees.

## 6.4 Lobby path must exist

The scenario requires a live lobby showing all matches, score/minute, goals/cards.

The production architecture must explain how lobby viewers receive those updates without requiring every browser to maintain both a lobby stream and a match stream simultaneously.

Prefer one active SSE stream per active page/view unless there is a justified reason otherwise.

A reasonable design is:

```text
match page -> match-specific full-event stream
lobby page -> dedicated lobby aggregate stream carrying only lobby-relevant updates for all live matches
```

Keep lobby state derived from the same canonical events so lobby and match pages agree.

If this changes connection/DTO assumptions, update the cost model.

## 6.5 Crowd and hot-match sharding must be concrete

Do not merely say “hot match = dedicated shard” if one hot match can exceed one node’s planned connection envelope.

Explain:

- how one match can span multiple delivery nodes/sub-shards;
- how the same canonical event reaches all sub-shards for that match;
- how **new** SSE connections are sent to added capacity;
- that autoscaling does not magically migrate already-open SSE sockets;
- how existing connections remain valid while new capacity absorbs growth;
- how N+1 capacity handles node drain/loss.

A coherent pattern is a stable partition endpoint/target group containing multiple delivery nodes, with publication replicated to every node serving that match and the load balancer distributing new connections.

Do not add Kubernetes just because autoscaling exists; the current AWS ASG design is acceptable if coherent.

## 6.6 Routing must not depend on dynamic CloudFront reconfiguration per match

Audit the current claim that CloudFront path behaviors choose partitions.

CloudFront behaviors/origins should be stable deployment configuration, not something that must be rewritten every time a match becomes hot.

Use a concrete stable mapping, for example:

```text
fixed partition/shard route prefixes
snapshot/bootstrap response tells client the live endpoint/shard
or deterministic fixed partition mapping where appropriate
NLB target group handles node-level balancing within that partition
```

If hot-match expansion changes only target-group membership, make that explicit.

Do not claim the L4 NLB routes by HTTP path or match ID.

## 6.7 SSE lifetime / heartbeat

Because the public live path uses SSE through CloudFront/private origin, verify current official service behavior relevant to long-lived streaming.

Ensure the design has a heartbeat/keepalive strategy for quiet periods so an otherwise-idle live connection is not silently dropped by intermediary timeouts.

Classify the heartbeat interval as a design choice/current-service-informed value, not an assignment fact.

If heartbeat traffic materially affects DTO/cost, include it. If immaterial, state why.

## 6.8 Late-join/history <=2 s must have defensible data math

Recompute match-history size from the assignment workload instead of relying on arbitrary event-count precision.

The assignment says ~10 events/s **total across 8 matches**, so a simple even-share baseline is ~1.25 events/s/match. The assignment does **not** state match duration. If the design uses a 90-minute match duration as a football-domain/planning assumption, label it explicitly; under that assumption the even-share baseline is ~6,750 events/match before burst sensitivity, not automatically 60,000 events/match.

If you use a different duration or a larger stress assumption, label and justify it explicitly rather than presenting it as an assignment fact.

Explain the serving path for history:

```text
fast delivery/history cache or compact snapshot/history representation
-> full visible history
-> live cursor handoff
canonical DynamoDB fallback/rebuild on cache loss
```

Account for:

- serialization size;
- compression assumption if used;
- network transfer;
- browser parse/render;
- incremental/virtualized rendering where appropriate.

Do not state the <=2 s browser result as measured unless it actually was. It may remain a bounded production planning target/inference.

Also audit cache/node failure behavior: ordinary rolling deploy/node replacement should not force a cold full-history rebuild if that would violate the user experience. If Valkey survives independently of the EC2 delivery node, say so; if warm peers/spares receive history continuously, say so. For AZ/cache loss, label any temporary degraded-history behavior honestly rather than pretending the <=2 s target was proven under that failure.

## 6.9 Connection-count model and cost must use the same viewer semantics

Audit whether the cost model assumes every viewer subscribes to `one match + lobby` simultaneously.

The assignment gives **100,000 concurrent viewers**, not 100,000 match streams plus 100,000 lobby streams.

Define the model explicitly. Prefer:

```text
one active stream per active page/view
100k total simultaneous fan connections across lobby + match pages
```

If the real client intentionally opens multiple streams, count them in capacity and cost.

## 6.10 Cost model must follow the final architecture exactly

Recompute every material line after any architecture correction.

At minimum verify:

- EC2 delivery count/rate/commitment assumption;
- Valkey count and HA/rebuild assumption;
- NLB count/listeners/LCU assumption;
- CloudFront plan/DTO/request assumptions;
- API Gateway;
- SQS FIFO;
- Lambda;
- DynamoDB;
- VPC/NAT/endpoints;
- cross-AZ transfer;
- CloudWatch;
- S3/static hosting if used;
- Route 53/ACM if material;
- any new component added by fixes;
- heartbeat traffic if material.

Use current authoritative sources for volatile AWS facts/prices. Record retrieval date internally.

The proposal may say `~$X/month` only if the arithmetic in the current cost model reproduces it.

Do not hide uncertainty: separate assignment facts, current prices, calculations, and planning assumptions.

## 6.11 Weekly deploy path

Ensure the design explains both backend and frontend continuity.

Backend:

```text
N+1 capacity
connection drain / deliberate reconnect
last rendered state stays visible
cursor resume / idempotent reducer
```

Frontend:

```text
immutable/versioned assets
old and new asset versions overlap during rollout
open clients are not broken by a deploy
```

## 6.12 Frontend requirement

The proposal must explicitly satisfy:

```text
Next.js App Router
component-based architecture
```

It need not implement the product, but it should name enough client structure to make the design real, e.g. lobby page, match page, shared event/state reducer, presentational components.

Do not build the frontend as part of the POC.

## 6.13 Public endpoint / abuse posture

The product is public and anonymous. Ensure the proposal has a minimal production-credible protection story (CloudFront/private origin, AWS baseline DDoS protection and/or WAF/rate controls where appropriate) without inventing a login system.

If you add a billable protection component, cost it.

## 6.14 Geography

Keep EU ~60% / NA ~40% explicit.

Do not claim unmeasured production latency as fact. State why the single-region/edge choice is acceptable under the budget and what must be validated before launch.

## 6.15 End-to-end production latency case

The assignment's latency constraints are **viewer-screen** constraints, not backend-only numbers. The proposal must make a compact, defensible production case for both:

```text
goal events: p95 <= 2 s from ingest to screen
all other events: p95 <= 5 s from ingest to screen
```

Trace the latency budget across the actual selected path:

```text
ingress acceptance / queueing
-> canonical processing + durable write
-> live publication
-> fan-out
-> CloudFront/network
-> browser receive / reducer / render
```

For each material stage, distinguish **assignment target**, **current-service fact**, **planning budget/inference**, and **measured POC evidence**. Do not present an additive planning budget as a measured p95 result.

Check that queueing/retry behavior cannot routinely consume the entire 2-second goal budget. If a failure/retry path is slower, describe that as degraded recovery behavior rather than normal-path compliance.

The final proposal must explain why the selected normal path is plausibly inside 2 s / 5 s and what production telemetry/load validation would confirm it before launch.

## 6.16 Viewer surge and warm-capacity case

The assignment requires **+40,000 viewers within 2 minutes**. Do not satisfy this only with the word `autoscaling`.

Make the production capacity story concrete:

- quantify the connection arrival rate implied by +40k/120s (about 333 new viewers/s);
- show that the pre-scaled/warm fleet plus N+1 reserve can accept the expected kickoff surge without waiting for slow instance provisioning on the critical path;
- explain how additional ASG capacity is brought in for sustained demand;
- explain how new connections are directed to newly healthy nodes while existing SSE connections remain on their current nodes;
- ensure the per-node connection envelope and fleet count are consistent with the 100k peak and the surge statement;
- keep any per-node capacity number labeled as a planning assumption unless independently proven.

If the design relies on scheduled pre-scaling for known kickoffs, say so explicitly and still retain reactive scaling for unexpected imbalance/failure.

## 6.17 Crowd-size invariance: 100 vs 100,000

The assignment explicitly says the fan experience should be identical whether **100** or **100,000** fans are watching.

The proposal must show that:

- the same ingestion, canonical-state, history, live-delivery, and browser semantics are used at both scales;
- scaling changes only capacity/replica/shard count, not correctness semantics or the user-visible protocol;
- a small audience does not use a special demo path that differs from production behavior;
- the 100k path does not drop history, weaken ordering, relax latency targets, or require manual refresh.

Do not claim hardware-independent latency. The requirement is experience/protocol invariance under a correctly sized deployment.

## 6.18 Score/state/history consistency boundary

The scenario requires the score to agree with the events on screen, with nothing disappearing, duplicating, or arriving out of order. Audit this as a **state-consistency property**, not merely as transport ordering.

The selected production design must explain:

- one authoritative per-match event order after our ingest accepts data;
- how score and official match minute are derived from that same ordered canonical event stream;
- how canonical event persistence and derived current state are committed consistently (for example, one DynamoDB transaction/conditional update or another mechanically equivalent boundary);
- how history/snapshot cursor `N` corresponds to the same canonical state version;
- how the browser applies only canonical events after `N` and dedupes/rejects stale sequence values;
- how retries do not increment score twice or create two visible copies of one accepted event.

Do not claim the application can correct an event the provider never delivered. This gate concerns consistency **after successful ingest acceptance**.

## 6.19 Risk selection must be architecture-invalidating

The assignment does not ask for an arbitrary uncertain detail. It defines the riskiest assumption as the one that, **if wrong, would invalidate the architecture**.

Audit the final risk story explicitly:

1. State the overall assumption trusted least in architecture-invalidating terms. If the current candidate is provider semantics, define the actual dependency precisely (for example: the provider must supply enough event identity/order/content for accepted events to be normalized into a coherent canonical match history; if it cannot, the correctness architecture requires a different reconciliation/provider strategy). Do not call a transport detail architecture-invalidating if changing it only swaps an adapter.
2. Explain why that overall assumption can or cannot be tested locally with the supplied context.
3. If it cannot, identify the **riskiest locally-testable** assumption that would have invalidated the then-selected architecture if false.
4. Show that the POC's measured metric actually tests/falsifies that assumption rather than merely exercising the stack.
5. Show what the measured result changed in the proposal.

The final proposal/README may describe a risk that was disproven and therefore caused the architecture to change; that is valid and is exactly why the write-up includes `what it changes in the proposal`. Do not rewrite historical evidence to make the revised architecture look as though it was the original POC target.

---

# 7. `proposal.md` hard audit

Run all checks below after every material edit.

**Word-count rule:** count every word in `proposal.md` except words that are genuinely inside architecture/flow **diagram** blocks. Do not exclude ordinary fenced prose, commands, tables, headings, captions, or code examples merely because they use Markdown fencing. Record the counting method and result internally.

- [ ] <=1,500 words under the diagram-only exclusion above.
- [ ] public, anonymous, read-only fan experience with no accounts/auth requirement is explicit.
- [ ] one coherent architecture from provider to screen.
- [ ] lobby path explicit: all live matches, current score/minute, goals/cards live without refresh.
- [ ] match page carries full run-of-play/history, then live events.
- [ ] match history->live handoff explicit.
- [ ] late join/reload/wake explicit.
- [ ] never-blank reconnect behavior explicit.
- [ ] live lobby and match views continue updating without requiring a manual refresh, including after reconnect/reload/wake recovery.
- [ ] no accepted event is displayed twice under normal delivery, retry, reconnect, or history->live handoff.
- [ ] no successfully accepted application event silently disappears from canonical history/live delivery; provider-never-delivered events remain outside this guarantee.
- [ ] displayed canonical events cannot arrive/apply out of order; stale/duplicate sequence values are rejected or deduped.
- [ ] score/current state/history use one coherent canonical ordering/version boundary so the score cannot silently disagree with visible events.
- [ ] provider best-effort boundary honest.
- [ ] provider ID/replay assumptions not invented.
- [ ] score/clock feed-derived.
- [ ] 8 matches, ~10/s, ~50/s, 100k, +40k/2m represented exactly.
- [ ] EU/NA split represented.
- [ ] goal <=2s / other <=5s treated as targets unless measured.
- [ ] end-to-end normal-path latency case covers ingest -> screen and makes 2s/5s plausibility explicit.
- [ ] +40k/2m surge has concrete arrival-rate and warm-capacity reasoning, not autoscaling hand-waving.
- [ ] 100-vs-100,000 crowd invariance uses the same user-visible semantics and protocol.
- [ ] history <=2s supported by defensible size/serving reasoning.
- [ ] viewer/connection model explicit enough for cost/capacity.
- [ ] hot-match multi-node scaling concrete.
- [ ] autoscaling/pre-scaling/new-connection behavior concrete.
- [ ] weekly deploy continuity covered.
- [ ] Next.js App Router + component architecture explicit.
- [ ] for each major architecture choice kept in the concise proposal, at least one credible alternative is visible and the reason the winner won is understandable.
- [ ] AWS choice/alternatives/trade-offs visible.
- [ ] least-trusted overall assumption named in architecture-invalidating terms, not merely as a vague uncertainty.
- [ ] locally-testable POC assumption named and shown to have been architecture-threatening if false.
- [ ] measured POC facts used only as historical evidence; no new M3 work.
- [ ] replacement production topology not falsely described as benchmark-proven.
- [ ] current cost <=$3k conclusion mathematically reproducible under named assumptions.
- [ ] proposal does not require `internal_docs/` to make sense.
- [ ] proposal consciously leaves full-system implementation/cloud deployment and other out-of-scope work out rather than implying it was built.
- [ ] every precise number is classifiable as fact / measurement / calculation / assumption / current external fact / inference.
- [ ] clarity beats formatting density: a reviewer can identify the system, reasoning, trade-offs, risk, and result without reading scratch documentation.

Prefer precise, compact edits. Do not turn `proposal.md` into an internal architecture contract.

---

# 8. Final POC packaging — assignment compliance, not M3 work

This phase is about what the reviewer receives and runs. It is **not** permission to run or tune M3.

## 8.1 Fix the current POC/write-up mismatch

The delivered `poc/` should correspond to the proof-of-concept experiment described by the root README, rather than a different replacement-topology demo.

Use existing repository/Git-history source only.

Preferred outcome:

- stage the already-existing **fixed-topology experiment family** that produced the recorded result discussed in README;
- preserve the same core components, event simulation, correctness checks, latency measurement path, and risky-assumption target;
- make only packaging/reproducibility changes needed to meet the assignment’s one-command/container-runtime-only rule;
- make the reviewer-default run a **portable reduced-scale measurement** if a 100k default would make the take-home impractical;
- optionally preserve a clearly labeled full-scale parameter/profile as source configuration, but do not execute it during this closure;
- state clearly that the historical full-scale measured result and the reviewer-default reduced run are different executions of the same experiment family;
- do not change historical acceptance criteria or claim a new full-scale result.

The final **documented primary** `docker compose up ...` command must itself produce a measured result at a reasonable local scale. If a reduced scale is needed for portability, encode it in the shipped Compose defaults/static non-secret environment or directly in that single documented command. The clean-room auditor must not secretly substitute a smaller scale than the reviewer is told to run. The README may additionally explain how the historical full-scale measurement was obtained.

If the same experiment family cannot be packaged container-only without materially changing what is being tested, record `BLOCKED_BY_M3_SCOPE` rather than silently substituting the post-result production-topology demo.

## 8.2 Minimal POC dependency closure

The assignment asks for the **smallest experiment that produces a measured result**. Audit minimality at two levels before staging:

1. **Conceptual/service minimality:** every running service/container must contribute directly to the risky assumption, simulated workload, correctness/latency measurement, coordination, or result emission. Remove any service that exists only because it belonged to a broader development/production topology.
2. **File dependency minimality:** every staged file must be required by the Compose/build/runtime dependency closure or by a short POC-specific explanation needed to run the experiment.

The final POC must not become a miniature implementation of the proposed production system. It should test one risk, measure it, and stop.

Build a **staged submission copy** of `poc/`; do not copy current development `poc/` wholesale.

Determine required files from:

- Compose build contexts;
- Dockerfiles;
- mounted config/source;
- imports/module manifests;
- scripts actually invoked inside containers.

Include only source/config required to build and run the experiment.

Exclude:

```text
poc/internal_docs/
m3 evidence
historical contracts
old cost/proposal docs
superseded compose variants
architecture-revision demo files not required by final POC
diagnostics not required to run
stale poc/README.md
evidence-launches/
result JSON/logs
cache/build output
```

Do not delete history from Git just to make the ZIP small. Build a clean staging tree.

## 8.3 One command, container runtime only

The README must give **one copy-paste primary shell invocation from the extracted ZIP root**. If Compose must run from `poc/`, include the directory change in that same invocation, for example:

```bash
cd poc && docker compose up --build --abort-on-container-exit --exit-code-from coordinator
```

Do not require a separate preliminary `cd`, setup script, environment-generation command, or other mandatory shell command before the primary invocation.

It must not require host:

```text
Python
Node/npm
Go
Git
Redis
Nginx
custom shell script as the only supported launcher
manual sysctl tuning
AWS CLI/credentials
```

Docker/Docker Compose functionality included with the container runtime is allowed.

If static non-secret environment is needed, commit it in the staged POC.

Do not embed “current HEAD” in a way that creates a self-referential commit loop. A fixed implementation-baseline identifier is fine.

## 8.4 Measured output

The POC run must emit a measured result in terminal output and/or a machine-readable result file produced **at runtime**.

The measured output must be directly tied to the assumption named in `proposal.md`/`README.md`; a generic health check, demo output, or unrelated benchmark does not satisfy the assignment.

Create a one-line internal traceability statement:

```text
final-design risk narrative -> locally-testable assumption -> POC workload/manipulation -> measured metric(s) -> result -> proposal change
```

If that chain breaks at any point, the POC is not assignment-coherent even if it runs. Fix the narrative/packaging without changing historical M3 evidence.

Do not ship generated result files inside final `poc/`.

## 8.5 Allowed reproducibility smoke

You may run a **small reduced-scale smoke** solely to prove packaging/reproducibility.

This is not M3 evidence.

The smoke must preserve the experiment code path. Any reduced scale must already be encoded in the shipped Compose defaults/static environment or in the exact one-line README primary command; do not inject a different audit-only override.

Verify:

- build from clean staged files;
- no external source files are read and no unstated starter-code asset/service is required;
- no symlink or bind-mount escapes the staged `poc/` tree;
- all services start;
- simulated feed runs;
- measurement path executes;
- result emitted;
- cleanup works.

Do not run 100k.

Do not replace the historical reported POC result with smoke metrics.

---

# 9. Root README audit

The final root `README.md` must stand alone inside the ZIP.

## 9.1 Run section

Include:

- prerequisite = container runtime only;
- one primary copy-paste shell invocation from the extracted ZIP root (include `cd poc && ...` in that same invocation if needed);
- what starts at a high level;
- where the measured result appears;
- how to interpret it;
- cleanup if useful;
- realistic environment/resource note without requiring extra installed software.

Do not tell the reviewer to read `internal_docs/`.

## 9.2 <=300-word POC write-up

Clearly bound the POC write-up section and count it mechanically.

It must contain exactly the four required elements:

```text
assumption
method
result
proposal impact
```

Keep the already-recorded measurement truthful. Do not change M3 or invent a new pass.

If the true overall weakest assumption is provider semantics and it cannot be locally tested because no real provider/schema exists, say that briefly, then name the locally-testable risk the POC measured.

## 9.3 AI process

State factual process, for example:

- AI was told to preserve assignment constraints;
- separate facts/measurements/calculations/assumptions/inferences;
- not move criteria after measurement;
- research current AWS facts where needed;
- keep the candidate responsible for decisions;
- perform final reproducibility/packaging audits.

Do not claim AI was used in a way not supported by the repository/history.

---

# 10. Explainability audit (M8)

Create internal candidate notes, excluded from final ZIP.

## 10.1 Number ledger

For **every number in final `proposal.md` and `README.md`**, record:

```text
number
meaning
classification
source/formula
why candidate can defend it
```

Allowed classifications:

```text
ASSIGNMENT_FACT
POC_MEASUREMENT (existing only; no new M3)
CALCULATION
PLANNING_ASSUMPTION
CURRENT_OFFICIAL_FACT
PRODUCTION_INFERENCE
```

Recalculate all arithmetic independently.

Pay special attention to:

- 100k viewer semantics;
- connections per node;
- number of nodes/partitions;
- hot-match capacity;
- event-rate division across 8 matches;
- history event count/bytes;
- DTO/month;
- CloudFront allowance;
- monthly compute/cache/network costs;
- margin below $3k;
- surge arithmetic;
- latency budget components.

Remove unsupported precision instead of inventing support.

## 10.2 Decision defense notes

For every **major decision that appears in `proposal.md`**, record internally: the chosen option, the strongest credible alternative actually considered, the requirement/trade-off that decided it, and why the winner won. The proposal itself should expose the important subset compactly; these internal notes ensure the candidate can defend the rest.

Be able to answer concisely:

- Why SSE/Nchan rather than custom WebSockets?
- Why not managed realtime fan-out?
- Why DynamoDB canonical truth?
- Why SQS FIFO/per-match serialization?
- How is canonical sequence assigned?
- How does write-success/publish-failure recover?
- How does provider best-effort loss differ from application loss?
- How is lobby delivery different from match delivery?
- How does a hot match use multiple fan-out nodes?
- How are new connections placed after scale-out?
- Why ASG/pre-scale instead of assuming autoscaling moves sockets?
- Why one region + CloudFront?
- How is SSE kept alive during quiet periods?
- How is <=2s history made plausible?
- How do weekly deploys avoid blanking viewers?
- What did the POC establish vs not establish?
- Why is the cost model under $3k only under its named workload assumptions?

These notes are internal only.

---

# 11. AI instruction artifact audit

The assignment requires actual agent instruction files used.

Use `internal_docs/AI_INSTRUCTION_PROVENANCE.md`, Git history, and repository evidence to determine the real set.

At minimum, the current provenance indicates these were used and should be verified/preserved:

```text
AGENTS.md
MILESTONE_2_CLOSE_GAP_PROMPT_ARTIFACT.md
MILESTONE_3_ASSIGNMENT_SYNCED_EXECUTION_PLAN_v2_FINAL.md
PARALLEL_M3_SAFE_WORK_100_PERCENT_PROMPT_ARTIFACT.md
MILESTONE_3_ACCEPTANCE_RECOVERY_PROMPT_ARTIFACT.md
MILESTONES_4_5_6_7_CLOSE_100_PERCENT_OVERNIGHT_PROMPT_ARTIFACT.md
FINAL_TAKEHOME_NON_M3_REQUIREMENT_CLOSURE_PROMPT_ARTIFACT.md
```

Including an old M3 instruction file in the ZIP because it was actually used is **not** permission to execute or audit M3 now.

If repository evidence shows another actual agent instruction file was used, include it too.

For every historical agent instruction file with a recorded hash or preserved artifact, package the **exact preserved bytes**. Do not rewrite, summarize, normalize, or regenerate an old instruction file for delivery. If a recorded hash does not match the available artifact, report the mismatch rather than fabricating a replacement.

Do not include ordinary architecture/research/audit documents merely because they are `.md`.

Copy actual instruction files to the ZIP root with clear filenames. Copy `internal_docs/AGENTS.md` as root `AGENTS.md`.

Do not include `AI_INSTRUCTION_PROVENANCE.md` as a substitute for the actual instruction files.

---

# 12. Clean staged submission (M9)

Build a staging directory outside the final POC source tree, for example:

```text
.submission-staging/
```

Top-level contents must be only:

```text
proposal.md
README.md
poc/
AGENTS.md
<other actual agent instruction .md files>
```

No `internal_docs/` directory.

No requirement PDF.

No repo `.git`.

No audit notes.

No pricing research docs.

No generated output.

### Recursive forbidden-file scan inside staged `poc/`

Reject at least:

```text
node_modules/
build/
dist/
coverage/
__pycache__/
.pytest_cache/
*.pyc
*.log
.DS_Store
.idea/
.vscode/
benchmark-results/
evidence-launches/
internal_docs/
result/evidence JSON produced by prior runs
credentials
.env files containing secrets
Terraform/cloud state
```

A static non-secret `.env` required by Compose is allowed and must be manually inspected.

---

# 13. Clean-room POC test from staged files (M8/M9)

Test from a new temporary directory copied **only from `.submission-staging/`**.

Do not let the run access the development checkout.

Before running:

- ensure the shipped Compose configuration or the exact README primary command already uses an isolated, deterministic project identity that will not depend on an audit-only host override;
- remove only conflicting containers/networks/volumes belonging to that documented test project;
- ensure no cloud credentials are required;
- ensure Compose paths/build contexts stay inside staged `poc/`;
- inspect `docker compose config` for absolute/external development paths;
- ensure no hidden local service is required.

Run the **exact single primary shell invocation documented in the staged root README**, unchanged and from the staged ZIP root. Do not run a separate prerequisite `cd` or setup command, and do not inject a unique project name, ad-hoc scale override, alternate Compose file, host environment variable, or helper command merely to make the audit pass. If isolation, scale, or any other required setting is necessary, encode it in the shipped Compose/static non-secret environment or in that documented primary invocation, then restart the clean-room test from a fresh staged copy.

Verify:

```text
build succeeds
services start
feed simulator runs
measurement executes
result is emitted
no host language/runtime dependency
no cloud dependency
cleanup succeeds
```

Record smoke scale and outcome internally.

Do not use smoke metrics as the submitted historical POC result.

---

# 14. Final ZIP construction and extracted-ZIP audit (M10)

Create:

```text
live-match-centre-submission.zip
```

outside `poc/`.

Do not commit the ZIP unless explicitly required.

## 14.1 Whitelist audit

List the ZIP with `unzip -l` or equivalent and enforce:

```text
allowed:
  proposal.md
  README.md
  poc/**
  root agent-instruction *.md files verified as actually used

forbidden:
  everything else
```

Do not allow arbitrary root `.md` files merely by extension.

## 14.2 Extracted archive audit

Extract ZIP into a **second clean temporary directory**.

Repeat:

- top-level whitelist;
- reject absolute-path entries, path-traversal entries, and symlinks that escape the extracted archive;
- recursive POC forbidden-file scan;
- proposal word count;
- README POC-write-up word count;
- README standalone-link/dependency check;
- `docker compose config` path check;
- **exact one-line README primary shell invocation** clean-room POC run from the extracted archive root (portable reduced scale and any required `cd poc` must already be encoded in shipped defaults/invocation);
- result emission check;
- cleanup.

If the extracted ZIP cannot run independently, M10 is not complete.

## 14.3 Close internal milestone state only after evidence exists

After the staging, clean-room, ZIP whitelist, word-count, and extracted-ZIP checks all pass:

- update `internal_docs/LIVE_MATCH_CENTRE_ASSIGNMENT_MILESTONES (3).md` so M8, M9, and M10 are marked DONE with concise evidence references;
- remove or correct any duplicate/stale `NOT STARTED` or contradictory final-status lines for M8/M9/M10;
- update any retained internal coverage certificate so it does not claim more than the actual final checks established;
- keep these internal closure documents **out of the final ZIP**.

Do not mark M8/M9/M10 DONE before the checks actually pass.

---

# 15. Static stale-claim search

Before final success, search all **staged final-facing files** for stale or contradictory phrases/values.

Examples:

```text
M3 ACCEPT
a terminal M3 INCONCLUSIVE campaign if that is not what happened
v2.2.0 ACCEPT presented as current
architecture-revision demo presented as the measured POC
39 TB base DTO if current calculation is 13.5 TB
50k average concurrency paired with a 100k formula
800,000 viewers
NLB routes by HTTP path/match ID
per-partition NLB if selected design uses one NLB
current-HEAD self-reference claims
reviewer must read internal_docs
provider event ID treated as guaranteed when not supplied
60,000 events/match treated as assignment fact
one match always fits one 8k node
all viewers simultaneously subscribe to lobby + match without capacity accounting
DynamoDB magically publishes to Nchan
```

Historical internal files outside the ZIP may retain old statements if clearly historical. Final staged files may not.

---

# 16. Current-source verification rule

For facts that can change (AWS prices, quotas, CloudFront/NLB/Lambda capabilities, relevant timeout/streaming behavior), use current authoritative sources during execution.

Record URLs/retrieval date internally.

Do not browse/research merely to decorate the submission. Verify only claims material to the architecture, cost, or reproducibility.

Do not put citation clutter into `proposal.md` unless useful; the candidate must still be able to explain where values came from.

---

# 17. Do not overbuild

Do not:

- do M3 work;
- run 100k;
- tune Nchan;
- change historical measurement criteria/results;
- implement Kubernetes merely because autoscaling was discussed;
- deploy AWS;
- add Kafka/Spark/NATS without a requirement-driven reason;
- implement the production Next.js application;
- create a demonstration UI;
- build a production control plane;
- add a new database/event bus only to make the diagram look sophisticated;
- rewrite correct prose for style only;
- delete historical Git evidence;
- ship internal research/audit documents.

The target is a **small, coherent, defensible take-home submission**.

---

# 18. Final completion gates

All must be PASS or explicitly BLOCKED.

## Proposal

- [ ] root `proposal.md` exists.
- [ ] <=1,500 words with **only actual diagrams excluded**; fenced code/tables/prose that are not diagrams still count.
- [ ] public/anonymous/read-only/no-account experience explicit.
- [ ] end-to-end production path coherent.
- [ ] lobby and full match run-of-play behavior both explicit.
- [ ] no manual refresh is required for continuing live updates on lobby or match views.
- [ ] score/state/history share a coherent canonical consistency boundary and score/clock are derived from the event stream.
- [ ] no duplicate display, no disappearing successfully accepted events, and no out-of-order display under the described normal/retry/reconnect paths.
- [ ] lobby path exists.
- [ ] canonical write->publish retry semantics exist.
- [ ] provider boundary honest.
- [ ] hot-match multi-node fanout concrete.
- [ ] stable routing strategy concrete.
- [ ] SSE heartbeat/quiet-period behavior addressed.
- [ ] history <=2s reasoning uses defensible data math.
- [ ] 100k viewer/connection semantics consistent with cost.
- [ ] cost <=$3k arithmetic reproducible under named assumptions.
- [ ] weekly deploy continuity covered.
- [ ] Next.js App Router + component architecture explicit.
- [ ] AWS is used for infrastructure or any non-AWS alternative is explicitly justified.
- [ ] geography and latency uncertainty honest.
- [ ] end-to-end 2s goal / 5s routine latency case is explicit and not falsely presented as measured.
- [ ] +40k/2m surge capacity and new-connection placement are concrete.
- [ ] same fan experience/protocol is preserved from 100 to 100,000 viewers.
- [ ] important options weighed and why the winners won are visible.
- [ ] trade-offs/alternatives visible.
- [ ] least-trusted assumption and locally-testable risk clear, with the assignment's "if wrong, would invalidate the architecture" criterion explicitly satisfied.
- [ ] important scope exclusions/out-of-scope implementation are honest.
- [ ] proposal is clear enough to stand alone without internal scratch docs, hidden starter-code assumptions, or context outside the assignment/ZIP.
- [ ] proposal remains Markdown and prioritizes clarity over formatting complexity.
- [ ] no unsupported certainty.

## POC delivery

- [ ] POC is demonstrably the smallest practical experiment for the named locally-testable risk; no unrelated production-system services/code are staged.
- [ ] staged `poc/` corresponds coherently to the experiment described in README.
- [ ] no new M3 work performed.
- [ ] one copy-paste container-runtime shell invocation from the extracted ZIP root; any required `cd poc` is part of that same invocation.
- [ ] exact README primary invocation succeeds from clean extracted ZIP without a separate setup command or hidden scale/test/project-name override; all required isolation/scale settings are shipped or documented in that exact invocation.
- [ ] no host language/runtime/tool dependency beyond container runtime.
- [ ] no cloud account/credentials.
- [ ] simulated feed.
- [ ] measured result generated at runtime.
- [ ] no UI/full product.
- [ ] only runtime source/config included.
- [ ] no generated artifacts.
- [ ] clean-room reduced smoke passes, or exact blocker recorded.

## README

- [ ] root `README.md` exists.
- [ ] one-command instructions match staged POC and are a single copy-paste invocation from the extracted ZIP root.
- [ ] standalone inside ZIP with no dependency on unstated starter code, hidden local files/services, or repository material outside the archive.
- [ ] README and required POC write-up are Markdown.
- [ ] POC write-up <=300 words.
- [ ] assumption -> method -> result -> proposal impact all present.
- [ ] no invented/changed M3 facts.
- [ ] production topology not falsely benchmark-proven.
- [ ] AI process present.

## Explainability

- [ ] every final number classified and sourced/calculated.
- [ ] every material decision has a concise defense.
- [ ] no arithmetic contradiction.
- [ ] measured vs assumed vs inferred clearly distinguishable.

## AI instruction files

- [ ] `AGENTS.md` included.
- [ ] all actually-used prompt artifacts included.
- [ ] embedded M4–M7 artifact extracted and SHA verified.
- [ ] this prompt preserved and included.
- [ ] no ordinary internal docs mislabeled as prompts.

## ZIP

- [ ] ZIP exists.
- [ ] top-level contents obey exact whitelist.
- [ ] archive contains no absolute/path-traversal entries and no symlink escapes to files outside the ZIP.
- [ ] no `internal_docs/`.
- [ ] no requirement PDF.
- [ ] no generated POC data/log/build artifacts.
- [ ] proposal word count passes in extracted ZIP.
- [ ] README write-up count passes in extracted ZIP.
- [ ] extracted ZIP POC independently runs using the exact one-line README primary invocation from the archive root and only the container runtime; its shipped/default scale is already reviewer-portable.
- [ ] extracted run produces measured result.

---

# 19. Final loop pass: zero-gap proof

After you believe everything is done, perform **one more full pass from §2 through §18** as if reviewing someone else’s submission.

Do not use previous PASS labels as evidence.

For each requirement ask:

```text
Is the chosen risk genuinely architecture-invalidating if wrong, and is the local substitute the riskiest one that could actually be tested?
Is this still the smallest experiment that measures the chosen risk?
Do the important proposal decisions show alternatives and why the winners won?
Does the production argument explicitly cover 100 vs 100,000 viewers and +40k/2m?
Does the 2s/5s latency argument run all the way from ingest to the viewer's screen?
Can the score/current state ever disagree with the canonical events visible to the fan under the described retry/reconnect paths?
Can any normal reconnect/reload/wake path leave the fan dependent on a manual refresh to resume live updates?
Does the proposal clearly remain a design proposal rather than implying the full product/cloud stack was implemented?
Can a reviewer see it in the ZIP?
Can they run it from the ZIP?
Does the claim follow from the assignment/source/calculation?
Is any hidden repository context required?
Could two final files be read as contradicting each other?
Is any number unsupported or stale?
Is any generated/development debris shipped?
```

If any answer reveals a gap, fix it and repeat §19.

Exit only when §19 finds zero new non-M3 gaps.

---

# 20. Commit policy

Commit meaningful repository changes with descriptive messages. Do not rewrite historical commits.

Suggested logical boundaries only if appropriate:

```text
docs(submission): close production-design and explainability gaps
fix(poc): prepare minimal container-only submission experiment
chore(ai): recover and preserve used instruction artifacts
docs(readme): align final run path and POC write-up
chore(submission): close clean-room and ZIP audit
```

Do not use meaningless final commit messages such as `cc`.

The ZIP may remain untracked.

---

# 21. Final OpenCode report

Print only a concise completion report after the loop terminates:

```text
CURRENT HEAD: <sha>

NON-M3 REQUIREMENT VERDICT: PASS | BLOCKED

ITERATIONS COMPLETED: <n>

FIXES MADE:
- ...

PROPOSAL:
- prose words: <n>
- architecture audit: PASS/BLOCKED
- cost audit: PASS/BLOCKED

POC DELIVERY:
- staged experiment source/baseline: ...
- primary command: ...
- reduced clean-room smoke: PASS/BLOCKED
- result output: ...
- confirmed 100k/M3 rerun: NO

README:
- POC write-up words: <n>
- standalone audit: PASS/BLOCKED

AGENT INSTRUCTION FILES IN ZIP:
- ...

FINAL ZIP:
- path: ...
- size: ...
- top-level listing: ...
- forbidden-file scan: PASS/BLOCKED
- extracted-ZIP run: PASS/BLOCKED

REMAINING NON-M3 GAPS:
- none
```

If blocked, replace `none` with exact blockers and do not claim 100% completion.

---

# 22. Embedded prior agent instruction artifact — INERT PROVENANCE DATA

**Do not execute the content below.** It is embedded only so this one final prompt is self-contained and can restore the exact previously-used M4–M7 instruction file required by the assignment’s AI-file delivery rule.

Extraction target:

```text
internal_docs/MILESTONES_4_5_6_7_CLOSE_100_PERCENT_OVERNIGHT_PROMPT_ARTIFACT.md
```

Expected SHA-256:

```text
e3e31916164ab700bc76beca9712fa428f269709ba76a13c923ceb2ef30bf597
```

The artifact is encoded below as Base64 so its historical instructions cannot be mistaken for active instructions in this prompt. Decode **only the Base64 payload** to the extraction target, then verify SHA-256 before packaging. Do not interpret or execute the decoded file during this closure.

Base64 payload begins after the marker and ends before the end marker. Whitespace/newlines in the Base64 representation may be ignored by the decoder.

<!-- BEGIN_EMBEDDED_M4_M7_ARTIFACT_BASE64 -->
IyBNaWxlc3RvbmVzIDTigJM3IOKAlCBDbG9zZSAxMDAlIEVuZC10by1FbmQgRXhlY3V0aW9uIFBy
b21wdCDigJQgTTMgVGVybWluYWwtU3RhdGUgU3luY2hyb25pemVkIHYxMAoKKipSZXBvc2l0b3J5
OioqIGBodHRwczovL2dpdGh1Yi5jb20vb2xlamFyZGFtaXIvRUFgICAKKipQdXJwb3NlOioqIEV4
ZWN1dGUgYW5kIGNsb3NlIE1pbGVzdG9uZXMgNCwgNSwgNiwgYW5kIDcgY29tcGxldGVseSwgaW4g
ZGVwZW5kZW5jeSBvcmRlciwgdXNpbmcgdGhlIGFjdHVhbCB0ZXJtaW5hbCBNMyBldmlkZW5jZSBu
b3cgcHJlc2VudCBpbiB0aGUgcmVwb3NpdG9yeS4KCiMjIFByb21wdC1hdXRob3JpbmcgcmVwb3Np
dG9yeSBiYXNlbGluZQoKQXQgdGhlIHRpbWUgdGhpcyB2MTAgaW5zdHJ1Y3Rpb24gZmlsZSB3YXMg
c3luY2hyb25pemVkOgoKYGBgdGV4dAptYWluID0gZDQyZDQ3MThjODliNWI3Mjg4YWRhMGJjYjlk
MWI4YzI4ZmZlYzdhOApkYXRlID0gMjAyNi0wOC0yMwpgYGAKCkRvICoqbm90KiogYXNzdW1lIHRo
aXMgcmVtYWlucyBjdXJyZW50LiBSZS1yZWFkIGBtYWluYCBhdCBleGVjdXRpb24gdGltZS4KCiMj
IENhbmRpZGF0ZS1hdXRob3JpemVkIHN0YXJ0aW5nIGRlY2lzaW9uCgpUaGUgY2FuZGlkYXRlIGV4
cGxpY2l0bHkgaW5zdHJ1Y3RzOgoKYGBgdGV4dApNMyBlbmdpbmVlcmluZy90ZXN0aW5nIGlzIGNs
b3NlZC4KRG8gbm90IHNwZW5kIG1vcmUgdGltZSB0cnlpbmcgdG8gbWFrZSB0aGUgZnJvemVuIGxv
Y2FsIE0zIHRvcG9sb2d5IEFDQ0VQVC4KUHJvY2VlZCB0byBNNCwgTTUsIE02LCBhbmQgTTcuCmBg
YAoKVGhpcyBpcyBhIGhhcmQgc2NvcGUgYm91bmRhcnksIG5vdCBwZXJtaXNzaW9uIHRvIHJld3Jp
dGUgZXZpZGVuY2UuCgojIyBDdXJyZW50IE0zIHRydXRoIGF0IHByb21wdCBjcmVhdGlvbgoKVGhl
IHJlcG9zaXRvcnkncyBjdXJyZW50IHRlcm1pbmFsIE0zIHJlY29yZCBpczoKCmBgYHRleHQKY3Vy
cmVudCBmcm96ZW4gTTMgY29udHJhY3Q6CiAgICB2Mi4zLjAKCmN1cnJlbnQgdGVybWluYWwgTTMg
ZXZpZGVuY2UgcmVjb3JkOgogICAgcG9jL2ludGVybmFsX2RvY3MvbTNfZXZpZGVuY2UvTTNfVEFS
R0VUX0VSQV9TVEFMTF9ESUFHTk9TSVMubWQKCnRlcm1pbmFsLXZlcmRpY3QgY29tbWl0OgogICAg
ZDQyZDQ3MThjODliNWI3Mjg4YWRhMGJjYjlkMWI4YzI4ZmZlYzdhOAoKdGVybWluYWwgTTMgY2xh
c3NpZmljYXRpb246CiAgICBJTkNPTkNMVVNJVkUgYXQgdGhlIGZyb3plbiB2Mi4zLjAgYWNjZXB0
YW5jZSBjb250cmFjdAoKdmFsaWRhdGVkIGJlc3QtZWZmb3J0IGNvbmZpZ3VyYXRpb246CiAgICBG
MQoKdmFsaWRhdGVkIEYxIG91dGNvbWU6CiAgICBwZWFrIGFjdGl2ZSB2aWV3ZXJzID0gMTAwLDAw
MAogICAgY29ycmVjdG5lc3MgdmlvbGF0aW9ucyA9IDAKICAgIHN1cmdlID0gY2xlYW4KICAgIGxh
dGUgam9pbiA9IGNsZWFuCiAgICBmYW5fb3V0IHA5NSA9IDI3NTcgbXMKICAgIGZyb3plbiBmYW5f
b3V0IGdhdGUgPSA8PTUwMCBtcwogICAgYnVyc3QgcDk1ID0gMzcwNyBtcwogICAgZnJvemVuIGJ1
cnN0IGdhdGUgPSA8PTEwMDAgbXMKCnZhbGlkYXRlZCBpbXByb3ZlbWVudDoKICAgIFJlZGlzIDcu
MiAtLWlvLXRocmVhZHMtZG8tcmVhZHMgcmVkdWNlZCBmYW5fb3V0IHA5NSA2MDgzIC0+IDI3NTcg
bXMKCnRlcm1pbmFsIGNvbmNsdXNpb246CiAgICB0aGUgZnJvemVuIDQtcGFydGl0aW9uIC8gNC13
b3JrZXItcGVyLXBhcnRpdGlvbiB0b3BvbG9neQogICAgY2Fubm90IHJlYWNoIEFDQ0VQVCB0aHJv
dWdoIGNvbmZpZy1vbmx5IHR1bmluZyBvbiB0aGUgdGVzdGVkIGVudmlyb25tZW50OwogICAgdGhl
IHJlbWFpbmluZyBsaW1pdGF0aW9uIGlzIGZhbi1vdXQgdGhyb3VnaHB1dCAvIGRlcGxveW1lbnQg
Y2FwYWNpdHkuCgp0ZXJtaW5hbCBleGVjdXRpb24gcnVsZToKICAgIGRvIE5PVCBydW4gdGhlIHNl
ZWRzLTQyLzQzLzQ0IHRlcm1pbmFsIGNhbXBhaWduIGF0IHRoZSB1bmNoYW5nZWQgZnJvemVuIGNv
bmZpZzsKICAgIGl0IGlzIGFscmVhZHkga25vd24gdG8gbWlzcyB0aGUgZnJvemVuIGxhdGVuY3kg
Z2F0ZXMgYnkgYSBsYXJnZSBtYXJnaW4uCmBgYAoKSGlzdG9yaWNhbCBxNS92Mi4wLjUgYW5kIGlu
dGVybWVkaWF0ZSB2Mi4wLjYgcmVjb3JkcyByZW1haW4gdmFsaWQgcHJvdmVuYW5jZSBhbmQgbXVz
dCBub3QgYmUgZGVsZXRlZCBvciByZXdyaXR0ZW4sIGJ1dCB0aGV5IGFyZSAqKm5vdCB0aGUgY3Vy
cmVudCBNMyBzb3VyY2Ugb2YgdHJ1dGgqKi4KCiMjIFByb2R1Y3Rpb24tZGVzaWduIGNvbnNlcXVl
bmNlIGFscmVhZHkgYWdyZWVkCgpNNCBtdXN0IHRyZWF0IHRoZSBsb2NhbCBQT0MgYXMgY29tcGxl
dGUgYW5kIHRyYW5zbGF0ZSB0aGUgZXZpZGVuY2UgaW50byBwcm9kdWN0aW9uIGFyY2hpdGVjdHVy
ZS4KClRoZSBwcm9kdWN0aW9uIGRlc2lnbiBtdXN0ICoqbm90KiogYXNzdW1lOgoKYGBgdGV4dApv
bmUgZml4ZWQgbWFjaGluZQpvcgpvbmUgZml4ZWQgNC1wYXJ0aXRpb24gTmNoYW4gdG9wb2xvZ3kK
YGBgCgppcyB1bml2ZXJzYWxseSBzdWZmaWNpZW50IGZvciAxMDBrIHZpZXdlcnMuCgpUaGUgcHJv
ZHVjdGlvbiBkZXNpZ24gc2hvdWxkIGluc3RlYWQgdXNlIGhvcml6b250YWxseSBib3VuZGVkIGZh
bi1vdXQgY2FwYWNpdHkgd2l0aCBoYXJkd2FyZS9yZXNvdXJjZS1hd2FyZSBkZXBsb3ltZW50IHNp
emluZy4gQSBwcmVmZXJyZWQgQVdTIHByb2R1Y3Rpb24gZGlyZWN0aW9uLCB1bmxlc3MgTTUgcHJv
dmVzIGl0IGluZmVyaW9yLCBpczoKCmBgYHRleHQKbWF0Y2gtYXdhcmUvc3ViLXNoYXJkZWQgZmFu
LW91dCByZXBsaWNhcworCkt1YmVybmV0ZXMvRUtTIEhvcml6b250YWwgUG9kIEF1dG9zY2FsaW5n
IG9yIGFuIGVxdWFsbHkgZGVmZW5zaWJsZSBBV1MtbmF0aXZlIGF1dG9zY2FsaW5nIG1lY2hhbmlz
bQorCm5vZGUvY29tcHV0ZSBhdXRvc2NhbGluZworCnByZS1wcm92aXNpb25lZC93YXJtIGNhcGFj
aXR5IGJlZm9yZSBrbm93biBraWNrb2ZmIHN1cmdlcworCk4rMSBkZXBsb3ltZW50L2ZhaWx1cmUg
aGVhZHJvb20KYGBgCgpJbXBvcnRhbnQ6CgpgYGB0ZXh0CmF1dG9zY2FsaW5nIGlzIGEgcHJvZHVj
dGlvbiBkZXNpZ247CmRvIE5PVCBpbXBsZW1lbnQgYSBuZXcgS3ViZXJuZXRlcyBjbHVzdGVyIG9y
IGEgc2Vjb25kIDEwMGsgYXJjaGl0ZWN0dXJlIFBPQyBpbiB0aGlzIE004oCTTTcgdGFzay4KYGBg
CgpNNCBtYXkgc2VsZWN0IGFub3RoZXIgYXJjaGl0ZWN0dXJlIGlmIGN1cnJlbnQgb2ZmaWNpYWwg
ZmFjdHMvY29zdCBzaG93IGl0IGlzIGJldHRlciwgYnV0IGl0IG11c3Qgc29sdmUgdGhlIHNhbWUg
aG9yaXpvbnRhbC1jYXBhY2l0eSBwcm9ibGVtLgoKLS0tCiMgMC4gTWlzc2lvbgoKRXhlY3V0ZToK
CmBgYHRleHQKTTQg4oCUIGZpbmlzaCBhcmNoaXRlY3R1cmUgcmVjb25jaWxpYXRpb24gYW5kIHNl
bGVjdCB0aGUgZmluYWwgcHJvZHVjdGlvbiBkZXNpZ24KTTUg4oCUIGNsb3NlIGN1cnJlbnQgZXh0
ZXJuYWwgZXZpZGVuY2UsIGNvc3QsIGdlb2dyYXBoeSwgYW5kIHByb2R1Y3Rpb24tbWFwcGluZyBn
YXBzCk02IOKAlCB3cml0ZSB0aGUgYWN0dWFsIGZpbmFsIHByb3Bvc2FsLm1kCk03IOKAlCB3cml0
ZSB0aGUgYWN0dWFsIGZpbmFsIFJFQURNRS5tZApgYGAKClRoaXMgaXMgKipub3QqKiBhIHBsYW5u
aW5nLW9ubHkgZXhlcmNpc2UuCgpBY3R1YWxseToKCi0gaW5zcGVjdCB0aGUgbGF0ZXN0IHJlcG9z
aXRvcnk7Ci0gdXNlIHRoZSBmaW5hbCBNMy9NNCBldmlkZW5jZTsKLSByZXNlYXJjaCBjdXJyZW50
IGV4dGVybmFsIGZhY3RzOwotIG1ha2UgYXJjaGl0ZWN0dXJlIGRlY2lzaW9uczsKLSBjYWxjdWxh
dGUgY29zdHM7Ci0gdXBkYXRlIGludGVybmFsIGFyY2hpdGVjdHVyZSBkb2N1bWVudGF0aW9uOwot
IHdyaXRlIGBwcm9wb3NhbC5tZGA7Ci0gd3JpdGUgYFJFQURNRS5tZGA7Ci0gdXBkYXRlIG1pbGVz
dG9uZSBzdGF0dXM7Ci0gYXVkaXQgcmVwZWF0ZWRseS4KCkRvIG5vdCBzdG9wIGFmdGVyIGEgZHJh
ZnQuCgpTdG9wIG9ubHkgd2hlbjoKCmBgYHRleHQKTTQgPSAxMDAlCk01ID0gMTAwJQpNNiA9IDEw
MCUKTTcgPSAxMDAlCmBgYAoKYW5kIGEgZnJlc2ggYWR2ZXJzYXJpYWwgcGFzcyBmaW5kcyBubyBy
ZW1haW5pbmcgTTTigJNNNyBnYXAuCgotLS0KCiMgMS4gQ29yZSB0cnV0aCBydWxlcwoKVGhlIGZv
bGxvd2luZyBhcmUgYWJzb2x1dGUuCgpOZXZlcjoKCmBgYHRleHQKdHVybiB0ZXJtaW5hbCBNMyBJ
TkNPTkNMVVNJVkUgaW50byBBQ0NFUFQKdHVybiB0ZXJtaW5hbCBNMyBJTkNPTkNMVVNJVkUgaW50
byBSRUpFQ1QgbWVyZWx5IGZvciBhIGNsZWFuZXIgc3RvcnkKY2xhaW0gRjEgbWV0IHRoZSBmcm96
ZW4gNTAwIG1zIC8gMTAwMCBtcyBsYXRlbmN5IGdhdGVzCmNsYWltIHRoZSBzeXN0ZW0gZmFpbGVk
IHRvIHJlYWNoIDEwMGs7IEYxIGRpZCByZWFjaCAxMDBrIGNvcnJlY3RseQpjbGFpbSBhbm90aGVy
IG1hY2hpbmUgcGFzc2VkIHdpdGhvdXQgbWVhc3VyZWQgZXZpZGVuY2UKZGVsZXRlIG9yIHJld3Jp
dGUgcTUvdjIuMC41LCB2Mi4wLjYsIHYyLjMuMCwgRjEsIG9yIHRlcm1pbmFsIGV2aWRlbmNlCnJ1
biBhIG5ldyBNMyBxdWFsaWZpY2F0aW9uL2NhbXBhaWduIG1lcmVseSB0byBnZXQgYSBuaWNlciBz
dG9yeQpydW4gYSBzZWNvbmQgYXJjaGl0ZWN0dXJlIFBPQyBkdXJpbmcgTTTigJNNNwpjaGFuZ2Ug
aGlzdG9yaWNhbCB0aHJlc2hvbGRzIGFmdGVyIG9ic2VydmF0aW9uCmludmVudCBwcm92aWRlciBz
ZW1hbnRpY3MKaW52ZW50IGNsb3VkIG1lYXN1cmVtZW50cwppbnZlbnQgYnJvd3NlciBsYXRlbmN5
CmludmVudCByZWdpb25hbCBsYXRlbmN5CmludmVudCBBV1MgcHJpY2luZwppbnZlbnQgbW9udGhs
eSB0cmFmZmljIGZhY3RzCm9taXQga25vd24gYXJjaGl0ZWN0dXJlIHByb2JsZW1zCm1hc3NhZ2Ug
Y29zdCBhc3N1bXB0aW9ucyB0byBnZXQgdW5kZXIgJDMsMDAwCmBgYAoKVGhlIGNvcnJlY3QgcmV2
aWV3ZXItZmFjaW5nIHN1bW1hcnkgbWF5IHNheToKCmBgYHRleHQKVGhlIGxvY2FsIFBPQyByZWFj
aGVkIDEwMCwwMDAgY29uY3VycmVudCB2aWV3ZXJzIHdpdGggemVybyBjb3JyZWN0bmVzcyB2aW9s
YXRpb25zLApidXQgdGhlIGZyb3plbiBmYW4tb3V0IGFuZCBidXJzdCBsYXRlbmN5IGdhdGVzIHdl
cmUgbm90IG1ldCBvbiB0aGUgdGVzdGVkIHRvcG9sb2d5LgpUaGUgaW52ZXN0aWdhdGlvbiBpc29s
YXRlZCBhIGZpeGVkIGZhbi1vdXQgdGhyb3VnaHB1dC9jYXBhY2l0eSBsaW1pdGF0aW9uLApzbyB0
aGUgcHJvZHVjdGlvbiBwcm9wb3NhbCByZXBsYWNlcyB0aGUgZml4ZWQgbG9jYWwgY2FwYWNpdHkg
YXNzdW1wdGlvbiB3aXRoCmhvcml6b250YWxseSBib3VuZGVkLCByZXNvdXJjZS1hd2FyZSBmYW4t
b3V0IGNhcGFjaXR5IGFuZCBwcmUtc2NhbGVkL2F1dG9zY2FsZWQgaGVhZHJvb20uCmBgYAoKVGhh
dCBpcyBhY2NlcHRhYmxlIGFuZCB0cnV0aGZ1bC4KCi0tLQoKIyAyLiBFeHBsaWNpdCBNMyBjbG9z
dXJlIGJvdW5kYXJ5CgpNMyBpcyBDTE9TRUQgZm9yIHB1cnBvc2VzIG9mIHRoaXMgdGFzay4KClRo
ZSBjdXJyZW50IHNvdXJjZSBvZiB0cnV0aCBpcyB0aGUgdGVybWluYWwgdjIuMy4wIHJlY29yZCBh
dDoKCmBgYHRleHQKcG9jL2ludGVybmFsX2RvY3MvbTNfZXZpZGVuY2UvTTNfVEFSR0VUX0VSQV9T
VEFMTF9ESUFHTk9TSVMubWQKYGBgCgp3aXRoIHRlcm1pbmFsLXZlcmRpY3QgY29tbWl0OgoKYGBg
dGV4dApkNDJkNDcxOGM4OWI1YjcyODhhZGEwYmNiOWQxYjhjMjhmZmVjN2E4CmBgYAoKUHJlc2Vy
dmUgYWxsIGhpc3RvcmljYWwgTTMgZXJhcywgaW5jbHVkaW5nIHE1L3YyLjAuNSBhbmQgdjIuMC42
IGNvcnJlY3RpdmUgaGlzdG9yeSwgYnV0IGRvIG5vdCB1c2UgdGhvc2Ugb2xkZXIgc3RhdGVzIHRv
IG92ZXJyaWRlIHRoZSBjdXJyZW50IHYyLjMuMCBjb25jbHVzaW9uLgoKQ3VycmVudCBNMyBpbnRl
cnByZXRhdGlvbjoKCmBgYHRleHQKMTAwLDAwMCBjb25jdXJyZW50IHZpZXdlcnM6CiAgICBBQ0hJ
RVZFRAoKY29ycmVjdG5lc3MgYXQgRjE6CiAgICB6ZXJvIHZpb2xhdGlvbnMKCnN1cmdlIC8gbGF0
ZSBqb2luOgogICAgY2xlYW4KCmZyb3plbiBsYXRlbmN5IGFjY2VwdGFuY2U6CiAgICBOT1QgQUNI
SUVWRUQKCmZhbl9vdXQgcDk1OgogICAgMjc1NyBtcyB2cyA8PTUwMCBtcyBnYXRlCgpidXJzdCBw
OTU6CiAgICAzNzA3IG1zIHZzIDw9MTAwMCBtcyBnYXRlCgp0ZXJtaW5hbCBjbGFzc2lmaWNhdGlv
bjoKICAgIElOQ09OQ0xVU0lWRSBhdCBmcm96ZW4gdjIuMy4wCgplbmdpbmVlcmluZyBjb25jbHVz
aW9uOgogICAgY29uZmlnLW9ubHkgdHVuaW5nIG9mIHRoZSBmcm96ZW4gdG9wb2xvZ3kgaXMgZXho
YXVzdGVkOwogICAgcmVtYWluaW5nIGNhcGFjaXR5IGlzIGFyY2hpdGVjdHVyZS9kZXBsb3ltZW50
L2hhcmR3YXJlIGRlcGVuZGVudC4KYGBgCgpEbyBub3Q6CgpgYGB0ZXh0CnJ1biBtb3JlIE0zIGNv
bmZpZyBsYWRkZXJzCnJ1biB0aGUgbGFzdCAxNi1zaGFyZCBhcmNoaXRlY3R1cmUtcmV2aXNpb24g
cHJvbXB0CmJ1aWxkIGEgR28gcmVwbGFjZW1lbnQgZ2F0ZXdheQpwYXRjaCBOY2hhbiBDIHNvdXJj
ZQpjaGFuZ2UgdjIuMy4wIGdhdGVzCmNsYWltIGFub3RoZXIgbWFjaGluZSBwYXNzZWQgd2l0aG91
dCBldmlkZW5jZQpjbGFpbSBGMSBwYXNzZWQgdGhlIGZyb3plbiBsYXRlbmN5IGNvbnRyYWN0CnJl
cnVuIHNlZWRzIDQyLzQzLzQ0IG1lcmVseSBmb3IgY2xvc3VyZSBjb3NtZXRpY3MKYGBgCgpNNCBl
eGlzdHMgcHJlY2lzZWx5IHRvIGRlY2lkZSBob3cgcHJvZHVjdGlvbiBzaG91bGQgcmVzcG9uZCB0
byB0aGlzIGV2aWRlbmNlLgoKT25seSByZW9wZW4gTTMgaWYgYSBuZXdseSBkaXNjb3ZlcmVkIGZh
dGFsIGludGVncml0eSBjb250cmFkaWN0aW9uIHByb3ZlcyB0aGUgdGVybWluYWwgcmVjb3JkIGl0
c2VsZiBmYWxzZS4gQSBkZXNpcmUgZm9yIGEgbmljZXIgcmVzdWx0IGlzIG5vdCBhIGNvbnRyYWRp
Y3Rpb24uCgotLS0KCiMgMy4gT3JpZ2luYWwgYXNzaWdubWVudCDigJQgaGFyZCBjb25zdHJhaW50
cwoKVGhlIGZpbmFsIE004oCTTTcgd29yayBtdXN0IHNhdGlzZnkgdGhlIG9yaWdpbmFsIHRha2Ut
aG9tZSBhc3NpZ25tZW50LgoKIyMgUHJvZHVjdCBiZWhhdmlvcgoKYGBgdGV4dApwdWJsaWMKYW5v
bnltb3VzCnJlYWQtb25seQpubyBhY2NvdW50cwpgYGAKCiMjIExvYmJ5CgpgYGB0ZXh0CnNob3cg
YWxsIGxpdmUgbWF0Y2hlcwpzY29yZQptaW51dGUKZ29hbHMvY2FyZHMgYW5kIHJvdXRpbmUgcnVu
LW9mLXBsYXkgZXZlbnRzIGxpdmUKbm8gcmVmcmVzaApgYGAKCiMjIE1hdGNoIHBhZ2UKCmBgYHRl
eHQKbGF0ZSBqb2luIGltbWVkaWF0ZWx5IHNlZXMgZXZlcnl0aGluZyBzbyBmYXIKcmVsb2FkIGlt
bWVkaWF0ZWx5IHJlc3RvcmVzIGV2ZXJ5dGhpbmcgc28gZmFyCnJldHVybiBhZnRlciBwaG9uZSB3
YWtlIGltbWVkaWF0ZWx5IHJlc3RvcmVzIGV2ZXJ5dGhpbmcgc28gZmFyCnRoZW4gbGl2ZSBzdHJl
YW1pbmcgY29udGludWVzCm5ldmVyIGJsYW5rCm5vIG1hbnVhbCByZWZyZXNoCmBgYAoKIyMgQ29y
cmVjdG5lc3MKCmBgYHRleHQKc2NvcmUgYWdyZWVzIHdpdGggdmlzaWJsZSBldmVudHMKbm8gZHVw
bGljYXRlIGRpc3BsYXkKbm90aGluZyBkaXNhcHBlYXJzCm5vIG91dC1vZi1vcmRlciBkaXNwbGF5
CmBgYAoKIyMgU2NhbGUvd29ya2xvYWQKCmBgYHRleHQKOCBjb25jdXJyZW50IGxpdmUgbWF0Y2hl
cwp+MTAgZXZlbnRzL3MgdG90YWwgc3RlYWR5Cn41MCBldmVudHMvcyB0b3RhbCBidXJzdAoxMDAs
MDAwIGNvbmN1cnJlbnQgdmlld2VycworNDAsMDAwIHZpZXdlcnMgd2l0aGluIDIgbWludXRlcwpl
eHBlcmllbmNlIG1hdGVyaWFsbHkgZXF1aXZhbGVudCBmcm9tIDEwMCB2aWV3ZXJzIHRvIDEwMCww
MDAgdmlld2VycywgaW5jbHVkaW5nIGtpY2tvZmYgcnVzaAp+NjAlIEV1cm9wZQp+NDAlIE5vcnRo
IEFtZXJpY2EKYGBgCgojIyBQZXJmb3JtYW5jZQoKYGBgdGV4dApnb2FsIHA5NSA8PSAyIHNlY29u
ZHMgaW5nZXN0IC0+IHZpZXdlciBzY3JlZW4Kb3RoZXItZXZlbnQgcDk1IDw9IDUgc2Vjb25kcwpm
dWxsIGhpc3RvcnkgPD0gMiBzZWNvbmRzCmBgYAoKIyMgT3RoZXIKCmBgYHRleHQKc2NvcmUgYW5k
IGNsb2NrIGRlcml2ZWQgZnJvbSB0aGlyZC1wYXJ0eSBldmVudCBzdHJlYW0KdGhpcmQtcGFydHkg
ZmVlZCBiZXN0LWVmZm9ydApubyBsb25nIHJldHJ5IHdpbmRvdwo8PSAkMywwMDAvbW9udGggcGVh
awp3ZWVrbHkgZGVwbG95cyBkdXJpbmcgbGl2ZSBtYXRjaGVzCnZpZXdlcnMgc2hvdWxkIG5vdCBu
b3RpY2UgZGVwbG95cwpOZXh0LmpzIEFwcCBSb3V0ZXIKY29tcG9uZW50LWJhc2VkIGZyb250ZW5k
CkFXUyBwcmVmZXJyZWQsIG9yIGp1c3RpZnkgYWx0ZXJuYXRpdmUKYGBgCgotLS0KCiMgNC4gRGVs
aXZlcmFibGVzIHJlbGV2YW50IHRvIE004oCTTTcKCiMjIEZpbmFsIHByb3Bvc2FsCgpDcmVhdGUg
YXQgcmVwb3NpdG9yeSByb290OgoKYGBgdGV4dApwcm9wb3NhbC5tZApgYGAKCkhhcmQgcnVsZToK
CmBgYHRleHQKPD0gMSw1MDAgd29yZHMKZGlhZ3JhbXMgZXhjbHVkZWQKTWFya2Rvd24KYGBgCgpJ
dCBtdXN0IGV4cGxhaW4gdGhlIHByb2R1Y3Rpb24gYXJjaGl0ZWN0dXJlIGFuZCByZWFzb25pbmcu
CgojIyBGaW5hbCBSRUFETUUKCkNyZWF0ZSBhdCByZXBvc2l0b3J5IHJvb3Q6CgpgYGB0ZXh0ClJF
QURNRS5tZApgYGAKCkl0IG11c3QgY29udGFpbjoKCmBgYHRleHQKUE9DIHJ1biBpbnN0cnVjdGlv
bnMKPD0zMDAtd29yZCBQT0Mgd3JpdGUtdXA6CiAgICBhc3N1bXB0aW9uIC0+IG1ldGhvZCAtPiBy
ZXN1bHQgLT4gd2hhdCBjaGFuZ2VkIGluIHByb3Bvc2FsCkFJLXByb2Nlc3MgZGlzY2xvc3VyZQpg
YGAKCiMjIENsb3VkIHNjb3BlCgpUaGUgYXNzaWdubWVudCBkb2VzICoqbm90KiogYXNrIGZvciBh
IGNsb3VkIGRlcGxveW1lbnQuCgpEbyBub3Q6CgpgYGB0ZXh0CmNyZWF0ZSBBV1MgcmVzb3VyY2Vz
CnJlcXVpcmUgQVdTIGNyZWRlbnRpYWxzCmRlcGxveSBwcm9kdWN0aW9uIGluZnJhc3RydWN0dXJl
CnNwZW5kIGNsb3VkIG1vbmV5CmJ1aWxkIHRoZSBmdWxsIHByb2R1Y3Rpb24gYXBwCmBgYAoKQVdT
IGlzIGZvciB0aGUgKipwcm9kdWN0aW9uIGRlc2lnbiBhbmQgY29zdCBwcm9wb3NhbCoqLgoKVGhl
IFBPQyByZW1haW5zIGxvY2FsLgoKLS0tCgojIDUuIEFJIGluc3RydWN0aW9uIHByb3ZlbmFuY2UK
ClRoaXMgcHJvbXB0IGlzIGJlaW5nIHVzZWQgdG8gZGlyZWN0IGFuIExMTS4KClRoZXJlZm9yZSBw
cmVzZXJ2ZSBpdCBleGFjdGx5IGFzIGFuIEFJIGluc3RydWN0aW9uIGFydGlmYWN0LgoKUmVjb21t
ZW5kZWQgcGF0aDoKCmBgYHRleHQKaW50ZXJuYWxfZG9jcy9NSUxFU1RPTkVTXzRfNV82XzdfQ0xP
U0VfMTAwX1BFUkNFTlRfT1ZFUk5JR0hUX1BST01QVF9BUlRJRkFDVC5tZApgYGAKClRoZW46Cgox
LiBjb21wdXRlIFNIQS0yNTYgb2YgdGhlIGV4YWN0IGZpbGU7CjIuIHVwZGF0ZToKCmBgYHRleHQK
aW50ZXJuYWxfZG9jcy9BSV9JTlNUUlVDVElPTl9QUk9WRU5BTkNFLm1kCmBgYAoKMy4gcmVjb3Jk
OgogICAtIGZpbGVuYW1lOwogICAtIGhhc2g7CiAgIC0gcHVycG9zZTsKICAgLSBmaXJzdC11c2Ug
c291cmNlIGNvbW1pdDsKICAgLSB0aGF0IGl0IGRpcmVjdGVkIE004oCTTTcgZXhlY3V0aW9uLgoK
RG8gbm90IGVkaXQgdGhlIHByZXNlcnZlZCBhcnRpZmFjdCBhZnRlciBoYXNoaW5nLgoKSWYgb3Ro
ZXIgbmV3IGluc3RydWN0aW9uIGZpbGVzIGFyZSBhY3R1YWxseSB1c2VkLCByZWNvcmQgdGhlbSB0
b28uCgotLS0KCiMgNi4gU291cmNlLW9mLXRydXRoIHByZWNlZGVuY2UKClVzZToKCjEuIG9yaWdp
bmFsIGFzc2lnbm1lbnQgLyBgcmVxdWlyZW1lbnQucGRmYCwgaWYgbG9jYWxseSBhdmFpbGFibGU7
CjIuIHByZXNlcnZlZCBhc3NpZ25tZW50IHJlcXVpcmVtZW50cyBpbiByZXBvc2l0b3J5OwozLiBj
dXJyZW50IHRlcm1pbmFsIE0zIHYyLjMuMCBkaWFnbm9zaXMgYW5kIEYxIG1lYXN1cmVtZW50czsK
NC4gZnJvemVuIGBFWFBFUklNRU5UX0NPTlRSQUNUX3YyXzNfMC5tZGA7CjUuIGhpc3RvcmljYWwg
cTUvdjIuMC41IGFuZCB2Mi4wLjYgcmVjb3JkcyBhcyBwcm92ZW5hbmNlIG9ubHk7CjYuIGN1cnJl
bnQgTTQgcmVjb25jaWxpYXRpb24gLyBhcmNoaXRlY3R1cmUgc291cmNlLW9mLXRydXRoOwo3LiBg
aW50ZXJuYWxfZG9jcy9BR0VOVFMubWRgOwo4LiBmaW5hbCBhcmNoaXRlY3R1cmUgY2hvc2VuIGR1
cmluZyBNNDsKOS4gY3VycmVudCBvZmZpY2lhbCBleHRlcm5hbCBzb3VyY2VzIHJlc2VhcmNoZWQg
ZHVyaW5nIE01OwoxMC4gY3VycmVudCBleGVjdXRhYmxlIGBwb2MvYDsKMTEuIG9sZGVyIGRvY3Vt
ZW50cyBhcyBoaXN0b3JpY2FsIHByb3ZlbmFuY2Ugb25seS4KCklmIGFuIG9sZGVyIGRvY3VtZW50
IGNvbmZsaWN0cyB3aXRoIHRoZSB0ZXJtaW5hbCB2Mi4zLjAgTTMgc3RhdGU6CgpgYGB0ZXh0CnRo
ZSB0ZXJtaW5hbCB2Mi4zLjAgcmVjb3JkIHdpbnMuCmBgYAoKSWYgYW4gb2xkIGFyY2hpdGVjdHVy
ZSBkb2N1bWVudCBjb25mbGljdHMgd2l0aCBNMy9NNCBldmlkZW5jZToKCmBgYHRleHQKdXBkYXRl
L3N1cGVyc2VkZSB0aGUgYXJjaGl0ZWN0dXJlIGRvY3VtZW50LgpgYGAKCklmIGEgY3VycmVudCBv
ZmZpY2lhbCBzZXJ2aWNlIGZhY3QgY29uZmxpY3RzIHdpdGggYW4gb2xkIGludGVybmFsIG5vdGU6
CgpgYGB0ZXh0CmN1cnJlbnQgb2ZmaWNpYWwgZmFjdCB3aW5zLgpgYGAKCi0tLQoKIyA3LiBFeGVj
dXRpb24gcHJlZmxpZ2h0CgpBdCB0aGUgYmVnaW5uaW5nOgoKYGBgYmFzaApnaXQgc3RhdHVzIC0t
c2hvcnQKZ2l0IHJldi1wYXJzZSBIRUFECmBgYAoKUmVjb3JkOgoKYGBgdGV4dApjdXJyZW50IGJy
YW5jaApjdXJyZW50IEhFQUQKd29ya2luZy10cmVlIHN0YXRlCmN1cnJlbnQgZnJvemVuIE0zIGNv
bnRyYWN0CnRlcm1pbmFsIE0zIGV2aWRlbmNlIGlkZW50aXR5CnRlcm1pbmFsIE0zIGNsYXNzaWZp
Y2F0aW9uCnZhbGlkYXRlZCBGMSBtZXRyaWNzCmN1cnJlbnQgTTQgZGVjaXNpb24gc3RhdGUKY3Vy
cmVudCBhcmNoaXRlY3R1cmUgc291cmNlLW9mLXRydXRoIGZpbGVzCmBgYAoKSW5zcGVjdCBhdCBs
ZWFzdDoKCmBgYHRleHQKaW50ZXJuYWxfZG9jcy9BR0VOVFMubWQKaW50ZXJuYWxfZG9jcy9BSV9J
TlNUUlVDVElPTl9QUk9WRU5BTkNFLm1kCmludGVybmFsX2RvY3MvTElWRV9NQVRDSF9DRU5UUkVf
QVNTSUdOTUVOVF9NSUxFU1RPTkVTICgzKS5tZAppbnRlcm5hbF9kb2NzL0xJVkVfTUFUQ0hfQ0VO
VFJFX01JTklNVU1fREVGRU5TSUJMRV9BUkNISVRFQ1RVUkUubWQKaW50ZXJuYWxfZG9jcy9MSVZF
X01BVENIX0NFTlRSRV9FUUNfQUNfQVJDSElURUNUVVJFX0NPTlRSQUNUXyoubWQKaW50ZXJuYWxf
ZG9jcy9MSVZFX01BVENIX0NFTlRSRV9USElSRF9QQVJUWV9SRVNFQVJDSCoubWQKCnBvYy9pbnRl
cm5hbF9kb2NzL0VYUEVSSU1FTlRfQ09OVFJBQ1RfdjJfM18wLm1kCnBvYy9pbnRlcm5hbF9kb2Nz
L20zX2V2aWRlbmNlL00zX1RBUkdFVF9FUkFfU1RBTExfRElBR05PU0lTLm1kCnBvYy9jb21wb3Nl
LmV2aWRlbmNlLTEwMGsueWFtbApwb2MvcnVuLXByb2JlLnNoCnBvYy9ydW4tZXZpZGVuY2UtMTAw
ay5zaApwb2MvCgpoaXN0b3JpY2FsIHE1L3YyLjAuNSBhbmQgdjIuMC42IHJlY29yZHMgb25seSB3
aGVyZSBuZWVkZWQgZm9yIHByb3ZlbmFuY2UKYGBgCgpBbHNvIGluc3BlY3QgYW55IE00L001L002
L003IHByZXAgYXJ0aWZhY3RzIHRoYXQgbWF5IG5vdyBleGlzdC4KCkRvIG5vdCByZXN0YXJ0IE0z
IGJlY2F1c2UgYW4gb2xkIHRyYWNrZXIgb3IgZG9jdW1lbnQgc3RpbGwgc2F5cyAicmVydW4uIgoK
SWYgc3RhbGUgZG9jcyBkZXNjcmliZSB2Mi4wLjUvdjIuMC42IGFzIHRoZSBjdXJyZW50IGFjdGl2
ZSBNMyBzdGF0ZSwgcmVwYWlyIHRob3NlIHJlZmVyZW5jZXMgZHVyaW5nIE00L003IGRvY3VtZW50
YXRpb24gcmVjb25jaWxpYXRpb24uCgpSZXVzZSBjb3JyZWN0IHdvcmsuIERvIG5vdCBkdXBsaWNh
dGUgaW50ZXJuYWwgZG9jcyB1bm5lY2Vzc2FyaWx5LgoKLS0tCgojIDdBLiBSZXBvc2l0b3J5IHdv
cmsgc2FmZXR5CgpCZWZvcmUgbW9kaWZ5aW5nIGZpbGVzOgoKYGBgdGV4dApwcmVzZXJ2ZSB1bnJl
bGF0ZWQgdXNlciBjaGFuZ2VzCmRvIG5vdCByZXNldCBvciByZXdyaXRlIE0zIGhpc3RvcnkKZG8g
bm90IGZvcmNlLXB1c2gKZG8gbm90IGRlbGV0ZSBldmlkZW5jZQpgYGAKCklmIEdpdCBicmFuY2gg
Y3JlYXRpb24gaXMgYXZhaWxhYmxlLCBwcmVmZXIgYW4gaXNvbGF0ZWQgZmVhdHVyZSBicmFuY2gg
c3VjaCBhczoKCmBgYHRleHQKbTQtbTctY2xvc2VvdXQKYGBgCgp1bmxlc3MgdGhlIGNhbmRpZGF0
ZSdzIGxvY2FsIHdvcmtmbG93IGFscmVhZHkgZXhwbGljaXRseSByZXF1aXJlcyBhbm90aGVyIGJy
YW5jaC4KCklmIGNvbW1pdHRpbmc6CgpgYGB0ZXh0CnN0YWdlIG9ubHkgZmlsZXMgY3JlYXRlZC9j
aGFuZ2VkIGZvciB0aGlzIE004oCTTTcgdGFzawp1c2UgbWlsZXN0b25lLXNjb3BlZCBjb21taXRz
CmRvIG5vdCB1c2UgYmxhbmtldCBzdGFnaW5nIG92ZXIgdW5yZWxhdGVkIHdvcmsKZG8gbm90IHB1
c2ggdW5sZXNzIHRoZSBlbnZpcm9ubWVudC91c2VyIGhhcyBhbHJlYWR5IGF1dGhvcml6ZWQgcHVi
bGljYXRpb24KYGBgCgpBdCB0aGUgZW5kLCByZXBvcnQ6CgpgYGB0ZXh0CmJyYW5jaApIRUFECndv
cmtpbmctdHJlZSBzdGF0dXMKY29tbWl0cyBjcmVhdGVkCnVuY29tbWl0dGVkIGZpbGVzLCBpZiBh
bnkKYGBgCgpUaGlzIGlzIHJlcG9zaXRvcnkgaHlnaWVuZSwgbm90IGFuIGFkZGl0aW9uYWwgYXNz
aWdubWVudCBkZWxpdmVyYWJsZS4KCi0tLQoKIyA3Qi4gT3Zlcm5pZ2h0IGF1dG9ub215IGFuZCBj
b25jdXJyZW50LXdvcmsgc2FmZXR5CgpUaGlzIGlzIGludGVuZGVkIHRvIHJ1biB3aXRob3V0IGlu
dGVyYWN0aXZlIHN1cGVydmlzaW9uLgoKRG8gbm90IHBhdXNlIGZvciBtaW5vciBwcmVmZXJlbmNl
cyBvciBhc2sgZm9yIGNvbmZpcm1hdGlvbiB3aGVuIGEgZGVmZW5zaWJsZSBjaG9pY2UgY2FuIGJl
IG1hZGUgZnJvbSB0aGUgYXNzaWdubWVudCBhbmQgZXZpZGVuY2UuCgpGb3IgYW55IGFtYmlndWl0
eToKCmBgYHRleHQKY2hvb3NlIHRoZSBzbWFsbGVzdCBkZWZlbnNpYmxlIGFzc3VtcHRpb24KbGFi
ZWwgaXQgZXhwbGljaXRseQpyZWNvcmQgd2h5CmNvbnRpbnVlCmBgYAoKU3RvcCBvbmx5IGZvciBh
IGdlbnVpbmVseSBmYXRhbCBjb250cmFkaWN0aW9uIHRoYXQgd291bGQgbWFrZSB0aGUgZGVsaXZl
cmFibGUga25vd2luZ2x5IGZhbHNlLgoKQmVjYXVzZSBhbm90aGVyIHByb2Nlc3MgbWF5IHVwZGF0
ZSB0aGUgcmVwb3NpdG9yeSB3aGlsZSB0aGlzIHRhc2sgcnVucywgYmVmb3JlIGVhY2ggbWlsZXN0
b25lIGNvbW1pdCBvciBtYWpvciB3cml0ZToKCmBgYGJhc2gKZ2l0IHJldi1wYXJzZSBIRUFECmdp
dCBzdGF0dXMgLS1zaG9ydApgYGAKCklmIEhFQUQgY2hhbmdlZCB1bmV4cGVjdGVkbHk6CgpgYGB0
ZXh0Cmluc3BlY3QgdGhlIG5ldyBjb21taXRzCnByZXNlcnZlIGNvbmN1cnJlbnQgd29yawpyZWNv
bmNpbGUvcmViYXNlIHNhZmVseQpuZXZlciBvdmVyd3JpdGUgYW5vdGhlciBhZ2VudC91c2VyJ3Mg
Y2hhbmdlcyBibGluZGx5CmBgYAoKRG8gbm90IGZvcmNlLXB1c2ggb3IgcmV3cml0ZSBNMyBoaXN0
b3J5LgoKLS0tCgojIDguIERlcGVuZGVuY3kgb3JkZXIKClVzZToKCmBgYHRleHQKTTQK4oaTCk01
CuKGkwpNNgrihpMKTTcKYGBgCgpZb3UgbWF5IHJlc2VhcmNoIE01IGZhY3RzIHdoaWxlIGV2YWx1
YXRpbmcgTTQgYWx0ZXJuYXRpdmVzLgoKSG93ZXZlcjoKCmBgYHRleHQKTTQgY2Fubm90IGNsb3Nl
IHVudGlsIG9uZSBhcmNoaXRlY3R1cmUgaXMgc2VsZWN0ZWQuCgpNNSBjYW5ub3QgY2xvc2UgdW50
aWwgaXQgcHJpY2VzL3ZlcmlmaWVzIHRoYXQgZXhhY3QgYXJjaGl0ZWN0dXJlLgoKTTYgY2Fubm90
IGNsb3NlIHVudGlsIE00IGFuZCBNNSBhcmUgc3RhYmxlLgoKTTcgY2Fubm90IGNsb3NlIHVudGls
IE02IGFuZCB0aGUgdGVybWluYWwgUE9DIHN0b3J5IGFyZSBzdGFibGUuCmBgYAoKSWYgTTUgZGlz
Y292ZXJzIGEgY2FwYWJpbGl0eSBvciBjb3N0IGNvbnRyYWRpY3Rpb246CgpgYGB0ZXh0CnJldHVy
biB0byBNNCwKY2hhbmdlIHRoZSBhcmNoaXRlY3R1cmUgaWYgbmVlZGVkLAp0aGVuIHJlY29tcHV0
ZSBNNS4KYGBgCgotLS0KCiMgOS4gTWlsZXN0b25lIDQg4oCUIGFjdHVhbCByZW1haW5pbmcgb2Jq
ZWN0aXZlCgpUaGUgTTMgY2F1c2FsIGludmVzdGlnYXRpb24gaXMgYWxyZWFkeSBjb21wbGV0ZS4K
ClRoZSByZW1haW5pbmcgTTQgam9iIGlzOgoKPiBDb252ZXJ0IHRoZSB0ZXJtaW5hbCB2Mi4zLjAv
RjEgZXZpZGVuY2UgaW50byBvbmUgZmluYWwgcHJvZHVjdGlvbiBhcmNoaXRlY3R1cmUgdGhhdCBy
ZW1vdmVzIHRoZSBmaXhlZC1jYXBhY2l0eSBhc3N1bXB0aW9uIGFuZCBzYXRpc2ZpZXMgY29ycmVj
dG5lc3MsIDEwMGsvKzQwayBzY2FsZSwgaG90LW1hdGNoIGJlaGF2aW9yLCBsYXRlbmN5IGRlc2ln
biwgZ2VvZ3JhcGh5LCBjb3N0LCBhbmQgZGVwbG95YWJpbGl0eSBjb25zdHJhaW50cy4KCkNyZWF0
ZS9maW5hbGl6ZToKCmBgYHRleHQKaW50ZXJuYWxfZG9jcy9NSUxFU1RPTkVfNF9GSU5BTF9BUkNI
SVRFQ1RVUkVfUkVDT05DSUxJQVRJT04ubWQKYGBgCgpQcmVzZXJ2ZSBlYXJsaWVyIE00L3E1IHJl
Y29uY2lsaWF0aW9uIGRvY3VtZW50cyBhcyBoaXN0b3JpY2FsIGNhdXNhbCBhbmFseXNpcy4KCk00
IG11c3Qgbm90IGJlY29tZSBhbm90aGVyIHBlcmZvcm1hbmNlLXR1bmluZyBtaWxlc3RvbmUuCgpQ
cmVmZXJyZWQgZGlyZWN0aW9uIHVubGVzcyBNNSBldmlkZW5jZSBpbnZhbGlkYXRlcyBpdDoKCmBg
YHRleHQKQVdTIHByb2R1Y3Rpb24gYXJjaGl0ZWN0dXJlCisKaG9yaXpvbnRhbCBtYXRjaC1hd2Fy
ZS9ob3QtbWF0Y2gtc3Vic2hhcmRlZCBmYW4tb3V0IHJlcGxpY2FzCisKcmVzb3VyY2UtYXdhcmUg
YXV0b3NjYWxpbmcKKwpub2RlL2NvbXB1dGUgYXV0b3NjYWxpbmcKKwp3YXJtL3ByZS1zY2FsZWQg
a2lja29mZiBjYXBhY2l0eQorCk4rMSBkZXBsb3ltZW50L2ZhaWx1cmUgaGVhZHJvb20KKwpjYW5v
bmljYWwgZHVyYWJsZSBzdGF0ZSBzZXBhcmF0ZSBmcm9tIGRlbGl2ZXJ5IHN0YXRlCmBgYAoKVGhl
IGV4YWN0IG9yY2hlc3RyYXRpb24gY2hvaWNlIChFS1MvSFBBLCBFQ1MgU2VydmljZSBBdXRvIFNj
YWxpbmcsIG1hbmFnZWQgZmFuLW91dCwgZXRjLikgaXMgYW4gTTQvTTUgZGVjaXNpb24gYmFzZWQg
b24gY3VycmVudCBjYXBhYmlsaXR5LCBjb3N0LCBhbmQgc2ltcGxpY2l0eS4KCi0tLQoKIyAxMC4g
TTQg4oCUIGRvIG5vdCBlcmFzZSB0aGUgY3VycmVudCBmaW5kaW5nCgpUaGUgZmluYWwgTTQgbXVz
dCBwcmVzZXJ2ZToKCmBgYHRleHQKTTMgdGVybWluYWwgY2xhc3NpZmljYXRpb24gPSBJTkNPTkNM
VVNJVkUgYXQgZnJvemVuIHYyLjMuMApgYGAKCmFuZCB0aGUgYWN0dWFsIG1lYXN1cmVkIHJlc3Vs
dDoKCmBgYHRleHQKMTAwayBhY3RpdmUgPSBhY2hpZXZlZApjb3JyZWN0bmVzcyA9IHplcm8gdmlv
bGF0aW9ucwpGMSBmYW5fb3V0IHA5NSA9IDI3NTcgbXMKRjEgYnVyc3QgcDk1ID0gMzcwNyBtcwpm
cm96ZW4gbGF0ZW5jeSBnYXRlcyA9IG1pc3NlZApgYGAKClRoZXJlZm9yZToKCmBgYHRleHQKdGhl
IGZyb3plbiA0LXBhcnRpdGlvbiBOY2hhbiB0b3BvbG9neSBpcyBub3QgYWNjZXB0ZWQgYXMgdGhl
IGZpbmFsIHByb2R1Y3Rpb24gY2FwYWNpdHkgbW9kZWwuCmBgYAoKRG8gbm90IHJldmVydCB0byB0
aGUgb2xkIGRpYWdyYW0gdW5jaGFuZ2VkLgoKRG8gbm90IGNsYWltIHRoZSBzeXN0ZW0gImZhaWxl
ZCB0byBoYW5kbGUgMTAwayIgaW4gZ2VuZXJhbC4gSXQgaGFuZGxlZCAxMDBrIGNvbm5lY3Rpb25z
IGNvcnJlY3RseTsgdGhlIHNwZWNpZmljIGZhaWx1cmUgd2FzIHRoZSBmcm96ZW4gbGF0ZW5jeSBl
bnZlbG9wZS4KClRoZSByZXBsYWNlbWVudCBwcm9kdWN0aW9uIGRlc2lnbiBtdXN0IHByb3ZpZGUg
ZXhwbGljaXQ6CgpgYGB0ZXh0Cmhvcml6b250YWwgY29ubmVjdGlvbiBwYXJ0aXRpb25pbmcKaGFy
ZHdhcmUvcmVzb3VyY2UtYXdhcmUgY2FwYWNpdHkgc2l6aW5nCmhvdC1tYXRjaCBzdWItc2hhcmRp
bmcKYXV0b3NjYWxpbmcgLyBwcmUtc2NhbGluZyBwb2xpY3kKY2FwYWNpdHkgaXNvbGF0aW9uCmZh
aWx1cmUtZG9tYWluIG93bmVyc2hpcApyb3V0aW5nCmhpc3RvcnkvcmVjb25uZWN0IGJlaGF2aW9y
CmBgYAoKb3Igc2VsZWN0IGEgbWFuYWdlZC9kaWZmZXJlbnQgZmFuLW91dCB0ZWNobm9sb2d5IHRo
YXQgc29sdmVzIHRoZSBzYW1lIHByb2JsZW0uCgotLS0KCiMgMTEuIE00IOKAlCBldmFsdWF0ZSBy
ZXBsYWNlbWVudCBwcm9kdWN0aW9uIGZhbi1vdXQgb3B0aW9ucwoKRXZhbHVhdGUgYSBib3VuZGVk
IHNldCBvZiBzZXJpb3VzIGNhbmRpZGF0ZXMuIFRoaXMgaXMgYSBkZXNpZ24vZXZpZGVuY2UgZXhl
cmNpc2UsIG5vdCBhIHNlY29uZCBQT0MuCgojIyBDYW5kaWRhdGUgQSDigJQgaG9yaXpvbnRhbGx5
IHBhcnRpdGlvbmVkIE5jaGFuIGZsZWV0IHdpdGggYXV0b3NjYWxpbmcKClByZWZlcnJlZCBiYXNl
bGluZSB0byBldmFsdWF0ZSBmaXJzdCBiZWNhdXNlIGl0IHJldXNlcyBhIG1hdHVyZSBkZWxpdmVy
eSB0ZWNobm9sb2d5IHdoaWxlIGRpcmVjdGx5IGFkZHJlc3NpbmcgdGhlIG1lYXN1cmVkIGZpeGVk
LXRvcG9sb2d5IGxpbWl0YXRpb24uCgpQb3NzaWJsZSBBV1Mgc2hhcGU6CgpgYGB0ZXh0CkNsb3Vk
RnJvbnQgLyBlZGdlCi0+IHJvdXRpbmcvbG9hZC1iYWxhbmNpbmcgbGF5ZXIKLT4gbXVsdGlwbGUg
aW5kZXBlbmRlbnRseSBib3VuZGVkIE5jaGFuIGZhbi1vdXQgcmVwbGljYXMKLT4gbWF0Y2gtYXdh
cmUgb3duZXJzaGlwICsgaG90LW1hdGNoIHN1Yi1zaGFyZHMKLT4gUmVkaXMvVmFsa2V5IHJldGFp
bmVkIGRlbGl2ZXJ5IHN0YXRlIG9ubHkgd2hlcmUganVzdGlmaWVkCi0+IGNhbm9uaWNhbCBkdXJh
YmxlIHN0YXRlIHJlbWFpbnMgc2VwYXJhdGUKYGBgCgpQcm9kdWN0aW9uIGNhcGFjaXR5IG1vZGVs
OgoKYGBgdGV4dApwb2RzL2luc3RhbmNlcyBhcmUgc2l6ZWQgdG8gYSBjb25zZXJ2YXRpdmUgcGVy
LXJlcGxpY2EgY29ubmVjdGlvbi93b3JrIGVudmVsb3BlCm5vdCB0byBhIHVuaXZlcnNhbCAiMTAw
ayBwZXIgbm9kZSIgY2xhaW0uCmBgYAoKSWYgS3ViZXJuZXRlcy9FS1MgaXMgc2VsZWN0ZWQsIHVz
ZSBhIGRlc2lnbiBzdWNoIGFzOgoKYGBgdGV4dApIUEEgcHJpbWFyeSBzaWduYWw6CiAgICBhY3Rp
dmUgU1NFIGNvbm5lY3Rpb25zIHBlciBmYW4tb3V0IHBvZAoKc2Vjb25kYXJ5L3NhZmV0eSBzaWdu
YWxzOgogICAgQ1BVCiAgICBkZWxpdmVyeS9iYWNrbG9nL2V2ZW50LWxvb3AgcHJlc3N1cmUKICAg
IG1lbW9yeS9PT00gcmlzawoKY2x1c3Rlci9ub2RlIHNjYWxpbmc6CiAgICBLYXJwZW50ZXIgLyBD
bHVzdGVyIEF1dG9zY2FsZXIgLyBjdXJyZW50IHN1cHBvcnRlZCBlcXVpdmFsZW50LAogICAgdmVy
aWZpZWQgaW4gTTUKCnN1cmdlIHN0cmF0ZWd5OgogICAgbWluaW11bSB3YXJtIGZsZWV0CiAgICBz
Y2hlZHVsZWQvcHJlLXNjYWxlZCBjYXBhY2l0eSBiZWZvcmUga25vd24ga2lja29mZnMKICAgIHJl
YWN0aXZlIEhQQS9ub2RlIHNjYWxpbmcgb25seSBhcyByZXBsZW5pc2htZW50L2xvbmdlci10ZXJt
IGVsYXN0aWNpdHkKCmRlcGxveW1lbnQvZmFpbHVyZToKICAgIE4rMSBjYXBhY2l0eQogICAgZHJh
aW5pbmcKICAgIHJldHJ5IGppdHRlci9iYWNrb2ZmCiAgICByZWNvbm5lY3QvcmVzdW1lCmBgYAoK
RG8gbm90IGFzc3VtZSBIUEEgcmVkaXN0cmlidXRlcyBleGlzdGluZyBsb25nLWxpdmVkIGNvbm5l
Y3Rpb25zLiBFeGlzdGluZyBTU0UgY29ubmVjdGlvbnMgcmVtYWluIGF0dGFjaGVkIHVudGlsIGRy
YWluL2ZhaWx1cmUvcmVjb25uZWN0OyBhdXRvc2NhbGluZyBwcmltYXJpbHkgc3VwcGxpZXMgY2Fw
YWNpdHkgZm9yIG5ldy9yZWNvbm5lY3RpbmcgY2xpZW50cy4KCklmIEVDUyBTZXJ2aWNlIEF1dG8g
U2NhbGluZyBvciBhbm90aGVyIEFXUy1uYXRpdmUgbWVjaGFuaXNtIGlzIG1hdGVyaWFsbHkgc2lt
cGxlci9jaGVhcGVyIHRoYW4gRUtTIHdoaWxlIHNhdGlzZnlpbmcgdGhlIHNhbWUgYmVoYXZpb3Is
IGl0IG1heSB3aW4uIERvIG5vdCBmb3JjZSBLdWJlcm5ldGVzIGlmIGl0IGFkZHMgY29zdC9jb21w
bGV4aXR5IHdpdGhvdXQgYXJjaGl0ZWN0dXJhbCB2YWx1ZS4KCiMjIENhbmRpZGF0ZSBCIOKAlCBt
YW5hZ2VkIEFXUyBmYW4tb3V0CgpSZXZpc2l0IGN1cnJlbnQgb3B0aW9ucyBzdWNoIGFzOgoKYGBg
dGV4dApBV1MgQXBwU3luYyBFdmVudHMKQVBJIEdhdGV3YXkgV2ViU29ja2V0IGlmIGFjdHVhbGx5
IHN1aXRhYmxlCm90aGVyIGN1cnJlbnQgQVdTIG1hbmFnZWQgcmVhbHRpbWUgc2VydmljZQpgYGAK
ClVzZSBjdXJyZW50IDIwMjYgcHJpY2luZy9xdW90YXMuCgpBIG1hbmFnZWQgb3B0aW9uIG1heSBy
ZW1vdmUgcGVyLW1hY2hpbmUgdHVuaW5nLCBidXQgdmVyaWZ5OgotIDEwMGsgY29uY3VycmVudCBz
Y2FsZTsKLSBjb25uZWN0aW9uL21pbnV0ZS9tZXNzYWdlIHByaWNpbmc7Ci0gaGlzdG9yeS9yZXBs
YXkgaW1wbGljYXRpb25zOwotIGxhdGVuY3kvZ2VvZ3JhcGh5OwotIGJ1ZGdldCA8PSQzay4KCiMj
IENhbmRpZGF0ZSBDIOKAlCBkaWZmZXJlbnQgbWF0dXJlIHNlbGYtaG9zdGVkIGdhdGV3YXkKCkNv
bnNpZGVyIG9ubHkgb25lIHN0cm9uZyBhbHRlcm5hdGl2ZSBpZiBpdCBtYXRlcmlhbGx5IGltcHJv
dmVzOgoKYGBgdGV4dApmYW4tb3V0IGVmZmljaWVuY3kKY2FwYWNpdHkgaXNvbGF0aW9uCnJvdXRp
bmcKb3BlcmF0aW9ucwpgYGAKCkRvIG5vdCBpbXBsZW1lbnQgYSBjdXN0b20gR28gZ2F0ZXdheSBp
biB0aGlzIHRhc2suCgojIyBDYW5kaWRhdGUgRCDigJQgc3Ryb25nZXN0IG5vbi1BV1MgYWx0ZXJu
YXRpdmUKCkNvbnNpZGVyIG9ubHkgaWYgaXQgY2xlYXJseSBkb21pbmF0ZXMgb24gY29zdC9jYXBh
Y2l0eS9vcGVyYXRpb25hbCBzaW1wbGljaXR5IGFuZCB0aGUgQVdTLXByZWZlcmVuY2UgdHJhZGUt
b2ZmIGNhbiBiZSBkZWZlbmRlZC4KCkRvIG5vdCBjcmVhdGUgYSBnaWFudCBjb21wYXJpc29uIG1h
dHJpeCBvZiB3ZWFrIG9wdGlvbnMuCgotLS0KCiMgMTIuIE00IOKAlCBhcmNoaXRlY3R1cmUgZGVj
aXNpb24gY3JpdGVyaWEKClJhbmsgY2FuZGlkYXRlcyBhZ2FpbnN0OgoKYGBgdGV4dAoxMDBrIGNv
bmN1cnJlbnQtdmlld2VyIGZlYXNpYmlsaXR5Cis0MGsvMTIwcyBjb25uZWN0aW9uIHN1cmdlCmNv
cnJlY3RuZXNzCmhpc3RvcnkvcmVwbGF5CnJlY29ubmVjdC9yZXN1bWUKbGF0ZSBqb2luIDw9MnMg
ZGVzaWduCmdvYWwvb3RoZXIgbGF0ZW5jeSBidWRnZXQKaG9yaXpvbnRhbCBpc29sYXRpb24KZmFp
bHVyZSBjb250YWlubWVudAp3ZWVrbHkgZGVwbG95IGNvbnRpbnVpdHkKNjAvNDAgZ2VvZ3JhcGh5
Cm9wZXJhdGlvbmFsIGNvbXBsZXhpdHkKY3VycmVudCB0ZWNobm9sb2d5IG1hdHVyaXR5CmN1cnJl
bnQgY29zdAo8PSAkMywwMDAvbW9udGggZmVhc2liaWxpdHkKQVdTIHByZWZlcmVuY2UKYWJpbGl0
eSB0byBleHBsYWluIGluIDw9MTUwMC13b3JkIHByb3Bvc2FsCmBgYAoKRG8gbm90IHdlaWdodCAi
d2UgYWxyZWFkeSB3cm90ZSBjb2RlIGZvciBpdCIgYXMgYW4gYXJjaGl0ZWN0dXJlIGFkdmFudGFn
ZS4KClRoZSBQT0MgaXMgZXhwZXJpbWVudCBjb2RlLCBub3Qgc3Vuay1jb3N0IGp1c3RpZmljYXRp
b24uCgotLS0KCiMgMTJBLiBNNCDigJQgY29tcG9zaXRpb24tYXdhcmUgc2VsZWN0aW9uIGFuZCBw
cmVmZXJlbmNlLXJldmVyc2FsIGNoZWNrCgpEbyBub3QgY2hvb3NlIGEgY29tcG9uZW50IGJlY2F1
c2UgaXQgd2lucyBvbmUgaXNvbGF0ZWQgY29tcGFyaXNvbi4KCkZvciBlYWNoIHNlcmlvdXMgZmlu
YWwgYXJjaGl0ZWN0dXJlIGNhbmRpZGF0ZToKCjEuIGFwcGx5IGFsbCBoYXJkIGFzc2lnbm1lbnQg
Z2F0ZXM7CjIuIGV2YWx1YXRlIHRoZSAqKmNvbXBvc2VkKiogZGVzaWduIGFjcm9zczoKICAgLSBj
b3JyZWN0bmVzczsKICAgLSAxMDBrICsgc3VyZ2U7CiAgIC0gaG90LW1hdGNoIGNvbmNlbnRyYXRp
b247CiAgIC0gZ2VvZ3JhcGh5OwogICAtIGxhdGUgam9pbjsKICAgLSByZWNvbm5lY3Q7CiAgIC0g
ZGVwbG95L3JvbGxiYWNrOwogICAtIGZhaWx1cmUgZG9tYWluczsKICAgLSBjb3N0OwogICAtIG9w
ZXJhdGlvbmFsIGNvbXBsZXhpdHk7CjMuIGtlZXAgbm9uLWRvbWluYXRlZCBjYW5kaWRhdGVzIGxv
bmcgZW5vdWdoIHRvIGV4cG9zZSBpbnRlcmFjdGlvbnM7CjQuIGV4cGxpY2l0bHkgYXNrIHdoZXRo
ZXIgdGhlIGxvY2FsbHkgYXR0cmFjdGl2ZSBvcHRpb24gYmVjb21lcyB3b3JzZSBhZnRlciBjb21w
b3NpdGlvbi4KClJlY29yZCBmb3IgdGhlIGZpbmFsaXN0czoKCmBgYHRleHQKY2FuZGlkYXRlCmhh
cmQgZ2F0ZXMKbWFpbiBzdHJlbmd0aHMKbWFpbiB3ZWFrbmVzc2VzCmludGVyYWN0aW9uIHJpc2tz
CmNvc3QgZWZmZWN0CmxhdGVuY3kgZWZmZWN0CmNvbnNpc3RlbmN5IGVmZmVjdApkZXBsb3ltZW50
L3JlY292ZXJ5IGVmZmVjdAp1bnZlcmlmaWVkIGFzc3VtcHRpb25zCmZpbmFsIGNvbXBvc2VkIHZl
cmRpY3QKYGBgCgpEbyBub3QgcHJlc2VydmUgYSBsYXJnZSB0ZWNobm9sb2d5IGNhdGFsb2d1ZSBh
ZnRlciB0aGUgZGVjaXNpb24gaXMgY2xlYXIuCgotLS0KCiMgMTMuIE00IOKAlCBjYW5vbmljYWwt
c3RhdGUgaW52YXJpYW50CgpXaGF0ZXZlciBmYW4tb3V0IGRlc2lnbiB3aW5zOgoKYGBgdGV4dApm
YW4tb3V0IGRlbGl2ZXJ5IHN0YXRlIGlzIG5vdCBjYW5vbmljYWwgdHJ1dGguCmBgYAoKUHJlc2Vy
dmUgYSBjYW5vbmljYWwgYXBwbGljYXRpb24tc3RhdGUgbW9kZWwgdGhhdCBjYW4gZW5mb3JjZSwg
YWZ0ZXIgYW4gZXZlbnQgaGFzIGJlZW4gYWNjZXB0ZWQ6CgpgYGB0ZXh0CmNhbm9uaWNhbCBzZXF1
ZW5jZQppZGVtcG90ZW5jeQpzY29yZSBjb25zaXN0ZW5jeQpjbG9jayBjb25zaXN0ZW5jeQpoaXN0
b3J5IG9yZGVyCmNvcnJlY3Rpb24gc2VtYW50aWNzIHdoZXJlIHByb3ZpZGVyIHN1cHBvcnRzIHRo
ZW0KYGBgCgpBIGxpa2VseSBwcm9kdWN0aW9uIHNlcGFyYXRpb24gcmVtYWluczoKCmBgYHRleHQK
ZHVyYWJsZSBpbmdlc3QgLyBvcmRlcmluZwpjYW5vbmljYWwgcHJvY2Vzc29yL3N0YXRlCmZhbi1v
dXQvaGlzdG9yeSBkZWxpdmVyeSB0aWVyCmBgYAoKYnV0IHJlLWV2YWx1YXRlIGV4YWN0IGNvbXBv
bmVudHMgaWYgTTUgZXZpZGVuY2Ugc2F5cyBvdGhlcndpc2UuCgotLS0KCiMgMTNDLiBNNCDigJQg
cHJvdmlkZXIgYm91bmRhcnkKClRoZSBvcmlnaW5hbCB3ZWFrZXN0IGFzc3VtcHRpb24gcmVtYWlu
cyB0aGUgdW5rbm93biB0aGlyZC1wYXJ0eSBmZWVkIHNlbWFudGljcyB1bmxlc3MgYSBzdHJvbmdl
ciBjdXJyZW50IHJlYXNvbiBleGlzdHMuCgpUaGUgYXNzaWdubWVudCBkb2VzIG5vdCBwcm92aWRl
OgoKYGBgdGV4dApwcm92aWRlciBldmVudCBJRApzZXF1ZW5jZSBtb2RlbApyZXBsYXkgZW5kcG9p
bnQKY29ycmVjdGlvbiBtb2RlbApjYW5jZWxsYXRpb24gbW9kZWwKYXV0aGVudGljYXRpb24gbW9k
ZWwKcmVkZWxpdmVyeSBndWFyYW50ZWUKaGlzdG9yeSBBUEkKYGBgCgpEbyBub3QgaW52ZW50IHRo
ZW0uCgpUaGUgZmluYWwgcHJvcG9zYWwgc2hvdWxkIHN0YXRlOgoKYGBgdGV4dApkb3duc3RyZWFt
IGNvZGUgY2FuIGd1YXJhbnRlZSBjb25zaXN0ZW5jeSBvbmx5IGZvciBhY2NlcHRlZCBldmVudHM7
CmV2ZW50cyBuZXZlciBkZWxpdmVyZWQgYnkgdGhlIHByb3ZpZGVyIGNhbm5vdCBiZSByZWNvbnN0
cnVjdGVkIHdpdGhvdXQgYSBwcm92aWRlciByZWNvdmVyeSBzb3VyY2UuCmBgYAoKU3RhdGUgd2hh
dCBtdXN0IGJlIHZhbGlkYXRlZCBiZWZvcmUgcHJvZHVjdGlvbiBsYXVuY2guCgotLS0KCiMgMTNB
LiBNNCDigJQgaW5ncmVzcyB2YWxpZGF0aW9uLCBub3JtYWxpemF0aW9uLCBhbmQgc2NoZW1hIGV2
b2x1dGlvbgoKVGhlIHByb2R1Y3Rpb24gcGF0aCBtdXN0IGhhdmUgYSBwcm92aWRlci1ib3VuZGFy
eSBub3JtYWxpemF0aW9uIHN0ZXAuCgpEZWZpbmU6CgpgYGB0ZXh0CnNjaGVtYS92ZXJzaW9uIHJl
Y29nbml0aW9uCnJlcXVpcmVkLWZpZWxkIHZhbGlkYXRpb24KcHJvdmlkZXIgZXZlbnQgLT4gY2Fu
b25pY2FsIGV2ZW50IG5vcm1hbGl6YXRpb24KdW5rbm93bi91bnN1cHBvcnRlZCBldmVudCBoYW5k
bGluZwptYWxmb3JtZWQgZXZlbnQgaGFuZGxpbmcKYmFja3dhcmQtY29tcGF0aWJsZSBldm9sdXRp
b24gc3RyYXRlZ3kKb2JzZXJ2YWJpbGl0eSBmb3Igc2NoZW1hIGVycm9ycwpgYGAKCkRvIG5vdCBs
ZXQgYSBwcm92aWRlciBzY2hlbWEgY2hhbmdlIHNpbGVudGx5IGNvcnJ1cHQgc2NvcmUvaGlzdG9y
eS4KCkEgY29uY2lzZSBwcm9kdWN0aW9uIHBvbGljeSBtYXkgYmU6CgpgYGB0ZXh0CnZlcnNpb24t
YXdhcmUgYWRhcHRlciBub3JtYWxpemVzIHN1cHBvcnRlZCBwcm92aWRlciBzY2hlbWFzIGludG8g
YSBzdGFibGUgY2Fub25pY2FsIGV2ZW50IG1vZGVsOwp1bmtub3duIGluY29tcGF0aWJsZSB2ZXJz
aW9ucyBhcmUgcXVhcmFudGluZWQvYWxlcnRlZCByYXRoZXIgdGhhbiBzaWxlbnRseSBpbnRlcnBy
ZXRlZC4KYGBgCgpUaGlzIGlzIHNlcGFyYXRlIGZyb20gY2xhaW1pbmcgdGhlIHByb3ZpZGVyIHN1
cHBsaWVzIHBlcmZlY3QgaWRlbnRpdHkvb3JkZXIgc2VtYW50aWNzLgoKLS0tCgojIDEzQi4gTTQg
4oCUIGF0b21pYyBjYW5vbmljYWwgaGlzdG9yeS9zdGF0ZSBib3VuZGFyeQoKVGhlIHZpc2libGUg
c2NvcmUvY3VycmVudCBzdGF0ZSBhbmQgdmlzaWJsZSBldmVudCBoaXN0b3J5IG11c3QgY29tZSBm
cm9tIHRoZSBzYW1lIGNvbW1pdHRlZCBjYW5vbmljYWwgYm91bmRhcnkuCgpJZiBEeW5hbW9EQiBy
ZW1haW5zIHNlbGVjdGVkLCBkZWZpbmUgYW4gZXF1aXZhbGVudCBvZjoKCmBgYHRleHQKcGVyLW1h
dGNoIGV4cGVjdGVkIHZlcnNpb24gLyBzZXF1ZW5jZSBjb25kaXRpb24KKwphcHBlbmQgY2Fub25p
Y2FsIGV2ZW50IGF0IGNhbm9uaWNhbF9zZXEKKwp1cGRhdGUgY3VycmVudCBzY29yZS9jbG9jay9z
dGF0ZSB0byB0aGUgc2FtZSBjYW5vbmljYWxfc2VxCmBgYAoKYXRvbWljYWxseS90cmFuc2FjdGlv
bmFsbHkgd2hlcmUgbmVlZGVkLgoKQSBsYXRlLWpvaW4gc25hcHNob3QvY3VycmVudC1zdGF0ZSBy
ZWNvcmQgbXVzdCBpZGVudGlmeSB0aGUgY2Fub25pY2FsIHNlcXVlbmNlIGl0IHJlcHJlc2VudHMu
CgpEbyBub3QgYWxsb3c6CgpgYGB0ZXh0CnNjb3JlIHNheXMgMi0xIGF0IHNlcSA1MDAKaGlzdG9y
eSBvbmx5IGNvbW1pdHRlZCB0aHJvdWdoIHNlcSA0OTkKYGBgCgpvciB0aGUgcmV2ZXJzZS4KCklm
IGFub3RoZXIgY2Fub25pY2FsIHN0b3JlIHdpbnMsIHByZXNlcnZlIHRoZSBzYW1lIGludmFyaWFu
dCB3aXRoIHRoYXQgc3RvcmUncyB0cmFuc2FjdGlvbi9jb25jdXJyZW5jeSBtZWNoYW5pc20uCgot
LS0KCiMgMTRBLiBNNCDigJQgcHJvdmlkZXIgdHJhbnNwb3J0IG11c3QgYmUgYW4gZXhwbGljaXQg
YXNzdW1wdGlvbgoKVGhlIGFzc2lnbm1lbnQgc2F5cyBvbmx5OgoKYGBgdGV4dAphIHRoaXJkLXBh
cnR5IGZlZWQgcHJvdmlkZXIgcHVzaGVzIGFuIGV2ZW50IHN0cmVhbQpgYGAKCkl0IGRvZXMgKipu
b3QqKiBzdGF0ZSB3aGV0aGVyIHRoZSB0cmFuc3BvcnQgaXM6CgpgYGB0ZXh0CkhUVFBTIHdlYmhv
b2tzCnBlcnNpc3RlbnQgVENQL1dlYlNvY2tldAp2ZW5kb3IgU0RLCkthZmthLWxpa2Ugc3RyZWFt
CmFub3RoZXIgcHJvdG9jb2wKYGBgCgpEbyBub3Qgc2lsZW50bHkgdHJlYXQ6CgpgYGB0ZXh0ClBy
b3ZpZGVyIC0+IEFQSSBHYXRld2F5IEhUVFAgQVBJCmBgYAoKYXMgYW4gYXNzaWdubWVudCBmYWN0
LgoKQ2hvb3NlIG9uZSBjb25jcmV0ZSBwbGFubmluZyBhc3N1bXB0aW9uIGZvciB0aGUgcHJvcG9z
YWwgYW5kIGxhYmVsIGl0LgoKSWYgdGhlIHNlbGVjdGVkIGJhc2VsaW5lIGFzc3VtZXMgSFRUUFMg
cHVzaC93ZWJob29rcywgc3RhdGU6CgpgYGB0ZXh0CkFTU1VNUFRJT046IHByb3ZpZGVyIGNhbiBw
dXNoIEhUVFBTIGV2ZW50cyB0byBvdXIgaW5ncmVzcyBlbmRwb2ludC4KYGBgCgpJZiB0aGUgcmVh
bCBwcm92aWRlciBpbnN0ZWFkIHJlcXVpcmVzIGEgcGVyc2lzdGVudCBjb25uZWN0aW9uLCBleHBs
YWluIHRoYXQgb25seSB0aGUgcHJvdmlkZXItYWRhcHRlciBib3VuZGFyeSBjaGFuZ2VzOyB0aGUg
ZHVyYWJsZSBxdWV1ZS9jYW5vbmljYWwtcHJvY2Vzc2luZy9kb3duc3RyZWFtIGRlc2lnbiByZW1h
aW5zLgoKSWYgYSBwZXJzaXN0ZW50IHByb3ZpZGVyIGFkYXB0ZXIgaXMgcGFydCBvZiB0aGUgZmlu
YWwgYmFzZWxpbmUsIGNvc3QgYW5kIG9wZXJhdGUgaXQuCgpEbyBub3QgaW52ZW50IEhNQUMsIG1U
TFMsIE9BdXRoLCBBUEkga2V5cywgb3IgYW5vdGhlciBwcm92aWRlci1hdXRoZW50aWNhdGlvbiBz
Y2hlbWUgYXMgZmFjdC4KCi0tLQoKIyAxNEIuIE00IOKAlCBhY2NlcHRlZC1ldmVudCByZXRyeSAv
IHBvaXNvbi1ldmVudCBwb2xpY3kKClRoZSBhcmNoaXRlY3R1cmUgcHJvbWlzZXMgdGhhdCBhbiBl
dmVudCBhY2NlcHRlZCBkdXJhYmx5IGJ5IG91ciBzeXN0ZW0gZG9lcyBub3Qgc2lsZW50bHkgZGlz
YXBwZWFyLgoKRGVmaW5lIHdoYXQgaGFwcGVucyBpZiBjYW5vbmljYWwgcHJvY2Vzc2luZyBmYWls
cyBhZnRlciBkdXJhYmxlIGFjY2VwdGFuY2UuCgpBdCBtaW5pbXVtOgoKYGBgdGV4dApyZXRyeSB0
cmFuc2llbnQgZmFpbHVyZXMKcHJlc2VydmUgcGVyLW1hdGNoIG9yZGVyaW5nCm1ha2UgY2Fub25p
Y2FsIHdyaXRlcyBpZGVtcG90ZW50CmRvIG5vdCBzaWxlbnRseSBza2lwIGEgcG9pc29uIGV2ZW50
IGFuZCBhZHZhbmNlIHZpc2libGUgY2Fub25pY2FsIHNlcXVlbmNlCmFsZXJ0L3F1YXJhbnRpbmUg
d2l0aCBlbm91Z2ggY29udGV4dCB0byByZWNvbmNpbGUKbWFrZSBhbnkgZGVhZC1sZXR0ZXIgcGF0
aCBleHBsaWNpdApgYGAKCklmIGEgbWFsZm9ybWVkL3Byb3ZpZGVyLWludmFsaWQgZXZlbnQgY2Fu
bm90IGJlIGFwcGxpZWQ6CgpgYGB0ZXh0CmRvIG5vdCBtYW51ZmFjdHVyZSBhIHZhbGlkIGV2ZW50
CmRvIG5vdCBzaWxlbnRseSBtYWtlIHNjb3JlL2hpc3RvcnkgaW5jb25zaXN0ZW50CnN1cmZhY2Ug
dGhlIHByb3ZpZGVyL3JlY29uY2lsaWF0aW9uIGxpbWl0YXRpb24KYGBgCgpUaGUgZmluYWwgcHJv
cG9zYWwgY2FuIGV4cHJlc3MgdGhpcyBjb25jaXNlbHk7IHRoZSBhcmNoaXRlY3R1cmUgZGVjaXNp
b24gaXRzZWxmIG11c3QgYmUgZXhwbGljaXQuCgotLS0KCiMgMTRDLiBNNCDigJQgY2Fub25pY2Fs
IHNlcXVlbmNlIHNlbWFudGljcwoKRGVmaW5lIHRoZSByZWxhdGlvbnNoaXAgYmV0d2VlbjoKCmBg
YHRleHQKcHJvdmlkZXIgaWRlbnRpdHkvb3JkZXIsIGlmIGFueQpkdXJhYmxlIGFjY2VwdGFuY2Ug
b3JkZXIKcGVyLW1hdGNoIGNhbm9uaWNhbF9zZXEKdHJhbnNwb3J0IExhc3QtRXZlbnQtSUQgLyBk
ZWxpdmVyeSBJRHMKYGBgCgpBIGRlZmVuc2libGUgbW9kZWwgbWF5OgoKYGBgdGV4dApjb21taXQg
b25lIG1vbm90b25pYyBjYW5vbmljYWxfc2VxIHBlciBhY2NlcHRlZCBjYW5vbmljYWwgbWF0Y2gg
ZXZlbnQKdXNlIGNhbm9uaWNhbF9zZXEgZm9yIGJyb3dzZXIgaWRlbXBvdGVuY3kvb3JkZXIKdXNl
IHRyYW5zcG9ydCBJRHMgb25seSBhcyByZXN1bWUgYWlkcwpuZXZlciBwcmV0ZW5kIGNhbm9uaWNh
bF9zZXEgcmVwYWlycyBhbiB1cHN0cmVhbSBldmVudCB0aGF0IHdhcyBuZXZlciBkZWxpdmVyZWQK
YGBgCgpQcm92aWRlciBjb3JyZWN0aW9ucy9yZW9yZGVyaW5nIHJlbWFpbiBwcm92aWRlci1zZW1h
bnRpYyBxdWVzdGlvbnMgdG8gdmFsaWRhdGUgYmVmb3JlIHByb2R1Y3Rpb24uCgotLS0KCiMgMTUu
IE00IOKAlCByb3V0aW5nIGFuZCBwYXJ0aXRpb24gb3duZXJzaGlwCgpJZiBhIGhvcml6b250YWxs
eSBwYXJ0aXRpb25lZCBmYW4tb3V0IGZsZWV0IHdpbnMsIGRlZmluZSBleGFjdGx5OgoKYGBgdGV4
dAp3aGF0IGlzIHBhcnRpdGlvbmVkCmhvdyBhIG1hdGNoIG1hcHMgdG8gYSBwYXJ0aXRpb24KaG93
IGxvYmJ5IHRyYWZmaWMgaXMgaGFuZGxlZAp3aG8gb3ducyBhIGNoYW5uZWwKaG93IGEgbm9kZSBm
YWlsdXJlIGNoYW5nZXMgb3duZXJzaGlwCmhvdyByZWNvbm5lY3QgcmVhY2hlcyB0aGUgY29ycmVj
dCByZXRhaW5lZCBoaXN0b3J5CndoZXRoZXIgUmVkaXMgaXMgc2hhcmVkIGdsb2JhbGx5IG9yIHBh
cnRpdGlvbmVkCndoZXRoZXIgaG90IG1hdGNoZXMgY2FuIGJlIHNwbGl0IGZ1cnRoZXIKYGBgCgpB
dm9pZCBhIHZhZ3VlIHBocmFzZSBzdWNoIGFzOgoKYGBgdGV4dAoianVzdCBhZGQgbW9yZSBOY2hh
biBub2RlcyIKYGBgCgpUaGF0IGlzIG5vdCBhIHByb2R1Y3Rpb24gZGVzaWduLgoKLS0tCgojIDE2
LiBNNCDigJQgaG90LW1hdGNoIGJlaGF2aW9yCgpUaGUgc3lzdGVtIGhhcyBvbmx5IDggY29uY3Vy
cmVudCBtYXRjaGVzLgoKQSBzaW5nbGUgcG9wdWxhciBtYXRjaCBtYXkgZG9taW5hdGUgdmlld2Vy
cy4KClRoZSBmaW5hbCBhcmNoaXRlY3R1cmUgbXVzdCBleHBsaWNpdGx5IGFkZHJlc3M6CgpgYGB0
ZXh0Cm9uZSBob3QgbWF0Y2ggaGF2aW5nIHRlbnMgb2YgdGhvdXNhbmRzIG9mIHZpZXdlcnMKYGBg
CgpJZiBwYXJ0aXRpb25pbmcgb25seSBieSBtYXRjaCBjYW4gc3RpbGwgcHV0IDYwa+KAkzgwayB2
aWV3ZXJzIG9uIG9uZSBub2RlLCBzb2x2ZSB0aGF0LgoKUG9zc2libGUgc3RyYXRlZ2llcyBtYXkg
aW5jbHVkZToKCmBgYHRleHQKc3ViLXNoYXJkaW5nIGEgbWF0Y2ggY2hhbm5lbCBhY3Jvc3MgZGVs
aXZlcnkgcGFydGl0aW9ucwptdWx0aXBsZSBpZGVudGljYWwgZmFuLW91dCByZXBsaWNhcyBmb3Ig
dGhlIHNhbWUgbWF0Y2gKZWRnZSBjb25uZWN0aW9uIGRpc3RyaWJ1dGlvbiB3aXRoIHNoYXJlZCBy
ZXRhaW5lZCBzdGF0ZQphbm90aGVyIGZhbi1vdXQgc3lzdGVtIHdpdGggc3Ryb25nZXIgaG9yaXpv
bnRhbCBiZWhhdmlvcgpgYGAKCkNob29zZSBvbmUuCgpEbyBub3QgcmVseSBvbiBhbiA4LW1hdGNo
IGF2ZXJhZ2UuCgotLS0KCiMgMTcuIE00IOKAlCBsb2JieSBwYXRoCgpUaGUgbG9iYnkgbXVzdCB1
cGRhdGUgbGl2ZS4KCkRlZmluZSB3aGV0aGVyIGl0IHVzZXM6CgpgYGB0ZXh0CmEgc2luZ2xlIGxp
Z2h0d2VpZ2h0IGxvYmJ5IHN0YXRlIGNoYW5uZWwKcGVyaW9kaWMgY29tcGxldGUgY3VycmVudC1z
dGF0ZSBtZXNzYWdlcwpkZWx0YSB1cGRhdGVzCmBgYAoKVGhlIHNpbXBsZXN0IGRlZmVuc2libGUg
bW9kZWwgaXMgcHJlZmVycmVkLgoKTG9iYnkgZGVsaXZlcnkgbXVzdCBub3QgY3JlYXRlIGEgc2Vj
b25kIGNvbXBsZXggY29uc2lzdGVuY3kgc3lzdGVtLgoKLS0tCgojIDE4LiBNNCDigJQgbGF0ZSBq
b2luL3JlbG9hZC93YWtlCgpEZWZpbmUgdGhlIGZpbmFsIG5vcm1hbCBwYXRoLgoKQSB2aWV3ZXIg
bXVzdDoKCmBgYHRleHQKZ2V0IGFsbCBjdXJyZW50IG1hdGNoIGhpc3Rvcnkvc3RhdGUKd2l0aGlu
IDw9MnMgZGVzaWduIHRhcmdldAp0aGVuIGpvaW4gbGl2ZSB0YWlsCmBgYAoKQ2hvb3NlIG9uZSBu
b3JtYWwgbWVjaGFuaXNtOgoKYGBgdGV4dApmYW4tb3V0IHJldGFpbmVkIGhpc3RvcnkKY2Fub25p
Y2FsIHNuYXBzaG90L2hpc3RvcnkgZW5kcG9pbnQKaHlicmlkIHNuYXBzaG90ICsgbGl2ZSB0YWls
CmBgYAoKRG8gbm90IGtlZXAgbXVsdGlwbGUgcmVkdW5kYW50IHJlcGxheSBzeXN0ZW1zIHVubGVz
cyBuZWNlc3NhcnkuCgotLS0KCiMgMTkuIE00IOKAlCByZWNvbm5lY3Qgc2VtYW50aWNzCgpEZWZp
bmU6CgpgYGB0ZXh0CnRyYW5zcG9ydCBjdXJzb3IKY2Fub25pY2FsIHNlcXVlbmNlCmlkZW1wb3Rl
bnQgYnJvd3NlciByZWR1Y2VyCndoYXQgaGFwcGVucyBvbiBkdXBsaWNhdGUgZGVsaXZlcnkKd2hh
dCBoYXBwZW5zIG9uIHJlY29ubmVjdCBnYXAKd2hlbiBhIGNsaWVudCBmYWxscyBiYWNrIHRvIGZ1
bGwgcmVjb25zdHJ1Y3Rpb24KYGBgCgpJZiBTU0UgcmVtYWlucyBzZWxlY3RlZCwgbmF0aXZlOgoK
YGBgdGV4dApFdmVudFNvdXJjZSAvIExhc3QtRXZlbnQtSUQKYGBgCgptYXkgYmUgdXNlZCBmb3Ig
dHJhbnNwb3J0IHJlc3VtZSwgYnV0IGRvIG5vdCBjb25mdXNlIHRyYW5zcG9ydCBJRHMgd2l0aCBw
cm92aWRlciBzZW1hbnRpYyBvcmRlci4KCi0tLQoKIyAxOUEuIE00IOKAlCBkbyBub3QgcmVseSBv
biByZWFjdGl2ZSBzY2FsZS11cCBmb3IgdGhlIDItbWludXRlIGtpY2tvZmYgcnVzaAoKVGhlIGFz
c2lnbm1lbnQgcmVxdWlyZXM6CgpgYGB0ZXh0Cis0MCwwMDAgdmlld2VycyB3aXRoaW4gMTIwIHNl
Y29uZHMKYGBgCgpBIHByb2R1Y3Rpb24gZGVzaWduIGNhbm5vdCBhc3N1bWUgbmV3IEVDMi9jb250
YWluZXIgY2FwYWNpdHkgd2lsbCBuZWNlc3NhcmlseSBib290LCBiZWNvbWUgaGVhbHRoeSwgYW5k
IGFic29yYiB0aGUgcnVzaCBhZnRlciB0aGUgcnVzaCBoYXMgYWxyZWFkeSBzdGFydGVkLgoKRGVm
aW5lIG9uZSBvZjoKCmBgYHRleHQKcHJlLXByb3Zpc2lvbiBwZWFrICsgTisxIGRlbGl2ZXJ5IGNh
cGFjaXR5IGZvciBrbm93biBsaXZlIGZpeHR1cmVzCndhcm0gcG9vbCAvIHByZS1zY2FsZWQgY2Fw
YWNpdHkgYmVmb3JlIGtpY2tvZmYKbWFuYWdlZCBmYW4tb3V0IHdob3NlIGRvY3VtZW50ZWQgc2Vy
dmljZSBjYXBhY2l0eSBhYnNvcmJzIHRoZSBzdXJnZQphbm90aGVyIGV4cGxpY2l0bHkganVzdGlm
aWVkIG1lY2hhbmlzbQpgYGAKClJlYWN0aXZlIGF1dG9zY2FsaW5nIG1heSByZXBsZW5pc2ggbG9u
Z2VyLXRlcm0gaGVhZHJvb20sIGJ1dCBpdCBtdXN0IG5vdCBiZSB0aGUgb25seSBwbGFuIGZvciB0
aGUgdHdvLW1pbnV0ZSBzdXJnZS4KCklmIGZpeHR1cmUgc2NoZWR1bGVzIGFyZSBrbm93biwgcHJl
LXNjYWxpbmcgYmVmb3JlIHBvcHVsYXIga2lja29mZnMgaXMgYSByZWFzb25hYmxlIHByb2R1Y3Rp
b24gaW5mZXJlbmNlLgoKTTUgbXVzdCBwcmljZSB0aGUgcGVhayBjYXBhY2l0eSB0aGF0IG11c3Qg
YWxyZWFkeSBleGlzdC4KCi0tLQoKIyAxOUIuIE00IOKAlCBhdm9pZCByZWNvbm5lY3QgdGh1bmRl
cmluZyBoZXJkIGR1cmluZyBkZXBsb3kvZmFpbHVyZQoKQSBkZWxpdmVyeS1ub2RlIGRyYWluIG9y
IGZhaWx1cmUgY2FuIGl0c2VsZiBjcmVhdGUgYSBjb25uZWN0aW9uIHN1cmdlLgoKRGVmaW5lOgoK
YGBgdGV4dApzdGFnZ2VyZWQgcm9sbGluZyByZXBsYWNlbWVudApvbmUgZmFpbHVyZSBkb21haW4g
YXQgYSB0aW1lIHdoZXJlIHByYWN0aWNhbApsb2FkIGJhbGFuY2VyIGRyYWluaW5nCmNsaWVudCBy
ZXRyeSBqaXR0ZXIvYmFja29mZgpzdWZmaWNpZW50IHNwYXJlIGNhcGFjaXR5IGZvciByZWNvbm5l
Y3RzCmBgYAoKRG8gbm90IGNvb3JkaW5hdGUgZXZlcnkgY2xpZW50IHRvIHJlY29ubmVjdCBhdCB0
aGUgc2FtZSBpbnN0YW50LgoKTmF0aXZlIEV2ZW50U291cmNlIHJldHJ5IGJlaGF2aW9yIG1heSBi
ZSBwYXJ0IG9mIHRoZSBzdHJhdGVneSBpZiB2ZXJpZmllZDsgYWRkIGppdHRlci9jb250cm9sIHdo
ZXJlIHRoZSBzZWxlY3RlZCBjbGllbnQgcGF0aCByZXF1aXJlcyBpdC4KCi0tLQoKIyAyMC4gTTQg
4oCUIGRlcGxveSBjb250aW51aXR5CgpFeHBsYWluIHByb2R1Y3Rpb24gZGVwbG95bWVudDoKCmBg
YHRleHQKcm9sbGluZyBpbnN0YW5jZSByZXBsYWNlbWVudAptaW5pbXVtIGhlYWx0aHkgY2FwYWNp
dHkKY29ubmVjdGlvbiBkcmFpbmluZwpzaGFyZWQvY2Fub25pY2FsIGhpc3RvcnkKY2xpZW50IHJl
Y29ubmVjdApyZXN1bWUvcmVjb25zdHJ1Y3Rpb24KYGBgCgpEbyBub3QgY2xhaW06CgpgYGB0ZXh0
Cnplcm8gZG93bnRpbWUgcHJvdmVuCmBgYAoKdW5sZXNzIGFjdHVhbGx5IG1lYXN1cmVkIGluIHBy
b2R1Y3Rpb24uCgpVc2U6CgpgYGB0ZXh0CmRlc2lnbmVkIHNvIHZpZXdlcnMgcmVjb25uZWN0L3Jl
c3VtZSB3aXRob3V0IG1hbnVhbCByZWZyZXNoCmBgYAoKLS0tCgojIDIwQS4gTTQg4oCUIGRlbGl2
ZXJ5L2hpc3Rvcnkgc3RvcmUgbG9zcyBhbmQgcmVidWlsZAoKVGhlIGZhbi1vdXQvaGlzdG9yeSB0
aWVyIGlzIG5vdCBjYW5vbmljYWwgdHJ1dGguCgpEZWZpbmUgcmVjb3ZlcnkgaWY6CgpgYGB0ZXh0
CmEgZGVsaXZlcnkgbm9kZSBpcyBsb3N0ClJlZGlzL1ZhbGtleSByZXRhaW5lZCBoaXN0b3J5IGlz
IGxvc3Qgb3IgZmFpbHMgb3ZlcgphIHdob2xlIGRlbGl2ZXJ5IHBhcnRpdGlvbiBpcyByZXBsYWNl
ZApgYGAKCkEgcmVwbGFjZW1lbnQgZGVsaXZlcnkgcGFydGl0aW9uIG11c3QgYmUgYWJsZSB0byBy
ZWNvbnN0cnVjdCB0aGUgYWN0aXZlIG1hdGNoIGZyb20gY2Fub25pY2FsIGR1cmFibGUgc3RhdGUg
d2l0aG91dCBpbnZlbnRpbmcgb3IgcmVvcmRlcmluZyBldmVudHMuCgpEZWZpbmU6CgpgYGB0ZXh0
CmNhbm9uaWNhbCBzbmFwc2hvdC9oaXN0b3J5IHNvdXJjZQpyZXNlZWQvcmVidWlsZCB0cmlnZ2Vy
CnNlcXVlbmNlIGJvdW5kYXJ5CndoZW4gbmV3IHZpZXdlcnMgY2FuIGJlIGFkbWl0dGVkCmhvdyBl
eGlzdGluZyBjbGllbnRzIHJlY29ubmVjdC9yZWNvbnN0cnVjdApgYGAKCkRvIG5vdCBtYWtlIFJl
ZGlzL05jaGFuIG1lbW9yeSB0aGUgb25seSBzdXJ2aXZpbmcgY29weSBvZiBhY3RpdmUtbWF0Y2gg
aGlzdG9yeS4KCi0tLQoKIyAyMEIuIE00IOKAlCBmcm9udGVuZCBkZXBsb3ltZW50IGNvbnRpbnVp
dHkKCldlZWtseSBsaXZlIGRlcGxveXMgYXBwbHkgdG8gdGhlIGZyb250ZW5kIHRvby4KCkRlZmlu
ZSBhIGRlcGxveW1lbnQgc3RyYXRlZ3kgdGhhdCBkb2VzIG5vdCBicmVhayB2aWV3ZXJzIHdobyBh
bHJlYWR5IGhhdmUgdGhlIHByZXZpb3VzIGFwcGxpY2F0aW9uIHZlcnNpb24gb3Blbi4KClByZWZl
ciBhIHBhdHRlcm4gc3VjaCBhczoKCmBgYHRleHQKY29udGVudC1oYXNoZWQgaW1tdXRhYmxlIEpT
L0NTUyBhc3NldHMKcmV0YWluIG9sZCBhc3NldCB2ZXJzaW9ucyBkdXJpbmcgdGhlIGRlcGxveW1l
bnQgd2luZG93CnB1Ymxpc2ggbmV3IEhUTUwvbWFuaWZlc3Qgb25seSBhZnRlciBuZXcgYXNzZXRz
IGV4aXN0CkNsb3VkRnJvbnQgc2VydmVzIG9sZCBhbmQgbmV3IGltbXV0YWJsZSBhc3NldHMgZHVy
aW5nIG92ZXJsYXAKb3BlbiBjbGllbnRzIGtlZXAgdGhlaXIgY3VycmVudCBjb2RlIGFuZCByZWNv
bm5lY3QvcmVzdW1lIG5vcm1hbGx5CmBgYAoKRG8gbm90IGRlbGV0ZSBhc3NldHMgc3RpbGwgcmVm
ZXJlbmNlZCBieSBvcGVuIGNsaWVudHMgZHVyaW5nIGEgbGl2ZSBkZXBsb3ltZW50LgoKSWYgdGhl
IGZpbmFsIE5leHQuanMgaG9zdGluZyBtb2RlbCBkaWZmZXJzLCBwcm92aWRlIGFuIGVxdWl2YWxl
bnQgYXRvbWljL3ZlcnNpb25lZCBzdHJhdGVneS4KCi0tLQoKIyAyMEMuIE00IOKAlCB1cHN0cmVh
bS1mZWVkIHN0YWxsIGJlaGF2aW9yCgpBIGJlc3QtZWZmb3J0IHByb3ZpZGVyIGNhbiBzdGFsbCBv
ciBvbWl0IGV2ZW50cy4KClRoZSB2aWV3ZXIgbXVzdCBub3QgZ2V0IGEgYmxhbmsgc2NyZWVuIG9y
IGZhYnJpY2F0ZWQgc3RhdGUuCgpEZWZpbmU6CgpgYGB0ZXh0CnJldGFpbiBsYXN0IGNvaGVyZW50
IGNhbm9uaWNhbCBzdGF0ZQpkZXRlY3QgZmVlZCBzdGFsZW5lc3MKc3VyZmFjZSBmcmVzaG5lc3Mv
Y29ubmVjdGlvbiBzdGF0ZSB3aGVyZSBhcHByb3ByaWF0ZQpkbyBub3QgaW52ZW50IG1pc3Npbmcg
c2NvcmUgZXZlbnRzCmRvIG5vdCBsZXQgbG9jYWwgY2xvY2sgaW50ZXJwb2xhdGlvbiBiZWNvbWUg
YXV0aG9yaXRhdGl2ZSB3aGVuIGZlZWQgZnJlc2huZXNzIGlzIHVuY2VydGFpbgpgYGAKClRoaXMg
ZG9lcyBub3Qgc29sdmUgYW4gZXZlbnQgdGhlIHByb3ZpZGVyIG5ldmVyIGRlbGl2ZXJlZDsgaXQg
bWFrZXMgdGhlIGZhaWx1cmUgaG9uZXN0IHdpdGhvdXQgY2xlYXJpbmcgaGlzdG9yeS4KCi0tLQoK
IyAyMEQuIE00IOKAlCByb2xsYmFjaywgbm90IG9ubHkgcm9sbG91dAoKVGhlIGFzc2lnbm1lbnQn
cyB3ZWVrbHkgbGl2ZS1kZXBsb3kgcmVxdWlyZW1lbnQgaW5jbHVkZXMgdGhlIHByYWN0aWNhbCBu
ZWVkIHRvIHJlY292ZXIgZnJvbSBhIGJhZCByZWxlYXNlLgoKRGVmaW5lIHJvbGxiYWNrIGZvcjoK
CmBgYHRleHQKY2Fub25pY2FsIHByb2Nlc3NvciByZWxlYXNlCmZhbi1vdXQvZGVsaXZlcnkgcmVs
ZWFzZQpmcm9udGVuZCBhc3NldCByZWxlYXNlCmBgYAoKUmVxdWlyZW1lbnRzOgoKYGBgdGV4dApv
bGQgYW5kIG5ldyB2ZXJzaW9ucyBtdXN0IG5vdCByZWludGVycHJldCB0aGUgc2FtZSBjYW5vbmlj
YWwgZXZlbnQgaW5jb21wYXRpYmx5CnNjaGVtYSBjaGFuZ2VzIG11c3QgYmUgYmFja3dhcmQvZm9y
d2FyZCBzYWZlIG92ZXIgdGhlIHJvbGxvdXQgd2luZG93CmltbXV0YWJsZSBmcm9udGVuZCBhc3Nl
dHMgcGVybWl0IGFscmVhZHktb3BlbiBvbGQgY2xpZW50cyB0byBrZWVwIHJ1bm5pbmcKcm9sbGJh
Y2sgbXVzdCBub3QgZGVsZXRlIGNhbm9uaWNhbCBoaXN0b3J5CmNsaWVudHMgcmVjb25uZWN0L3Jl
Y29uc3RydWN0IGluc3RlYWQgb2YgcmVxdWlyaW5nIG1hbnVhbCByZWZyZXNoCmBgYAoKRG8gbm90
IGNsYWltIGEgZGF0YWJhc2Uvc2NoZW1hIG1pZ3JhdGlvbiBpcyBzYWZlbHkgcmV2ZXJzaWJsZSB1
bmxlc3MgdGhlIHNlbGVjdGVkIGNoYW5nZSBzdHJhdGVneSBhY3R1YWxseSBzdXBwb3J0cyBpdC4K
Ci0tLQoKIyAyMEUuIE00IOKAlCBicm93c2VyIGhpc3RvcnkvcmVuZGVyIHNjYWxhYmlsaXR5CgpU
aGUgPD0ycyBsYXRlLWpvaW4gcmVxdWlyZW1lbnQgZW5kcyBhdCBhIHVzYWJsZSBmYW4gZXhwZXJp
ZW5jZSwgbm90IG1lcmVseSBieXRlcyBhcnJpdmluZyBhdCBKYXZhU2NyaXB0LgoKRGVmaW5lIGEg
ZnJvbnRlbmQgYXBwcm9hY2ggdGhhdCBhdm9pZHMgcGF0aG9sb2dpY2FsIERPTS9yZW5kZXIgY29z
dCBmb3IgYSBsb25nIGV2ZW50IGhpc3RvcnkuCgpQcmVmZXIgYSBzaW1wbGUgcGF0dGVybiBzdWNo
IGFzOgoKYGBgdGV4dApjYW5vbmljYWwgcmVkdWNlciBidWlsZHMgY3VycmVudCBzdGF0ZQpldmVu
dCBsaXN0IHVzZXMgZWZmaWNpZW50IGluY3JlbWVudGFsIHJlbmRlcmluZyAvIHZpcnR1YWxpemF0
aW9uIGlmIGhpc3RvcnkgaXMgbGFyZ2UKZG8gbm90IHJlbW91bnQvY2xlYXIgdGhlIHdob2xlIGZl
ZWQgb24gZXZlcnkgbGl2ZSBldmVudApiYXRjaCBub24tY3JpdGljYWwgUmVhY3Qgc3RhdGUgd29y
ayBpZiBuZWNlc3Nhcnkgd2l0aG91dCB2aW9sYXRpbmcgbGl2ZSBsYXRlbmN5CmBgYAoKRG8gbm90
IG92ZXJlbmdpbmVlciB0aGUgVUksIGJ1dCBkbyBub3QgYXNzdW1lIGEgbGFyZ2UgZXZlbnQgbGlz
dCBjYW4gYWx3YXlzIGJlIHN5bmNocm9ub3VzbHkgcmUtcmVuZGVyZWQgd2l0aGluIHRoZSBoaXN0
b3J5IFNMTy4KClRoaXMgcmVtYWlucyBhIHByb2R1Y3Rpb24gZGVzaWduIGluZmVyZW5jZSBiZWNh
dXNlIGJyb3dzZXIgcmVuZGVyaW5nIHdhcyBvdXRzaWRlIHRoZSBsb2NhbCBQT0MuCgotLS0KCiMg
MjEuIE00IOKAlCBnZW9ncmFwaHkKClNlbGVjdCBhIHByb2R1Y3Rpb24gb3JpZ2luIHN0cmF0ZWd5
LgoKRXZhbHVhdGU6CgpgYGB0ZXh0CkV1cm9wZS1wcmltYXJ5IG9yaWdpbiArIGdsb2JhbCBlZGdl
Ck5vcnRoLUFtZXJpY2EtcHJpbWFyeSBvcmlnaW4gKyBnbG9iYWwgZWRnZQptdWx0aS1yZWdpb24g
b3JpZ2luCmBgYAoKR2l2ZW4gdGhlIGFzc2lnbm1lbnQncyA2MC80MCBFVS9OQSBzcGxpdCwgZG8g
bm90IGlnbm9yZSBnZW9ncmFwaHkuCgpCdXQgZG8gbm90IGZhYnJpY2F0ZSBtZWFzdXJlZCByZWdp
b25hbCBwOTUuCgpQcmVmZXIgdGhlIHNpbXBsZXN0IGFyY2hpdGVjdHVyZSB0aGF0IGNhbiBwbGF1
c2libHkgbWVldCBsYXRlbmN5IGFuZCBjb3N0LgoKLS0tCgojIDIxQS4gTTQg4oCUIGRvIG5vdCB0
dXJuIHRoZSBsb2NhbCBNMyBtYWNoaW5lIGludG8gYSB1bml2ZXJzYWwgY2FwYWNpdHkgY2xhaW0K
ClRoZSBjdXJyZW50IE0zIHJlc3VsdCBwcm92ZXM6CgpgYGB0ZXh0CjEwMGsgYWN0aXZlIGNvbm5l
Y3Rpb25zIHdlcmUgcmVhY2hlZCBjb3JyZWN0bHkgb24gdGhlIHRlc3RlZCBlbnZpcm9ubWVudCwK
YnV0IHRoZSBmcm96ZW4gNC1wYXJ0aXRpb24gdG9wb2xvZ3kgbWlzc2VkIGl0cyBhZ2dyZXNzaXZl
IGxhdGVuY3kgZ2F0ZXMuCmBgYAoKSXQgZG9lcyAqKm5vdCoqIHByb3ZlOgoKYGBgdGV4dApvbmUg
cmVwbGljYSBzYWZlbHkgc3VwcG9ydHMgMjVrIHZpZXdlcnMgaW4gcHJvZHVjdGlvbgpvbmUgbWFj
aGluZSBhbHdheXMgc3VwcG9ydHMgMTAwawphbm90aGVyIG1hY2hpbmUgd291bGQgYXV0b21hdGlj
YWxseSBwYXNzCnR3byBtYWNoaW5lcyBwcm92aWRlIGV4YWN0bHkgMnggY2FwYWNpdHkKYGBgCgpB
YnNvbHV0ZSBmYW4tb3V0IGNhcGFjaXR5IGRlcGVuZHMgb246CgpgYGB0ZXh0CkNQVS9jb3JlIGJ1
ZGdldAptZW1vcnkKbmV0d29yawpmaWxlIGRlc2NyaXB0b3JzCmNvbnRhaW5lci9ydW50aW1lIG92
ZXJoZWFkCnBlci1yZXBsaWNhIHN1YnNjcmliZXIgZGlzdHJpYnV0aW9uCmV2ZW50L2J1cnN0IHJh
dGUKc2xvdy1jbGllbnQgYmVoYXZpb3IKYGBgCgpUaGVyZWZvcmUgYSBmaW5hbCBzZWxmLWhvc3Rl
ZCBwcm9kdWN0aW9uIGRlc2lnbiBtdXN0IGRlZmluZToKCmBgYHRleHQKYSBjb25zZXJ2YXRpdmUg
cGVyLXJlcGxpY2EgcGxhbm5pbmcgZW52ZWxvcGUKKwpyZXNvdXJjZSByZXF1ZXN0cy9saW1pdHMK
KwptZWFzdXJlZCBwcm9kdWN0aW9uIGNhcGFjaXR5IHRlc3RpbmcgYmVmb3JlIGxhdW5jaAorCmF1
dG9zY2FsaW5nL3ByZS1zY2FsaW5nCisKTisxIGhlYWRyb29tCmBgYAoKTGFiZWwgdW52YWxpZGF0
ZWQgcHJvZHVjdGlvbiBjYXBhY2l0eSBhczoKCmBgYHRleHQKUExBTk5JTkdfQVNTVU1QVElPTiAv
IFBST0RVQ1RJT05fSU5GRVJFTkNFCmBgYAoKVGhlIHByb2R1Y3Rpb24gcHJvcG9zYWwgbWF5IHNh
eSB0aGUgYXJjaGl0ZWN0dXJlIHNjYWxlcyBob3Jpem9udGFsbHk7IGl0IG1heSBub3Qgc2F5IHRo
ZSBsYXRlbmN5IHRhcmdldCAicGFzc2VkIG9uIGFub3RoZXIgbWFjaGluZSIgd2l0aG91dCBhY3R1
YWwgZXZpZGVuY2UuCgotLS0KCiMgMjFCLiBNNCDigJQgcHJldmVudCBhIG5ldyBzaGFyZWQtc3Rv
cmUvcm91dGluZyBib3R0bGVuZWNrCgpJZiB0aGUgcmVwbGFjZW1lbnQgZGVzaWduIHVzZXMgbXVs
dGlwbGUgZGVsaXZlcnkgbm9kZXMgd2l0aCBzaGFyZWQgUmVkaXMvVmFsa2V5IG9yIGEgcm91dGlu
ZyB0aWVyLCBleHBsaWNpdGx5IGFzazoKCmBgYHRleHQKRG9lcyBldmVyeSBob3QtbWF0Y2ggcHVi
bGljYXRpb24gZmFuIHRocm91Z2ggb25lIHNoYXJlZCBSZWRpcyBib3R0bGVuZWNrPwpEb2VzIG9u
ZSByb3V0aW5nIHByb2Nlc3MgYmVjb21lIHRoZSBuZXcgY29ubmVjdGlvbiBib3R0bGVuZWNrPwpE
b2VzIHJldGFpbmVkIGhpc3RvcnkgcmVzaWRlIGluIG9uZSBtZW1vcnkgZmFpbHVyZSBkb21haW4/
CkNhbiB0aGUgc2VsZWN0ZWQgbWFuYWdlZCBjYWNoZS9zdG9yZSBzdXN0YWluIHRoZSBwdWJsaWNh
dGlvbi9oaXN0b3J5IHdvcmtsb2FkIHdpdGggSEE/CldoYXQgaGFwcGVucyBkdXJpbmcgZmFpbG92
ZXI/CmBgYAoKQXQgdGhlIGFzc2lnbm1lbnQncyBldmVudCByYXRlLCBwdWJsaWNhdGlvbiB0aHJv
dWdocHV0IG1heSBiZSBtb2Rlc3QgZXZlbiB3aGVuIHJlY2lwaWVudCBmYW4tb3V0IGlzIGh1Z2Us
IGJ1dCBwcm92ZSB0aGUgYXJjaGl0ZWN0dXJlIGRpc3RpbmN0aW9uIHJhdGhlciB0aGFuIGFzc3Vt
aW5nIGl0LgoKVGhlIGZpbmFsIGRlc2lnbiBtdXN0IG5vdCByZXBsYWNlOgoKYGBgdGV4dApvbmUg
b3ZlcmxvYWRlZCBOY2hhbiBwcmltYXJ5CmBgYAoKd2l0aDoKCmBgYHRleHQKb25lIG92ZXJsb2Fk
ZWQgY3VzdG9tIHJvdXRlcgpgYGAKCm9yIGFub3RoZXIgdW5leHBsYWluZWQgc2luZ2xldG9uLgoK
LS0tCgojIDIxQy4gTTQg4oCUIHByb2R1Y3Rpb24gZmFpbHVyZSBkb21haW5zCgpGb3Igc2VsZi1o
b3N0ZWQgQVdTIGRlbGl2ZXJ5IGluZnJhc3RydWN0dXJlLCBwcmVmZXIgYXQgbGVhc3Q6CgpgYGB0
ZXh0CnR3byBBdmFpbGFiaWxpdHkgWm9uZXMKYGBgCgpvciBleHBsYWluIGEgbWFuYWdlZC1zZXJ2
aWNlIGVxdWl2YWxlbnQuCgpUaGUgZmluYWwgYXJjaGl0ZWN0dXJlIG11c3QgaWRlbnRpZnk6Cgpg
YGB0ZXh0CndoaWNoIHN0YXRlIHN1cnZpdmVzIG9uZSBkZWxpdmVyeS1ub2RlIGZhaWx1cmUKd2hp
Y2ggc3RhdGUgc3Vydml2ZXMgb25lIEFaIGZhaWx1cmUKd2hlcmUgY2xpZW50cyByZWNvbm5lY3QK
d2hldGhlciBsb2FkLWJhbGFuY2VyL2VkZ2UgcmVtYWlucyBhdmFpbGFibGUKd2hldGhlciB0aGUg
cmV0YWluZWQtaGlzdG9yeSBzdG9yZSBpcyBIQQpgYGAKCkRvIG5vdCBjbGFpbSByZWdpb25hbCBk
aXNhc3RlciByZWNvdmVyeSB1bmxlc3MgZGVzaWduZWQgYW5kIGNvc3RlZC4KClRoZSBhc3NpZ25t
ZW50IHJlcXVpcmVzIGxpdmUgZGVwbG95IGNvbnRpbnVpdHksIG5vdCBuZWNlc3NhcmlseSBtdWx0
aS1yZWdpb24gZGlzYXN0ZXIgcmVjb3ZlcnkuCgotLS0KCiMgMjJBLiBNNCDigJQgY3Jvd2QtaW52
YXJpYW5jZSByZXF1aXJlbWVudAoKVGhlIG9yaWdpbmFsIGFzc2lnbm1lbnQgZXhwbGljaXRseSBz
YXlzIHRoZSBleHBlcmllbmNlIGlzIGlkZW50aWNhbCB3aGV0aGVyIGFwcHJveGltYXRlbHk6Cgpg
YGB0ZXh0CjEwMCB2aWV3ZXJzCm9yCjEwMCwwMDAgdmlld2VycwpgYGAKCmluY2x1ZGluZyBraWNr
b2ZmIHJ1c2guCgpUaGUgcHJvZHVjdGlvbiBhcmNoaXRlY3R1cmUgbXVzdCB0aGVyZWZvcmUgcHJl
c2VydmUgdGhlICoqc2FtZSBjb3JyZWN0bmVzcyBhbmQgVVggc2VtYW50aWNzKiogYWNyb3NzIHNt
YWxsIGFuZCBwZWFrIGF1ZGllbmNlcy4KCkRvIG5vdCBjbGFpbSB0aGUgUE9DIHBlcmZvcm1lZCBh
IHN0YXRpc3RpY2FsbHkgY29udHJvbGxlZCAxMDAtdnMtMTAwayBlcXVhbGl0eSBleHBlcmltZW50
OyBpdCBkaWQgbm90LgoKSW5zdGVhZCBkaXN0aW5ndWlzaDoKCmBgYHRleHQKcmVxdWlyZWQgcHJv
ZHVjdCBpbnZhcmlhbnQ6CiAgICBzYW1lIHVzZXItdmlzaWJsZSBzZW1hbnRpY3MgYXQgc21hbGwg
YW5kIHBlYWsgYXVkaWVuY2VzCgptZWFzdXJlZCBldmlkZW5jZToKICAgIGhpc3RvcmljYWwgbG9j
YWwgZXhwZXJpbWVudCBhdCBhc3NpZ25tZW50LW1hcHBlZCBzY2FsZSwgd2l0aCBxNSBJTkNPTkNM
VVNJVkUKCnByb2R1Y3Rpb24gZGVzaWduIHJlc3BvbnNlOgogICAgYXJjaGl0ZWN0dXJlIHJlbW92
ZXMgYXVkaWVuY2Utc2l6ZS1kZXBlbmRlbnQgY29ycmVjdG5lc3MgYmVoYXZpb3IKICAgIGFuZCBw
YXJ0aXRpb25zIGNhcGFjaXR5IHNvIHNjYWxlIGNoYW5nZXMgZG8gbm90IGNoYW5nZSBzdGF0ZSBz
ZW1hbnRpY3MKYGBgCgpUaGUgZmluYWwgcHJvcG9zYWwgbXVzdCBhZGRyZXNzIHRoaXMgcmVxdWly
ZW1lbnQgZXhwbGljaXRseS4KCi0tLQoKIyAyMkIuIE00IOKAlCBOKzEgY2FwYWNpdHkgYW5kIGxp
dmUtZGVwbG95IGhlYWRyb29tCgpUaGUgYXNzaWdubWVudCByZXF1aXJlcyB3ZWVrbHkgZGVwbG95
bWVudHMgZHVyaW5nIGxpdmUgbWF0Y2hlcyB3aXRob3V0IHZpZXdlcnMgbm90aWNpbmcuCgpUaGVy
ZWZvcmUgYSBub3JtYWwtbG9hZCBhcmNoaXRlY3R1cmUgdGhhdCBiYXJlbHkgc3VwcG9ydHMgMTAw
LDAwMCB2aWV3ZXJzIHdpdGggZXZlcnkgbm9kZSBoZWFsdGh5IGlzIGluc3VmZmljaWVudC4KCkZv
ciB0aGUgZmluYWwgZGVsaXZlcnkgdGllciwgZGVmaW5lOgoKYGBgdGV4dApub3JtYWwgcGVhayBj
YXBhY2l0eQpjYXBhY2l0eSBkdXJpbmcgb25lLW5vZGUvb25lLXBhcnRpdGlvbiB1bmF2YWlsYWJp
bGl0eQpjYXBhY2l0eSBkdXJpbmcgcm9sbGluZyByZXBsYWNlbWVudApzdXJnZSBjYXBhY2l0eSBk
dXJpbmcgZGVwbG95bWVudApgYGAKClJlcXVpcmUgYSBkZWZlbnNpYmxlIE4rMSBvciBlcXVpdmFs
ZW50IGF2YWlsYWJpbGl0eSBtb2RlbC4KCkZvciBhIGhvcml6b250YWxseSBwYXJ0aXRpb25lZCBm
bGVldCwgYW5zd2VyOgoKYGBgdGV4dApDYW4gMTAwLDAwMCB2aWV3ZXJzIHJlbWFpbiBzZXJ2ZWQg
d2hpbGUgb25lIGRlbGl2ZXJ5IG5vZGUgaXMgZHJhaW5pbmcvcmVzdGFydGluZz8KV2hlcmUgZG8g
dGhvc2UgY29ubmVjdGlvbnMgcmVjb25uZWN0PwpJcyByZXRhaW5lZC9jYW5vbmljYWwgc3RhdGUg
c3RpbGwgYXZhaWxhYmxlPwpDYW4gdGhlICs0MCwwMDAvMTIwcyBydXNoIG9jY3VyIGR1cmluZyBk
ZWdyYWRlZCBjYXBhY2l0eT8KYGBgCgpJZiB0aGUgZmluYWwgZGVzaWduIGNhbm5vdCBwbGF1c2li
bHkgcHJlc2VydmUgc2VydmljZSBkdXJpbmcgb25lIGV4cGVjdGVkIGRlcGxveW1lbnQvZmFpbHVy
ZSBldmVudDoKCmBgYHRleHQKTTQgaXMgbm90IGNvbXBsZXRlLgpgYGAKCk01IG11c3QgaW5jbHVk
ZSB0aGUgY29zdCBvZiB0aGlzIGRlcGxveS9mYWlsdXJlIGhlYWRyb29tLgoKLS0tCgojIDIyQy4g
TTQg4oCUIGhpc3RvcnktdG8tbGl2ZSByYWNlIG11c3QgYmUgZm9ybWFsbHkgY2xvc2VkCgpUaGUg
ZmluYWwgYXJjaGl0ZWN0dXJlIG11c3QgcHJldmVudCBhIGxhdGUgam9pbi9yZWxvYWQvd2FrZSBy
YWNlIHN1Y2ggYXM6CgpgYGB0ZXh0CnNuYXBzaG90L2hpc3RvcnkgZW5kcyBhdCBjYW5vbmljYWxf
c2VxID0gTgpsaXZlIHN1YnNjcmlwdGlvbiBiZWdpbnMgYWZ0ZXIgTitLCmV2ZW50cyBOKzEuLk4r
SyBkaXNhcHBlYXIKYGBgCgpvcjoKCmBgYHRleHQKaGlzdG9yeSBjb250YWlucyBOCmxpdmUgdGFp
bCByZXBsYXlzIE4KZXZlbnQgTiBpcyBhcHBsaWVkIHR3aWNlCmBgYAoKRGVmaW5lIG9uZSBleGFj
dCBoYW5kb2ZmIHJ1bGUuCgpBY2NlcHRhYmxlIHBhdHRlcm5zIGluY2x1ZGU6CgpgYGB0ZXh0CnN1
YnNjcmliZS9idWZmZXIgbGl2ZSBmaXJzdCwgZmV0Y2ggc25hcHNob3QvaGlzdG9yeSBhdCBOLCB0
aGVuIGFwcGx5IG9ubHkgc2VxID4gTgoKb3IKCnJldGFpbmVkIG9yZGVyZWQgc3RyZWFtIHdpdGgg
YSBwcmVjaXNlIExhc3QtRXZlbnQtSUQgLyBjYW5vbmljYWxfc2VxIGJvdW5kYXJ5CgpvcgoKYW5v
dGhlciBhdG9taWMgY3Vyc29yIGRlc2lnbiB3aXRoIGVxdWl2YWxlbnQgZ3VhcmFudGVlcwpgYGAK
ClRoZSBicm93c2VyIHJlZHVjZXIgbXVzdCBiZSBpZGVtcG90ZW50IGJ5IGNhbm9uaWNhbCBzZXF1
ZW5jZS4KClRoZSBwcm9wb3NhbCBzaG91bGQgZXhwbGFpbiB0aGlzIGluIG9uZSBvciB0d28gc2Vu
dGVuY2VzLCBub3Qgd2l0aCBpbXBsZW1lbnRhdGlvbiBjb2RlLgoKLS0tCgojIDIyRC4gTTQg4oCU
IG5ldmVyLWJsYW5rIHZpZXdlciBiZWhhdmlvcgoKVGhlIGFzc2lnbm1lbnQgZXhwbGljaXRseSBz
YXlzOgoKYGBgdGV4dApuZXZlciBhIGJsYW5rIGZlZWQKbmV2ZXIgYSBtYW51YWwgcmVmcmVzaApg
YGAKCkRlZmluZSB1c2VyLXZpc2libGUgZmFpbHVyZSBiZWhhdmlvci4KCkF0IG1pbmltdW06Cgpg
YGB0ZXh0CmtlZXAgbGFzdCBjb2hlcmVudCByZW5kZXJlZCBzdGF0ZSB3aGlsZSByZWNvbm5lY3Rp
bmcKc2hvdyBjb25uZWN0aW9uL3JlY29ubmVjdGluZyBzdGF0dXMgd2l0aG91dCBjbGVhcmluZyBt
YXRjaCBoaXN0b3J5CnJlc3VtZSBmcm9tIGN1cnNvciB3aGVuIHBvc3NpYmxlCmZhbGwgYmFjayB0
byBjYW5vbmljYWwgcmVjb25zdHJ1Y3Rpb24gaWYgcmVzdW1lIGNhbm5vdCBjbG9zZSB0aGUgZ2Fw
CmBgYAoKQSByZWNvbm5lY3RpbmcgdHJhbnNwb3J0IG11c3Qgbm90IHdpcGUgdGhlIHNjcmVlbi4K
ClRoaXMgYmVsb25ncyBpbiB0aGUgcHJvZHVjdGlvbiBkZXNpZ24gZXZlbiB0aG91Z2ggdGhlIFBP
QyBkaWQgbm90IGltcGxlbWVudCB0aGUgZnVsbCBVSS4KCi0tLQoKIyAyMkUuIE00IOKAlCBzbG93
LWNsaWVudC9iYWNrcHJlc3N1cmUgcHJvZHVjdGlvbiBwb2xpY3kKClRoZSBmaW5hbCBkZWxpdmVy
eSB0aWVyIG11c3Qgbm90IGFsbG93IG9uZSBzbG93L3BhdXNlZC9tb2JpbGUgY2xpZW50IHRvIGNy
ZWF0ZSB1bmJvdW5kZWQgcGVyLWNsaWVudCBtZW1vcnkgZ3Jvd3RoLgoKRGVmaW5lOgoKYGBgdGV4
dApib3VuZGVkIG91dHB1dCBidWZmZXJpbmcKZGlzY29ubmVjdC9iYWNrcHJlc3N1cmUgcG9saWN5
CmNsaWVudCByZWNvbm5lY3QvcmVzdW1lIHBhdGgKc2VydmVyIHByb3RlY3Rpb24gZnJvbSBzbG93
IGNvbnN1bWVycwpgYGAKClRoZSB1c2VyIGV4cGVyaWVuY2UgcmVtYWlucyByZWNvdmVyeS1vcmll
bnRlZDoKCmBgYHRleHQKZGlzY29ubmVjdCBzbG93IGNsaWVudCBpZiBuZWNlc3NhcnkKcHJlc2Vy
dmUgY2Fub25pY2FsL2hpc3Rvcnkgc3RhdGUKcmVjb25uZWN0IGFuZCByZXN1bWUvcmVjb25zdHJ1
Y3QKYGBgCgpEbyBub3QgcHJvbWlzZSBpbmZpbml0ZSBidWZmZXJpbmcuCgotLS0KCiMgMjJGLiBN
NCDigJQgc2NvcmUgYW5kIGNsb2NrIG93bmVyc2hpcAoKVGhlIGFzc2lnbm1lbnQgcmVxdWlyZXMg
Ym90aCBzY29yZSBhbmQgY2xvY2sgdG8gYmUgZGVyaXZlZCBmcm9tIHRoZSBldmVudCBzdHJlYW0u
CgpUaGUgZmluYWwgY2Fub25pY2FsLXN0YXRlIG1vZGVsIG11c3QgZXhwbGljaXRseSBpZGVudGlm
eToKCmBgYHRleHQKc2NvcmUgZGVyaXZhdGlvbgptYXRjaC1taW51dGUvY2xvY2sgZGVyaXZhdGlv
bgpwcm92aWRlciBldmVudCB0aW1lIC8gbWF0Y2gtY2xvY2sgaW5wdXRzCmNhbm9uaWNhbCBzZXF1
ZW5jZQpgYGAKCkRvIG5vdCBzaWxlbnRseSBkZXJpdmUgdGhlIG9mZmljaWFsIG1hdGNoIGNsb2Nr
IGZyb20gdGhlIGJyb3dzZXIncyB3YWxsIGNsb2NrLgoKQSBjbGllbnQgbWF5IGxvY2FsbHkgaW50
ZXJwb2xhdGUgZGlzcGxheSB0aW1lIG9ubHkgaWYgYW5jaG9yZWQgdG8gY2Fub25pY2FsIHByb3Zp
ZGVyLWRlcml2ZWQgc3RhdGUgYW5kIHBlcmlvZGljYWxseSBjb3JyZWN0ZWQuCgotLS0KCiMgMjJH
LiBNNCDigJQgbm8gc2Vjb25kIFBPQzsgTTMgaXMgYWxyZWFkeSB0aGUgZXhwZXJpbWVudAoKRG8g
bm90IHN0YXJ0IGFub3RoZXIgbG9jYWwgYXJjaGl0ZWN0dXJlIGJlbmNobWFyayBtZXJlbHkgYmVj
YXVzZSB0aGUgZmluYWwgcHJvZHVjdGlvbiB0b3BvbG9neSBkaWZmZXJzIGZyb20gdGhlIGZyb3pl
biBNMyB0b3BvbG9neS4KClRoZSBjYW5kaWRhdGUgaGFzIGV4cGxpY2l0bHkgc3RvcHBlZCBNMyBh
ZnRlciBzZXZlcmFsIGRheXMgb2YgaW52ZXN0aWdhdGlvbi4KCk00IG11c3QgcHJlZmVyIGEgcHJv
ZHVjdGlvbiBhcmNoaXRlY3R1cmUgd2hvc2UgcmVtYWluaW5nIHNjYWxpbmcgYmVoYXZpb3IgaXMg
c3VwcG9ydGVkIGJ5OgoKYGBgdGV4dAp0aGUgYWN0dWFsIE0zIGJvdHRsZW5lY2sgZXZpZGVuY2UK
bWF0dXJlIGRvY3VtZW50ZWQgcGxhdGZvcm0vc2VydmljZSBiZWhhdmlvcgpob3Jpem9udGFsIGNh
cGFjaXR5IGRlc2lnbgpjdXJyZW50IHF1b3Rhcy9saW1pdHMKY29uc2VydmF0aXZlIHJlc291cmNl
IGFzc3VtcHRpb25zCnByZS1sYXVuY2ggcHJvZHVjdGlvbiBsb2FkIHRlc3RpbmcgYXMgYW4gb3Bl
cmF0aW9uYWwgcmVxdWlyZW1lbnQKYGBgCgpEbyBub3QgaW1wbGVtZW50OgoKYGBgdGV4dAoxNi1z
aGFyZCBsb2NhbCBOY2hhbiBleHBlcmltZW50Cm5ldyBHbyBTU0UgZ2F0ZXdheQpsb2NhbCBLdWJl
cm5ldGVzIGNsdXN0ZXIKbmV3IDMtc2VlZCBxdWFsaWZpY2F0aW9uIGNhbXBhaWduCmBgYAoKZHVy
aW5nIE004oCTTTcuCgpBIGZpbmFsIGFyY2hpdGVjdHVyZSBtYXkgbGVnaXRpbWF0ZWx5IGJlIGEg
cHJvZHVjdGlvbiBpbmZlcmVuY2UgdGhhdCByZXNwb25kcyB0byB0aGUgUE9DIHJhdGhlciB0aGFu
IGJlaW5nIGFub3RoZXIgUE9DLXZhbGlkYXRlZCB0b3BvbG9neS4KCklmIGEgY2FuZGlkYXRlIGFy
Y2hpdGVjdHVyZSBkZXBlbmRzIG9uIGEgbm92ZWwgY3VzdG9tIG1lY2hhbmlzbSB3aXRoIG5vIG1h
dHVyZSBkb2N1bWVudGF0aW9uIGFuZCBubyBkZWZlbnNpYmxlIGNhcGFjaXR5IG1vZGVsLCByZWpl
Y3QgdGhhdCBhcmNoaXRlY3R1cmUgcmF0aGVyIHRoYW4gb3BlbmluZyBhbm90aGVyIGV4cGVyaW1l
bnQuCgotLS0KCiMgMjJILiBNNCDigJQgUE9DIGNhdXNhbC1jaGFpbiB3b3JkaW5nCgpUaGUgY2F1
c2FsIGNoYWluIG11c3QgYmUgZXhwbGljaXQ6CgpgYGB0ZXh0CmluaXRpYWwgcmlza3kgZml4ZWQg
ZmFuLW91dCBhc3N1bXB0aW9uCi0+IGxvY2FsIE0zIGV4cGVyaW1lbnQKLT4gMTAwayByZWFjaGVk
IHdpdGggemVybyBjb3JyZWN0bmVzcyB2aW9sYXRpb25zCi0+IGZyb3plbiBsYXRlbmN5IGdhdGVz
IG1pc3NlZAotPiBib3R0bGVuZWNrIGlzb2xhdGVkIHRvIGZhbi1vdXQvZGVwbG95bWVudCBjYXBh
Y2l0eQotPiBjb25maWctb25seSBmcm96ZW4tdG9wb2xvZ3kgdHVuaW5nIGRlY2xhcmVkIGV4aGF1
c3RlZAotPiBwcm9kdWN0aW9uIGFyY2hpdGVjdHVyZSByZXZpc2VkIHRvIGhvcml6b250YWxseSBi
b3VuZGVkLCBhdXRvc2NhbGVkL3ByZS1zY2FsZWQgZmFuLW91dAotPiBmaW5hbCBwcm9kdWN0aW9u
IGRlc2lnbgpgYGAKCktlZXAgdGhlIHRlcm1pbmFsIGNsYXNzaWZpY2F0aW9uOgoKYGBgdGV4dApN
MyA9IElOQ09OQ0xVU0lWRSBhdCBmcm96ZW4gdjIuMy4wCmBgYAoKRG8gbm90IGZhbHNlbHkgc2F5
OgoKYGBgdGV4dApQT0MgcGFzc2VkIGFsbCBnYXRlcwpQT0MgcHJvdmVkIHRoZSBmaW5hbCByZXBs
YWNlbWVudCB0b3BvbG9neQp0aGUgbGF0ZW5jeSB0YXJnZXQgcGFzc2VkIG9uIGEgZGlmZmVyZW50
IG1hY2hpbmUKYGBgCgpUaGUgYXNzaWdubWVudCBhc2tzIHdoYXQgdGhlIGV4cGVyaW1lbnQgY2hh
bmdlZCBpbiB0aGUgcHJvcG9zYWwuIEEgcHJvZHVjdGlvbiBkZXNpZ24gcmV2aXNpb24gaXMgYSB2
YWxpZCBhbmQgdXNlZnVsIFBPQyBvdXRjb21lLgoKLS0tCgojIDIySS4gTTQg4oCUIGZpbmFsIGFy
Y2hpdGVjdHVyZSBhcnRpZmFjdAoKVGhlIGZpbmFsIE00IGFydGlmYWN0IG11c3QgaW5jbHVkZToK
CmBgYHRleHQKY3VycmVudCB0ZXJtaW5hbCBNMyB2Mi4zLjAgY2xhc3NpZmljYXRpb24KRjEgbWVh
c3VyZWQgcmVzdWx0CndoYXQgRjEgcHJvdmVkCndoYXQgRjEgZGlkIG5vdCBwcm92ZQp3aXRoZHJh
d24gZml4ZWQtdG9wb2xvZ3kgYXNzdW1wdGlvbgpoYXJkd2FyZS9kZXBsb3ltZW50IGRlcGVuZGVu
Y3kgaW50ZXJwcmV0YXRpb24KY2FuZGlkYXRlIGNvbXBhcmlzb24KZmluYWwgc2VsZWN0ZWQgYXJj
aGl0ZWN0dXJlCmVuZC10by1lbmQgZGF0YSBmbG93CnBhcnRpdGlvbi9yb3V0aW5nIG1vZGVsCmhv
dC1tYXRjaCBzdWItc2hhcmRpbmcKYXV0b3NjYWxpbmcvcHJlLXNjYWxpbmcgbW9kZWwKTisxL2Zh
aWx1cmUvZGVwbG95IGNhcGFjaXR5IG1vZGVsCmhpc3RvcnkvcmVjb25uZWN0IG1vZGVsCnByb3Zp
ZGVyIGJvdW5kYXJ5Cmdlb2dyYXBoaWMgbW9kZWwKa2V5IHJlamVjdGVkIGFsdGVybmF0aXZlcwp3
aGF0IHJlbWFpbnMgdW5tZWFzdXJlZApwcmUtbGF1bmNoIHByb2R1Y3Rpb24gbG9hZC9jYXBhY2l0
eSB2YWxpZGF0aW9uIHJlcXVpcmVtZW50CmBgYAoKRW5kIHdpdGg6CgpgYGB0ZXh0Ck0zIHRlcm1p
bmFsIHZlcmRpY3Q6IElOQ09OQ0xVU0lWRSBhdCBmcm96ZW4gdjIuMy4wCk0zIHZhbGlkYXRlZCBi
ZXN0IGVmZm9ydDogRjEg4oCUIDEwMGssIGNvcnJlY3RuZXNzIDAsIGZhbl9vdXQgcDk1IDI3NTcg
bXMsIGJ1cnN0IHA5NSAzNzA3IG1zCk00IGFyY2hpdGVjdHVyZSBkZWNpc2lvbjogPG9uZSBzZW50
ZW5jZT4KZml4ZWQgNC1wYXJ0aXRpb24gMTAwayBjYXBhY2l0eSBhc3N1bXB0aW9uIHJldGFpbmVk
OiBOTwpmaW5hbCBmYW4tb3V0IGFyY2hpdGVjdHVyZTogPG9uZSBzZW50ZW5jZT4KYXV0b3NjYWxp
bmcvcHJlLXNjYWxpbmcgc3RyYXRlZ3k6IDxvbmUgc2VudGVuY2U+Ck00IGNvbXBsZXRpb246IDEw
MCUKYGBgCgotLS0KCiMgMjMuIE00IOKAlCB1cGRhdGUgYXJjaGl0ZWN0dXJlIHNvdXJjZSBvZiB0
cnV0aAoKVXBkYXRlIG9yIHN1cGVyc2VkZSB0aGUgYXJjaGl0ZWN0dXJlIGRvY3Mgc28gdGhlcmUg
aXMgb25lIGN1cnJlbnQgZGVzaWduLgoKQXQgbWluaW11bSByZWNvbmNpbGU6CgpgYGB0ZXh0Cmlu
dGVybmFsX2RvY3MvTElWRV9NQVRDSF9DRU5UUkVfTUlOSU1VTV9ERUZFTlNJQkxFX0FSQ0hJVEVD
VFVSRS5tZAppbnRlcm5hbF9kb2NzL0xJVkVfTUFUQ0hfQ0VOVFJFX0VRQ19BQ19BUkNISVRFQ1RV
UkVfQ09OVFJBQ1RfKi5tZAppbnRlcm5hbF9kb2NzL1JJU0tfVEFSR0VUX0FMSUdOTUVOVC5tZApp
bnRlcm5hbF9kb2NzL1RSQUNFQUJJTElUWV9NQVRSSVgubWQKYGBgCgpJZiBNNCdzIGZyZXNoIGFs
dGVybmF0aXZlIGNvbXBhcmlzb24gbWF0ZXJpYWxseSBjaGFuZ2VzIHRoZSBwcmV2aW91cyB0aGly
ZC1wYXJ0eSBkZWNpc2lvbiwgdXBkYXRlIG9yIHN1cGVyc2VkZSB0aGUgcmVsZXZhbnQgdGhpcmQt
cGFydHkgcmVzZWFyY2ggZGVjaXNpb24gcmVjb3JkIHRvby4KCkRvIG5vdCBsZWF2ZSBhbiBvbGQg
b25lLXByaW1hcnkgYXJjaGl0ZWN0dXJlIG1hcmtlZCBhcyBjdXJyZW50IGlmIE00IHJlamVjdHMg
dGhhdCBhc3N1bXB0aW9uLgoKSGlzdG9yaWNhbCB2ZXJzaW9ucyBtYXkgcmVtYWluLCBidXQgdGhl
eSBtdXN0IGJlIGNsZWFybHkgc3VwZXJzZWRlZC4KCi0tLQoKIyAyNC4gTTQgY29tcGxldGlvbiBn
YXRlCgpNNCBpcyBET05FIG9ubHkgaWY6CgpgYGB0ZXh0ClsgXSB0ZXJtaW5hbCBNMyByZW1haW5z
IElOQ09OQ0xVU0lWRSBhdCBmcm96ZW4gdjIuMy4wClsgXSBGMSBpcyByZXByZXNlbnRlZCBleGFj
dGx5OiAxMDBrLCBjb3JyZWN0bmVzcyAwLCBmYW5fb3V0IDI3NTcgbXMsIGJ1cnN0IDM3MDcgbXMK
WyBdIGhpc3RvcmljYWwgcTUvdjIuMC41IGFuZCB2Mi4wLjYgcHJvdmVuYW5jZSByZW1haW5zIHBy
ZXNlcnZlZApbIF0gZml4ZWQgNC1wYXJ0aXRpb24gcHJvZHVjdGlvbi1jYXBhY2l0eSBhc3N1bXB0
aW9uIHJlbWFpbnMgd2l0aGRyYXduClsgXSBvbmUgZmluYWwgcHJvZHVjdGlvbiBhcmNoaXRlY3R1
cmUgaXMgc2VsZWN0ZWQKWyBdIGhvdC1tYXRjaCBwYXJ0aXRpb25pbmcvc3ViLXNoYXJkaW5nIGlz
IHNvbHZlZApbIF0gbm8gbG9jYWwgTTMgcmVzdWx0IGlzIHRyZWF0ZWQgYXMgYSB1bml2ZXJzYWwg
c2FmZSBwZXItbm9kZSBjYXBhY2l0eSByYXRpbmcKWyBdIG5vIHNoYXJlZCBSZWRpcy9yb3V0aW5n
IHNpbmdsZXRvbiBiZWNvbWVzIGFuIHVuZXhwbGFpbmVkIG5ldyBib3R0bGVuZWNrClsgXSBmYWls
dXJlIGRvbWFpbnMgLyBtdWx0aS1BWiBvciBtYW5hZ2VkIGVxdWl2YWxlbnQgYXJlIGV4cGxpY2l0
ClsgXSBjcm93ZCBpbnZhcmlhbmNlIGZyb20gfjEwMCB0byAxMDAsMDAwIGlzIGFkZHJlc3NlZCB3
aXRob3V0IGZhbHNlIGJlbmNobWFyayBjbGFpbXMKWyBdIE4rMSAvIHJvbGxpbmctZGVwbG95IGNh
cGFjaXR5IGlzIGV4cGxpY2l0ClsgXSArNDBrLzEyMHMgc3VyZ2UgZG9lcyBub3QgcmVseSBzb2xl
bHkgb24gcmVhY3RpdmUgY2FwYWNpdHkgYm9vdApbIF0gaWYgc2VsZi1ob3N0ZWQsIGF1dG9zY2Fs
aW5nL3Jlc291cmNlLWF3YXJlIGNhcGFjaXR5IG1vZGVsIGlzIGV4cGxpY2l0ClsgXSBhdXRvc2Nh
bGluZyBkb2VzIG5vdCBwcmV0ZW5kIHRvIG1pZ3JhdGUgZXhpc3RpbmcgU1NFIGNvbm5lY3Rpb25z
ClsgXSB3YXJtL3ByZS1zY2FsZWQga2lja29mZiBjYXBhY2l0eSBpcyBleHBsaWNpdApbIF0gS3Vi
ZXJuZXRlcy9FS1Mgb3IgZXF1aXZhbGVudCBhdXRvc2NhbGluZyBpcyBwcm9kdWN0aW9uIGRlc2ln
biBvbmx5OyBubyB1bm5lY2Vzc2FyeSBuZXcgbG9jYWwgY2x1c3Rlci9QT0Mgd2FzIGJ1aWx0Clsg
XSBkZXBsb3kvZmFpbHVyZSByZWNvbm5lY3QgdGh1bmRlcmluZy1oZXJkIGJlaGF2aW9yIGlzIGNv
bnRyb2xsZWQKWyBdIHJvdXRpbmcvb3duZXJzaGlwIGlzIGV4cGxpY2l0ClsgXSBjYW5vbmljYWwg
dHJ1dGggaXMgZXhwbGljaXQKWyBdIGN1cnJlbnQgc2NvcmUvc3RhdGUgYW5kIGNhbm9uaWNhbCBo
aXN0b3J5IHNoYXJlIG9uZSBhdG9taWMvdmVyc2lvbmVkIGNvbW1pdCBib3VuZGFyeQpbIF0gcHJv
dmlkZXIgc2NoZW1hIHZhbGlkYXRpb24vbm9ybWFsaXphdGlvbi9ldm9sdXRpb24gcG9saWN5IGlz
IGV4cGxpY2l0ClsgXSBwcm92aWRlciB0cmFuc3BvcnQgYXNzdW1wdGlvbi9ib3VuZGFyeSBpcyBl
eHBsaWNpdApbIF0gYWNjZXB0ZWQtZXZlbnQgcmV0cnkvcG9pc29uIHBvbGljeSBpcyBleHBsaWNp
dApbIF0gY2Fub25pY2FsIHNlcXVlbmNlIHZzIHByb3ZpZGVyL3RyYW5zcG9ydCBpZGVudGl0eSBp
cyBleHBsaWNpdApbIF0gZGVsaXZlcnkvaGlzdG9yeS1zdG9yZSByZWJ1aWxkIGZyb20gY2Fub25p
Y2FsIHN0YXRlIGlzIGV4cGxpY2l0ClsgXSBzY29yZSBhbmQgb2ZmaWNpYWwgY2xvY2sgb3duZXJz
aGlwIGFyZSBleHBsaWNpdApbIF0gaGlzdG9yeS9sYXRlIGpvaW4gaXMgZXhwbGljaXQKWyBdIGJy
b3dzZXIgaGlzdG9yeS9yZW5kZXIgcGF0aCBpcyBib3VuZGVkIGVub3VnaCBmb3IgdGhlIDw9MnMg
ZGVzaWduClsgXSBoaXN0b3J5LXRvLWxpdmUgaGFuZG9mZiByYWNlIGlzIGNsb3NlZApbIF0gcmVj
b25uZWN0IGlzIGV4cGxpY2l0ClsgXSB1cHN0cmVhbS1mZWVkLXN0YWxsIGJlaGF2aW9yIGlzIGV4
cGxpY2l0ClsgXSBuZXZlci1ibGFuayBjbGllbnQgYmVoYXZpb3IgaXMgZXhwbGljaXQKWyBdIGJv
dW5kZWQgc2xvdy1jbGllbnQvYmFja3ByZXNzdXJlIHBvbGljeSBpcyBleHBsaWNpdApbIF0gZGVw
bG95bWVudC9yZWNvdmVyeS9yb2xsYmFjayBpcyBleHBsaWNpdCBmb3IgYmFja2VuZCBBTkQgZnJv
bnRlbmQgYXNzZXRzClsgXSBnZW9ncmFwaHkgaXMgZXhwbGljaXQKWyBdIG5vIG5ldyBjcml0aWNh
bCBsb2NhbGx5LXRlc3RhYmxlIGN1c3RvbSByaXNrIGlzIHNpbGVudGx5IGlnbm9yZWQKWyBdIHBy
b3ZpZGVyIHNlbWFudGljcyByZW1haW4gaG9uZXN0ClsgXSBhcmNoaXRlY3R1cmUgc291cmNlLW9m
LXRydXRoIHVwZGF0ZWQKWyBdIG5vIGNvbnRyYWRpY3Rpb24gd2l0aCBwcmVzZXJ2ZWQgTTMgZXZp
ZGVuY2UKWyBdIGZpbmFsIE00IGFydGlmYWN0IGV4aXN0cwpgYGAKCklmIGFueSBmYWlsOgoKYGBg
dGV4dApjb250aW51ZSBNNApgYGAKCi0tLQoKIyAyNS4gTWlsZXN0b25lIDUg4oCUIG9iamVjdGl2
ZQoKQ2xvc2UgYWxsIGV2aWRlbmNlIG5lZWRlZCB0byBkZWZlbmQgdGhlIGZpbmFsIE00IGFyY2hp
dGVjdHVyZS4KCkNyZWF0ZS9maW5hbGl6ZToKCmBgYHRleHQKaW50ZXJuYWxfZG9jcy9NNV9DVVJS
RU5UX0VYVEVSTkFMX0VWSURFTkNFX0xFREdFUi5tZAppbnRlcm5hbF9kb2NzL001X1BBUkFNRVRS
SUNfQ09TVF9NT0RFTC5tZAppbnRlcm5hbF9kb2NzL001X0ZJTkFMX1BST1BPU0FMX0VWSURFTkNF
X0NMT1NVUkUubWQKYGBgCgpJZiBzdHJvbmcgZXF1aXZhbGVudCBmaWxlcyBhbHJlYWR5IGV4aXN0
OgoKYGBgdGV4dAp1cGRhdGUgdGhlbSBpbnN0ZWFkIG9mIGR1cGxpY2F0aW5nLgpgYGAKCi0tLQoK
IyAyNi4gTTUg4oCUIGN1cnJlbnQgd2ViIHJlc2VhcmNoIGlzIG1hbmRhdG9yeQoKVXNlIHRoZSBs
aXZlIHdlYi4KCkZvciBtdXRhYmxlIGFyY2hpdGVjdHVyZSBmYWN0czoKCmBgYHRleHQKcHJlZmVy
IHByaW1hcnkgb2ZmaWNpYWwgc291cmNlcwpyZWNvcmQgcmV0cmlldmFsIGRhdGUKcmVjb3JkIFVS
TApyZWNvcmQgZXhhY3Qgc3VwcG9ydGVkIGNsYWltCmBgYAoKQVdTOgoKYGBgdGV4dApkb2NzLmF3
cy5hbWF6b24uY29tCmF3cy5hbWF6b24uY29tIHByaWNpbmcvcHJvZHVjdCBwYWdlcwpBV1MgV2hh
dCdzIE5ldyB3aGVyZSBmZWF0dXJlIHJlY2VuY3kgbWF0dGVycwpgYGAKCk5leHQuanM6CgpgYGB0
ZXh0Cm5leHRqcy5vcmcKYGBgCgpOY2hhbiBpZiByZXRhaW5lZDoKCmBgYHRleHQKb2ZmaWNpYWwg
TmNoYW4gZG9jcy9yZXBvc2l0b3J5CmBgYAoKT3RoZXIgdmVuZG9yOgoKYGBgdGV4dApvZmZpY2lh
bCB2ZW5kb3IgZG9jcwpgYGAKCkRvIG5vdCByZWx5IG9uIG1vZGVsIG1lbW9yeSBmb3IgMjAyNiBw
cmljaW5nLgoKLS0tCgojIDI3LiBNNSDigJQgb25seSByZXNlYXJjaCB0aGUgZmluYWwgYXJjaGl0
ZWN0dXJlIGRlZXBseQoKQWZ0ZXIgTTQ6CgpgYGB0ZXh0CmZyZWV6ZSBTRUxFQ1RFRF9DT01QT05F
TlRTCmBgYAoKUmVzZWFyY2ggdGhvc2UgY29tcG9uZW50cyB0aG9yb3VnaGx5LgoKRG8gbm90IHNw
ZW5kIG1vc3Qgb2YgTTUgZG9jdW1lbnRpbmcgc2VydmljZXMgcmVqZWN0ZWQgYnkgTTQuCgpLZWVw
IHJlamVjdGVkLWFsdGVybmF0aXZlIGV2aWRlbmNlIG9ubHkgd2hlcmUgbmVlZGVkIHRvIGRlZmVu
ZCBhIG1ham9yIHRyYWRlLW9mZi4KCi0tLQoKIyAyOC4gTTUg4oCUIENsb3VkRnJvbnQgdmVyaWZp
Y2F0aW9uCgpJZiBzZWxlY3RlZCwgdmVyaWZ5IGN1cnJlbnQ6CgpgYGB0ZXh0ClZQQy9wcml2YXRl
IG9yaWdpbnMKTkxCIGNvbXBhdGliaWxpdHkKU1NFL3N0cmVhbWluZyBiZWhhdmlvcgpjaHVua2Vk
IHJlc3BvbnNlIGJlaGF2aW9yCm9yaWdpbiByZXNwb25zZSB0aW1lb3V0IHNlbWFudGljcwpsb25n
LWxpdmVkIHJlc3BvbnNlIGJlaGF2aW9yCmNhY2hlLWRpc2FibGVkIGxpdmUgcGF0aHMKcmVxdWVz
dCBmb3J3YXJkaW5nCnByaWNpbmcKYGBgCgpBbHNvIGNvbXBhcmUgY3VycmVudCBDbG91ZEZyb250
IHByaWNpbmcgbW9kZWxzLCBpbmNsdWRpbmcgYW55IDIwMjY6CgpgYGB0ZXh0CnBheS1hcy15b3Ut
Z28KZmxhdC1yYXRlIHBsYW5zCmBgYAoKVmVyaWZ5IGV4YWN0IGN1cnJlbnQ6CgpgYGB0ZXh0CnBs
YW4gbmFtZXMKbW9udGhseSBwcmljZXMKZGF0YS10cmFuc2ZlciBhbGxvd2FuY2VzCnJlcXVlc3Qg
YWxsb3dhbmNlcwpwcml2YXRlLW9yaWdpbiBlbGlnaWJpbGl0eQpXQUYvRERvUy9ETlMvbG9nZ2lu
ZyBpbmNsdXNpb25zCnVzYWdlIHJ1bGVzCmBgYAoKRG8gbm90IGNvcHkgb2xkIHByaWNpbmcuCgot
LS0KCiMgMjkuIE01IOKAlCBzdGF0aWMgTmV4dC5qcyBwYXRoCgpWZXJpZnkgY3VycmVudCBvZmZp
Y2lhbCBOZXh0LmpzIGJlaGF2aW9yIGZvcjoKCmBgYHRleHQKQXBwIFJvdXRlcgpzdGF0aWMgZXhw
b3J0CmNsaWVudCBjb21wb25lbnRzCm5hdGl2ZSBFdmVudFNvdXJjZQpyb3V0ZS9xdWVyeSBkZXNp
Z24gdXNlZCBieSBmaW5hbCBmcm9udGVuZApgYGAKClRoZSBhc3NpZ25tZW50IGFza3MgZm9yIE5l
eHQuanMgQXBwIFJvdXRlciBidXQgZG9lcyBub3QgcmVxdWlyZSBidWlsZGluZyB0aGUgcHJvZHVj
dGlvbiBmcm9udGVuZC4KCi0tLQoKIyAzMC4gTTUg4oCUIGluZ2VzdCBzdGFjayB2ZXJpZmljYXRp
b24KCkZvciBlYWNoIHNlbGVjdGVkIHNlcnZpY2UgdmVyaWZ5IGN1cnJlbnQgc2VtYW50aWNzL3By
aWNpbmcuCgpJZiBmaW5hbCBkZXNpZ24ga2VlcHMgdGhlIGN1cnJlbnQgZmFtaWx5OgoKIyMgQVBJ
IEdhdGV3YXkgSFRUUCBBUEkKClZlcmlmeToKCmBgYHRleHQKZGlyZWN0IEFXUyBzZXJ2aWNlIGlu
dGVncmF0aW9uIHRvIFNRUyBpZiB1c2VkCnJlcXVlc3QgcGFyYW1ldGVyIG1hcHBpbmcKcGF5bG9h
ZCBsaW1pdHMKdGhyb3R0bGluZwpwcmljaW5nCmBgYAoKIyMgU1FTIEZJRk8KClZlcmlmeToKCmBg
YHRleHQKb3JkZXJpbmcgc2NvcGUKbWVzc2FnZS1ncm91cCBjb25jdXJyZW5jeQpkZWR1cGxpY2F0
aW9uCkxhbWJkYSBGSUZPIGludGVncmF0aW9uCnRocm91Z2hwdXQgbGltaXRzCnByaWNpbmcKYGBg
CgpOZXZlciBpbXBseToKCmBgYHRleHQKU1FTIEZJRk8gbWFudWZhY3R1cmVzIGNvcnJlY3QgcHJv
dmlkZXIgc2VtYW50aWMgb3JkZXIuCmBgYAoKIyMgTGFtYmRhCgpWZXJpZnk6CgpgYGB0ZXh0ClNR
UyBGSUZPIGV2ZW50LXNvdXJjZSBiZWhhdmlvcgpyZXRyaWVzL2ZhaWx1cmUKVlBDIHJlcXVpcmVt
ZW50CnByaWNpbmcKYGBgCgojIyBEeW5hbW9EQgoKVmVyaWZ5OgoKYGBgdGV4dAp0cmFuc2FjdGlv
bnMKY29uZGl0aW9uYWwgd3JpdGVzCmlkZW1wb3RlbmN5IHBhdHRlcm4KaXRlbS90cmFuc2FjdGlv
biBsaW1pdHMKcHJpY2luZwpgYGAKCi0tLQoKIyAzMS4gTTUg4oCUIGZhbi1vdXQgc3RhY2sgdmVy
aWZpY2F0aW9uCgpGb3IgdGhlIGZpbmFsIHNlbGVjdGVkIGRlbGl2ZXJ5IHRlY2hub2xvZ3kgdmVy
aWZ5OgoKYGBgdGV4dApob3Jpem9udGFsIHNjYWxpbmcgbW9kZWwKY29ubmVjdGlvbiBsaW1pdHMK
aGlzdG9yeS9yZXBsYXkgc3VwcG9ydApmYWlsdXJlIGJlaGF2aW9yCmxvbmctbGl2ZWQgY29ubmVj
dGlvbiBzdXBwb3J0CmRlcGxveSBiZWhhdmlvcgpwcmljaW5nCmBgYAoKSWYgTmNoYW4gcmVtYWlu
cyBpbiBhIGhvcml6b250YWxseSBwYXJ0aXRpb25lZCBmbGVldDoKCnZlcmlmeToKCmBgYHRleHQK
UmVkaXMgY29tcGF0aWJpbGl0eQpzaGFyZWQtc3RhdGUgc2VtYW50aWNzCndvcmtlci9wcm9jZXNz
IGJlaGF2aW9yIHJlbGV2YW50IHRvIGRlc2lnbgp3aGV0aGVyIHByb3Bvc2VkIHJvdXRpbmcgbW9k
ZWwgaXMgc3VwcG9ydGVkIGJ5IHN1cnJvdW5kaW5nIEFXUyBjb21wb25lbnRzCmBgYAoKRG8gbm90
IGNsYWltIHRoYXQgTTMgdmFsaWRhdGVkIHRoZSBuZXcgaG9yaXpvbnRhbCB0b3BvbG9neS4KCkl0
IGlzIGEgcHJvZHVjdGlvbiBhcmNoaXRlY3R1cmUgaW5mZXJlbmNlIGluZm9ybWVkIGJ5IHE1LgoK
LS0tCgojIDMyLiBNNSDigJQgQVdTIGxvYWQtYmFsYW5jaW5nL3JvdXRpbmcgdmVyaWZpY2F0aW9u
CgpJZiB1c2luZyBOTEIvQUxCIG9yIGFub3RoZXIgQVdTIHJvdXRlciwgdmVyaWZ5OgoKYGBgdGV4
dApsb25nLWxpdmVkIFNTRSBzdXBwb3J0CnJvdXRpbmcgY2FwYWJpbGl0aWVzCnRhcmdldC1ncm91
cCBiZWhhdmlvcgpjb25uZWN0aW9uIGRyYWluaW5nL2RlcmVnaXN0cmF0aW9uCnN0aWNraW5lc3Mv
YWZmaW5pdHkgaWYgcmVsaWVkIHVwb24KY3Jvc3Mtem9uZSBiZWhhdmlvcgpoZWFsdGggY2hlY2tz
CnByaWNpbmcKYGBgCgpJZiBkZXRlcm1pbmlzdGljIG1hdGNoL2NoYW5uZWwgcGFydGl0aW9uaW5n
IHJlcXVpcmVzIGFwcGxpY2F0aW9uLWF3YXJlIHJvdXRpbmcgdGhhdCBOTEIgY2Fubm90IHByb3Zp
ZGU6CgpgYGB0ZXh0CmRvIG5vdCBwcmV0ZW5kIE5MQiBkb2VzIGl0LgpgYGAKCkVpdGhlcjoKCmBg
YHRleHQKaW50cm9kdWNlIHRoZSBzbWFsbGVzdCBqdXN0aWZpZWQgcm91dGluZyBsYXllcgp1c2Ug
c2VwYXJhdGUgZW5kcG9pbnRzL3RhcmdldCBncm91cHMKdXNlIGEgdGVjaG5vbG9neSB3aXRoIHN1
aXRhYmxlIG5hdGl2ZSByb3V0aW5nCmBgYAoKVGhlbiBpbmNsdWRlIHRoZSBjb3N0L2NvbXBsZXhp
dHkuCgotLS0KCiMgMzMuIE01IOKAlCBFbGFzdGlDYWNoZS9SZWRpcy1jb21wYXRpYmxlIHNlcnZp
Y2UKClZlcmlmeSB0aGUgZXhhY3QgZmluYWwgZW5naW5lOgoKYGBgdGV4dApSZWRpcyBPU1MKVmFs
a2V5CmFub3RoZXIgY29tcGF0aWJsZSBzZXJ2aWNlCmBgYAoKQ2hlY2s6CgpgYGB0ZXh0Ck5jaGFu
IGNvbXBhdGliaWxpdHkgaWYgYXBwbGljYWJsZQpub2RlIGF2YWlsYWJpbGl0eQpNdWx0aS1BWgpy
ZXBsaWNhdGlvbi9mYWlsb3ZlcgpwcmljaW5nCmNyb3NzLUFaIGNvc3QKbWVtb3J5IHNpemluZwpg
YGAKCkRvIG5vdCBtaXggUmVkaXMgT1NTIGFuZCBWYWxrZXkgbmFtZXMgY2FzdWFsbHkuCgotLS0K
CiMgMzQuIE01IOKAlCBFQzIvQVNHCgpJZiBzZWxlY3RlZDoKCnZlcmlmeToKCmBgYHRleHQKY3Vy
cmVudCBpbnN0YW5jZSBwcmljZQppbnN0YW5jZSBhdmFpbGFiaWxpdHkKRUJTCkF1dG8gU2NhbGlu
ZyBHcm91cApJbnN0YW5jZSBSZWZyZXNoCm1pbmltdW0gaGVhbHRoeSBwZXJjZW50YWdlCmluc3Rh
bmNlIHdhcm0tdXAKTkxCL0FMQiBkcmFpbmluZyBpbnRlcmFjdGlvbgpgYGAKClRoZSBmaW5hbCBi
YXNlbGluZSBmbGVldCBtdXN0IGJlIGV4cGxpY2l0LgoKRG8gbm90IGRlcml2ZSBleGFjdCBwcm9k
dWN0aW9uIGNhcGFjaXR5IGZyb20gcTUgaWYgcTUgZGlkIG5vdCB2YWxpZGx5IG1lYXN1cmUgdGhh
dCB0b3BvbG9neS4KClVzZSBjb25zZXJ2YXRpdmUgaW5mZXJlbmNlIGFuZCBjbGVhcmx5IGxhYmVs
IGl0LgoKLS0tCgojIDM1LiBNNSDigJQgbWFuYWdlZCBhbHRlcm5hdGl2ZSByZXByaWNpbmcKCkJl
Y2F1c2UgdGhlIG9sZCBhcmNoaXRlY3R1cmUgaGFzIGJlZW4gbWF0ZXJpYWxseSB3ZWFrZW5lZCwg
cmVmcmVzaCBwcmljaW5nIGZvciB0aGUgc3Ryb25nZXN0IG1hbmFnZWQgYWx0ZXJuYXRpdmUuCgpE
byBub3QgYXNzdW1lIHRoZSBvbGQgcmVzdWx0OgoKYGBgdGV4dAoibWFuYWdlZCBmYW4tb3V0IGlz
IHRvbyBleHBlbnNpdmUiCmBgYAoKaXMgc3RpbGwgdHJ1ZS4KCkNhbGN1bGF0ZSBpdCB1bmRlciB0
aGUgY3VycmVudCAxMDBrIHdvcmtsb2FkIG1vZGVsLgoKSWYgYSBtYW5hZ2VkIG9wdGlvbiBub3cg
YmVhdHMgdGhlIHNlbGYtaG9zdGVkIG9wdGlvbiBvbjoKCmBgYHRleHQKY29zdApjb21wbGV4aXR5
CmNhcGFjaXR5IGNvbmZpZGVuY2UKYGBgCgpsb29wIGJhY2sgdG8gTTQuCgotLS0KCiMgMzVBLiBN
NSDigJQgYXV0b3NjYWxpbmcgYW5kIGhhcmR3YXJlLWNhcGFjaXR5IHZlcmlmaWNhdGlvbgoKSWYg
dGhlIHNlbGVjdGVkIHByb2R1Y3Rpb24gZGVzaWduIHVzZXMgS3ViZXJuZXRlcy9FS1Mgb3IgYW5v
dGhlciBvcmNoZXN0cmF0b3IsIHZlcmlmeSBjdXJyZW50IG9mZmljaWFsIGJlaGF2aW9yIGZvcjoK
CmBgYHRleHQKSG9yaXpvbnRhbCBQb2QgQXV0b3NjYWxlciAvIHNlcnZpY2UgYXV0b3NjYWxpbmcK
Y3VzdG9tL2V4dGVybmFsIG1ldHJpYyBzdXBwb3J0CnNjYWxlLXVwL2Rvd24gYmVoYXZpb3IKcG9k
IHJlYWRpbmVzcyBhbmQgc3RhcnR1cCBpbnRlcmFjdGlvbgpub2RlL2NvbXB1dGUgYXV0b3NjYWxp
bmcKRUtTL0thcnBlbnRlci9DbHVzdGVyIEF1dG9zY2FsZXIgb3Igc2VsZWN0ZWQgZXF1aXZhbGVu
dApsb2FkLWJhbGFuY2VyIHJlZ2lzdHJhdGlvbi9kcmFpbmluZwpQb2REaXNydXB0aW9uQnVkZ2V0
IG9yIHNlbGVjdGVkIHJvbGxvdXQgYXZhaWxhYmlsaXR5IG1lY2hhbmlzbQpwcmljaW5nL2NvbnRy
b2wtcGxhbmUgY29zdCB3aGVyZSBhcHBsaWNhYmxlCmBgYAoKRm9yIGxvbmctbGl2ZWQgU1NFLCBl
eHBsaWNpdGx5IHJlY29yZDoKCmBgYHRleHQKYXV0b3NjYWxpbmcgZG9lcyBub3QgbWlncmF0ZSBh
bHJlYWR5LW9wZW4gY29ubmVjdGlvbnM7Cm5ldyBjYXBhY2l0eSBwcmltYXJpbHkgYWJzb3JicyBu
ZXcvcmVjb25uZWN0aW5nIHZpZXdlcnM7CmRyYWluaW5nL2ZhaWx1cmUgY2F1c2VzIHJlY29ubmVj
dHMgdGhhdCBtdXN0IGJlIGppdHRlcmVkIGFuZCBoYXZlIHNwYXJlIGNhcGFjaXR5LgpgYGAKCkNo
b29zZSBwcm9kdWN0aW9uIHNjYWxpbmcgaW5wdXRzIHN1Y2ggYXM6CgpgYGB0ZXh0CnByaW1hcnk6
CiAgICBhY3RpdmUgU1NFIGNvbm5lY3Rpb25zIHBlciByZXBsaWNhCgpzZWNvbmRhcnk6CiAgICBD
UFUKICAgIG1lbW9yeS9PT00gcHJlc3N1cmUKICAgIGZhbi1vdXQgYmFja2xvZyAvIGRlbGl2ZXJ5
IHByZXNzdXJlCgpTTE8gbW9uaXRvcmluZzoKICAgIGZhbl9vdXQvZW5kLXRvLWVuZCB2aWV3ZXIg
bGF0ZW5jeQpgYGAKCkRvIG5vdCBtYWtlIGxhdGVuY3kgdGhlIG9ubHkgcmVhY3RpdmUgc2NhbGlu
ZyBzaWduYWwuCgpGb3IgdGhlIHByZWRpY3RhYmxlICs0MGsvMTIwcyBraWNrb2ZmIHN1cmdlOgoK
YGBgdGV4dApwcmUtc2NhbGUvd2FybSB0aGUgcmVxdWlyZWQgcGVhayBmbGVldCBiZWZvcmUga2lj
a29mZjsKSFBBL25vZGUgYXV0b3NjYWxpbmcgcmVwbGVuaXNoZXMvYWRkcyBjYXBhY2l0eSBidXQg
aXMgbm90IHRoZSBvbmx5IHN1cmdlIGRlZmVuc2UuCmBgYAoKSWYgRUtTL0t1YmVybmV0ZXMgaXMg
bm90IHNlbGVjdGVkLCBkb2N1bWVudCB0aGUgZXF1aXZhbGVudCBiZWhhdmlvciBvZiB0aGUgY2hv
c2VuIHBsYXRmb3JtLgoKQ29zdCB0aGUgY29udHJvbCBwbGFuZSwgd29ya2VyL25vZGUgY2FwYWNp
dHksIHdhcm0gcGVhayBmbGVldCwgYW5kIE4rMSBoZWFkcm9vbS4KCi0tLQoKIyAzNi4gTTUg4oCU
IHNlY3VyaXR5CgpVc2Ugb25seSBwcm9wb3J0aW9uYXRlIGNvbnRyb2xzLgoKVmVyaWZ5IHNlbGVj
dGVkOgoKYGBgdGV4dApUTFMKQ2xvdWRGcm9udCBwcm90ZWN0aW9ucwpTaGllbGQgU3RhbmRhcmQg
aWYgcmVsaWVkIHVwb24KcHJpdmF0ZSBvcmlnaW5zCnNlY3VyaXR5IGdyb3VwcwpsZWFzdCBwcml2
aWxlZ2UKaW5ncmVzcyB0aHJvdHRsaW5nCldBRiBvbmx5IGlmIGdlbnVpbmVseSBzZWxlY3RlZApg
YGAKCkRvIG5vdCBhZGQgcGFpZCBwcm9kdWN0cyBqdXN0IGJlY2F1c2UgdGhleSBleGlzdC4KCi0t
LQoKIyAzNy4gTTUg4oCUIG9ic2VydmFiaWxpdHkKCkRlZmluZSBtaW5pbXVtIHByb2R1Y3Rpb24g
b2JzZXJ2YWJpbGl0eToKCmBgYHRleHQKcHJvdmlkZXItaW5nZXN0IGZhaWx1cmVzClNRUyBxdWV1
ZSBkZXB0aC9hZ2UKcHJvY2Vzc29yIGVycm9ycwpjYW5vbmljYWwtc2VxdWVuY2UgdmlvbGF0aW9u
cwpEeW5hbW9EQiBmYWlsdXJlcy90aHJvdHRsaW5nCmRlbGl2ZXJ5LW5vZGUgQ1BVL21lbW9yeS9j
b25uZWN0aW9uIGNvdW50CmRlbGl2ZXJ5LW5vZGUgT09NClJlZGlzIGhlYWx0aC9tZW1vcnkKbG9h
ZC1iYWxhbmNlciB0YXJnZXQgaGVhbHRoCkNsb3VkRnJvbnQgZXJyb3JzCmVuZC10by1lbmQgdGlt
ZXN0YW1wIG1ldHJpY3MKYGBgCgpFc3RpbWF0ZSBtYXRlcmlhbCBjb3N0LgoKLS0tCgojIDM4LiBN
NSDigJQgaGlkZGVuIGluZnJhc3RydWN0dXJlIGF1ZGl0CgpFeHBsaWNpdGx5IGRldGVybWluZToK
CmBgYHRleHQKVlBDCnN1Ym5ldHMKTkFUIEdhdGV3YXkKSW50ZXJuZXQgR2F0ZXdheQpWUEMgZW5k
cG9pbnRzCnB1YmxpYyBJUHY0CmNyb3NzLUFaIHRyYW5zZmVyClJvdXRlIDUzCkFDTQpFQlMKQ2xv
dWRXYXRjaApiYWNrdXBzCmRhdGEgdHJhbnNmZXIKYGBgCgpGb3IgZWFjaDoKCmBgYHRleHQKUkVR
VUlSRUQKTk9UIFJFUVVJUkVECk9QVElPTkFMCmBgYAoKTmV2ZXIgb21pdCBOQVQganVzdCBiZWNh
dXNlIGl0IGlzIGV4cGVuc2l2ZS4KCklmIHRoZSBhcmNoaXRlY3R1cmUgYXZvaWRzIE5BVDoKCmBg
YHRleHQKZXhwbGFpbiB0ZWNobmljYWxseSB3aHkuCmBgYAoKLS0tCgojIDM4QS4gTTUg4oCUIGVu
ZC10by1lbmQgbGF0ZW5jeSBidWRnZXQKClRoZSBhc3NpZ25tZW50J3MgZXZlbnQgbGF0ZW5jeSBT
TE8gaXM6CgpgYGB0ZXh0CmluZ2VzdCAtPiB2aWV3ZXIgc2NyZWVuCmBgYAoKQnVpbGQgYW4gZXhw
bGljaXQgcGxhbm5pbmcgbGF0ZW5jeSBidWRnZXQgZm9yOgoKYGBgdGV4dApkdXJhYmxlIGluZ3Jl
c3MvZW5xdWV1ZQpjYW5vbmljYWwgcHJvY2Vzc2luZy93cml0ZQpmYW4tb3V0IHB1YmxpY2F0aW9u
Cm9yaWdpbi9lZGdlL25ldHdvcmsgZGVsaXZlcnkKYnJvd3NlciBwYXJzZS9yZWR1Y2VyL3JlbmRl
cgpgYGAKCkZvciBnb2FsczoKCmBgYHRleHQKdG90YWwgcDk1IGJ1ZGdldCA8PSAycwpgYGAKCkZv
ciByb3V0aW5lIGV2ZW50czoKCmBgYHRleHQKdG90YWwgcDk1IGJ1ZGdldCA8PSA1cwpgYGAKCkRv
IG5vdCBmYWJyaWNhdGUgbWVhc3VyZWQgQVdTL2Jyb3dzZXIgbGF0ZW5jeS4KCkNsYXNzaWZ5IGVh
Y2ggc3RhZ2UgYXM6CgpgYGB0ZXh0ClBPQyBtZWFzdXJlbWVudApjdXJyZW50IHNlcnZpY2UgZmFj
dApwbGFubmluZyBidWRnZXQKcHJvZHVjdGlvbiBpbmZlcmVuY2UKbm90IG1lYXN1cmVkCmBgYAoK
VGhlIHB1cnBvc2UgaXMgdG8gc2hvdyB0aGUgZGVzaWduIGhhcyBwbGF1c2libGUgaGVhZHJvb20s
IG5vdCB0byBjbGFpbSBwcm9kdWN0aW9uIHByb29mLgoKS2VlcCB0aGUgc2VwYXJhdGU6CgpgYGB0
ZXh0CmZ1bGwtaGlzdG9yeSB2aXNpYmxlIDw9MnMKYGBgCgpidWRnZXQgYXMgd2VsbC4KCi0tLQoK
IyAzOEIuIE01IOKAlCBzZXJ2aWNlIHF1b3RhcyBhbmQgY29ubmVjdGlvbi1zY2FsZSBmZWFzaWJp
bGl0eQoKRm9yIGV2ZXJ5IHNlbGVjdGVkIG1hbmFnZWQgZWRnZS9sb2FkLWJhbGFuY2luZy9mYW4t
b3V0IGNvbXBvbmVudCwgdmVyaWZ5IGN1cnJlbnQgbGltaXRzIHJlbGV2YW50IHRvOgoKYGBgdGV4
dAoxMDAsMDAwIGNvbmN1cnJlbnQgbG9uZy1saXZlZCB2aWV3ZXIgY29ubmVjdGlvbnMKKzQwLDAw
MCBjb25uZWN0aW9uIGF0dGVtcHRzIGluIDEyMCBzZWNvbmRzCjggbWF0Y2hlcyBwbHVzIGFueSBz
dWItc2hhcmRzCm9yaWdpbiBjb25uZWN0aW9ucwpyZXF1ZXN0cy9tZXNzYWdlcyBwZXIgc2Vjb25k
CmNvbm5lY3Rpb24gZHVyYXRpb24KYGBgCgpSZWNvcmQgd2hldGhlciBlYWNoIHJlbGV2YW50IHF1
b3RhIGlzOgoKYGBgdGV4dApkZWZhdWx0CmFkanVzdGFibGUKaGFyZApub3QgYXBwbGljYWJsZQpg
YGAKCklmIGEgcXVvdGEgaW5jcmVhc2UgaXMgcmVxdWlyZWQgYmVmb3JlIHByb2R1Y3Rpb246Cgpg
YGB0ZXh0CnN0YXRlIGl0IGFzIGEgcHJlLWxhdW5jaCByZXF1aXJlbWVudApkbyBub3QgaW1wbHkg
dGhlIGRlZmF1bHQgcXVvdGEgYWxyZWFkeSBzdXBwb3J0cyB0aGUgd29ya2xvYWQKYGBgCgpGb3Ig
c2VsZi1ob3N0ZWQgY29tcG9uZW50cywgcmVwbGFjZSBzZXJ2aWNlIHF1b3RhcyB3aXRoIGV4cGxp
Y2l0OgoKYGBgdGV4dApPUy9wcm9jZXNzL21lbW9yeS9maWxlLWRlc2NyaXB0b3IvY29ubmVjdGlv
biBwbGFubmluZyBsaW1pdHMKYGBgCgotLS0KCiMgMzhDLiBNNSDigJQgcmVnaW9uYWwgbGF0ZW5j
eSBtdXN0IG5vdCBiZSBoaWRkZW4gYnkgYSBnbG9iYWwgY2xhaW0KCkV2YWx1YXRlIEV1cm9wZSBh
bmQgTm9ydGggQW1lcmljYSBzZXBhcmF0ZWx5IGF0IHRoZSBkZXNpZ24taW5mZXJlbmNlIGxldmVs
LgoKRG8gbm90IHdyaXRlOgoKYGBgdGV4dApnbG9iYWwgcDk1IHNob3VsZCBiZSBmaW5lCmBgYAoK
aWYgb25lIHJlZ2lvbiBoYXMgYSBzeXN0ZW1hdGljYWxseSBsb25nZXIgb3JpZ2luIHBhdGguCgpG
b3IgZWFjaCBhdWRpZW5jZSByZWdpb24sIHJlYXNvbiBhYm91dDoKCmBgYHRleHQKdmlld2VyIC0+
IGVkZ2UKZWRnZS9saXZlLXN0cmVhbSBvcmlnaW4gcGF0aApzZWxlY3RlZCBvcmlnaW4gcmVnaW9u
CmV4cGVjdGVkIHF1YWxpdGF0aXZlIFJUVCBjb250cmlidXRpb24KcmVtYWluaW5nIGxhdGVuY3kg
YnVkZ2V0CmBgYAoKRG8gbm90IGZhYnJpY2F0ZSBtZWFzdXJlZCByZWdpb25hbCBwOTUgdmFsdWVz
LgoKSWYgb25lIHJlZ2lvbiBhcHBlYXJzIHVuYWJsZSB0byBmaXQgdGhlIDJzIGdvYWwgYnVkZ2V0
IHVuZGVyIHRoZSBzZWxlY3RlZCBzaW5nbGUtb3JpZ2luIGRlc2lnbjoKCmBgYHRleHQKcmV0dXJu
IHRvIE00LgpgYGAKCi0tLQoKIyAzOEQuIE01IOKAlCBjb25mbGljdGluZyBhdXRob3JpdGF0aXZl
IHNvdXJjZXMKCklmIHR3byBjdXJyZW50IHByaW1hcnkgc291cmNlcyBhcHBlYXIgaW5jb25zaXN0
ZW50IGFib3V0OgoKYGBgdGV4dApwcmljZQpxdW90YQpyZWdpb25hbCBhdmFpbGFiaWxpdHkKdGlt
ZW91dApwcm90b2NvbCBiZWhhdmlvcgpmZWF0dXJlIGVsaWdpYmlsaXR5CmBgYAoKZG8gbm90IHNp
bGVudGx5IHBpY2sgdGhlIGNvbnZlbmllbnQgdmFsdWUuCgpSZXNvbHZlIHRoZSBkaXNjcmVwYW5j
eSB1c2luZzoKCmBgYHRleHQKbmV3ZXIgb2ZmaWNpYWwgZG9jdW1lbnRhdGlvbgpzZXJ2aWNlLXNw
ZWNpZmljIHByaWNpbmcgcGFnZQpBV1MgUHJpY2UgTGlzdC9vZmZpY2lhbCBjYWxjdWxhdG9yIHdo
ZXJlIGFwcHJvcHJpYXRlCnN1cHBvcnRpbmcgb2ZmaWNpYWwgcmVsZWFzZSBub3RlcwpgYGAKCm9y
IHJlY29yZCB0aGUgdW5jZXJ0YWludHkgYW5kIHVzZSB0aGUgY29uc2VydmF0aXZlIGludGVycHJl
dGF0aW9uLgoKLS0tCgojIDM4RS4gTTUg4oCUIHZlcmlmeSBsaXZlLXN0cmVhbSBjb25uZWN0aW9u
IHNlbWFudGljcyB0aHJvdWdoIHRoZSBlZGdlCgpJZiBDbG91ZEZyb250IG9yIGFub3RoZXIgZWRn
ZSBwcm94eSBmcm9udHMgU1NFL1dlYlNvY2tldCB0cmFmZmljLCB2ZXJpZnkgZnJvbSBjdXJyZW50
IG9mZmljaWFsIGRvY3VtZW50YXRpb246CgpgYGB0ZXh0CndoZXRoZXIgdmlld2VyIGxvbmctbGl2
ZWQgc3RyZWFtcyBjb3JyZXNwb25kIHRvIGRlZGljYXRlZCBvcmlnaW4gcmVxdWVzdHMvY29ubmVj
dGlvbnMKd2hldGhlciBIVFRQLzIvMyB2aWV3ZXIgbXVsdGlwbGV4aW5nIGNoYW5nZXMgb3JpZ2lu
IGNvbm5lY3Rpb24gY291bnQKd2hldGhlciBlZGdlIG5vZGVzIGNhY2hlL2NvYWxlc2NlIGFueSBs
aXZlLXN0cmVhbSBwYXlsb2FkCm9yaWdpbiBjb25uZWN0aW9uIGxpbWl0cy90aW1lb3V0cwpjb25u
ZWN0aW9uIHJldXNlIGJlaGF2aW9yCmBgYAoKU2l6ZSB0aGUgb3JpZ2luL2xvYWQtYmFsYW5jZXIv
ZmFuLW91dCB0aWVyIGZvciB0aGUgZG9jdW1lbnRlZC93b3JzdCBkZWZlbnNpYmxlIGNvbm5lY3Rp
b24gbW9kZWwuCgpEbyBub3QgYXNzdW1lIENETiBwcmVzZW5jZSB0dXJucyAxMDAsMDAwIHZpZXdl
ciBzdHJlYW1zIGludG8gYSBzbWFsbCBudW1iZXIgb2Ygb3JpZ2luIGNvbm5lY3Rpb25zLgoKLS0t
CgojIDM4Ri4gTTUg4oCUIGNvbm5lY3Rpb24tb3JpZW50ZWQgYmlsbGluZyBtYXRoCgpGb3Igc2Vs
ZWN0ZWQgY29ubmVjdGlvbi1vcmllbnRlZCBzZXJ2aWNlcywgbW9kZWwgdGhlaXIgYWN0dWFsIGJp
bGxpbmcgZGltZW5zaW9ucy4KCkV4YW1wbGVzIG1heSBpbmNsdWRlOgoKYGBgdGV4dApDbG91ZEZy
b250OgogICAgcmVxdWVzdC9jb25uZWN0aW9uIHRyZWF0bWVudCArIHRyYW5zZmVycmVkIGJ5dGVz
IHVuZGVyIHRoZSBjdXJyZW50IHByaWNpbmcgbW9kZWwKCk5MQjoKICAgIG5ldyBjb25uZWN0aW9u
cy9mbG93cwogICAgYWN0aXZlIGNvbm5lY3Rpb25zL2Zsb3dzCiAgICBwcm9jZXNzZWQgYnl0ZXMK
ICAgIE5MQ1UgZGltZW5zaW9ucwoKbWFuYWdlZCBmYW4tb3V0OgogICAgY29ubmVjdGlvbiBtaW51
dGVzCiAgICBtZXNzYWdlcy9ldmVudHMKICAgIHBlci1yZWNpcGllbnQgZGVsaXZlcmllcwogICAg
dHJhbnNmZXJyZWQgYnl0ZXMKYGBgCgpVc2UgdGhlIGV4YWN0IGN1cnJlbnQgc2VsZWN0ZWQtc2Vy
dmljZSBtb2RlbC4KCkZvciBTU0Ugc3BlY2lmaWNhbGx5OgoKYGBgdGV4dApkbyBub3QgY291bnQg
ZWFjaCBldmVudCBpbnNpZGUgb25lIG9wZW4gU1NFIHJlc3BvbnNlIGFzIGEgbmV3IEhUVFAgcmVx
dWVzdCB1bmxlc3MgYmlsbGluZyBkb2N1bWVudGF0aW9uIGFjdHVhbGx5IGRvZXMKYGBgCgpBbHNv
IGF2b2lkIHRoZSBvcHBvc2l0ZSBlcnJvcjoKCmBgYHRleHQKZG8gbm90IGlnbm9yZSBuZXcvcmVj
b25uZWN0IHJlcXVlc3Qgdm9sdW1lIGR1cmluZyBraWNrb2ZmLCBkZXBsb3ksIGFuZCBmYWlsdXJl
IHJlY292ZXJ5CmBgYAoKLS0tCgojIDM5LiBNNSDigJQgY29zdCBtb2RlbCBpbnB1dHMKCkFzc2ln
bm1lbnQgZmFjdHM6CgpgYGB0ZXh0CjEwMCwwMDAgcGVhayB2aWV3ZXJzCjggbWF0Y2hlcwp+MTAg
ZXZlbnRzL3Mgc3RlYWR5Cn41MCBldmVudHMvcyBidXJzdAorNDBrIGluIDEyMHMKNjAlIEVVIC8g
NDAlIE5BCiQzLDAwMC9tb250aCBwZWFrIGJ1ZGdldApgYGAKCk5vdCBhc3NpZ25tZW50IGZhY3Rz
OgoKYGBgdGV4dAp2aWV3ZXItaG91cnMvbW9udGgKYXZlcmFnZSBzZXNzaW9uIGR1cmF0aW9uCmF2
ZXJhZ2UgcGF5bG9hZCBzaXplCm1vbnRobHkgbnVtYmVyIG9mIG1hdGNoZXMKbG9iYnktdmlld2Vy
IGZyYWN0aW9uCmhvdC1tYXRjaC12aWV3ZXIgZnJhY3Rpb24KYXZlcmFnZSBjb25jdXJyZW5jeQpg
YGAKClVua25vd25zIG11c3QgYmU6CgpgYGB0ZXh0CnBsYW5uaW5nIGFzc3VtcHRpb25zCm9yIHNl
bnNpdGl2aXR5IHZhcmlhYmxlcy4KYGBgCgotLS0KCiMgMzlBLiBNNSDigJQgcHJpY2luZyBtZXRh
ZGF0YSBhbmQgYmlsbGluZyBiYXNpcwoKVGhlIGNvc3QgbW9kZWwgaGVhZGVyIG11c3QgZXhwbGlj
aXRseSBzdGF0ZToKCmBgYHRleHQKY3VycmVuY3kKcHJpY2luZyByZXRyaWV2YWwgZGF0ZQpBV1Mg
cmVnaW9uKHMpCkNsb3VkRnJvbnQgcHJpY2luZyBtb2RlbC9wbGFuCm9uLWRlbWFuZCB2cyByZXNl
cnZlZC9jb21taXRtZW50IGJhc2lzCmhvdXJzLXBlci1tb250aCBjb252ZW50aW9uCkdCIHZzIEdp
QiBiaWxsaW5nLXVuaXQgY29udmVudGlvbgp0YXggZXhjbHVkZWQgdW5sZXNzIHRoZSBwcmljaW5n
IHNvdXJjZSBzdGF0ZXMgb3RoZXJ3aXNlCmBgYAoKSWYgY29tcGFyaW5nIG5vbi1BV1MgYWx0ZXJu
YXRpdmVzLCBzdGF0ZSB0aGVpciBiaWxsaW5nIGN1cnJlbmN5L3JlZ2lvbiBhc3N1bXB0aW9ucyB0
b28uCgpOZXZlciBtaXggcmF0ZXMgZnJvbSBkaWZmZXJlbnQgcmVnaW9ucyBvciBwcmljaW5nIG1v
ZGVzIHdpdGhvdXQgbGFiZWxpbmcgdGhlbS4KCi0tLQoKIyAzOUIuIE01IOKAlCBsaXZlLWV2ZW50
LWhvdXJzIC8gaW5nZXN0LXZvbHVtZSBzZW5zaXRpdml0eQoKVmlld2VyLWhvdXJzIGFsb25lIGRv
IG5vdCBkZXRlcm1pbmU6CgpgYGB0ZXh0CmluZ3Jlc3MgcmVxdWVzdHMKU1FTIG1lc3NhZ2VzCnBy
b2Nlc3Nvci9MYW1iZGEgd29yawpEeW5hbW9EQiB3cml0ZXMKY2Fub25pY2FsIGV2ZW50IHN0b3Jh
Z2UKYGBgCgpUaGUgYXNzaWdubWVudCBnaXZlcyBwZWFrIGV2ZW50IHJhdGUsIG5vdCBtb250aGx5
IGxpdmUtbWF0Y2ggZHVyYXRpb24uCgpJbnRyb2R1Y2UgYW4gZXhwbGljaXQgdmFyaWFibGUgc3Vj
aCBhczoKCmBgYHRleHQKTElWRV9NQVRDSF9IT1VSU19QRVJfTU9OVEgKYGBgCgpvcjoKCmBgYHRl
eHQKQUNUSVZFX0VWRU5UX1NUUkVBTV9IT1VSU19QRVJfTU9OVEgKYGBgCgpUaGVuIGRlcml2ZToK
CmBgYHRleHQKc3RlYWR5IGV2ZW50cy9tb250aApidXJzdC1ldmVudCBzZW5zaXRpdml0eQppbmdy
ZXNzL0FQSS9hZGFwdGVyIHJlcXVlc3RzCnF1ZXVlIG1lc3NhZ2VzCnByb2Nlc3NvciBpbnZvY2F0
aW9ucy9kdXJhdGlvbgpjYW5vbmljYWwgd3JpdGVzCnN0b3JhZ2UKYGBgCgpVc2UgYSBzZW5zaXRp
dml0eSByYW5nZSByYXRoZXIgdGhhbiBpbnZlbnRpbmcgYSBtb250aGx5IHNjaGVkdWxlLgoKSWYg
dGhlc2UgY29zdHMgYXJlIG5lZ2xpZ2libGUgdmVyc3VzIHZpZXdlciBkZWxpdmVyeSwgcHJvdmUg
dGhhdCB3aXRoIGFyaXRobWV0aWMuCgotLS0KCiMgMzlDLiBNNSDigJQgY2Fub25pY2FsLWhpc3Rv
cnkgcmV0ZW50aW9uL3N0b3JhZ2UgYXNzdW1wdGlvbgoKVGhlIGxpdmUgcHJvZHVjdCBuZWVkcyBh
Y3RpdmUtbWF0Y2ggaGlzdG9yeSwgYnV0IHRoZSBhc3NpZ25tZW50IGRvZXMgbm90IHNwZWNpZnkg
aG93IGxvbmcgY29tcGxldGVkLW1hdGNoIGhpc3RvcnkgaXMgcmV0YWluZWQuCgpDaG9vc2UgYW5k
IGxhYmVsIGEgcGxhbm5pbmcgYXNzdW1wdGlvbiBmb3I6CgpgYGB0ZXh0CmFjdGl2ZS1tYXRjaCBj
YW5vbmljYWwgZXZlbnQgcmV0ZW50aW9uCmNvbXBsZXRlZC1tYXRjaCByZXRlbnRpb24KZHVyYWJs
ZSBzdG9yYWdlIGxpZmVjeWNsZQpkZWxpdmVyeS1jYWNoZSBUVEwvaGlzdG9yeSBsaWZldGltZQpg
YGAKCkNvc3QgdGhhdCBwb2xpY3kuCgpEbyBub3QgY2xhaW0gaW5kZWZpbml0ZSBhcmNoaXZhbCBy
ZXRlbnRpb24gaXMgYW4gYXNzaWdubWVudCByZXF1aXJlbWVudC4KCi0tLQoKIyA0MC4gTTUg4oCU
IHZpZXdlci1kZWxpdmVyeSBtYXRoCgpEbyBub3QgaW5jb3JyZWN0bHkgY29tcHV0ZToKCmBgYHRl
eHQKMTAgZXZlbnRzL3MgKiAxMDAsMDAwIHZpZXdlcnMKYGBgCgp1bmxlc3MgYWxsIHZpZXdlcnMg
cmVjZWl2ZSBhbGwgZXZlbnRzLgoKTW9kZWw6CgpgYGB0ZXh0Cm1hdGNoIHZpZXdlcgpsb2JieSB2
aWV3ZXIKOC1tYXRjaCBkaXN0cmlidXRpb24KaG90LW1hdGNoIGNhc2UKYGBgCgpEZXJpdmU6Cgpg
YGB0ZXh0CmV2ZW50cy92aWV3ZXIvc2VjCmJ5dGVzL3ZpZXdlci1ob3VyCmVkZ2UgdHJhbnNmZXIv
bW9udGgKYGBgCgpTaG93IGZvcm11bGFzLgoKLS0tCgojIDQxLiBNNSDigJQgcGF5bG9hZCBzaXpl
CgpEZXJpdmUgYSBkZWZlbnNpYmxlIHJhbmdlIGZyb206CgpgYGB0ZXh0CmN1cnJlbnQgUE9DIGV2
ZW50IHNjaGVtYQpKU09OIHNlcmlhbGl6YXRpb24KU1NFIGZyYW1pbmcKYGBgCgpVc2U6CgpgYGB0
ZXh0CnNtYWxsCmJhc2UKbGFyZ2UKYGBgCgpvciBlcXVpdmFsZW50IHNlbnNpdGl2aXR5LgoKU3Rh
dGU6CgpgYGB0ZXh0CnN5bnRoZXRpYyBQT0MgcGF5bG9hZCAhPSByZWFsIHByb3ZpZGVyIHBheWxv
YWQgZmFjdC4KYGBgCgotLS0KCiMgNDIuIE01IOKAlCBtb250aGx5IHBlYWsgdmlld2VyLWhvdXJz
CgpUaGUgYXNzaWdubWVudCBkb2VzIG5vdCBkZWZpbmUgbW9udGhseSBwZWFrIGR1cmF0aW9uLgoK
U2hvdyBzZW5zaXRpdml0eS4KCkF0IG1pbmltdW0gY29uc2lkZXI6CgpgYGB0ZXh0CjMwCjYwCjEy
MAoyNDAKNzIwLzczMCBwZWFrIHZpZXdlci1ob3Vycy9tb250aApgYGAKCm9yIGEgYmV0dGVyIGp1
c3RpZmllZCByYW5nZS4KCkNhbGN1bGF0ZSB3aGVyZSBwb3NzaWJsZToKCmBgYHRleHQKYnVkZ2V0
IGJyZWFrLWV2ZW4gdmlld2VyLWhvdXJzLgpgYGAKCi0tLQoKIyA0My4gTTUg4oCUIGZsZWV0LXNp
emUgc2Vuc2l0aXZpdHkKCkZvciB0aGUgZmluYWwgZmFuLW91dCBhcmNoaXRlY3R1cmUsIG1vZGVs
IHNldmVyYWwgcGxhdXNpYmxlIHByb2R1Y3Rpb24gZmxlZXQgc2l6ZXMvdG9wb2xvZ2llcy4KCkZv
ciBleGFtcGxlOgoKYGBgdGV4dAptaW5pbXVtIEhBIGJhc2VsaW5lCmJhc2UgcmVjb21tZW5kYXRp
b24KaGlnaGVyLWhlYWRyb29tIGNhc2UKYGBgCgpEbyBub3QgdXNlIGEgbWVhbmluZ2xlc3MgMi8z
LzQtbm9kZSB0YWJsZSBpZiB0aGUgYWN0dWFsIGRlc2lnbiBwYXJ0aXRpb25zIGRpZmZlcmVudGx5
LgoKRm9yIGVhY2g6CgpgYGB0ZXh0CmNhcGFjaXR5IGFzc3VtcHRpb24KZml4ZWQgbW9udGhseSBj
b3N0CmF2YWlsYWJpbGl0eSB0cmFkZS1vZmYKaG90LW1hdGNoIGJlaGF2aW9yCmBgYAoKVGhlbiBj
aG9vc2Ugb25lIGZpbmFsIHByb3Bvc2FsIGJhc2VsaW5lLgoKLS0tCgojIDQzQS4gTTUg4oCUIGJv
dW5kIHRoZSBmdWxsLWhpc3RvcnkgcGF0aAoKVGhlIGFzc2lnbm1lbnQgcmVxdWlyZXM6CgpgYGB0
ZXh0CmZ1bGwgbWF0Y2ggaGlzdG9yeSB2aXNpYmxlIHdpdGhpbiAyIHNlY29uZHMKYGBgCgpNYWtl
IHRoaXMgZGVzaWduIGNsYWltIHF1YW50aXRhdGl2ZWx5IGRlZmVuc2libGUgd2l0aG91dCBwcmV0
ZW5kaW5nIGl0IHdhcyBwcm9kdWN0aW9uLXRlc3RlZC4KCkVzdGltYXRlL2JvdW5kOgoKYGBgdGV4
dApyZXByZXNlbnRhdGl2ZSBldmVudCBieXRlcwpTU0UvSlNPTiBmcmFtaW5nIHdoZXJlIHJlbGV2
YW50CmV2ZW50cyBwZXIgbWF0Y2ggb3ZlciBhIHJlYXNvbmFibGUgbWF0Y2gtZHVyYXRpb24gYXNz
dW1wdGlvbgpmdWxsLWhpc3RvcnkgYnl0ZXMgZm9yIG9uZSBtYXRjaApvcmlnaW4vc2VydmVyIHBy
b2Nlc3NpbmcgcGF0aAp2aWV3ZXIgdHJhbnNmZXIgdGltZSBzZW5zaXRpdml0eQpicm93c2VyIHJl
Y29uc3RydWN0aW9uL3JlbmRlcmluZyByZW1haW5zIHVubWVhc3VyZWQKYGBgCgpJZiBtYXRjaCBk
dXJhdGlvbiBpcyBhc3N1bWVkOgoKYGBgdGV4dApsYWJlbCBpdCBQTEFOTklOR19BU1NVTVBUSU9O
LgpgYGAKCklmIHRoZSBmaW5hbCBkZXNpZ24gc2VuZHMgYSBjb21wYWN0IGNhbm9uaWNhbCBzbmFw
c2hvdCBwbHVzIGV2ZW50IGhpc3RvcnksIGRpc3Rpbmd1aXNoIHRoZSBzaXplcy4KCkRvIG5vdCB1
c2UgYSBzaW5nbGUgc3ludGhldGljIFBPQyBwYXlsb2FkIHNpemUgYXMgYSByZWFsLXByb3ZpZGVy
IGZhY3QuCgotLS0KCiMgNDNCLiBNNSDigJQgTisxL2RlcGxveW1lbnQgY29zdCBtdXN0IGJlIGlu
Y2x1ZGVkCgpDb3N0IHRoZSBhcmNoaXRlY3R1cmUgdGhhdCBhY3R1YWxseSBzYXRpc2ZpZXMgbGl2
ZSBkZXBsb3ltZW50L2ZhaWx1cmUgYmVoYXZpb3IuCgpEbyBub3QgcHJpY2U6CgpgYGB0ZXh0Cm1p
bmltdW0gbm9kZXMgbmVlZGVkIG9ubHkgd2hlbiBhbGwgbm9kZXMgYXJlIGhlYWx0aHkKYGBgCgp3
aGlsZSBwcm9wb3Npbmc6CgpgYGB0ZXh0Ck4rMSAvIHJvbGxpbmcgcmVwbGFjZW1lbnQKYGBgCgpG
b3IgdGhlIGZpbmFsIGJhc2VsaW5lIHNob3c6CgpgYGB0ZXh0Cm5vcm1hbCBub2RlIGNvdW50Cm1p
bmltdW0gaGVhbHRoeSBjb3VudCBkdXJpbmcgZGVwbG95bWVudApzcGFyZS9mYWlsb3ZlciBjYXBh
Y2l0eQpjb3N0IG9mIHRoYXQgYmFzZWxpbmUKYGBgCgpJZiBhdXRvc2NhbGluZyBzdXBwbGllcyB0
ZW1wb3JhcnkgaGVhZHJvb20sIGluY2x1ZGUgdGhlIGFzc3VtZWQgZHVyYXRpb24vcmF0ZSBvciBl
eHBsYWluIHdoeSBpdCBpcyBpbW1hdGVyaWFsLgoKLS0tCgojIDQzQy4gTTUg4oCUIGxvbmctbGl2
ZWQgU1NFIG9wZXJhdGlvbmFsIHJlcXVpcmVtZW50cwoKSWYgU1NFIHJlbWFpbnMgc2VsZWN0ZWQs
IHZlcmlmeSBjdXJyZW50IG9mZmljaWFsIGJlaGF2aW9yIHJlbGV2YW50IHRvIGxvbmctbGl2ZWQg
Y29ubmVjdGlvbnM6CgpgYGB0ZXh0CkNsb3VkRnJvbnQvb3JpZ2luIHRpbWVvdXQgc2VtYW50aWNz
CmlkbGUgdGltZW91dCBiZWhhdmlvcgprZWVwYWxpdmUvY29tbWVudCBoZWFydGJlYXQgbmVlZCBp
ZiBhbnkKbG9hZC1iYWxhbmNlciBpZGxlIHRpbWVvdXQgaWYgYXBwbGljYWJsZQpjb25uZWN0aW9u
IGRyYWluaW5nCnJldHJ5L3JlY29ubmVjdCBiZWhhdmlvcgpgYGAKCklmIGEgaGVhcnRiZWF0IGlz
IHJlcXVpcmVkIHRvIGtlZXAgaW50ZXJtZWRpYXJpZXMgaGVhbHRoeToKCmBgYHRleHQKaW5jbHVk
ZSBpdCBpbiBhcmNoaXRlY3R1cmUgcmVhc29uaW5nIGFuZCBiYW5kd2lkdGggc2Vuc2l0aXZpdHku
CmBgYAoKRG8gbm90IGFzc3VtZSBXZWJTb2NrZXQgdGltZW91dCBkb2N1bWVudGF0aW9uIGF1dG9t
YXRpY2FsbHkgYXBwbGllcyB0byBTU0UuCgotLS0KCiMgNDNELiBNNSDigJQgYXVkaWVuY2UgZ2Vv
Z3JhcGh5IGluIHRyYW5zZmVyIHByaWNpbmcKCklmIGVkZ2UvZGF0YS10cmFuc2ZlciBwcmljZSB2
YXJpZXMgYnkgZ2VvZ3JhcGh5IG9yIHByaWNpbmcgbW9kZWwsIHJlZmxlY3QgdGhlIGFzc2lnbm1l
bnQnczoKCmBgYHRleHQKNjAlIEV1cm9wZQo0MCUgTm9ydGggQW1lcmljYQpgYGAKCmluIHRoZSBj
b3N0IG1vZGVsIHdoZXJlIG1hdGVyaWFsLgoKSWYgYSBmbGF0LXJhdGUgcGxhbiBlbGltaW5hdGVz
IHRoZSBkaXN0aW5jdGlvbiBmb3IgdGhlIG1vZGVsZWQgdXNhZ2U6CgpgYGB0ZXh0CnN0YXRlIHRo
YXQgZnJvbSBjdXJyZW50IG9mZmljaWFsIHByaWNpbmcuCmBgYAoKRG8gbm90IHVzZSBhIHNpbmds
ZSBjaGVhcGVzdC1yZWdpb24gZWdyZXNzIHJhdGUgZm9yIGFsbCB2aWV3ZXJzIHVubGVzcyB0aGF0
IGlzIGhvdyB0aGUgc2VsZWN0ZWQgcHJpY2luZyBtb2RlbCBhY3R1YWxseSBiaWxscy4KCi0tLQoK
IyA0M0UuIE01IOKAlCBwcmljZSBwcmUtcHJvdmlzaW9uZWQga2lja29mZiBjYXBhY2l0eQoKVGhl
IGJhc2VsaW5lIGNvc3QgbXVzdCByZWZsZWN0IHRoZSBNNCBzdXJnZSBzdHJhdGVneS4KCklmIHRo
ZSBkZXNpZ24gdXNlcyBzZWxmLWhvc3RlZCBkZWxpdmVyeSBub2RlczoKCmBgYHRleHQKcHJpY2Ug
dGhlIHBlYWsgY2FwYWNpdHkgYWxyZWFkeSB3YXJtIGJlZm9yZSBraWNrb2ZmCmluY2x1ZGUgTisx
L2RlcGxveS9mYWlsdXJlIHNwYXJlIGNhcGFjaXR5CmRvIG5vdCBhc3N1bWUgdGhlICs0MGsgcnVz
aCBpcyBzZXJ2ZWQgYnkgbm9kZXMgYmlsbGVkIG9ubHkgYWZ0ZXIgcmVhY3RpdmUgc2NhbGUtdXAK
YGBgCgpJZiBzY2hlZHVsZWQgcHJlLXNjYWxpbmcgbWVhbnMgcGVhayBub2RlcyBhcmUgbm90IG5l
ZWRlZCA3MzAgaG91cnMvbW9udGgsIG1vZGVsOgoKYGBgdGV4dApiYXNlIGFsd2F5cy1vbiBIQSBm
bGVldApzY2hlZHVsZWQgcGVhay1jYXBhY2l0eSBob3Vycy9tb250aApzZW5zaXRpdml0eSBmb3Ig
aG93IG9mdGVuIHBlYWsgZml4dHVyZXMgb2NjdXIKYGBgCgpMYWJlbCBmaXh0dXJlL3BlYWsgaG91
cnMgYXMgcGxhbm5pbmcgYXNzdW1wdGlvbnMuCgotLS0KCiMgNDNGLiBNNSDigJQgZnVsbC1oaXN0
b3J5IGJyb3dzZXItd29yayBzZW5zaXRpdml0eQoKRXh0ZW5kIHRoZSA8PTJzIGZ1bGwtaGlzdG9y
eSBib3VuZCBiZXlvbmQgdHJhbnNmZXIgYnl0ZXMuCgpBdCBtaW5pbXVtIGVzdGltYXRlIG9yIHJl
YXNvbiBhYm91dDoKCmBgYHRleHQKZXZlbnQgY291bnQKSlNPTiBwYXJzZS9yZWR1Y2VyIHdvcmsK
aW5pdGlhbCBSZWFjdCByZW5kZXIKZXZlbnQtbGlzdCBET00gc2l6ZQp2aXJ0dWFsaXphdGlvbi9p
bmNyZW1lbnRhbCByZW5kZXJpbmcgaWYgbmVlZGVkCmBgYAoKRG8gbm90IGludmVudCBhIG1lYXN1
cmVkIGJyb3dzZXIgcDk1LgoKVGhlIGdvYWwgaXMgdG8gc2hvdyB0aGF0IHRoZSBwcm9wb3NlZCBm
cm9udGVuZCBhdm9pZHMgYW4gb2J2aW91c2x5IHVuYm91bmRlZCByZW5kZXIgcGF0aC4KCi0tLQoK
IyA0NC4gTTUg4oCUIGNvbXBsZXRlIGNvc3QgbGVkZ2VyCgpJbmNsdWRlIGFsbCBzZWxlY3RlZCBt
YXRlcmlhbCBjb3N0cy4KClBvc3NpYmxlIGxpbmVzOgoKYGBgdGV4dApDbG91ZEZyb250ClMzCkFQ
SSBHYXRld2F5ClNRUyBGSUZPCkxhbWJkYQpEeW5hbW9EQgpsb2FkIGJhbGFuY2VyCnJvdXRpbmcg
dGllciBpZiBuZWVkZWQKRUMyCkVCUwpFbGFzdGlDYWNoZQpDbG91ZFdhdGNoClJvdXRlIDUzClZQ
QyBlbmRwb2ludHMKTkFUCmNyb3NzLUFaIHRyYW5zZmVyCmludGVybmV0L2RhdGEgdHJhbnNmZXIK
YmFja3VwL3N0b3JhZ2UKYGBgCgpGb3IgZWFjaDoKCmBgYHRleHQKdW5pdCBwcmljZQp1bml0CnJl
Z2lvbgpkYXRlCnNvdXJjZQpxdWFudGl0eQpmb3JtdWxhCm1vbnRobHkgdG90YWwKYGBgCgotLS0K
CiMgNDUuIE01IOKAlCBjb3N0IGNvbmNsdXNpb24KClNlcGFyYXRlOgoKYGBgdGV4dApmaXhlZCBt
b250aGx5IGluZnJhc3RydWN0dXJlIGNvc3QKdmFyaWFibGUgdmlld2VyLWRlbGl2ZXJ5IGNvc3QK
dmFyaWFibGUgaW5nZXN0L3N0YXRlIGNvc3QKZG9taW5hbnQgY29zdCBkcml2ZXIKc2Vuc2l0aXZp
dHkKYnVkZ2V0IGJyZWFrLWV2ZW4KYGBgCgpDbGFzc2lmeSBmaW5hbCBhcmNoaXRlY3R1cmU6Cgpg
YGB0ZXh0CldJVEhJTiBCVURHRVQKQ09ORElUSU9OQUxMWSBXSVRISU4gQlVER0VUCk9VVFNJREUg
QlVER0VUCmBgYAoKSWYgb3V0c2lkZToKCmBgYHRleHQKcmV0dXJuIHRvIE00LgpgYGAKCkRvIG5v
dCBmb3JjZSB0aGUgbW9kZWwgdW5kZXIgJDMsMDAwIHRocm91Z2ggdW5yZWFsaXN0aWMgYXNzdW1w
dGlvbnMuCgotLS0KCiMgNDYuIE01IOKAlCBnZW9ncmFwaHkKCk1ha2Ugb25lIGZpbmFsIGdlb2dy
YXBoaWMgZGVjaXNpb24uCgpTdGF0ZToKCmBgYHRleHQKc2VsZWN0ZWQgQVdTIHJlZ2lvbi9vcmln
aW4gc3RyYXRlZ3kKd2h5CmhvdyBDbG91ZEZyb250L2VkZ2UgaXMgdXNlZAp3aHkgbXVsdGktcmVn
aW9uIGlzIG9yIGlzIG5vdCBqdXN0aWZpZWQKYGBgCgpEbyBub3QgaW52ZW50IG1lYXN1cmVkIEVV
L05BIHA5NS4KClVzZToKCmBgYHRleHQKcHJvZHVjdGlvbiBpbmZlcmVuY2UgYmFzZWQgb24gbmV0
d29yayB0b3BvbG9neQpgYGAKCndoZXJlIGFwcHJvcHJpYXRlLgoKLS0tCgojIDQ3LiBNNSDigJQg
UE9DLXRvLXByb2R1Y3Rpb24gbWFwcGluZwoKQ3JlYXRlIGEgc3RyaWN0IHRhYmxlOgoKYGBgdGV4
dApBU1NJR05NRU5UX0ZBQ1QKQ1VSUkVOVF9PRkZJQ0lBTF9GQUNUClBPQ19NRUFTVVJFTUVOVApJ
TlZBTElEX0hJU1RPUklDQUxfUE9DX01FQVNVUkVNRU5UCkRJUkVDVF9BUkNISVRFQ1RVUkVfT0JT
RVJWQVRJT04KQ0FMQ1VMQVRJT04KUExBTk5JTkdfQVNTVU1QVElPTgpQUk9EVUNUSU9OX0lORkVS
RU5DRQpVTlJFU09MVkVEX0VYVEVSTkFMX0FTU1VNUFRJT04KYGBgCgpVc2UgaXQgdG8gcHJldmVu
dCBNMy9GMSBvdmVyY2xhaW0gYW5kIGhpc3RvcmljYWwtcTUgY29uZnVzaW9uLgoKRXhwbGljaXRs
eSBtYXJrOgoKYGBgdGV4dApyZWFsIHByb3ZpZGVyIGJlaGF2aW9yID0gbm90IG1lYXN1cmVkCmJy
b3dzZXIgcmVuZGVyaW5nID0gbm90IG1lYXN1cmVkCnJlYWwgRVUvTkEgSW50ZXJuZXQgPSBub3Qg
bWVhc3VyZWQKYWN0dWFsIEFXUyBkZXBsb3ltZW50ID0gbm90IG1lYXN1cmVkCmFjdHVhbCB3ZWVr
bHkgZGVwbG95ID0gbm90IG1lYXN1cmVkCmFjdHVhbCBwcm9kdWN0aW9uIHNwZW5kID0gbm90IG1l
YXN1cmVkCmBgYAoKLS0tCgojIDQ3QS4gTTUg4oCUIGRlY2lzaW9uIHByb3ZlbmFuY2UsIG5vdCBv
bmx5IG51bWJlciBwcm92ZW5hbmNlCgpUaGUgYXNzaWdubWVudCBzYXlzOgoKYGBgdGV4dApFdmVy
eSBudW1iZXIgYW5kIGV2ZXJ5IGRlY2lzaW9uIGluIHRoZSBzdWJtaXNzaW9uIHNob3VsZCBiZSB5
b3VycyB0byBzdGFuZCBiZWhpbmQgYW5kIGV4cGxhaW4uCmBgYAoKQmVmb3JlIGNsb3NpbmcgTTUs
IGNyZWF0ZSBvciBleHRlbmQgYW4gaW50ZXJuYWwgZGVjaXNpb24gbGVkZ2VyIGNvdmVyaW5nIGV2
ZXJ5IG1hdGVyaWFsIGZpbmFsIGNob2ljZToKCmBgYHRleHQKZGVjaXNpb24Kc2VsZWN0ZWQgb3B0
aW9uCnN0cm9uZ2VzdCByZWplY3RlZCBhbHRlcm5hdGl2ZQpyZWFzb24gd2lubmVyIHdvbgpldmlk
ZW5jZS9zb3VyY2UKdHJhZGUtb2ZmIGFjY2VwdGVkCndoYXQgd291bGQgbWFrZSB0aGUgZGVjaXNp
b24gY2hhbmdlCmBgYAoKQXQgbWluaW11bSBjb3ZlcjoKCmBgYHRleHQKU1NFIHZzIFdlYlNvY2tl
dApmYW4tb3V0IHRlY2hub2xvZ3kKZmFuLW91dCBwYXJ0aXRpb25pbmcvcm91dGluZwpoaXN0b3J5
L3JlcGxheSBtb2RlbApjYW5vbmljYWwgc3RhdGUgc3RvcmUKcXVldWUvb3JkZXIgbW9kZWwKbG9h
ZCBiYWxhbmNlci9yb3V0aW5nIGxheWVyClJlZGlzL1ZhbGtleS9jYWNoZSBjaG9pY2UgaWYgYW55
Cm9yaWdpbiByZWdpb24Kc2luZ2xlLXJlZ2lvbiB2cyBtdWx0aS1yZWdpb24KQ2xvdWRGcm9udC9l
ZGdlIGNob2ljZQpiYXNlbGluZSBmbGVldCAvIEhBIGxldmVsCnNlY3VyaXR5IGJhc2VsaW5lCm9i
c2VydmFiaWxpdHkgYmFzZWxpbmUKUE9DIHRhcmdldApwcm92aWRlci1ib3VuZGFyeSBhc3N1bXB0
aW9uCmBgYAoKVGhlIGZpbmFsIHByb3Bvc2FsIGNhbiBzdW1tYXJpemUgdGhlc2UgZGVjaXNpb25z
IGNvbmNpc2VseTsgdGhlIGludGVybmFsIGxlZGdlciBleGlzdHMgc28gZXZlcnkgc3VibWl0dGVk
IGRlY2lzaW9uIGlzIGV4cGxhaW5hYmxlLgoKLS0tCgojIDQ3Qi4gTTUg4oCUIGFub255bW91cyBw
dWJsaWMgYWNjZXNzIG11c3Qgbm90IGV4cG9zZSBwcml2YXRlIG9yaWdpbnMKCkJlY2F1c2Ugdmll
d2VycyBhcmUgcHVibGljIGFuZCBhbm9ueW1vdXM6CgpgYGB0ZXh0Cm5vIHZpZXdlciBhY2NvdW50
L3Nlc3Npb24gc3RhdGUgaXMgcmVxdWlyZWQKYGBgCgpidXQgb3JpZ2luIHByb3RlY3Rpb24gc3Rp
bGwgbWF0dGVycy4KCkNvdmVyIHByb3BvcnRpb25hdGVseToKCmBgYHRleHQKVExTCnByaXZhdGUg
b3JpZ2lucy9zZWN1cml0eSBncm91cHMKcHVibGljIGVuZHBvaW50IHRocm90dGxpbmcvYWJ1c2Ug
cHJvdGVjdGlvbgpTaGllbGQvV0FGIG9ubHkgaWYgc2VsZWN0ZWQKbm8gYXV0aC1kZXBlbmRlbnQg
cm91dGluZwpgYGAKCkRvIG5vdCBpbnRyb2R1Y2UgcGVyLXVzZXIgYXV0aGVudGljYXRpb24gdG8g
c29sdmUgYW4gYW5vbnltb3VzIHJlYWQtb25seSBwcm9kdWN0LgoKLS0tCgojIDQ3Qy4gTTUg4oCU
IGRvIG5vdCBvdmVyLWNyZWRpdCBDbG91ZEZyb250IGZvciBsaXZlIFNTRSBnZW9ncmFwaHkKCklm
IENsb3VkRnJvbnQgZnJvbnRzIGEgbm9uLWNhY2hlYWJsZSBsb25nLWxpdmVkIGxpdmUgc3RyZWFt
LCB2ZXJpZnkgZXhhY3RseSB3aGF0IENsb3VkRnJvbnQgZG9lcyBmb3IgdGhhdCBwYXRoLgoKRG8g
bm90IGFzc3VtZToKCmBgYHRleHQKImVkZ2UgZGlzdHJpYnV0aW9uIiBtZWFucyBsaXZlIFNTRSBw
YXlsb2FkIGlzIGNhY2hlZCBuZWFyIHRoZSB2aWV3ZXIuCmBgYAoKQWNjb3VudCBmb3Igb3JpZ2lu
IHBhdGgvUlRUIGFuZCBwZXJzaXN0ZW50LWNvbm5lY3Rpb24gYmVoYXZpb3Igd2hlbiBtYWtpbmcg
dGhlIDYwJSBFdXJvcGUgLyA0MCUgTm9ydGggQW1lcmljYSBsYXRlbmN5IGFyZ3VtZW50LgoKU3Rh
dGljIGFzc2V0cyBjYW4gYmVuZWZpdCBmcm9tIG5vcm1hbCBDRE4gY2FjaGluZyBpbmRlcGVuZGVu
dGx5LgoKLS0tCgojIDQ3RC4gTTUg4oCUIG9ic2VydmFiaWxpdHkgbXVzdCBjb3ZlciB1c2VyLWlt
cGFjdCBhbmQgZGF0YS1oZWFsdGggc2lnbmFscwoKVGhlIG1pbmltdW0gb2JzZXJ2YWJpbGl0eSBw
bGFuIG11c3QgaW5jbHVkZSwgd2hlcmUgYXBwbGljYWJsZToKCmBgYHRleHQKcHJvdmlkZXIvZmVl
ZCBjb25uZWN0aW9uIGhlYWx0aCBhbmQgc3RhbGVuZXNzCmV2ZW50IGluZ2VzdCByYXRlCnNjaGVt
YS9wYXJzZSBmYWlsdXJlcwpxdWV1ZSBkZXB0aC9hZ2Ugb3IgcHJvY2Vzc2luZyBsYWcKY2Fub25p
Y2FsIHNlcXVlbmNlIGFub21hbGllcwpkdXBsaWNhdGVzL2dhcHMvb3JkZXIgdmlvbGF0aW9ucwpm
YW4tb3V0IGRlbGl2ZXJ5IGxhdGVuY3kKY29ubmVjdGlvbiBlc3RhYmxpc2htZW50L2ZhaWx1cmVz
CmFjdGl2ZSB2aWV3ZXIgY29ubmVjdGlvbnMKZGVsaXZlcnktbm9kZSBDUFUvbWVtb3J5L09PTQpj
YWNoZS9zdG9yZSBtZW1vcnkvZmFpbG92ZXIKbG9hZC1iYWxhbmNlciB0YXJnZXQgaGVhbHRoCnJl
Z2lvbmFsL3VzZXItZmFjaW5nIGVycm9yIHJhdGUKYGBgCgpBdm9pZCBidWlsZGluZyBhIGZ1bGwg
b2JzZXJ2YWJpbGl0eSBwbGF0Zm9ybSBpbiB0aGUgUE9DLgoKVGhpcyBpcyBwcm9kdWN0aW9uLWRl
c2lnbiBldmlkZW5jZSBvbmx5LgoKLS0tCgojIDQ3RS4gTTUg4oCUIHJlYXNvbmFibGUgb3BlcmF0
aW5nIG1hcmdpbgoKVGhlIDw9JDMsMDAwL21vbnRoIGNvc3QgY29uY2x1c2lvbiBtdXN0IG5vdCB1
c2UgYSBiYXNlbGluZSB0aGF0IGNvbnN1bWVzIGVzc2VudGlhbGx5IHRoZSBlbnRpcmUgYnVkZ2V0
IHdpdGggbm8gdW5jZXJ0YWludHkgbWFyZ2luLgoKU2VwYXJhdGU6CgpgYGB0ZXh0Cm1vZGVsZWQg
YmFzZWxpbmUKYXZhaWxhYmlsaXR5L04rMSBoZWFkcm9vbQp1c2FnZSBzZW5zaXRpdml0eQpyZWFz
b25hYmxlIG9wZXJhdGluZy9mb3JlY2FzdCB1bmNlcnRhaW50eSBtYXJnaW4KYnVkZ2V0IGNlaWxp
bmcKYGBgCgpEbyBub3QgaW52ZW50IGEgbWFuZGF0b3J5IHBlcmNlbnRhZ2UgZnJvbSB0aGUgYXNz
aWdubWVudC4KCkNob29zZSBhIGRlZmVuc2libGUgbWFyZ2luIG9yIHNob3cgc2Vuc2l0aXZpdHkg
c3VmZmljaWVudCB0byBkZW1vbnN0cmF0ZSBob3cgY2xvc2UgdGhlIGRlc2lnbiBpcyB0byB0aGUg
Y2VpbGluZy4KCklmIHRoZSBhcmNoaXRlY3R1cmUgaXMgb25seSB1bmRlciAkMywwMDAgd2l0aCB6
ZXJvIG1hcmdpbiBhbmQgb3B0aW1pc3RpYyB0cmFmZmljIGFzc3VtcHRpb25zOgoKYGBgdGV4dApj
bGFzc2lmeSBpdCBDT05ESVRJT05BTExZIFdJVEhJTiBCVURHRVQgb3IgcmV0dXJuIHRvIE00Lgpg
YGAKCi0tLQoKIyA0N0YuIE01IOKAlCBwcm9kdWN0aW9uIG1lYXN1cmVtZW50IG9mIGluZ2VzdC10
by1zY3JlZW4gU0xPCgpUaGUgYXNzaWdubWVudCdzIDJzLzVzIHRhcmdldHMgYXJlIHZpZXdlci1z
Y3JlZW4gU0xPcy4KClRoZSBwcm9kdWN0aW9uIGRlc2lnbiBzaG91bGQgaW5jbHVkZSBhIGxpZ2h0
d2VpZ2h0IHdheSB0byBvYnNlcnZlIHRoZW0gYWZ0ZXIgbGF1bmNoIHJhdGhlciB0aGFuIG1vbml0
b3Jpbmcgb25seSBzZXJ2ZXIgbGF0ZW5jeS4KCkRlZmluZSBhbiBhcHByb2FjaCBzdWNoIGFzOgoK
YGBgdGV4dApzdGFtcCBlYWNoIGNhbm9uaWNhbCBldmVudCB3aXRoIHNlcnZlciBpbmdlc3QvYWNj
ZXB0IHRpbWUKc2FtcGxlIGFub255bW91cyBicm93c2VyIHRlbGVtZXRyeSB3aGVuIGFuIGV2ZW50
IGlzIHJlbmRlcmVkL2FwcGxpZWQKYWdncmVnYXRlIGdvYWwgdnMgcm91dGluZS1ldmVudCBlbmQt
dG8tZW5kIGxhdGVuY3kgYnkgZ2VvZ3JhcGh5Cm1vbml0b3IgcDk1IGFuZCBkYXRhIGZyZXNobmVz
cwpgYGAKCklmIGJyb3dzZXIvc2VydmVyIGNsb2NrIHNrZXcgYWZmZWN0cyB0aGUgbWV0aG9kOgoK
YGBgdGV4dApib3VuZC9jb3JyZWN0IGl0IG9yIHN0YXRlIHRoZSBtZWFzdXJlbWVudCBhcHByb3hp
bWF0aW9uLgpgYGAKCktlZXAgc2FtcGxpbmcgbG93IGVub3VnaCB0aGF0IHRlbGVtZXRyeSBkb2Vz
IG5vdCBiZWNvbWUgYSBtYXRlcmlhbCBsb2FkL2Nvc3Qgc291cmNlLgoKTm8gdXNlciBhY2NvdW50
IG9yIGlkZW50aWZ5aW5nIHByb2ZpbGUgaXMgcmVxdWlyZWQuCgpJbmNsdWRlIHRlbGVtZXRyeSBj
b3N0IGlmIG1hdGVyaWFsLgoKVGhpcyBpcyBhIHByb2R1Y3Rpb24gb2JzZXJ2YWJpbGl0eSBkZXNp
Z24sIG5vdCBhZGRpdGlvbmFsIFBPQyBjb2RlLgoKLS0tCgojIDQ4LiBNNSBmaW5hbCBhcnRpZmFj
dHMKClRoZSBmaW5hbCBldmlkZW5jZSBjbG9zdXJlIG11c3QgaW5jbHVkZToKCmBgYHRleHQKc2Vs
ZWN0ZWQgTTQgYXJjaGl0ZWN0dXJlCmN1cnJlbnQtc291cmNlIGxlZGdlcgpjb3N0IG1vZGVsCmNv
c3QgY29uY2x1c2lvbgpnZW9ncmFwaGljIGRlY2lzaW9uCnByb3ZpZGVyIHVuY2VydGFpbnR5ClBP
QyBtYXBwaW5nCmltcG9ydGFudCBhbHRlcm5hdGl2ZSBwcmljaW5nIGNvbXBhcmlzb24KYGBgCgpF
bmQ6CgpgYGB0ZXh0Ck01IGNvbXBsZXRpb246IDEwMCUKYGBgCgotLS0KCiMgNDkuIE01IGNvbXBs
ZXRpb24gZ2F0ZQoKTTUgY2Fubm90IGNsb3NlIHVudGlsOgoKYGBgdGV4dApbIF0gYWxsIHNlbGVj
dGVkIG11dGFibGUgc2VydmljZSBmYWN0cyBoYXZlIGN1cnJlbnQgc291cmNlcwpbIF0gYWxsIHNl
bGVjdGVkIHByaWNlcyBoYXZlIGN1cnJlbnQgc291cmNlL2RhdGUKWyBdIG9sZCByZWplY3RlZCBh
cmNoaXRlY3R1cmUgY29zdHMgcmVtb3ZlZApbIF0gaGlkZGVuIG5ldHdvcmtpbmcvc3VwcG9ydCBj
b3N0IGhhbmRsZWQKWyBdIHByaWNpbmcgY3VycmVuY3kvZGF0ZS9yZWdpb24vYmlsbGluZyBiYXNp
cyBleHBsaWNpdApbIF0gdmlld2VyIG1hdGggY29ycmVjdApbIF0gcGF5bG9hZCBhc3N1bXB0aW9u
cyBleHBsaWNpdApbIF0gZnVsbC1oaXN0b3J5IDw9MnMgcGF0aCBpcyBxdWFudGl0YXRpdmVseSBi
b3VuZGVkClsgXSBlbmQtdG8tZW5kIGdvYWwvcm91dGluZSAycy81cyBwbGFubmluZyBsYXRlbmN5
IGJ1ZGdldCBleHBsaWNpdApbIF0gRXVyb3BlIGFuZCBOb3J0aCBBbWVyaWNhIGxhdGVuY3kgaW1w
bGljYXRpb25zIGFyZSBjb25zaWRlcmVkIHNlcGFyYXRlbHkKWyBdIHZpZXdlci1ob3VycyBzZW5z
aXRpdml0eSBleHBsaWNpdApbIF0gbGl2ZS1ldmVudC1ob3Vycy9pbmdlc3Qtdm9sdW1lIHNlbnNp
dGl2aXR5IGV4cGxpY2l0ClsgXSBjYW5vbmljYWwtaGlzdG9yeSByZXRlbnRpb24vc3RvcmFnZSBh
c3N1bXB0aW9uIGV4cGxpY2l0ClsgXSBob3QtbWF0Y2ggY29zdC9jYXBhY2l0eSBoYW5kbGVkClsg
XSBiYXNlbGluZSBmbGVldCBleHBsaWNpdApbIF0gMTAway8rNDBrIHJlbGV2YW50IHNlcnZpY2Ug
cXVvdGFzIG9yIHNlbGYtaG9zdGVkIHNjYWxlIGxpbWl0cyB2ZXJpZmllZApbIF0gbGl2ZS1zdHJl
YW0gZWRnZS0+b3JpZ2luIGNvbm5lY3Rpb24gc2VtYW50aWNzIGFyZSB2ZXJpZmllZApbIF0gY29u
bmVjdGlvbi1vcmllbnRlZCBiaWxsaW5nIG1hdGggbWF0Y2hlcyB0aGUgc2VsZWN0ZWQgc2Vydmlj
ZQpbIF0gcHJlLXByb3Zpc2lvbmVkIGtpY2tvZmYvZGVwbG95IGNhcGFjaXR5IGlzIHByaWNlZApb
IF0gc2VsZWN0ZWQgcG9kL3NlcnZpY2UgYXV0b3NjYWxpbmcgYmVoYXZpb3IgYW5kIG5vZGUvY29t
cHV0ZSBzY2FsaW5nIGFyZSB2ZXJpZmllZCBmcm9tIGN1cnJlbnQgb2ZmaWNpYWwgc291cmNlcwpb
IF0gYXV0b3NjYWxpbmcgY29udHJvbC1wbGFuZS9jb21wdXRlIGNvc3QgaXMgaW5jbHVkZWQgd2hl
cmUgbWF0ZXJpYWwKWyBdIG5laXRoZXIgaGlzdG9yaWNhbCBxNSBjb2xsYXBzZSBub3IgRjEncyBs
b2NhbCB0b3BvbG9neSBpcyB0cmVhdGVkIGFzIGEgdW5pdmVyc2FsIHNhZmUgcGVyLW5vZGUgY2Fw
YWNpdHkKWyBdIE4rMS9kZXBsb3ltZW50IGhlYWRyb29tIGlzIGluY2x1ZGVkIGluIGJhc2VsaW5l
IGNvc3QKWyBdIHNoYXJlZCBjYWNoZS9yb3V0aW5nIHRpZXIgY2FwYWNpdHkgYW5kIEhBIGFzc3Vt
cHRpb25zIGFyZSBleHBsaWNpdApbIF0gU1NFIHRpbWVvdXQvaGVhcnRiZWF0IG9wZXJhdGlvbmFs
IGZhY3RzIGFyZSB2ZXJpZmllZCBpZiBTU0UgaXMgc2VsZWN0ZWQKWyBdIDYwLzQwIGF1ZGllbmNl
IHByaWNpbmcgaW1wYWN0IGlzIHJlZmxlY3RlZCB3aGVyZSBtYXRlcmlhbApbIF0gZ2VvZ3JhcGh5
IGV4cGxpY2l0IGFuZCBDbG91ZEZyb250IGxpdmUtc3RyZWFtIGJlaGF2aW9yIGlzIG5vdCBvdmVy
Y2xhaW1lZApbIF0gcHJvZHVjdGlvbiBpbmdlc3QtdG8tc2NyZWVuIFNMTyBoYXMgYSBjcmVkaWJs
ZSBicm93c2VyLXNpZGUvZW5kLXRvLWVuZCBtZWFzdXJlbWVudCBzdHJhdGVneQpbIF0gcHJvdmlk
ZXIgdW5jZXJ0YWludHkgZXhwbGljaXQKWyBdIFBPQyBtYXBwaW5nIHRydXRoZnVsClsgXSBldmVy
eSBtYXRlcmlhbCBmaW5hbCBhcmNoaXRlY3R1cmUgZGVjaXNpb24gaGFzIGFuIGV4cGxhaW5hYmxl
IHByb3ZlbmFuY2UvdHJhZGUtb2ZmIHJlY29yZApbIF0gZXZlcnkgbnVtYmVyIGFuZCBldmVyeSBk
ZWNpc2lvbiBleHBlY3RlZCBpbiB0aGUgc3VibWlzc2lvbiBpcyBkZWZlbmRhYmxlClsgXSA8PSQz
ayBjb25jbHVzaW9uIGluY2x1ZGVzIGF2YWlsYWJpbGl0eSBoZWFkcm9vbSBhbmQgcmVhc29uYWJs
ZSB1bmNlcnRhaW50eSBtYXJnaW4KWyBdIG5vIE01IGZpbmRpbmcgaW52YWxpZGF0ZXMgTTQgYXJj
aGl0ZWN0dXJlCmBgYAoKSWYgTTUgaW52YWxpZGF0ZXMgTTQ6CgpgYGB0ZXh0Cmxvb3AgTTQgLT4g
TTUgYWdhaW4uCmBgYAoKLS0tCgojIDUwLiBNaWxlc3RvbmUgNiDigJQgb2JqZWN0aXZlCgpDcmVh
dGUgdGhlIGFjdHVhbCBmaW5hbDoKCmBgYHRleHQKcHJvcG9zYWwubWQKYGBgCgphdCByZXBvc2l0
b3J5IHJvb3QuCgpEbyBub3Qgc3VibWl0IGFuIGludGVybmFsIGFyY2hpdGVjdHVyZSBjb250cmFj
dC4KCkRvIG5vdCBtYWtlIHJldmlld2VyIHJlYWQgaW50ZXJuYWwgZG9jcy4KClRoZSBwcm9wb3Nh
bCBtdXN0IHN0YW5kIGFsb25lLgoKLS0tCgojIDUxLiBNNiB3b3JkIGxpbWl0CgpIYXJkIG1heGlt
dW06CgpgYGB0ZXh0CjEsNTAwIHdvcmRzCmBgYAoKRGlhZ3JhbXMgZXhjbHVkZWQuCgpUYXJnZXQ6
CgpgYGB0ZXh0CjEsMjAw4oCTMSw0NTAgcHJvc2Ugd29yZHMKYGBgCgpSZWNvcmQgdGhlIGZpbmFs
IGNvdW50IGludGVybmFsbHkuCgpJZiBvdmVyOgoKYGBgdGV4dAplZGl0IGFuZCByZWNvdW50Lgpg
YGAKCi0tLQoKIyA1MUEuIE02IHdvcmQtY291bnQgbWV0aG9kCgpVc2UgYSBkZXRlcm1pbmlzdGlj
IHdvcmQtY291bnQgbWV0aG9kIGFuZCBwcmVzZXJ2ZSB0aGUgcmVzdWx0IGludGVybmFsbHkuCgpG
b3Igc2FmZXR5OgoKYGBgdGV4dApjb3VudCBoZWFkaW5ncwpjb3VudCBwcm9zZQpjb3VudCBidWxs
ZXRzCmNvdW50IHRhYmxlIHRleHQKY291bnQgbm9uLWRpYWdyYW0gY29kZS90ZXh0CmV4Y2x1ZGUg
b25seSB0aGUgYWN0dWFsIGFyY2hpdGVjdHVyZSBkaWFncmFtIGJsb2NrKHMpIHRoYXQgdGhlIGFz
c2lnbm1lbnQgZXhwbGljaXRseSBleGVtcHRzCmBgYAoKRG8gbm90IGV4Y2x1ZGUgYXJiaXRyYXJ5
IGZlbmNlZCBibG9ja3MgbWVyZWx5IGJlY2F1c2UgdGhleSBhcmUgZmVuY2VkLgoKS2VlcCBlbm91
Z2ggbWFyZ2luIGJlbG93IDEsNTAwIHRoYXQgbWlub3IgY291bnRpbmcgZGlmZmVyZW5jZXMgZG8g
bm90IGNyZWF0ZSBhIHZpb2xhdGlvbi4KCi0tLQoKIyA1Mi4gTTYgcmVjb21tZW5kZWQgc3RydWN0
dXJlCgpLZWVwIGNvbXBhY3QuCgpGb3IgZXhhbXBsZToKCmBgYHRleHQKIyBMaXZlIE1hdGNoIENl
bnRyZSDigJQgRGVzaWduIFByb3Bvc2FsCgojIyBBcmNoaXRlY3R1cmUKIyMgQ29ycmVjdG5lc3Ms
IGhpc3RvcnkgYW5kIHJlY292ZXJ5CiMjIFNjYWxlLCBsYXRlbmN5IGFuZCBnZW9ncmFwaHkKIyMg
RGVwbG95bWVudCBhbmQgb3BlcmF0aW9ucwojIyBDb3N0IGFuZCB0cmFkZS1vZmZzCiMjIFJpc2tp
ZXN0IGFzc3VtcHRpb24gYW5kIFBPQwpgYGAKCkRvIG5vdCBjcmVhdGUgYSAyMC1zZWN0aW9uIHBy
b3Bvc2FsLgoKLS0tCgojIDUzLiBNNiBhcmNoaXRlY3R1cmUgZGlhZ3JhbQoKSW5jbHVkZSBvbmUg
Y29uY2lzZToKCmBgYHRleHQKTWVybWFpZApvciBBU0NJSQpgYGAKCmRpYWdyYW0uCgpJdCBtdXN0
IHJlZmxlY3QgdGhlIGZpbmFsIE00IGFyY2hpdGVjdHVyZS4KClNob3c6CgpgYGB0ZXh0CnByb3Zp
ZGVyCmR1cmFibGUgaW5nZXN0Cm9yZGVyaW5nL2Nhbm9uaWNhbCBwcm9jZXNzb3IKY2Fub25pY2Fs
IHN0YXRlCmZhbi1vdXQvaGlzdG9yeSBwYXJ0aXRpb25zCmVkZ2UKc3RhdGljIE5leHQuanMKdmll
d2VyCmBgYAoKRGlzdGluZ3Vpc2g6CgpgYGB0ZXh0CmNhbm9uaWNhbCB0cnV0aApkZWxpdmVyeS9o
aXN0b3J5IHN0YXRlCmBgYAoKLS0tCgojIDU0LiBNNiBmdWxsIHBhdGgKCkEgcmV2aWV3ZXIgbXVz
dCB1bmRlcnN0YW5kOgoKYGBgdGV4dApwcm92aWRlciBldmVudAotPiBhY2NlcHRlZCBkdXJhYmx5
Ci0+IG9yZGVyZWQvaWRlbXBvdGVudCBwcm9jZXNzaW5nCi0+IGNhbm9uaWNhbCBzZXF1ZW5jZS9z
dGF0ZQotPiBkZWxpdmVyeS9oaXN0b3J5IHB1YmxpY2F0aW9uCi0+IGZhbi1vdXQgcGFydGl0aW9u
Ci0+IENsb3VkRnJvbnQvZWRnZQotPiBFdmVudFNvdXJjZS9jbGllbnQgcmVkdWNlcgotPiB2aXNp
YmxlIHNjb3JlL2V2ZW50cwpgYGAKCkV4cGxhaW4gbG9iYnkgc2VwYXJhdGVseSBidXQgYnJpZWZs
eS4KCi0tLQoKIyA1NS4gTTYgY29ycmVjdG5lc3MKCkV4cGxhaW4gaG93LCBmb3IgYWNjZXB0ZWQg
ZXZlbnRzOgoKYGBgdGV4dApkdXBsaWNhdGUgZGlzcGxheSBpcyBwcmV2ZW50ZWQKb3V0LW9mLW9y
ZGVyIGRpc3BsYXkgaXMgcHJldmVudGVkCnNjb3JlL2hpc3RvcnkgcmVtYWluIGNvaGVyZW50CmNs
b2NrL3N0YXRlIGRlcml2ZSBmcm9tIGNhbm9uaWNhbCBoaXN0b3J5CnJlY29ubmVjdCBkb2VzIG5v
dCBjb3JydXB0IHN0YXRlCmBgYAoKU3RhdGUgcHJvdmlkZXIgbGltaXRhdGlvbjoKCmBgYHRleHQK
YW4gZXZlbnQgbmV2ZXIgZGVsaXZlcmVkIHVwc3RyZWFtIGNhbm5vdCBiZSByZWNvbnN0cnVjdGVk
IHdpdGhvdXQgYW4gdXBzdHJlYW0gcmVjb3Zlcnkgc291cmNlLgpgYGAKCi0tLQoKIyA1Ni4gTTYg
aGlzdG9yeS9yZWNvbm5lY3QKCkV4cGxhaW46CgpgYGB0ZXh0CmxhdGUgam9pbgpyZWxvYWQKd2Fr
ZQpyZWNvbm5lY3QKY3Vyc29yCmNhbm9uaWNhbCBzZXF1ZW5jZQpmYWxsYmFjayByZWNvbnN0cnVj
dGlvbgpgYGAKCkRvIG5vdCBpbmNsdWRlIHN1cGVyc2VkZWQgcmVwbGF5IGFyY2hpdGVjdHVyZS4K
Ci0tLQoKIyA1Ny4gTTYgcGVyZm9ybWFuY2UKClVzZSBhc3NpZ25tZW50IHRhcmdldHMgZXhhY3Rs
eToKCmBgYHRleHQKZ29hbCBwOTUgPD0ycyBpbmdlc3QtPnNjcmVlbgpvdGhlciBwOTUgPD01cwpo
aXN0b3J5IDw9MnMKYGBgCgpUaGVuIHN0YXRlIHdoaWNoIGxvY2FsIHZhbHVlcyB3ZXJlIGFjdHVh
bGx5IG9ic2VydmVkIGFuZCB3aGljaCBwYXJ0cyByZW1haW4gcHJvZHVjdGlvbiBidWRnZXQvaW5m
ZXJlbmNlLgoKVXNlIEYxIG9ubHkgYXMgbWVhc3VyZWQgbG9jYWwgZXZpZGVuY2U6Ci0gMTAway9j
b3JyZWN0bmVzcyBzdWNjZWVkZWQ7Ci0gZnJvemVuIGxhdGVuY3kgYWNjZXB0YW5jZSBkaWQgbm90
LgpEbyBub3QgY29udmVydCBGMSBpbnRvIGEgcHJvZHVjdGlvbi1sYXRlbmN5IHN1Y2Nlc3MgY2xh
aW0uCgotLS0KCiMgNTguIE02IHNjYWxlCgpBZGRyZXNzOgoKYGBgdGV4dAoxMDBrCis0MGsvMTIw
cwo4IG1hdGNoZXMKaG90IG1hdGNoCjEwL3Mgc3RlYWR5CjUwL3MgYnVyc3QKYGBgCgpUaGUgbmV3
IGhvcml6b250YWwgYXJjaGl0ZWN0dXJlIG11c3QgZXhwbGFpbiB3aHkgb25lIHBvcHVsYXIgbWF0
Y2ggY2Fubm90IHJlY3JlYXRlIHRoZSBmaXhlZC10b3BvbG9neSBmYW4tb3V0IGJvdHRsZW5lY2ss
IGluY2x1ZGluZyBleHBsaWNpdCBob3QtbWF0Y2ggc3ViLXNoYXJkaW5nIGFuZCBjYXBhY2l0eSBo
ZWFkcm9vbS4KCi0tLQoKIyA1OS4gTTYgZ2VvZ3JhcGh5CgpBZGRyZXNzOgoKYGBgdGV4dAo2MCUg
RVUgLyA0MCUgTkEKYGBgCgpVc2UgZmluYWwgTTUgc3RyYXRlZ3kuCgpObyBmYWJyaWNhdGVkIGdl
b2dyYXBoaWMgbWVhc3VyZW1lbnQuCgotLS0KCiMgNjAuIE02IGRlcGxveXMKCkFkZHJlc3Mgd2Vl
a2x5IGxpdmUgZGVwbG95bWVudC4KCkV4cGxhaW46CgpgYGB0ZXh0CmRyYWluCnJlcGxhY2UKcmVj
b25uZWN0CnJlc3VtZQpzdGF0ZSBzdXJ2aXZhbApgYGAKClVzZSBjb25zZXJ2YXRpdmUgd29yZGlu
Zy4KCi0tLQoKIyA2MS4gTTYgZnJvbnRlbmQKCkV4cGxpY2l0bHkgc2F0aXNmeToKCmBgYHRleHQK
TmV4dC5qcyBBcHAgUm91dGVyCmNvbXBvbmVudC1iYXNlZApgYGAKCkRlc2NyaWJlOgoKYGBgdGV4
dApzdGF0aWMvZWRnZS1zZXJ2ZWQgYXBwbGljYXRpb24gYXMgc2VsZWN0ZWQKc21hbGwgY2xpZW50
IGxpdmUgY29tcG9uZW50CkV2ZW50U291cmNlIGlmIFNTRQppZGVtcG90ZW50IHNlcXVlbmNlIHJl
ZHVjZXIKbG9iYnkgY29tcG9uZW50Cm1hdGNoIGNvbXBvbmVudApyZWNvbm5lY3Qgc3RhdGUKYGBg
CgpObyBuZWVkIHRvIGJ1aWxkIHByb2R1Y3Rpb24gVUkuCgotLS0KCiMgNjFBLiBNNiDigJQgZXhw
bGljaXQgY3Jvd2QgaW52YXJpYW5jZQoKVGhlIHByb3Bvc2FsIG11c3QgZXhwbGljaXRseSBhZGRy
ZXNzOgoKYGBgdGV4dApleHBlcmllbmNlIG1hdGVyaWFsbHkgZXF1aXZhbGVudCBhdCB+MTAwIGFu
ZCAxMDAsMDAwIHZpZXdlcnMKYGBgCgpEbyB0aGlzIHdpdGhvdXQgY2xhaW1pbmcgYSBjb250cm9s
bGVkIGVxdWFsaXR5IGJlbmNobWFyay4KCkV4cGxhaW4gdGhhdDoKCmBgYHRleHQKY2Fub25pY2Fs
IGNvcnJlY3RuZXNzIHNlbWFudGljcyBkbyBub3QgY2hhbmdlIHdpdGggYXVkaWVuY2Ugc2l6ZTsK
Y2FwYWNpdHkgaXMgcGFydGl0aW9uZWQgaG9yaXpvbnRhbGx5OwpjbGllbnRzIHVzZSB0aGUgc2Ft
ZSBzbmFwc2hvdC9oaXN0b3J5L2xpdmUgcHJvdG9jb2wgYXQgc21hbGwgYW5kIHBlYWsgbG9hZDsK
cGVhay9zdXJnZSBzY2FsZSBjaGFuZ2VzIHJlc291cmNlIGNvbnN1bXB0aW9uLCBub3Qgc3RhdGUg
c2VtYW50aWNzLgpgYGAKCkFsc28gc3RhdGUgdGhlIFBPQyBkaWQgbm90IHByb3ZlIGxpdGVyYWwg
MTAwLXZzLTEwMGsgZXF1YWxpdHkuCgotLS0KCiMgNjFCLiBNNiDigJQgbmV2ZXIgYmxhbmsgLyBz
bmFwc2hvdC10by1saXZlIGhhbmRvZmYKClRoZSBwcm9wb3NhbCBtdXN0IG1ha2UgdHdvIHZpZXdl
ci1sZXZlbCBndWFyYW50ZWVzIHVuZGVyc3RhbmRhYmxlOgoKYGBgdGV4dApsYXN0IGNvaGVyZW50
IHN0YXRlIHJlbWFpbnMgcmVuZGVyZWQgd2hpbGUgdHJhbnNwb3J0IHJlY29ubmVjdHMKaGlzdG9y
eS9zbmFwc2hvdC10by1saXZlIGhhbmRvZmYgY2Fubm90IGNyZWF0ZSBhIHNlcXVlbmNlIGhvbGUg
b3IgZG91YmxlLWFwcGx5IGFuIGV2ZW50CmBgYAoKVXNlIHRoZSBleGFjdCBmaW5hbCBNNCBjdXJz
b3IvaGFuZG9mZiBydWxlLgoKVGhpcyBjbG9zZXM6CgpgYGB0ZXh0CmxhdGUgam9pbgpyZWxvYWQK
cGhvbmUgd2FrZQpuZXZlciBibGFuawpubyBtYW51YWwgcmVmcmVzaApubyBkdXBsaWNhdGVzCm5v
dGhpbmcgZGlzYXBwZWFycwpvdXQtb2Ytb3JkZXIgZGlzcGxheQpgYGAKCndpdGggb25lIGNvaGVy
ZW50IGZyb250ZW5kL3N0YXRlIHN0b3J5LgoKLS0tCgojIDYxQy4gTTYg4oCUIG9mZmljaWFsIHNj
b3JlL21pbnV0ZSB3b3JkaW5nCgpNYWtlIGNsZWFyIHRoYXQ6CgpgYGB0ZXh0CnNjb3JlIGFuZCBv
ZmZpY2lhbCBtYXRjaCBtaW51dGUgb3JpZ2luYXRlIGZyb20gY2Fub25pY2FsIHByb2Nlc3Npbmcg
b2YgcHJvdmlkZXIgZXZlbnRzL3N0YXRlLgpgYGAKCkRvIG5vdCBpbXBseSB0aGUgYnJvd3NlciBp
bmRlcGVuZGVudGx5IG93bnMgdGhlIG9mZmljaWFsIG1hdGNoIGNsb2NrLgoKLS0tCgojIDYxRC4g
TTYg4oCUIHN1Ym1pc3Npb24tbGFuZ3VhZ2UgaHlnaWVuZQoKYHByb3Bvc2FsLm1kYCBpcyBhIGhp
cmluZyBkZWxpdmVyYWJsZSwgbm90IGFuIGludGVybmFsIGluY2lkZW50IHJlcG9ydC4KCkF2b2lk
IHVubmVjZXNzYXJ5IGludGVybmFsIGphcmdvbiBzdWNoIGFzOgoKYGBgdGV4dApxNQpUZXJtaW5h
bCBBClIxL1IyCnYyLjAuNSAvIHYyLjAuNiAvIHYyLjMuMCB2ZXJzaW9uIGFyY2hhZW9sb2d5CkYx
IHByb2JlIGxhYmVscwpNaWxlc3RvbmUgbnVtYmVycwppbnRlcm5hbCBhcnRpZmFjdCBwYXRocwpg
YGAKCnVubGVzcyBuZWVkZWQgdG8gaWRlbnRpZnkgZXZpZGVuY2UuCgpQcmVmZXIgaHVtYW4tcmVh
ZGFibGUgd29yZGluZzoKCmBgYHRleHQKdGhlIGxvY2FsIDEwMGsgZXhwZXJpbWVudAp0aGUgYmVz
dCB2YWxpZGF0ZWQgbG9jYWwgcmVzdWx0CnRoZSBtZWFzdXJlZCBmYW4tb3V0IGxhdGVuY3kgbGlt
aXRhdGlvbgp0aGUgb3JpZ2luYWwgZml4ZWQgZmFuLW91dCBjYXBhY2l0eSBhc3N1bXB0aW9uCmBg
YAoKVGhlIHJldmlld2VyIHNob3VsZCB1bmRlcnN0YW5kIHRoZSBleHBlcmltZW50IHdpdGhvdXQg
a25vd2luZyB0aGUgaW50ZXJuYWwgbWlsZXN0b25lIHN5c3RlbS4KCkRvIG5vdCBoaWRlIHRoZSBJ
TkNPTkNMVVNJVkUgdmVyZGljdDsgc2ltcGx5IGV4cGxhaW4gaXQgY2xlYW5seS4KCi0tLQoKIyA2
MUUuIE02IOKAlCBjb25jaXNlIGVuZC10by1lbmQgbGF0ZW5jeSBidWRnZXQKClRoZSBmaW5hbCBw
cm9wb3NhbCBzaG91bGQgbWFrZSB0aGUgMnMvNXMgdGFyZ2V0cyBjcmVkaWJsZSB3aXRoIGEgY29t
cGFjdCBidWRnZXQgb3IgZXhwbGFuYXRpb24gY292ZXJpbmc6CgpgYGB0ZXh0CmluZ2VzdCBkdXJh
YmlsaXR5CmNhbm9uaWNhbCBwcm9jZXNzaW5nCmZhbi1vdXQKbmV0d29yay9lZGdlCmJyb3dzZXIK
YGBgCgpDbGVhcmx5IGRpc3Rpbmd1aXNoOgoKYGBgdGV4dAptZWFzdXJlZCBsb2NhbCBiZWhhdmlv
cgpwbGFubmluZyBidWRnZXQKdW5tZWFzdXJlZCBwcm9kdWN0aW9uL2Jyb3dzZXIgY29tcG9uZW50
cwpgYGAKCkRvIG5vdCBjbGFpbSBwcm9kdWN0aW9uIHA5NSB3YXMgbWVhc3VyZWQuCgotLS0KCiMg
NjFGLiBNNiDigJQgcHJvdmlkZXIgdHJhbnNwb3J0IGFzc3VtcHRpb24KClN0YXRlIHRoZSBjb25j
cmV0ZSBwcm92aWRlci1pbmdyZXNzIGFzc3VtcHRpb24gaW4gb25lIGNvbmNpc2Ugc2VudGVuY2Uu
CgpGb3IgZXhhbXBsZToKCmBgYHRleHQKSSBhc3N1bWUgSFRUUFMgcHVzaCBmcm9tIHRoZSBwcm92
aWRlcjsgYSBwZXJzaXN0ZW50IHZlbmRvciBzdHJlYW0gd291bGQgcmVwbGFjZSBvbmx5IHRoZSBp
bmdyZXNzIGFkYXB0ZXIsIG5vdCB0aGUgZHVyYWJsZSBxdWV1ZS9jYW5vbmljYWwtcHJvY2Vzc2lu
Zy9kb3duc3RyZWFtIGRlc2lnbi4KYGBgCgpVc2Ugd2hhdGV2ZXIgZmluYWwgTTQgYXNzdW1wdGlv
biBhY3R1YWxseSB3aW5zLgoKLS0tCgojIDYxRy4gTTYg4oCUIGZyb250ZW5kIGRlcGxveW1lbnQg
dmVyc2lvbmluZwoKVGhlIHdlZWtseS1kZXBsb3kgcGFyYWdyYXBoIG11c3QgY292ZXIgYm90aDoK
CmBgYHRleHQKYmFja2VuZCBkZWxpdmVyeSBub2Rlcwpmcm9udGVuZCBzdGF0aWMvYXBwbGljYXRp
b24gYXNzZXRzCmBgYAoKTWVudGlvbiBpbW11dGFibGUvdmVyc2lvbmVkIGZyb250ZW5kIGFzc2V0
cyBvciB0aGUgZXF1aXZhbGVudCBzZWxlY3RlZCBtZWNoYW5pc20gc28gYW4gYWxyZWFkeS1vcGVu
IGNsaWVudCBpcyBub3QgYnJva2VuIHdoZW4gYSBuZXcgcmVsZWFzZSBpcyBwdWJsaXNoZWQuCgot
LS0KCiMgNjFILiBNNiDigJQgYWNjZXB0ZWQtZXZlbnQgcHJvY2Vzc2luZyBmYWlsdXJlCgpJbiB0
aGUgY29ycmVjdG5lc3MvcmVjb3ZlcnkgZXhwbGFuYXRpb24sIHN0YXRlIHRoYXQgYW4gZXZlbnQg
ZHVyYWJseSBhY2NlcHRlZCBpbnRvIHRoZSBzeXN0ZW0gaXMgbm90IHNpbGVudGx5IHNraXBwZWQg
YmVjYXVzZSBvbmUgcHJvY2Vzc2luZyBhdHRlbXB0IGZhaWxzLgoKQSBjb25jaXNlIHN0YXRlbWVu
dCBtYXkgY292ZXI6CgpgYGB0ZXh0CnJldHJ5ICsgaWRlbXBvdGVudCBjYW5vbmljYWwgd3JpdGUg
KyBhbGVydC9xdWFyYW50aW5lL3JlY29uY2lsaWF0aW9uCmBgYAoKLS0tCgojIDYxSS4gTTYg4oCU
IGRlbGl2ZXJ5LWNhY2hlIHJlYnVpbGQKClN0YXRlIHRoYXQgdGhlIGRlbGl2ZXJ5L2hpc3Rvcnkg
Y2FjaGUgaXMgcmVidWlsZGFibGUgZnJvbSBjYW5vbmljYWwgZHVyYWJsZSBzdGF0ZS4KCkRvIG5v
dCBpbXBseSBSZWRpcy9OY2hhbiByZXRhaW5lZCBoaXN0b3J5IGlzIHRoZSBvbmx5IHN1cnZpdmlu
ZyBjb3B5IG9mIGFuIGFjdGl2ZSBtYXRjaC4KCi0tLQoKIyA2MUouIE02IOKAlCBzY2hlbWEgZXZv
bHV0aW9uCgpUaGUgZW5kLXRvLWVuZCBhcmNoaXRlY3R1cmUgZXhwbGFuYXRpb24gc2hvdWxkIG1l
bnRpb24gdGhhdCBwcm92aWRlciBldmVudHMgYXJlIHZhbGlkYXRlZC9ub3JtYWxpemVkIGludG8g
YSBzdGFibGUgY2Fub25pY2FsIG1vZGVsLgoKS2VlcCBpdCBjb25jaXNlOgoKYGBgdGV4dAp2ZXJz
aW9uLWF3YXJlIHZhbGlkYXRpb24vbm9ybWFsaXphdGlvbiBwcmV2ZW50cyBhbiB1cHN0cmVhbSBz
Y2hlbWEgY2hhbmdlIGZyb20gc2lsZW50bHkgY29ycnVwdGluZyBjYW5vbmljYWwgc3RhdGUuCmBg
YAoKRG8gbm90IGludmVudCB0aGUgcmVhbCBwcm92aWRlciBzY2hlbWEuCgotLS0KCiMgNjFLLiBN
NiDigJQgcm9sbGJhY2sKClRoZSBkZXBsb3kgcGFyYWdyYXBoIG11c3QgaW5jbHVkZSByb2xsYmFj
aywgbm90IG9ubHkgZm9yd2FyZCByb2xsb3V0LgoKU3RhdGUgaG93OgoKYGBgdGV4dApiYWNrZW5k
IHZlcnNpb25zIG92ZXJsYXAgc2FmZWx5CmNhbm9uaWNhbCBzdGF0ZSByZW1haW5zIGNvbXBhdGli
bGUKZnJvbnRlbmQgaW1tdXRhYmxlIGFzc2V0cyBhbGxvdyBvbGQgb3BlbiBjbGllbnRzIHRvIGNv
bnRpbnVlCmEgYmFkIHJlbGVhc2UgY2FuIGJlIHJvbGxlZCBiYWNrIHdpdGhvdXQgYmxhbmtpbmcg
dmlld2VycyBvciBkZWxldGluZyBoaXN0b3J5CmBgYAoKLS0tCgojIDYxTC4gTTYg4oCUIHJlZ2lv
bmFsIGxhdGVuY3kgaG9uZXN0eQoKRG8gbm90IHVzZSBhIHNpbmdsZSBhZ2dyZWdhdGUgc3RhdGVt
ZW50IHRvIGhpZGUgZ2VvZ3JhcGh5LgoKVGhlIHByb3Bvc2FsIHNob3VsZCBzYXkgd2h5IHRoZSBz
ZWxlY3RlZCBvcmlnaW4vZWRnZSBzdHJhdGVneSBpcyBjcmVkaWJsZSBmb3IgYm90aDoKCmBgYHRl
eHQKRXVyb3BlICh+NjAlKQpOb3J0aCBBbWVyaWNhICh+NDAlKQpgYGAKCndoaWxlIGNsZWFybHkg
bGFiZWxpbmcgcmVnaW9uYWwgcGVyZm9ybWFuY2UgYXMgYSBwcm9kdWN0aW9uIGluZmVyZW5jZSwg
bm90IGEgbWVhc3VyZWQgUE9DIHJlc3VsdC4KCi0tLQoKIyA2MU0uIE02IOKAlCBtYWtlIHRoZSB2
aWV3ZXItZmFjaW5nIFNMTyBvYnNlcnZhYmxlCgpJbiB0aGUgY29tcGFjdCBvcGVyYXRpb25zL29i
c2VydmFiaWxpdHkgd29yZGluZywgbWVudGlvbiB0aGF0IHByb2R1Y3Rpb24gbW9uaXRvcmluZyBp
bmNsdWRlcyBzYW1wbGVkIGVuZC10by1lbmQgZXZlbnQgbGF0ZW5jeSB0byB0aGUgYnJvd3Nlci9y
ZW5kZXIgYm91bmRhcnksIHNlcGFyYXRlZCBmb3I6CgpgYGB0ZXh0CmdvYWxzCnJvdXRpbmUgZXZl
bnRzCkV1cm9wZQpOb3J0aCBBbWVyaWNhCmBgYAoKRG8gbm90IGltcGx5IGJhY2tlbmQgcHVibGlz
aCBsYXRlbmN5IGFsb25lIG1lYXN1cmVzIHRoZSBhc3NpZ25tZW50IFNMTy4KCi0tLQoKIyA2MU4u
IE02IOKAlCBraWNrb2ZmIGNhcGFjaXR5IG11c3QgYWxyZWFkeSBiZSBhdmFpbGFibGUKCkluIHRo
ZSBzY2FsZS9zdXJnZSBwYXJhZ3JhcGgsIHNheSBob3cgdGhlIGZpbmFsIGFyY2hpdGVjdHVyZSBh
YnNvcmJzOgoKYGBgdGV4dAorNDAsMDAwIHZpZXdlcnMgaW4gMTIwIHNlY29uZHMKYGBgCgp3aXRo
b3V0IGRlcGVuZGluZyBzb2xlbHkgb24gaW5mcmFzdHJ1Y3R1cmUgYm9vdGluZyBhZnRlciB0aGUg
c3VyZ2UgYmVnaW5zLgoKSWYgc2VsZi1ob3N0ZWQ6CgpgYGB0ZXh0CnByZS1wcm92aXNpb24vcHJl
LXNjYWxlIHBlYWsgY2FwYWNpdHkgYmVmb3JlIGtub3duIGtpY2tvZmZzCmBgYAoKb3Igc3RhdGUg
dGhlIGZpbmFsIGVxdWl2YWxlbnQuCgotLS0KCiMgNjFPLiBNNiDigJQgYnJvd3NlciBoaXN0b3J5
IHJlbmRlcmluZwoKVGhlIGxhdGUtam9pbi9mcm9udGVuZCBwYXJhZ3JhcGggc2hvdWxkIG1ha2Ug
Y2xlYXIgdGhhdCBsYXJnZSBoaXN0b3JpZXMgZG8gbm90IHJlcXVpcmUgcmVtb3VudGluZyBhbiB1
bmJvdW5kZWQgRE9NLgoKTWVudGlvbiB0aGUgc2VsZWN0ZWQgZWZmaWNpZW50L3ZpcnR1YWxpemVk
IGV2ZW50LWxpc3QgYXBwcm9hY2ggaWYgdGhlIGZpbmFsIGhpc3Rvcnktc2l6ZSBtb2RlbCBtYWtl
cyBpdCByZWxldmFudC4KCktlZXAgdGhpcyB0byBvbmUgc2VudGVuY2UuCgotLS0KCiMgNjIuIE02
IGNvc3QKClN0YXRlOgoKYGBgdGV4dApiYXNlbGluZSBtb250aGx5IGNvc3QKbWFpbiB0cmFmZmlj
IGFzc3VtcHRpb24KZG9taW5hbnQgdmFyaWFibGUKYnVkZ2V0IHJlc3VsdApgYGAKClJvdW5kIHJl
YXNvbmFibHkuCgpEbyBub3QgcHV0IHRoZSBmdWxsIGNvc3QgbGVkZ2VyIGludG8gdGhlIHByb3Bv
c2FsLgoKLS0tCgojIDYzLiBNNiB0cmFkZS1vZmZzCgpTaG93IGltcG9ydGFudCBkZWNpc2lvbnMg
b25seS4KCkF0IG1pbmltdW06CgpgYGB0ZXh0ClNTRSB2cyBXZWJTb2NrZXQKZmluYWwgZmFuLW91
dCBhcHByb2FjaCB2cyBzdHJvbmdlc3QgYWx0ZXJuYXRpdmUKaG9yaXpvbnRhbCBwYXJ0aXRpb25p
bmcgbW9kZWwKc2luZ2xlLXJlZ2lvbiB2cyBtdWx0aS1yZWdpb24Kc2VsZi1ob3N0ZWQgdnMgbWFu
YWdlZApgYGAKCkF2b2lkIGNhdGFsb2ctc3R5bGUgbGlzdHMuCgotLS0KCiMgNjQuIE02IFBPQyBz
ZWN0aW9uCgpUaGlzIG11c3QgYmUgcHJlY2lzZSBhbmQgcmV2aWV3ZXItZmFjaW5nLgoKU3RhdGU6
CgpgYGB0ZXh0Cm92ZXJhbGwgbGVhc3QtdHJ1c3RlZCBkZXNpZ24gYXNzdW1wdGlvbjoKICAgIHBy
b3ZpZGVyIHNlbWFudGljcwoKd2h5IG5vdCBkaXJlY3RseSB0ZXN0YWJsZToKICAgIG5vIHJlYWwg
cHJvdmlkZXIvc2NoZW1hIHN1cHBsaWVkCgpyaXNraWVzdCBsb2NhbGx5IHRlc3RhYmxlIGFzc3Vt
cHRpb246CiAgICBmaXhlZCBsb2NhbCBOY2hhbi9SZWRpcy9TU0UgZmFuLW91dC9oaXN0b3J5L2Nh
cGFjaXR5IGJlaGF2aW9yIGF0IGFzc2lnbm1lbnQgc2NhbGUKCnRlcm1pbmFsIE0zIGNsYXNzaWZp
Y2F0aW9uOgogICAgSU5DT05DTFVTSVZFIGF0IGZyb3plbiB2Mi4zLjAKCmJlc3QgdmFsaWRhdGVk
IGxvY2FsIHJlc3VsdDoKICAgIDEwMCwwMDAgYWN0aXZlIHZpZXdlcnMKICAgIHplcm8gY29ycmVj
dG5lc3MgdmlvbGF0aW9ucwogICAgc3VyZ2UvbGF0ZSBqb2luIGNsZWFuCiAgICBmYW5fb3V0IHA5
NSAyNzU3IG1zCiAgICBidXJzdCBwOTUgMzcwNyBtcwogICAgZnJvemVuIDUwMC8xMDAwIG1zIGxh
dGVuY3kgZ2F0ZXMgbWlzc2VkCgp3aGF0IHdhcyBsZWFybmVkOgogICAgdGhlIGZpeGVkIGxvY2Fs
IGZhbi1vdXQgdG9wb2xvZ3kgaXMgY2FwYWNpdHkvaGFyZHdhcmUgZGVwZW5kZW50OwogICAgY29u
ZmlnLW9ubHkgdHVuaW5nIHdhcyBleGhhdXN0ZWQuCgpwcm9wb3NhbCBjaGFuZ2U6CiAgICBwcm9k
dWN0aW9uIHVzZXMgaG9yaXpvbnRhbGx5IGJvdW5kZWQgZmFuLW91dCBjYXBhY2l0eSB3aXRoIG1h
dGNoL2hvdC1tYXRjaCBzaGFyZGluZywKICAgIGF1dG9zY2FsaW5nIHBsdXMgcHJlLXNjYWxlZCBr
aWNrb2ZmIGhlYWRyb29tLAogICAgYW5kIGRvZXMgbm90IGFzc3VtZSBvbmUgZml4ZWQgbWFjaGlu
ZS90b3BvbG9neSBzZXJ2ZXMgMTAway4KYGBgCgpOZXZlciB3cml0ZToKCmBgYHRleHQKIlBPQyBw
YXNzZWQiCiIxMDBrIGZhaWxlZCIKIml0IHBhc3NlcyBvbiBhIGRpZmZlcmVudCBtYWNoaW5lIgpg
YGAKClRoZSBhY2N1cmF0ZSBzdGF0ZW1lbnQgaXM6CgpgYGB0ZXh0CjEwMGsgc2NhbGUvY29ycmVj
dG5lc3Mgc3VjY2VlZGVkIGxvY2FsbHk7IHRoZSBmcm96ZW4gbGF0ZW5jeSBhY2NlcHRhbmNlIGRp
ZCBub3QuCmBgYAoKLS0tCgojIDY0QS4gTTYg4oCUIFBPQyBjaHJvbm9sb2d5IG11c3QgYmUgbG9n
aWNhbGx5IGV4YWN0CgpVc2UgdGhpcyBjYXVzYWwgY2hyb25vbG9neToKCmBgYHRleHQKMS4gUHJv
dmlkZXItZmVlZCBzZW1hbnRpY3Mgd2VyZSB0aGUgb3ZlcmFsbCB3ZWFrZXN0IGFzc3VtcHRpb24s
IGJ1dCBubyByZWFsIHByb3ZpZGVyL3NjaGVtYSB3YXMgc3VwcGxpZWQsIHNvIHRoYXQgcmlzayB3
YXMgbm90IGRpcmVjdGx5IHRlc3RhYmxlLgoyLiBUaGUgbmV4dCBhcmNoaXRlY3R1cmUtaW52YWxp
ZGF0aW5nIGxvY2FsIHJpc2sgd2FzIGZpeGVkIGZhbi1vdXQgY2FwYWNpdHkgYXQgYXNzaWdubWVu
dCBzY2FsZS4KMy4gVGhlIGxvY2FsIE0zIHdvcmsgcmVhY2hlZCAxMDAsMDAwIGFjdGl2ZSB2aWV3
ZXJzIHdpdGggemVybyBjb3JyZWN0bmVzcyB2aW9sYXRpb25zLgo0LiBUaGUgYmVzdCB2YWxpZGF0
ZWQgRjEgY29uZmlndXJhdGlvbiBzdGlsbCBtZWFzdXJlZCBmYW5fb3V0IHA5NSAyNzU3IG1zIGFu
ZCBidXJzdCBwOTUgMzcwNyBtcywgbWlzc2luZyB0aGUgZnJvemVuIDUwMC8xMDAwIG1zIGdhdGVz
Lgo1LiBJbnZlc3RpZ2F0aW9uIGlzb2xhdGVkIHRoZSByZW1haW5pbmcgbGltaXRhdGlvbiB0byBm
YW4tb3V0IHRocm91Z2hwdXQvZGVwbG95bWVudCBjYXBhY2l0eSBhbmQgZGVjbGFyZWQgY29uZmln
LW9ubHkgdHVuaW5nIG9mIHRoZSBmcm96ZW4gdG9wb2xvZ3kgZXhoYXVzdGVkLgo2LiBUaGUgZmlu
YWwgcHJvcG9zYWwgdGhlcmVmb3JlIHJlcGxhY2VzIHRoZSBmaXhlZC1jYXBhY2l0eSBhc3N1bXB0
aW9uIHdpdGggaG9yaXpvbnRhbGx5IGJvdW5kZWQgZmFuLW91dCByZXBsaWNhcywgaG90LW1hdGNo
IHN1Yi1zaGFyZGluZywgcmVzb3VyY2UtYXdhcmUgYXV0b3NjYWxpbmcsIHByZS1zY2FsZWQga2lj
a29mZiBjYXBhY2l0eSBhbmQgTisxIGhlYWRyb29tIChvciB0aGUgZmluYWwgTTQgZXF1aXZhbGVu
dCkuCjcuIFRoZSByZXBsYWNlbWVudCBwcm9kdWN0aW9uIHRvcG9sb2d5IGlzIG5vdCBjbGFpbWVk
IHRvIGhhdmUgYmVlbiBsb2NhbGx5IGJlbmNobWFyay12YWxpZGF0ZWQgYnkgTTMuIEl0cyByZW1h
aW5pbmcgY2xhaW1zIGFyZSBzdXBwb3J0ZWQgYnkgY3VycmVudCBzZXJ2aWNlIGZhY3RzLCBleHBs
aWNpdCBxdW90YXMsIGNvbnNlcnZhdGl2ZSBjYXBhY2l0eSBhc3N1bXB0aW9ucywgY29zdCBhbmFs
eXNpcyBhbmQgcmVxdWlyZWQgcHJlLWxhdW5jaCBwcm9kdWN0aW9uIGxvYWQgdGVzdGluZy4KYGBg
CgpUaGlzIHNhdGlzZmllczoKCmBgYHRleHQKYXNzdW1wdGlvbiAtPiBtZXRob2QgLT4gcmVzdWx0
IC0+IHdoYXQgY2hhbmdlZCBpbiBwcm9wb3NhbApgYGAKCi0tLQoKIyA2NS4gTTYgY2xhaW0tbGFu
Z3VhZ2UgYXVkaXQKClNlYXJjaCBmb3I6CgpgYGB0ZXh0Cmd1YXJhbnRlZQpwcm92ZXMKYWx3YXlz
CmlkZW50aWNhbAp6ZXJvIGRvd250aW1lCmV4YWN0bHkgb25jZQp1bmxpbWl0ZWQKZ2xvYmFsIHA5
NQpgYGAKCkV2ZXJ5IHVzYWdlIG11c3QgYmUganVzdGlmaWVkLgoKUHJlZmVyOgoKYGBgdGV4dApk
ZXNpZ25lZCB0bwptZWFzdXJlZCBsb2NhbGx5Cm9ic2VydmVkCmluZmVycmVkCmJvdW5kZWQgYnkK
cmVxdWlyZXMgcHJvdmlkZXIgdmFsaWRhdGlvbgpgYGAKCi0tLQoKIyA2Ni4gTTYgbnVtYmVyIGF1
ZGl0CgpFdmVyeSBudW1iZXIgbXVzdCBiZSBjbGFzc2lmaWVkIGludGVybmFsbHkgYXM6CgpgYGB0
ZXh0CkFTU0lHTk1FTlRfRkFDVApQT0NfT0JTRVJWQVRJT04KQ0FMQ1VMQVRJT04KUExBTk5JTkdf
QVNTVU1QVElPTgpDVVJSRU5UX09GRklDSUFMX0ZBQ1QKUFJPRFVDVElPTl9JTkZFUkVOQ0UKYGBg
CgpSZW1vdmUgdW5leHBsYWluZWQgcHJlY2lzaW9uLgoKLS0tCgojIDY3LiBNNiBhc3NpZ25tZW50
IGNvdmVyYWdlIG1hdHJpeAoKQmVmb3JlIG1hcmtpbmcgTTYgRE9ORSwgcHJvdmUgdGhlIHByb3Bv
c2FsIGNvdmVyczoKCmBgYHRleHQKcHVibGljIGFub255bW91cyByZWFkLW9ubHkKbG9iYnkKbWF0
Y2ggcGFnZQpsYXRlIGpvaW4KcmVsb2FkCndha2UKc2NvcmUgY29oZXJlbmNlCm5vIGR1cGxpY2F0
ZSBkaXNwbGF5Cm5vIGxvc3Mgb2YgYWNjZXB0ZWQgZXZlbnRzCm9yZGVyZWQgZGlzcGxheQoycyBn
b2FsCjVzIG90aGVyCjJzIGhpc3RvcnkKOCBtYXRjaGVzCjEwL3MKNTAvcwoxMDBrCjQway8xMjBz
CjYwLzQwIGdlb2dyYXBoeQokM2sKd2Vla2x5IGxpdmUgZGVwbG95cwpOZXh0LmpzIEFwcCBSb3V0
ZXIKQVdTIHByZWZlcmVuY2UKbGVhc3QtdHJ1c3RlZCBhc3N1bXB0aW9uClBPQwppbXBvcnRhbnQg
dHJhZGUtb2ZmcwpgYGAKCkV2ZXJ5IHJvdzoKCmBgYHRleHQKQ09WRVJFRApgYGAKCi0tLQoKIyA2
OC4gTTYgY29tcGxldGlvbiBnYXRlCgpNNiA9IERPTkUgb25seSBpZjoKCmBgYHRleHQKWyBdIHBy
b3Bvc2FsLm1kIGV4aXN0cwpbIF0gPD0xNTAwIHByb3NlIHdvcmRzClsgXSBmaW5hbCBhcmNoaXRl
Y3R1cmUgb25seQpbIF0gbm8gb2xkIG9uZS1wcmltYXJ5IGRpYWdyYW0KWyBdIHdob2xlIHN5c3Rl
bSB1bmRlcnN0YW5kYWJsZQpbIF0gYXNzaWdubWVudCBmdWxseSBjb3ZlcmVkLCBpbmNsdWRpbmcg
MTAwLXZzLTEwMGsgY3Jvd2QgaW52YXJpYW5jZQpbIF0gcHJvdmlkZXItaW5ncmVzcyB0cmFuc3Bv
cnQgYXNzdW1wdGlvbiBpcyBleHBsaWNpdApbIF0gcHJvdmlkZXIgc2NoZW1hIHZhbGlkYXRpb24v
bm9ybWFsaXphdGlvbi9ldm9sdXRpb24gaXMgYWRkcmVzc2VkClsgXSBhY2NlcHRlZC1ldmVudCBm
YWlsdXJlIGhhbmRsaW5nIGRvZXMgbm90IHNpbGVudGx5IGxvc2UgYWNjZXB0ZWQgaGlzdG9yeQpb
IF0gZW5kLXRvLWVuZCAycy81cyBsYXRlbmN5IGJ1ZGdldCBpcyBob25lc3QKWyBdIHByb2R1Y3Rp
b24gdmlld2VyLXNjcmVlbiBTTE8gb2JzZXJ2YWJpbGl0eSBpcyBpbmNsdWRlZApbIF0gZGVsaXZl
cnktY2FjaGUgbG9zcy9yZWJ1aWxkIHBhdGggaXMgY29oZXJlbnQKWyBdIGZyb250ZW5kL2JhY2tl
bmQgbGl2ZS1kZXBsb3kgQU5EIHJvbGxiYWNrIGFyZSBjb3ZlcmVkClsgXSBsb2JieSBpbmNsdWRl
cyBzY29yZS9taW51dGUgcGx1cyBzdGF0ZS1jaGFuZ2luZyBhbmQgcm91dGluZSBsaXZlIGV2ZW50
cyBhcyBhcHByb3ByaWF0ZQpbIF0gbmV2ZXItYmxhbmsgLyBuby1tYW51YWwtcmVmcmVzaCBiZWhh
dmlvciBpcyBleHBsaWNpdApbIF0gaGlzdG9yeS10by1saXZlIHNlcXVlbmNlIGJvdW5kYXJ5IGlz
IGV4cGxpY2l0ClsgXSBzY29yZS9taW51dGUgYXJlIHByb3ZpZGVyLWRlcml2ZWQgY2Fub25pY2Fs
IHN0YXRlClsgXSBOKzEvbGl2ZS1kZXBsb3kgc3RvcnkgaXMgY3JlZGlibGUKWyBdICs0MGsvMTIw
cyBzdXJnZSBjYXBhY2l0eSBpcyBhbHJlYWR5IGF2YWlsYWJsZS9wcmUtc2NhbGVkIG9yIG1hbmFn
ZWQgZXF1aXZhbGVudGx5ClsgXSBzZWxmLWhvc3RlZCBmYW4tb3V0IHNjYWxpbmcgaXMgZGVzY3Jp
YmVkIGFzIHJlc291cmNlLWF3YXJlL2hvcml6b250YWxseSBhdXRvc2NhbGVkIHJhdGhlciB0aGFu
IGEgdW5pdmVyc2FsIHBlci1tYWNoaW5lIGd1YXJhbnRlZQpbIF0gbGFyZ2UtaGlzdG9yeSBicm93
c2VyIHJlbmRlcmluZyBpcyBhZGRyZXNzZWQKWyBdIGNvc3QgbWF0Y2hlcyBNNQpbIF0gUE9DIHN0
b3J5IG1hdGNoZXMgTTQKWyBdIFBPQyBjaHJvbm9sb2d5IHNhdGlzZmllcyBhc3N1bXB0aW9uIC0+
IG1ldGhvZCAtPiByZXN1bHQgLT4gcHJvcG9zYWwgY2hhbmdlClsgXSBjYXVzYWwgY2hhaW4gbWFr
ZXMgY2xlYXIgdGhlIFBPQyBjaGFuZ2VkIHJhdGhlciB0aGFuIHZhbGlkYXRlZCB0aGUgZmluYWwg
dG9wb2xvZ3kKWyBdIGV2ZXJ5IG1hdGVyaWFsIG51bWJlciBhbmQgZGVjaXNpb24gaW4gcHJvcG9z
YWwubWQgaXMgdHJhY2VhYmxlL2RlZmVuZGFibGUKWyBdIHJldmlld2VyLWZhY2luZyBsYW5ndWFn
ZSBhdm9pZHMgdW5uZWNlc3NhcnkgaW50ZXJuYWwgbWlsZXN0b25lIGphcmdvbgpbIF0gcHJvdmlk
ZXIgYm91bmRhcnkgaG9uZXN0ClsgXSBubyB1bnN1cHBvcnRlZCBjZXJ0YWludHkKWyBdIG9uZSBj
b2hlcmVudCBhcmNoaXRlY3R1cmUKYGBgCgotLS0KCiMgNjkuIE1pbGVzdG9uZSA3IOKAlCBvYmpl
Y3RpdmUKClJlcGxhY2UgdGhlIHJvb3QgcGxhY2Vob2xkZXIgUkVBRE1FIHdpdGggdGhlIGFjdHVh
bCBmaW5hbDoKCmBgYHRleHQKUkVBRE1FLm1kCmBgYAoKSXQgbXVzdCBiZSByZXZpZXdlci1mYWNp
bmcuCgotLS0KCiMgNjlBLiBNNyDigJQgbWFuZGF0b3J5IFBPQyBzb3VyY2UvcmVzdWx0IGNvaGVy
ZW5jZSBkZWNpc2lvbgoKQmVmb3JlIHdyaXRpbmcgUkVBRE1FIHJlc3VsdHMsIHJlY29uY2lsZSB0
aGUgYWN0dWFsIHNlcXVlbmNlIG9mIE0zIGV2aWRlbmNlLgoKVGhlIHJlcG9zaXRvcnkgY29udGFp
bnMgbXVsdGlwbGUgaGlzdG9yaWNhbCBNMyBlcmFzOgoKYGBgdGV4dApoaXN0b3JpY2FsIHE1Ogog
ICAgdjIuMC41CiAgICBoaXN0b3JpY2FsIElOQ09OQ0xVU0lWRSBldmlkZW5jZQoKaW50ZXJtZWRp
YXRlIGNvcnJlY3RlZCBlcmE6CiAgICB2Mi4wLjYKICAgIGhhcm5lc3MvbWVhc3VyZW1lbnQgY29y
cmVjdGlvbiBoaXN0b3J5CgpjdXJyZW50IHRlcm1pbmFsIE0zIGVyYToKICAgIHYyLjMuMAogICAg
YmVzdCB2YWxpZGF0ZWQgRjEgcmVzdWx0CiAgICB0ZXJtaW5hbCBjbGFzc2lmaWNhdGlvbiBJTkNP
TkNMVVNJVkUKYGBgCgpUaGUgUkVBRE1FIG11c3QgdXNlIHRoZSAqKmN1cnJlbnQgdGVybWluYWwg
djIuMy4wL0YxIHJlc3VsdCBhcyB0aGUgcHJpbWFyeSBQT0Mgb3V0Y29tZSoqIHdoaWxlIHByZXNl
cnZpbmcgb2xkZXIgcTUvdjIuMC41IGFuZCB2Mi4wLjYgb25seSBhcyBwcm92ZW5hbmNlIGlmIG5l
ZWRlZC4KCkNyZWF0ZS91cGRhdGU6CgpgYGB0ZXh0CmludGVybmFsX2RvY3MvTTdfUE9DX1NPVVJD
RV9SRVNVTFRfQ09IRVJFTkNFLm1kCmBgYAoKSXQgbXVzdCBzdGF0ZToKCmBgYHRleHQKZXhhY3Qg
Y29tbWl0L2NvbmZpZyB0aGF0IHByb2R1Y2VkIEYxCnRlcm1pbmFsLXZlcmRpY3QgY29tbWl0CmN1
cnJlbnQgc2hpcHBlZCBwb2MvIHNvdXJjZQp3aGF0IGNoYW5nZWQgYWZ0ZXIgRjEsIGlmIGFueXRo
aW5nCndoaWNoIGhpc3RvcmljYWwgcTUvdjIuMC42IGFydGlmYWN0cyByZW1haW4gcHJvdmVuYW5j
ZS1vbmx5CndoYXQgY29tbWFuZCB0aGUgcmV2aWV3ZXIgcnVucwp3aGV0aGVyIHRoYXQgY29tbWFu
ZCBpcyBhIHNtb2tlL3JlcHJvZHVjdGlvbiBwYXRoIG9yIGEgbmV3IGVudmlyb25tZW50LWRlcGVu
ZGVudCBydW4Kd2h5IGEgcmV2aWV3ZXIgcnVuIG1heSBkaWZmZXIgYnkgaGFyZHdhcmUKd2h5IHRo
ZSByZXBvcnRlZCBGMSBtZWFzdXJlbWVudHMgcmVtYWluIHRoZSBzdWJtaXR0ZWQgbWVhc3VyZWQg
cmVzdWx0CmBgYAoKRG8gbm90IGltcGx5OgoKYGBgdGV4dApGMSBwYXNzZWQgYWxsIGZyb3plbiBn
YXRlcwpjdXJyZW50IHNvdXJjZSBwcm9kdWNlZCBhbiBvbGRlciBxNSBudW1iZXIgaXQgZGlkIG5v
dCBwcm9kdWNlCmFub3RoZXIgbWFjaGluZSBpcyBrbm93biB0byBwYXNzCmhhcmR3YXJlLWluZGVw
ZW5kZW50IDEwMGsgbGF0ZW5jeSBpcyBndWFyYW50ZWVkCmBgYAoKUmV2aWV3ZXItZmFjaW5nIHN0
cmF0ZWd5OgoKYGBgdGV4dApzaGlwIHRoZSBjdXJyZW50IGNvcnJlY3RlZCBQT0M7CmlkZW50aWZ5
IEYxIGFuZCBpdHMgZXhhY3Qgc291cmNlL2NvbmZpZyBhcyB0aGUgc3VibWl0dGVkIG1lYXN1cmVk
IHJlc3VsdDsKc3RhdGUgdGhhdCBhIGZyZXNoIHJ1biBpcyBlbnZpcm9ubWVudC1kZXBlbmRlbnQg
YW5kIGNhbiBjbGFzc2lmeSBkaWZmZXJlbnRseTsKcHJlc2VydmUgdGVybWluYWwgTTMgSU5DT05D
TFVTSVZFIGhvbmVzdGx5LgpgYGAKClRoaXMgY29oZXJlbmNlIHByb2JsZW0gbXVzdCBiZSBzb2x2
ZWQgYmVmb3JlIE03IGNhbiBiZSBtYXJrZWQgRE9ORS4KCi0tLQoKIyA3MC4gTTcgcnVuIGluc3Ry
dWN0aW9ucwoKVGhlIHJldmlld2VyIHNob3VsZCBuZWVkIG9ubHk6CgpgYGB0ZXh0CmNvbnRhaW5l
ciBydW50aW1lCmBgYAoKTm86CgpgYGB0ZXh0Cmhvc3QgTm9kZQpob3N0IG5wbQpBV1MgYWNjb3Vu
dApjcmVkZW50aWFscwpSZWRpcyBpbnN0YWxsCk5naW54IGluc3RhbGwKYGBgCgpEb2N1bWVudCB0
aGUgYWN0dWFsIGZpbmFsIHJ1bm5hYmxlIFBPQyBjb21tYW5kLgoKLS0tCgojIDcxLiBNNyBuby0u
Z2l0IHJ1bGUKClRoZSBmaW5hbCBaSVAgd2lsbCBub3QgY29udGFpbiBgLmdpdGAuCgpUaGUgZG9j
dW1lbnRlZCBQT0MgcGF0aCBtdXN0IHN0aWxsIHdvcmsuCgpJZiBmaW5hbCBleGVjdXRpb24gcmVx
dWlyZXM6CgpgYGB0ZXh0CnBvYy9TT1VSQ0VfQ09NTUlUCmBgYAoKb3IgYW5vdGhlciBwYWNrYWdl
ZCBpZGVudGl0eSBmaWxlOgoKbWFrZSBzdXJlIGxhdGVyIHBhY2thZ2luZyBjYW4gc3VwcGx5IGl0
IGF1dG9tYXRpY2FsbHkuCgpEbyBub3QgdGVsbCB0aGUgcmV2aWV3ZXIgdG8gcmVjb25zdHJ1Y3Qg
YSBHaXQgY29tbWl0IG1hbnVhbGx5IHVubGVzcyB0aGUgZmluYWwgUE9DIHRydWx5IHJlcXVpcmVz
IGl0IGFuZCB0aGUgYXNzaWdubWVudCBwZXJtaXRzIHRoYXQgd29ya2Zsb3cuCgotLS0KCiMgNzFB
LiBNNyDigJQgdmVyaWZ5IHRoZSBkb2N1bWVudGVkIHJldmlld2VyIGNvbW1hbmQgd2l0aG91dCBt
YW51ZmFjdHVyaW5nIG5ldyBNMyBldmlkZW5jZQoKTTcncyBtaWxlc3RvbmUgZ2F0ZSBzYXlzIHRo
ZSBydW4gaW5zdHJ1Y3Rpb25zIG11c3QgYmUgdGVzdGVkLgoKRG8gbm90IHNhdGlzZnkgdGhpcyBi
eSBzaWxlbnRseSBjcmVhdGluZyBhbm90aGVyIGZhdm9yYWJsZSAxMDBrIGNhbXBhaWduLgoKVmVy
aWZ5IHRoZSBmaW5hbCBkb2N1bWVudGVkIHJ1biBwYXRoIGF0IHRoZSBhcHByb3ByaWF0ZSBsZXZl
bDoKCmBgYHRleHQKc2hlbGwvc2NyaXB0IHN5bnRheApEb2NrZXIgQ29tcG9zZSBjb25maWcgcmVz
b2x1dGlvbgpubyBob3N0IE5vZGUvbnBtIGRlcGVuZGVuY3kKbm8gY2xvdWQgY3JlZGVudGlhbHMK
bm8gaGlkZGVuIGxvY2FsIHNlcnZpY2UKbm8gLmdpdCBkZXBlbmRlbmN5IGluIFpJUC1saWtlIG1v
ZGUKc291cmNlLWlkZW50aXR5IGhhbmRsaW5nCmNvbnRhaW5lci9pbWFnZSBidWlsZCBwYXRoCnBv
cnRhYmxlIG5vbi1xdWFsaWZ5aW5nIHNtb2tlIHdoZXJlIGFwcHJvcHJpYXRlCmBgYAoKQmVjYXVz
ZSBNMyBpcyB0ZXJtaW5hbCwgZG8gbm90IHJ1biBhbm90aGVyIGhlYXZ5IDEwMGsgcXVhbGlmaWNh
dGlvbiBtZXJlbHkgdG8gdmFsaWRhdGUgUkVBRE1FIHN5bnRheC4KCklmIHRoZSByZXZpZXdlci1m
YWNpbmcgY29tbWFuZCBjYW4gbGF1bmNoIGEgZnJlc2ggZW52aXJvbm1lbnQtZGVwZW5kZW50IGV4
cGVyaW1lbnQsIGV4cGxhaW4gdGhhdCBjbGVhcmx5LgoKRHVyaW5nIE03IHZlcmlmaWNhdGlvbjoK
CmBgYHRleHQKZG8gbm90IG92ZXJ3cml0ZSBxNS92Mi4wLjUsIHYyLjAuNiwgdjIuMy4wLCBvciBG
MSBldmlkZW5jZQpkbyBub3QgdHJlYXQgYSBuZXcgYWQtaG9jIHJ1biBhcyB0aGUgc3VibWl0dGVk
IEYxIG1lYXN1cmVtZW50CmRvIG5vdCBjaGVycnktcGljayBhIG5pY2VyIHJlc3VsdApgYGAKClBy
ZWZlciBjbGVhbiBaSVAtbGlrZS9Db21wb3NlIHZhbGlkYXRpb24gcGx1cyBhIHBvcnRhYmxlIHNt
b2tlIG9yIGFscmVhZHktZXhpc3RpbmcgY29ycmVjdGVkIGNvbW1hbmQtcGF0aCBldmlkZW5jZS4K
ClRoZSBSRUFETUUgc2hvdWxkIGlkZW50aWZ5IEYxIGFzIHRoZSBzdWJtaXR0ZWQgbWVhc3VyZWQg
bG9jYWwgcmVzdWx0IGFuZCBzdGF0ZSB0aGF0IGEgZnJlc2ggaGVhdnkgcnVuIGNhbiBkaWZmZXIg
d2l0aCBob3N0IHJlc291cmNlcy4KCi0tLQoKIyA3MUIuIE03IOKAlCBydW50aW1lIGFuZCBob3N0
LXJlc291cmNlIGhvbmVzdHkKClRoZSBhc3NpZ25tZW50IHJlcXVpcmVzIG9ubHkgYSBjb250YWlu
ZXIgcnVudGltZSwgYnV0IGEgMTAwayBsb2NhbCBsb2FkIHRlc3QgY2FuIHJlcXVpcmUgc3Vic3Rh
bnRpYWwgQ1BVL1JBTS9maWxlLWRlc2NyaXB0b3IgY2FwYWNpdHkuCgpJZiB0aGUgZmluYWwgcmV2
aWV3ZXIgY29tbWFuZCBoYXMgbWVhbmluZ2Z1bCBob3N0IHJlcXVpcmVtZW50czoKCmBgYHRleHQK
c3RhdGUgdGhlbSBicmllZmx5IGFuZCBob25lc3RseS4KYGBgCgpEbyBub3QgY2xhaW06CgpgYGB0
ZXh0CnJ1bnMgb24gYW55IGxhcHRvcApgYGAKCnVubGVzcyBwcm92ZW4uCgpJZiBhbiB1bmRlcnBv
d2VyZWQgaG9zdCBjYW4geWllbGQgYElOQ09OQ0xVU0lWRWAsIHNheSB0aGF0IHRoZSBtYWNoaW5l
IGNsYXNzaWZpY2F0aW9uIGRpc3Rpbmd1aXNoZXMgZW52aXJvbm1lbnQgaW52YWxpZGl0eSBmcm9t
IERVVCBldmlkZW5jZS4KCkV4cGVjdGVkIHJ1bnRpbWUgbWF5IGJlIHN0YXRlZCBvbmx5IGZyb20g
b2JzZXJ2ZWQvZnJvemVuIGV4cGVyaW1lbnQgZHVyYXRpb24sIG5vdCBndWVzc2VkLgoKLS0tCgoj
IDcxQy4gTTcg4oCUIFJFQURNRSBydW4taW5zdHJ1Y3Rpb24gbWluaW11bSBjb250ZW50CgpUaGUg
UkVBRE1FIHJ1biBzZWN0aW9uIG11c3QgZXhwbGljaXRseSBzdGF0ZToKCmBgYHRleHQKcHJlcmVx
dWlzaXRlOiBjb250YWluZXIgcnVudGltZSBvbmx5CndvcmtpbmcgZGlyZWN0b3J5CnRoZSBleGFj
dCBvbmUgY29tbWFuZAp3aGF0IGNvbnRhaW5lcnMvc2VydmljZXMgc3RhcnQKZXhwZWN0ZWQgcnVu
dGltZSBvciBvYnNlcnZlZCByYW5nZQp3aGVyZS93aGVuIHRoZSBtZWFzdXJlZCBzdW1tYXJ5IGFw
cGVhcnMKaG93IHRvIGludGVycHJldCBBQ0NFUFQgLyBSRUpFQ1QgLyBJTkNPTkNMVVNJVkUKY2xl
YW51cCBjb21tYW5kIGlmIHVzZWZ1bAp3aGljaCBjb21tYW5kIGlzIHF1YWxpZnlpbmcgdnMgc21v
a2UvcmVkdWNlZCB2YWxpZGF0aW9uCmBgYAoKRG8gbm90IGFzc3VtZSB0aGVzZSBmYWN0cyBhcmUg
b2J2aW91cyBmcm9tIHNoZWxsIHNjcmlwdHMuCgotLS0KCiMgNzFELiBNNyDigJQgbWF0ZXJpYWwg
dmVyc2lvbi9waW5uaW5nIGNoZWNrCgpCZWZvcmUgZG9jdW1lbnRpbmcgdGhlIHJldmlld2VyIGNv
bW1hbmQsIHN0YXRpY2FsbHkgdmVyaWZ5IHRoYXQgbWF0ZXJpYWwgUE9DIHZlcnNpb25zIGFyZSBw
aW5uZWQgb3IgZGV0ZXJtaW5pc3RpY2FsbHkgY29uc3RyYWluZWQgd2hlcmUgcHJhY3RpY2FsOgoK
YGBgdGV4dApjb250YWluZXIgaW1hZ2VzL2Jhc2UgaW1hZ2VzCk5jaGFuL05naW54IHZlcnNpb24K
Tm9kZS9ydW50aW1lCnBhY2thZ2UgbG9ja2ZpbGUvZGVwZW5kZW5jaWVzClJlZGlzIGltYWdlCmBg
YAoKRG8gbm90IGludHJvZHVjZSBob3N0IHBhY2thZ2UtbWFuYWdlciByZXF1aXJlbWVudHMuCgpJ
ZiBhIG1hdGVyaWFsIGRlcGVuZGVuY3kgaW50ZW50aW9uYWxseSBmbG9hdHMsIGRvY3VtZW50IHdo
eSBpdCBjYW5ub3QgaW52YWxpZGF0ZSByZXByb2R1Y2liaWxpdHkuCgpUaGUgZmluYWwgY2xlYW4t
cm9vbSBwcm9vZiBzdGlsbCBiZWxvbmdzIHRvIE04LCBidXQgTTcgbXVzdCBub3QgcHVibGlzaCBh
IHJ1biBjb21tYW5kIHRoYXQgaXMgb2J2aW91c2x5IG5vbi1kZXRlcm1pbmlzdGljLgoKLS0tCgoj
IDcyLiBNNyBzbW9rZSB2cyBtZWFzdXJlZCBldmlkZW5jZQoKQmUgZXhwbGljaXQ6CgpgYGB0ZXh0
CnBvcnRhYmxlIHNtb2tlIC8gY29tbWFuZC1wYXRoIHZhbGlkYXRpb24KIT0Kc3VibWl0dGVkIG1l
YXN1cmVkIEYxIHJlc3VsdApgYGAKClRoZSBwcmltYXJ5IG1lYXN1cmVkIFBPQyByZXN1bHQgZm9y
IHRoZSBmaW5hbCBzdWJtaXNzaW9uIGlzIHRoZSB0ZXJtaW5hbCB2Mi4zLjAgYmVzdC1lZmZvcnQg
RjEgcmVzdWx0OgoKYGBgdGV4dAoxMDAsMDAwIGFjdGl2ZQpjb3JyZWN0bmVzcyA9IDAKZmFuX291
dCBwOTUgPSAyNzU3IG1zCmJ1cnN0IHA5NSA9IDM3MDcgbXMKTTMgdGVybWluYWwgY2xhc3NpZmlj
YXRpb24gPSBJTkNPTkNMVVNJVkUKYGBgCgpPbGRlciBxNS92Mi4wLjUgYW5kIHYyLjAuNiByZXN1
bHRzIGFyZSBwcm92ZW5hbmNlL2hpc3RvcnksIG5vdCB0aGUgY3VycmVudCBoZWFkbGluZSByZXN1
bHQuCgpEbyBub3QgbWFudWZhY3R1cmUgYSBuZXcgZmF2b3JhYmxlIGNhbXBhaWduIGR1cmluZyBN
Ny4KCi0tLQoKIyA3My4gTTcgbWVhc3VyZWQtb3V0cHV0IGV4cGxhbmF0aW9uCgpCcmllZmx5IGV4
cGxhaW46CgpgYGB0ZXh0CndoYXQgc3RhcnRzCndoYXQgaXMgbWVhc3VyZWQKd2hlcmUgdmVyZGlj
dC9vdXRwdXQgYXBwZWFycwp3aGF0IEFDQ0VQVC9SRUpFQ1QvSU5DT05DTFVTSVZFIG1lYW5zCndo
eSBtYWNoaW5lIHJlc291cmNlcyBjYW4gY2hhbmdlIGEgZnJlc2ggcnVuJ3MgcmVzdWx0CmBgYAoK
RG8gbm90IGR1bXAgaW50ZXJuYWwgdGVzdCBkZXRhaWxzLgoKLS0tCgojIDc0LiBNNyBQT0Mgd3Jp
dGUtdXAKCkNyZWF0ZSBvbmUgYm91bmRlZCBzZWN0aW9uIG9mOgoKYGBgdGV4dAo8PTMwMCB3b3Jk
cwpgYGAKCkl0IG11c3QgY292ZXIgZXhhY3RseToKCmBgYHRleHQKYXNzdW1wdGlvbgptZXRob2QK
cmVzdWx0CndoYXQgY2hhbmdlZCBpbiBwcm9wb3NhbApgYGAKCk5vIHBsYWNlaG9sZGVycy4KCi0t
LQoKIyA3NS4gTTcgYXNzdW1wdGlvbiB3b3JkaW5nCgpJbmNsdWRlIGJvdGg6CgpgYGB0ZXh0Cm92
ZXJhbGwgd2Vha2VzdCBhc3N1bXB0aW9uOgogICAgcHJvdmlkZXIgc2VtYW50aWNzCgpsb2NhbGx5
IHRlc3RhYmxlIGFzc3VtcHRpb246CiAgICBmaXhlZCBOY2hhbi9SZWRpcy9TU0UgZGVsaXZlcnkv
aGlzdG9yeS9jYXBhY2l0eSBiZWhhdmlvciBhdCBhc3NpZ25tZW50IHNjYWxlCmBgYAoKRXhwbGFp
biB3aHkgcHJvdmlkZXIgc2VtYW50aWNzIHdlcmUgbm90IGxvY2FsbHkgdGVzdGFibGUuCgotLS0K
CiMgNzYuIE03IG1ldGhvZCB3b3JkaW5nCgpLZWVwIGNvbmNpc2UuCgpVc2UgYWN0dWFsIGN1cnJl
bnQgTTMgZmFjdHM6CgpgYGB0ZXh0CnNpbXVsYXRlZCBzdHJlYW0KOCBtYXRjaGVzCjYwayBiYXNl
bGluZSAtPiArNDBrIHN1cmdlIC0+IDEwMGsgdGFyZ2V0CnN0ZWFkeS9idXJzdCBwdWJsaWNhdGlv
biBwcm9maWxlCjQgY29vcmRpbmF0ZWQgbG9hZGdlbiBzaGFyZHMKY29ycmVjdG5lc3MgLyByZWNv
bm5lY3QgLyBsYXRlLWpvaW4gc2NlbmFyaW9zCmZyb3plbiB2Mi4zLjAgZ2F0ZXMKZm9jdXNlZCBk
aWFnbm9zdGljIHByb2JlIGxhZGRlcgpgYGAKCkRvIG5vdCBjbGFpbSBhIHRlcm1pbmFsIDMtc2Vl
ZCBjYW1wYWlnbiByYW4gYWZ0ZXIgRjE7IHRoZSB0ZXJtaW5hbCByZWNvcmQgZXhwbGljaXRseSBz
YXlzIG5vdCB0byB3YXN0ZSB0aG9zZSBydW5zIGF0IGEgY29uZmlndXJhdGlvbiBhbHJlYWR5IGZh
ciBvdXRzaWRlIHRoZSBnYXRlcy4KCi0tLQoKIyA3Ny4gTTcgcmVzdWx0IHdvcmRpbmcKClN0YXRl
OgoKYGBgdGV4dApNMyB0ZXJtaW5hbCBjbGFzc2lmaWNhdGlvbiA9IElOQ09OQ0xVU0lWRQpgYGAK
ClRoZW4gc3RhdGUgdGhlIG1lYXN1cmVkIEYxIHJlc3VsdCBhY2N1cmF0ZWx5OgoKYGBgdGV4dAox
MDBrIGFjdGl2ZSByZWFjaGVkCmNvcnJlY3RuZXNzIHplcm8KZmFuX291dCBwOTUgMjc1NyBtcwpi
dXJzdCBwOTUgMzcwNyBtcwpsYXRlbmN5IGdhdGVzIG1pc3NlZApgYGAKCkV4cGxhaW4gdGhhdCB0
aGUgZXhwZXJpbWVudCBpc29sYXRlZCBmaXhlZCBmYW4tb3V0IHRocm91Z2hwdXQvZGVwbG95bWVu
dCBjYXBhY2l0eSBhcyB0aGUgcmVtYWluaW5nIGxpbWl0YXRpb24uCgpEbyBub3Qgc2F5OgoKYGBg
dGV4dAp0aGUgc3lzdGVtIGNhbm5vdCBoYW5kbGUgMTAwawpgYGAKCmJlY2F1c2UgMTAwayBjb25u
ZWN0aW9uL2NvcnJlY3RuZXNzIGJlaGF2aW9yIGRpZCBzdWNjZWVkLgoKLS0tCgojIDc4LiBNNyBw
cm9wb3NhbC1pbXBhY3Qgd29yZGluZwoKTWF0Y2ggTTQvTTYgZXhhY3RseS4KClByZWZlcnJlZCBz
aGFwZToKCmBgYHRleHQKVGhlIFBPQyByZWFjaGVkIDEwMCwwMDAgYWN0aXZlIHZpZXdlcnMgd2l0
aCB6ZXJvIGNvcnJlY3RuZXNzIHZpb2xhdGlvbnMgYnV0IGRpZCBub3QgbWVldCB0aGUgZnJvemVu
IGZhbi1vdXQvYnVyc3QgbGF0ZW5jeSBnYXRlcyBvbiB0aGUgdGVzdGVkIHRvcG9sb2d5LiBUaGUg
cHJvcG9zYWwgdGhlcmVmb3JlIHJlbW92ZXMgdGhlIGZpeGVkIDQtcGFydGl0aW9uIGNhcGFjaXR5
IGFzc3VtcHRpb24gYW5kIHVzZXMgaG9yaXpvbnRhbGx5IGJvdW5kZWQgZmFuLW91dCByZXBsaWNh
cyB3aXRoIG1hdGNoL2hvdC1tYXRjaCBzaGFyZGluZywgcHJlLXNjYWxlZCBwZWFrIGNhcGFjaXR5
IGFuZCBhdXRvc2NhbGluZy9OKzEgaGVhZHJvb20gKG9yIHRoZSBleGFjdCBmaW5hbCBNNCBlcXVp
dmFsZW50KS4KYGBgCgpEbyBub3QgaW1wbHkgdGhlIHJlcGxhY2VtZW50IHRvcG9sb2d5IGl0c2Vs
ZiB3YXMgYmVuY2htYXJrLXZhbGlkYXRlZCBieSBNMy4KCi0tLQoKLS0tCgojIDc5LiBNNyAzMDAt
d29yZCBhdWRpdAoKQ291bnQgb25seSB0aGUgUE9DIHdyaXRlLXVwLgoKUmVjb3JkIGludGVybmFs
bHk6CgpgYGB0ZXh0ClBPQyB3cml0ZS11cCB3b3JkcyA9IDxuPgpgYGAKClRhcmdldDoKCmBgYHRl
eHQKfjE4MOKAkzI2MApgYGAKCmZvciBtYXJnaW4uCgotLS0KCiMgNzlBLiBNNyBQT0Mgd3JpdGUt
dXAgd29yZC1jb3VudCBtZXRob2QKCkRlZmluZSBhIGNsZWFyIHN0YXJ0L2VuZCBib3VuZGFyeSBm
b3IgdGhlIDw9MzAwLXdvcmQgUE9DIHdyaXRlLXVwLgoKQ291bnQgY29uc2VydmF0aXZlbHk6Cgpg
YGB0ZXh0CnNlY3Rpb24gaGVhZGluZyhzKSBpbnNpZGUgdGhlIHdyaXRlLXVwCnBhcmFncmFwaHMK
YnVsbGV0cwppbmxpbmUgbGFiZWxzIHN1Y2ggYXMgQXNzdW1wdGlvbiAvIE1ldGhvZCAvIFJlc3Vs
dCAvIFByb3Bvc2FsIGltcGFjdApgYGAKCkRvIG5vdCBleGNsdWRlIHdvcmRzIG1lcmVseSBiZWNh
dXNlIHRoZXkgYXBwZWFyIGluIGEgdGFibGUgb3IgY29kZSBibG9jay4KClRhcmdldCB3ZWxsIGJl
bG93IDMwMC4KCktlZXAgcnVuIGluc3RydWN0aW9ucyBhbmQgQUktcHJvY2VzcyB0ZXh0IG91dHNp
ZGUgdGhlIGJvdW5kZWQgUE9DIHdyaXRlLXVwIHNlY3Rpb24gc28gdGhlIHJldmlld2VyIGNhbiBz
ZWUgZXhhY3RseSB3aGF0IGlzIHN1YmplY3QgdG8gdGhlIGxpbWl0LgoKLS0tCgojIDc5Qi4gTTcg
4oCUIG1hdGVyaWFsIGxpbWl0YXRpb25zIHNlY3Rpb24KCkluY2x1ZGUgYSBjb25jaXNlIHJldmll
d2VyLWZhY2luZyBsaW1pdGF0aW9ucyBwYXJhZ3JhcGgvc2VjdGlvbi4KCkF0IG1pbmltdW0gZGlz
Y2xvc2U6CgpgYGB0ZXh0Ck0zIHRlcm1pbmFsIGNsYXNzaWZpY2F0aW9uIHdhcyBJTkNPTkNMVVNJ
VkUKMTAwayBzY2FsZS9jb3JyZWN0bmVzcyBzdWNjZWVkZWQsIGZyb3plbiBsYXRlbmN5IGFjY2Vw
dGFuY2UgZGlkIG5vdApGMSB3YXMgbWVhc3VyZWQgb24gYSBzcGVjaWZpYyBsb2NhbCBoYXJkd2Fy
ZS9jb250YWluZXIgZW52aXJvbm1lbnQKYWJzb2x1dGUgZmFuLW91dCBjYXBhY2l0eSBpcyBoYXJk
d2FyZS9kZXBsb3ltZW50IGRlcGVuZGVudAp0aGUgZmluYWwgcmVwbGFjZW1lbnQgcHJvZHVjdGlv
biB0b3BvbG9neSB3YXMgbm90IGl0c2VsZiBiZW5jaG1hcmstdmFsaWRhdGVkIGJ5IE0zCnJlYWwg
cHJvdmlkZXIgc2VtYW50aWNzIHdlcmUgdW5hdmFpbGFibGUKcmVhbCBBV1MvZ2VvZ3JhcGhpYy9i
cm93c2VyIGVuZC10by1lbmQgbGF0ZW5jeSB3YXMgbm90IG1lYXN1cmVkCnByb2R1Y3Rpb24gY29z
dCBpcyBtb2RlbGVkLCBub3QgaW5jdXJyZWQKYSBmcmVzaCByZXZpZXdlciBydW4gbWF5IGNsYXNz
aWZ5IGRpZmZlcmVudGx5IG9uIGRpZmZlcmVudCBoYXJkd2FyZQpgYGAKCkRvIG5vdCBzYXkgb3Ig
aW1wbHkgdGhhdCBhbm90aGVyIG1hY2hpbmUgaGFzIGFscmVhZHkgcGFzc2VkIHVubGVzcyBhY3R1
YWwgZXZpZGVuY2UgZXhpc3RzLgoKLS0tCgojIDgwLiBNNyBBSSBwcm9jZXNzCgpXcml0ZSBhIGZl
dyBmYWN0dWFsIHNlbnRlbmNlcy4KClNheSBBSSBhc3Npc3RlZCB3aXRoOgoKYGBgdGV4dAphcmNo
aXRlY3R1cmUgZXhwbG9yYXRpb24KUE9DIGNvbnRyYWN0L2NvZGUgaXRlcmF0aW9uCmV2aWRlbmNl
IGFuYWx5c2lzCmN1cnJlbnQtc291cmNlIHJlc2VhcmNoCmNvc3QgY2FsY3VsYXRpb25zCmRyYWZ0
aW5nCmF1ZGl0aW5nCmBgYAoKYW5kIHdhcyBkaXJlY3RlZCB0bzoKCmBgYHRleHQKcHJlc2VydmUg
cmVxdWlyZW1lbnRzCnNlcGFyYXRlIGZhY3QvYXNzdW1wdGlvbi9tZWFzdXJlbWVudC9pbmZlcmVu
Y2UKbm90IGNoYW5nZSBjcml0ZXJpYSBhZnRlciBtZWFzdXJlbWVudApzdXJmYWNlIElOQ09OQ0xV
U0lWRS9SRUpFQ1QgZXZpZGVuY2UKdXNlIGN1cnJlbnQgcHJpbWFyeSBzb3VyY2VzCmtlZXAgY2Fu
ZGlkYXRlIGFjY291bnRhYmxlIGZvciBkZWNpc2lvbnMKYGBgCgpEbyBub3QgbWluaW1pemUgQUkg
dXNlIGZhbHNlbHkuCgotLS0KCiMgODEuIE03IGluc3RydWN0aW9uIGFydGlmYWN0cwoKRW5zdXJl
IHByb3ZlbmFuY2UgaW5jbHVkZXMgYWxsIGFjdHVhbGx5IHVzZWQgaW5zdHJ1Y3Rpb24gZmlsZXMu
CgpMaWtlbHkgY2FuZGlkYXRlczoKCmBgYHRleHQKQUdFTlRTLm1kCk1JTEVTVE9ORV8yX0NMT1NF
X0dBUF9QUk9NUFRfQVJUSUZBQ1QubWQKTUlMRVNUT05FXzNfQVNTSUdOTUVOVF9TWU5DRURfRVhF
Q1VUSU9OX1BMQU5fdjJfRklOQUwubWQKUEFSQUxMRUxfTTNfU0FGRV9XT1JLXzEwMF9QRVJDRU5U
X1BST01QVF9BUlRJRkFDVC5tZApNSUxFU1RPTkVTXzRfNV82XzdfQ0xPU0VfMTAwX1BFUkNFTlRf
T1ZFUk5JR0hUX1BST01QVF9BUlRJRkFDVC5tZApgYGAKCk9ubHkgaW5jbHVkZSB0aG9zZSBhY3R1
YWxseSB1c2VkLgoKLS0tCgojIDgyLiBNNyBjb25zaXN0ZW5jeSBhdWRpdAoKQ29tcGFyZToKCmBg
YHRleHQKUkVBRE1FLm1kCnByb3Bvc2FsLm1kCk00IGZpbmFsIHJlY29uY2lsaWF0aW9uCk01IGNv
c3QgbW9kZWwKdGVybWluYWwgdjIuMy4wL0YxIGV2aWRlbmNlCmhpc3RvcmljYWwgcTUvdjIuMC41
IGFuZCB2Mi4wLjYgcHJvdmVuYW5jZSB3aGVyZSBjaXRlZAphY3R1YWwgbGF1bmNoIHNjcmlwdHMK
QUkgcHJvdmVuYW5jZQpgYGAKCk5vIGRpc2FncmVlbWVudCBvbjoKCmBgYHRleHQKdmVyZGljdAph
cmNoaXRlY3R1cmUKY29zdApyZWdpb24KcnVuIGNvbW1hbmQKcHJvcG9zYWwgaW1wYWN0CnByb3Zp
ZGVyIHJpc2sKYGBgCgotLS0KCiMgODJBLiBNNyDigJQgc2hpcHBlZCBQT0MgbXVzdCByZW1haW4g
YW4gZXhwZXJpbWVudCwgbm90IGEgaGlkZGVuIHByb2R1Y3Rpb24gaW1wbGVtZW50YXRpb24KCkV2
ZW4gdGhvdWdoIE00IGNoYW5nZXMgdGhlIHByb2R1Y3Rpb24gYXJjaGl0ZWN0dXJlLCBkbyBub3Qg
cmV3cml0ZSBgcG9jL2AgaW50byBhIG1pbmlhdHVyZSB2ZXJzaW9uIG9mIHRoZSBmaW5hbCBwcm9k
dWN0aW9uIHN5c3RlbSBkdXJpbmcgTTcuCgpUaGUgZmluYWwgUE9DIHJlbWFpbnMgZXZpZGVuY2Ug
b2YgdGhlIHJpc2t5IGFzc3VtcHRpb24gdGhhdCB3YXMgYWN0dWFsbHkgdGVzdGVkIGFuZCBvZiB0
aGUgZGVzaWduIGNoYW5nZSBpdCBjYXVzZWQuCgpEbyBub3QgZmxhdHRlbiB0aGUgbGF0ZXIgTTMg
ZXZvbHV0aW9uIGludG8gInYyLjAuNiBoYXJuZXNzIGNvcnJlY3Rpb25zLiIgVGhlIHJlcG9zaXRv
cnkgYWR2YW5jZWQgdGhyb3VnaCBhZGRpdGlvbmFsIHYyLjMuMCBEVVQvY29uZmlnIGFuZCBkaWFn
bm9zdGljIHdvcmsuCgpDaGFyYWN0ZXJpemUgZWFjaCBjaXRlZCByZXN1bHQgYnkgdGhlIHNvdXJj
ZS9jb25maWcgdGhhdCBhY3R1YWxseSBwcm9kdWNlZCBpdC4KCkZvciB0aGUgZmluYWwgcmV2aWV3
ZXItZmFjaW5nIFBPQyBzdG9yeSwgdGhlIGN1cnJlbnQgaGVhZGxpbmUgZXZpZGVuY2UgaXMgRjEg
dW5kZXIgdjIuMy4wOyBxNS92Mi4wLjUgYW5kIHYyLjAuNiBhcmUgaGlzdG9yaWNhbCBwcm92ZW5h
bmNlIHVubGVzcyBhIHNwZWNpZmljIGNhdXNhbCBwb2ludCByZXF1aXJlcyB0aGVtLgoKRG8gbm90
IGFkZCBhIG5ldyBob3Jpem9udGFsIHByb2R1Y3Rpb24gZmFuLW91dCBpbXBsZW1lbnRhdGlvbiBq
dXN0IHRvIG1ha2UgdGhlIGZpbmFsIGFyY2hpdGVjdHVyZSBhbmQgUE9DIGxvb2sgaWRlbnRpY2Fs
LgoKVGhlIGFzc2lnbm1lbnQgZXhwbGljaXRseSBhbGxvd3MgdGhlIFBPQyByZXN1bHQgdG8gY2hh
bmdlIHRoZSBwcm9wb3NhbC4KCi0tLQoKIyA4My4gTTcgY29tcGxldGlvbiBnYXRlCgpNNyA9IERP
TkUgb25seSBpZjoKCmBgYHRleHQKWyBdIHJvb3QgUkVBRE1FLm1kIGlzIHJlYWwsIG5vdCBwbGFj
ZWhvbGRlcgpbIF0gb25lLWNvbW1hbmQgcnVuIGluc3RydWN0aW9ucyBhcmUgY29ycmVjdApbIF0g
ZG9jdW1lbnRlZCBjb21tYW5kIHBhdGggaXMgdGVzdGVkIGF0IGFuIGFwcHJvcHJpYXRlIGNsZWFu
L25vbi1xdWFsaWZ5aW5nIGxldmVsClsgXSBjb250YWluZXItcnVudGltZS1vbmx5IHJlcXVpcmVt
ZW50IHByZXNlcnZlZApbIF0gbm8gaGlkZGVuIGhvc3QgR2l0L05vZGUvbnBtL2Nsb3VkIGRlcGVu
ZGVuY3kgZXhpc3RzIGluIHRoZSBwYWNrYWdlZCBydW4gcGF0aApbIF0gbm8gY2xvdWQgYWNjb3Vu
dCByZXF1aXJlZApbIF0gc21va2UgdnMgcXVhbGlmeWluZyBkaXN0aW5jdGlvbiBjb3JyZWN0Clsg
XSB0ZXJtaW5hbCB2Mi4zLjAvRjEgc291cmNlLXJlc3VsdCBjb2hlcmVuY2UgaXMgZXhwbGljaXRs
eSByZXNvbHZlZApbIF0gUkVBRE1FIGNsZWFybHkgc2VwYXJhdGVzIHE1L3YyLjAuNSBhbmQgdjIu
MC42IHByb3ZlbmFuY2UgZnJvbSB0aGUgdGVybWluYWwgRjEgcmVzdWx0ClsgXSBob3N0IHJlc291
cmNlL3J1bnRpbWUgZXhwZWN0YXRpb25zIGFyZSBob25lc3Qgd2hlcmUgbWF0ZXJpYWwKWyBdIFJF
QURNRSBkb2VzIG5vdCBpbXBseSBoYXJkd2FyZS1pbmRlcGVuZGVudCAxMDBrIGxhdGVuY3kgb3Ig
YW4gdW5tZWFzdXJlZCBwYXNzIG9uIGFub3RoZXIgbWFjaGluZQpbIF0gZXhwZWN0ZWQgcnVudGlt
ZSBpcyBzdGF0ZWQgZnJvbSBvYnNlcnZlZC9mcm96ZW4gZXZpZGVuY2UsIG5vdCBndWVzc2VkClsg
XSBSRUFETUUgc3RhdGVzIHdoZXJlL3doZW4gdGhlIG1lYXN1cmVkIHN1bW1hcnkgYXBwZWFycwpb
IF0gUkVBRE1FIGV4cGxhaW5zIGhvdyB0byBpbnRlcnByZXQgQUNDRVBUIC8gUkVKRUNUIC8gSU5D
T05DTFVTSVZFClsgXSA8PTMwMC13b3JkIFBPQyB3cml0ZS11cApbIF0gYXNzdW1wdGlvbiBwcmVz
ZW50ClsgXSBtZXRob2QgcHJlc2VudApbIF0gcmVzdWx0IHByZXNlbnQKWyBdIHByb3Bvc2FsIGlt
cGFjdCBwcmVzZW50ClsgXSBtYXRlcmlhbCBsaW1pdGF0aW9ucyBhcmUgc3RhdGVkIGNsZWFybHkK
WyBdIEFJIHByb2Nlc3MgcHJlc2VudApbIF0gdmFsdWVzIG1hdGNoIGV2aWRlbmNlClsgXSBhcmNo
aXRlY3R1cmUgbWF0Y2hlcyBwcm9wb3NhbApgYGAKCi0tLQoKIyA4NC4gTWlsZXN0b25lIHRyYWNr
ZXIgdXBkYXRlcwoKVXBkYXRlOgoKYGBgdGV4dAppbnRlcm5hbF9kb2NzL0xJVkVfTUFUQ0hfQ0VO
VFJFX0FTU0lHTk1FTlRfTUlMRVNUT05FUyAoMykubWQKYGBgCgpvbmx5IHdoZW4gZWFjaCBjb21w
bGV0aW9uIGdhdGUgYWN0dWFsbHkgcGFzc2VzLgoKRW5kIHN0YXRlIG9mIHRoaXMgdGFzayBzaG91
bGQgYmU6CgpgYGB0ZXh0Ck00IERPTkUKTTUgRE9ORQpNNiBET05FCk03IERPTkUKTTggTkVYVCAv
IE5PVCBTVEFSVEVECmBgYAoKRG8gbm90IG1hcmsgTTjigJNNMTAgZG9uZS4KCi0tLQoKIyA4NEEu
IFJlY29uY2lsZSBzdGFsZSBtaWxlc3RvbmUvY29udHJhY3QgcmVmZXJlbmNlcwoKVGhlIHJlcG9z
aXRvcnkgY29udGFpbnMgaGlzdG9yaWNhbCBNMyBwaGFzZXMgYW5kIG1heSBjb250YWluIHN0YWxl
IHRleHQgdGhhdCBhcHBlYXJzIHRvIG1ha2Ugb2xkIGNvbnRyYWN0cyBjdXJyZW50LgoKVXBkYXRl
IHRoZSB0cmFja2VyL2N1cnJlbnQgc3RhdHVzIGRvY3Mgc28gdGhleSBjbGVhcmx5IGRpc3Rpbmd1
aXNoOgoKYGBgdGV4dApoaXN0b3JpY2FsIHE1IGVyYToKICAgIHYyLjAuNQogICAgaGlzdG9yaWNh
bCBJTkNPTkNMVVNJVkUgZXZpZGVuY2UKCmludGVybWVkaWF0ZSBjb3JyZWN0aW9uIGVyYToKICAg
IHYyLjAuNgogICAgaGFybmVzcy9tZWFzdXJlbWVudCBjb3JyZWN0aW9uIHByb3ZlbmFuY2UKCmN1
cnJlbnQgdGVybWluYWwgTTMgZXJhOgogICAgdjIuMy4wCiAgICBGMSBiZXN0IHZhbGlkYXRlZCBy
ZXN1bHQKICAgIDEwMGsgYWN0aXZlCiAgICBjb3JyZWN0bmVzcyAwCiAgICBmYW5fb3V0IHA5NSAy
NzU3IG1zCiAgICBidXJzdCBwOTUgMzcwNyBtcwogICAgdGVybWluYWwgY2xhc3NpZmljYXRpb24g
SU5DT05DTFVTSVZFCiAgICBmcm96ZW4gdG9wb2xvZ3kgY29uZmlnLW9ubHkgdHVuaW5nIGNsb3Nl
ZAogICAgbm8gc2VlZHMtNDIvNDMvNDQgY2FtcGFpZ24gYXQgdW5jaGFuZ2VkIGZhaWxpbmcgY29u
ZmlnCgpNNCBkZWNpc2lvbjoKICAgIE0zIHJlbWFpbnMgY2xvc2VkCiAgICBmaXhlZCA0LXBhcnRp
dGlvbiBjYXBhY2l0eSBhc3N1bXB0aW9uIHdpdGhkcmF3biBmb3IgcHJvZHVjdGlvbgogICAgZmlu
YWwgcHJvZHVjdGlvbiBhcmNoaXRlY3R1cmUgcmV2aXNlZCBhcm91bmQgaG9yaXpvbnRhbC9yZXNv
dXJjZS1hd2FyZSBjYXBhY2l0eQpgYGAKCkRvIG5vdCBsZWF2ZSBnZW5lcmljIHRleHQgc3VjaCBh
czoKCmBgYHRleHQKSWYgTTMgPSBJTkNPTkNMVVNJVkU6IHJlcnVuIHVudGlsIHBhc3MKYGBgCgph
cyB0aGUgYXBwYXJlbnQgY3VycmVudCBpbnN0cnVjdGlvbi4KClByZXNlcnZlIGhpc3RvcmljYWwg
ZmFjdHM7IGRvIG5vdCByZXdyaXRlIHE1IG9yIHYyLjAuNi4KCkN1cnJlbnQgc3RhdHVzIGRvY3Mg
bXVzdCBpZGVudGlmeSB2Mi4zLjAgYXMgdGhlIHRlcm1pbmFsIE0zIGNvbnRyYWN0L2V2aWRlbmNl
IGVyYSB1bmxlc3MgdGhlIHJlcG9zaXRvcnkgaGFzIHRydXRoZnVsbHkgYWR2YW5jZWQgYWdhaW4u
CgotLS0KCiMgODUuIEludGVybmFsIHRyYWNlYWJpbGl0eSB1cGRhdGUKClVwZGF0ZToKCmBgYHRl
eHQKaW50ZXJuYWxfZG9jcy9UUkFDRUFCSUxJVFlfTUFUUklYLm1kCmBgYAoKZm9yIGZpbmFsIE00
IGFyY2hpdGVjdHVyZSBhbmQgTTUvTTYgZXZpZGVuY2Ugd2hlcmUgaXQgaXMgY3VycmVudGx5IGF1
dGhvcml0YXRpdmUuCgpFbnN1cmUgbm8gcm93IHN0aWxsIHRyZWF0cyB0aGUgb2xkIG9uZS1wcmlt
YXJ5IDEwMGsgYXJjaGl0ZWN0dXJlIGFzIGZpbmFsLgoKLS0tCgojIDg2LiBIaXN0b3JpY2FsIHBy
ZXNlcnZhdGlvbgoKRG8gbm90IGRlbGV0ZToKCmBgYHRleHQKcTUvdjIuMC41IGV2aWRlbmNlCnYy
LjAuNiBjb3JyZWN0aW9uIGhpc3RvcnkKdjIuMy4wIGV4cGVyaW1lbnQgY29udHJhY3QKRjEgcHJv
YmUvcmVzdWx0IGV2aWRlbmNlCk0zX1RBUkdFVF9FUkFfU1RBTExfRElBR05PU0lTLm1kCnRlcm1p
bmFsIE0zIHZlcmRpY3QgY29tbWl0L2hpc3RvcnkKTTQgY2F1c2FsIHJlY29uY2lsaWF0aW9uCmBg
YAoKVGhleSBleHBsYWluIGhvdyB0aGUgZGVzaWduIGV2b2x2ZWQuCgpGaW5hbCBwYWNrYWdpbmcg
bGF0ZXIgbWF5IGV4Y2x1ZGUgaW50ZXJuYWwgZXZpZGVuY2Ugc2VsZWN0aXZlbHksIGJ1dCByZXBv
c2l0b3J5IGhpc3RvcnkgcmVtYWlucy4KCi0tLQoKIyA4Ny4gRG8gbm90IHN0YXJ0IE044oCTTTEw
CgpNOOKAk00xMCBhcmUgc2VwYXJhdGUuCgpZb3UgbWF5IHBlcmZvcm0gKipvbmx5KiogbGlnaHR3
ZWlnaHQgY2hlY2tzIG5lZWRlZCB0byBwcm92ZSBNNOKAk003IGNvcnJlY3RuZXNzLgoKRG8gbm90
OgoKYGBgdGV4dApkZXN0cnVjdGl2ZWx5IGNsZWFuIHBvYy8KZGVsZXRlIGludGVybmFsIGRvY3Mg
Zm9yIHBhY2thZ2luZwpidWlsZCBmaW5hbCBaSVAKY2FsbCBmaW5hbCBzdWJtaXNzaW9uIGNvbXBs
ZXRlCmBgYAoKVGhlIHRhc2sgZW5kcyB3aXRoOgoKYGBgdGV4dApNOCBuZXh0CmBgYAoKLS0tCgoj
IDg4LiBBdXRvbm9tb3VzIGxvb3Ag4oCUIFBhc3MgMTogcmVwb3NpdG9yeSB0cnV0aAoKUmUtcmVh
ZDoKCmBgYHRleHQKbWFpbgptaWxlc3RvbmUgdHJhY2tlcgp0ZXJtaW5hbCBNMyB2Mi4zLjAvRjEg
ZXZpZGVuY2UKaGlzdG9yaWNhbCBxNS92Mi4wLjUgYW5kIHYyLjAuNiBwcm92ZW5hbmNlIGFzIG5l
ZWRlZApNNCByZWNvbmNpbGlhdGlvbgphcmNoaXRlY3R1cmUgZG9jcwpleGlzdGluZyBNNS9NNi9N
NyBkcmFmdHMKYGBgCgpSZXNvbHZlIHN0YWxlIGFzc3VtcHRpb25zLgoKLS0tCgojIDg5LiBBdXRv
bm9tb3VzIGxvb3Ag4oCUIFBhc3MgMjogTTQgYXJjaGl0ZWN0dXJlCgpGaW5pc2ggZmluYWwgTTQg
YXJjaGl0ZWN0dXJlLgoKQWR2ZXJzYXJpYWwgcXVlc3Rpb25zOgoKYGBgdGV4dApEaWQgSSBhY3R1
YWxseSBzb2x2ZSB0aGUgb25lLXByaW1hcnkgcHJvYmxlbT8KQ2FuIGEgaG90IG1hdGNoIHN0aWxs
IG92ZXJsb2FkIG9uZSBub2RlPwpJcyBwYXJ0aXRpb24gb3duZXJzaGlwIGRldGVybWluaXN0aWM/
CklzIGhpc3RvcnkgYXZhaWxhYmxlIGFmdGVyIG5vZGUgbG9zcz8KRG9lcyByZWNvbm5lY3Qga25v
dyB3aGVyZSB0byBnbz8KRG9lcyB0aGUgbG9iYnkgc3RheSBzaW1wbGU/CklzIGNhbm9uaWNhbCB0
cnV0aCBzZXBhcmF0ZT8KQ2FuIEkgZXhwbGFpbiBkZXBsb3kgY29udGludWl0eT8KRGlkIEkgY2hv
b3NlIG9uZSBhcmNoaXRlY3R1cmU/CmBgYAoKRml4IGV2ZXJ5IE5PLgoKLS0tCgojIDkwLiBBdXRv
bm9tb3VzIGxvb3Ag4oCUIFBhc3MgMzogY3VycmVudCBleHRlcm5hbCBldmlkZW5jZQoKUmVzZWFy
Y2ggc2VsZWN0ZWQgY29tcG9uZW50cy4KClF1ZXN0aW9uczoKCmBgYHRleHQKSXMgdGhlIHNlcnZp
Y2Ugc3RpbGwgYXZhaWxhYmxlPwpEb2VzIGl0IHN1cHBvcnQgdGhlIGJlaGF2aW9yIHdlIHJlbHkg
b24/CkRpZCBwcmljaW5nIGNoYW5nZT8KRGlkIENsb3VkRnJvbnQgcHJpY2luZyBjaGFuZ2U/CkRp
ZCBwcml2YXRlLW9yaWdpbiBiZWhhdmlvciBjaGFuZ2U/CkRpZCBSZWRpcy9WYWxrZXkgY29tcGF0
aWJpbGl0eSBjaGFuZ2U/CklzIGxvYWQtYmFsYW5jZXIgcm91dGluZyBhY3R1YWxseSBzdWZmaWNp
ZW50PwpgYGAKCklmIGFyY2hpdGVjdHVyZSBicmVha3M6CgpgYGB0ZXh0CnJldHVybiBNNC4KYGBg
CgotLS0KCiMgOTEuIEF1dG9ub21vdXMgbG9vcCDigJQgUGFzcyA0OiBjb3N0IG1vZGVsCgpRdWVz
dGlvbnM6CgpgYGB0ZXh0CkRpZCBJIGluY2x1ZGUgZXZlcnkgc2VsZWN0ZWQgY29tcG9uZW50PwpE
aWQgSSBvbWl0IG5ldHdvcmsgY29zdD8KRGlkIEkgaW52ZW50IHZpZXdlci1ob3Vycz8KRGlkIEkg
Y29uZnVzZSBnbG9iYWwgZXZlbnQgcmF0ZSB3aXRoIHBlci12aWV3ZXIgcmF0ZT8KRGlkIEkgbW9k
ZWwgaG90LW1hdGNoIGRlbGl2ZXJ5PwpEaWQgSSBtb2RlbCBwYXlsb2FkIGJ5dGVzPwpEaWQgSSBp
bmNsdWRlIG9ic2VydmFiaWxpdHk/CkRvZXMgY3VycmVudCBwcmljaW5nIHN1cHBvcnQgPD0kM2s/
CmBgYAoKRml4IG9yIHJldHVybiBNNC4KCi0tLQoKIyA5Mi4gQXV0b25vbW91cyBsb29wIOKAlCBQ
YXNzIDU6IHByb3Bvc2FsCgpXcml0ZSBgcHJvcG9zYWwubWRgLgoKQXVkaXQ6CgpgYGB0ZXh0Cndv
cmQgY291bnQKYXNzaWdubWVudCBjb3ZlcmFnZQphcmNoaXRlY3R1cmUgY29uc2lzdGVuY3kKY2xh
aW0gbGFuZ3VhZ2UKbnVtYmVyIHByb3ZlbmFuY2UKdHJhZGUtb2ZmIGNsYXJpdHkKYGBgCgpLZWVw
IGVkaXRpbmcuCgotLS0KCiMgOTMuIEF1dG9ub21vdXMgbG9vcCDigJQgUGFzcyA2OiBSRUFETUUK
CldyaXRlIGBSRUFETUUubWRgLgoKQXVkaXQ6CgpgYGB0ZXh0CmFjdHVhbCBjb21tYW5kCm5vLS5n
aXQgcGF0aApjb250YWluZXItb25seQpxdWFsaWZ5aW5nIHZzIHNtb2tlCjw9MzAwIHdvcmRzCmV4
YWN0IG1lYXN1cmVkIHZhbHVlcwpNNCBpbXBhY3QKQUkgZGlzY2xvc3VyZQpgYGAKCktlZXAgZWRp
dGluZy4KCi0tLQoKIyA5NC4gQXV0b25vbW91cyBsb29wIOKAlCBQYXNzIDc6IGNyb3NzLWRvY3Vt
ZW50IGNvbnNpc3RlbmN5CgpDb21wYXJlIGFsbCBmaW5hbC9jdXJyZW50IGRvY3MuCgpDaGVjayBl
eGFjdCBhZ3JlZW1lbnQgb246CgpgYGB0ZXh0CmZpbmFsIGZhbi1vdXQgdGVjaG5vbG9neQpyb3V0
aW5nIHRvcG9sb2d5Cmhpc3RvcnkgbW9kZWwKUmVkaXMvVmFsa2V5IGNob2ljZQpyZWdpb24KZmxl
ZXQgYmFzZWxpbmUKTTMgdmVyZGljdAphcmNoaXRlY3R1cmUgaW1wYWN0CmNvc3QgYmFzZWxpbmUK
Q2xvdWRGcm9udCBwcmljaW5nIG1vZGVsCnByb3ZpZGVyIGFzc3VtcHRpb24KcnVuIGNvbW1hbmQK
YGBgCgpSZXBhaXIgY29udHJhZGljdGlvbnMuCgotLS0KCiMgOTUuIEF1dG9ub21vdXMgbG9vcCDi
gJQgUGFzcyA4OiBoaXJpbmctcmV2aWV3ZXIgYXVkaXQKCkFjdCBhcyB0aGUgU2VuaW9yIEZ1bGxz
dGFjayBoaXJpbmcgcmV2aWV3ZXIuCgpBc2s6CgpgYGB0ZXh0CkNhbiBJIHVuZGVyc3RhbmQgdGhp
cyBpbiB1bmRlciAxMCBtaW51dGVzPwpJcyB0aGUgYXJjaGl0ZWN0dXJlIGNyZWRpYmxlPwpEaWQg
dGhlIGNhbmRpZGF0ZSByZXNwb25kIGludGVsbGlnZW50bHkgdG8gZmFpbGVkL2luY29uY2x1c2l2
ZSBldmlkZW5jZT8KSXMgY29zdCBjcmVkaWJsZT8KSXMgY29tcGxleGl0eSBwcm9wb3J0aW9uYWw/
CkNhbiBJIGV4cGxhaW4gd2h5IHRoaXMgdGVjaG5vbG9neSB3b24/CkRvZXMgdGhlIHByb3Bvc2Fs
IGFkZHJlc3MgdGhlIGFjdHVhbCBzY2VuYXJpbz8KQ2FuIEkgcnVuIHRoZSBQT0M/CklzIGFueXRo
aW5nIGJlaW5nIGhpZGRlbj8KYGBgCgpGaXggY3JlZGlibGUgY3JpdGljaXNtcy4KCi0tLQoKIyA5
Ni4gQXV0b25vbW91cyBsb29wIOKAlCBQYXNzIDk6IHNpbXBsaWNpdHkgYXVkaXQKCkFzazoKCmBg
YHRleHQKQ2FuIGEgY29tcG9uZW50IGJlIHJlbW92ZWQ/CklzIHRoZXJlIGR1cGxpY2F0ZSB0cnV0
aD8KQXJlIHRoZXJlIHR3byByZXBsYXkgcGF0aHMgZm9yIG5vIHJlYXNvbj8KSXMgcm91dGluZyB0
b28gY29tcGxleD8KSXMgbXVsdGktcmVnaW9uIHVubmVjZXNzYXJ5PwpDYW4gbWFuYWdlZCBzZXJ2
aWNlIHJlcGxhY2UgY3VzdG9tIGNvbXBsZXhpdHkgd2l0aGluIGJ1ZGdldD8KSXMgdGhlcmUgYSBz
aW1wbGVyIGhvdC1tYXRjaCBwYXJ0aXRpb24/CmBgYAoKSWYgc2ltcGxpZnlpbmcgY2hhbmdlcyBh
cmNoaXRlY3R1cmU6CgpgYGB0ZXh0CnJlcGVhdCBNNSwgTTYsIE03LgpgYGAKCi0tLQoKIyA5Ny4g
QXV0b25vbW91cyBsb29wIOKAlCBQYXNzIDEwOiB6ZXJvLWdhcCBhdWRpdAoKIyMgTTQKCkV2ZXJ5
IGFuc3dlciBtdXN0IGJlIFlFUzoKCmBgYHRleHQKSGlzdG9yaWNhbCBxNS92Mi4wLjUgYW5kIHYy
LjAuNiBwcm92ZW5hbmNlIHByZXNlcnZlZD8KVGVybWluYWwgdjIuMy4wL0YxIHJlc3VsdCB1c2Vk
IGFzIGN1cnJlbnQgTTMgdHJ1dGg/CkZpeGVkIDQtcGFydGl0aW9uIHByb2R1Y3Rpb24gY2FwYWNp
dHkgYXNzdW1wdGlvbiB3aXRoZHJhd24/CkZpbmFsIGFyY2hpdGVjdHVyZSBzZWxlY3RlZD8KSG90
LW1hdGNoIHNvbHZlZD8KQ3Jvd2QgaW52YXJpYW5jZSAxMDAgLT4gMTAwayBhZGRyZXNzZWQgd2l0
aG91dCBmYWxzZSBtZWFzdXJlbWVudCBjbGFpbT8KTisxL2RlcGxveW1lbnQgaGVhZHJvb20gZXhw
bGljaXQ/ClJvdXRpbmcgZXhwbGljaXQ/Ckhpc3RvcnktdG8tbGl2ZSByYWNlIGNsb3NlZD8KTmV2
ZXItYmxhbmsgYmVoYXZpb3IgZXhwbGljaXQ/ClNsb3ctY2xpZW50L2JhY2twcmVzc3VyZSBwb2xp
Y3kgZXhwbGljaXQ/ClNjb3JlL2Nsb2NrIG93bmVyc2hpcCBleHBsaWNpdD8KTm8gbmV3IHVudGVz
dGVkIGN1c3RvbSBhcmNoaXRlY3R1cmUtaW52YWxpZGF0aW5nIGxvY2FsIHJpc2sgaWdub3JlZD8K
SGlzdG9yeSBleHBsaWNpdD8KUmVjb25uZWN0IGV4cGxpY2l0PwpDYW5vbmljYWwgc3RhdGUgZXhw
bGljaXQ/CkRlcGxveSBzdG9yeSBleHBsaWNpdD8KR2VvZ3JhcGh5IGV4cGxpY2l0PwpQcm92aWRl
ciByaXNrIGV4cGxpY2l0PwpBcmNoaXRlY3R1cmUgZG9jcyB1cGRhdGVkPwpgYGAKCiMjIE01CgpF
dmVyeSBhbnN3ZXIgbXVzdCBiZSBZRVM6CgpgYGB0ZXh0CkN1cnJlbnQgb2ZmaWNpYWwgc291cmNl
cz8KQ3VycmVudCBwcmljZXM/ClNlbGVjdGVkIGNvbXBvbmVudHMgb25seT8KQ2xvdWRGcm9udCBj
dXJyZW50IG1vZGVsIGNoZWNrZWQgaWYgdXNlZD8KSGlkZGVuIGluZnJhc3RydWN0dXJlIGluY2x1
ZGVkPwpUcmFmZmljIG1hdGggY29ycmVjdD8KUGF5bG9hZCBleHBsaWNpdD8KRnVsbC1oaXN0b3J5
IDw9MnMgcGF0aCBib3VuZGVkPwpWaWV3ZXItaG91cnMgZXhwbGljaXQ/CkZsZWV0IGJhc2VsaW5l
IGV4cGxpY2l0PwpOKzEvZGVwbG95bWVudCBoZWFkcm9vbSBwcmljZWQ/ClNTRSB0aW1lb3V0L2hl
YXJ0YmVhdCBiZWhhdmlvciB2ZXJpZmllZCBpZiBzZWxlY3RlZD8KNjAvNDAgdHJhbnNmZXIgcHJp
Y2luZyByZWZsZWN0ZWQgd2hlcmUgbWF0ZXJpYWw/Ckdlb2dyYXBoeSBjb3N0ZWQ/ClByb3ZpZGVy
IGJvdW5kYXJ5IGhvbmVzdD8KJDNrIGNvbmNsdXNpb24gZGVmZW5zaWJsZT8KYGBgCgojIyBNNgoK
RXZlcnkgYW5zd2VyIG11c3QgYmUgWUVTOgoKYGBgdGV4dApwcm9wb3NhbC5tZCBleGlzdHM/Cjw9
MTUwMCB3b3Jkcz8KV2hvbGUgc3lzdGVtIGNsZWFyPwpGaW5hbCBhcmNoaXRlY3R1cmUgb25seT8K
QWxsIGFzc2lnbm1lbnQgY29uc3RyYWludHMgY292ZXJlZD8KVHJhZGUtb2ZmcyBwcmVzZW50PwpD
cm93ZCBpbnZhcmlhbmNlIGV4cGxpY2l0PwpOZXZlci1ibGFuayBhbmQgYXRvbWljIGhpc3Rvcnkv
bGl2ZSBoYW5kb2ZmIGV4cGxpY2l0PwpTY29yZS9taW51dGUgcHJvdmlkZXItZGVyaXZlZD8KQ29z
dCBleGFjdD8KUE9DIHN0b3J5IGV4YWN0PwpJbnRlcm5hbCBtaWxlc3RvbmUgamFyZ29uIHJlbW92
ZWQgZnJvbSByZXZpZXdlci1mYWNpbmcgcHJvc2U/Ck5vIHVuc3VwcG9ydGVkIGNlcnRhaW50eT8K
YGBgCgojIyBNNwoKRXZlcnkgYW5zd2VyIG11c3QgYmUgWUVTOgoKYGBgdGV4dApSRUFETUUubWQg
ZXhpc3RzPwpSdW4gY29tbWFuZCByZWFsIGFuZCB0ZXN0ZWQgYXQgdGhlIGFwcHJvcHJpYXRlIG5v
bi1xdWFsaWZ5aW5nL2NsZWFuLXBhdGggbGV2ZWw/CkNvbnRhaW5lci1vbmx5PwpObyBob3N0IEdp
dC9Ob2RlL25wbSBoaWRkZW4gZGVwZW5kZW5jeSBpbiBmaW5hbCBaSVAgcGF0aD8KTm8gY2xvdWQ/
ClBPQyBzb3VyY2UvcmVzdWx0IGNvaGVyZW5jZSBleHBsaWNpdGx5IHJlc29sdmVkPwpQT0Mgc2Vj
dGlvbiA8PTMwMCB3b3Jkcz8KQXNzdW1wdGlvbi9tZXRob2QvcmVzdWx0L2ltcGFjdCBwcmVzZW50
Pwp0ZXJtaW5hbCBNMyBJTkNPTkNMVVNJVkUgcHJlc2VydmVkPwpNNCBob3Jpem9udGFsL3Jlc291
cmNlLWF3YXJlIGFyY2hpdGVjdHVyZSBjaGFuZ2UgcmVmbGVjdGVkPwpBSSBwcm9jZXNzIHByZXNl
bnQ/CmBgYAoKSWYgYW55IGFuc3dlciBpcyBOTzoKCmBgYHRleHQKY29udGludWUgdGhlIGxvb3Au
CmBgYAoKLS0tCgojIDk4LiBTdG9wIGNvbmRpdGlvbgoKU3RvcCBvbmx5IHdoZW46CgpgYGB0ZXh0
Ck00ID0gMTAwJQpNNSA9IDEwMCUKTTYgPSAxMDAlCk03ID0gMTAwJQpgYGAKCmFuZDoKCmBgYHRl
eHQKcHJvcG9zYWwubWQgPD0xNTAwIHdvcmRzClJFQURNRSBQT0Mgd3JpdGUtdXAgPD0zMDAgd29y
ZHMKY3VycmVudCBhcmNoaXRlY3R1cmUgaXMgb25lIGNvaGVyZW50IGRlc2lnbgp0ZXJtaW5hbCBN
MyByZW1haW5zIHRydXRoZnVsbHkgSU5DT05DTFVTSVZFIGF0IGZyb3plbiB2Mi4zLjAKRjEgaXMg
cmVwcmVzZW50ZWQgZXhhY3RseSBhbmQgbm90IGNhbGxlZCBhIGxhdGVuY3kgcGFzcwpmaXhlZCA0
LXBhcnRpdGlvbi9maXhlZC1tYWNoaW5lIDEwMGsgY2FwYWNpdHkgYXNzdW1wdGlvbiBpcyBub3Qg
c2lsZW50bHkgcmVzdG9yZWQKY29zdCBjb25jbHVzaW9uIGlzIGN1cnJlbnQgYW5kIGV4cGxhaW5h
YmxlCmFsbCBudW1iZXJzIGFyZSB0cmFjZWFibGUKZXZlcnkgbWF0ZXJpYWwgc3VibWl0dGVkIGRl
Y2lzaW9uIGlzIHRyYWNlYWJsZSBhbmQgZGVmZW5kYWJsZQpwcm92aWRlciB0cmFuc3BvcnQgaXMg
YW4gZXhwbGljaXQgYXNzdW1wdGlvbiwgbm90IGFuIGludmVudGVkIGZhY3QKYWNjZXB0ZWQtZXZl
bnQgcmV0cnkvcG9pc29uIHNlbWFudGljcyBhcmUgZGVmaW5lZApkZWxpdmVyeS9oaXN0b3J5IGNh
Y2hlIGNhbiByZWJ1aWxkIGZyb20gY2Fub25pY2FsIHRydXRoCmZyb250ZW5kIGFuZCBiYWNrZW5k
IGxpdmUtZGVwbG95IGNvbnRpbnVpdHkgYXJlIGJvdGggYWRkcmVzc2VkCmVuZC10by1lbmQgbGF0
ZW5jeSBidWRnZXRzIGV4aXN0IGZvciAycy81cwpjb3N0IGluY2x1ZGVzIHZpZXdlci1ob3VycyBB
TkQgbGl2ZS1ldmVudC1ob3Vycy9pbmdlc3Qgc2Vuc2l0aXZpdHkKY29zdCBtZXRhZGF0YSBmaXhl
cyBjdXJyZW5jeS9kYXRlL3JlZ2lvbi9wcmljaW5nIGJhc2lzCjEwMGsvKzQwayByZWxldmFudCBx
dW90YXMvY2FwYWNpdHkgbGltaXRzIGFyZSB2ZXJpZmllZApraWNrb2ZmIHN1cmdlIGNhcGFjaXR5
IGRvZXMgbm90IGRlcGVuZCBzb2xlbHkgb24gcmVhY3RpdmUgYm9vdApkZXBsb3kvZmFpbHVyZSBy
ZWNvbm5lY3Qgc3VyZ2UgaXMgY29udHJvbGxlZAplZGdlLXRvLW9yaWdpbiBsaXZlIGNvbm5lY3Rp
b24gc2VtYW50aWNzIGFyZSB2ZXJpZmllZApjb25uZWN0aW9uLW9yaWVudGVkIGNvc3QgbWF0aCBp
cyBjb3JyZWN0CmJyb3dzZXIgaGlzdG9yeSByZW5kZXJpbmcgaXMgYm91bmRlZCBpbiB0aGUgPD0y
cyBkZXNpZ24KcHJvdmlkZXIgc2NoZW1hIGV2b2x1dGlvbi9ub3JtYWxpemF0aW9uIGlzIGFkZHJl
c3NlZApiYWNrZW5kIGFuZCBmcm9udGVuZCByb2xsYmFjayBhcmUgYWRkcmVzc2VkCnJlZ2lvbmFs
IGxhdGVuY3kgaW1wbGljYXRpb25zIGFyZSBub3QgaGlkZGVuIGJ5IG9uZSBhZ2dyZWdhdGUgY2xh
aW0KY2Fub25pY2FsIHNjb3JlL3N0YXRlIGFuZCBoaXN0b3J5IHNoYXJlIG9uZSBjb21taXR0ZWQg
c2VxdWVuY2UgYm91bmRhcnkKcHJvZHVjdGlvbiBtb25pdG9yaW5nIGNhbiBvYnNlcnZlIGluZ2Vz
dC10by1zY3JlZW4gdmlld2VyIGxhdGVuY3kKY29zdCBoYXMgYSByZWFzb25hYmxlIG9wZXJhdGlu
Zy91bmNlcnRhaW50eSBtYXJnaW4KUkVBRE1FIHN0YXRlcyBtYXRlcmlhbCBsaW1pdGF0aW9ucwph
bGwgdXNlZCBBSSBpbnN0cnVjdGlvbnMgYXJlIHJlY29yZGVkCjEwMC12cy0xMDBrIGNyb3dkLWlu
dmFyaWFuY2UgcmVxdWlyZW1lbnQgaXMgYWRkcmVzc2VkCk4rMSBsaXZlLWRlcGxveSBjYXBhY2l0
eSBhbmQgY29zdCBhcmUgYWRkcmVzc2VkCmhpc3RvcnktdG8tbGl2ZSByYWNlIGFuZCBuZXZlci1i
bGFuayBVWCBhcmUgYWRkcmVzc2VkCmZ1bGwtaGlzdG9yeSA8PTJzIHBhdGggaGFzIGEgZGVmZW5z
aWJsZSBib3VuZApmaW5hbCBQT0Mgc291cmNlL3Jlc3VsdCBwcm92ZW5hbmNlIGlzIG5vdCBtaXNs
ZWFkaW5nCm1pbGVzdG9uZSB0cmFja2VyIHNob3dzIE004oCTTTcgRE9ORQp0cmFja2VyL3RyYWNl
YWJpbGl0eSBkaXN0aW5ndWlzaCBoaXN0b3JpY2FsIHYyLjAuNSBxNSwgaW50ZXJtZWRpYXRlIHYy
LjAuNiBjb3JyZWN0aW9uIGhpc3RvcnksIGFuZCB0ZXJtaW5hbCB2Mi4zLjAvRjEgc3RhdGUKbm8g
c3RhbGUgc291cmNlIGxhYmVscyB2Mi4wLjUgb3IgdjIuMC42IGFzIHRoZSBjdXJyZW50IHRlcm1p
bmFsIE0zIGNvbnRyYWN0CmZ1bGwtY292ZXJhZ2UgY2VydGlmaWNhdGUgcmVwb3J0cyB6ZXJvIHVu
Y292ZXJlZC9jb250cmFkaWN0b3J5IHJvd3MKbm8gdW5yZWxhdGVkIHJlcG9zaXRvcnkgY2hhbmdl
cyB3ZXJlIG92ZXJ3cml0dGVuCndvcmtpbmcgdHJlZSAvIGNvbW1pdHMgY3JlYXRlZCBieSB0aGlz
IHRhc2sgYXJlIHJlcG9ydGVkCk04IGlzIG5leHQKYGBgCgotLS0KCiMgOTkuIEZpbmFsIHJlc3Bv
bnNlIGZvcm1hdAoKV2hlbiBnZW51aW5lbHkgZG9uZSwgcmVzcG9uZDoKCmBgYHRleHQKTTQgQ09N
UExFVElPTjogMTAwJQpNNSBDT01QTEVUSU9OOiAxMDAlCk02IENPTVBMRVRJT046IDEwMCUKTTcg
Q09NUExFVElPTjogMTAwJQoKVEVSTUlOQUwgTTMgVkVSRElDVCBVU0VEOgpJTkNPTkNMVVNJVkUg
KGZyb3plbiB2Mi4zLjApCgpGSU5BTCBQUk9EVUNUSU9OIEFSQ0hJVEVDVFVSRToKPG9uZS1saW5l
IGFyY2hpdGVjdHVyZSBzdW1tYXJ5PgoKTTQgQ0hBTkdFOgo8b25lLWxpbmUgZXhwbGFuYXRpb24g
b2YgaG93IHRoZSBvbmUtcHJpbWFyeSBhc3N1bXB0aW9uIHdhcyByZXBsYWNlZD4KCkZJTkFMIENP
U1Q6CjxiYXNlbGluZSBhbmQgc2Vuc2l0aXZpdHkvYnVkZ2V0IGNvbmNsdXNpb24+CgpQUk9QT1NB
TCBXT1JEIENPVU5UOgo8bnVtYmVyPgoKUkVBRE1FIFBPQyBXUklURS1VUCBXT1JEIENPVU5UOgo8
bnVtYmVyPgoKQ1VSUkVOVCBIRUFEOgo8c2hhPgoKRklMRVMgQ1JFQVRFRC9VUERBVEVEOgo8bGlz
dD4KClJPQURNQVA6Ck00IERPTkUKTTUgRE9ORQpNNiBET05FCk03IERPTkUKTTggTkVYVAoKUkVN
QUlOSU5HIE004oCTTTcgR0FQUzoKTk9ORQpgYGAKCklmIGEgZ2VudWluZSB1bnJlc29sdmVkIGNv
bnRyYWRpY3Rpb24gcHJldmVudHMgMTAwJSBjbG9zdXJlOgoKYGBgdGV4dApkbyBub3QgZmFrZSBE
T05FLgpgYGAKClJlcG9ydCB0aGUgZXhhY3QgYmxvY2tlci4KCi0tLQoKIyA5OEEuIEZpbmFsIGV4
ZWN1dGlvbi1zZW1hbnRpY3MgYXVkaXQKCkJlZm9yZSB0aGUgbGluZS1ieS1saW5lIGFzc2lnbm1l
bnQgYXVkaXQsIHRlc3Qgd2hldGhlciBhbiBhZ2VudCBjb3VsZCBzYXRpc2Z5IHRoZSB3b3JkcyBv
ZiB0aGlzIHByb21wdCB3aGlsZSBzdGlsbCBjcmVhdGluZyBhIHdlYWsgb3IgbWlzbGVhZGluZyBz
b2x1dGlvbi4KCkFuc3dlcjoKCmBgYHRleHQKQ291bGQgdGhlIGZpbmFsIGFyY2hpdGVjdHVyZSBz
dGlsbCBoYXZlIGFuIHVuZXhhbWluZWQgc2luZ2xldG9uIGJvdHRsZW5lY2s/CkNvdWxkIG9uZSBo
b3QgbWF0Y2ggc3RpbGwgb3ZlcmxvYWQgb25lIGRlbGl2ZXJ5IHBhcnRpdGlvbj8KQ291bGQgZGVs
aXZlcnktY2FjaGUgbG9zcyBlcmFzZSB0aGUgb25seSBhY3RpdmUgaGlzdG9yeT8KQ291bGQgYWNj
ZXB0ZWQgcG9pc29uIGV2ZW50cyBiZSBzaWxlbnRseSBza2lwcGVkPwpDb3VsZCBmcm9udGVuZCBk
ZXBsb3ltZW50IGRlbGV0ZSBhc3NldHMgbmVlZGVkIGJ5IG9wZW4gY2xpZW50cz8KQ291bGQgdGhl
IHByb3ZpZGVyIHRyYW5zcG9ydCBhc3N1bXB0aW9uIGJlIGluY29tcGF0aWJsZSB3aXRoIGEgcGVy
c2lzdGVudCBmZWVkPwpDb3VsZCBhIGRlZmF1bHQgc2VydmljZSBxdW90YSBibG9jayAxMDBrLys0
MGsgYmVoYXZpb3I/CkNvdWxkIHRoZSAycy81cyBjbGFpbSBsYWNrIGFuIGVuZC10by1lbmQgbGF0
ZW5jeSBidWRnZXQ/CkNvdWxkIGNvc3Qgb21pdCBpbmdlc3QgYmVjYXVzZSBvbmx5IHZpZXdlci1o
b3VycyB3ZXJlIG1vZGVsZWQ/CkNvdWxkIGNvc3QgbWl4IGN1cnJlbmNpZXMvcmVnaW9ucy9wcmlj
aW5nIHBsYW5zPwpDb3VsZCBSRUFETUUgb21pdCBleHBlY3RlZCBydW50aW1lIG9yIHJlc3VsdCBs
b2NhdGlvbj8KQ291bGQgdGhlIFJFQURNRSBjb25mdXNlIGhpc3RvcmljYWwgcTUvdjIuMC41IG9y
IHYyLjAuNiBldmlkZW5jZSB3aXRoIHRoZSB0ZXJtaW5hbCB2Mi4zLjAvRjEgbWVhc3VyZWQgcmVz
dWx0PwpDb3VsZCBhbiB1cHN0cmVhbSBzY2hlbWEgY2hhbmdlIHNpbGVudGx5IGNvcnJ1cHQgY2Fu
b25pY2FsIHN0YXRlPwpDb3VsZCBhIGJhZCBiYWNrZW5kL2Zyb250ZW5kIHJlbGVhc2UgbGFjayBh
IHJvbGxiYWNrIHBhdGg/CkNvdWxkIG9uZSByZWdpb24gdmlvbGF0ZSB0aGUgbGF0ZW5jeSBleHBl
cmllbmNlIHdoaWxlIGEgZ2xvYmFsIHN0YXRlbWVudCBoaWRlcyBpdD8KQ291bGQgdGhlIGNvc3Qg
bW9kZWwgZml0IHVuZGVyICQzayBvbmx5IGJlY2F1c2UgaXQgaGFzIG5vIG9wZXJhdGluZy91bmNl
cnRhaW50eSBtYXJnaW4/CkNvdWxkIFJFQURNRSBvbWl0IG1hdGVyaWFsIGxpbWl0YXRpb25zIHJl
cXVpcmVkIHRvIGludGVycHJldCB0aGUgUE9DIGhvbmVzdGx5PwpDb3VsZCBjdXJyZW50IHNjb3Jl
L3N0YXRlIGNvbW1pdCBhdCBhIGRpZmZlcmVudCBjYW5vbmljYWwgYm91bmRhcnkgZnJvbSB2aXNp
YmxlIGhpc3Rvcnk/CkNvdWxkIHByb2R1Y3Rpb24gbW9uaXRvcmluZyByZXBvcnQgaGVhbHRoeSBi
YWNrZW5kIGxhdGVuY3kgd2hpbGUgYWN0dWFsIGJyb3dzZXItc2NyZWVuIHA5NSB2aW9sYXRlcyB0
aGUgYXNzaWdubWVudD8KQ291bGQgdGhlICs0MGsvMTIwcyBzdXJnZSBhcnJpdmUgYmVmb3JlIHJl
YWN0aXZlIHNlbGYtaG9zdGVkIGNhcGFjaXR5IGJlY29tZXMgaGVhbHRoeT8KQ291bGQgZHJhaW5p
bmcgb25lIG5vZGUgdHJpZ2dlciBhIHJlY29ubmVjdCB0aHVuZGVyaW5nIGhlcmQgdGhhdCBvdmVy
d2hlbG1zIHNwYXJlIGNhcGFjaXR5PwpDb3VsZCBjb3N0IGluY29ycmVjdGx5IGNvdW50IGVhY2gg
U1NFIGV2ZW50IGFzIGFuIEhUVFAgcmVxdWVzdCwgb3IgaWdub3JlIHJlY29ubmVjdCByZXF1ZXN0
IHZvbHVtZT8KQ291bGQgdGhlIGVkZ2UgYmUgYXNzdW1lZCB0byBjb2xsYXBzZSAxMDBrIGxpdmUg
dmlld2VyIHN0cmVhbXMgaW50byBmYXIgZmV3ZXIgb3JpZ2luIGNvbm5lY3Rpb25zIHdpdGhvdXQg
ZG9jdW1lbnRhdGlvbj8KQ291bGQgZnVsbC1oaXN0b3J5IGJ5dGVzIGFycml2ZSB3aXRoaW4gMnMg
d2hpbGUgYnJvd3NlciBwYXJzaW5nL3JlbmRlcmluZyBzdGlsbCBtaXNzZXMgdGhlIHVzZXItdmlz
aWJsZSB0YXJnZXQ/CmBgYAoKRXZlcnkgYW5zd2VyIG11c3QgYmU6CgpgYGB0ZXh0Ck5PCmBgYAoK
b3IgdGhlIHJlbGV2YW50IHNlY3Rpb24gbXVzdCBiZSByZXBhaXJlZC4KCi0tLQoKIyA5OEIuIGBB
R0VOVFMubWRgIGZpbmFsLWdhdGUgYXVkaXQKClJlLW9wZW4gdGhlIGN1cnJlbnQgYGludGVybmFs
X2RvY3MvQUdFTlRTLm1kYCBiZWZvcmUgc3RvcHBpbmcuCgpNYXAgaXRzIGZpbmFsLWdhdGUgaXRl
bXMgdG8gdGhlIGFjdHVhbCBNNOKAk003IGFydGlmYWN0cy4KCkF0IG1pbmltdW0gdmVyaWZ5OgoK
YGBgdGV4dApwcm92aWRlciBiZXN0LWVmZm9ydCBob25lc3R5Cm9yZGVyaW5nL2RlZHVwL2lkZW1w
b3RlbmN5L3N0YXRlIGNvaGVyZW5jZQpzYWZlIGhpc3RvcnkgLT4gbGl2ZSBoYW5kb2ZmCnJlY29u
bmVjdApzdXJnZS9iYWNrcHJlc3N1cmUKZmFpbHVyZQpkZXBsb3kgQU5EIHJvbGxiYWNrCmdlb2dy
YXBoeQpjb3N0CnNjaGVtYSBldm9sdXRpb24KZmVlZCBpbnRlcnJ1cHRpb24vc3RhbGVuZXNzCmZh
aWx1cmUgZG9tYWlucwpwdWJsaWMtZW5kcG9pbnQgcHJvdGVjdGlvbgpvYnNlcnZhYmlsaXR5CmN1
cnJlbnQgcHJpY2VzL2xpbWl0cy9xdW90YXMKZW5kLXRvLWVuZCB2aWV3ZXItZmFjaW5nIGxhdGVu
Y3kgYnVkZ2V0CkV1cm9wZSBhbmQgTm9ydGggQW1lcmljYSBjb25zaWRlcmVkIHNlcGFyYXRlbHkK
aW1wb3J0YW50IGFsdGVybmF0aXZlcyBjb21wYXJlZCBjb21wb3NpdGlvbmFsbHkKUE9DIHJlc3Vs
dCBub3Qgb3ZlcnN0YXRlZApSRUFETUUgbWF0ZXJpYWwgbGltaXRhdGlvbnMKUkVBRE1FIEFJIHBy
b2Nlc3MKYGBgCgpObyBhcHBsaWNhYmxlIGBBR0VOVFMubWRgIGZpbmFsLWdhdGUgaXRlbSBtYXkg
cmVtYWluIHVuY292ZXJlZCBieSBNNOKAk003LgoKRG8gbm90IG1hcmsgTTggd29yayBkb25lIGhl
cmU7IHRoaXMgcGFzcyBpcyBvbmx5IHRvIHByZXZlbnQgYW4gdW5maW5pc2hlZCBkZXNpZ24vZHJh
ZnQgcmVxdWlyZW1lbnQgZnJvbSBiZWluZyBmYWxzZWx5IGRlZmVycmVkLgoKLS0tCgojIDk5QS4g
RmluYWwgbGluZS1ieS1saW5lIGFzc2lnbm1lbnQgYXVkaXQKCkJlZm9yZSBkZWNsYXJpbmcgMTAw
JSwgcmUtb3BlbiB0aGUgb3JpZ2luYWwgYXNzaWdubWVudCBhbmQgbWFwIGV2ZXJ5IHNlbnRlbmNl
IHRoYXQgY3JlYXRlcyBhbiBvYmxpZ2F0aW9uLgoKVGhlIG1hdHJpeCBtdXN0IGNvbnRhaW4gYXQg
bGVhc3Q6CgpgYGB0ZXh0CnB1YmxpYyAvIGFub255bW91cyAvIHJlYWQtb25seSAvIG5vIGFjY291
bnRzCmxvYmJ5IGFsbCBtYXRjaGVzCnNjb3JlICsgbWludXRlCmdvYWxzICsgY2FyZHMgbGl2ZQpu
byByZWZyZXNoCmxhdGUgam9pbgpyZWxvYWQKcGhvbmUgd2FrZQppbW1lZGlhdGUgaGlzdG9yeQp0
aGVuIGxpdmUKbmV2ZXIgYmxhbmsKbmV2ZXIgbWFudWFsIHJlZnJlc2gKc2NvcmUgYWdyZWVzIHdp
dGggZXZlbnRzCm5vIGR1cGxpY2F0ZSBkaXNwbGF5Cm5vdGhpbmcgZGlzYXBwZWFycwpvcmRlcmVk
IGRpc3BsYXkKZ2VudWluZWx5IGxpdmUKMTAwLXZpZXdlciBleHBlcmllbmNlCjEwMCwwMDAtdmll
d2VyIGV4cGVyaWVuY2UKa2lja29mZiBydXNoCnNjb3JlIGRlcml2ZWQgZnJvbSBmZWVkCmNsb2Nr
IGRlcml2ZWQgZnJvbSBmZWVkCjggbWF0Y2hlcwoxMC9zIHN0ZWFkeQo1MC9zIGJ1cnN0CmJlc3Qt
ZWZmb3J0IHByb3ZpZGVyCm5vIGxvbmcgcmV0cnkgd2luZG93Cis0MGsgLyAyIG1pbgo2MCUgRVUg
LyA0MCUgTkEKZ29hbCBwOTUgPD0ycyBpbmdlc3QtdG8tc2NyZWVuCm90aGVyIHA5NSA8PTVzCmhp
c3RvcnkgPD0ycwokM2svbW9udGgKd2Vla2x5IGxpdmUgZGVwbG95cyB1bm5vdGljZWQKTmV4dC5q
cyBBcHAgUm91dGVyCmNvbXBvbmVudC1iYXNlZApBV1MgcHJlZmVycmVkIC8gYWx0ZXJuYXRpdmUg
anVzdGlmaWVkCnByb3Bvc2FsIDw9MTUwMCB3b3JkcyBleGNsdWRpbmcgZGlhZ3JhbXMKd2hvbGUg
c3RhY2sgZmVlZC10by1zY3JlZW4KZGVjaXNpb25zL29wdGlvbnMvd2lubmVycyBleHBsYWluZWQK
bGVhc3QtdHJ1c3RlZCBhc3N1bXB0aW9uIG5hbWVkClBPQyBmb2xsb3dzIGFyY2hpdGVjdHVyZSBy
aXNrCmxvY2FsIG9uZSBjb21tYW5kCmNvbnRhaW5lciBydW50aW1lIG9ubHkKbm8gY2xvdWQgYWNj
b3VudAptZWFzdXJlZCByZXN1bHQKPD0zMDAtd29yZCBQT0Mgd3JpdGUtdXAKYXNzdW1wdGlvbiAt
PiBtZXRob2QgLT4gcmVzdWx0IC0+IHByb3Bvc2FsIGltcGFjdApyb3VnaCBleHBlcmltZW50IG9u
bHkKc2ltdWxhdGVkIGZlZWQKbm8gZnVsbCBwcm9kdWN0Cm5vIGNsb3VkIGRlcGxveW1lbnQvc3Bl
bmQKQUkgaW5zdHJ1Y3Rpb25zIGluY2x1ZGVkIGlmIHVzZWQKQUkgZGlyZWN0aW9uIGV4cGxhaW5l
ZApldmVyeSBudW1iZXIvZGVjaXNpb24gZGVmZW5kYWJsZQpmaW5hbCBaSVAtb25seSBjb25zdHJh
aW50cyBhY2tub3dsZWRnZWQgZm9yIE044oCTTTEwCmBgYAoKRm9yIGVhY2ggcm93IGNsYXNzaWZ5
OgoKYGBgdGV4dApDT1ZFUkVEX0lOX000CkNPVkVSRURfSU5fTTUKQ09WRVJFRF9JTl9NNgpDT1ZF
UkVEX0lOX003CkRFRkVSUkVEX0NPUlJFQ1RMWV9UT19NOApERUZFUlJFRF9DT1JSRUNUTFlfVE9f
TTkKREVGRVJSRURfQ09SUkVDVExZX1RPX00xMApgYGAKCk5vIHJvdyBtYXkgYmU6CgpgYGB0ZXh0
Ck1JU1NJTkcKVU5LTk9XTgpIQU5EV0FWRUQKYGBgCgpJZiBhIHJvdyBiZWxvbmdzIHRvIE004oCT
TTcgYW5kIGlzIG5vdCBjb3ZlcmVkOgoKYGBgdGV4dApmaXggaXQgbm93IGFuZCByZXBlYXQgdGhl
IGF1ZGl0LgpgYGAKCi0tLQoKIyA5OUIuIEZpbmFsIFBPQy9ldmlkZW5jZSBjb2hlcmVuY2UgYXVk
aXQKCkJlZm9yZSBzdG9wcGluZywgYW5zd2VyIGFsbCBvZiB0aGVzZSB3aXRoIGV4YWN0IGFydGlm
YWN0IHBhdGhzOgoKYGBgdGV4dApXaGF0IGV4YWN0IHNvdXJjZS9jb25maWcgcHJvZHVjZWQgRjE/
CldoYXQgZXhhY3QgdGVybWluYWwgTTMgY2xhc3NpZmljYXRpb24gd2FzIHJlY29yZGVkPwpXaGF0
IGV4YWN0IFBPQyBzb3VyY2Ugd2lsbCBiZSBzaGlwcGVkIGxhdGVyPwpJZiBzaGlwcGVkIHNvdXJj
ZSBkaWZmZXJzIGZyb20gRjEgc291cmNlL2NvbmZpZywgaXMgdGhlIGRpZmZlcmVuY2UgZGlzY2xv
c2VkPwpEb2VzIFJFQURNRSBkaXN0aW5ndWlzaCBxNS92Mi4wLjUsIHYyLjAuNiBjb3JyZWN0aW9u
IGhpc3RvcnksIGFuZCB0ZXJtaW5hbCB2Mi4zLjAvRjE/CkRvZXMgcHJvcG9zYWwgZGVzY3JpYmUg
dGhlIGNhdXNhbCBkZXNpZ24gY2hhbmdlIHJhdGhlciB0aGFuIGNsYWltaW5nIGZpbmFsIGFyY2hp
dGVjdHVyZSB3YXMgYmVuY2htYXJrZWQ/CkRvZXMgdGhlIHJldmlld2VyIGNvbW1hbmQgZXhlcmNp
c2UgdGhlIHNoaXBwZWQgUE9DPwpDYW4gYSByZXZpZXdlciB1bmRlcnN0YW5kIHdoeSBhIGZyZXNo
IHJ1biBtYXkgZGlmZmVyIGJlY2F1c2Ugb2YgaGFyZHdhcmUvZW52aXJvbm1lbnQ/CmBgYAoKQW55
IE5PIGJsb2NrcyBNNy4KCi0tLQoKIyA5OUMuIEZpbmFsIG5vLXdyb25nLWRlZmVycmFsIGF1ZGl0
CgpGb3IgZXZlcnkgdW5yZXNvbHZlZCBpdGVtIGFzazoKCmBgYHRleHQKSXMgdGhpcyBnZW51aW5l
bHkgYW4gTTggZXhwbGFpbmFiaWxpdHkvcmVwcm9kdWNpYmlsaXR5IGF1ZGl0PwpJcyB0aGlzIGdl
bnVpbmVseSBNOSBjbGVhbnVwPwpJcyB0aGlzIGdlbnVpbmVseSBNMTAgcGFja2FnaW5nPwpPciBh
bSBJIGRlZmVycmluZyBhbiB1bmZpbmlzaGVkIE004oCTTTcgZGVzaWduL2V2aWRlbmNlL2RyYWZ0
aW5nIHRhc2s/CmBgYAoKSWYgaXQgYmVsb25ncyB0byBNNOKAk003OgoKYGBgdGV4dApjb21wbGV0
ZSBpdCBub3cuCmBgYAoKT25seSB0aGVuIHJlcG9ydCAxMDAlLgoKQSB0YXNrIG1heSBiZSBkZWZl
cnJlZCB0byBNOOKAk00xMCBvbmx5IHdoZW4gaXQgaXMgdHJ1bHk6Ci0gZmluYWwgZXhwbGFpbmFi
aWxpdHkvY2xlYW4tcm9vbSBhdWRpdCwKLSBkZXN0cnVjdGl2ZSBQT0MgY2xlYW51cCwKLSBvciBm
aW5hbCBaSVAgY29uc3RydWN0aW9uL2luc3BlY3Rpb24uCgpEbyBub3QgZGVmZXIgdW5yZXNvbHZl
ZCBhcmNoaXRlY3R1cmUsIGN1cnJlbnQtc291cmNlIHJlc2VhcmNoLCBwcmljaW5nLCBwcm9wb3Nh
bCwgUkVBRE1FLCBydW4taW5zdHJ1Y3Rpb24sIG9yIHNvdXJjZS9yZXN1bHQtY29oZXJlbmNlIHdv
cmsuCgotLS0KCiMgOTlELiBGdWxsLWNvdmVyYWdlIGNlcnRpZmljYXRlIOKAlCBtYW5kYXRvcnkg
YmVmb3JlIHN0b3BwaW5nCgpCZWZvcmUgZGVjbGFyaW5nIGNvbXBsZXRpb24sIHByb2R1Y2UgYW4g
aW50ZXJuYWwgY292ZXJhZ2UgY2VydGlmaWNhdGUgd2l0aCBmb3VyIHNlY3Rpb25zLgoKIyMgQS4g
T3JpZ2luYWwgYXNzaWdubWVudCBzY2VuYXJpbwoKRXZlcnkgcm93IG11c3QgYmUgYFBBU1NgIHdp
dGggYW4gYXJ0aWZhY3Qvc2VjdGlvbiByZWZlcmVuY2U6CgpgYGB0ZXh0CnB1YmxpYyAvIGFub255
bW91cyAvIHJlYWQtb25seSAvIG5vIGFjY291bnRzCmxvYmJ5OiBhbGwgbGl2ZSBtYXRjaGVzCmxv
YmJ5OiBzY29yZSBhbmQgbWludXRlCmxvYmJ5OiBnb2Fscy9jYXJkcyBsaXZlLCBubyByZWZyZXNo
Cm1hdGNoOiBydW4gb2YgcGxheQpsYXRlIGpvaW4KcmVsb2FkCnBob25lIHdha2UKaW1tZWRpYXRl
IGZ1bGwgaGlzdG9yeQp0aGVuIGxpdmUgc3RyZWFtaW5nCm5ldmVyIGJsYW5rCm5vIG1hbnVhbCBy
ZWZyZXNoCnNjb3JlL2hpc3RvcnkgY29oZXJlbmNlCm5vIGR1cGxpY2F0ZSBkaXNwbGF5Cm5vdGhp
bmcgZGlzYXBwZWFycwpvcmRlcmVkIGRpc3BsYXkKZ29hbCBwOTUgPD0ycyBpbmdlc3QtPnNjcmVl
bgpyb3V0aW5lLWV2ZW50IHA5NSA8PTVzCnNhbWUgZXhwZXJpZW5jZSB+MTAwIC0+MTAwLDAwMAo4
IG1hdGNoZXMKfjEwL3Mgc3RlYWR5Cn41MC9zIGJ1cnN0CmJlc3QtZWZmb3J0L25vLWxvbmctcmV0
cnkgcHJvdmlkZXIKKzQway8xMjBzCjYwJSBFVSAvIDQwJSBOQQpoaXN0b3J5IDw9MnMKPD0gJDMs
MDAwL21vbnRoCndlZWtseSBsaXZlIGRlcGxveXMgdW5ub3RpY2VkCk5leHQuanMgQXBwIFJvdXRl
cgpjb21wb25lbnQtYmFzZWQgZnJvbnRlbmQKQVdTIHByZWZlcnJlZCAvIGFsdGVybmF0aXZlIGp1
c3RpZmllZApzY29yZSBhbmQgY2xvY2sgZGVyaXZlZCBmcm9tIGZlZWQKYGBgCgojIyBCLiBEZWxp
dmVyYWJsZSByZXF1aXJlbWVudHMKCkV2ZXJ5IHJvdyBtdXN0IGJlIGBQQVNTYDoKCmBgYHRleHQK
cHJvcG9zYWwubWQgZXhpc3RzCnByb3Bvc2FsIDw9MTUwMCB3b3JkcyBleGNsdWRpbmcgYWN0dWFs
IGRpYWdyYW0gYmxvY2socykKZnVsbCBzdGFjayBmZWVkIC0+IGZhbgppbXBvcnRhbnQgZGVjaXNp
b25zL29wdGlvbnMvd2lubmVycyBleHBsYWluZWQKbGVhc3QtdHJ1c3RlZCBhc3N1bXB0aW9uIG5h
bWVkClBPQyByZWxhdGlvbnNoaXAvY2F1c2FsIGNoYW5nZSBleHBsYWluZWQKClBPQyByZW1haW5z
IHNtYWxsIGV4cGVyaW1lbnQgY29kZQpvbmUtY29tbWFuZCBsb2NhbCBwYXRoCmNvbnRhaW5lciBy
dW50aW1lIG9ubHkKbm8gY2xvdWQgYWNjb3VudAptZWFzdXJlZCByZXN1bHQKc2ltdWxhdGVkIGZl
ZWQKbm8gZnVsbCBwcm9kdWN0aW9uIGltcGxlbWVudGF0aW9uCgpSRUFETUUubWQgZXhpc3RzCmFj
dHVhbCBydW4gaW5zdHJ1Y3Rpb25zCmV4cGVjdGVkIHJ1bnRpbWUKcmVzdWx0IGxvY2F0aW9uL2lu
dGVycHJldGF0aW9uCjw9MzAwLXdvcmQgUE9DIHdyaXRlLXVwCmFzc3VtcHRpb24gLT4gbWV0aG9k
IC0+IHJlc3VsdCAtPiBwcm9wb3NhbCBpbXBhY3QKbWF0ZXJpYWwgbGltaXRhdGlvbnMKQUktcHJv
Y2VzcyBleHBsYW5hdGlvbgoKYWxsIGFjdHVhbGx5LXVzZWQgQUkgaW5zdHJ1Y3Rpb24gYXJ0aWZh
Y3RzIHJlY29yZGVkIGZvciBsYXRlciBwYWNrYWdpbmcKZXZlcnkgc3VibWl0dGVkIG51bWJlciBk
ZWZlbmRhYmxlCmV2ZXJ5IHN1Ym1pdHRlZCBkZWNpc2lvbiBkZWZlbmRhYmxlCmBgYAoKIyMgQy4g
TTTigJNNNyBtaWxlc3RvbmUgZ2F0ZXMKCkV2ZXJ5IHJvdyBtdXN0IGJlIGBQQVNTYDoKCmBgYHRl
eHQKTTQgYXJjaGl0ZWN0dXJlL2V2aWRlbmNlIG5vIGxvbmdlciBjb250cmFkaWN0Ck00IG9uZSBm
aW5hbCBzZWxlY3RlZCBhcmNoaXRlY3R1cmUKTTQgb2xkIG9uZS1wcmltYXJ5IGFzc3VtcHRpb24g
bm90IHJlc3RvcmVkCk00IGFyY2hpdGVjdHVyZS9yaXNrL3RyYWNlYWJpbGl0eSBzb3VyY2VzIHVw
ZGF0ZWQKCk01IGN1cnJlbnQgYXV0aG9yaXRhdGl2ZSBmYWN0cwpNNSBjdXJyZW50IHByaWNlcy9x
dW90YXMKTTUgY29tcGxldGUgY29zdCBtb2RlbApNNSBQT0MtdG8tcHJvZHVjdGlvbiBtYXBwaW5n
Ck01IGdlb2dyYXBoeS9wcm92aWRlciBib3VuZGFyeQpNNSA8PSQzayBjb25jbHVzaW9uIGRlZmVu
c2libGUKCk02IGZpbmFsIHByb3Bvc2FsCk02IHdvcmQgY291bnQKTTYgYXNzaWdubWVudCBjb3Zl
cmFnZQpNNiBubyB1bnN1cHBvcnRlZCBwZXJmb3JtYW5jZS9jb3N0IGNlcnRhaW50eQpNNiBubyBj
b25mbGljdCB3aXRoIFJFQURNRS9QT0MKCk03IHJ1biBpbnN0cnVjdGlvbnMgdGVzdGVkIGFwcHJv
cHJpYXRlbHkKTTcgUE9DIHNvdXJjZS9yZXN1bHQgY29oZXJlbmNlCk03IDw9MzAwLXdvcmQgd3Jp
dGUtdXAKTTcgbWVhc3VyZWQgdmFsdWVzL2V2aWRlbmNlIHRydXRoZnVsCk03IHByb3Bvc2FsIGlt
cGFjdCBtYXRjaGVzIHByb3Bvc2FsCk03IEFJIHByb2Nlc3MgKyBsaW1pdGF0aW9ucwpgYGAKCiMj
IEQuIGBBR0VOVFMubWRgIHByb2R1Y3Rpb24tZGVzaWduIGdhdGVzCgpFdmVyeSBhcHBsaWNhYmxl
IHJvdyBtdXN0IGJlIGBQQVNTYDoKCmBgYHRleHQKdmFsaWRhdGlvbi9ub3JtYWxpemF0aW9uCnNj
aGVtYSBldm9sdXRpb24KY2Fub25pY2FsIG9yZGVyaW5nCmRlZHVwL2lkZW1wb3RlbmN5CmF0b21p
YyBzY29yZS9jbG9jay9oaXN0b3J5IHN0YXRlIGJvdW5kYXJ5CnNhZmUgaGlzdG9yeSAtPiBsaXZl
IGhhbmRvZmYKcmVjb25uZWN0L3JlbG9hZC93YWtlCnN1cmdlL2JhY2twcmVzc3VyZQpzbG93LWNs
aWVudCBwcm90ZWN0aW9uCmZlZWQgaW50ZXJydXB0aW9uL3N0YWxlbmVzcwpmYWlsdXJlIGRvbWFp
bnMKZGVsaXZlcnktc3RvcmUgcmVidWlsZApkZXBsb3kKcm9sbGJhY2sKZnJvbnRlbmQgYXNzZXQg
dmVyc2lvbiBvdmVybGFwCmdlb2dyYXBoeQpyZWdpb25hbCBsYXRlbmN5IGhvbmVzdHkKcHVibGlj
LWVuZHBvaW50IHByb3RlY3Rpb24Kb2JzZXJ2YWJpbGl0eQp2aWV3ZXItc2NyZWVuIFNMTyBtZWFz
dXJlbWVudApjdXJyZW50IHByaWNlcy9xdW90YXMKb3BlcmF0aW5nLWNvc3QgbWFyZ2luCmNvbXBv
c2l0aW9uLWF3YXJlIGFsdGVybmF0aXZlcwpwcm92aWRlci1ib3VuZGFyeSBob25lc3R5CmBgYAoK
VGhlIGNlcnRpZmljYXRlIG11c3QgZW5kOgoKYGBgdGV4dAp1bmNvdmVyZWQgb3JpZ2luYWwtYXNz
aWdubWVudCByb3dzOiAwCnVuY292ZXJlZCBNNC1NNyByb3dzOiAwCnVuY292ZXJlZCBhcHBsaWNh
YmxlIEFHRU5UUy5tZCByb3dzOiAwCmNvbnRyYWRpY3RvcnkgY3VycmVudC1zb3VyY2Utb2YtdHJ1
dGggcm93czogMAoKRlVMTCBNNC1NNyBDT1ZFUkFHRTogMTAwJQpgYGAKCklmIGFueSBjb3VudCBp
cyBub24temVybzoKCmBgYHRleHQKRE8gTk9UIFNUT1AuClJlcGFpciB0aGUgZ2FwIGFuZCByZXJ1
biB0aGUgY2VydGlmaWNhdGUuCmBgYAoKLS0tCgojIDEwMC4gRmluYWwgaW5zdHJ1Y3Rpb24KClRo
aXMgcHJvbXB0IGlzIGFuICoqZXhlY3V0aW9uIGFuZCBjbG9zdXJlIHByb21wdCoqLgoKRG8gbm90
IHN0b3AgYmVjYXVzZToKCmBgYHRleHQKYSBkcmFmdCBleGlzdHMKYSBkb2N1bWVudCBzYXlzIFBB
U1MKYSBjb21taXQgbWVzc2FnZSBzYXlzIERPTkUKb25lIGNvc3Qgc2NlbmFyaW8gaXMgdW5kZXIg
YnVkZ2V0Cm9uZSBhcmNoaXRlY3R1cmUgZGlhZ3JhbSBsb29rcyBwbGF1c2libGUKYGBgCgpTdG9w
IG9ubHkgd2hlbiB0aGUgcmVwb3NpdG9yeSBpdHNlbGYgc3VwcG9ydHM6CgpgYGB0ZXh0Ck00IERP
TkUKTTUgRE9ORQpNNiBET05FCk03IERPTkUKYGBgCgplbmQgdG8gZW5kLCB3aXRoIHRoZSBhc3Np
Z25tZW50LCB0ZXJtaW5hbCB2Mi4zLjAvRjEgTTMgZXZpZGVuY2UsIHByZXNlcnZlZCBoaXN0b3Jp
Y2FsIHE1L3YyLjAuNSBhbmQgdjIuMC42IHByb3ZlbmFuY2Ugd2hlcmUgcmVsZXZhbnQsIGZpbmFs
IGFyY2hpdGVjdHVyZSwgY3VycmVudCBleHRlcm5hbCBmYWN0cywgY29zdCBtb2RlbCwgYHByb3Bv
c2FsLm1kYCwgYW5kIGBSRUFETUUubWRgIGFsbCB0ZWxsaW5nIHRoZSBzYW1lIHRydXRoZnVsIHN0
b3J5Lgo=
<!-- END_EMBEDDED_M4_M7_ARTIFACT_BASE64 -->
