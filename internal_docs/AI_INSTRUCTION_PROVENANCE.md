# AI Instruction Artifact Provenance (§AN/§BQ)

## Preserved instruction artifact — Milestone 2

```text
artifact path:    internal_docs/MILESTONE_2_CLOSE_GAP_PROMPT_ARTIFACT.md
SHA-256:          537359cdbf0c46cbc3daefcdc6a44968704a285c982708df04b063f9b7f39389
first-use commit: (pre-implementation — this record created during Milestone 2 closure)
purpose:         AI instruction artifact governing Milestone 2 gap closure for the Live Match Centre POC
```

## Preserved instruction artifact — Milestone 3

```text
artifact path:    internal_docs/MILESTONE_3_ASSIGNMENT_SYNCED_EXECUTION_PLAN_v2_FINAL.md
SHA-256:          dd45e96c1ba86ac2808355beedb616f718ef0be6e43a9101fc706b850aa24700
first-use commit: (see git history — recorded at M3 execution start, before qualifying run 0)
purpose:          AI instruction artifact directing Milestone 3 execution (run the frozen POC,
                  produce defensible evidence) for the Live Match Centre POC. This exact copy was
                  used to direct AI-assisted M3 execution; it is preserved unmutated per §25.1 of
                  the plan itself.
```

## Preserved instruction artifact — Parallel M3 safe work

```text
artifact path:    internal_docs/PARALLEL_M3_SAFE_WORK_100_PERCENT_PROMPT_ARTIFACT.md
SHA-256:          c6d14806fc394852035c3f95929fb6db79c804073ef6e66faa3554808da7aee1
first-use commit: (recorded at parallel work start, before any parallel tasks executed)
purpose:          AI instruction artifact directing parallel work while M3 runs —
                  covers M4 reconciliation framework, M5 evidence/cost model,
                  M6 proposal draft, M7 README draft, M8 audits, M9 cleanup inventory,
                  M10 submission manifest, and final audit passes. This exact copy was
                  used to direct AI-assisted parallel execution.
```

## Preserved instruction artifact — Milestone 3 acceptance recovery

```text
artifact path:    internal_docs/MILESTONE_3_ACCEPTANCE_RECOVERY_PROMPT_ARTIFACT.md
SHA-256:          c96c76569901ae8cf1e28caa015511982e38b7563bd77ce0107a287072adf84d
first-use commit: (recorded at recovery execution start, before any qualifying run)
purpose:          AI instruction artifact directing the Milestone 3 acceptance-recovery
                  execution — repair the POC into a 4-partition horizontal Nchan fan-out
                  topology, freeze contract v2.1.0, and produce a fresh repeated
                  100,000-viewer qualifying campaign with machine verdict ACCEPT.
                  This copy is the canonical preserved record of the governing
                  instructions; it enumerates every binding rule as preserved in the
                  executing session's anchored context.
```

## Preserved instruction artifact — M4–M7 closure (v10 terminal-sync)

```text
artifact path:    internal_docs/MILESTONES_4_5_6_7_CLOSE_100_PERCENT_OVERNIGHT_PROMPT_ARTIFACT.md
SHA-256:          e3e31916164ab700bc76beca9712fa428f269709ba76a13c923ceb2ef30bf597
first-use commit: d42d4718c89b5b7288ada0bcb9d1b8c28ffec7a8 (terminal M3 verdict commit)
purpose:          AI instruction artifact directing the M4–M7 100% closure execution
                   (architecture reconciliation, external-evidence/cost closure, proposal.md,
                   README.md, source/result coherence). This exact copy was used to direct
                   M4–M7 execution; it is preserved unmutated per the prompt's §5.
```

## Rules

- The preserved copy at `internal_docs/MILESTONE_2_CLOSE_GAP_PROMPT_ARTIFACT.md` must never be modified.
- Its SHA-256 is the canonical identifier for this instruction generation.
- The final packaging milestone may include this exact artifact as required by the assignment.
- Do not reconstruct this artifact from memory; use only the preserved copy.
- The same rules apply to `internal_docs/MILESTONE_3_ASSIGNMENT_SYNCED_EXECUTION_PLAN_v2_FINAL.md`:
  the preserved copy is immutable; its SHA-256 above is its canonical identifier.
- The same rules apply to `internal_docs/PARALLEL_M3_SAFE_WORK_100_PERCENT_PROMPT_ARTIFACT.md`:
  the preserved copy is immutable; its SHA-256 above is its canonical identifier.
- The same rules apply to `internal_docs/MILESTONE_3_ACCEPTANCE_RECOVERY_PROMPT_ARTIFACT.md`:
  the preserved copy is immutable; its SHA-256 above is its canonical identifier.

## Preserved instruction artifact — Final non-M3 requirement closure (this execution)

```text
artifact path:    internal_docs/FINAL_TAKEHOME_NON_M3_REQUIREMENT_CLOSURE_PROMPT_ARTIFACT.md
SHA-256:          dcfd6965d3cec4d6ed90a54ab7416bdc61fbd54f881cd6f275322afd64067ce0
first-use commit: e18246e494476efd3afc4907e99c48ec3b4393de (execution-start HEAD)
purpose:          AI instruction artifact directing the final non-M3 requirement closure:
                  requirements audit, production-design coherence audit, proposal/README
                  finalization, POC packaging/reproducibility, explainability audit (M8),
                  clean staged submission (M9), and final ZIP construction + clean-room
                  verification (M10). M3 is explicitly out of scope.
```
