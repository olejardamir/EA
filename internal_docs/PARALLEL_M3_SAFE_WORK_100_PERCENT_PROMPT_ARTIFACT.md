# Parallel Work While Milestone 3 Runs — 100% End-to-End Execution Prompt

**Purpose:** Execute **every task that can be completed safely and honestly in parallel with Milestone 3**, while Milestone 3 runs the frozen POC campaign separately.

**Repository:** `https://github.com/olejardamir/EA`

**Audited repository baseline when this prompt was created:**

```text
main = a9d5ce2691919b5484ae961685d9780acee44460
```

**Active POC contract at that baseline:**

```text
internal_docs/LIVE_MATCH_CENTRE_POC_EXPERIMENT_CONTRACT_v2_0_5.md
```

**Milestone state at prompt creation:**

```text
M0   DONE
M0.5 DONE
M1   DONE
M2   DONE — 100%
M3   IN PROGRESS elsewhere / separately
M4   WAITING FOR M3 RESULT
M5   PARALLEL WORK AVAILABLE
M6   PARTIAL PARALLEL WORK AVAILABLE
M7   PARTIAL PARALLEL WORK AVAILABLE
M8   PARTIAL PARALLEL WORK AVAILABLE
M9   NON-DESTRUCTIVE PARALLEL AUDIT AVAILABLE
M10  NON-DESTRUCTIVE PARALLEL PRECHECK AVAILABLE
```

---

# 0. Operating objective

Your task is **not** to run Milestone 3 and **not** to wait for it.

Your task is to complete, in a loop, **all work that does not require the final M3 campaign result**.

You must continue until:

```text
every safely parallelizable task is complete,
every remaining task is explicitly dependent on M3/M4 or must happen after M3,
no parallelizable research/drafting/audit/packaging-prep gap remains,
and a final adversarial review finds no missing independent work.
```

This prompt is intended to be fed to an LLM/coding agent.

Do not stop after producing recommendations.

Actually perform the parallel research, calculations, audits, and draft preparation.

---

# 1. Absolute concurrency safety rule

Milestone 3 is a qualifying experiment.

Nothing in this parallel task may contaminate its source identity, working tree, Docker environment, CPU/memory/network measurements, evidence volumes, or result interpretation.

## 1.1 Never mutate the M3 checkout

If Milestone 3 is running from a local checkout:

```text
DO NOT edit it.
DO NOT commit in it.
DO NOT checkout another branch in it.
DO NOT pull/rebase it.
DO NOT merge into it.
DO NOT delete files from it.
DO NOT modify poc/.
```

## 1.2 Use an isolated workspace

Preferred:

```bash
git worktree add ../EA-parallel -b parallel-m3-safe-prep <safe-base-sha>
```

or use a completely separate clone.

If neither is possible:

```text
perform the work outside the repository checkout
and write draft artifacts to a separate output directory.
```

Never choose convenience over M3 integrity.

## 1.3 Do not compete for benchmark resources

While M3 is running:

```text
DO NOT run docker compose for this project.
DO NOT run the 100k campaign.
DO NOT run the smoke campaign.
DO NOT start Nchan/Redis.
DO NOT run load tests.
DO NOT run CPU/memory/network stress tests.
DO NOT run large builds that could materially compete with M3.
```

Static source inspection is allowed.

Web research is allowed.

Lightweight text processing/calculation is allowed.

## 1.4 Do not merge parallel work into `main`

Keep all parallel work isolated until M3 is finished and its evidence is frozen.

A final integration/rebase belongs after M3.

---

# 2. Source-of-truth precedence

Use this order:

1. Original assignment / `requirement.pdf`.
2. Explicit candidate decisions that do not contradict the assignment.
3. `internal_docs/AGENTS.md`.
4. `internal_docs/LIVE_MATCH_CENTRE_MINIMUM_DEFENSIBLE_ARCHITECTURE.md`.
5. Current approved architecture contract / architecture working document.
6. Current canonical POC contract v2.0.5 for POC-related facts.
7. `internal_docs/LIVE_MATCH_CENTRE_ASSIGNMENT_MILESTONES (3).md`.
8. Current repository code.
9. Historical documents only as provenance.

If a later source conflicts with the assignment:

```text
the assignment wins.
```

If current external AWS documentation contradicts an old internal capability assumption:

```text
record the conflict;
do not silently rewrite the architecture while M3 is running;
surface it as an M4/M5 architecture-reconciliation input.
```

---

# 3. Assignment hard constraints — embed these, do not weaken them

The original assignment says:

```text
Product:
public anonymous read-only Live Match Centre
no accounts

Experience:
lobby shows all live matches
current score and minute
goals/cards update live with no refresh

match page:
late join
reload
return after phone sleep
immediately sees everything so far
then continues live
never blank
never manual refresh

trust:
score agrees with visible events
nothing duplicated
nothing disappears
nothing arrives out of order

live feel:
goals p95 <= 2s ingest -> viewer screen
all other events p95 <= 5s ingest -> viewer screen

crowd:
experience should hold from 100 to 100,000 viewers
including kickoff rush

score and clock:
derived from third-party event stream

scale:
8 concurrent live matches
~10 events/s total steady
~50 events/s total burst
100,000 concurrent viewers
+40,000 viewers in 2 minutes
~60% Europe / ~40% North America

late join:
full match history visible <=2s

budget:
<= $3,000/month at peak

deploys:
weekly
including during live matches
viewers must not notice

frontend:
Next.js App Router
component-based

infrastructure:
AWS preferred
alternative allowed only with justification
```

Deliverables:

```text
proposal.md
    max 1,500 words
    diagrams excluded
    production design
    full stack feed -> fan screen
    decisions/options/tradeoffs
    name least-trusted assumption

POC
    test riskiest architecture-invalidating assumption
    if true riskiest cannot be tested locally:
        test riskiest locally testable one and say so
    smallest experiment that produces a measured result
    local
    one command
    no cloud account
    only container runtime
    measured result, not UI
    simulated feed expected
    rough experiment-grade code
    no full system
    no cloud deployment/spend

README.md
    run instructions
    <=300-word POC write-up:
        assumption -> method -> result -> proposal change
    a few sentences on AI-tool process

Delivery ZIP contains only:
    proposal.md
    README.md
    poc/
    any agent instruction files actually used

poc/ contains:
    source/config only
    nothing generated
    no node_modules
    no build artifacts
    no logs
```

AI rule:

```text
include every agent instruction file actually used
candidate must be able to explain every number and every decision
```

---

# 4. Current production architecture to research — do not silently replace it

At the audited baseline, the selected minimum production architecture is:

```text
Fans
  |
  v
CloudFront
  |------------------------------|
  |                              |
  v                              v
S3                         private NLB
Next.js static                  |
                                v
                         Nchan EC2 ASG
                                |
                                v
                   ElastiCache Redis OSS 7.1
                      shared Nchan store
                                ^
                                |
                         private HTTP publish
                                |
Provider -> API Gateway HTTP -> SQS FIFO -> TypeScript Lambda
                                           |
                                           v
                                       DynamoDB
```

