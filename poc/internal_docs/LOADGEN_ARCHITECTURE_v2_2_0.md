# M3 Lightweight Load-Generation Architecture (v2.2.0 reset)

Status: DESIGN — implemented under `poc/loadgen/` (Go) + `poc/runner/src/publisher-service.ts` (TS)

This document is the engineering design for the v2.2.0 methodology reset. It is
written BEFORE any new DUT performance data exists. The frozen rule set lives in
`EXPERIMENT_CONTRACT_v2_2_0.md`; this document explains the architecture that
implements it.

## 1. Problem being solved

The prior benchmark deeply parsed and validated every delivered frame for all
100,000 simulated viewers in Node.js. On the 12-core experiment host, benchmark
CPU became a dominant experimental limitation, and repeated post-freeze
"corrections" were symptoms of the validator itself being a fragile,
resource-hungry workload. The DUT was no longer clearly the thing under stress.

## 2. Architecture

```text
                 canonical publisher/control (TypeScript)
                     MatchEventPublisher (reused) + evidence API
                              |
                              v  (publishes once per event via partition p0)
                        Nchan p0..p3 + shared Redis        [DUT — unchanged]
                              |
        ---------------------------------------------------------
        |                |                |                |
        v                v                v                v
   loadgen shard 0   loadgen shard 1  loadgen shard 2  loadgen shard 3   [Go]
     25,000            25,000           25,000           25,000
     viewers -> p0     viewers -> p1    viewers -> p2    viewers -> p3
        \___________________________________________________________/
                          100,000 total SSE viewers
                                 |
                                 +-- bounded deep-verification cohort (1,024)
```

- **Publisher/control** is a dedicated lightweight TypeScript service reusing the
  proven `MatchEventPublisher`. It owns canonical sequence/state per match, an
  independent bounded event log ring per match (expected/observed boundary), and
  exposes `/v1/burst` and `/v1/evidence`. It holds ZERO viewer connections.
- **Load generators** are four Go processes. Each owns exactly one partition
  (shard i → pi). They coordinate through the EXISTING TypeScript coordinator
  (`global-coordinator.ts`) over its HTTP protocol; one canonical machine verdict
  path is preserved.

## 3. Responsibility split

### 3.1 All 100,000 viewers (lightweight path)

Every viewer contributes: connection establishment/liveness, active population,
unexpected-disconnect accounting, transport-ID presence, and per-frame sequence
continuity computed from the **frozen SSE id** (per-channel delivery order as
assigned by Nchan):

- first frame initializes `last_seq`
- `seq == last+1` NEXT; `seq == last` DUPLICATE; `seq > last+1` GAP;
  `seq < last` OUT_OF_ORDER

Per-client state is a fixed struct (~48 B):

```go
type ClientState struct {
    ID          int64
    MatchIdx    int32
    LastSeq     uint64
    Received    uint64
    Missing     uint64
    Duplicates  uint64
    OutOfOrder  uint64
    Connected   uint32
    PlannedDisc uint32
}
```

All clients live in one preallocated array. No per-frame allocations, no JSON
parsing, no retained events, no logging on the hot path. The lightweight parser
is a byte-level state machine over `ReadSlice('\n')`: it consumes frame
boundaries and `id:` fields and discards `data:` payloads without copying them.

SSE ids are parsed as unsigned integers (leading digits of the id field).
Deep viewers independently verify `payload.canonical_seq == sse_id`
(payload/transport agreement), so any divergence between Nchan delivery order
and canonical sequence is caught by the deep cohort rather than silently
assumed away by the lightweight path.

Lobby viewers (2%) are lightweight liveness clients: lobby frames carry no
canonical sequence (latest-state schema), so they contribute connection
accounting only.

### 3.2 Deep cohort (bounded, frozen at 4 × 8 × 32 = 1,024)

Per shard: 256 deep viewers (32 per match), included in the local 25,000.
Responsibilities:

- full JSON decode + strict schema validation
- `canonical_seq == SSE id`, `match_id` correctness, ISO timestamp validity,
  known `event_type`
- score/clock internal consistency (score changes only on goals; monotonic
  clock) and final-state agreement with the publisher's independently fetched
  canonical head state
- fan-out latency: `publish_timestamp -> wire arrival` measured ONLY here
  (goal-class vs other-class histograms)
- late-join history reconstruction via `/history/<match>` (exactness + ≤2s)
- reconnect exact replay for the reconnect cohort it tracks

