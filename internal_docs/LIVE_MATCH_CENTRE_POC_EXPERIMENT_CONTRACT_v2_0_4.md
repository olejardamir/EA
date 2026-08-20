# POC Experiment Contract — Nchan + Redis OSS + SSE

**Contract ID:** POC-EXP-LMC-001
**Contract Version:** v2.0.4
**Date:** 2026-08-20
**Status:** FROZEN (supersedes v2.0.3; freezes phase schedule, slow-consumer thresholds, multi-shard topology, surge attribution)
**Supersedes:** `LIVE_MATCH_CENTRE_POC_EXPERIMENT_CONTRACT_v2_0_3.md` (preserved as historical frozen state)
**Governing architecture:** `LIVE_MATCH_CENTRE_MINIMUM_DEFENSIBLE_ARCHITECTURE.md`
**Governing milestones:** `LIVE_MATCH_CENTRE_ASSIGNMENT_MILESTONES (3).md` — Milestone 2
**Governing AI contract:** `AGENTS.md`

---

# Corrections from v2.0.3

This contract is identical to v2.0.3 except for the following material corrections. v2.0.3 is preserved as historical frozen state; do not edit it further.

## Correction 1: Phase schedule is stale (§22, §17, §21)

### OLD (v2.0.3)

```text
§22: warm-up 30s, stabilization 5s, steady 120s, burst 30s, post-burst 30s,
     late-join at t=90s, reconnect at t=105s, total ~420s
§17: independent 4-phase surge schedule (0-120/120-240/240-360/360-420)
```

### NEW (v2.0.4)

```text
Executable per-run lifecycle (frozen):

1. Warm-up:           60% of target connections, no measurements
2. Stabilization:     5 seconds
3. Steady measurement: publish at ~10 events/s, connections at 60%
4. Connection surge:   ramp from 60% to 100% over 120 seconds (24 batches, ~5s apart)
5. Stabilize at peak:  10 seconds
6. Late-join test:     executed at peak
7. Burst test:         30 seconds at ~50 match events/s
8. Post-burst steady:  30 seconds
9. Reconnect test:     disconnect + reconnect at peak
10. Slow-consumer test: 15 seconds, 5% of connections throttled to 1 event/2s
11. Restart/replacement test: literal restart + cross-node replacement
12. Cool-down:         10 seconds

Total per run: ~420 seconds (~7 minutes)
```

### WHY

The v2.0.3 §22 schedule referenced late-join at t=90s and reconnect at t=105s during the steady phase, but the actual executable lifecycle performs these tests at peak after the surge. The v2.0.3 §17 had an independent 4-phase surge schedule that did not reconcile with §22. The v2.0.4 schedule matches the actual code path in `main.ts`.

---

## Correction 2: Slow-consumer thresholds not frozen (§20, §28, §29, §30)

### OLD (v2.0.3)

```text
§20: 5% slow, 1 event/2s, "no unbounded memory accumulation"
§28: slow_consumer_disconnects > 0, non-slow p95 <= 5% degradation
§29: unbounded memory growth, non-slow p95 > 5%
§30: slow_consumer_disconnects == 0 → INCONCLUSIVE
```

### NEW (v2.0.4)

```text
Slow-consumer frozen parameters:

  slow_consumer_fraction:          5% of connections
  slow_event_interval_ms:          2000 (1 event per 2 seconds)
  slow_phase_duration_ms:          15000
  healthy_degradation_threshold:   5% (p95 latency increase)
  memory_bounded_growth_bytes:     < 50 MB
  memory_bounded_growth_pct:       < 10% of baseline
  memory_recovery_max_bytes:       < 50 MB deviation from baseline
  memory_meaningful_growth_bytes:  > 1 MB (threshold for backpressure evidence)
  memory_meaningful_growth_pct:    > 5% of baseline (threshold for backpressure evidence)
  replay_coverage_threshold:       >= 95%

Evidence of server-side backpressure (any one suffices):
  1. slow_consumer_disconnects > 0 (definitive — Nchan disconnected the slow client)
  2. Nchan memory grew by > 1 MB AND > 5% of baseline during slow phase

Classifier semantics:
  PASS:  degradation_ok AND bounded_ok AND evidence_backpressure AND replay_coverage_ok
         AND per_client_medians_all_above_1s AND any_client_missed
  INCONCLUSIVE: evidence_backpressure = false (absorbed by kernel buffers)
  REJECT:  unbounded memory growth OR non-slow p95 impact > 5%

Note: slow_consumer_disconnects == 0 with memory growth < thresholds → INCONCLUSIVE (not REJECT).
      The test is INCONCLUSIVE when backpressure cannot be observed, not when Nchan fails.
```

