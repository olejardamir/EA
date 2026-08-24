# M3 ACCEPT PUSH — corrected findings (2026-08-24)

## Methodology correction (critical)
`poc/run-probe.sh` is EXPLICITLY "Never used for qualifying evidence (contract
v2.1.0)" — it shortens phase durations. This deflates `burst_accepted_per_sec`
(my probe runs: ~15/s) versus the REAL campaign (prior campaign `d54b74b13fb9`:
34–39.5/s). Probe runs are dev smokes only; qualification requires the real
`runner` global-campaign (3 runs, seeds 42/43/44, full phase durations).

## Empirical results (probe smokes — directional only)
- **N1** (nostore on live /sub/): late-join 0–8/64 passed → BROKEN (source
  confirmed: storage mode binds to channel head; nostore = NCHAN_SPOOL_PASSTHROUGH
  = no history). INCONCLUSIVE.
- **B1** (p0 backup, p1–p3 distributed), 100k: late-join 64/64 (fixed!) BUT
  fan_out p95=5600ms (vs F1 2156ms) — B1 REGRESSED tail latency (backup adds
  Redis write to publish path). Burst-rate gate also failed. INCONCLUSIVE.
- **F1 baseline** 100k: fan_out p50=332/p95=2156/p99=4761; late-join passes;
  burst p95=3393. Same two harness validity gates fail (burst rate 15/s, restart
  drill) — but those are PROBE artifacts (shortened phases), not real failures.

## Real campaign (prior `ea-evidence-100k-d54b74b13fb9`) — actual blockers
- `verdict: INCONCLUSIVE`, `global_direct_accept_eligible: false`.
- `validity: {valid: true, reasons: []}` at CAMPAIGN level (per-run burst-rate
  gate is NOT the campaign killer).
- **Killer: dispersion.** `threshold_cv=0.15, stable=false, worst_cv=0.4224505`
  from `late_join_p95_ms` (CV 0.422 ≫ 0.15). fan_out/burst CVs ≈ 0.
  → The 3 terminal-seed runs have INCONSISTENT late-join p95. That alone makes
    the campaign INCONCLUSIVE.
- Per-run burst-rate gate: prior real runs hit 34.00 / 37.45 / 39.50 events/s
  (JUST under the frozen [40.0, 60.0] window in `global-coordinator.ts:697`).
  So even per-run, burst rate is marginal.

## Source-confirmed candidate verdicts (Nchan 1.3.8, sha256
## 86e40f97bf380cb81d62c279aa0f992c2d8c93ebcfe242cf0be95e5b6ade9a98)
- N1/N2/N5 nostore → breaks late-join history (channel-head-bound storage mode).
- B1 (single backup) → fixes late-join but REGRESSES publish/latency tail.
- B2 → broken (non-owner nostore).
- D1 (idle_channel_cache_timeout), R1 (Redis threads) → ambiguous, evidence-driven.

## Strategic pivot
The Nchan storage_mode matrix is NOT the lever for the real blockers:
- Real blocker #1 = late-join p95 dispersion across seeds (CV 0.42). Need to find
  WHY late-join p95 varies run-to-run (timing/Redis state/partition race).
- Real blocker #2 = burst accepted rate just under 40 (throughput, not a gate we
  can change). Need to lift Nchan publish throughput OR fix a harness measurement
  bottleneck.

## Open questions (investigation)
1. How to launch the REAL 100k global campaign (full durations, 3 seeds) via
   `runner` (`aggregate:global-campaign` = `global-campaign.ts`), not run-probe.sh.
2. What drives `late_join_p95_ms` dispersion CV 0.42 across seeds 42/43/44?
3. Is `burst_accepted_per_sec` Nchan publish throughput or a loadgen/harness
   measurement artifact? Why 34–39.5 in real campaign, 15 in probe?
4. Is the `restart target-shard 3 failover-drill evidence is invalid` gate a
   harness evidence-collection bug (fixable w/o gate/workload change)?
