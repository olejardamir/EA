# M5 — Final Proposal Evidence Closure

**Date:** 2026-08-23  
**Status:** CLOSED. This document certifies that every selected M4 component has current-source backing, current pricing, a complete cost model, and an honest provider/geography boundary — without invalidating M4.

## 1. Selected M4 architecture (recap)
Horizontally partitioned Nchan/SSE delivery fleet (P=16 warm partitions), match-aware ownership + hot-match sub-sharding, partition-local Valkey, DynamoDB canonical truth, Lambda canonical processor, API Gateway→SQS FIFO ingress, CloudFront edge + eu-west-1 origin, ASG pre-scaled warm capacity + reactive autoscaling, N+1 headroom.

## 2. Current-source ledger (all verified 2026-08)
See `M5_CURRENT_EXTERNAL_EVIDENCE_LEDGER.md`. Every mutable service fact (CloudFront pricing/behavior, EC2 c7g rates, ElastiCache Valkey, SQS/Lambda/APIGW/DynamoDB rates, NLB/NAT) is recorded with source + date. No 2026 price is assumed from memory; old rejected-architecture costs were removed.

## 3. Cost model (see `M5_PARAMETRIC_COST_MODEL.md`)
- Parametric: fleet sensitivity (P=12/16/20), live-event-hours sensitivity (H=30…720), payload assumption explicit.
- Full ledger: **≈ $2,318/month at base (P=16, H=120, 1-yr SP, CloudFront Business)**.
- **Conclusion: WITHIN BUDGET** with ~23% margin; variable DTO bounded by CloudFront Business 50 TB cap. CONDITIONALLY WITHIN BUDGET only beyond ~440 peak-hours/month.

## 4. Geographic decision
- **Origin: eu-west-1** (covers ~60% EU with low RTT; CloudFront edge serves static + streams `/live` globally).
- **NA (~40%):** via CloudFront edge → eu-west-1 origin; cross-Atlantic RTT added — **PRODUCTION_INFERENCE, not measured**, must be validated pre-launch.
- Multi-region origin **not justified** by the $3k budget; single region + edge is the simpler defensible choice. CloudFront live-stream behavior is not overclaimed (edge does not collapse 100k live streams into few origin connections).

## 5. Provider uncertainty (explicit)
- Real provider semantics/transport/order/replay **not measured** (no provider supplied).
- Assumed **HTTPS push** to ingress; a persistent feed changes only the ingress adapter, not the downstream design.
- Real EU/NA Internet, real AWS deploy, real weekly deploy, real production spend: **not measured**.
- Browser rendering of large histories: **not measured** (bounded design only).

## 6. POC-to-production mapping (truthful classification)

| Fact class | Example | Label |
|---|---|---|
| ASSIGNMENT_FACT | 100k, 8 matches, 10/50 eps, +40k/120s, 60/40 geo, $3k | assignment |
| POC_OBSERVATION | F1: 100k reached, correctness 0, fan_out 2757ms, burst 3707ms | M3 F1 |
| CALCULATION | cost ledger, viewer math | calculation |
| PLANNING_ASSUMPTION | per-node 8k envelope, payload 250B, H=120 | planning |
| CURRENT_OFFICIAL_FACT | 2026 AWS pricing/quotas | official 2026 |
| PRODUCTION_INFERENCE | EU/NA latency, e2e budget, pre-launch capacity | inference |
| UNRESOLVED_EXTERNAL_ASSUMPTION | real provider behavior | unresolved |

No value is silently promoted to a stronger evidence level.

## 7. Important alternative pricing comparison
- **Managed fan-out (AppSync Events / API GW WebSocket):** re-priced at 100k×event volume → ~$50k+/month outbound metering. **Rejected** (budget).
- **Cloudflare Durable Objects:** best pricing shape, but cross-cloud + unvalidated production envelope + AWS preference → **rejected after composition**.
- **Self-hosted custom ws gateway:** reintroduces unvalidated custom risk with no POC evidence → **rejected**.
- Selected self-hosted partitioned Nchan: cost depends mainly on a small reserved compute fleet + bytes → fits $3k.

## 8. Decision provenance
Every material choice (SSE vs WS, fan-out tech, partitioning, history model, canonical store, queue/order, router, cache, origin region, single-region, CloudFront, fleet baseline, security, observability, provider-boundary assumption) is recorded in `M5_CURRENT_EXTERNAL_EVIDENCE_LEDGER.md §K` with winner/rejected-alternative/reason. Every submitted number and decision is defendable.

## 9. Closure statement
M5 does **not** invalidate M4: current sources confirm the selected components exist, support the required behavior, and price within budget. No architecture change loops back to M4.

M5 completion: 100%
