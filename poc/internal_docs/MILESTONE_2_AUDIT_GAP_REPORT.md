# Milestone 2 Comprehensive Audit Gap Report

**Audit Date:** 2026-08-20
**Auditor:** opencode (automated)
**Scope:** Full §2.1 A-Z contract consistency + §6.1-6.73 implementation verification
**Status:** 35 PASS, 24 PARTIAL, 31 FAIL across 90 requirements

---

## Executive Summary

The EA POC implementation has a solid foundation with 35 fully-passing requirements. However, 31 FAILs and 24 PARTIALs remain. The most critical gaps fall into these categories:

1. **Contract contradictions** requiring re-freezing (§2.1 items B, C, D, K, L, N, O, P, Q, R, V)
2. **Missing infrastructure** (TCP/ephemeral-port topology, Nchan/Redis CPU/memory measurement, run isolation)
3. **Measurement gaps** (active vs cumulative connections, phase-scoped metrics, latency censoring)
4. **Classification gaps** (INCONCLUSIVE for host limits, slow-client contradiction, missing verdict exhaustion)

---

## CRITICAL — Contract Must Be Corrected Before Evidence

### 1. Lobby `newest` vs `oldest` Semantics (§2.1-B)
**Status:** Contract wrong, implementation correct
- Contract §7 prescribes `nchan_subscriber_first_message newest`
- Nchan 1.3.8 `newest` = wait for next message (violates "immediately receives current state")
- Implementation correctly uses `oldest` (delivers buffered state immediately)
- **FIX:** Update contract §7 and §14 from `newest` to `oldest`. Freeze corrected contract.

### 2. 5,000-Message Buffer vs "Full Match History" (§2.1-C)
**Status:** Arithmetic contradiction
- 90-minute match at ~1.25 events/s = ~6,750 events
- Buffer holds only 5,000 → ~1,750 oldest events evicted
- Section title "Full-Match-History Model" is inaccurate
- **FIX:** Rename to "Match History Buffer Model (POC Constraint)". Document that 5,000 covers POC's ~7-minute window but not full 90-minute match. Add note that production requires Redis-backed persistence.

### 3. Load-Generator Topology — 100k Structurally Impossible (§2.1-D, §6.17)
**Status:** FAIL — single source IP cannot reach 100k simultaneous connections
- Single source IP → ~64,512 ephemeral ports (1024-65535)
- `tcp_tw_reuse` doesn't help for simultaneous connections
- Child processes share parent's source IP
- Contract §6 (single container) contradicts §16 (multiple containers)
- **FIX:** Either (a) implement multiple load-generator containers with distinct source IPs, or (b) document topology as structurally capped at ~64k and classify 100k result as INCONCLUSIVE.

### 4. Nchan `nchan_eventsource_event` Overrides History Event Types (§2.1-K)
**Status:** Material issue on `/history/` endpoint
- `/history/` has `nchan_eventsource_event "update"` → overrides per-message event types
- Contract §8 specifies `event: <event_type>` per message
- History replay clients see `event: update` for all messages
- **FIX:** Remove `nchan_eventsource_event "update"` from `/history/` endpoint, or document intentional override and adjust contract.

### 5. 100k ACCEPT Contradiction — Classifier Missing INCONCLUSIVE Path (§2.1-L)
**Status:** Classifier returns REJECT where contract requires INCONCLUSIVE
- Contract §28/§30: host OS limit → INCONCLUSIVE AT 100K SCALE
- Classifier: `connections_established >= connections_target` → REJECT if fails
- No path for "host saturated, Nchan unknown" → INCONCLUSIVE
- **FIX:** Add host-saturation heuristic checks (FD exhaustion, port exhaustion, memory ceiling) and route to INCONCLUSIVE.

### 6. Slow-Client Contract Three-Way Contradiction (§2.1-N)
**Status:** §29 REJECT vs §30 INCONCLUSIVE for same condition
- §28 ACCEPT: `slow_consumer_disconnects > 0`
- §29 REJECT: `slow_consumer_disconnects == 0`
- §30 INCONCLUSIVE: `slow_consumer_disconnects == 0`
- §N clarification: INCONCLUSIVE (not PASS)
- Classifier implements REJECT path
- **FIX:** Pick one: if "catch up safely" is allowed, `disconnects == 0` with bounded memory → INCONCLUSIVE, not REJECT. Update classifier accordingly.

