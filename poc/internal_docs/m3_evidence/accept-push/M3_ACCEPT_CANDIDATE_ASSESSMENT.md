# M3 ACCEPT PUSH — candidate support assessment (Nchan 1.3.8 source, tag v1.3.8)

Source inspected: `slact/nchan` v1.3.8 (sha256
`86e40f97bf380cb81d62c279aa0f992c2d8c93ebcfe242cf0be95e5b6ade9a98`).

## Key source facts
- `src/nchan_types.h:15` storage-mode enum:
  `REDIS_MODE_BACKUP=1, REDIS_MODE_DISTRIBUTED=2, REDIS_MODE_DISTRIBUTED_NOSTORE=3`.
- `src/nchan_setup.c:1668` parser accepts `backup | distributed | nostore`
  (also `distributed-nostore`). Default when unset = `DISTRIBUTED`
  (`nchan_setup.c:601`, `src/store/redis/rdsstore.c:2023`).
- `src/nchan_commands.rb:456` directive is valid in `:main, :srv, :upstream, :loc`.
- `src/subscribers/memstore_redis.c:74` a subscriber reads
  `d->chanhead->cf->redis.storage_mode` — i.e. a channel's storage mode is bound
  to the **channel head's** config (`chanhead->cf`), not the requesting
  location's. A channel head is created once (first request to that channel ID).
  So a per-location storage mode only takes effect if that location creates the
  channel. A `nostore` on `/sub/` is ignored when the publisher (distributed)
  already created the channel, and is history-breaking when a subscriber creates
  the channel first (race).
- `src/store/redis/rdsstore.c:1081` NOSTORE channel uses
  `NCHAN_SPOOL_PASSTHROUGH` (no history fetch) → late-join/history replay returns
  nothing. `:2261` NOSTORE still hand-rolls the Redis PUBLISH, so live cross-node
  pubsub delivery works, but nothing is stored for replay.
- `src/store/redis/rdsstore.c:726,1449,1481` and `memstore.c:1545,1551,3223,3236`
  BACKUP mode: publish locally first + forward to Redis; Redis used for
  persistence/channel-init. Documented for a single server
  (`nostore`/`backup` docs: "only one Nchan server should use a Redis backend in
  backup mode"). Non-owner backup broke late-join because the partition-local
  memory lacked pre-existing channel history (prior final-push finding).

## Candidate verdicts

### N1 — distributed pub/history + nostore LIVE /sub
**UNSUPPORTED (for its stated goal).** A channel's storage mode is bound to its
creator (`chanhead->cf`); a `nostore` on `/sub/` is either (a) a no-op when the
publisher's `distributed` channel exists, or (b) history-breaking (missing
messages on late-join) when a subscriber creates the channel first. NOSTORE
disables stored history by design (`NCHAN_SPOOL_PASSTHROUGH`). Cannot both remove
live-path storage AND preserve distributed history for the same channel.
=> small smoke run to corroborate; expected INCONCLUSIVE (late-join missing) or
   no-op (= F1).

### N2 — N1 + lobby nostore
**UNSUPPORTED** (depends on N1 which is unsupported; also risks losing the
required lobby latest-state behavior). Skip.

### B1 — p0-only backup, p1/p2/p3/spare distributed
**SUPPORTED (most promising).** Matches documented single-backup-server usage.
p0 (publisher owner) publishes locally-first → its 25k live subscribers get
instant local-memory delivery (removes the Redis round-trip from p0's hot path,
the dominant DUT-side slice per diagnosis). p1/p2/p3 remain distributed → their
channels are Redis-backed with COMPLETE history, so late-join replay is intact
(fixes the prior all-partition backup failure). Cross-node still via Redis pubsub
(inherent). => 4k correctness smoke, then 100k if valid.

### B2 — p0 backup + nostore live on p1/p2/p3
**UNSUPPORTED.** The nostore component breaks history on non-owner partitions
(same N1 issue); p1/p2/p3 /sub/ nostore would make those channels NOSTORE →
late-join missing. Skip unless B1 alone is invalid and evidence shows a safe
per-location split (none found in source).

### D1 — nchan_redis_idle_channel_cache_timeout
**AMBIGUOUS — investigate from telemetry.** No current evidence of channel
reinit/cache-eviction churn during measured windows. Will inspect if a 100k run
shows channel-reinit symptoms. Low priority until evidence appears.

### R1 — Redis CPU/thread alignment within frozen 7.2
**AMBIGUOUS — investigate from evidence.** F1 uses io-threads=4 + do-reads=yes
with Redis cpus:2 limit. Redis 7.2 caps at do-reads (no do-writes). If Redis main
thread is saturated under the frozen publication rate, a justified CPU/thread
alignment could help, but the container CPU limit is part of the frozen DUT
resource envelope — must verify the contract does not freeze the Redis CPU limit
before testing. Investigate; likely low marginal value given do-reads already
applied.

## Next
Run 4k smokes in order: N1 (corroborate), B1 (primary). 100k only for
correctness-valid candidates. Keep D1/R1 as evidence-driven fallbacks.
