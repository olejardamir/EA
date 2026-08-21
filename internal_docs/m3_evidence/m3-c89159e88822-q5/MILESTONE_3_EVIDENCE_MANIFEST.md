# MILESTONE_3_EVIDENCE_MANIFEST — m3-c89159e88822-q5

## Status

- Campaign: `m3-c89159e88822-q5`
- Qualifying status: QUALIFYING CAMPAIGN COMPLETED — machine verdict **INCONCLUSIVE** (§20: generator/environment/measurement prevented a defensible conclusion; do not proceed as if Nchan passed; hand to M4)
- Source SHA: `c89159e8882206de9fffa2b170a38d76854288ce` (frozen HEAD, main)
- Contract version: v2.0.5
- Date/time (UTC start): 2026-08-20 22:21 (host local; container logs UTC 2026-08-21 ~02:2x)
- End: 2026-08-20 23:20:20 -04:00 (last console write; see campaign-end-timestamp.txt)

## Host

- TUXEDO OS, kernel 5.5.0-108029-tuxedo, 12 CPUs, 46Gi RAM
- Docker Engine: 29.7.2
- Docker Compose: v7.0.0 (docker compose v2 plugin 5.5.0 CLI report: `v7.0.0`)

## Command

See `command.txt` (exact frozen command). Launcher: `poc/run-evidence-100k.sh`, fully detached via `setsid`, console captured to `campaign-console.log`.

## Frozen campaign parameters

- GLOBAL_RUNS: 3
- BASE_GLOBAL_SEED: 42 (per-run seeds 42 / 43 / 44)
- Project identity: `m3-c89159e88822-q5` (fresh volumes proven by Gate B record)

## Prior attempt lineage (§28/§29 records)

- q1 (`m3-43f4d9649d8b-q1`): §29 external interruption — tool timeout SIGINT killed launcher process group pre-observation.
- q2 (`m3-43f4d9649d8b-q2`): §28 harness defect — hardcoded 10-min shard deadline destroyed measurement mid-burst; fixed in `c89159e88822` (env-configurable runner deadline; coordinated ceilings set in compose).
- q3 (`m3-c89159e88822-q3`): §29 external interruption — host reboot killed all containers simultaneously during run 0; no results produced.
- q4 (`m3-c89159e88822-q4`): launch failure pre-measurement — Docker network pool exhaustion from stale q3 network; cleaned up.
- q5 (this campaign): fresh identity, fresh volumes, deadlines fixed.

## Results (measured, post-campaign)

| Field | Value |
|---|---|
| process exit status | non-zero (derived — see `process-exit-status.txt`; machine verdict governs per §30) |
| per-run verdicts | run 0 INCONCLUSIVE (global abort: "shard 0: fetch failed", 0/4 shard results); run 1 INCONCLUSIVE; run 2 INCONCLUSIVE |
| run invalidity reasons | all 4 shards in runs 1–2: "generator CPU/event-loop saturation; shared-kernel clock reachability invalid" |
| campaign verdict | **INCONCLUSIVE** ("global runs missing exact restart structured evidence: 0,1,2"; any invalid/inconclusive run forces campaign INCONCLUSIVE) |
| dispersion (worst CV) | 173.2% vs frozen 15% threshold — global_active_peak CV 86.6%, fan_out_p95_ms CV 87.0%, late_join_p95_ms CV 173.2% → unstable |
| global active peak | run 0: 0 (aborted pre-alignment); run 1: 65,015; run 2: 66,251 (frozen target 100,000 — never reached) |
| fan-out p95/p99 | run 1: 1135 / 5632 ms; run 2: 1267 / 3129 ms (frozen gate ≤500 ms — exceeded; ~41.6M / 33.2M samples, 0 overflows) |
| burst p95 | merged `burst_fan_out_p95_ms` not produced (null in structured evidence); shard-local burst detail e.g. "fan-out p95=0ms" at local 15k population — classifier owned the gate |
| late-join p95 | run 1: 762 ms but only **1** histogram sample; run 2: 0 samples — gate ≤2000 ms nominally met with statistically empty evidence |
| surge result | FAILED on every shard in every completed run: e.g. run 1 shard 2 = 5659/13696 established (41%), elapsed 162.7 s vs 120 s (+42.7 s timing error); run 0 shard 3 = 3582/12095 (30%), 227.2 s; nchan-1 logged "32768 worker_connections are not enough" continuously during ramps (~450 warnings total) |
| correctness counters | run 1: duplicates=1,910,652, reconnect_gaps=103,197; run 2: missing_sequences=123, duplicates=1,179,447, reconnect_gaps=51,859 (consequences of DUT connection-reuse under worker_connections exhaustion + generator saturation) |
| reconnect result | passed=false in runs 1 and 2 (gaps above; repeated "Reconnect failed for connection NNN") |
| slow-consumer result | passed=false in runs 1 and 2 (scenario active_min fell to 36,591 / 66,211 during phase) |
| restart literal result | exact structured record present and passing (publisher-owner shard) in runs 1 and 2; scenario active_min=0 recorded |
| restart cross-node result | same as literal: exact structured record present and passing in runs 1 and 2 |
| Nchan resource peaks | memory pinned at container cap: run-scoped peak 8,589,934,592 B (=8 GiB cap), lifetime peak ≈8.602–8.608 GB; CPU quota 4 CPU (400000/100000), raw cpu%% peak ≈13,792–13,823 (≈34,500% of quota → hard throttling); nginx worker fd soft/hard 200000 |
| Redis resource peaks | merged resource evidence: memory_used_bytes=null (metric unavailable in merged result — recorded honestly; one of the §18 inconclusive conditions) |
| generator validity | INVALID on all 4 shards in runs 1 and 2 (CPU/event-loop saturation + shared-kernel clock reachability) — no ACCEPT permitted per §18 |
| INCONCLUSIVE reasons | run-level validity invalid ×3; campaign restart-evidence rule; dispersion 173% > 15%; surge establishment collapse; global peak <100k; Redis memory metric unavailable |

