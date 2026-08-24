# M3 FINAL PUSH — CURRENT-STATE, DEADLINE-FOCUSED

**Repository:** `https://github.com/olejardamir/EA`  
**Scope:** Milestone 3 only, plus the minimum M3 evidence/status bookkeeping required to preserve truth.  
**Time constraint:** submission deadline is in roughly two days. Optimize for **time-to-best-defensible-M3-result**, not for exhaustive investigation.

---

# 0. Mission

Continue M3 from the **current repository state** and push it as far as legitimately possible before submission.

Do not treat the existing F1 hard-stop as the end if there remains a frozen-contract-compatible path worth measuring.

The current evidence says the broad tuning ladder has already been exhausted. The remaining worthwhile path is:

```text
fix the coordinator control-plane DNS/orchestration failure
        ↓
make nchan_redis_storage_mode backup runnable cleanly
        ↓
run one clean non-qualifying 100k probe
        ↓
if it reaches frozen gates with credible margin:
    run one full-duration 100k bridge confirmation
        ↓
    freeze exact source/config
        ↓
    run terminal seeds 42/43/44
else:
    preserve the best new evidence and stop
```

Do **not** repeat already-completed debug/watcher/worker-balance experiments.

---

# 1. Authority and frozen truth

The canonical active M3 contract is:

```text
poc/internal_docs/EXPERIMENT_CONTRACT_v2_3_0.md
```

It remains frozen.

Never change:

```text
100,000 target
60,000 baseline
+40,000 within 120 s
4 active Nchan partitions + 1 spare
shared Redis 7.2
4 Go loadgen shards
Nchan/nginx/Redis frozen component versions
fan_out p95 <= 500 ms
surge p95 <= 500 ms
burst p95 <= 1000 ms
late_join p95 <= 2000 ms
zero required correctness violations
generator validity gates
DUT validity gates
3 terminal runs
seeds 42/43/44
CV <= 0.15
verdict precedence
required evidence
all other v2.3.0 workload / cohort / identity / restart rules
```

Never relax a gate, reduce load, alter required populations, remove a correctness counter, reinterpret a result, or call a probe qualifying evidence.

---

# 2. Current state — do not redo it

At current `main`, verify rather than assume, but the expected state is:

```text
F1 validated best baseline:
  active viewers = 100,000
  correctness violations = 0
  fan_out p95 = 2757 ms
  burst p95 = 3707 ms
  surge = clean
  late_join = clean

F1 source/config baseline:
  redis --io-threads 4 --io-threads-do-reads yes
  4 Nchan partitions × 4 workers
  nchan_redis_storage_mode backup NOT enabled
```

Already completed and persisted:

```text
multi_accept off
NGINX_DEBUG default = 0
LIVELOCK_WATCHER = 0 in base qualifying path
Redis read I/O threading
non-blocking Docker logging
longer Redis command timeout
```

Already tested and rejected/regressed:

```text
sendfile_max_chunk 64k
nchan_shared_memory_size 512m
tcp_nopush off
worker_processes 8
coordinator:127.0.0.1 extra_hosts pin
broad debug/watcher investigation
```

Do **not** repeat these unless newer preserved evidence proves the premise above false.

---

# 3. The single current blocker to attack

The current M3 diagnosis records:

```text
nchan_redis_storage_mode backup
```

as the remaining promising in-contract DUT configuration because it can remove the Redis round-trip from local delivery.

Previous G1/G1b attempts did not produce a valid performance result because the run aborted at the `late-join:end` coordinator barrier with Docker embedded-DNS errors:

```text
lookup coordinator ... server misbehaving
```

The attempted fix:

```text
coordinator:127.0.0.1
```

was proven invalid because the loadgens are on the bridge network and `127.0.0.1` means the loadgen container itself.

Therefore the first task is **not another Nchan tuning experiment**.

It is:

```text
repair the coordinator control-plane addressing/resolution path
without changing DUT/workload/acceptance semantics
```

---

# 4. Submission-safety rule

