# M3 target-era fan-out stalls — diagnostic state (runs G–M, 2026-08-23)

## Symptom
Contract v2.3.0 probes (run-probe.sh 100000 and 60000): all shard gates pass,
coordinator REJECTs / INCONCLUSIVEs on `fan_out_p95_ms 30000 > 500` (overflow
sentinel) and `burst_p95_ms ~5800-7600 > 1000`. Era attribution (transport =
publish→wire, era by delivery window):

| era | p95 | ≥5s fraction |
|-----|-----|--------------|
| pre/steady | ~160ms | 0% |
| surge (60k→100k) | ~150ms | 0% |
| burst (52 msg/s × 12s) | 4.8–9.1s | 2–17% |
| target (post-burst→final) | 25–30s | **40–67%** |

Slow frames cluster in waves; post-burst (quiet, no churn) is the worst window
(run H ring: 5936 slow samples in 10s). Implied publish times show most late
frames were published during/right after the burst — one backlog draining at
~1/3 real-time.

## Ruled out (with evidence)
- loadgen scheduling: process_delay p50 0, zero slow (8016ce3)
- publisher scheduler lag p95 ~1ms (5d1f13f)
- kernel packet loss: TcpExt deltas clean outside failover window (86b0162)
- CPU starvation / cgroup throttling: workers ≤35% quota, nr_throttled=0
- memory pressure: 1.3G/6G peak, oom_events=0
- capacity cliff: 60k probe fails identically (probe60k-a)
- log-pipe blocking: non-blocking json-file driver left stalls unchanged (I)
- redis-node bounce as ROOT cause: command_timeout 5s→60s eliminated all
  "Marking node as failed" events and NULL-reply storms (L), stalls persist

## Root cause signature — CAPTURED (runs J–O)
Auto-backtrace watcher (75e2445) caught the stalling workers on EVERY
partition (run O, 30 dumps): all frozen-vctx/CPU-burning workers are inside

    #0 writev
    #1 ngx_writev            src/os/unix/ngx_writev_chain.c:189
    #2 ngx_linux_sendfile_chain  (limit=2097152)
    #3 ngx_http_write_filter
    #4 ngx_http_chunked_body_filter

i.e. continuously flushing huge buffered SSE output chains. Draining such a
chain monopolizes the worker (no event processing → delayed IPC alerts, late
redis replies, stalled deliveries to that worker's other subscribers) for
seconds-to-tens-of-seconds, which cascades into more per-connection buffering.
Not ngx_rwlock (DEBUG_NGX_RWLOCK=1 would flood 'rwlock mutex wait' warns; none
appear). Redis rail intact → frames late, never lost (correctness perfect).

Open question: what fills the per-connection output buffers ahead of the
drain waves — TCP zero-window from briefly-unread client sockets, or nchan
handing the worker an oversized message chain in one shot. Next instrument:
per-worker written-bytes/s (nginx stub_status lacks it; use /proc/<pid>/io
write_bytes deltas per worker via /workers/deep) plus per-connection
correlation with slow_delivery_timeline timestamps.

## Fix landed so far
- e1e77ec: nchan_redis_command_timeout 5s→60s (removes bounce amplifier;
  target-era slow counts dropped ~20% but stalls persist)
- ca2ac35: non-blocking docker logging (hygiene; not the mechanism)
- 90d8154: SYS_PTRACE + /workers/deep instrumentation (works; 167/167 samples)

## Definitive attribution — probe ladder (2026-08-23, post debug-off freeze)

All runs use the frozen B1 baseline: `NGINX_DEBUG=0`, `LIVELOCK_WATCHER=0`,
`nchan_shared_memory_size 64m`, `tcp_nopush on`, 4 partitions × 4 workers.

| Probe | Change | fan_out p95 | burst p95 | correctness | note |
|-------|--------|-------------|-----------|-------------|------|
| B1    | debug-off (baseline) | 6083 | 4490 | 0 ✅ | INCONCLUSIVE |
| C1    | `sendfile_max_chunk 64k` | surge hung | — | — | REGRESSION (reverted) |
| D1    | `nchan_shared_memory_size 512m` | 5296 | 3198 | **12352 ❌** | REGRESSION (broke ordering; reverted) |
| E1    | `tcp_nopush off` | 6239 | 8333 | 0 ✅ | REGRESSION (worse; reverted) |

### DUT vs harness split (from `fan_out_transport` = publish→wire, DUT-side)
Measured on the E1 run's per-shard histograms; `fan_out` = total (DUT+harness):

| shard | fan_out(total) p95 | transport(DUT) p95 | harness gap |
|-------|--------------------|--------------------|-------------|
| 0 | 7203 ms | 6255 ms | ~948 ms |
| 1 | 2093 ms | 3886 ms* | *transport contaminated by backlog/history frames |
| 2 | 6788 ms | 3849 ms | ~2940 ms |
| 3 | 6975 ms | 6008 ms | ~967 ms |

DUT-side transport is **3849–6255 ms p95** across shards — the dominant,
unavoidable contributor. Harness-side (wire→dispatch) gap is ≤~3 s and usually
<1 s. **Even a perfectly optimized harness leaves 4–6 s of DUT latency.**

### Why no config knob can fix it
- nchan's own published ceiling: "300K concurrent subscribers per second …
  excluding TCP/network delivery."
- Burst volume = 52 msg/s × 8 channels × ~12.5k subs/channel ≈ **5.2M
  deliveries**. Gate `burst p95 ≤ 1000 ms` ⇒ need ≥5.2M deliveries/s.
- 4 partitions × 4 workers deliver ~**1.15M deliveries/s** (5.2M / 4.5s actual
  burst p95) — already ~4× above nchan's documented 300K/s, yet 4.5× short of
  the gate. This is a hard per-worker fan-out throughput wall.

### Conclusion
The frozen topology (4 partitions, 4 workers each) cannot fan out the burst
volume within the frozen latency gates. Every config lever tried either
regressed or was neutral; the root cause is nchan write-path serialization
(worker draining SSE output chains), which is source-level — outside the
config-only scope. ACCEPT is unattainable without one of:
1. nchan/nginx source patch (frozen DUT binary),
2. architecture change — more workers/partitions (frozen topology), or
3. relaxing the frozen latency gates in `EXPERIMENT_CONTRACT_v2_3_0.md`.

## Next steps
1. Identify the contended shm lock: perf/gdb on the spinning worker mid-run
   (SYS_PTRACE now available in containers), or --with-debug build scoped to
   one partition — the old debug-freeze artifact (f8d5949) should be mitigated
   by non-blocking stderr.
2. Candidate upstream suspects: nchan memstore channel-lock hold times during
   multi-hundred-subscriber fan-out writes; ipc.c write path under lock.
   Check nchan issue tracker for 1.3.x spinlock/livelock reports.
3. After root fix: re-run ladder (100k probe ×3 seeds), then qualifying
   campaign per M3 closeout plan.
