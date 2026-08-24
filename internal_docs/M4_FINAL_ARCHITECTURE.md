# M4 — Final Production Architecture & Post-M3 Reconciliation

**Status:** DONE (100%)
**Date:** 2026-08-23
**Source of truth:** This is the single M4 reconciliation. It supersedes `LIVE_MATCH_CENTRE_MINIMUM_DEFENSIBLE_ARCHITECTURE.md` (2026-08-19) and the historical one-primary reasoning. **Cost/pricing:** see `M5_PARAMETRIC_COST_MODEL.md` and `M5_CURRENT_EXTERNAL_EVIDENCE_LEDGER.md` — the selected design models to **≈$2,318/month (2026-08-23, eu-west-1), within the $3k budget** (CloudFront Business flat-rate covers base DTO inside the 50 TB cap; conditionally within budget beyond ~440 peak-hours/month). Historical documents are preserved for provenance only.

---

## 1. M3 result (hard-stopped without ACCEPT)

The local experiment (POC) under the frozen contract `EXPERIMENT_CONTRACT_v2.3.0.md` reached its best validated result **F1**:

| Metric | F1 (validated best effort) | Frozen gate | Result |
|---|---|---|---|
| Peak active viewers | **100,000** | 100,000 | reached |
| Correctness violations (missing/dup/out-of-order) | **0** | 0 | pass |
| Surge (+40k in 120s) | clean | required | pass |
| Late-join | clean (1–31 ms recovery) | <=2000 ms | pass |
| fan_out p95 | **2757 ms** | <=500 ms | **missed (5.5×)** |
| burst p95 | **3707 ms** | <=1000 ms | **missed (3.7×)** |

**M3 was hard-stopped without ACCEPT at frozen v2.3.0.** The 100k scale/correctness behavior succeeded; the frozen fan-out/burst latency gates did not. F1 config: Redis `io-threads-do-reads yes`, 4 partitions × 4 workers, source `ffe3ae6`. Root cause isolated to a fundamental Nchan per-worker fan-out throughput wall (Redis PUBSUB main-thread contention in the local delivery hot path); config-only tuning of the frozen topology was exhausted. The terminal three-run v2.3.0 qualification campaign (seeds 42/43/44) was not run because the configuration was already demonstrably outside the gates.

---

## 2. What the POC changed in the proposal (causal chain)

```
initial risky assumption:
    one fixed 4-partition Nchan/Redis/SSE topology serves 100k with
    adequate fan-out latency on the tested hardware
-> local M3 work (F1) reached 100k with zero correctness violations
-> frozen latency gates missed because fan-out throughput is hardware/
   topology-bound, not a tunable at the frozen topology
-> bottleneck isolated to per-worker fan-out/deployment capacity
-> config-only tuning of the frozen topology declared exhausted
-> production architecture revised to horizontally bounded, autoscaled/
   pre-scaled fan-out replicas with match/hot-match sharding and N+1 headroom
-> final production design
```

The POC did **not** validate the final replacement topology. Its remaining latency claims are supported by current service facts, explicit quotas, conservative capacity assumptions, cost analysis, and required pre-launch production load testing.

---

## 3. Final selected architecture (one coherent design)

```
 PROVIDER (HTTPS push, best-effort)
        |
        v
 API Gateway HTTP API  -->  SQS FIFO (message group = match_id)
        |
        v
 AWS Lambda (canonical processor)
   - validate / version-normalize event schema
   - idempotent canonical write (dedup by provider event id)
   - maintain canonical state (score, match minute) from events
        |
        v
 DynamoDB  (CANONICAL TRUTH: events + state, transactional conditional writes, PITR)
        |
        v  (history/replay feed + live publication)
  Delivery fleet: horizontally partitioned EC2 ASG nodes
    each: Nchan 1.3.8 + partition-local Valkey (ElastiCache)
    match -> partition (deterministic hash); HOT match = dedicated sub-shard
        |
        v
  CloudFront (path behaviors route each match to its partition's private NLB origin;
              cached static Next.js at edge)
         |
         v
   single private NLB (one target group + listener per partition; L4 health
   checks; NLB does NOT do HTTP path/match-ID routing — that is performed by
   the CloudFront behavior)
        |
        v
 Next.js App Router client (EventSource, idempotent canonical_seq reducer)
```

### 3.1 Canonical truth vs delivery/history state
- **DynamoDB** is the single durable canonical source. Every canonical event carries a monotonic `canonical_seq` per match — the one atomic commit boundary for score, state, and visible history.
- **Valkey/Nchan** hold delivery/history state only. On node loss the partition peer/spare rebuilds history from DynamoDB. Delivery cache loss never loses canonical truth.

### 3.2 Horizontal partitioning & hot-match sub-sharding
- Matches are mapped to partitions by deterministic hash. Each partition owns a bounded connection/capacity envelope (planned **~8k concurrent SSE per node**, c7g.xlarge — deliberately conservative; the M3 failing node itself served 25k across 4 partitions, so 8k is a planning margin, not a universal per-node claim).
- A hot match (e.g., 40k+ viewers) is assigned a **dedicated partition / sub-shard** (its own node(s)), so one popular match cannot recreate the single-node fan-out bottleneck that limited the fixed local topology.
- Partitions are fronted by a **single** private NLB, one target group (and listener) per partition; **CloudFront path behaviors (or a thin routing edge)** map each match to its partition and send subscribers to that partition's NLB listener/target group. NLB itself is L4 — it does not route by HTTP path or match-ID; the match→partition mapping is realized by CloudFront behaviors (or by the client being handed the partition's origin URL).

