# M4 Post-M3 Architecture Reconciliation Template

**Created:** parallel work while M3 runs
**Purpose:** Pre-built three-branch framework so no reasoning is invented after seeing the M3 result
**Status:** TEMPLATE ONLY — do not fill M3 results here

---

## M5 Interaction

M5 current capability/cost evidence can independently force architecture reconsideration, even if M3 ACCEPTS.

Cost or capability findings from parallel research may create ARCHITECTURE_CONFLICT_FOUND entries that require M4 reconciliation regardless of M3 outcome.

---

## 9.1 ACCEPT Branch

If M3 ACCEPTS, the following questions must be answered with discipline:

### Which exact M3 claims passed?

- [ ] Fan-out p95 ≤ 500ms (POC delivery-layer sub-budget only)
- [ ] Late-join p95 ≤ 2000ms
- [ ] Zero duplicates
- [ ] Zero gaps in canonical sequence
- [ ] Zero order violations
- [ ] Memory Nchan < 7000MB
- [ ] Memory Redis < 1800MB
- [ ] Cross-run CV ≤ 15%

### Which values were locally measured?

- [ ] Fan-out delivery latency (local, single-host)
- [ ] Late-join prefill latency (local, single-host)
- [ ] Memory consumption under synthetic load
- [ ] Reconnect behavior after disconnect
- [ ] Restart/replacement exact-range recovery
- [ ] Slow-consumer backpressure behavior

### Which values remain production inferences?

- [ ] Ingest-to-viewer-screen p95 (assignment 2s/5s targets)
- [ ] EU/NA viewer latency
- [ ] CloudFront edge delivery
- [ ] Cross-AZ Nchan cluster behavior
- [ ] ElastiCache Redis failover under load
- [ ] NLB connection draining during deploys
- [ ] EC2 ASG Instance Refresh viewer impact
- [ ] Provider feed semantics and timing

### Does the result justify retaining Nchan + Redis + SSE?

- [ ] Evidence supports delivery-layer viability at 100k locally
- [ ] No architecture-rejecting failure mode observed
- [ ] Memory envelope within EC2 instance bounds
- [ ] M5 cost model shows budget feasibility

### What production fleet-sizing facts can be inferred?

- [ ] Single-host Nchan handled X concurrent connections
- [ ] Redis memory per connection = approximately Y MB
- [ ] Connection establishment rate: Z connections/second
- [ ] These facts do NOT directly size a multi-node fleet

### What cannot be inferred?

- [ ] Multi-node cluster behavior
- [ ] Cross-AZ latency/throughput
- [ ] CloudFront viewer delivery latency
- [ ] Real provider feed timing/semantics
- [ ] Production deploy/replacement impact

### Does any M5 capability/cost evidence independently invalidate the design?

- [ ] CloudFront VPC origin compatibility verified
- [ ] CloudFront SSE streaming behavior verified
- [ ] API Gateway → SQS FIFO direct integration verified
- [ ] Redis OSS 7.1 availability on ElastiCache verified
- [ ] Cost model within $3,000/month budget
- [ ] No architecture conflict found in M5 research

### Required Wording Discipline

```
M3 ACCEPT != whole production architecture proven
local delivery latency != ingest-to-screen p95
single-host local test != EU/NA Internet proof
synthetic feed != provider semantics proof
100k target success != headroom above 100k
```

---

## 9.2 REJECT Branch

### Which frozen criterion failed?

- [ ] Fan-out p95 > 500ms
- [ ] Late-join p95 > 2000ms
- [ ] Duplicates observed
- [ ] Gaps in canonical sequence
- [ ] Order violations observed
- [ ] Memory Nchan ≥ 7000MB
- [ ] Memory Redis ≥ 1800MB
- [ ] Cross-run CV > 15%
- [ ] Other: _______________

### Was generator/environment valid?

- [ ] Generator produced correct event rates
- [ ] No host resource exhaustion unrelated to DUT
- [ ] No Docker/desktop resource limits triggered
- [ ] No network namespace issues
- [ ] Seeds produced expected behavior
- [ ] Container runtime functioned correctly

### Which architecture dependency does the failure invalidate?

- [ ] Nchan capacity at 100k scale
- [ ] Redis shared-store performance
- [ ] SSE delivery-layer latency
- [ ] History replay correctness
- [ ] Reconnect/resume behavior
- [ ] Slow-consumer handling
- [ ] Restart/replacement recovery
- [ ] Memory envelope
- [ ] Other: _______________

### Failure Classification

- [ ] Nchan capacity
- [ ] History replay
- [ ] Reconnect
- [ ] Slow-client behavior
- [ ] Restart/replacement
- [ ] Resource envelope
- [ ] Latency
- [ ] Correctness
- [ ] Another bounded POC property: _______________

### Alternative Categories (do not preselect a winner)

- [ ] Different Nchan fleet/resource shape
- [ ] Different self-hosted fan-out technology
- [ ] Managed fan-out (e.g., AppSync, PubNub, Pusher)
- [ ] Cloudflare Durable Objects
- [ ] Custom SSE/WebSocket gateway
- [ ] Different history/replay topology
- [ ] Other: _______________

---

## 9.3 INCONCLUSIVE Branch

### Possible Causes

- [ ] Harness invalidity (non-qualifying run)
- [ ] Host resource ceiling (not DUT limit)
- [ ] Generator saturation (not DUT limit)
- [ ] Source-port/FD exhaustion (host limit)
- [ ] Measurement/provenance issue
- [ ] Cross-run instability (high CV but no clear cause)
- [ ] Other environmental limit: _______________

### Required Discipline

Do not call INCONCLUSIVE a failure of the architecture.

INCONCLUSIVE means the POC did not produce a defensible measurement for the tested property. It requires re-execution with a corrected harness, not architecture replacement.

---

## 9.4 Architecture Conflict Path (M5-independent)

If parallel M5 research discovers an architecture conflict (e.g., CloudFront VPC origin not available on selected pricing tier, API Gateway cannot directly enqueue to SQS FIFO, Redis OSS 7.1 deprecated on ElastiCache):

1. Record the conflict with exact source and date
2. Record which architecture components are affected
3. Record plausible alternatives without selecting a winner
4. Record that this conflict exists regardless of M3 outcome
5. Hand to M4 after M3 for reconciliation

Do not patch the architecture during M3.

---

## M3 Result Placeholders

```
M3 VERDICT:              <NOT YET AVAILABLE>
M3 fan-out p95:          <NOT YET AVAILABLE>
M3 late-join p95:        <NOT YET AVAILABLE>
M3 memory Nchan:         <NOT YET AVAILABLE>
M3 memory Redis:         <NOT YET AVAILABLE>
M3 cross-run CV:         <NOT YET AVAILABLE>
M3 campaign runs:        <NOT YET AVAILABLE>
M3 source SHA:           <NOT YET AVAILABLE>
```

---

## Instructions for M4 Execution After M3

1. Fill the M3 result placeholders above with actual measured values
2. Classify the verdict as ACCEPT, REJECT, or INCONCLUSIVE
3. Answer every checked question in the appropriate branch
4. Cross-reference M5 evidence ledger for any architecture conflicts
5. If REJECT: select the most promising alternative category
6. If INCONCLUSIVE: determine whether re-execution or harness fix is needed
7. Produce final fleet-sizing recommendation based on M3 measurements
8. Update final proposal.md to reflect M4 reconciliation
