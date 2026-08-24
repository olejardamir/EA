# M3 ACCEPT PUSH — FINAL FINDINGS (2026-08-24): FULL FALSIFICATION

## Decision
**M3 frozen-v2.3.0 ACCEPT is UNATTAINABLE under the allowed changes
(Nchan/Nginx/Redis config + harness fixes that do not touch contract,
topology, version, workload, or gates).** Finalize verdict = FALSIFIED;
keep F1 as best; do NOT change `live-match-centre-submission.zip`
(sha256 24450a3db3449800d91c2b9b14f7a594434a3bda57ba40a112db25e93b8e9723).

## Why (frozen gates from EXPERIMENT_CONTRACT_v2_3_0.md)
- fan_out p95 <= 500ms (§16, §63)
- burst p95 <= 1000ms (§16, §63)
- late_join p95 <= 2000ms (§16, §51, §63)
- publication_rates: steady 8..12, **burst 40..60** (§86) — frozen window
- campaign dispersion: CV <= 0.15 on {global_active_peak, fan_out p95,
  late_join p95, burst p95} (§57); >0.15 = INCONCLUSIVE

## Empirical evidence (current commit 870f3f2 = HEAD of m3-accept-push)
Real full-duration F1 run (compose.evidence-100k.yaml, LIVELOCK_WATCHER=0,
seed 42), `evidence-launches/realf1-1787540834/global-result-0.json`:
- fan_out p95 = **8887ms** (gate <=500 → FAIL, 18× over)
- burst p95   = **6430ms** (gate <=1000 → FAIL)
- late_join p95 = 1135ms (gate <=2000 → OK, but dispersion is the killer)
- burst accepted rate = **14.63/s** (gate [40,60] → FAIL)
- per-run validity ALSO fails on: publisher ambiguous failures 4!=0;
  restart target-shard 3 failover-drill evidence invalid;
  shard 2 reconnect 56/64 (not 64/64)
VERDICT: INCONCLUSIVE.

## Regression vs prior campaign (commit d54b74b13fb9, ancestor of HEAD)
`internal_docs/m3_evidence/ea-evidence-100k-d54b74b13fb9-.../campaign-result.json`:
- prior F1-equivalent: fan_out p95 ~2757ms, burst accepted ~34–39.5/s
- current HEAD: fan_out p95 8887ms (3× worse), burst 14.63/s (2.5× worse)
- prior campaign verdict: INCONCLUSIVE due to **late_join p95 dispersion
  CV=0.422** (threshold 0.15) — even the prior "best" could not converge.
The commits between (incl. 97c11f7 DNS fix, 2af0c65 docs) regressed
publisher throughput and fan-out materially. Even fully restored to the
prior best, M3 STILL fails: 2757ms > 500ms gate and 39.5/s < 40/s floor.

## Candidate matrix results (exhaustive where decisive)
- **N1** (nostore on live /sub/): late-join 0–8/64 passed → BREAKS history
  (Nchan 1.3.8 source-confirmed: storage_mode binds to channel head;
  NOSTORE = NCHAN_SPOOL_PASSTHROUGH, no replay). Unusable.
- **B1** (p0 backup; p1–p3 distributed): late-join 64/64 fixed, BUT
  fan_out p95=5600ms (probe) and adds Redis write to publish path →
  regresses tail latency vs F1. Not viable.
- **N2/N5/B2** (nostore variants): source + N1 empirical proof = late-join
  breakers. No need to burn 40-min campaigns.
- **D1** (idle_channel_cache_timeout), **R1** (Redis threads): ambiguous;
  no telemetry evidence of channel-reinit churn or Redis main-thread
  saturation surfaced. Irrelevant to the dominant blockers (fan_out 8887ms,
  burst 14.6/s, late-join dispersion).
- Harness H-candidates: the blocking gates (burst [40,60], late-join
  dispersion, restart-drill evidence) are HARD FROZEN gates/workload I am
  forbidden to change. The only harness fix that could help (restore the
  publisher throughput regression) would at best reach ~37/s — still <40.

## Structural impossibility
No allowed change can bring fan_out p95 8887ms → 500ms, nor lift burst
accepted rate to >=40 (best historical 39.5). These are architecture-level
(per-publish Redis round-trip + cross-partition fan-out), not tunable via
storage_mode or the allowed harness fixes. nostore would fix latency but
destroys late-join history (contract violation). The two requirements are
mutually exclusive under the frozen topology.

## Actions taken
- Branch m3-accept-push created; nchan config left at F1 baseline (no
  storage_mode directives) — reverted from all candidates.
- Preserved prompt artifact, source-supported candidate assessment, and
  this findings file under poc/internal_docs/m3_evidence/accept-push/.
- Submission ZIP intentionally UNCHANGED.

## Recommendation
M3 ACCEPT is not obtainable at frozen-v2.3.0 with the allowed surface.
Options outside this task's constraints (require contract/version change):
(a) relax fan_out/burst gates, (b) change topology (e.g., in-process
fan-out, multi-Redis, or push without cross-partition Redis hop), or
(c) accept that F1 is the validated optimum and close M3 as unreachable.