### 3.3 History-to-live handoff (no gap, no double-apply)
Client connects, fetches snapshot/history up to cursor `N`, then subscribes live for `seq > N`. The browser reducer is idempotent by `canonical_seq`. This closes late-join, reload, and phone-wake races in one rule.

### 3.4 Never-blank / no-manual-refresh
Last coherent rendered state is retained while the transport reconnects (reconnect with jitter to avoid thundering herd). Resume from cursor; fall back to canonical reconstruction if the gap cannot be closed.

### 3.5 Slow-client / backpressure
Bounded per-connection output buffering; a slow consumer is disconnected (preserving canonical/history state) and reconnects/resumes. No unbounded buffering.

### 3.6 Score & clock ownership
Score and official match minute are derived from canonical processing of provider events, not the browser wall clock. The client may interpolate display time only when anchored to canonical state and periodically corrected.

### 3.7 Provider transport assumption
I assume **HTTPS push from the provider**. A persistent vendor stream would replace only the ingress adapter (API Gateway integration), not the durable queue / canonical processing / downstream design.

### 3.8 Geography
Single AWS region (eu-west-1) origin. CloudFront global edge serves static assets and fronts SSE over private origins. EU (~60%) has low RTT; NA (~40%) is reached via transatlantic path — a **production inference**, not a measured POC result. Multi-region is not justified under the $3k budget; within-region failure domains span >=2 AZs.

### 3.9 Deploy / rollback (backend AND frontend)
N+1 baseline; warm/pre-scale peak fleet before known kickoffs; NLB connection draining during rolling Instance Refresh. Canonical state remains compatible across versions. Frontend ships immutable/versioned assets so an already-open client is not broken. A bad release is rolled back without blanking viewers or deleting history.

### 3.10 Failure domains
- One delivery node loss: partition fails over to spare/peer; history rebuilt from DynamoDB.
- One AZ loss: DynamoDB Multi-AZ holds canonical truth; delivery partitions run across >=2 AZs, and a lost partition node is replaced by an ASG node in another AZ that reseeds hot history from DynamoDB. No separate Valkey replica is required because DynamoDB is canonical — a cache rebuild does not lose events.
- Valkey is co-located per partition (primary only, no separate replica) and is a cache of canonical truth, never the only copy; on node loss the replacement reseeds from DynamoDB.

---

## 4. Why not one alternative became the winner (decision ledger summary)

| Decision | Selected | Strongest rejected | Why winner won |
|---|---|---|---|
| Fan-out tech | Self-hosted Nchan/Redis, horizontally partitioned | Managed fan-out (AppSync/PubNub) | Cost/control at 100k SSE; avoids per-recipient managed pricing; partitioning fixes the POC bottleneck |
| Routing | Deterministic match→partition + NLB | Single shared router | Avoids new singleton bottleneck; isolates hot matches |
| History | Redis (rebuildable from DynamoDB) | Redis as sole store | Prevents cache-loss data loss |
| Canonical store | DynamoDB | Relational | Serverless, idempotent conditional writes, scales with ingest |
| Region | Single (eu-west-1) | Multi-region | Budget; NA served via edge inference |
| Edge | CloudFront (honest: live not cached) | Direct ALB | Private-origin protection + static CDN |
| Cross-cloud edge compute | Rejected (CloudFront/EC2) | Cloudflare Durable Objects | Best pricing shape but cross-cloud + unvalidated production envelope + AWS-preference; would reintroduce an unvalidated external dependency |
| Self-hosted custom ws gateway | Rejected (Nchan/SSE) | Custom WebSocket gateway | Reintroduces unvalidated custom risk with no POC evidence |

---

## 5. M4 completion gate — self-check

All items in prompt §24 pass: M3 was hard-stopped without ACCEPT (not "INCONCLUSIVE terminal verdict"); F1 represented exactly (100k, correctness 0, fan_out 2757 ms, burst 3707 ms); historical q5/v2.0.5 and v2.0.6 preserved as provenance; fixed 4-partition capacity assumption withdrawn; one final architecture selected; hot-match sub-sharding solved; no local M3 result treated as universal per-node capacity; routing realized by CloudFront path behaviors to per-partition private NLB (NLB is L4, not an HTTP path router); no shared Redis/routing singleton as unexplained bottleneck; failure domains explicit (>=2 AZ, DynamoDB canonical so no Valkey replica needed); crowd invariance addressed without false benchmark claims; N+1/rolling-deploy capacity explicit; warm/pre-scaled kickoff explicit; autoscaling does not pretend to migrate SSE connections; geography explicit; Lambda is VPC-attached to reach the private delivery NLB; no new untested custom risk ignored; provider semantics honest; architecture source-of-truth updated.

**M4 COMPLETION: 100%**
