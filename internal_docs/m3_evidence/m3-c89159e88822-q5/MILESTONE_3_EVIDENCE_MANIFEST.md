# MILESTONE_3_EVIDENCE_MANIFEST — m3-c89159e88822-q5

## Status

- Campaign: `m3-c89159e88822-q5`
- Qualifying status: PENDING (filled after campaign exit + §24/§25 validation)
- Source SHA: `c89159e8882206de9fffa2b170a38d76854288ce` (frozen HEAD, main)
- Contract version: v2.0.5
- Date/time (UTC start): 2026-08-20 22:21 (host local; container logs UTC 2026-08-21 ~02:2x)

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

## Results (filled post-campaign)

| Field | Value |
|---|---|
| process exit status | TBD |
| per-run verdicts | TBD |
| campaign verdict | TBD |
| dispersion (worst CV) | TBD |
| global active peak | TBD |
| fan-out p95/p99 | TBD |
| burst p95 | TBD |
| late-join p95 | TBD |
| surge result | TBD |
| correctness counters | TBD |
| reconnect result | TBD |
| slow-consumer result | TBD |
| restart literal result | TBD |
| restart cross-node result | TBD |
| Nchan resource peaks | TBD |
| Redis resource peaks | TBD |
| generator validity | TBD |
| INCONCLUSIVE reasons | TBD |

## Artifact hashes

Filled into `checksums.sha256` after export from the evidence volume (§22.1).
