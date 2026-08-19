AGENTS.md

Live Match Centre Take-Home — AI/Implementation Control Contract

Purpose

This is an auxiliary AI instruction file, not the design proposal. It governs AI-assisted research, drafting, coding, testing, and review for this take-home.

The objective is simple: preserve the assignment exactly, make the production design defensible, test one genuinely risky assumption with the smallest useful experiment, and report evidence without exaggeration.

The candidate owns every final architecture choice, assumption, number, benchmark interpretation, and claim.

1. Authority

Use this order when instructions conflict:

Take-home assignment

Explicit candidate decisions

Approved decisions in proposal.md

This AGENTS.md

POC experiment contract / README.md

Code

AI suggestions

Never silently change a higher-authority requirement. If evidence invalidates an approved design decision, surface the conflict, update the proposal explicitly, and explain why.

A failed or inconclusive experiment is valid evidence. Do not move the target to make the result look successful.

2. Fixed assignment facts

Treat these as immutable:

8 concurrent live matches at peak.

Third-party feed pushes ~10 events/s total, bursting to ~50 events/s.

Feed delivery is best-effort, with no long retry window.

100,000 concurrent viewers at peak.

Viewer surge: +40,000 within 2 minutes.

Audience: ~60% Europe / ~40% North America.

Goal latency: p95 ≤ 2 s from ingest to the viewer's screen.

Other-event latency: p95 ≤ 5 s.

Late join/reload: full match history visible within 2 s.

Infrastructure budget: ≤ $3,000/month at peak.

Weekly deploys may occur during live matches and must not be noticeable.

Frontend: Next.js App Router, component-based.

AWS preferred; alternatives require justification.

Fans are anonymous, public, read-only, with no accounts.

Match score and clock are derived from the event stream.

There is no real feed to connect to for the POC; simulating the event stream is expected and in scope.

The POC requires no cloud deployment and no real infrastructure spend.

The final delivery contains:

proposal.md
README.md
poc/
AGENTS.md
[other agent instruction files only if actually used]

Do not round constraints into easier targets or add requirements that are not present.

3. Preserve the intended user experience

The architecture must satisfy the scenario, not only the numbers.

Lobby: all live matches show current score/minute and state-changing events update without refresh.

Late join / reload / wake-up: the fan sees coherent history/current state immediately, then continues live.

Trustworthy state: the application does not create duplicates, disappearing events, ordering errors, or double-applied score changes.

Live feel: user-facing latency, not only backend throughput, must meet the stated p95 targets.

Crowd invariance: the experience remains materially equivalent at small audiences and at peak/surge load.

4. Provider-boundary honesty

The feed is best-effort. Do not assume replay, snapshots, reconciliation, provider sequence numbers, uniqueness, guaranteed redelivery, idempotency, or a second provider unless explicitly labelled as an external assumption.

Keep these separate:

provider loss != application loss

The system may guarantee that an event successfully accepted at ingest is not duplicated, lost, or reordered by the application. It cannot guarantee recovery of an event the provider never delivered unless a real recovery source exists.

If the design depends on an unstated provider capability, name the assumption and state what changes if it is false.

5. Production design gate

Every major component in proposal.md must earn its place.

For each important choice, be able to explain:

which requirement it serves;

why it is needed;

the simpler alternative considered;

why the chosen option won;

its main failure mode;

its latency effect;

its cost effect;

its deployment behaviour;

its effect on consistency.

The full path must be clear:

third-party feed
  -> ingest
  -> validation / normalization
  -> ordering / deduplication / state derivation
  -> current/history state
  -> fan-out / delivery
  -> geographic delivery
  -> Next.js client
  -> coherent lobby / match view

The proposal must address, proportionally and without service-catalogue overengineering:

safe history/snapshot → live-stream handoff;

reconnect/reload/sleep-wake recovery;

viewer surge and backpressure;

Europe/North America delivery;

live-match deploy and rollback;

feed interruption/resume;

