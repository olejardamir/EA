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

## Root-cause signature (runs J/M, SYS_PTRACE deep snapshots)
At burst onset, ONE worker per nchan partition livelocks: userspace spin
(~0.3–0.9 core sustained), voluntary context switches freeze at a fixed value
for the rest of the run (shard0/pid16: frozen at 17813 from t+111s), syscall
always "-1" (userspace). Matches ngx_spinlock semantics (multicore: pure busy-
wait, no yield). Correlated: "interprocess alerts delayed by N sec" up to 37s;
delayed workers sleep in ep_poll with ready IPC pipes unread; their subscribers'
frames stall until churn forces wakeups. Redis rail stays intact → correctness
counters remain perfect (late, never lost).

Also observed per node: 1–2 other workers show zero wakeups for 10–22s windows
during burst/post-burst (possibly legitimate accept-imbalance × weighted match
selection; possibly same lock waiting in epoll).

## Fix landed so far
- e1e77ec: nchan_redis_command_timeout 5s→60s (removes bounce amplifier;
  target-era slow counts dropped ~20% but stalls persist)
- ca2ac35: non-blocking docker logging (hygiene; not the mechanism)
- 90d8154: SYS_PTRACE + /workers/deep instrumentation (works; 167/167 samples)

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