### WHY

The v2.0.3 contract had no frozen thresholds for memory boundedness, meaningful growth, or replay coverage. The code introduced these as result-affecting rules without contract coverage. v2.0.4 freezes all acceptance thresholds with rationale.

---

## Correction 3: Multi-shard 100k topology not described (§6, §24, §25)

### OLD (v2.0.3)

```text
§6:  single runner container, 8 CPUs, 8 GB
§24: runner 8 CPU / 8 GB; total 14 CPU / 18 GB (primary) or 18 CPU / 22 GB (with nchan-2)
§25: host must have >= 18 CPUs, >= 22 GB RAM
```

### NEW (v2.0.4)

```text
§6/§24/§25 — Multi-shard 100k topology (evidence mode):

  Shard count:           4 (SHARD_TOTAL=4)
  Per-shard target:      28,000 connections
  Aggregate target:      112,000 connections (4 × 28,000)
  Per-shard runner:      8 CPUs, 8 GB RAM (identical Docker image)
  Source-IP model:       each Docker bridge-networked runner gets a distinct source IP
  Ephemeral port model:  per-shard ~64k ports; 4 shards × 64k = ~256k destination tuples
  Global synchronization: one coordinator orchestrates phases across shards
  Evidence Compose:      compose.evidence-100k.yaml (RUN_MODE=single per shard)

  Aggregate host prerequisites:
    CPUs:  >= 18 (primary topology) + 24 (4 × 8 runners) = 42 CPUs
    RAM:   >= 22 GB (primary topology) + 32 GB (4 × 8 GB runners) = 54 GB
    fd:    >= 1,000,000 per container
    ports: ephemeral range 1024-65535 per shard

  Verdict model:
    - Each shard classifies independently against aggregate 100k target
    - Campaign verdict: all shards must ACCEPT for global ACCEPT
    - Any shard REJECT → global REJECT
    - Insufficient evidence → global INCONCLUSIVE
```

### WHY

The v2.0.3 contract described only the single-shard topology (14 CPU / 18 GB). The actual evidence mode uses 4 shards with 28k each. v2.0.4 freezes the multi-shard topology, aggregate resources, and the per-shard-against-aggregate classification model.

---

## Correction 4: Surge attribution is wrong (§17, §28, §29, §30)

### OLD (v2.0.3)

```text
§17: surge must not cause connection drops or degraded fan-out
§28: active_connections_peak >= 100,000
§30: generator saturation → INCONCLUSIVE (no distinction between generator and DUT failure)
```

### NEW (v2.0.4)

```text
Surge attribution (frozen):

  Surge deficit with healthy generator → REJECT (DUT cannot sustain target)
  Surge deficit with unhealthy generator → INCONCLUSIVE (generator/host/network bottleneck)
  Surge with unexpected disconnects → REJECT (connection instability)

  Classifier precedence:
    1. Generator unhealthy (CPU >= 90%, event loop >= 100ms, backlog > 1000) → INCONCLUSIVE
    2. Publisher failures, CPU throttle, OOM → INCONCLUSIVE
    3. Connection failure rate > 5% → INCONCLUSIVE
    4. Topology/FD/port insufficient → INCONCLUSIVE
    5. surge_failures > 0 with healthy generator → REJECT
    6. Unexpected disconnects (unexpected_client_disconnects, server_initiated_disconnects,
       network_failures) > 0 → REJECT
    7. All checks pass → ACCEPT (subject to other criteria)

  No arbitrary sustained-rate threshold (e.g. 80%) is used.
  Any deficit when the generator is healthy maps to REJECT.
```

### WHY

The v2.0.3 contract had no distinction between generator bottleneck (INCONCLUSIVE) and DUT capacity failure (REJECT). The code introduced an 80% sustained-rate threshold that was not frozen. v2.0.4 removes the arbitrary threshold and freezes the attribution model: generator health is checked first (INCONCLUSIVE), then any surge deficit with a healthy generator is a DUT failure (REJECT).

---

# Unchanged sections

All other sections of v2.0.3 remain unchanged and in force. This document is a minimal delta, not a rewrite.

---

# Frozen contract integrity

v2.0.3 is preserved as-is in:
```text
internal_docs/LIVE_MATCH_CENTRE_POC_EXPERIMENT_CONTRACT_v2_0_3.md
```

Do not edit v2.0.3 further. All future corrections go into successor versions.

---

# Status

```text
Milestone 2 status: IN PROGRESS
Contract version: v2.0.4 (active)
```
