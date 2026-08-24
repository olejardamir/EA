# Final Non-M3 Requirement Audit (M8/M9/M10 closure)

**Execution-start HEAD:** `e18246e494476efd3afc4907e99c48ec3b4393de`
**End HEAD:** see git log
**Scope:** M3 is OUT OF SCOPE. This audit covers requirements audit, production-design
coherence, proposal/README finalization, POC packaging/reproducibility, explainability,
clean staged submission, and ZIP construction + clean-room verification.

## A. Gap ledger (§2 / §6)

| Requirement / gate | Status | Fix / evidence |
|---|---|---|
| proposal.md exists, ≤1500 words (diagrams excluded) | PASS | 1322 prose words |
| public/anonymous/read-only, no accounts | PASS | proposal §Architecture; README |
| lobby path (all matches, score/minute, goals/cards, no refresh) | PASS | proposal lobby paragraph; lobby aggregate SSE stream |
| match full run-of-play + live handoff | PASS | proposal correctness paragraph |
| late-join/reload/wake, never-blank, no manual refresh | PASS | idempotent canonical_seq reducer; last coherent state on screen |
| no duplicate/disappear/out-of-order under retry/reconnect | PASS | canonical_seq dedup; browser rejects stale seq |
| canonical write→publish retry semantics | PASS | idempotent conditional write + alert/quarantine; publish only after canonical commit |
| provider boundary honest (no invented ID/replay) | PASS | proposal provider-transport assumption paragraph |
| hot-match multi-node fanout concrete | PASS | deterministic hash + dedicated sub-shard; target group absorbs new nodes |
| stable routing (no per-match CloudFront reconfig) | PASS | fixed partition route prefixes; NLB target group node-level balancing; NLB not HTTP-path router |
| SSE heartbeat / quiet-period keepalive | FIX | added explicit keep-alive/idle-ping sentence to proposal |
| history ≤2s defensible data math | FIX | corrected to ~6,750 events/match (even share, 90-min), ~2 MB; removed stale 60k/18 MB claim |
| 100k viewer/connection semantics consistent with cost | PASS | one SSE connection per active page; cost uses 100k total concurrent |
| cost ≤$3k arithmetic reproducible | PASS | $2,318 from M5 model; 13.5 TB at H=120 = 100k×1.25×250B×3600×H |
| weekly deploy continuity (backend+frontend) | PASS | NLB drain + Instance Refresh + N+1; immutable versioned assets |
| Next.js App Router + component architecture | PASS | proposal references App Router client + reducer/components |
| AWS or justified alternative | PASS | AWS preferred; trade-offs visible |
| geography + latency uncertainty honest | PASS | EU/NA split; single-region inference, not measured |
| 2s/5s latency case ingest→screen, not falsely measured | PASS | labeled planning budget, not POC result |
| +40k/2m surge concrete (≈333/s, warm+N+1) | PASS | proposal scale paragraph |
| 100 vs 100,000 invariance | PASS | same protocol/semantics; only partition/node count scales |
| least-trusted assumption architecture-invalidating | PASS | provider semantics (not locally testable) → riskiest local = fixed fan-out capacity (F1 disproved it) |
| POC corresponds to README experiment (not replacement-topology demo) | FIX | replaced arch-revision primary command with F1-family portable experiment (compose.yaml); README aligned |
| one copy-paste container-only command | PASS | `cd poc && docker compose up --build --abort-on-container-exit --exit-code-from runner` |
| no host language/runtime/cloud dependency | PASS | only Docker; .env static non-secret; clean-room run exit 0 |
| measured result at runtime | PASS | fan_out p95 emitted (100-conn smoke) + historical F1 100k result |
| no generated/debris in poc | FIX | staged poc is minimal (redis+nchan+runner+compose+.env); excluded node_modules/tests/evidence |
| README standalone (no internal_docs dependency) | FIX | removed internal_docs references; lists root instruction files |
| README POC write-up ≤300 words, assumption/method/result/impact | PASS | 235 words, all four elements |
| AI instruction files preserved + SHA verified | PASS | M4–M7 artifact SHA matches expected e3e319…; this prompt preserved |
| final ZIP whitelist + extracted clean-room run | PASS | unzip -l clean; extracted run exit 0, measured result |

No BLOCKED_BY_M3_SCOPE gaps remain except the explicit M3 boundary itself (out of scope).

## B. Number ledger (§10.1)

