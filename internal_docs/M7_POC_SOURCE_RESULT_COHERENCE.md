# M7 — POC/Source Result Coherence

**Date:** 2026-08-23  
**Status:** CLOSED. This document records the honest relationship between what the local POC measured and what the final production architecture claims — so no value is silently promoted to a stronger evidence level than it earned.

## 1. Evidence-level classification (honest taxonomy)

Every claim in `proposal.md` / `M4_FINAL_ARCHITECTURE.md` carries exactly one of these levels:

| Level | Meaning | Example in this submission |
|---|---|---|
| **ASSIGNMENT_FACT** | Stated in the take-home spec | 100k peak; 8 matches; 10/50 eps; +40k/120s; 60/40 geo; $3k budget; ~2s goal / ~5s routine |
| **POC_OBSERVATION** | Measured by the local experiment (frozen v2.3.0) | F1: 100k active, correctness 0, fan_out p95 2757 ms, burst p95 3707 ms, surge/late-join clean |
| **CALCULATION** | Derived by explicit arithmetic from the above | cost ledger, viewer-delivery math, DTO ~13.5 TB/mo at H=120 (100k × 1.25 evt/s × 250 B × 3600 × 120) |
| **PLANNING_ASSUMPTION** | A conservative design choice, not measured | per-node ~8k SSE envelope; ~250 B/event payload; ~120 live match-hours/month |
| **CURRENT_OFFICIAL_FACT** | 2026-08 AWS pricing/quota from primary sources | CloudFront Business $200/mo; c7g.xlarge rate; Valkey/cache.t4g rate; SQS/Lambda/APIGW/DynamoDB rates; NLB/NAT |
| **PRODUCTION_INFERENCE** | Reasoned from facts but not measured here | EU/NA end-to-end latency; e2e budget decomposition; pre-launch capacity requirement; CloudFront live-stream behavior |
| **UNRESOLVED_EXTERNAL_ASSUMPTION** | Outside our control, not supplied | real provider feed semantics/transport/schema/order/replay; real AWS deploy; real weekly deploy cadence; real production spend |

No claim is promoted across these levels without an explicit label.

## 2. What the POC actually proved vs. what it did not

**Proved (measured, frozen v2.3.0, F1):**
- 100,000 concurrent SSE viewers can be held with **zero** missing/duplicate/out-of-order events.
- Surge (+40k in 120 s) and late-join (1–31 ms recovery) behave correctly.
- The fixed-capacity assumption **fails** the frozen latency gates (fan_out 2757 ms vs ≤500; burst 3707 ms vs ≤1000); **M3 was hard-stopped without ACCEPT** — the single best-validated F1 probe met scale/correctness but missed the gates, and the terminal three-run v2.3.0 campaign (seeds 42/43/44) was not run.

**Did NOT prove (must not be implied):**
- That any production topology meets the latency gates — the replacement **horizontally partitioned** design was **never benchmark-validated by M3**. It is supported by current service facts, explicit quotas, conservative assumptions, cost analysis, and required pre-launch production load testing only.
- Real provider behavior, real cloud geography latency, real browser render, or real spend.

## 3. "Never validated by M3" — explicit labeling

The following production-design elements are **planning/inference only** and are labeled as such in `proposal.md` and `M4_FINAL_ARCHITECTURE.md`:
- Horizontal partitioning fan-out capacity at 100k (per-node ~8k envelope is a planning margin, deliberately stricter than the M3 failing node's 25k).
- Hot-match sub-sharding solving the single-node bottleneck.
- NLB/ASG warm pre-scale + N+1 + autoscaling headroom.
- CloudFront eu-west-1 origin + global edge; NA transatlantic path latency.
- DynamoDB canonical-truth + rebuild-from-canonical recovery.
- Provider-ingress (API Gateway + SQS FIFO) and Lambda canonical processing.

## 4. Transition certainty per design element (from M3 → production)

| Element | M3 evidence | Production claim | Certainty |
|---|---|---|---|
| SSE + idempotent `canonical_seq` delivery | Directly measured (correctness 0) | Same mechanism at partition scale | **High** (mechanism proven; scale via partitioning) |
| Correctness guarantees | Directly measured | Carry forward | **High** |
| Fan-out latency at scale | Measured FAIL at fixed topology | Met via partitioning (unvalidated) | **Medium** (inference + pre-launch required) |
| History/reconnect/no-blank | Measured (late-join clean) | Same client protocol | **High** |
| Canonical store / recovery | Not run in POC (POC used Redis) | DynamoDB canonical + rebuild | **Medium** (design, not measured here) |
| Cost within $3k | Calculation + 2026 pricing | Within at base; conditionally beyond 440 h/mo | **High for calc; Medium for real spend** |
| Geography (NA latency) | None | EU low / NA transatlantic inference | **Low** (PRODUCTION_INFERENCE) |
| Provider semantics | None | HTTPS-push assumption, contained at ingest | **Low** (UNRESOLVED) |

## 5. Provider-supply and NA-RTT honesty

- No real provider was supplied; the ingress boundary (HTTPS push → API Gateway → SQS FIFO → Lambda) is an explicit assumption, contained by schema validation/normalization so an upstream change cannot silently corrupt canonical state.
- NA (~40%) latency is reached via a transatlantic path and is a **production inference**, not measured. It is called out separately from EU and must be validated pre-launch (RTT drill).

## 6. Coverage of prompt §27 (M7) gates

- [x] M3 result stated without distortion: hard-stopped without ACCEPT (not a terminal INCONCLUSIVE verdict); F1 represented exactly (100k, correctness 0, fan_out 2757 ms, burst 3707 ms); terminal three-run campaign not run.
- [x] POC-measured vs production-claimed distinction maintained throughout.
- [x] Never-validated topology explicitly labeled.
- [x] Evidence-level taxonomy applied (no silent promotion).
- [x] Provider-supply + NA-RTT uncertainty disclosed.
- [x] Required pre-launch validation (load test, failover, NA-RTT drill) stated as a condition, not as achieved.

M7 completion: 100%