Custom production code:

```text
1. TypeScript canonical processor Lambda
2. Next.js App Router frontend + native EventSource/canonical_seq reducer
```

Current design decisions include:

```text
SSE, not WebSockets
Nchan, not a custom real-time server
Nchan buffered active-match history for normal late join
DynamoDB remains canonical durable truth
Redis is Nchan shared delivery/history store, not canonical truth
API Gateway directly durably enqueues to SQS FIFO
Lambda processes canonical match state
one private NLB fronts Nchan fleet
EC2 Auto Scaling Group hosts Nchan
CloudFront is public global viewer edge
S3 hosts static Next.js output
WAF removed from baseline
Shield Standard assumed baseline AWS protection
```

Treat this architecture as **provisional until M4 receives M3**.

Parallel research may discover a problem.

Do not resolve that problem by changing the production architecture during M3.

Record it.

---

# 5. What IS parallelizable

Complete all of the following.

```text
M4:
prepare the reconciliation framework only

M5:
current external capability verification
current pricing verification
parameterized cost model
budget sensitivity
geographic reasoning
provider-semantics evidence boundary
POC-to-production mapping FRAMEWORK only

M6:
draft all proposal content that does not depend on M3 verdict
prepare diagram
prepare word budget
leave M3/M4 result statements unresolved

M7:
draft README structure
draft AI-process disclosure
draft fixed assumption/method text only where already frozen
leave measured result and proposal-impact text unresolved
do not finalize reviewer run command if M3 may change it

M8:
number/source audit
decision/explainability audit
static consistency audit
source-freshness audit
reproducibility checklist
DO NOT run resource-heavy clean-room POC while M3 runs

M9:
non-destructive poc/ cleanup inventory
classify keep/remove-later/verify
DO NOT delete/move POC files during M3

M10:
submission manifest precheck
agent-instruction inventory
exclusion list
word-count/package checklist
DO NOT create final ZIP yet
```

---

# 6. What is NOT parallelizable

Do not complete these until M3/M4 provides the missing evidence.

```text
M4 final reconciliation
final decision to retain/replace Nchan architecture
final production fleet size derived from M3
final POC-to-production performance conclusion
final proposal.md
final README measured-result section
final <=300-word POC write-up
final proposal-impact statement
final consistency audit against measured M3 output
final poc/ destructive cleanup
final ZIP
```

Do not mark these DONE.

---

# 7. Mandatory iterative loop

Work in repeated passes.

## Loop

```text
PASS 1:
read assignment + current repo + current architecture

PASS 2:
map all parallelizable dependencies

PASS 3:
perform current external-source research

PASS 4:
build parameterized cost model

PASS 5:
prepare M4/M6/M7 drafts

PASS 6:
perform M8 explainability/number/source audits

PASS 7:
perform M9/M10 non-destructive submission audits

PASS 8:
adversarial assignment-compliance audit

PASS 9:
re-read current main/branch state for material changes

IF any safely parallelizable gap remains:
    fix it
    repeat from the relevant pass

STOP ONLY WHEN:
    no safely parallelizable gap remains
```

Do not manufacture work merely to keep looping.

---

# 8. Workspace/provenance setup

Before substantive work:

1. record the source repository URL;
2. record current `main` SHA;
3. record the base SHA used for the isolated parallel branch/worktree;
4. record the active architecture docs read;
5. record the current canonical POC contract;
6. record execution date/time;
7. record this prompt's identity.

If this prompt is actually used to direct the agent:

```text
it is an agent instruction file under the assignment.
```

Therefore preserve an exact copy in the isolated parallel work:

```text
internal_docs/PARALLEL_M3_SAFE_WORK_100_PERCENT_PROMPT_ARTIFACT.md
```

Compute SHA-256 and update:

```text
internal_docs/AI_INSTRUCTION_PROVENANCE.md
```

in the isolated branch/worktree only.

Do not mutate the M3 checkout.

---

# 9. M4 parallel work — prepare the reconciliation framework

M4 itself cannot finish before M3.

Prepare an explicit three-branch framework so no reasoning is invented after seeing the result.

Create:

```text
internal_docs/M4_POST_M3_RECONCILIATION_TEMPLATE.md
```

It must contain:

## 9.1 ACCEPT branch

Questions:

```text
Which exact M3 claims passed?
Which values were locally measured?
Which values remain production inferences?
Does the result justify retaining Nchan + Redis + SSE?
What production fleet-sizing facts can be inferred?
What cannot be inferred?
Does any M5 capability/cost evidence independently invalidate the design?
```

Required wording discipline:

```text
M3 ACCEPT != whole production architecture proven
local delivery latency != ingest-to-screen p95
single-host local test != EU/NA Internet proof
synthetic feed != provider semantics proof
100k target success != headroom above 100k
```

## 9.2 REJECT branch

Pre-build the analysis structure:

```text
Which frozen criterion failed?
Was generator/environment valid?
Which architecture dependency does the failure invalidate?
Is the failure:
    Nchan capacity
    history replay
    reconnect
    slow-client behavior
    restart/replacement
    resource envelope
    latency
    correctness
    another bounded POC property?
```

Prepare alternative categories without selecting one:

```text
different Nchan fleet/resource shape
different self-hosted fan-out technology
managed fan-out
Cloudflare Durable Objects
custom SSE/WebSocket gateway
different history/replay topology
```

Do not preselect a winner.

## 9.3 INCONCLUSIVE branch

Prepare:

```text
harness invalidity?
host resource ceiling?
generator saturation?
source-port/FD issue?
measurement/provenance issue?
cross-run instability?
other environmental limit?
```

Do not call INCONCLUSIVE a failure of the architecture.

## 9.4 M5 interaction

The template must include:

```text
M5 current capability/cost evidence can independently force architecture reconsideration,
even if M3 ACCEPTS.
```

---

# 10. M5.1 — fresh external capability verification

This is fully parallelizable.

Use current web research.

Use **primary/current official sources wherever possible**.

For AWS facts:

```text
prefer docs.aws.amazon.com
prefer aws.amazon.com pricing/product pages
prefer current What's New pages for recent feature changes
```

For Next.js:

```text
prefer nextjs.org official docs
```

For Nchan:

```text
prefer nchan.io / official project source/docs
```

Do not rely on old internal notes for a changing AWS capability.

Record:

```text
source URL
page title
retrieval date
claim supported
whether current architecture depends on it
confidence / ambiguity
```

Create:

```text
internal_docs/M5_CURRENT_EXTERNAL_EVIDENCE_LEDGER.md
```

---

# 11. Required CloudFront verification

Investigate all architecture-critical CloudFront claims.

## 11.1 VPC/private origin

Verify current support for:

```text
CloudFront VPC origins
private Network Load Balancer origin
required subnet/security-group/network conditions
feature limitations
region limitations
pricing-plan eligibility/requirements
```

## 11.2 SSE/streaming behavior

Verify:

