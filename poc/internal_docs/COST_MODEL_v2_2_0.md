# Cost Model — v2.2.0 Horizontal Partition (100k)

Source: `a96caa159882` campaign, 4×25k + spare, Redis, Go crowd

Per 100k concurrent viewers (steady +40k surge to 140k, burst 50 msg/s):

- Nchan partitions: 5× (3 CPU, 6G) = 15 CPU, 30G — 4 active +1 spare (spare idle, bursts to 3 CPU on failover)
- Redis OSS: 2 CPU, 2G (shared, `used_memory` 1-2M per run)
- Publisher/control: 0.5 CPU, 0.5G
- Coordinator: 0.5 CPU, 0.5G
- Total DUT: ~18 CPU, ~33G (vs single-primary 4 CPU/8G which OOM at 65k)
- At 12-core host, overcommit 1.5× but no throttle observed (cgroup cpu_throttled 0, memory peak 77M per Nchan)
- Production fleet: 4× c6g.xlarge (4 vCPU, 8G) + 1 spare + 1 Redis (r6g.large) + 1 publisher — ~$0.90/hr per 100k (vs 1× c6g.2xlarge single-primary $0.68/hr but fails at 65k)

Generator (Go crowd) not in prod cost: 4×4 CPU, 4G per shard =16 CPU/16G for 100k synthetic, deep cohort 1024.

Takeaway: Horizontal partition costs +~30% vs single-primary but is the only validated 100k path; single-primary is not credible beyond 65k.
