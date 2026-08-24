# Live Match Centre — POC & Submission

Reviewer-facing entry point. The full design rationale is in `proposal.md`.

## Run the POC (one command, container runtime only)

**Prerequisite:** Docker (the container runtime) only. No AWS account, no credentials, no host Node/npm, no host Python, no host Git, no Redis/Nginx install. All source, routing env, and the pinned source-commit identity ship inside `poc/`; the POC builds and runs with a single container command.

**Working directory:** extracted ZIP root, then `poc`.

**Command:**

```bash
cd poc && docker compose up --build --abort-on-container-exit --exit-code-from runner
```

This builds and starts a Redis canonical store, an Nchan fan-out server, and the TypeScript runner (publisher + SSE subscribers + measurement). The runner drives the simulated feed and prints a **POC RESULTS SUMMARY** plus a machine-readable JSON verdict, then exits; the command stops the containers.

**Result location:** printed to the terminal (`fan_out p95`, delivery completeness, reconnect/replay correctness). No generated file is required; the run is self-contained.

**Interpretation:** the verdict is `NOT_APPLICABLE` at this portable reduced scale (the smoke profile is measurement-only) — it exercises the same fan-out measurement path as the historical 100k F1 probe and emits the same metric, but does **not** reproduce the 100k result and is **not** a re-run of M3.

**Expected runtime:** a few minutes (build once, then ~30 s of measurement at 100 connections).

**Cleanup:** `cd poc && docker compose down --volumes --remove-orphans`.

**What this command is and is not:** it runs the **fixed-capacity Nchan/Redis/SSE fan-out experiment family** at a portable reduced scale (100 connections), the same family whose frozen 100k F1 probe produced the submitted measured evidence. It is a packaging/reproducibility check, not a new 100k campaign and not a re-run of M3.

## POC write-up

**Assumption.** The overall least-trusted assumption is provider feed semantics: no real provider or schema was supplied, so it could not be locally tested. The riskiest locally testable assumption was that a fixed Nchan/Redis/SSE fan-out tier could serve 100,000 concurrent viewers within the assignment's frozen latency gates.

**Method.** The POC simulates the feed locally: a generated event stream drives 8 matches at ~10 events/s steady and ~50/s burst, with a +40k/120s surge, late-join, reconnect, and restart scenarios. Subscribers connect over real SSE through an Nchan fan-out server (the same fixed-capacity tier the production design would rely on); the runner measures fan-out publish→frame latency, delivery completeness, and reconnect/replay correctness. The staged command runs this experiment at a portable reduced scale (100 connections) so it executes on a standard container runtime without cloud or host-language dependencies.

**Result.** At 100k (frozen F1 probe, historical submitted evidence) the experiment reached 100,000 viewers with zero correctness violations but measured fan_out p95 2757 ms and burst p95 3707 ms, missing the frozen 500/1000 ms gates; **M3 was hard-stopped without ACCEPT**. The reduced reviewer run reproduces the same measurement path and emits fan_out p95 at its smaller scale (NOT the 100k failure, and not a re-run of M3).

**Proposal impact.** The POC removes the fixed-capacity assumption. Production uses horizontally bounded fan-out replicas with match/hot-match sharding, resource-aware autoscaling, pre-scaled kickoff capacity, and N+1 headroom. The replacement topology was not itself benchmark-validated by the POC.

## Material limitations

M3 was hard-stopped without ACCEPT; 100k scale/correctness succeeded but the frozen latency acceptance did not, and the terminal three-run v2.3.0 campaign was not run. F1 was measured on specific local hardware/containers; absolute fan-out capacity is hardware/deployment dependent. The replacement production topology was not benchmark-validated by M3. Real provider semantics, real AWS/geographic/browser end-to-end latency, and actual production spend are not measured. A fresh reviewer run may classify differently on different hardware.

## AI process

AI assistance was used for architecture exploration, POC contract/code iteration, evidence analysis, current-source research, cost calculations, drafting, and auditing. It was directed to preserve requirements, separate fact/assumption/measurement/inference, not change criteria after measurement, surface INCONCLUSIVE/REJECT evidence, use current primary sources, and keep the candidate accountable for every decision.

The AI instruction artifacts that governed this work are included at the archive root: `AGENTS.md`, `MILESTONE_2_CLOSE_GAP_PROMPT_ARTIFACT.md`, `MILESTONE_3_ASSIGNMENT_SYNCED_EXECUTION_PLAN_v2_FINAL.md`, `PARALLEL_M3_SAFE_WORK_100_PERCENT_PROMPT_ARTIFACT.md`, `MILESTONE_3_ACCEPTANCE_RECOVERY_PROMPT_ARTIFACT.md`, `MILESTONES_4_5_6_7_CLOSE_100_PERCENT_OVERNIGHT_PROMPT_ARTIFACT.md`, `M3_ACCEPT_PUSH_EXHAUST_REMAINING_NCHAN_CONFIG_SPACE.md` (M3 accept-push, 2026-08-24), and `FINAL_TAKEHOME_NON_M3_REQUIREMENT_CLOSURE_PROMPT_ARTIFACT.md`.
