# M3 Architecture Revision — Post-Terminal Experiment

> This is a post-M3 architecture revision. It does not alter or supersede
> the frozen v2.3.0 M3 evidence. It retains the original workload and
> performance gates while allowing topology changes in response to M3's
> falsified architecture assumption.

Historical M3 (frozen v2.3.0, commit d42d471) declared ACCEPT unreachable at
the 4-partition (4×4 workers, Redis-broadcast) topology with:
- fan_out p95 2757ms (gate ≤500)
- burst p95 3707ms (gate ≤1000)
- correctness 0, peak 100k

The revision introduces match-aware horizontal fan-out (8 matches × 2 shards
= 16 independent Nchan instances, 1 worker each, local in-memory storage,
direct per-match publish routing) to reduce per-instance subscriber
populations and eliminate cross-match fan-out work and Redis PUBSUB
amplification.

Artifacts:
- `compose.arch-revision-100k.yaml` — 16-shard topology
- `run-arch-revision-probe.sh` — short 100k probe launcher (generates
  NCHAN_PUB_ROUTES / NCHAN_SUB_ROUTES deterministically from the port
  scheme)
- `nchan/fanout-{m}{a|b}.conf` (16 files) + `nchan/generate-fanout-confs.py`
- `runner/src/adapters/routed-nchan-publisher.ts` + `publisher-service.ts` routing
- `loadgen/internal/pool/pool.go` + `loadgen/cmd/loadgen/main.go` routing

Workload and gates are UNCHANGED. Only the delivery topology and its
routing are new. The spare/replacement drill is best-effort (spare URLs
empty) for the first probe; it will be wired if the fan-out hypothesis is
validated.

Qualification, if the bridge passes, will use a revised experiment contract
that references v2.3.0 as the historical failed topology and retains the
same workload, gates, correctness, and seeds 42/43/44.