obvious failure domains / single points of failure;

event schema evolution;

public-endpoint abuse/DDoS protection;

observability for latency, errors, drops, lag, and connection health;

peak-month cost under $3,000, with clear assumptions about what "peak" means for the estimate.

Prefer a few well-justified components over a large architecture diagram full of unnecessary services.

6. Composition-aware architecture reasoning

Use the following as an internal architecture-selection method. Keep the proposal focused on the engineering decisions rather than the methodology behind them.

The key rule is that local optimality need not survive composition: a component or design that looks worse in isolation can become the better choice after surrounding constraints and interacting components are included. Therefore, do not choose each subsystem independently and then assume the collection is globally optimal.

6.1 Preserve alternatives long enough to compose them

For each consequential architecture choice, keep a small set of plausible alternatives alive until their whole-system effects are understood.

Do not prune an option merely because it loses on one isolated property such as:

raw latency;

implementation simplicity;

local compute cost;

connection efficiency;

storage efficiency;

operational familiarity.

An option may lose locally and still win after composition with:

100,000 concurrent viewers;

the +40,000/2-minute surge;

60% Europe / 40% North America;

late-join history ≤2 s;

strict ordering/deduplication/state consistency;

live deploys;

upstream best-effort delivery;

the $3,000/month budget.

6.2 Evaluate composed designs, not isolated components

For each candidate architecture, reason across the complete requirement vector:

R =
{
  goal latency,
  other-event latency,
  late-join latency,
  event correctness,
  surge handling,
  geographic delivery,
  recovery,
  deployment continuity,
  provider-boundary assumptions,
  monthly cost,
  implementation/operational complexity
}

A candidate that is attractive on one coordinate is not automatically preferred.

First apply hard gates:

violates a mandatory requirement -> reject or redesign

Then compare the survivors on system-level trade-offs.

6.3 Look explicitly for preference reversal

For every important choice, ask:

Does the locally attractive option remain attractive once all required interactions are included?

Examples of contextual interactions to inspect:

delivery mechanism
    × connection surge
    × geographic fan-out
    × cost

history strategy
    × late join
    × snapshot-to-live handoff
    × consistency

state model
    × deduplication
    × ordering
    × score derivation
    × recovery

regional topology
    × latency
    × cross-region traffic
    × deployment/failure behaviour
    × budget

If the preference between two designs reverses after these interactions are added, use the composed result.

6.4 Retain the useful Pareto frontier

Do not retain every imaginable design. Retain only alternatives that are not clearly dominated across the dimensions that matter.

A candidate is safe to prune when another candidate is at least as good on all material dimensions and strictly better on at least one, with no hidden interaction expected to reverse the comparison.

For each major decision, keep a compact ledger such as:

Candidate:
Local strengths:
Local weaknesses:
Hard constraints satisfied:
Important interactions:
New failure modes:
Cost effect:
Latency effect:
Consistency effect:
Deployment/recovery effect:
Unverified assumptions:
Composed verdict:

The purpose is not mathematical formalism. The purpose is to avoid prematurely deleting a design that becomes superior in the full production context.

6.5 Falsification before promotion

Do not promote a candidate because it sounds elegant or because an AI recommends it.

Try to invalidate it by asking:

Which assignment constraint is closest to failure?

Which external assumption is least trustworthy?

Which interaction creates the largest uncertainty?

What happens under viewer surge?

What happens during reconnect or deploy?

What happens if events duplicate, arrive late, or arrive out of order?

What happens if the provider does not support an assumed recovery mechanism?

Which cost term grows fastest?

Which claim depends on extrapolation rather than evidence?

A design survives only after its strongest practical objections are addressed.

6.6 Derive the POC from the fragile composed dependency

After the system-level comparison produces a preferred architecture, identify the dependency whose failure would most strongly change that architecture.

Use:

candidate architectures
  -> composed requirement comparison
  -> preferred architecture
  -> weakest architecture-critical assumption
  -> local falsification experiment
  -> measured result
  -> confirm or revise architecture