```text
custom/VPC origin streaming behavior
chunked response behavior
origin response/read timeout semantics
timeout resets between response packets
response completion timeout behavior
whether leaving response completion timeout unset permits a long-lived response
viewer connection behavior relevant to SSE
connection/origin retry behavior
```

Do not assume WebSocket documentation is equivalent to SSE.

## 11.3 Cache behavior

Verify how to configure live SSE paths:

```text
caching disabled
appropriate origin request/cache policy
compression behavior
headers relevant to EventSource
```

Do not invent settings if unnecessary.

## 11.4 Current pricing models

As of 2026, CloudFront may have both:

```text
pay-as-you-go
flat-rate plans
```

Research both.

Specifically verify current:

```text
Free / Pro / Business / Premium plan pricing
data-transfer allowances
request allowances
private VPC-origin availability by tier
included WAF/DDoS/Route53/CloudWatch/S3 credits
no-overage semantics
eligibility limitations
unsupported features
whether the chosen Live Match Centre configuration qualifies
```

Do not reuse a 2025 CloudFront cost model without checking current plans.

If a current flat-rate plan materially changes the budget analysis:

```text
record it as NEW EVIDENCE
```

Do not silently modify the production architecture.

---

# 12. Required S3 verification

Verify current official facts needed for:

```text
Next.js static export hosting behind CloudFront
private S3 origin / Origin Access Control if selected
storage pricing
request pricing
data transfer interaction with CloudFront
versioned/static release behavior if relied upon
```

Do not use S3 website hosting if the architecture requires a private bucket unless explicitly justified.

---

# 13. Required API Gateway verification

Verify current HTTP API support for the selected ingress pattern:

```text
HTTP API
AWS service integration / SQS SendMessage integration
request mapping needed for:
    MessageBody
    MessageGroupId
    optional deduplication fields
payload limits
timeouts
route throttling/account quotas relevant to ~50 events/s
pricing
```

Critical architecture question:

```text
Can API Gateway durably enqueue directly to SQS FIFO without an ingest Lambda
under the selected current API type?
```

Answer from current official AWS docs.

If no:

```text
record architecture conflict
do not patch architecture during M3.
```

Provider authentication is unknown.

Do not invent:

```text
HMAC
API key
OAuth
mTLS
```

as an assignment fact.

State the production design must adapt to the real provider contract.

---

# 14. Required SQS FIFO verification

Verify:

```text
ordering scope
message-group semantics
parallelism across match groups
deduplication semantics
exactly-once-processing marketing language vs actual consumer/idempotency requirement
visibility/retry behavior
Lambda FIFO event-source interaction
current throughput quotas
high-throughput FIFO if relevant
pricing
payload size
retention if relevant
```

Important:

```text
SQS FIFO serialization != provider semantic event order.
```

Preserve that distinction.

At ~50 events/s, verify rather than assume that throughput is comfortably below current limits.

---

# 15. Required Lambda verification

Verify current facts relevant to the canonical processor:

```text
SQS FIFO event-source behavior
per-message-group concurrency
failure/retry semantics
partial batch response if used/needed
DynamoDB transaction calls
VPC attachment needed to publish to private NLB
current Lambda pricing
request pricing
duration pricing
architecture choice if price-dependent
provisioned concurrency only if actually required
```

Do not add provisioned concurrency simply because it exists.

At ~10/s steady / ~50/s burst, quantify whether Lambda compute is material.

---

# 16. Required DynamoDB verification

Verify current:

```text
TransactWriteItems semantics
conditional writes
idempotency pattern feasibility
strongly consistent reads where relevant
transactional limits
item size limit
on-demand vs provisioned pricing
storage pricing
backup/PITR only if actually selected
DynamoDB Streams only if actually selected
```

The architecture needs DynamoDB for canonical truth.

Do not add unused features to the cost ledger.

---

# 17. Required NLB verification

Verify:

```text
private/internal Network Load Balancer support
CloudFront VPC-origin compatibility
target group health checks
deregistration/connection termination behavior
long-lived TCP/SSE connection behavior
cross-zone settings/cost implications
current NLB pricing dimensions
NLCU rules
data processing charges
```

The selected architecture relies on NLB draining and stable origin behavior for live deploys.

Do not claim "zero viewer impact" purely from NLB documentation.

It remains a design argument until production validation.

---

# 18. Required EC2 Auto Scaling verification

Verify current:

```text
Auto Scaling Group/Instance Refresh behavior
health checks
minimum healthy percentage
instance warm-up
connection draining interaction with NLB
EC2 on-demand pricing
EBS pricing
data transfer
whether Auto Scaling itself has a direct charge
```

Do not choose final Nchan fleet size before M3/M4.

Build the cost model as a parameter:

```text
N_NCHAN_NODES
```

Include candidate node-count sensitivity.

---

# 19. Required ElastiCache Redis OSS verification

Verify current official facts:

```text
Redis OSS 7.1 availability/support
node-based deployment
Multi-AZ
automatic failover
replica behavior
current supported node types
on-demand pricing
reserved pricing only as optional sensitivity
data transfer/cross-AZ implications
backup cost only if selected
```

Also verify the current status of:

```text
Redis OSS licensing/version assumptions
Nchan documented Redis compatibility
```

Do not switch to Valkey solely because it is cheaper without a compatibility decision.

If current AWS availability makes Redis OSS 7.1 unsuitable/deprecated:

```text
record architecture conflict for M4.
```

---

# 20. Required Next.js verification

Use current Next.js official docs to verify:

```text
App Router static export support
configuration needed
limitations of static export
whether the selected stable query-string match route is compatible
client-side EventSource usage
what must be a client component
```

Do not build the frontend.

This is evidence for the proposal, not implementation work.

---

# 21. Required security/edge verification

Verify only what current architecture uses.

At minimum:

```text
CloudFront public edge
private NLB origin
Shield Standard current inclusion/cost
CloudFront flat-rate plan WAF inclusion if considering that pricing plan
provider ingress throttling
TLS certificate cost/ACM behavior if relevant
Route 53 cost/inclusion
```

Do not add WAF to baseline just because a plan includes it.

If a flat-rate CloudFront plan includes WAF:

```text
distinguish "included by pricing plan" from "architecture requires custom WAF rules".
```

---

# 22. Required observability verification

The final proposal should mention proportionate observability.

Determine minimal production observability and its cost:

```text
CloudWatch metrics
CloudWatch logs
alarms
Nchan instance/system metrics
Lambda errors/age/iterator-equivalent queue metrics
SQS queue depth/age
DynamoDB errors/throttling
NLB target health
CloudFront errors
application sequence/correctness metrics
end-to-end timestamp instrumentation strategy
```

Do not build the monitoring stack.

Include material log/metric cost or explicitly bound it.

If CloudFront flat-rate plan includes log ingestion:

```text
account for that accurately.
```

---

# 23. Network/supporting-infrastructure audit

A valid cost model cannot omit necessary support infrastructure.

Explicitly determine whether the production design needs/costs:

