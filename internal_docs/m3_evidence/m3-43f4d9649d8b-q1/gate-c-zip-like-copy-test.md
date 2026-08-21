# Gate C — assignment one-command / ZIP compatibility (plan §8)

## Initial state at audited M2 baseline a9d5ce2
`git archive HEAD poc` extracted to a temp dir with no `.git`, no node_modules.
`./run-smoke.sh` aborted immediately: `git rev-parse --show-toplevel` fails outside
a repository (exit 128). All three launchers required git => M3 BLOCKED per §8.1.

## Minimal M2 reproducibility fix (commit fbdfd24)
Launchers now resolve provenance as: live checkout HEAD, else packaged
`poc/SOURCE_COMMIT` file (40-hex validated; "unknown" never emitted), else exit 2.
`poc/SOURCE_COMMIT` is gitignored. Runner typecheck clean; 372/372 tests pass.

## Proof from ZIP-like copy of fbdfd24 (launcher code identical at 43f4d96)
1. no .git + no SOURCE_COMMIT  -> exit 2 with explainable error, docker never invoked
2. no .git + SOURCE_COMMIT=<sha> -> provenance resolved, compose invoked
3. REAL portable smoke from the copy, container runtime only:
   COMPOSE_PROJECT_NAME=m3ziptest-smoke ./run-smoke.sh
   -> exit 0; verdict NOT_APPLICABLE (measurement-only smoke);
      build_identity.git_commit_sha = fbdfd24e7b8de7a93aa0e484bf0655411607bf6d
      contract_version v2.0.5; all phases executed; literal restart replay 8/8 passed.

Diff fbdfd24..43f4d9649d8b (frozen qualifying SHA) touches only internal_docs files
(AI-instruction artifact preservation) — zero POC code/config/contract changes, so the
launcher validation above remains valid for the frozen qualifying SHA.