The POC must therefore come after architecture comparison, not be chosen because it is convenient to implement.

6.7 Evidence levels

Keep these distinct:

assignment fact
authoritative external fact
candidate design decision
assumption
local measurement
production inference

Never promote a lower evidence level into a stronger one without justification.

In particular:

local measurement != production proof
architectural argument != measurement
provider assumption != provider guarantee

6.8 Reasoning stop rule

Stop expanding alternatives when:

all hard requirements have at least one credible satisfying architecture;

remaining alternatives are dominated or differ only in low-impact implementation detail;

the preferred architecture survives the important composition checks;

its most consequential unresolved assumption is clear enough to test;

further alternatives would add breadth without changing the decision.

This keeps composition-aware reasoning useful without turning the take-home into an optimization research project.

7. Correctness invariants

Use explicit invariants instead of vague reliability claims.

Stable event identity — enough identity exists for the stated deduplication guarantee.

Canonical ordering — define match-event order; do not assume network arrival order is canonical.

Idempotent application — reprocessing an accepted event cannot duplicate it or apply its state mutation twice.

Score/clock/history coherence — visible derived state and visible history come from a compatible state boundary.

Snapshot-to-live correctness — events occurring during history load are neither missed nor shown twice when streaming begins.

Recovery correctness — reconnect, reload, sleep/wake, deploy, or downstream connection loss does not create application-induced gaps, duplicates, or reordering.

Upstream-boundary honesty — the application cannot manufacture an event never delivered by the provider.

Clock semantics — if the client extrapolates a running clock between feed updates, define correction/resynchronization behaviour.

8. Cost discipline

Exact cloud prices or quotas must come from current authoritative sources.

Include the material cost drivers of the chosen architecture, as applicable:

compute;

connection/fan-out service;

request/message volume;

data transfer/egress;

CDN/edge;

storage;

cross-region traffic;

observability;

reasonable operating margin.

Do not omit a dominant cost to force the model under $3,000. If a price is uncertain, label it rather than using false precision.

8.1 Research and evidence rules

When the proposal relies on facts that can change over time—AWS prices, service limits, quotas, regional availability, protocol/service capabilities, or Next.js/runtime behaviour—verify them from current primary sources.

Rules:

Prefer official AWS documentation/pricing for AWS claims.

Prefer official framework/runtime documentation for technical behaviour.

Record the pricing region and material pricing assumptions.

Distinguish a documented service limit from a requested/increasable quota.

Distinguish a product capability from an architecture assumption.

Do not use an old blog post as the sole basis for a current numeric claim.

Avoid exact numbers that do not materially affect the decision.

If two authoritative sources appear inconsistent, do not silently choose one; resolve or state the uncertainty.

The proposal does not need citation clutter, but every mutable fact used in the reasoning must be recoverable to a trustworthy source.

8.2 Latency-budget discipline

Treat the user-facing latency SLO as an end-to-end budget rather than a backend-only target.

Reason about the important segments:

provider arrival at our ingest boundary
  -> validation/state processing
  -> fan-out publication
  -> geographic/network delivery
  -> client receipt
  -> client state update/render

Rules:

Reserve margin rather than designing every stage exactly to the SLO.

Do not naively add independent p95 values and call the sum an end-to-end p95.

State which portions are measured, modelled, or inferred.

Consider Europe and North America separately when geography materially changes latency.

A global p95 must not conceal a region that consistently violates the intended experience.

If the POC measures only a subset of the path, use it to validate that subsystem assumption, not the complete viewer-screen SLO.

9. Select one architecture-critical POC assumption

The POC tests one assumption.

Rank candidates using:

impact: how much of the architecture changes if false?

uncertainty: how little confidence exists without measurement?

local measurability: can a local experiment produce useful evidence?

relevance: does it map directly to an assignment constraint?

Use this test:

If this assumption is false, would I materially change the proposed architecture?

