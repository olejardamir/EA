# Milestone 3 — Acceptance Recovery Prompt Artifact

Status: **PRESERVED — GOVERNING INSTRUCTION RECORD**

Frozen: 2026-08-21

Provenance note: this file is the canonical preserved copy of the instruction
artifact directing the Milestone 3 acceptance-recovery execution. It records the
governing requirements as preserved in the executing session's anchored context.
It is not claimed to be a byte-exact transcript of the original chat message; it
is the authoritative enumeration of every binding rule that directed this work,
preserved so that execution can be audited without hidden chat history. Its
SHA-256 is recorded in `internal_docs/AI_INSTRUCTION_PROVENANCE.md`.

## 1. Task definition

Repair the existing Milestone 3 POC in `/home/glompy/Desktop/OTHER_PROJECTS/EA`
(main branch, work confined to the `poc/` subdirectory plus the two governing
internal_docs artifacts named below) into a horizontally partitioned Nchan
fan-out topology that:

1. passes the full test suite;
2. produces a fresh repeated 100,000-viewer qualifying campaign
   (`GLOBAL_RUNS=3`, seeds 42/43/44) with machine verdict **ACCEPT**;
3. ends with the milestone tracker updated to DONE—ACCEPT and a final report in
   the frozen format.

## 2. Starting state and git rules

- Start point: main branch at commit `4cae3b0764c47a72519c36bb6efc262bfb28a11e`.
- Sync first with `git fetch && git checkout main && git pull --ff-only`.
- Never work in detached HEAD; use feature branches merged back to main with
  `--no-ff` when committing.
- A prior session's uncommitted repair work was lost; its surviving pieces must
  be re-derived and re-verified against HEAD, never assumed present.

## 3. Historical evidence preservation

- The q5 campaign `m3-c89159e88822-q5` (source
  `c89159e8882206de9fffa2b170a38d76854288ce`, contract v2.0.5, verdict
  INCONCLUSIVE) is immutable historical evidence preserved at
  `internal_docs/m3_evidence/m3-c89159e88822-q5/`.
- No file in that directory may be modified.
- No result-shopping: the new campaign does not retroactively reinterpret q5.

## 4. Contract versioning

- `poc/internal_docs/EXPERIMENT_CONTRACT_v2_0_6.md` remains frozen/historical.
- The new canonical contract must be version **v2.1.0**, written fresh, and the
  single version producer `runner/src/domain/active-contract.ts` must be bumped
  to it. v2.0.x results can never qualify as v2.1.0 evidence.

## 5. Frozen workload and gates (unchanged from v2.0.5/§inheritance)

- 8 live matches; ~10 events/s steady; ~50 events/s burst; hot-match case.
- 100,000 concurrent SSE viewers (4 generator shards × 25,000).
- +40,000 viewer surge within 120 seconds.
- Full-history late join ≤ 2,000 ms p95.
- Zero missing sequences, zero duplicates, zero out-of-order deliveries.
- fan_out_p95 ≤ 500 ms; burst_fan_out_p95 ≤ 1,000 ms; late_join_p95 ≤ 2,000 ms.
- Thresholds are never raised or weakened to make a run pass.
- Campaign: exactly 3 qualifying global runs, seeds 42, 43, 44 contiguous.

## 6. Architecture direction (repair ladder)

Preferred ladder, in order:
1. multi-Nchan partitioning (horizontal fan-out nodes);
2. routing/publication model fix;
3. Redis interaction fix;
4. more partitions / capacity isolation;
5. alternative fan-out technology (only with recorded evidence that 1–4 fail).

Chosen entry point: 4 partition nodes × ~25,000 viewers each plus one spare
replacement node, shared Redis as the canonical store (Model A replicated
channels). Publication ownership stays single-owner: the publisher-owner shard
publishes each event exactly once; Redis propagates to all partition nodes.

## 7. Restart/replacement semantics redesign

Restarting a node carrying live viewers produces server-initiated disconnects,
which are hard-gated to zero. Therefore the restart scenario must be
partition-targeted with planned drain:

- shard P deliberately drains its own viewers first (deliberate/planned
  accounting, not server-initiated);
- the owner polls partition P's health until its active population reaches the
  drained threshold before triggering the restart via P's control server;
- after recovery, drained viewers fail over to the spare node resuming with
  Last-Event-ID exact-range replay; the owner's probe also resumes directly on
  partition P (both paths required, as in v2.0.6);
- unaffected partitions continue serving untouched throughout.

In-phase coordination uses polling because coordinator barriers are one-shot
per phase:boundary and cannot be reused inside a phase.

## 8. Late-join semantics

Per-partition late-join samples replace the single-sample interpretation: each
shard performs one late-join sample against its own partition node; the owner
prefills the frozen range; non-owner shards derive their frozen range from
observed canonical heads. Exactly one sample per shard per valid global run.

## 9. Host reality checks

- The q5 host exposed fewer physical CPUs than the sum of configured container
  quotas. Before any qualifying campaign, record host CPU count, RAM, kernel,
  Docker version, and verify the chosen topology's quota sum against reality.
- Compose limits are not reservations; oversubscription must be acknowledged
  in evidence, not hidden.

## 10. Probe ladder (non-qualifying)

Development probes at 10k → 25k → 50k → 75k → 100k validate machinery before
any qualifying attempt. Dev probes are non-qualifying scratch runs; they are
separated from the qualification loop. Code is never modified mid-campaign.

## 11. Required test suite before qualification

All of the following must pass on the final source:
- TypeScript typecheck;
- the complete unit/integration test suite (no skipped failures);
- `docker compose config --quiet` for every compose file;
- `bash -n` syntax check for every launcher script;
- `git diff --check`;
- new §21-style partition-specific tests (ownership, routing, aggregation,
  cross-node history, failure/replacement, resource accounting).

## 12. Documentation obligations

- Reopen Milestone 3 as IN PROGRESS in
  `internal_docs/LIVE_MATCH_CENTRE_ASSIGNMENT_MILESTONES (3).md`; the milestone
  name stays "Milestone 3" — no "M3b" may be created.
- Append a supersession note to
  `poc/internal_docs/MILESTONE_4_INCONCLUSIVE_RECONCILIATION.md` recording that
  Terminal A is being acted on by this recovery, without rewriting history.
- Save this prompt artifact at
  `internal_docs/MILESTONE_3_ACCEPTANCE_RECOVERY_PROMPT_ARTIFACT.md` and update
  `internal_docs/AI_INSTRUCTION_PROVENANCE.md` with its SHA-256.
- Generated evidence, node_modules, dist, and build output must never be
  committed into `poc/`.

## 13. Execution discipline

- Do not stop on REJECT/INCONCLUSIVE: diagnose → fix → test → freeze → rerun.
- Do not ask the user whether to continue; the loop continues until ACCEPT or a
  genuinely blocking environment limitation is proven and documented.
- Qualification runs use the detached launcher with exit-status capture.
- Terminal audits (zero-gap) are performed before declaring completion.
- The final response follows the frozen report format; the literal terminal
  sentence "there is absolutely nothing else for me to do" may be used only
  when every item above is complete and verified.
