# Campaign m3-c89159e88822-q3 — INVALIDATED (external interruption, plan §29)

## Why invalidated

The host machine **rebooted** at 2026-08-20 22:12:30 local time while the campaign was
mid-run-0 (seed 42). All campaign containers died simultaneously with exit 255
(`docker ps -a` after reboot), including unrelated pre-existing containers — consistent
with a host-level event, not a DUT failure. The global-evidence volume
`m3-c89159e88822-q3_global-evidence` is empty; no run result JSON was produced; the
machine classifier never spoke.

Per plan §29: an external interruption that destroys measurement validity invalidates
the whole qualifying campaign. No partial runs are preserved.

## Artifacts belonging to this invalid attempt

- `campaign-console.log` — full console stream up to host death (ends mid-run-0,
  reconnect failures at container-time 02:01, nchan Redis NULL-reply errors as the
  host went down)
- `command.txt`, `environment.txt`, `frozen-campaign-policy.txt`,
  `gate-b-fresh-volume-proof.txt`, `launcher-pid.txt`, `campaign-start-timestamp.txt`

## Replacement

Replacement campaign began as `m3-c89159e88822-q4` (fresh unique Compose project +
evidence volume identity, proven new before launch). Same frozen source SHA
`c89159e88822…`, same contract v2.0.5, same frozen parameters
(GLOBAL_RUNS=3, BASE_GLOBAL_SEED=42), rerun from run 0.