If no, it is probably not risky enough.

Possible candidates include fan-out under connection surge, snapshot-to-live correctness, reconnect recovery, or another architecture-specific risk. These are examples only; select the risk after the design establishes what is genuinely uncertain.

If the true highest-risk assumption cannot be tested locally, say so and test the riskiest locally testable one, as the assignment permits.

10. Freeze the experiment before final measurement

Record the experiment contract before the final measured run.

Assumption

One falsifiable sentence.

Architecture dependency

Which production decision changes if the assumption is false?

Local-test limitation

What production claim can this local experiment not prove?

Workload

Declare, where relevant:

matches;

steady/burst event rate;

viewer/connection count;

connection ramp/surge shape;

payload size;

duration;

warm-up;

measured repetitions;

resource limits;

random seed if randomness affects results.

Metrics

Collect only what decides the assumption, for example:

throughput;

p50/p95/p99 latency;

drops;

duplicates;

out-of-order events;

connection establishment/sustained connections;

history load time;

handoff errors;

reconnect time;

CPU/memory.

Acceptance criteria

Freeze success/failure thresholds before the final measured run.

Changing a threshold after seeing results creates a new experiment and must be recorded as such.

11. Measurement integrity

Measure the boundary you claim

A measurement of:

ingest -> server receiver

is not the same as:

ingest -> viewer screen

If browser rendering, Internet transit, edge/CDN, geographic propagation, or another segment is absent, state that limitation.

Timing and percentiles

Use a monotonic clock for elapsed timing where practical. Define metric start/end points and the sample population used for p95/p99.

Runs

Do not cherry-pick the best run. Use repeated runs when variance matters. Separate warm-up from measured intervals.

Environment

Record enough local context to interpret results: CPU, memory, container limits, runtime versions, and relevant host limits.

Capacity tests

If the assumption concerns capacity, do not merely prove that one load level “worked.” Where practical, increase load enough to identify the performance knee or failure region and report headroom.

Synthetic-load limits

Detect/disclose when file descriptors, ephemeral ports, loopback networking, scheduler limits, or the load generator itself dominate the result.

No unjustified extrapolation

A local or reduced-scale benchmark does not directly prove 100,000-user production capacity. Any scaling argument is an inference and must be labelled as such.

Valid outcomes:

ACCEPT
REJECT
INCONCLUSIVE

ACCEPT means the assumption survived the declared experiment, not that the whole architecture is proven.

12. Workload fidelity

When relevant, model:

~10 events/s steady;

~50 events/s burst;

up to 8 matches;

+40,000 viewers in 2 minutes, or a clearly stated reduced-scale analogue;

late join/reload;

reconnect;

goal/card/routine classes if they affect measurement.

If reduced scale is used, state:

what was reduced;

what property is intended to remain comparable;

why the analogue is informative;

that full production scale was not measured.

Simulation choices are experiment choices, not assignment facts.

13. AI implementation rules

AI may assist with research, architecture comparison, drafting, code, tests, Docker, workload generation, metrics, calculations, and consistency review.

AI must not:

invent requirements/provider capabilities;

alter numeric constraints;

silently change assumption/workload/metric/acceptance criteria;

broaden POC scope without justification;

invent APIs/dependencies to make code compile;

claim a benchmark ran when it did not;

fabricate output;

hide failed/inconclusive results;

present extrapolation as measurement;

add architecture the candidate cannot explain;

make final claims the candidate has not reviewed.

When required information is missing, state the uncertainty or return BLOCKED rather than guessing.

14. Smallest satisfying implementation

Before adding a POC component, ask:

Does this materially affect the selected measurement?

If no, omit it.

Potentially unnecessary elements include authentication, unrelated databases, polished frontend work, Kubernetes, Terraform, full observability stacks, CI/CD, cloud SDKs, and unrelated APIs.

Experiment-grade code is expected and acceptable.

15. Reproducible one-command execution

The POC must run locally with one command, for example:

docker compose up --build

