# Aborted campaign m3-43f4d9649d8b-q2 — NON-QUALIFYING (harness defect, plan §28)

Frozen identity: source SHA 43f4d9649d8b7130b9c61dd63b0e06282efb7111, contract v2.0.5,
GLOBAL_RUNS=3, BASE_GLOBAL_SEED=42. Run 0 (seed 42) started 21:31 local.

## What happened
Run 0 executed preflight/warmup/steady normally (warmup PASS, steady PASS), then:
1. connection-surge FAILED on all four shards (~30-40% of surge connections established;
   nchan-1 repeatedly logged "32768 worker_connections are not enough" during the ramp);
   barrier semantics made every shard wait for the slowest (surge overran by up to ~88 s).
2. late-join canonical prefill took ~139 s on this host.
3. The shard runner's HARDCODED safety deadline MAX_RUN_MS = 600 s
   (poc/runner/src/main.ts:178) fired mid-burst at 01:41:48 ("§BS: Maximum run deadline
   (600s) reached — forcing shutdown"), shards exited code 2 before completing the frozen
   phase sequence, compose --abort-on-container-exit tore the stack down, and the
   coordinator was killed before persistGlobalResult() could run.
4. Result: NO global-result JSON exists for run 0; the machine classifier never produced a
   simultaneous-global-run verdict. Runs 1-2 would deterministically repeat this.

## Classification of the attempt
This is a measurement/harness defect per plan §28 ("measurement field impossible/null due
harness bug"; the machinery's own hang-safety valve destroys the frozen experiment on a host
where valid phase overruns occur), NOT a REJECT against Nchan. The surge establishment
collapse itself is genuine measured evidence recorded in the preserved console log and will
be re-measured by the corrected harness.

## Minimum fix applied after this preservation (M2 loop-back)
Make the runner deadline env-configurable (RUNNER_MAX_RUN_MS, default 600000 unchanged) and
set generous coordinated-profile ceilings in compose.evidence-100k.yaml
(RUNNER_MAX_RUN_MS=1800000 on shards, COORDINATOR_MAX_RUN_MS=2100000 on coordinator).
No experiment criterion, threshold, workload, phase duration, or classification semantic is
changed; single-run/smoke defaults are untouched.
