# M4–M7 Coverage Certificate

**Date:** 2026-08-23
**Scope:** Verify M4–M7 deliverables tell one truthful story and cover the assignment, deliverable, milestone, and `AGENTS.md` gates.

## A. Original assignment scenario — PASS

| Row | Status | Reference |
|---|---|---|
| public / anonymous / read-only / no accounts | PASS | proposal.md §Architecture/Deployment; README run (no auth) |
| lobby: all live matches | PASS | proposal.md §Correctness (lobby) |
| lobby: score and minute | PASS | proposal.md §Correctness |
| lobby: goals/cards live, no refresh | PASS | proposal.md §Correctness |
| match: run of play + history then live | PASS | proposal.md §Correctness |
| late join / reload / phone wake | PASS | proposal.md §Correctness (idempotent canonical_seq) |
| never blank / no manual refresh | PASS | proposal.md §Correctness |
| score/history coherence | PASS | proposal.md §Correctness |
| no duplicate display / nothing disappears / ordered | PASS | proposal.md §Correctness |
| goal p95 ≤2s ingest→screen | PASS (planning budget) | proposal.md §Scale; M5 cost model §latency budget |
| routine p95 ≤5s | PASS (planning budget) | proposal.md §Scale |
| same experience ~100→100,000 | PASS | proposal.md §Scale (crowd invariance) |
| 8 matches / ~10/s / ~50/s | PASS | proposal.md §Scale; M5 model |
| best-effort/no-long-retry provider | PASS | proposal.md §Scale (provider assumption) |
| +40k / 120s | PASS | proposal.md §Scale (pre-scaled warm fleet) |
| 60% EU / 40% NA | PASS | proposal.md §Scale (separate inference) |
| history ≤2s | PASS (bounded) | proposal.md §Scale; M5 §full-history |
| ≤ $3,000/month | PASS | M5 cost model (WITHIN at base ≈$2,318/mo; conditionally within beyond ~440 peak-hours/mo) |
| weekly live deploys unnoticed | PASS | proposal.md §Deployment |
| Next.js App Router / component-based | PASS | proposal.md §Architecture |
| AWS preferred | PASS | proposal.md §Architecture |
| score and clock derived from feed | PASS | proposal.md §Correctness |
| every number/decision defendable | PASS | M5 ledger; M4 decision ledger |

## B. Deliverable requirements — PASS

| Row | Status | Reference |
|---|---|---|
| proposal.md exists, ≤1500 words (excl. diagram) | PASS | ≈1,274 prose words |
| full stack feed→fan | PASS | proposal.md diagram + text |
| important decisions/options/winners explained | PASS | proposal.md §Cost; M4 §4 |
| least-trusted assumption named | PASS | proposal.md §Riskiest; README |
| POC relationship/causal change explained | PASS | proposal.md §Riskiest; README POC write-up |
| POC remains small experiment code | PASS | poc/ (architecture-revision probe) |
| one-command local path | PASS | README run command |
| Docker (container runtime) only | PASS | README prerequisite; `poc/.env` precomputes routing env + source identity, so `docker compose up` is the sole command; no Node/npm/Python/Git/Redis/Nginx, no cloud |
| no cloud account | PASS | README |
| measured result | PASS | README F1 numbers |
| simulated feed / no full product | PASS | README method |
| README exists / run instructions / runtime / result location | PASS | README |
| ≤300-word POC write-up (assumption→method→result→impact) | PASS | 218 words |
| material limitations | PASS | README |
| AI-process explanation | PASS | README |
| AI instruction artifacts recorded | PASS | README + this cert |
| every submitted number/decision defendable | PASS | M5/M4 ledgers |

## C. M4–M7 milestone gates — PASS

| Row | Status |
|---|---|
| M4 architecture/evidence no longer contradict | PASS |
| M4 one final selected architecture | PASS |
| M4 old one-primary assumption not restored | PASS |
| M4 architecture/risk/traceability sources updated | PASS (M4_FINAL_ARCHITECTURE.md; TRACEABILITY + milestones updated) |
| M5 current authoritative facts | PASS |
| M5 current prices/quotas | PASS |
| M5 complete cost model | PASS |
| M5 POC-to-production mapping | PASS |
| M5 geography/provider boundary | PASS |
| M5 ≤$3k conclusion defensible | PASS (conditional) |
| M6 final proposal + word count + coverage | PASS |
| M6 no unsupported certainty | PASS |
| M6 no conflict with README/POC | PASS |
| M7 run instructions tested appropriately | PASS (clean-path/compose verified; smoke vs qualifying distinguished) |
| M7 POC source/result coherence | PASS (M7_POC_SOURCE_RESULT_COHERENCE.md; `GIT_COMMIT_SHA` pins shipped baseline, later commits are doc/metadata only) |
| M7 ≤300-word write-up / values / impact / limitations / AI | PASS |

## D. AGENTS.md production-design gates — PASS

validation/normalization ✓; schema evolution ✓; canonical ordering ✓; dedup/idempotency ✓; atomic score/clock/history boundary ✓; safe history→live handoff ✓; transient reconnect/reload/wake ✓; surge/backpressure ✓; slow-client protection ✓; feed interruption/staleness (provider-boundary honesty) ✓; failure domains (≥2 AZ) ✓; delivery-store rebuild from canonical ✓; deploy ✓; rollback (backend+frontend) ✓; frontend asset version overlap ✓; geography ✓; regional latency honesty ✓; public-endpoint protection (CloudFront private origins/WAF) ✓; observability ✓; viewer-screen SLO measurement ✓; current prices/quotas ✓; operating-cost margin (conditional) ✓; composition-aware alternatives ✓; provider-boundary honesty ✓.

---

```
uncovered original-assignment rows: 0
uncovered M4-M7 rows: 0
uncovered applicable AGENTS.md rows: 0
contradictory current-source-of-truth rows: 0

FULL M4-M7 COVERAGE: 100%
```

## E. Word-count determinations (§51A / §79A)

Method: total `wc -w` of the file minus words inside fenced ``` blocks (only the architecture diagram block is exempted per assignment; other fenced blocks are counted). Counted 2026-08-23.

- `proposal.md`: total 1,380 words; diagram block 106 words; **prose = 1,274 words** (within hard max 1,500; within target 1,200–1,450).
- `README.md` POC write-up (bounded section "## POC write-up" → "## Material limitations"): **218 words** (within hard max 300; target margin ~180–260).

Both counts preserve margin below the respective ceilings.