The command must:

build what is required;

start the experiment;

generate the declared workload;

collect the declared measurements;

print a clear result;

make completion/failure obvious.

Rules:

no cloud account;

nothing beyond a container runtime;

no hidden local files or credentials;

clean checkout must be enough;

pin material versions where practical;

use fixed/configurable seeds when randomness affects comparability.

Example result shape:

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

Print only metrics relevant to the selected assumption. Do not package generated logs/results in poc/.

16. Proposal ↔ POC traceability

Maintain this exact reasoning chain:

assignment requirement
  -> architecture decision
  -> risky assumption
  -> local experiment
  -> measured result
  -> ACCEPT / REJECT / INCONCLUSIVE
  -> proposal confirmation or change

If an arrow cannot be explained, fix the reasoning before submission.

17. README and package

README.md must contain:

one-command run instructions;

the required ≤300-word write-up in the order assumption → method → result → proposal impact;

material limitations;

a short truthful explanation of how AI tools were directed.

Keep the package clean. Do not include:

node_modules;

build artifacts;

generated logs/results;

temporary files;

editor metadata;

secrets;

cloud state;

unrelated notes.

18. Proposal word-budget discipline

proposal.md is limited to 1,500 words excluding diagrams.

Use the space for decisions and reasoning, not generic technology explanations.

Prioritize:

end-to-end architecture;

consistency/state model;

live delivery and late join;

scale/latency;

failure/recovery/deployment;

cost;

alternatives/trade-offs;

the risky assumption leading to the POC.

A diagram should reduce prose, not duplicate it.

19. Final gate

Do not package until all of the following are true:

Proposal

Every fixed fact in §2 is addressed.

End-to-end ingest → fan path is clear.

Provider best-effort limitations are represented honestly.

Ordering, deduplication, idempotency, state coherence, and snapshot→live handoff are clear.

Reconnect, surge/backpressure, failure, deployment/rollback, geography, and cost are addressed.

Observability and public-endpoint protection are proportionate to a production design.

Exact current prices/limits are sourced where used, with material region/assumption context.

Mutable service capabilities/quotas used in the design were checked against current primary sources.

Goal/other-event latency is reasoned as an end-to-end viewer-facing budget, not only a backend target.

Regional latency implications for Europe and North America are not hidden by a single aggregate claim.

Important alternatives/trade-offs are visible.

Major alternatives were compared after composition with the full requirement set, not only on isolated subsystem metrics.

No locally attractive design was selected without checking for preference reversal under scale, consistency, geography, recovery, deployment, and cost.

Clearly dominated alternatives were pruned; meaningful non-dominated alternatives were retained long enough to evaluate their system-level effects.

The riskiest assumption is named.

proposal.md is ≤1,500 words excluding diagrams.

Every material decision can be defended by the candidate.

POC

Tests one falsifiable architecture-critical assumption.

Experiment contract was frozen before final measurement.

Runs with one command and only a container runtime.

Requires no cloud account.

Produces measured evidence, not a demonstration UI.

Measurement/proxy boundaries are explicit.

Percentile method/population is defined.

Results are not cherry-picked.

Environment and host/load-generator limits are disclosed.

Capacity headroom/saturation is reported where practical.

No local benchmark is misrepresented as direct proof of production scale.

Outcome follows frozen criteria.

README / package

Clean-checkout instructions are sufficient.

Required POC write-up is ≤300 words.

Write-up covers assumption → method → result → proposal impact.

Material limitations are stated.

AI use is described truthfully.

Every agent instruction file actually used is included.

No generated dependencies, artifacts, logs, secrets, or unrelated files are packaged.

20. Stop conditions

Stop AI-assisted implementation when:

the selected assumption has a valid measured outcome or is correctly marked inconclusive;

the result is reflected honestly in proposal.md;

every assignment constraint is covered;

README.md accurately describes the experiment and AI use;

the final gate passes;

further work would add scope or polish without improving validity.

Core operating principle

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
