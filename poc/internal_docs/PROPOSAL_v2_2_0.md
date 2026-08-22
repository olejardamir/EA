# Production Proposal — Live Match Centre (v2.2.0)

Based on terminal M3 100k 3-run ACCEPT (4+1 partitioned Nchan, shared Redis, Go crowd)

## Architecture
- 4 active Nchan fan-out partitions (match sharding by match_id hash) + 1 hot spare, shared Redis OSS, single-owner publisher via p0, partition-targeted drain+failover
- 100k = 4×25k, surge +40k in 120s, burst 50/s, deep cohort 1024, reconnect 256, late-join 32 probes
- Contract v2.2.0 frozen, 5 histograms (fan_out, goal, other, late_join, burst), per-partition resources, exact restart evidence

## Why not single-primary
- q5 INCONCLUSIVE at 65k: 32k worker ceiling, 8G OOM, duplicates, gaps — partitioning is the only validated 100k path (M4)

## Risks and mitigations
- Host overcommit (18 CPU on 12-core) — prod fleet is 5× separate hosts, no overcommit
- Late-join variance (p95 100-380ms) — 0.80 dispersion, acceptable for catch-up; not on critical path
- Failover 1 dup inclusive — allowed, 0 gaps, 0 failed

## Cost
- See COST_MODEL_v2_2_0.md — ~$0.90/hr per 100k, 30% over single-primary but validated

## POC scope
- Measures riskiest assumption: 100k fan-out with exact replay, late-join, reconnect, restart — all ACCEPT at 100k

## Next
- Reproducibility: `run-evidence-100k.sh` one-command, `run-probe.sh 10000` etc.
- Clean poc/, ZIP, README