```text
VPC
subnets across AZs
Internet Gateway
NAT Gateway
VPC endpoints
DynamoDB gateway endpoint
SQS interface endpoint if Lambda needs it
CloudWatch connectivity if relevant
security groups
Route 53
ACM
EBS
Elastic IPs
public IPv4 address charges if any selected component actually uses public IPv4
cross-AZ data transfer
CloudFront-to-origin transfer
Lambda-to-NLB transfer
Redis replication transfer
backups/snapshots if selected
```

Prefer a simpler design that avoids NAT if technically valid.

Do not merely omit NAT cost.

State:

```text
NAT not required because ...
```

or:

```text
NAT required; cost included.
```

---

# 24. M5.2 — parameterized cost model

Create:

```text
internal_docs/M5_PARAMETRIC_COST_MODEL.md
```

Use current official prices.

State:

```text
currency
pricing date
AWS region(s)
tax excluded/included
on-demand vs reserved assumptions
30-day / 730-hour convention if used
```

Do not use unsupported precision.

---

# 25. Cost model — fixed assignment inputs

Use as assignment facts:

```text
100,000 concurrent viewers at peak
8 matches
~10 events/s total steady
~50 events/s total burst
+40,000 viewers in 120s
~60% EU / ~40% NA
<= $3,000/month
```

Do not invent:

```text
number of matches per month
peak viewer-hours/month
average event payload size
average viewer session duration
percentage of viewers in lobby vs match
monthly burst duration
average active viewer concurrency
```

These must be planning assumptions or sensitivity variables.

---

# 26. Cost model — viewer delivery rate

Do **not** incorrectly multiply:

```text
10 global events/s * 100,000 viewers
```

unless every viewer actually subscribes to every event.

The selected UI has:

```text
match viewers subscribed to their match channel
lobby viewers subscribed to the lobby state channel
```

Derive a defensible average per-viewer event rate from:

```text
8-match distribution assumption
event distribution across matches
lobby subscription assumption
hot-match sensitivity
```

Use sensitivity ranges.

Label them planning assumptions.

---

# 27. Cost model — payload size

The assignment does not give bytes/event.

Derive a defensible input using one or more of:

```text
static inspection of current synthetic event schema
representative JSON/SSE serialization size
small/typical/large payload sensitivity
```

This static analysis is allowed during M3.

Do not run the load test.

Label:

```text
synthetic POC payload size != real provider payload size
```

Include SSE framing overhead where material.

---

# 28. Cost model — peak viewer-hours

The assignment says:

```text
<= $3,000/month at peak
```

but does not specify how long 100,000 viewers remain at peak.

Do not invent a single monthly usage fact.

Build a sensitivity table.

At minimum analyze:

```text
peak viewer-hours/month
30
60
120
240
720/730
```

or another clearly justified range.

Also calculate:

```text
maximum peak viewer-hours/month supportable under $3,000
for each relevant CloudFront pricing model
```

if the cost structure allows it.

---

# 29. CloudFront cost alternatives

Current 2026 research must compare at least:

```text
CloudFront pay-as-you-go
CloudFront flat-rate plan(s) compatible with private VPC origins
```

Verify current plan feature eligibility.

Do not compare plan names/prices from memory.

For each viable plan:

```text
fixed monthly fee
included transfer
included requests
included WAF/DDoS/DNS/logging/S3 credits
usage allowance implications
private origin support
whether workload is eligible
what happens beyond allowance
```

Do not assume "no overage" means unlimited performance.


## 29.1 SSE request-count model

Do not confuse SSE events with CloudFront HTTP requests.

For a long-lived EventSource connection:

```text
one initial EventSource connection ~= one viewer request
reconnect/resume creates another request
each SSE event delivered over that open response is NOT a new CloudFront viewer request
```

Verify this against current billing semantics rather than assuming it.

Model request count from variables such as:

```text
viewer sessions / month
initial connections
reconnects per viewer-session
lobby-to-match navigation if it opens a second stream
CloudFront health/origin behavior only where billable
```

Because the assignment does not give session count or reconnect rate:

```text
use sensitivity variables.
```

Flat-rate plan request allowances must be compared to **connection/request volume**, not fan-out event count.

## 29.2 CloudFront transfer model

CloudFront delivery bytes are driven by:

```text
viewer-hours
x delivered events/viewer/sec
x serialized SSE bytes/event
```

plus:

```text
heartbeats/pings
HTTP/TLS framing only if materially billable/estimable
history replay bytes for late joins/reconnects
static frontend assets
```

Do not exaggerate protocol overhead with invented constants.

---

# 30. Cost model — compute/fan-out fleet and NLB flows

Because M3/M4 may determine final Nchan fleet size, model:

```text
N_NCHAN_NODES
```

Use a table such as:

```text
2 nodes
3 nodes
4 nodes
6 nodes
8 nodes
```

or node shapes that current architecture could plausibly use.

Do not claim any candidate is final.

For each:

```text
EC2 node cost
EBS
Redis
other fixed costs
capacity mapping placeholder
```

Model NLB separately from EC2 node count using its current billing dimensions.

For NLB, derive sensitivity for whatever current pricing actually meters, such as:

```text
new connections / flows
active flows / connection duration
processed bytes
TLS dimensions if TLS terminates there
minimum NLCU/NLCU-hour rules
cross-zone behavior
```

Long-lived SSE changes the balance between:

```text
new connection rate
active connections
processed bytes
```

so do not price NLB from request count alone.

M4 will choose final fleet sizing only after M3.

---

# 31. Cost model — complete line-item ledger

Include every material selected component:

```text
CloudFront
S3
API Gateway HTTP API
SQS FIFO
Lambda
DynamoDB
NLB
EC2
EBS
ElastiCache Redis OSS
CloudWatch
Route 53
ACM if charged
VPC endpoints
NAT if required
data transfer
cross-AZ transfer
backup/storage if selected
```

For each line:

```text
unit price
unit
source
date
assumption/input
formula
monthly cost
evidence classification
```

---

# 32. Budget verdict discipline

Do not produce one false-precision sentence.

Produce:

```text
fixed monthly capacity cost
variable viewer-delivery cost
variable ingest/state cost
sensitivity range
break-even under $3,000
dominant cost driver
```

Then classify:

```text
clearly within budget under stated assumptions
conditionally within budget
clearly outside budget
cannot determine because a material variable is missing
```

If current evidence shows the selected architecture cannot plausibly satisfy the budget:

```text
record an M4 architecture blocker.
```

Do not rewrite the architecture while M3 is running.

---

# 33. M5.3 — POC-to-production mapping framework only

Create a section in the M5 evidence ledger with placeholders:

```text
MEASURED LOCALLY:
    <fill after M3>

PRODUCTION INFERENCE:
    architecture mapping independent of result

NOT MEASURED:
    browser rendering
    real Internet transit
    EU/NA regional latency
    real provider semantics
    AWS managed-service latency
    real deploy continuity
    real cost traffic distribution

DEPENDENT ON M3:
    final Nchan capacity/fleet conclusion
    final delivery-layer support/rejection
```