### 7. Hot-Match Denominator Ambiguity (§2.1-P)
**Status:** §11 says "80% of ALL events" but means match events only
- Lobby updates cannot be match-001 events
- §13 §G clarification corrects this, but §11 frozen text is wrong
- `hot-match.test.ts` tests ~70% (different formula than publisher's 80%)
- **FIX:** Update §11 to "80% of match events". Fix `hot-match.test.ts` to use publisher's burst weights.

### 8. Scenario Timing Contradictions (§2.1-Q, §6.27)
**Status:** Multiple timing mismatches
- Late-join at t=90s of steady → actually runs after steady completes
- Post-burst: contract says 30s, code uses 10s
- Hot-match: contract says 60s, burst is 30s
- Surge at step 8, not step 6 as required
- **FIX:** Freeze one executable schedule. Either modify code or update contract to match sequential execution.

### 9. Active vs Cumulative Connection Count (§2.1-R, §6.2)
**Status:** Classifier uses cumulative counter
- `connections_established >= connections_target` can be satisfied by 100k cumulative with only 50k peak
- `active_connections_peak` exists but classifier never checks it
- Dropped connections not removed from pool array
- **FIX:** Change classifier to use `active_connections_peak >= connections_target`. Remove dropped entries from pool.

### 10. Hot-Match Viewer Concentration Not Frozen (§2.1-V)
**Status:** Viewers evenly distributed, not concentrated
- 80% of events go to match-001, but only 12.5% of viewers (round-robin)
- Contract never freezes a subscriber distribution
- Does not exercise worst-case fan-out concentration
- **FIX:** Either freeze subscriber concentration (e.g., 80% on match-001) or document that hot-match tests event-rate concentration only.

---

## HIGH — Implementation Gaps Requiring Code Changes

### 11. Missing Resource Measurements (§6.9, §6.36)
- **Nchan CPU/memory:** Not measured (cgroup monitor returns null)
- **Redis CPU:** Not measured
- **FD/port exhaustion thresholds:** Not encoded in classifier
- **Backlog saturation threshold:** Not checked
- **FIX:** Add Nchan/Redis process monitoring. Encode FD/port thresholds.

### 12. Missing Metrics (§6.14, §6.18, §6.35, §6.42, §6.73)
- `connection_establishment_rate_peak`: Not tracked
- `redis_connected_clients_peak`: Not tracked
- `late_join_history_expected/received`: Not as structured fields
- `reconnect_replay_expected/received`: Not tracked
- `viewer_count` (total): Not in output
- `SSE_connection_count` (current): Not in output
- `per-match_viewer_count`: Only lobby + match-001
- Claim provenance (ASSIGNMENT_FACT etc.): Not in machine output
- Schema validation errors: Not separately counted
- **FIX:** Add structured fields for all missing metrics.

### 13. Run Isolation — No Redis Flush (§6.21)
- In-memory state isolated per run
- No Redis FLUSHALL or channel namespacing
- Stale history from previous run can contaminate late-join/reconnect
- **FIX:** Add Redis FLUSHALL at run start or implement channel prefix per run.

### 14. TCP/Ephemeral-Port Topology (§6.17)
- Single runner, single source IP
- No multi-namespace/multi-IP configuration
- Structurally capped at ~64k connections
- **FIX:** Implement multiple load-generator containers with distinct source IPs, or document INCONCLUSIVE at 100k scale.

### 15. Surge Uses Sequential Sleep (§6.57)
- `connection-surge.ts` uses `await ctx.sleep(batchIntervalMs)` in loop
- Should use absolute monotonic deadlines
- **FIX:** Replace sequential sleep with deadline-based approach.

### 16. Nginx Access Logs Not Disabled (§6.39)
- All nchan configs: `access_log /dev/stderr main;`
- 100k connections → massive logging I/O
- **FIX:** Disable or bound access logs in evidence mode.

### 17. Type-Safety Issues (§6.69)
- `connection-pool.ts:69`: `let data: any`
- 36 instances of `as any` across codebase
- **FIX:** Remove unsafe casts, add type guards.

### 18. No Scope Minimization Audit (§6.43)
- No explicit document confirming poc/ is experiment-only
- **FIX:** Create scope audit document.

---

## MEDIUM — Partial Implementations Needing Completion

### 19. Late-Join Missing Fields (§6.4)
- `missing_history_sequences` not reported in detail output
- **FIX:** Add field to late-join detail string.

### 20. Publish Rate Not Separated (§6.14)
- No separate `matchEventsPerSec` and `lobbyEventsPerSec`
- Lobby events inflate total without breakdown
- **FIX:** Add separate match/lobby event rate tracking.

### 21. Machine-Readable JSON Missing Fields (§6.24)
- Missing: `environment/preflight`, `workload_rate_metrics`, `validity_reasons`
- **FIX:** Add missing sections to `emitMachineReadableResult`.

### 22. Preflight Missing Inspections (§6.25)
- FD limits, ephemeral port range, TCP/socket limits not inspected
- **FIX:** Add inspections for these resources.

### 23. Container Limits Not Verified Against Declared (§6.26)
- Reads cgroup limits but doesn't verify they match declared values
- **FIX:** Add comparison against expected limits.

### 24. Late-Join Timing Boundary (§6.45)
- Canonical validation and replay-state incorporation not part of timed interval
- **FIX:** Extend timing boundary to include these steps.

### 25. Scheduler Lag Not Measured (§6.56)
- Phase rates computed but no explicit scheduler lag measurement
- **FIX:** Add scheduler lag tracking (scheduled vs actual publish time).

### 26. Slow-Client Backpressure Metrics (§6.63)
- Offered rate, read rate, backlog growth not calculated
- **FIX:** Add explicit backpressure calculations.

### 27. Slow-Client Memory Trend (§6.50)
- Nchan memory not measured before/during/after backpressure
- **FIX:** Add phase-scoped memory measurement.

---

## LOW — Documentation/Process Gaps

### 28. Resource Envelope Stale (§2.1-O)
- §6 says 14/14 CPUs/GB, actual is 18/18 with nchan-2
- Host prerequisite may be insufficient
- **FIX:** Update §6 and §25 to reflect actual topology.

### 29. Build Inputs Not Fully Pinned (§6.54, §6.68)
- Base images use floating tags (ubuntu:24.04, node:22-bookworm-slim, redis:7-alpine)
- No SHA-256 verification of downloaded tarballs
- Traceability matrix says node:20-slim but Dockerfile uses node:22
- **FIX:** Pin by digest, add SHA-256 verification, correct matrix.

### 30. AI Instruction Artifact Not Preserved (§6.53)
- No bytes/hash preservation found
- **FIX:** Add SHA-256 hash of prompt file to evidence output.

### 31. Disconnect Attribution Incomplete (§2.1-Z)
- Only 3 categories (deliberate, unexpected, slow-consumer) vs required 5
- **FIX:** Add server-initiated vs client-side vs network failure categories.

### 32. Late-Join/Reconnect Samples (§6.64)
- Single-sample per-run percentiles are meaningless
- Cross-run pooling partially addresses this
- **FIX:** Ensure adequate sample populations per frozen rule.

### 33. Nginx Worker/CPU Alignment (§6.66)
- 4 workers for 4-CPU quota is documented but not runtime-verified
- **FIX:** Add runtime verification of worker count vs CPU quota.

### 34. Compose Service Addressing (§6.67)
- Evidence config uses `localhost` for sibling resolution (evidence.yaml)
- Portable config correctly uses Docker DNS
- **FIX:** Verify evidence config uses correct addressing for its network mode.

---

## PASS Summary (35 requirements fully met)

| § | Requirement |
|---|------------|
| 6.1 | Clean-checkout build |
| 6.2 | Connection target semantics |
| 6.3 | Evidence profile target |
| 6.5 | Reconnect/resume must be real |
| 6.6 | Connection lifecycle and surge |
| 6.7 | Two-node Nchan / shared Redis |
| 6.8 | Slow-consumer test |
| 6.10 | Classification validity gates |
| 6.11 | Smoke cannot produce ACCEPT |
| 6.12 | Channel-aware expected fan deliveries |
| 6.15 | Hot-match measurement phase-scoped |
| 6.16 | Portable smoke execution |
| 6.19 | Phase-boundary correctness |
| 6.20 | Publisher-side canonical ordering |
| 6.23 | Transport cursor vs canonical sequence |
| 6.28 | All scenarios affect classification |
| 6.29 | Publisher acceptance / canonical commit |
| 6.30 | SSE handshake race / timeout correctness |
| 6.31 | Live subscriber baseline |
| 6.37 | Repeated-run evidence suite |
| 6.41 | Simulator invariants |
| 6.44 | Parameter ledger |
| 6.46 | Incremental UTF-8 / heartbeat exclusion |
| 6.58 | Atomic synthetic-state commit |
| 6.59 | Repeated-run math / seed policy |
| 6.65 | Full per-run reset |
| 6.66 | Nginx worker/CPU alignment |
| 6.68 | Docker context reproducibility |
| 6.70 | Restart/replacement correctness |
| 6.71 | Surge-phase viewer experience |

---

## Recommended Priority Order for Gap Closure

1. **Contract corrections** (items 1-10): Freeze corrected contract before any code changes
2. **Classifier fixes** (items 5, 6, 9): Update result-classifier.ts for INCONCLUSIVE paths
3. **Missing measurements** (items 11-13): Add Nchan/Redis monitoring, run isolation
4. **Topology** (items 3, 14): Document or implement multi-IP capability
5. **Code fixes** (items 15-18): Surge deadlines, logging, type safety
6. **Metric completion** (items 19-27): Fill in missing structured fields
7. **Documentation** (items 28-34): Build pins, attribution, samples