The repository already contains a finalized submission ZIP.

Before M3 work:

```bash
git status --short
git rev-parse HEAD
git log -n 15 --oneline
sha256sum live-match-centre-submission.zip 2>/dev/null || true
```

Record the current ZIP hash in the M3 work log.

Do **not** overwrite or delete the existing submission ZIP during experiments.

Do not rewrite `proposal.md` or root `README.md` during tuning.

If new M3 evidence materially supersedes F1, report that at the end so the final submission package can be synchronized afterward.

Prefer an isolated branch such as:

```text
m3-final-push
```

from current `main` if that does not conflict with existing local work. Do not reset/discard user changes.

---

# 5. Preflight

Read the current versions of:

```text
poc/internal_docs/EXPERIMENT_CONTRACT_v2_3_0.md
poc/internal_docs/m3_evidence/M3_TARGET_ERA_STALL_DIAGNOSIS.md
poc/compose.evidence-100k.yaml
poc/compose.probe.yaml
poc/run-probe.sh
poc/run-evidence-100k.sh
poc/nchan/nchan.conf
poc/nchan/nchan-2.conf
poc/nchan/nchan-3.conf
poc/nchan/nchan-4.conf
poc/nchan/nchan-spare.conf
poc/loadgen/cmd/loadgen/main.go
current coordinator code in poc/runner
recent git history around:
  85e1e0d
  ffe3ae6
  the G1/G1b/H1/H2 attempts if present
```

Use git history to recover the **exact previous `storage_mode backup` change** instead of inventing a new placement/syntax.

Verify:

```text
multi_accept off
NGINX_DEBUG resolves to 0
LIVELOCK_WATCHER=0 in base qualifying path
F1 Redis read-I/O setting still present
```

If these are already correct, do not change them.

---

# 6. Phase A — fix the coordinator control plane only

## A1. Diagnose the exact DNS call pattern cheaply

Inspect the Go loadgen coordinator client.

Determine why the late-join barrier causes repeated Docker DNS lookups / new connections.

Do not run a 100k test just to learn something obvious from the code.

Identify the smallest safe fix whose only purpose is to make the harness control plane reliably reach the coordinator.

The fix must not change:

```text
subscriber workload
event workload
population
timing semantics
latency measurement
correctness semantics
DUT topology
DUT versions
acceptance gates
```

## A2. Preferred classes of fix

Choose the smallest correct solution after code inspection.

Acceptable examples include:

### Option 1 — host-gateway coordinator endpoint

Expose the coordinator's HTTP control port on a fixed otherwise-unused host port and point loadgens at:

```text
http://host.docker.internal:<port>
```

The loadgens already have the Docker host-gateway mapping.

This bypasses Docker service-name DNS without hard-coding a container IP.

If used:

- use a fixed high port that does not collide with existing experiment ports;
- add it to launcher preflight port checks;
- keep this path identical for probes and terminal qualification;
- document that this is **harness/control-plane addressing**, not DUT topology.

### Option 2 — resolve/cache coordinator address once

Resolve the coordinator service once during loadgen startup and reuse the resulting endpoint / pooled HTTP client so every late-join barrier call does not trigger embedded-DNS lookup churn.

If used:

- coordinator is stable for a run;
- fail fast if initial resolution fails;
- do not silently retry with a different semantic path;
- preserve HTTP request/response semantics exactly.

Do **not** use:

```text
coordinator:127.0.0.1
hard-coded dynamic Docker container IP copied from one run
a long retry delay that changes barrier timing
dropping barrier calls
reducing late-join cohort concurrency/count
```

## A3. Validate the harness fix cheaply

Before a heavy run:

- run focused Go tests for only the changed coordinator-control code;
- render Compose;
- prove the intended coordinator endpoint is what loadgens receive;
- run the cheapest meaningful smoke/integration check that exercises coordinator barriers;
- do not run broad unrelated test suites.

Commit the harness fix separately if it is valid.

---

# 7. Phase B — re-enable the known `storage_mode backup` candidate

