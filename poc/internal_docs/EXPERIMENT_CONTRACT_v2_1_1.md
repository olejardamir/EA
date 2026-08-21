# Experiment Contract v2.1.1 — Post-Freeze Correction Freeze

Status: **FROZEN — CANONICAL ACTIVE**

Contract Version: v2.1.1

Frozen: 2026-08-21

Scope: `poc/` coordinated 100,000-viewer experiment and its reduced validation paths

Supersedes: v2.1.0, which remains preserved historically and unedited. No earlier result is reinterpreted or promoted by this contract.

Milestone: **Milestone 3 remains the governing milestone.** This contract exists because M3 was reopened for acceptance recovery after campaign `m3-c89159e88822-q5` (v2.0.5) returned machine verdict INCONCLUSIVE. q5 is preserved unchanged as historical evidence. The terminal M3 result will be a fresh campaign under this contract.

## Why this correction freeze exists

v2.1.0 declared itself FROZEN, but the implementation subsequently changed in ways that materially alter measured semantics. Freezing a new version is the only honest reconciliation: the code that will run the terminal campaign is not the code v2.1.0 described. The drift, in order:

```text
1. slow-phase exact-once dispatch   §3.17 array-dispatch reached every frame
                                    through chained wrappers AND the still-
                                    registered pool handler; every frame was
                                    counted twice from slow-phase start until
                                    run end (~370k phantom duplicates in the
                                    10k probe; publisher verified clean).
                                    ThrottledSubscription no longer re-forwards
                                    to the pool handler; the healthy-cohort
                                    wrapper records latency only. Exact-once
                                    dispatch is now canonical delivery
                                    accounting.
2. slow-client pacing               GatedThrottledSubscription release pump,
                                    backlog handoff, and catch-up drain were
                                    rewritten; pacing evidence is measured
                                    against independently offered events, not
                                    application reads.
3. expected-delivery accounting     replay-probe expected-missed ranges are
                                    computed per client from its own
                                    subscription timeline; aggregate coverage
                                    is arithmetic over ALL selected probes.
4. topology preflight               capacity is proven PER PARTITION NODE
                                    against its equal share of the global
                                    population (partitioned_even_distribution),
                                    not against one primary carrying the full
                                    aggregate; partition count resolves
                                    explicit param > NCHAN_PARTITION_COUNT >
                                    SHARD_TOTAL/SHARD_COUNT > single node.
5. SSE pre-registration replay      frames parsed between HTTP response start
                                     buffering                    and the first application-handler
                                     registration are buffered and flushed
                                     exactly once, in arrival order, by the
                                     first onEvent() call — never dropped.
6. replay-probe gating              retention is proven only when selected ==
                                     reattached AND every selected probe has a
                                     measurable missed range AND each client
                                     individually meets the coverage threshold;
                                     the gating metric is the weakest client,
                                     not the aggregate.
7. slow-client latency exclusion    a slow client that is INTENTIONALLY
                                     deferred by the application-level gate
                                     contributes no fan-out latency samples
                                     while deferred; its queueing delay is its
                                     own pacing evidence, never global fan-out
                                     latency. Only genuinely delivered (released)
                                     frames count toward global distributions.
8. catch-up drain != replay         the post-window backlog handoff observed
                                     when a gated client resumes full-speed
                                     reads is socket-buffer catch-up. It is
                                     reported separately (catchup_drained_count)
                                     and is NEVER credited as Last-Event-ID
                                     replay coverage. Replay coverage comes only
                                     from the dedicated probe clients' missed
                                     ranges.
9. slow-cohort busy-match           the frozen 2 s application read pace is
   selection                        physically achievable only on channels
                                     whose offer rate sustains 0.5 events/s.
                                     Under the seeded weight distribution the
                                     coldest matches fall below that floor, so
                                     slow-cohort membership prefers the busiest
                                     matches deterministically from frozen
                                     MATCH_WEIGHTS (tier 1: weight >= 1.5,
                                     deterministic fallback tiers; no RNG).
                                     Partition distribution is untouched.
10. restart-range live tail         frames ABOVE a frozen restart range are
                                     live continuation on a live channel; they
                                     are never credited as replay (diagnostic
                                     out_of_range_after counters only) and can
                                     never fail an otherwise exact replay. Loss
                                     inside the range is caught by missing_
                                     required/duplicates/ordering. Frames BELOW
                                     the consumed position remain a defect.
```