Do not fill M3 measurements.

---

# 34. M5.4 — geographic reasoning

This is parallelizable as design reasoning.

The assignment says:

```text
~60% Europe
~40% North America
```

Determine whether current architecture explicitly selects an AWS origin region.

If it does:

```text
verify current rationale and pricing.
```

If it does not:

```text
do not silently invent a final region.
```

Prepare a bounded comparison such as:

```text
EU primary origin + CloudFront
US primary origin + CloudFront
multi-region origin
```

Evaluate:

```text
latency inference
cost
state consistency
operational complexity
failure modes
CloudFront edge role
cross-region traffic
budget
```

A local M3 result does not measure geography.

Do not fabricate regional p95.

If one region clearly dominates current architecture constraints independently of M3:

```text
record recommendation as provisional M5 evidence for M4.
```

---

# 35. M5.5 — provider semantics boundary

Prepare final proposal-ready reasoning:

Assignment gives:

```text
best-effort feed
no long retry window
score/clock derived from feed
```

Assignment does NOT give:

```text
provider event ID
provider sequence
provider replay
provider history endpoint
correction/cancellation semantics
idempotency guarantees
redelivery guarantees
authentication method
schema
```

The architecture may process accepted provider events correctly.

It cannot recover an event the provider never delivers unless a real recovery source exists.

Prepare:

```text
least-trusted overall assumption
what validation is needed before production
what changes if provider identity/order semantics are insufficient
what changes if provider has a recovery/history API
```

Do not invent a second provider.

---

# 36. M6 — prepare proposal draft without M3 conclusion

Do not create final:

```text
proposal.md
```

while M3 is unresolved.

Create:

```text
internal_docs/M6_PROPOSAL_PRE_M3_DRAFT.md
```

It must be usable as the base for final `proposal.md` after M4.

---

# 37. M6 word budget

Final proposal max:

```text
1,500 words
diagrams excluded
```

Target the pre-M3 draft at roughly:

```text
1,050–1,250 words
```

leaving room for:

```text
M3 result
M4 reconciliation
final M5 cost conclusion
small edits
```

Do not fill all 1,500 words before M3.

Include a counted word budget by section.

---

# 38. M6 required proposal sections

Draft concise content for:

## 38.1 System overview

```text
feed -> durable ingest -> canonical state -> fan-out/history -> CloudFront -> Next.js
```

## 38.2 Provider boundary

```text
best-effort limitation
unknown semantics
least-trusted assumption
```

## 38.3 Ingest and canonical correctness

Explain:

```text
API Gateway
SQS FIFO by match
Lambda canonical processor
DynamoDB transaction/idempotency/state
```

Do not claim SQS creates provider semantic order.

## 38.4 Fan-out/history

Explain:

```text
Nchan
Redis shared store
SSE
active-match buffered history
Last-Event-ID transport resume
browser canonical_seq reducer
DynamoDB as rebuildable canonical truth
```

## 38.5 Lobby

Explain complete latest-state lobby channel.

## 38.6 Scale/surge

Explain:

```text
100k
+40k / 2min
ASG/NLB/CloudFront
M3 capacity result placeholder
```

## 38.7 Latency

Separate:

```text
assignment end-to-end p95
POC delivery-layer sub-budget
network/browser unmeasured
```

## 38.8 Geography

Use M5 reasoning.

Do not invent measured EU/NA latency.

## 38.9 Deploy/recovery

Explain:

```text
ASG Instance Refresh
NLB drain
shared Redis history
EventSource reconnect/resume
DynamoDB rebuild path
```

Do not call local Nchan restart proof equal to zero-downtime AWS deployment.

## 38.10 Frontend

Explain:

```text
Next.js App Router static export
S3 + CloudFront
small client component
EventSource
canonical_seq reducer
preserve current UI during reconnect
```

No frontend implementation.

## 38.11 Security/observability

Keep proportionate.

## 38.12 Cost

Use M5 parametric model.

If fleet size is M3-dependent:

```text
leave exact final total provisional.
```

## 38.13 Alternatives/tradeoffs

Include only important alternatives:

```text
SSE vs WebSockets
Nchan vs custom/managed fan-out
Nchan buffered history vs separate replay/snapshot path
Redis shared Nchan store vs per-node history
AWS vs strongest credible alternative
```

## 38.14 POC

Prewrite only:

```text
least-trusted overall assumption
why it cannot be directly tested
riskiest locally testable assumption
method
```

Leave:

```text
result
architecture impact
```

as explicit placeholders.

---

# 39. M6 diagram

Prepare one concise Mermaid or ASCII diagram.

It must show the full stack:

```text
provider
API Gateway
SQS FIFO
Lambda
DynamoDB
private publish path
NLB
Nchan ASG
ElastiCache Redis
CloudFront
S3/Next.js
fan
```

Diagram should make:

```text
canonical truth
delivery store
history/live path
public/private boundaries
```

clear.

Do not create decorative architecture complexity.

---

# 40. M6 unsupported-claim audit

For every sentence in the draft, classify internally:

```text
assignment fact
current official fact
architecture decision
planning assumption
local POC fact already known
M3-dependent placeholder
production inference
```

Remove:

```text
"guarantees"
"will always"
"proves"
"zero downtime"
"global p95"
```

unless evidence truly supports the wording.

---

# 41. M7 — prepare README draft without M3 result

Do not create final:

```text
README.md
```

Create:

```text
internal_docs/M7_README_PRE_M3_DRAFT.md
```

---

# 42. M7 Part A — run instructions scaffold

Prepare:

```text
prerequisite: container runtime only
working directory
one command
what containers start
where measured result appears
how exit code/result is interpreted
cleanup command if needed
qualifying vs portable smoke distinction if retained
```

But:

```text
DO NOT freeze a final run command if M3 changes the launcher for ZIP/no-.git reproducibility.
```

Mark the command:

```text
VERIFY AGAINST FINAL M3 SOURCE BEFORE FINAL README
```

Do not state an expected runtime unless measured/known defensibly.

---

# 43. M7 Part B — <=300-word POC write-up scaffold

The <=300-word write-up must cover exactly:

```text
assumption
method
result
what it changes in proposal
```

Prewrite only content independent of M3:

## Assumption

Include:

```text
real least-trusted provider semantics is not locally testable
local test targets Nchan/Redis/SSE delivery/history/capacity
```

## Method

Can describe the frozen method:

```text
simulated feed
8 matches
assignment-mapped rates
100k target
+40k/120s surge
replay/reconnect/restart/slow-client checks
repeated coordinated runs
```

Do not write measured values.

## Result

Use placeholder:

```text
<M3_RESULT_AND_DECISIVE_VALUES>
```

## Proposal change

Use placeholder:

```text
<M4_ARCHITECTURE_RECONCILIATION>
```

Keep the prewritten assumption+method concise enough that result+impact can fit within 300 words.

Count the current draft words.

---

# 44. M7 Part C — AI process