Recover the exact previous G1 `nchan_redis_storage_mode backup` configuration from git history.

Apply **only** that DUT configuration change on top of:

```text
F1 baseline
+
validated coordinator harness fix
```

Keep:

```text
Redis read I/O threading
4 workers
multi_accept off
LIVELOCK_WATCHER=0
NGINX_DEBUG=0
all v2.3.0 workload and acceptance semantics
```

Do not add any other Nchan tuning knob.

Commit the candidate cleanly before the heavy probe so provenance is unambiguous.

---

# 8. Phase C — one decisive short 100k probe

Run exactly one normal non-qualifying 100k probe:

```bash
cd poc
./run-probe.sh 100000
```

Do not run 10k/60k ladders first.

Do not run concurrent heavy workloads.

Inspect the machine result first.

Capture:

```text
population
fan_out p95
surge p95
burst p95
late_join p95
all correctness counters
generator validity
DUT validity
publisher/rate validity
restart/reconnect validity
all 8 matches
```

Also confirm the old Docker DNS/coordinator failure is gone.

---

# 9. Decision gate after the decisive probe

## Case 1 — backup candidate passes all frozen gates with useful margin

Proceed immediately to Section 10.

Do not keep tuning.

## Case 2 — backup candidate is extremely close

"Extremely close" means all validity/correctness/population gates pass and the remaining latency miss is small enough that existing telemetry identifies **one specific in-contract implementation/configuration defect**.

Allow at most:

```text
one evidence-backed smallest fix
-> one short 100k probe
```

No new tuning ladder.

If that one attempt does not pass, stop.

## Case 3 — backup candidate improves but still materially misses

Example:

```text
fan_out still > ~1000 ms
or
burst still > ~2000 ms
```

Preserve the result as a new best-effort measurement if it is truly better than F1, but **stop M3 performance tuning**.

Do not patch Nchan/nginx source.
Do not change Redis version.
Do not add partitions/workers beyond the frozen topology.
Do not change the gates.

## Case 4 — backup candidate is invalid/regresses

Preserve the failed/invalid probe.

Revert the backup candidate to the last clean baseline if needed.

Stop. Do not resurrect prior failed knobs.

---

# 10. Full-duration bridge — only after a short-probe pass

If and only if the candidate passes the short 100k probe with credible margin, run one non-qualifying 100k bridge with terminal phase durations:

```bash
cd poc
PROBE_WARMUP_SECONDS=30 \
PROBE_MEASURE_SECONDS=120 \
PROBE_BURST_SECONDS=30 \
PROBE_SURGE_SECONDS=120 \
PROBE_COOLDOWN_SECONDS=10 \
./run-probe.sh 100000
```

Do not run multiple bridge attempts unless the first was measurement-invalid for a clearly external reason.

All frozen gates must pass.

If it fails a real gate, return to Section 9 rules. Do not launch qualification.

---

# 11. Qualification freeze

Only if the full-duration bridge passes:

1. freeze the exact candidate source/config;
2. commit it;
3. require a clean working tree;
4. record source SHA;
5. record v2.3.0 contract SHA-256;
6. render qualifying Compose;
7. verify:
   - backup mode is exactly the passing mode;
   - `LIVELOCK_WATCHER=0`;
   - `NGINX_DEBUG=0` unless newer evidence explicitly proves otherwise;
   - F1 Redis read-I/O setting remains;
   - same coordinator harness addressing will be used by qualification;
8. confirm no conflicting containers/ports;
9. do not change source after qualification begins.

---

# 12. Terminal campaign — only if earned

Run:

```bash
cd poc
./run-evidence-100k.sh
```

Exactly:

```text
3 runs
seeds 42,43,44
same source
same contract
same config
same topology
same thresholds
```

The machine verdict is authoritative.

Never tune using terminal campaigns.

---

# 13. Terminal result handling

## ACCEPT

If all 3 runs are valid, all gates pass, required CVs <=0.15, and machine campaign verdict is ACCEPT:

- preserve all evidence;
- run/confirm independent verdict audit;
- mark M3 ACCEPT/DONE;
- record source SHA, contract hash, campaign ID, per-run metrics;
- stop immediately.

## REJECT

Preserve it.

Do not reinterpret it.

With the two-day deadline, do not launch another terminal campaign unless a **specific, small, proven implementation defect** explains the REJECT and can be fixed without changing frozen semantics.

Return to non-qualifying probes first.

## INCONCLUSIVE

Preserve it.

Fix only the exact validity/harness blocker if cheap and clearly external.

Do not weaken DUT gates.

Do not rerun three heavy seeds for a cosmetic or post-processing problem if raw evidence already proves the outcome.

---

# 14. Deadline / diminishing-returns stop rule

This final push is allowed to improve M3, not endanger submission.

Stop M3 experimentation when any of the following becomes true:

```text
A. storage_mode backup runs cleanly and still materially misses the frozen gates;
B. backup regresses correctness/validity;
C. one additional evidence-backed near-gate fix also fails;
D. remaining path requires:
     - changing frozen topology,
     - changing component versions,
     - patching Nchan/nginx source,
     - changing frozen acceptance gates,
     - changing workload/population,
     - or a broad architecture redesign;
E. continued testing would put final submission synchronization at risk.
```

At that point the truthful M3 state is the strongest validated result achieved, not ACCEPT.

---

# 15. Evidence and status

Preserve every new M3 probe result.

Never overwrite F1 or prior failed evidence.

Update:

```text
poc/internal_docs/m3_evidence/M3_TARGET_ERA_STALL_DIAGNOSIS.md
```

only with concise new facts from this final push.

If this prompt is actually executed, preserve an exact copy as an AI instruction artifact and record its SHA-256/provenance.

Do not rewrite root proposal/README/ZIP during active experimentation.

At the end, report whether the existing final package needs synchronization because:

```text
- ACCEPT was achieved, or
- a new validated non-ACCEPT result materially supersedes F1.
```

---

# 16. Required final response

If ACCEPT:

```text
M3 FINAL PUSH: ACCEPT

CONTRACT:
v2.3.0

SOURCE:
<sha>

CAMPAIGN:
<id>

RUNS / SEEDS:
42,43,44

FAN_OUT P95:
<values>

SURGE P95:
<values>

BURST P95:
<values>

LATE_JOIN P95:
<values>

CV:
<values>

CORRECTNESS:
PASS

GENERATOR VALIDITY:
PASS

DUT VALIDITY:
PASS

NEW FINAL PACKAGE SYNC REQUIRED:
YES
```

If no ACCEPT:

```text
M3 FINAL PUSH: STOPPED WITHOUT ACCEPT

BEST VALIDATED RESULT:
<identify F1 or new better probe>

FAN_OUT P95:
<value>

BURST P95:
<value>

CORRECTNESS:
<value>

100K:
<pass/fail>

STORAGE_MODE_BACKUP CLEAN RUN:
<yes/no>

COORDINATOR DNS BLOCKER:
<fixed/not fixed>

WHY STOPPED:
<exact reason>

FROZEN CRITERIA CHANGED:
NO

REMAINING PATHS REQUIRE CONTRACT/TOPOLOGY/BINARY CHANGE:
<yes/no + exact list>

NEW FINAL PACKAGE SYNC REQUIRED:
<yes/no>
```

---

# 17. First actions — execute these now

```text
1. Re-read current HEAD and frozen v2.3.0.
2. Verify F1/current config state; do not rerun F1.
3. Inspect the Go coordinator-control client and current Compose network.
4. Recover G1/G1b/H1/H2 diffs from git history.
5. Implement the smallest correct coordinator DNS/addressing fix.
6. Validate that harness fix cheaply.
7. Recover/apply the exact known storage_mode backup candidate.
8. Run one decisive short 100k probe.
9. Follow the decision gate above.
```

Do not begin with another debug A/B.

Do not begin with another general profiling campaign.

Do not begin with seeds 42/43/44.

This is the final focused M3 push.