## Frozen topology

Unchanged from v2.1.0:

```text
fan-out technology        Nchan 1.3.8 (SSE), nginx 1.27.4
partition nodes           4 independent fan-out partitions
partition IDs             p0, p1, p2, p3
spare replacement node    nchan-spare (idle standby until failover)
Redis topology            ONE shared canonical Redis OSS 7.2 backing every
                          node's channel state/history (Model A replicated
                          match channels). Redis is delivery/history support;
                          DynamoDB remains production canonical truth.
channel routing model     A — replicated match channels: every partition can
                          serve every match; one publication replicates to all
                          nodes through the shared store.
```

Port allocation (host networking):

```text
node          pub/status   sub      control
nchan-p0       8080         8081     18888
nchan-p1       18080        18081    18889
nchan-p2       28080        28081    28888
nchan-p3       38080        38081    38889
nchan-spare    48080        48081    48888
redis          6379 (shared)
```

## Frozen connection ownership

Unchanged from v2.1.0:

```text
partition(shard i) = i            deterministic static rule, frozen
generator shards           4 × 25,000 local targets = 100,000 global target
viewer ownership           every viewer of shard i connects ONLY to
                           partition pi's subscriber endpoint; no load-
                           balancer ownership ambiguity exists
reconnect ownership        a reconnecting viewer returns to its frozen owner
                           partition (or, during the failover drill only, to
                           the spare under planned attribution)
population accounting      per-partition target/actual/peak/attempts/failures
                           are recorded per node and sum exactly to the
                           global population
```

## Frozen publication ownership

Unchanged from v2.1.0:

```text
publisher-owner            exactly one shard (shard 0) has
                           publisher_owner=true; it generates the canonical
                           event sequence and publishes each event exactly
                           once, via partition p0's publisher endpoint
non-owner shards           must record events_published == 0; any nonzero
                           non-owner publication invalidates the run
event routing              one publication into the shared store reaches
                           every partition exactly once (Nchan Redis
                           replication); missing/duplicate partition delivery
                           manifests as missing/duplicate sequence counters,
                           which must be zero
unauthorized publishers    none permitted; the compose topology exposes no
                           second publisher path in the measured flow
```

## Frozen per-node configuration

Every partition node and the spare:

```text
worker_processes                4
worker_connections per worker   32,768
RLIMIT_NOFILE (soft/hard)       200,000
container CPU                   3 cores
container memory                6 GiB (frozen DUT envelope NCHAN_MEMORY_GB=6)
expected viewer population      ~25,000 per partition node; spare idle
publisher/control connections   included in the FD budget
Redis upstream connections      included in the FD budget
```

The theoretical aggregate ceiling is explicitly NOT proof of practical capacity. Runtime per-node evidence is mandatory (below).

Generator shards (runner containers):

```text
local target              25,000 connections each
container CPU / memory    8 cores / 8 GiB
RLIMIT_NOFILE             120,000 soft/hard (tied to the selected profile)
source-port headroom      frozen proof: 25,000 viewers + 2,500 reconnect/
                          TIME_WAIT + 64 non-viewer sockets + 512 safety
                          = 28,076 required per shard
```

Shared Redis: 2 cores / 2 GiB.

Host reality: configured CPU quotas intentionally exceed physical cores (documented oversubscription; quotas cap per-service usage so CFS shares fairly). Host CPU count, RAM, kernel, Docker/Compose versions, and background load are recorded before qualification. Compose limits are ceilings, not reservations.

## Frozen workload

Unchanged from v2.1.0:

```text
live matches                    8 concurrent
steady publish rate             ~10 events/s total (~1.25/s per match)
burst rate                      ~50 events/s total for BURST_SECONDS=30
global viewer target            100,000 concurrent (aligned peak >= 100,000)
surge                           +40,000 viewers within SURGE_SECONDS=120,
                                ramping from 60% population to target; no
                                approximate-percentage pass band
full history replay             <= 2 seconds (late_join_p95_ms <= 2000)
slow-consumer cohort            5%; intended application read pace one event
                                per 2,000 ms; every slow client's median
                                interval within 1,600–2,400 ms (±20%) else
                                INCONCLUSIVE; server-side backpressure must be
                                observed; healthy-client p95 degradation <= 5%;
                                slow cohort is distributed across partitions by
                                the frozen shard rule (no special-node parking)
phase order                     preflight -> warmup -> steady -> surge ->
                                target-barrier -> stabilization -> late-join ->
                                burst -> post-burst -> reconnect ->
                                slow-consumer -> restart-replacement ->
                                final-metrics
```

## Frozen scenario semantics

Late join (§26 upgrade): because the topology has four independent history/fan-out ownership domains, one sample per run can miss a broken partition. Every generator shard performs exactly one late-join measurement against its OWN partition node per valid global run, checked against the publisher-owner's frozen expectation. The coordinator requires the merged late-join histogram count to equal the shard count exactly; the campaign requires at least `runs × shards` samples. Non-sampled history domains cannot hide.

Reconnect: the frozen 10% cohort disconnects and resumes on its frozen owner partition with Last-Event-ID; exact required sequences, zero gaps, zero duplicates, zero ordering violations. Scenario active minimum >= 90% of global target (transient dip allowance unchanged).

Restart/replacement (§27 reconciliation): the drill targets exactly one non-owner partition — `RESTART_TARGET_SHARD` (default shard 3 / partition p3). Roles:

```text
owner (shard 0)     publishes a frozen range and probes the SPARE node,
                    proving cross-node replacement semantics without touching
                    the drill partition (paths.spare_probe exact evidence)
target (shard 3)    drains its entire pool with planned attribution, literally
                    restarts its own partition node via its control server,
                    fails every drained viewer over to the spare with
                    Last-Event-ID resume, then proves exact-range replay
                    (paths.failover_drill) AND zero failover-window deltas
                    across its whole pool (pool.failed/gaps/duplicates/
                    order_violations all zero, reestablished > 0)
bystanders          record non-participation with no fabricated path objects
```

History persists in the shared Redis store across the restart; the replacement (spare) serves live delivery and replay immediately; unaffected partitions continue uninterrupted; the restarted node rejoins empty and viewers intentionally remain on the spare for the remainder of the run. Structured evidence is bound to campaign/run/index/shard identity; stale or copied evidence is fatal. Scenario active minimum >= 70% of global target for this phase only (planned drain dip).

Slow clients: validation semantics as corrected above — offered events measured independently of application reads; pacing from the rewritten release pump; replay retention gated per client (weakest link); Nchan memory boundedness must be numeric. While a slow client is intentionally deferred by the application gate, its queueing delay is excluded from global fan-out latency (it is pacing evidence, not delivery latency); post-window catch-up drain is reported separately and never credited as replay. The cohort sits on busy matches (correction 9) so the frozen pace is physically achievable; cohort membership is deterministic per shard.

SSE transport: pre-registration frame buffering is canonical. Any event parsed before the first application handler registers is delivered exactly once, in order, when that handler attaches. Dropped silent replay windows are a defect class this contract closes.

## Frozen thresholds

Correctness (all must be zero globally):

```text
missing_sequences, duplicates, out_of_order
surge_missing_sequences, surge_duplicates, surge_out_of_order
reconnect_gaps, reconnect_duplicates, reconnect_order_violations
restart_failover_gaps, restart_failover_duplicates,
restart_failover_order_violations
sse_parse_errors, json_parse_errors, invalid_timestamp_count,
schema_validation_errors, missing_transport_id
restart exact-range validation = PASS; late-join exact reconstruction = PASS
```

Latency:

```text
fan_out_p95_ms        <= 500
surge_fan_out_p95_ms  <= 500
burst_fan_out_p95_ms  <= 1000
late_join_p95_ms      <= 2000
```

