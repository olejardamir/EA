# M3 Independent Verdict Audit

- campaign_id: `ea-evidence-100k-ed773b5a843b-1787447193`
- source_commit: `ed773b5a843bb01aa394a0ac0268eb9abb1a38df`
- machine verdict: `MISSING`
- independent verdict: **FAIL**
- agreement (independent PASS + machine ACCEPT): **NO**

| check | result | detail |
|-------|--------|--------|
| contract identity | FAIL | all runs report v2.3.0 |
| source identity | FAIL | policy=ed773b5a843bb01aa394a0ac0268eb9abb1a38df runs=none |
| exact 3 runs | FAIL | run_indices=[] |
| seeds 42/43/44 | FAIL | seeds=[] |
| 4 shards | FAIL | shard_counts=[] |
| publisher owner | FAIL | exactly one owner per run with accepted workload |
| phase completeness | FAIL | all 12 coordinated phases measured per run |
| 60k baseline | FAIL | per-run surge start populations [] |
| +40k established <=120s | FAIL | per-run [attempted=] [established=] [max elapsed ms=] deadline=120000ms |
| 100k full target | FAIL | targets=[] per-run final_surge_population=[] |
| mandatory correctness fields present | FAIL | 30 fields numeric on every shard |
| correctness zero | FAIL | all totals zero |
| surge correctness | PASS | surge counters zero |
| reconnect exact denominator | FAIL | 64/64/64/64/64 with zero failures on every shard |
| restart measured deltas | FAIL | structured pool agrees with top-level counters on every shard |
| latejoin 256/run | FAIL |  |
| latejoin 768/campaign | FAIL | merged total 0 |
| deep 1024/1024 | FAIL | deep-agreement evidence incomplete |
| latency thresholds | FAIL | fan_out_p95=0 burst_p95=0 late_join_p95=0 surge_p95=0 (gates 500/1000/2000/500) |
| publisher workload/rates | FAIL | measured rates inside frozen windows |
| generator validity | PASS | valid on every shard of every run |
| Nchan p0..p3 validity | FAIL | all four partitions report valid evidence |
| spare validity | PASS | spare-node evidence present |
| Redis validity | PASS | memory evidence valid everywhere |
| CV formula | FAIL | no campaign result |
| CV <=0.15 | PASS | worst_cv=0 |
| per-run verdict consistency | FAIL | no campaign result |
| campaign verdict consistency | FAIL | no campaign result |

Independent audit DISAGREES — M3 remains open.
