# m3-c89159e88822-q5 — QUALIFYING CAMPAIGN (launched)

Replacement for q4 (pre-measurement launch failure: stale reboot-leftover network
held pinned subnet 172.28.0.0/16; dead artifacts removed, frozen compose untouched)
and q3 (host reboot mid-run-0, §29 external interruption).

## Launch record
- Frozen command (identical to command.txt):
  `cd poc && GLOBAL_RUNS=3 BASE_GLOBAL_SEED=42 COMPOSE_PROJECT_NAME=m3-c89159e88822-q5 ./run-evidence-100k.sh`
- Launched fully detached (`setsid`, own session) so no tool timeout can interrupt:
  lesson learned from q1.
- Launcher PID recorded in launcher-pid.txt (session leader).
- Source SHA frozen for whole campaign:
  c89159e8882206de9fffa2b170a38d76854288ce
- Pre-launch proofs: see frozen-campaign-policy.txt and gate-b-fresh-volume-proof.txt
  (q5 storage counts all 0; pinned subnet free before launch).

## Expected sequence
3 sequential global runs (seeds 42/43/44) + machine aggregation.
Console captured live in campaign-console.log.

## Disposition
COMPLETED 2026-08-20 23:20 -04:00. Machine aggregator verdict: **INCONCLUSIVE**
(run 0 global abort 0/4 shards; runs 1-2 invalid on generator saturation; dispersion
173% >> 15%; surge establishment collapse; peak 65-66k < 100k target). Evidence
exported from the volume, console↔volume match verified, checksums in
`checksums.sha256`, full results in `MILESTONE_3_EVIDENCE_MANIFEST.md`.
No human override applied. Result handed to Milestone 4.
