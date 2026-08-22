# Experiment Contract v2.2.0 — Lightweight Generator Reset

Status: **FROZEN — CANONICAL ACTIVE**

Contract Version: v2.2.0

Frozen: 2026-08-21

Scope: `poc/` coordinated 100,000-viewer experiment in its v2.2.0 runtime shape (Go crowd generation + TypeScript control plane)

Supersedes: v2.1.1, which remains preserved historically and unedited. No earlier result is reinterpreted or promoted by this contract. Historical campaign `m3-c89159e88822-q5` (v2.0.5, INCONCLUSIVE) remains immutable.

Milestone: **Milestone 3 remains the governing milestone.** This contract exists because the q5 campaign and subsequent probes demonstrated that the all-TypeScript validator was itself a dominant CPU/measurement workload at 100k scale, making the DUT no longer clearly the thing under stress. The terminal M3 result will be a fresh campaign under this contract.

---

## Part I — Assignment facts (not methodology choices)

These are requirements taken from the assignment. No POC decision below may weaken them.

```text
Live-event fan-out system under load:
  concurrent viewers          100,000 simultaneous SSE connections
  live matches                8 concurrent
  surge                       +40,000 viewers within 120 seconds without
                              materially degrading existing viewers
  full history replay         <= 2 seconds for a late join
  burst tolerance             publish-rate burst must not break continuity
  weekly deploys              replacement of a fan-out node during live
                              traffic must be survivable

Correctness (assignment-level):
  every viewer receives every event of its subscribed channel exactly once,
  in order: zero missing, zero duplicates, zero out-of-order frames on the
  measured population.

Latency (assignment-level):
  fan-out latency p95 <= 500 ms sustained
  burst-phase fan-out p95 <= 1000 ms
  late-join full-history reconstruction <= 2000 ms

Deliverables (assignment-level):
  one production design proposal; one small runnable POC that measures the
  riskiest locally testable architecture assumption; machine-readable results.
```

## Part II — POC methodology choices (frozen)

Everything in Part II is a POC decision made to answer the assignment's riskiest assumption locally; it is not an assignment requirement.

### Topology (unchanged from v2.1.x)

```text
fan-out technology        Nchan 1.3.8 (SSE), nginx 1.27.4
partition nodes           4 independent fan-out partitions p0..p3
spare replacement node    nchan-spare (idle standby until failover)
Redis topology            ONE shared canonical Redis OSS 7.2 backing every
                          node's channel state/history (Model A replicated
                          match channels)
channel routing           model A — replicated match channels; one publication
                          reaches every partition exactly once through the
                          shared store
canonical match identity  match-001 .. match-008 (hyphenated; MUST equal
                          MATCH_IDS in poc/runner/src/domain/event.ts on both
                          runtimes — Nchan channel names and /history/<match>
                          endpoints derive from it)
```

Port allocation (host networking) is unchanged from v2.1.1:

```text
node          pub/status   sub      control
nchan-p0       8080         8081     18888
nchan-p1       18080        18081    18889
nchan-p2       28080        28081    28888
nchan-p3       38080        38081    38889
nchan-spare    48080        48081    48888
redis          6379 (shared)
publisher-control 8300 (/v1 HTTP API)
```

### Runtime split (the reset)

```text
Go load generators         poc/loadgen — four shards, one per partition.
                           Each owns 25,000 of the 100,000 viewer population,
                           transport sequence continuity for its whole local
                           population, connection establishment/liveness, and
                           a bounded deep cohort.

TypeScript control plane   coordinator (global-coordinator.ts +
                           coordinator-server.ts), publisher/control service
                           (publisher-service.ts), campaign aggregation,
                           Nchan control servers, launcher scripts. Working
                           code is reused; only schema-boundary changes were
                           made for the Go adapter.
```

### Lightweight path (all 100,000 viewers)

Every viewer contributes connection establishment/liveness, active population,
unexpected-disconnect accounting, transport-ID presence, and per-frame sequence
continuity computed from the frozen SSE id:

```text
first frame initializes last_seq
seq == last+1  NEXT
seq == last    DUPLICATE
seq > last+1   GAP
seq < last     OUT_OF_ORDER
```

The lightweight parser is a byte-level state machine that consumes frame
boundaries and `id:` fields and never decodes `data:` payloads. Lobby viewers
(2% of population) contribute liveness accounting only (lobby frames carry no
canonical sequence).

### Deep cohort (bounded, frozen 4 × 256 = 1,024)

Per shard 256 deep viewers (32 per match), included in the local 25,000:

```text
full JSON decode + strict schema validation
payload/transport agreement: payload.canonical_seq == sse id
match_id correctness, ISO timestamp validity, known event_type
score/clock internal consistency (score changes only on goals; monotonic clock)
final-state agreement with the independently fetched publisher canonical head
publish -> wire-arrival fan-out latency, split goal-class vs other-class
late-join history reconstruction via /history/<match> (exactness + <= 2 s)
reconnect exact replay for the reconnect cohort it tracks
```