Draft factual language.

It must say AI was directed to:

```text
preserve assignment requirements
separate fact/assumption/measurement/inference
not move POC criteria after measurement
use current primary sources
keep POC small
audit math
surface failed/inconclusive evidence
keep candidate responsible
```

Do not say AI did work it did not do.

Prepare a placeholder list of instruction artifacts actually used.

At minimum inspect existing provenance for:

```text
AGENTS.md
M2 prompt artifact
M3 execution prompt if actually used
this parallel prompt if actually used
```

The final package must contain every instruction artifact actually used.

---

# 45. M8 — number audit

Create:

```text
internal_docs/M8_PRE_M3_EXPLAINABILITY_AUDIT.md
```

Build a number ledger.

For each material number currently expected in final proposal/README, record:

```text
number
unit
meaning
classification:
    ASSIGNMENT_FACT
    OFFICIAL_CURRENT_FACT
    CALCULATION
    PLANNING_ASSUMPTION
    POC_MEASUREMENT
    PRODUCTION_INFERENCE
source
formula if calculated
date if current external fact
whether M3-dependent
```

---

# 46. M8 number audit — mandatory items

Audit at least:

```text
8 matches
10 events/s
50 events/s burst
100k viewers
+40k / 120s
60/40 geography
2s goal p95
5s other-event p95
2s history
$3,000/month

Nchan fleet node count placeholder
EC2 instance type/prices
Redis node type/prices
NLB price
CloudFront plan/transfer price
S3
API Gateway
SQS
Lambda
DynamoDB
CloudWatch
Route53
VPC/networking

event payload size assumptions
viewer event-rate assumptions
peak viewer-hours assumptions
cross-AZ assumptions
```

Do not carry old false `ASSIGNMENT_FACT` labels forward.

Examples of experiment choices that are NOT assignment facts:

```text
5% slow-client cohort
80% hot-match burst concentration
500ms fan-out sub-budget
3 campaign runs
seed 42
15% CV threshold
```

---

# 47. M8 decision audit

Prepare concise, candidate-explainable answers:

```text
Why SSE instead of WebSockets?
Why Nchan instead of custom gateway?
Why not managed per-message fan-out?
Why Redis shared Nchan store?
Why DynamoDB is still canonical truth?
Why no separate replay API in normal active-match path?
Why CloudFront?
Why NLB?
Why EC2 ASG rather than ECS?
Why one Lambda?
Why SQS FIFO?
Why static Next.js?
Why no baseline WAF?
Why this geographic strategy?
Why this POC?
Why is provider semantics still the weakest assumption?
What happens if provider semantics are insufficient?
What happens if M3 ACCEPTS?
What happens if M3 REJECTS?
What happens if M3 is INCONCLUSIVE?
Why is the cost model credible?
```

Keep each answer short enough for interview/reviewer defense.

---

# 48. M8 static consistency audit

Without running the POC, compare:

```text
requirement.pdf / embedded assignment
AGENTS.md
minimum architecture
active architecture contract
M5 evidence ledger
M5 cost model
M6 pre-M3 proposal draft
M7 pre-M3 README draft
POC contract v2.0.5 where relevant
AI instruction provenance
```

Flag contradictions.

Do not "resolve" an M3-dependent conflict by guessing the M3 result.

---

# 49. M8 source freshness audit

For every mutable external claim:

```text
AWS capability
AWS price
AWS quota
Next.js behavior
Nchan behavior
```

record:

```text
source
date
freshness
whether primary
whether final proposal depends on it
```

Old research can be retained as history but not as current evidence.

---

# 50. M8 reproducibility prep / conditional clean-room execution

Checklist:

```text
final extracted ZIP-like environment
no .git assumption
container runtime only
no Node/npm host dependency
no credentials
no cloud account
no hidden service
one command
fresh containers
no generated artifacts required
```

## 50.1 Same host as M3

If this parallel task shares the physical/VM/Docker host, network namespace, Docker daemon, CPU/memory,
or storage with the qualifying M3 run:

```text
DO NOT execute the clean-room POC test now.
```

Perform static inspection only and defer runtime verification.

## 50.2 Completely separate host

If a completely separate machine/VM with a separate Docker daemon and no shared benchmark resources is
available, the clean-room run is safely parallelizable.

Then:

1. create an extracted ZIP-like copy with no `.git`;
2. ensure only a container runtime is installed/required;
3. execute the documented current one-command path;
4. record whether it starts/builds/runs without hidden files or host Node/npm;
5. treat it as **reproducibility validation only**, not M3 qualifying performance evidence;
6. do not import its performance numbers into M3;
7. record source SHA and environment;
8. if it exposes a reproducibility defect, record the defect for post-M3/M2 integration.

If M3 is independently modifying the launcher for the same defect, do not race to merge parallel fixes.

## 50.3 Static defect rule

If static inspection already proves a reproducibility defect:

```text
record it for M3/M2 integration.
```

Do not edit the M3 `poc/` checkout while M3 is running.

---

# 51. M9 — non-destructive POC cleanup inventory

Create:

```text
internal_docs/M9_POC_CLEANUP_MANIFEST_PRE_M3.md
```

Inspect every file/directory under `poc/`.

Classify:

```text
KEEP_FINAL
REMOVE_AFTER_M3
VERIFY_AFTER_M3
GENERATED_NEVER_SHIP
INTERNAL_DOC_NOT_POC_CODE
```

Do not delete anything.

---

# 52. M9 cleanup criteria

Final `poc/` should contain only source/config required for reproducibility.

Potential final-keep categories:

```text
compose/config
runner source
Dockerfiles
package.json
package-lock.json
tsconfig
Nchan config
scripts required by one-command run
```

Potential remove categories:

```text
node_modules
dist
build
coverage
logs
JSON benchmark output
temporary files
cache
IDE files
OS junk
Docker evidence exports
scratch scripts
internal audit reports not needed to run the POC
```

Special review:

```text
poc/internal_docs/
```

The assignment asks for POC code, not a hidden archive of internal research.

Do not remove it now.

Mark whether it should be excluded from final `poc/`.

---

# 53. M9 agent-instruction placement

Agent instruction files actually used belong in the final ZIP as instruction artifacts.

Do not hide required instruction artifacts inside:

```text
poc/internal_docs
```

Prepare a final-placement plan.

Do not move files while M3 is running.

---

# 54. M10 — submission manifest precheck

Create:

```text
internal_docs/M10_FINAL_SUBMISSION_MANIFEST_PRE_M3.md
```

No final ZIP yet.

The manifest must target:

```text
proposal.md
README.md
poc/
AGENTS.md
<other agent instruction files actually used>
```

Nothing else.

---

# 55. M10 explicit exclusion list

The final ZIP should not include merely because it exists in the repo:

```text
requirement.pdf
EQC-AC architecture contract
minimum architecture internal doc
third-party research
M2 gap reports
M3 raw evidence
M5 source ledger
M5 cost scratch/ledger
M4 templates
M6 internal draft
M7 internal draft
M8 audit
M9 manifest
M10 manifest
chat exports
generated benchmark JSON
logs
git metadata
```

