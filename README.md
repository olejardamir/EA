# Live Match Centre — POC & Submission

Reviewer-facing entry point. The full design rationale is in `proposal.md`; current architecture, evidence, and cost are in `internal_docs/` (`M4_FINAL_ARCHITECTURE.md`, `M5_PARAMETRIC_COST_MODEL.md`, `M5_CURRENT_EXTERNAL_EVIDENCE_LEDGER.md`, `M5_FINAL_PROPOSAL_EVIDENCE_CLOSURE.md`).

## Run the illustrative topology probe (non-qualifying development probe)

> **The submitted POC result is the frozen M3 F1 measurement** (100k active viewers, correctness 0, fan_out p95 2757 ms, burst p95 3707 ms — hard-stopped without ACCEPT). The command below exercises the **proposed replacement topology**, not the frozen M3 campaign; it is an illustrative development probe, **not** the terminal measured POC.

**Prerequisite:** Docker (the container runtime) only. No AWS account, no credentials, no host Node/npm, no host Python, no host Git, no Redis/Nginx install. All routing env and source-commit identity are precomputed and committed in `poc/.env`, so the POC runs with a single container command.

**Working directory:** `poc`

**Command (illustrative probe of the proposed horizontal topology; non-qualifying):**

```bash
cd poc
docker compose -f compose.arch-revision-100k.yaml -f compose.arch-probe.yaml up --build --abort-on-container-exit --exit-code-from coordinator
```

For a 4k smoke run, prefix scale overrides: `PROBE_TARGET=1000 PROBE_GLOBAL_TARGET=4000 docker compose -f compose.arch-revision-100k.yaml -f compose.arch-probe.yaml up --build --abort-on-container-exit --exit-code-from coordinator`. The optional `./run-arch-revision-probe.sh 100000|4000` wrapper parameterizes scale and stamps evidence, but is **not required** to run the POC.

This builds and starts Nchan/Redis delivery nodes, a publisher, a coordinator, and four load-generator shards, then runs the chosen workload until the coordinator exits (the coordinator prints the verdict). The containers stop, but the `global-evidence` Docker volume persists — the command does **not** auto-tear-down. Cleanup (stops containers and removes volumes/networks): `cd poc && docker compose -f compose.arch-revision-100k.yaml -f compose.arch-probe.yaml down --volumes --remove-orphans`.

**Important — what this command is and is not:** it exercises the **proposed revised topology** (match-aware 16-shard horizontal fan-out). It is NOT a re-run of the frozen v2.3.0 / F1 configuration, and it is a **non-qualifying** development probe, not the terminal measured campaign. The terminal M3 F1 numbers are historical measured evidence and are not reproduced by this command.

**Terminal M3 result (submitted measured evidence, not re-run here):** the frozen v2.3.0 campaign measured F1 at config source `ffe3ae6` (Redis `io-threads-do-reads`, 4 partitions × 4 workers): 100,000 active viewers, correctness 0, fan_out p95 2757 ms, burst p95 3707 ms. **M3 was hard-stopped without ACCEPT**: the single best-validated F1 probe met the scale/correctness behavior but missed the frozen latency gates, and the terminal three-run v2.3.0 qualification campaign (seeds 42/43/44) was not run because the configuration was already demonstrably outside the gates. The earlier `run-evidence-100k.sh` (seeds 42–44) is the **historical v2.2.0 campaign and is non-terminal provenance only** — it is not the terminal M3 claim.

**Expected runtime:** not independently re-measured in this submission; a fresh run's duration depends on host CPU/RAM/FD capacity and chosen scale (4k smoke vs 100k). The frozen v2.3.0 campaign profile (~20 min/seed, 3 seeds) is recorded in `poc/internal_docs/m3_evidence/`, not regenerated here.

**Results:** the coordinator writes `global-result-*.json` to the `global-evidence` Docker volume (default project name `poc` → volume `poc_global-evidence`) and prints the verdict. View it with: `docker run --rm -v poc_global-evidence:/evidence alpine sh -c 'cat /evidence/global-result-*.json'`. Interpret the verdict as:
- `ACCEPT` — all frozen gates passed (not achieved at the frozen topology)
- `REJECT` — valid run, a gate failed
- `INCONCLUSIVE` — measurement/environment invalid (e.g., insufficient host resources)

A fresh heavy run is **environment-dependent**: on weaker hardware it may classify `INCONCLUSIVE` even though the submitted measured result above stands.

## POC write-up

**Assumption.** The overall weakest assumption is provider feed semantics: no real provider or schema was supplied, so it could not be locally tested. The riskiest locally testable assumption was that a fixed Nchan/Redis/SSE fan-out topology could serve 100,000 concurrent viewers at the assignment's latency gates.

**Method.** A simulated event stream drives 8 matches with a 60k baseline surging +40k to 100k within 120s, at ~10 events/s steady and ~50/s burst, across four coordinated load-generator shards. Scenarios cover correctness, reconnect, late-join, and restart replacement under the frozen v2.3.0 contract (fan_out p95 ≤500ms, burst p95 ≤1000ms, late-join ≤2000ms, zero missing/duplicate/out-of-order).

**Result.** The local experiment reached 100,000 active viewers with zero correctness violations; surge and late-join were clean. It measured fan_out p95 2757ms and burst p95 3707ms, missing the frozen latency gates. **M3 was hard-stopped without ACCEPT** — the single best-validated F1 probe met scale/correctness but missed the frozen gates, and the terminal three-run v2.3.0 campaign (seeds 42/43/44) was not run because the config was already demonstrably outside the gates. The limit was isolated to Nchan per-worker fan-out throughput (Redis PUBSUB contention); config-only tuning was exhausted.

**Proposal impact.** The POC removes the fixed-capacity assumption. Production uses horizontally bounded fan-out replicas with match/hot-match sharding, resource-aware autoscaling, pre-scaled kickoff capacity, and N+1 headroom. The replacement topology was not itself benchmark-validated by the POC.

## Material limitations

M3 was hard-stopped without ACCEPT; 100k scale/correctness succeeded but the frozen latency acceptance did not, and the terminal three-run v2.3.0 campaign was not run. F1 was measured on specific local hardware/containers; absolute fan-out capacity is hardware/deployment dependent. The replacement production topology was not benchmark-validated by M3. Real provider semantics, real AWS/geographic/browser end-to-end latency, and actual production spend are not measured. A fresh reviewer run may classify differently on different hardware.

## AI process

AI assistance was used for architecture exploration, POC contract/code iteration, evidence analysis, current-source research, cost calculations, drafting, and auditing. It was directed to preserve requirements, separate fact/assumption/measurement/inference, not change criteria after measurement, surface INCONCLUSIVE/REJECT evidence, use current primary sources, and keep the candidate accountable for every decision.

The AI instruction artifacts that governed this work are preserved with SHA-256 identifiers in `internal_docs/AI_INSTRUCTION_PROVENANCE.md` (notably the M4–M7 closure artifact, `MILESTONES_4_5_6_7_CLOSE_100_PERCENT_OVERNIGHT_PROMPT_ARTIFACT.md`).