Coverage: every partition (by construction) and every match (32/shard/match).

### 3.3 Reconnect cohort (frozen 4 × 64 = 256)

64 per shard (8 per match), drawn deterministically from the seeded PRNG,
disjoint from the deep cohort but sequence-tracked like light clients plus
Last-Event-ID capture. Phase semantics: deliberate disconnect → settle →
reconnect to owner partition with saved id → exact required range, zero
gaps/duplicates/order violations, correct owner partition.

### 3.4 Late-join probes (frozen 8/shard/run = 32/run)

One probe per match per shard during the late-join phase: connect mid-match to
the partition's `/history/` endpoint, reconstruct history, verify continuity +
exact tail agreement against the publisher evidence window, measure catch-up
latency (connect → caught up to then-current head), then close. Every partition
and match is covered every run.

### 3.5 Restart/failover drill (retained, bounded to one partition)

Weekly-deploy-during-live support is an assignment claim, so a replacement drill
is retained. A node restart necessarily affects every viewer connected to that
node; therefore the drill is planned-drain + failover of exactly ONE partition's
population (target shard 3 / p3), never more than one quarter of the crowd:

1. capture Last-Event-ID for every local viewer (planned attribution),
2. drain locally (client-side closes; no unexpected disconnects),
3. literally restart p3 through its control server,
4. reconnect every viewer to the spare with saved ids (batched),
5. exact-range replay proofs: dedicated probe clients across a frozen range per
   match on the spare node (`spare_probe` path) + whole-pool failover-window
   deltas must be zero (`failover_drill` path),
6. unaffected partitions keep their own counters at zero (global gates).

Viewers intentionally remain on the spare afterwards (replacement semantics).

### 3.6 Slow-client scenario — NOT carried into qualification

Removed from terminal qualification by the pre-freeze gate audit (see contract
§gate-audit). It does not answer the POC question and produced most historical
benchmark defects. Retained conceptually as optional future engineering
evidence; not implemented in the qualifying path.

## 4. Generator efficiency design

- One goroutine per connection (25k/shard); Go scheduler handles this far below
  saturation. Hot loop uses `bufio.ReadSlice` into reusable buffers.
- Shard-local aggregation in the client struct array; global counters are
  atomics updated per frame (single add each, no locks).
- Histograms are fixed 30,001-bucket uint32 arrays (120 KB each), matching the
  existing TS `StreamingHistogram` sparse serialization so the coordinator can
  merge losslessly without format changes.
- CPU budget target: all four shards combined ≲ 4 cores sustained (measured,
  engineering goal — not a pass/fail gate).

## 5. Source-port headroom fix

Generator containers set `net.ipv4.ip_local_port_range = 1024 65535`
(namespaced sysctl via Compose `sysctls`). Per-shard proof at runtime:
range size (64,512) − steady viewers (25,000) − reconnect/TIME_WAIT allowance
(2,500) − control sockets (64) − safety margin (512) ⇒ ≥ ~36,000 free ports.
Preflight records actual range, count, allowances, and computed margin; the
frozen validity rule requires ≥ 4,000 free ports.

## 6. Expected/observed independence (§29 boundary)

- expected: publisher `/v1/evidence` (canonical heads, state, event-log rings),
  fetched over HTTP from a separate service
- observed: SSE wire frames (id + payload) received by deep viewers/probes
No function generates both sides. Score/clock reconstruction compares deep-viewer
replay against publisher state; payload/transport agreement compares payload
canonical_seq against the transport-assigned id.

## 7. Machine-readable interface (§27)

The Go binary speaks the existing coordinator HTTP protocol (`/v1/register`,
`/v1/barrier`, `/v1/result`, `/v1/abort`) and additionally serves a local
diagnostics endpoint (`/debug/vars`, pprof). Phases: preflight → warmup(connect
baseline) → steady measure → surge → stabilization → late join → burst →
post-burst → reconnect → restart-replacement (target shard only) → finalize.
The per-shard result JSON carries every field required by §27 (identity,
population, correctness counters, histograms, resources, generator health,
source-port evidence, deep-cohort evidence).

## 8. What stays TypeScript

Coordinator verdict logic, campaign aggregation, barrier/registration server,
publisher/control service, Redis run isolation, Nchan control servers, launcher
scripts. Working code is reused; only schema-boundary changes were made for the
Go adapter (documented in the contract).