Unless a file is an **agent instruction file actually used**, internal working documents are not final deliverables.

---

# 56. M10 agent-instruction inventory

Read:

```text
internal_docs/AI_INSTRUCTION_PROVENANCE.md
```

Prepare:

```text
USED -> MUST SHIP
NOT USED -> DO NOT SHIP MERELY BECAUSE IT EXISTS
UNCLEAR -> RESOLVE BEFORE FINAL ZIP
```

This prompt, if fed to this LLM, is:

```text
USED
```

and therefore must be preserved as an instruction artifact for eventual delivery.

Do not forget it.

---

# 57. M10 final-package invariants

Prepare checks for later:

```text
proposal.md <=1500 words excluding diagrams
README POC write-up <=300 words
README has one-command instructions
README has AI-process sentences
POC runs with container runtime only
no cloud account
POC simulates feed
no full product code
poc/ has nothing generated
every used instruction artifact included
no unrequested internal docs
all numbers defensible
M3 measured values exactly match preserved evidence
proposal impact exactly matches M4
```

Do not execute final package build before M3/M4/M6/M7/M8/M9 complete.

---

# 58. Parallel work status artifact

Maintain:

```text
internal_docs/PARALLEL_M3_WORK_STATUS.md
```

Use a table:

| Workstream | Parallel task | Status | Artifact | Remaining dependency |
|---|---|---|---|---|

Allowed statuses:

```text
DONE_PARALLEL
PARTIAL_M3_DEPENDENT
BLOCKED_BY_M3
BLOCKED_BY_M4
ARCHITECTURE_CONFLICT_FOUND
```

Do not write `DONE` for an entire milestone if its completion gate requires M3/M4.

---

# 59. Web-research discipline

When researching current capabilities/pricing:

```text
search the live web
prefer official primary sources
use publication/update dates
record retrieval date
compare current facts to old internal assumptions
```

If an official price page is dynamic/region-selective:

```text
record region and selected pricing mode
```

If exact current rate cannot be reliably retrieved:

```text
state unresolved
do not invent a number
```

Do not use stale memory.

---

# 60. Calculation discipline

Every cost formula must be reproducible.

Show formulas.

Examples:

```text
fixed EC2 monthly =
    nodes * hourly_rate * assumed_month_hours

viewer egress bytes =
    viewer_hours * 3600
    * events_per_viewer_per_second
    * bytes_per_delivered_event

monthly viewer transfer GB =
    bytes / 1e9
```

If AWS bills GiB rather than GB for a line item, use the correct billing unit.

Do not mix decimal and binary units silently.

---

# 61. Sensitivity discipline

Because the assignment omits major monthly-usage variables, sensitivity is mandatory.

At minimum vary:

```text
peak viewer-hours
payload size
events/viewer/sec
Nchan node count
AWS region if material
CloudFront pricing model
```

Identify:

```text
dominant variable
budget break-even
conditions under which <=$3k is met
conditions under which it fails
```

---

# 62. Architecture-conflict handling

Parallel work may discover:

```text
current AWS feature no longer supports assumed architecture
cost exceeds budget
selected Redis version unavailable
private-origin behavior incompatible
direct API Gateway->SQS integration assumption wrong
Next.js static export assumption wrong
another current fact invalidates design
```

If so:

1. verify from a second official/current source if possible;
2. record exact conflict;
3. record architecture components affected;
4. record plausible alternatives;
5. do not edit M3 POC;
6. do not silently replace production architecture;
7. set workstream status:

```text
ARCHITECTURE_CONFLICT_FOUND
```

8. hand conflict to M4 after M3.

A genuine assignment violation must not be hidden to preserve sunk work.

---


# 62.1 If M3 finishes while this parallel task is still running

Do not silently broaden this prompt into the M4 execution prompt.

If M3 completes and its result becomes available:

```text
finish the already-safe parallel work
record that M3 evidence is now available
do NOT merge/rebase the M3 checkout
do NOT fill result-dependent placeholders unless explicitly instructed in a new M4 task
```

Reason:

```text
this prompt's audit/stopping condition is about work independently safe during M3.
M4 result reconciliation is a separate evidence-dependent step.
```

This keeps the parallel branch clean and prevents accidental interpretation of an incomplete/unverified M3 artifact.


# 63. Branch/worktree integration rule

Parallel docs may be committed only in the isolated parallel branch if the environment permits.

Do not merge.

At the end:

```text
record parallel branch name
record final parallel commit SHA
record files created/changed
record whether main advanced during M3
record expected post-M3 rebase/merge conflicts
```

If M3 creates a newer canonical POC/launcher state:

```text
rebase/reconcile after M3
not during the benchmark.
```

---

# 64. Mandatory final audit pass A — assignment coverage

Create a matrix with every original assignment obligation.

For each, mark:

```text
already handled
parallel evidence completed
M3-dependent
M4-dependent
final-draft-dependent
final-package-dependent
```

There must be no:

```text
UNMAPPED
```

row.

Assignment items include:

```text
full production design
feed -> fan screen
decisions/options
riskiest assumption
small measured POC
local one command
container runtime only
no cloud
simulated feed
<=300-word POC write-up
<=1500-word proposal
anonymous/read-only
lobby
late join/reload/wake
correct score/history
no dup/loss/order
2s/5s latency
100k
40k/2min
60/40 geo
$3k
live deploy
Next.js
AWS preference
AI disclosure
all used instruction files
ZIP-only contents
nothing generated in poc/
explain every number/decision
```

---

# 65. Mandatory final audit pass B — parallelizability

For every unfinished task in M4–M10 ask:

```text
Can this be completed without knowing M3 verdict or measured values?
Can it be completed without changing M3 source?
Can it be completed without consuming M3 benchmark resources?
Can it be completed without prematurely finalizing architecture?
```

If YES:

```text
do it now.
```

If NO:

```text
record exact dependency.
```

This is the key stopping-condition audit.

---

# 66. Mandatory final audit pass C — current-source completeness

Check the evidence ledger includes all selected production components:

```text
CloudFront
S3
API Gateway
SQS FIFO
Lambda
DynamoDB
NLB
EC2/ASG
ElastiCache Redis OSS
Next.js
Nchan
CloudWatch
Route53/ACM
VPC/network support
```

If a component influences:

```text
correctness
latency
cost
deploy/recovery
security
```

and has a mutable external fact:

```text
verify it.
```

---

# 67. Mandatory final audit pass D — cost completeness

Check:

```text
no selected infrastructure omitted
no duplicated cost
no old CloudFront model used without checking flat-rate
CloudFront SSE request count modeled as connection/reconnect requests, not per-event requests
CloudFront transfer includes history/reconnect/heartbeat sensitivity where material
no global ingest rate mistakenly multiplied to every viewer
payload size explicit
viewer-hours explicit
fleet size parameterized
NLB long-lived flow/processed-byte billing dimensions modeled
network charges considered
observability considered
fixed vs variable cost separated
budget break-even shown
currency/region/date shown
```