| Number | Meaning | Class | Source / formula |
|---|---|---|---|
| 8 matches | assignment peak concurrency | ASSIGNMENT_FACT | §2.1 |
| ~10 evt/s total, ~50 evt/s burst | ingest rate | ASSIGNMENT_FACT | §2.1 |
| 100,000 viewers | peak concurrency | ASSIGNMENT_FACT | §2.1 |
| +40,000 / 120 s | surge | ASSIGNMENT_FACT | §2.1 (~333/s) |
| 60% EU / 40% NA | geography | ASSIGNMENT_FACT | §2.1 |
| goal p95 ≤2 s, other ≤5 s, history ≤2 s | latency targets | ASSIGNMENT_FACT (targets) | §2.1 |
| ≤$3,000/month | budget constraint | ASSIGNMENT_FACT | §2.1 |
| $2,318/month | modeled baseline | CALCULATION | M5 cost model, 2026-08-23 eu-west-1 |
| 16 × c7g.xlarge $1,121 | delivery compute | CALCULATION + CURRENT_OFFICIAL_FACT | 1-yr SP pricing |
| 16 × cache.t4g.medium $504 | Valkey | CALCULATION + CURRENT_OFFICIAL_FACT | reserved pricing |
| CloudFront Business $200 (≤50 TB DTO) | CDN | CURRENT_OFFICIAL_FACT | AWS pricing |
| ingest/canonical ~$290 | API GW+SQS+Lambda+DDB | CALCULATION | M5 model |
| NLB/NAT/CW/S3/Route53 ~$203 | network/obs | CALCULATION | M5 model |
| 13.5 TB @ H=120 | base DTO | CALCULATION | 100k×1.25 evt/s×250 B×3600×H |
| ~23% margin | budget headroom | CALCULATION | (3000-2318)/3000 |
| ~440 peak-hrs/month | $3k threshold | CALCULATION | 50 TB / 13.5 TB per 120h |
| ~90-min match | duration | PLANNING_ASSUMPTION | football domain |
| ~6,750 events/match | history size | CALCULATION | 1.25 evt/s × 5400 s (even share) |
| ~300 B/event | payload size | PLANNING_ASSUMPTION | JSON event estimate |
| ~2 MB/match | history transfer | CALCULATION | 6750 × 300 B |
| ~8k SSE/node envelope | per-node capacity | PLANNING_ASSUMPTION | c7g.xlarge conservative |
| F1 fan_out p95 2757 ms, burst 3707 ms | measured | POC_MEASUREMENT (historical) | frozen v2.3.0 F1, config ffe3ae6 |
| 100,000 active = ACHIEVED, correctness 0 | measured | POC_MEASUREMENT (historical) | F1 |
| 100-conn smoke fan_out p95 ~6 ms | measured | POC_MEASUREMENT (reduced run) | this closure clean-room |
| seed 42 | frozen contract seed | ASSIGNMENT_FACT (contract) | v2.3.0 |

## C. Decision defenses (§10.2)

- **SSE/Nchan over custom WebSockets:** Nchan is a mature pub/sub SSE server; the POC directly
  measures its fan-out, which is the exact risk. WebSockets would need custom fan-out code.
- **Self-hosted Nchan/Valkey over managed fan-out:** cost/control at 100k SSE and it fixes the
  measured bottleneck; managed fan-out could not be locally validated within budget.
- **DynamoDB canonical truth:** serverless idempotent conditional writes keyed by canonical_seq;
  delivery cache is rebuildable, so canonical truth is never the only copy.
- **SQS FIFO per match_id:** preserves per-match order durably before processing.
- **canonical_seq assignment:** monotonic per (match_id, canonical_seq), assigned after durable
  accept; provider order treated as external, not invented.
- **write→publish recovery:** canonical write + live publish are one accepted step; retry
  republishes the same canonical event idempotently; never silently drops.
- **lobby delivery:** dedicated lobby aggregate SSE stream derived from same canonical events,
  so lobby and match agree without every browser holding two streams.
- **hot match:** deterministic partition hash + dedicated sub-shard; NLB target group distributes
  new connections, existing SSE sockets stay put (autoscaling adds capacity, not migrates sockets).
- **single region + CloudFront:** budget-bounded; multi-region not justified under $3k; ≥2 AZ.
- **SSE keepalive:** idle ping frames prevent intermediary timeout drops; interval is a
  service-informed design choice, immaterial to DTO.
- **POC established:** fixed fan-out capacity is the architecture-invalidating risk; F1 measured
  it fails at 100k, so production moved to horizontally partitioned fan-out. Replacement topology
  itself was NOT benchmark-validated (honest limitation).
- **cost under $3k:** true only under the named 100k / 120 peak-hr / 250 B workload; beyond
  ~440 peak-hrs/month it exceeds $3k.

## D. Clean-room evidence

- Staged tree: `.submission-staging/` (proposal.md, README.md, poc/, AGENTS.md, 6 instruction artifacts).
- Primary command run from extracted archive `/tmp/extracted-NM3`: exit 0; verdict NOT_APPLICABLE;
  fan_out p95 ~6 ms; no absolute/external compose paths; no host deps.
- ZIP: `live-match-centre-submission.zip` (top-level whitelist clean; no internal_docs/evidence/node_modules/.git).
