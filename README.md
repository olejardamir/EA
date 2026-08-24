# Live Match Centre — POC & Submission

The production design is in `proposal.md`. The proof of concept measures the fan-out assumption that most directly threatens that design.

## Run the POC

**Prerequisite:** Docker with Docker Compose. Nothing else is required: no AWS account, credentials, host Node/npm, Python, Go, Redis, Nginx, or Git.

From the extracted submission root, run:

```bash
cd poc && docker compose up --build --abort-on-container-exit --exit-code-from runner
```

The command must build the POC, simulate eight live matches, run a portable stepped load at **100, 500, and 1,000 real SSE subscribers**, and print a human-readable and machine-readable measurement summary. At minimum it must report fan-out p50/p95/p99, burst p95, delivery missing/duplicate/out-of-order counts, late-join/replay measurements, reconnect measurements, and the achieved subscriber count at each step.

The command is a portable re-execution of the same fan-out measurement path used for the historical 100,000-viewer experiment. It is not presented as a reproduction of 100,000 viewers on arbitrary reviewer hardware. It must finish with a measurement status such as `COMPLETED`; it must **not** report `NOT_APPLICABLE`, and it must not redefine performance gates to make a result pass.

## POC write-up

**Assumption.** The riskiest locally testable assumption was that a fixed Nchan/Redis/SSE fan-out tier could support the assignment-scale audience without violating delivery correctness or making live updates unacceptably slow. Provider feed semantics are also a major production risk, but no real provider or schema was supplied, so that risk cannot be meaningfully tested locally.

**Method.** The POC simulates eight live matches and publishes steady (~10 events/s total) and burst (~50 events/s total) traffic through Nchan over SSE. It measures publish-to-frame latency and, for every subscriber independently, delivery correctness (expected vs received sequences). It also runs a genuine late-join test (history pre-populated, then a subscriber connects through the history/replay endpoint) and a reconnect/recovery test (events published while the client is offline, then recovered). The one-command reviewer run executes a portable stepped load at 100, 500, and 1,000 real SSE subscribers. Historical 100,000-viewer runs are retained as the assignment-scale measurement.

**Result.** The best correctness-clean 100,000-viewer run reached 100,000 active viewers with zero viewer-facing missing, duplicate, out-of-order, or state-consistency violations, but fan-out p95 was 4.242 s, burst p95 11.006 s, and late-join p95 0.906 s — too slow, so fixed-capacity fan-out was rejected. On the corrected portable run, 1,000 subscribers measured fan-out p95 **≈15 ms** (burst p95 ≈9 ms), with **0** viewer-level missing, **0** duplicate, and **0** out-of-order deliveries; the late-join test replayed **25/25** history events within 2 s with correct ordering; the reconnect test recovered all **5/5** events published while offline and reconstructed a complete contiguous sequence 0..14 with no applied duplicates.

**Proposal impact.** Production therefore uses horizontally scalable delivery replicas, explicit hot-match replication across multiple fan-out nodes, pre-scaled kickoff capacity, and N+1 headroom. The replacement topology remains a production assumption that must be load-tested before launch.

## Material limitations

The local POC measures the fan-out path, not the complete AWS-to-browser internet path. It therefore does not claim to have measured the assignment's end-to-end 2 s/5 s production SLOs. Absolute local timings depend on reviewer hardware. Real third-party feed identity/order/reconciliation semantics, real Europe/North-America network latency, browser rendering at production history sizes, and actual AWS spend remain production validation items.

The historical 100,000-viewer measurement is reported as a **failure of the fixed-capacity architecture assumption**, not as an acceptance obtained by changing thresholds after measurement.

## AI process

AI assistance was used for architecture exploration, code iteration, measurement analysis, cost calculations, drafting, and requirement auditing. The AI was directed to treat the take-home assignment as the sole reviewer-facing acceptance authority, preserve measured failures, distinguish facts from assumptions, avoid changing criteria after observing results, and keep every submitted number explainable.

The agent-instruction files actually used during this work are included at the archive root. They include `AGENTS.md`, `MILESTONE_2_CLOSE_GAP_PROMPT_ARTIFACT.md`, `MILESTONE_3_ASSIGNMENT_SYNCED_EXECUTION_PLAN_v2_FINAL.md`, `PARALLEL_M3_SAFE_WORK_100_PERCENT_PROMPT_ARTIFACT.md`, `MILESTONE_3_ACCEPTANCE_RECOVERY_PROMPT_ARTIFACT.md`, `MILESTONES_4_5_6_7_CLOSE_100_PERCENT_OVERNIGHT_PROMPT_ARTIFACT.md`, `M3_ACCEPT_PUSH_EXHAUST_REMAINING_NCHAN_CONFIG_SPACE.md`, `FINAL_TAKEHOME_NON_M3_REQUIREMENT_CLOSURE_PROMPT_ARTIFACT.md`, `EA_FINAL_100_PERCENT_SUBMISSION_READY_PROMPT.md`, and `EA_FINAL_GAP_CLOSURE_PROMPT.md`.