### §24 identity validation

Independent validation (re-run post-export): all identity fields PASS for
global-result-1/2 and campaign-result.json (contract v2.0.5, scopes, run_index/seed
42+N, target 100000, shard_count 4, frozen SHA, participating [0,1,2,3], exactly one
publisher owner = shard 0). global-result-0 truthfully records
`participating_shard_ids: []` — the machine-recorded global abort, not an integrity
violation; it is one of the three INCONCLUSIVE runs.

### §22.1 console ↔ volume verification

- run 0 global result: console emission (line 2154) semantically identical to volume
  file (canonical `jq -S` SHA-256 match).
- campaign result: console emission (line 7677, 13,458,577 B) semantically identical
  to volume file (canonical hash match).
- runs 1/2 global results: coordinator stdout emissions truncated at exactly 65,537 B
  (pipe flush loss at process exit). First 65,536 bytes are byte-identical to the
  compact serialization of the exported volume files (verified). The Docker-volume
  files are the canonical persisted copies (written via write-temp+rename before
  emission).

### Aggregator strictness observation (M4 input, no reclassification)

The campaign restart rule requires `details.every(hasExactRestartStructuredEvidence)`.
Non-publisher shards contribute "not-participating" details with `structured.paths={}`,
so the rule cannot pass in any run where non-owner shards report the scenario. This did
not change the verdict: the campaign is already INCONCLUSIVE on independent grounds
(invalid generators ×3 runs, dispersion, surge collapse, sub-target peak). Recorded for
M4/M2 follow-up only.

## Evidence-level classification of decisive values (§5.1)

```text
PDF assignment facts:      100k viewers; +40k/120s; 8 matches; ~10/s steady; ~50/s burst;
                           history <=2s; goal p95 <=2s ingest->screen
Derived values:            60k pre-surge; 4x25k shards; seeds 42/43/44
Frozen experiment choices: GLOBAL_RUNS=3; base seed 42; CV<=15%; 500ms/1000ms/2000ms gates;
                           phase durations; slow-consumer band; resource envelopes
Local measurements:        all values in the Results table above (this campaign only)
Production inferences:     NONE may be drawn from this campaign (INCONCLUSIVE)
```

## M3 result block for later README/proposal use (§26)

```text
ASSUMPTION
A Nchan + shared Redis OSS + native SSE delivery layer can sustain the
assignment-mapped live-match workload at 100,000 simultaneous viewers (including the
+40,000-viewer/120 s kickoff surge) while preserving ordering/replay, bounded
slow-client behavior, acceptable late join, and delivery latency — without the
generator or host invalidating the measurement.

METHOD
Frozen contract v2.0.5 at source c89159e8882206de9fffa2b170a38d76854288ce.
Coordinated 4-shard x 25,000-viewer topology, one publisher owner, frozen phases
(preflight->warmup->steady->surge->target-barrier->stabilization->late-join->burst->
post-burst->reconnect->slow-consumer->restart-replacement->final-metrics),
GLOBAL_RUNS=3, seeds 42/43/44, fresh Compose project identity, machine-owned verdict.

RESULT
Campaign verdict: INCONCLUSIVE (machine classifier; no manual override).
The measurement was invalidated before DUT capacity could be fairly judged:
all four generator shards saturated (CPU/event-loop) in runs 1-2, run 0 aborted
(shard fetch failure, 0/4 results), cross-run dispersion 173% >> 15%, global active
peak reached only 65,015-66,251 of 100,000, and the surge established only ~30-41%
of attempted connections while nchan exhausted its frozen 32,768-per-worker
connection limit. Valid REJECT against Nchan capacity was NOT declared because
generator/environment validity failed first (§18 precedence).

PROPOSAL IMPACT INPUT
M4 must decide whether to (a) correct the harness/generator so a valid measurement
is possible (loop back toward M2/M3 per §28/§32), and separately (b) treat the
measured nchan worker_connections exhaustion at <100k connections as architecture
input. No production inference is licensed by this campaign.

LIMITATIONS
No real provider feed/schema; single-host Linux networking (not EU/NA Internet);
no browser render path; no controlled 100-vs-100k differential test; no >100k
capacity-knee measurement; no AWS deploy/cost proof. The 100-viewer portable smoke
elsewhere is a validation profile, not qualifying evidence.
```

## Artifact hashes

See `checksums.sha256` (20 raw artifacts incl. exported JSONs, console log,
per-shard machine JSON extractions, and campaign records).