If any fail:

```text
repair cost model.
```

---

# 68. Mandatory final audit pass E — draft safety

Review M6/M7 drafts under hypothetical outcomes:

```text
M3 ACCEPT
M3 REJECT
M3 INCONCLUSIVE
```

The pre-M3 drafts must remain truthful under all three.

If any sentence becomes false merely because M3 is unfavorable:

```text
rewrite it as a placeholder/provisional statement.
```

---

# 69. Mandatory final audit pass F — evidence-level honesty

Search drafts for claims that confuse:

```text
assignment fact
official current fact
planning assumption
calculation
POC measurement
production inference
```

No category promotion is allowed.

Especially forbid:

```text
local fan-out p95 = ingest-to-screen p95
local restart = AWS deploy proof
synthetic payload = provider payload fact
CloudFront edge = measured regional p95
100k target success = proven capacity headroom
provider best-effort = provider replay
```

---

# 70. Mandatory final audit pass G — AI provenance

Check:

```text
AGENTS.md used?
M2 prompt used?
M3 prompt used?
this parallel prompt used?
other coding-agent prompts used?
```

For each used instruction artifact:

```text
exact copy preserved
hash recorded
final ZIP inclusion planned
```

No used prompt may disappear simply because it is internal-looking.

---

# 71. Mandatory final audit pass H — POC non-interference

Before stopping, confirm:

```text
parallel work did not modify M3 checkout
parallel work did not change poc/ in M3 checkout
parallel work did not consume Docker resources
parallel work did not delete evidence
parallel work did not change thresholds
parallel work did not change source SHA under test
parallel work did not merge to main
```

If any occurred:

```text
surface immediately as possible M3 contamination.
```

Do not hide it.

---

# 72. Mandatory final audit pass I — final deliverable preparation

Ensure the parallel work has prepared enough that after M3/M4 only dependent filling remains.

Expected prepared artifacts:

```text
M4_POST_M3_RECONCILIATION_TEMPLATE.md
M5_CURRENT_EXTERNAL_EVIDENCE_LEDGER.md
M5_PARAMETRIC_COST_MODEL.md
M6_PROPOSAL_PRE_M3_DRAFT.md
M7_README_PRE_M3_DRAFT.md
M8_PRE_M3_EXPLAINABILITY_AUDIT.md
M9_POC_CLEANUP_MANIFEST_PRE_M3.md
M10_FINAL_SUBMISSION_MANIFEST_PRE_M3.md
PARALLEL_M3_WORK_STATUS.md
AI_INSTRUCTION_PROVENANCE.md update on isolated branch
exact preserved copy of this prompt
```

If one is unnecessary because equivalent material is consolidated elsewhere:

```text
explicitly map the equivalent artifact.
```

Do not create duplicate docs for cosmetics.

---

# 73. Zero-gap stopping condition

You may stop only when all are true:

## Safety

```text
[ ] M3 checkout untouched
[ ] no benchmark resource interference
[ ] parallel workspace isolated
[ ] no main merge
```

## M4 preparation

```text
[ ] ACCEPT reconciliation framework prepared
[ ] REJECT framework prepared
[ ] INCONCLUSIVE framework prepared
[ ] M5-independent architecture conflict path prepared
```

## M5

```text
[ ] all selected AWS capabilities freshly verified
[ ] Next.js facts freshly verified
[ ] Nchan/Redis external dependency facts verified as needed
[ ] current pricing sourced
[ ] 2026 CloudFront pricing models compared
[ ] support networking cost audited
[ ] parameterized cost model complete
[ ] viewer-hours sensitivity complete
[ ] payload sensitivity complete
[ ] event-rate sensitivity complete
[ ] fleet-size sensitivity complete
[ ] $3k break-even/conditions clear
[ ] geographic reasoning prepared
[ ] provider semantics boundary prepared
[ ] only M3-dependent POC mapping remains blank
```

## M6

```text
[ ] pre-M3 proposal draft complete
[ ] word budget leaves M3/M4 room
[ ] full-stack diagram prepared
[ ] no final M3 outcome claimed
[ ] no unsupported performance certainty
```

## M7

```text
[ ] README scaffold prepared
[ ] <=300-word structure prepared
[ ] assumption/method section prepared
[ ] result placeholder remains
[ ] proposal-impact placeholder remains
[ ] AI process text drafted
[ ] final run command flagged for post-M3 verification
```

## M8

```text
[ ] number ledger complete for independent facts
[ ] decision audit complete
[ ] static consistency audit complete
[ ] current-source freshness audit complete
[ ] reproducibility checklist prepared
[ ] clean-room runtime test executed on a separate host if one was safely available; otherwise exact dependency recorded
[ ] final M3-dependent consistency checks explicitly deferred
```

## M9

```text
[ ] every poc/ path classified non-destructively
[ ] final-keep candidates identified
[ ] generated/remove-later candidates identified
[ ] no deletion performed
```

## M10

```text
[ ] final ZIP manifest prepared
[ ] exclusion list prepared
[ ] agent instruction inventory prepared
[ ] final package invariants prepared
[ ] no ZIP created
```

## Assignment audit

```text
[ ] every assignment obligation mapped
[ ] zero UNMAPPED obligations
```

## Parallelizability audit

```text
[ ] every unfinished task reviewed
[ ] no remaining task that could safely be completed now
```

Only then report:

```text
PARALLEL WORK COMPLETENESS: 100%

Remaining work is exclusively:
    M3 result/evidence
    M4 reconciliation
    M3-dependent final M5 mapping/fleet conclusion
    final proposal/README integration
    final post-M3 reproducibility/consistency tests
    destructive POC cleanup
    final ZIP
```

---

# 74. Final response format

When the loop genuinely reaches zero parallelizable gaps, respond with:

```text
PARALLEL WORK COMPLETENESS: 100%

M3 STATUS:
not modified by this task

COMPLETED IN PARALLEL:
- M4 reconciliation framework
- M5 current-source evidence
- M5 parameterized cost model
- M5 geography/provider-boundary work
- M6 pre-M3 proposal draft
- M7 pre-M3 README draft
- M8 pre-M3 explainability/source audits
- M9 non-destructive cleanup inventory
- M10 pre-submission manifest
- AI instruction provenance

ARCHITECTURE CONFLICTS FOUND:
<list or NONE>

REMAINING M3/M4-DEPENDENT WORK:
<exact bounded list>

PARALLEL BRANCH/WORKTREE:
<identity>

FILES CREATED/UPDATED:
<list>

DO NOT claim the overall assignment is 100% complete.
```

---

# 75. Final rule

The purpose of parallelism is to save time.

It is **not** permission to:

```text
contaminate M3
guess its result
finalize architecture before evidence
hide a budget conflict
write unsupported claims
or ship internal working material.
```

The parallel agent succeeds only when it has done **everything safe to do now** and nothing that belongs after the qualifying evidence.