Coverage: every partition by construction; every match at 32 deep viewers per
shard per match.

### Reconnect cohort (frozen 4 × 64 = 256)

64 per shard (8 per match), drawn deterministically from the seeded PRNG,
disjoint from the deep cohort but sequence-tracked like light clients plus
Last-Event-ID capture. Deliberate disconnect → settle → reconnect to owner
partition with saved id → exact required range, zero gaps/duplicates/order
violations.

### Late-join probes (frozen 4 × 8 = 32 per run)

One probe per match per shard against the partition's own `/history/` endpoint;
exact tail agreement against the publisher-frozen expectation; catch-up latency
(connect → caught up to then-current head) recorded per probe. Every partition
and match covered every run; merged late-join histogram count must equal shard
count exactly (one sample per ownership domain).

### Restart/failover drill (retained, bounded to one partition)

Unchanged in semantics from v2.1.1: owner prefills a frozen range and probes
the SPARE (`paths.spare_probe`); target shard (RESTART_TARGET_SHARD, default
shard 4 / partition p3) drains with planned attribution, literally restarts its
own node via its control server, fails over to the spare with Last-Event-ID
resume, and proves exact-range replay plus whole-pool windowed deltas of zero
(`paths.failover_drill`). Bystanders emit non-participation evidence. Evidence
is bound to campaign/run/index/shard identity.

### Slow-client scenario — REMOVED from qualification

Removed by pre-freeze gate audit: it does not answer the assignment question
and produced most historical benchmark defects (corrections 1–11 of v2.1.1
were slow-consumer artifacts). Not implemented in the qualifying v2.2.0 path.
The v2.1.1 correction ledger remains historical context for those defects.

### Publisher/control service (new component)

An independent TypeScript service (`poc/runner/src/publisher-service.ts`) that:

```text
owns canonical event generation (reuses MatchEventPublisher unchanged)
publishes each event exactly once through ONE selected Nchan publisher
  endpoint (partition p0)
holds ZERO viewer connections
exposes the frozen HTTP API:
  POST /v1/reset     clear retained Redis history (run isolation; owner only)
  POST /v1/start     begin steady publication (~9 events/s matches + 1/s lobby)
  POST /v1/stop      quiesce publication
  POST /v1/prefill   {match_id, count, event_type} -> {published, first_seq,
                     last_seq} canonical serialized frozen-range producer
  POST /v1/burst     {seconds} switch to burst rate (~50 events/s) for a
                     bounded window, then return to steady
  GET  /v1/evidence  independent canonical expectation: heads (seq, score,
                     clock, last_event_type per match), totals (published,
                     attempts, definite_failures, ambiguous_failures,
                     pending_peak), started, burst_active, fetched_at_ms
produces machine-readable publisher evidence consumed as the EXPECTED side
  of the expected/observed boundary
```

Expected/observed independence (§29 boundary): expected values come from
publisher `/v1/evidence` fetched over HTTP; observed values are the SSE wire.
No function generates both sides.