Generator validity (INCONCLUSIVE when violated; never raised to pass):

```text
normalized CPU (raw process CPU / assigned capacity)  < 90%
event-loop p99                                        < 100 ms
publisher backlog peak                                <= 1,000
publisher definite failures                            = 0
source-port headroom valid; environment/timing valid
```

DUT-resource validity:

```text
per-partition evidence mandatory and numeric for EVERY fan-out node:
  oom_kill_events (missing/null on any partition invalidates the run)
  memory peaks, CPU peaks, throttling counters
positive oom_kill delta on any DUT node with valid generator/timing/
  environment  -> REJECT (direct frozen-capacity evidence)
mandatory Redis memory_used_bytes numeric (bytes, not MB)
Nchan memory envelope gate: per-node peak < 87.5% of NCHAN_MEMORY_GB (6 GiB
  -> 5,376 MB)
cpu_throttled_count > 0 on generator or DUT -> INCONCLUSIVE
ACCEPT cannot coexist with: OOM kill > 0, fatal worker death,
  worker_connections exhaustion corrupting evidence, a required node missing,
  or any mandatory resource metric null
```

Histogram rules: sparse-bucket distributions merged losslessly at shard→global→campaign; overflow counts retained; percentiles recomputed from merged populations, never averaged; zero samples is missing evidence, not zero latency.

Population gates: aligned global active peak >= 100,000 (never 65k/75k/90k substitutes); late-join/burst/slow-consumer phases hold full target minimum; reconnect >= 90%; restart-replacement >= 70%.

Surge gate: starting population, attempted/established additions, elapsed time, final population, existing-viewer correctness deltas, and surge latency are measured globally and per partition; ACCEPT requires the frozen +40,000/120 s requirement.

Replay-probe gate (corrected): `selected probe clients == successfully reattached probe clients`; every selected probe must have a measurable missed range; per-client correctness first, then aggregate; the weakest client's recovery percentage is the gating value. One successful client can never hide two failed clients.

## Frozen campaign policy

```text
run count          GLOBAL_RUNS = 3 (exact; aggregator accepts only the exact
                   frozen set, 3..8 hard bound retained)
seed policy        BASE_GLOBAL_SEED = 42; seeds = 42, 43, 44 (contiguous
                   base+run_index; chosen from project history before any
                   final campaign; no post-hoc seed shopping)
identity/freshness unique CAMPAIGN_ID equal to the Compose project identity;
                   no pre-existing labeled containers/networks/volumes; exact
                   expected result-file set; one source SHA; contiguous run
                   indices; results newer than campaign start; stale aggregate
                   files fatal
cross-run stability sample-variance (n-1) coefficient of variation <= 15%
                   across global_active_peak, fan_out_p95, late_join_p95,
                   burst_p95
verdict precedence INCONCLUSIVE > REJECT > ACCEPT: any validity failure,
                   inconclusive input, or unstable dispersion -> campaign
                   INCONCLUSIVE; else any conclusive REJECT -> REJECT; else
                   ACCEPT. Machine verdicts are authoritative and never
                   manually overridden.
exit status        detached wrapper records quoted command, start/end,
                   launcher PID, child PID, combined output, exact numeric
                   exit (signals encoded 128+n)
```

## Qualification discipline

Development probes (10k/25k/50k/75k/100k) are non-qualifying engineering inputs. The 100k prequalification gate (all nodes healthy, 100k reached, surge inside 120 s, zero correctness violations, populated scenarios/histograms, no OOM/worker death) must pass before freezing. After freeze: clean tree, fresh campaign identity, no source/topology/threshold/seed changes, no intervention on individual runs, no result shopping, no deleted runs. A failed qualification preserves the campaign, reopens engineering, and produces a new source SHA (and contract version if semantics change) before the next attempt.

## Result dimensions

```text
shard -> simultaneous global run -> repeated-run campaign
```

Shard results can never claim global acceptance. Global runs require complete registrations, barriers, histograms, role-exact scenario evidence, and per-partition resource evidence. The campaign accepts only the exact frozen input set.
