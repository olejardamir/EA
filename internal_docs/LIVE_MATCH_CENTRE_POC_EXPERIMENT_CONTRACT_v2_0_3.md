# POC Experiment Contract — Nchan + Redis OSS + SSE

**Contract ID:** POC-EXP-LMC-001
**Contract Version:** v2.0.3
**Date:** 2026-08-20
**Status:** FROZEN (corrected from v2.0.2; resolves resource-envelope and timing-text contradictions)
**Supersedes:** `LIVE_MATCH_CENTRE_POC_EXPERIMENT_CONTRACT_v2_0_2.md` (preserved as historical frozen state)
**Governing architecture:** `LIVE_MATCH_CENTRE_MINIMUM_DEFENSIBLE_ARCHITECTURE.md`
**Governing milestones:** `LIVE_MATCH_CENTRE_ASSIGNMENT_MILESTONES (3).md` — Milestone 1
**Governing AI contract:** `AGENTS.md`

---

# Corrections from v2.0.2

This contract is identical to v2.0.2 except for the following material corrections. v2.0.2 is preserved as historical frozen state; do not edit it further.

## Correction 1: Resource envelope — nchan-primary memory limit (§24, §O, §28)

### OLD (v2.0.2)

```text
§24: nchan (DUT) | 4 | 8 GB  (correct in table)
§O:  "ACCEPT/REJECT criteria apply to each Nchan node individually under its own 4 CPU / 4 GB envelope"
§28: nchan_memory_mb_peak < 3.5 GB (below 4 GB limit)
```

### NEW (v2.0.3)

```text
§24: nchan (DUT) | 4 | 8 GB  (unchanged — matches compose.yaml)
§O:  "ACCEPT/REJECT criteria apply to each Nchan node individually under its own deployed resource envelope.
      nchan-primary: 4 CPUs, 8 GB (the architecture under test).
      nchan-2:       4 CPUs, 4 GB (cross-node replacement only)."
§28: nchan_memory_mb_peak < 7000 MB (87.5% of 8 GB DUT limit — consistent with Redis 90% pattern)
```

### WHY

The compose.yaml deploys nchan-primary with `memory: 8G`. The v2.0.2 §28 ACCEPT threshold of 3.5 GB referenced a4 GB limit that only applies to nchan-2 (replacement node), not the primary DUT. This contradiction meant the primary DUT could never PASS its own memory check at the correct scale. The 7000 MB threshold (87.5% of 8 GB) provides headroom consistent with the Redis threshold pattern (1800 MB / 2000 MB = 90%).

## Correction 2: Late-join timing boundary (§15)

### OLD (v2.0.2)

```text
T_late_join_start = timestamp of SSE connection open
```

### NEW (v2.0.3)

```text
T_late_join_start = timestamp when the late-join connection attempt begins
                    (before TCP handshake completes)
T_late_join_end   = timestamp when the client receives the event whose
                    canonical_seq equals or exceeds the match head at T_late_join_start
late_join_duration = T_late_join_end - T_late_join_start
```

### WHY

The implementation measures wall-clock time from the start of the connection attempt (including TCP handshake and SSE upgrade), not from the moment the SSE connection is fully open. Using "connection open" as the start boundary would exclude TCP handshake latency, which is part of the real late-join experience. The v2.0.3 definition matches the actual measurement code and includes the full connection establishment path.

## Correction 3: Auxiliary topology text (§O)

### OLD (v2.0.2)

```text
"Cross-node restart testing uses nchan-2 as a replacement node, not as additional DUT capacity.
The ACCEPT/REJECT criteria apply to each Nchan node individually under its own 4 CPU / 4 GB envelope."
```

### NEW (v2.0.3)

```text
"Cross-node restart testing uses nchan-2 as a replacement node, not as additional DUT capacity.
The ACCEPT/REJECT criteria apply to each Nchan node individually under its own deployed resource envelope:
  nchan-primary: 4 CPUs, 8 GB RAM (the architecture under test)
  nchan-2:       4 CPUs, 4 GB RAM (replacement node only)"
```

### WHY

The blanket "4 CPU / 4 GB envelope" text was incorrect for nchan-primary, which has 8 GB. The corrected text explicitly states each node's envelope.

---

# Unchanged sections

All other sections of v2.0.2 remain unchanged and in force. This document is a minimal delta, not a rewrite.

---

# Frozen contract integrity

v2.0.2 is preserved as-is in:
```text
internal_docs/LIVE_MATCH_CENTRE_POC_EXPERIMENT_CONTRACT_v2_0_2.md
```

Do not edit v2.0.2 further. All future corrections go into successor versions.

---

# Status

```text
Milestone 2 status: IN PROGRESS
Contract version: v2.0.3 (active)
```