Publication ownership: the service replaces the in-process publisher of the
old runner shards. Exactly one publication path exists; generator shards never
publish (non-owner `events_published` must be 0; the owner reports the
service's accepted totals). `PUBLISHER_OWNER=true` marks the shard permitted
to drive control actions (reset/start/burst/prefill/stop) — it still publishes
nothing itself.

### Workload (unchanged rates)

```text
steady publish rate             ~10 events/s total (~9/s weighted across 8
                                matches + 1 lobby/s)
burst rate                      ~50 events/s total for BURST_SECONDS=30
global viewer target            100,000 concurrent (aligned peak >= 100,000)
surge                           +40,000 within SURGE_SECONDS=120, ramping from
                                60% to target; no approximate-percentage band
phase order                     preflight -> warmup -> steady -> surge ->
                                target-barrier -> stabilization -> late-join ->
                                burst -> post-burst -> reconnect ->
                                restart-replacement -> final-metrics
```

### Connection and container envelope

```text
generator shards               4 × 25,000 local targets (Go containers)
generator source-port range    net.ipv4.ip_local_port_range = "1024 65535"
                               (namespaced sysctl via Compose)
per-shard headroom proof       range size (64,512) - steady viewers (25,000)
                               - reconnect/TIME_WAIT allowance (2,500)
                               - control sockets (64) - safety margin (512)
                               => >= ~36,000 free ports; frozen validity rule
                               requires >= 4,000 free ports computed from the
                               RUNTIME-measured range (never assumed)
per-partition nodes            worker_processes 4; 32,768 connections/worker;
                               RLIMIT_NOFILE 200,000; 3 cores; 6 GiB
                               (NCHAN_MEMORY_GB=6); spare idle same envelope
shared Redis                   2 cores / 2 GiB
generator containers           sized to the real 12-core host; limits are
                               ceilings, not reservations (documented
                               oversubscription policy carried from v2.1.1)
```

### Result schema (v2.2.0 changes only)

The shard result carries five histograms (v2.1.1 had three):

```text
histograms.fan_out             merged goal+other+burst wire distribution
histograms.goal_fan_out        goal-class publish->wire latency (deep cohort)
histograms.other_fan_out       other-class publish->wire latency (deep cohort)
histograms.late_join           late-join catch-up ms, exactly shard_count samples
histograms.burst               burst-window class samples
```

Histogram wire shape is unchanged (sparse `[ms,count]` pairs byte-compatible
with StreamingHistogram.serialize()); merges remain lossless; percentiles are
recomputed from merged populations, never averaged; zero samples is missing
evidence, not zero latency. Contract version is produced by exactly one
constant per runtime (`ACTIVE_CONTRACT_VERSION` in TS, `ContractVersion` in
Go's internal/coordinator/result.go) and both must equal v2.2.0.

Generator validity flags (INCONCLUSIVE when violated; never raised to pass):

```text
normalized CPU (raw process CPU / assigned capacity)  < 90%
event-loop/scheduler stall evidence                    recorded
publisher backlog peak                                 <= 1,000
publisher definite failures                            = 0
source-port headroom valid; environment/timing valid
```

DUT-resource validity is unchanged from v2.1.1 (per-partition numeric
evidence mandatory including oom_kill_events; Redis memory_used_bytes numeric;
Nchan peak < 87.5% of NCHAN_MEMORY_GB; positive OOM delta with valid generator
=> REJECT; ACCEPT cannot coexist with OOM kills, fatal worker death,
worker_connections exhaustion, a missing required node, or any null mandatory
metric).

Correctness gates (all zero globally): unchanged from v2.1.1 minus
slow-consumer-specific counters (removed with the scenario):
missing_sequences, duplicates, out_of_order, surge_missing_sequences,
surge_duplicates, surge_out_of_order, reconnect_gaps, reconnect_duplicates,
reconnect_order_violations, restart_failover_gaps,
restart_failover_duplicates, restart_failover_order_violations, plus
schema_validation_errors and missing_transport_id; restart exact-range PASS;
late-join exact reconstruction PASS.

Latency gates (carried forward unweakened):

```text
fan_out_p95_ms        <= 500
surge_fan_out_p95_ms  <= 500
burst_fan_out_p95_ms  <= 1000
late_join_p95_ms      <= 2000
```

Population gates: aligned global active peak >= 100,000; late-join/burst phases
hold full target minimum; reconnect >= 90%; restart-replacement >= 70%.

Surge gate: starting population, attempted/established additions, elapsed time,
final population, existing-viewer correctness deltas, and surge latency are
measured globally and per partition; ACCEPT requires the frozen +40,000/120 s
requirement.

### Campaign policy (unchanged)

```text
run count          GLOBAL_RUNS = 3 (exact frozen set)
seed policy        BASE_GLOBAL_SEED = 42; seeds = 42, 43, 44
identity/freshness unique CAMPAIGN_ID == Compose project identity; no
                   pre-existing labeled containers/networks/volumes; exact
                   result-file set; one source SHA; contiguous run indices;
                   results newer than campaign start; stale aggregates fatal
cross-run stability sample-variance (n-1) coefficient of variation <= 15%
                   across global_active_peak, fan_out_p95, late_join_p95,
                   burst_p95
verdict precedence INCONCLUSIVE > REJECT > ACCEPT
exit status        detached wrapper records quoted command, start/end, PIDs,
                   output, exact numeric exit (signals encoded 128+n)
result dimensions  shard -> simultaneous global run -> repeated-run campaign
                   (shard results can never claim global acceptance)
```

---

## Part III — Qualification discipline

Development probes (1k/10k/25k/50k/75k/100k) are non-qualifying engineering
inputs; each failure classifies as generator | host/kernel/network | DUT |
measurement before any code change. Before terminal qualification, a
generator-only benchmark must demonstrate the Go hot path has substantial
headroom versus the per-shard delivery rate (frames/sec, CPU, allocations/
frame, GC behavior, memory growth; pprof if needed).

The 100k prequalification gate (all nodes healthy, aligned peak >= 100,000,
surge inside 120 s, zero correctness violations, populated scenarios and
histograms, no OOM/worker death, valid generator and source-port headroom)
must pass before freezing the terminal source. After freeze: clean tree, fresh
campaign identity, no source/topology/threshold/seed changes, no intervention
on individual runs, no result shopping, no deleted runs. A failed qualification
preserves the campaign, reopens engineering, and produces a new source SHA (and
a contract patch version if measured semantics changed) before the next attempt.

Anti-loop rule: a valid DUT failure changes the architecture, not the
measurement threshold. A genuine measurement bug may be fixed only with
root-cause proof, a regression test, preserved failed campaign/probe, newly
committed source, and a contract patch version if measured semantics changed.
