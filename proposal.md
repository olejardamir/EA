# Live Match Centre — Design Proposal

## Architecture

 ```
 PROVIDER (HTTPS push, best-effort)
         |
         v
 API Gateway HTTP API --> SQS FIFO (group = match_id)
         |
         v
 Lambda canonical processor
   validate / version-normalize; idempotent write; derive score & minute
         |
         v
 DynamoDB  ===== CANONICAL TRUTH (events + state, transactional) =====
         |  history/replay feed + live publication
         v
 Delivery fleet: horizontally partitioned EC2 ASG nodes
   each: Nchan 1.3.8 + partition-local Valkey (ElastiCache)
   match -> partition (deterministic); HOT match = dedicated sub-shard
         |
         v
 single private NLB (one target group + listener per partition)
         |
         v
 CloudFront (private SSE origins; cached static Next.js at edge)
         |
         v
 Next.js App Router client (EventSource; idempotent canonical_seq reducer)
```

Two state planes are kept distinct: **canonical truth** (DynamoDB — the durable, ordered source of score, state, and history) and **delivery/history state** (Valkey/Nchan — a rebuildable cache of canonical truth for fast fan-out and replay).

**Provider transport assumption.** I assume HTTPS push from the provider; a persistent vendor stream would replace only the ingress adapter (the API Gateway integration), not the durable queue, canonical processing, or downstream design. Real provider feed semantics and schema were not supplied, so this boundary is explicitly an assumption, not an invented fact — provider events are validated and normalized into a stable canonical model so an upstream schema change is contained at ingestion.

## Correctness, history and recovery

Provider events arrive over HTTPS and are enqueued durably in SQS FIFO, preserving per-match order. A Lambda processor validates and normalizes each event into a versioned canonical schema and writes it idempotently to DynamoDB, keyed by `(match_id, canonical_seq)` with a conditional/transactional put that dedupes by provider event id. Canonical state (score, official match minute) is derived purely from these events — the browser never owns the official clock.

History and live delivery share one atomic boundary: every canonical event carries a monotonic `canonical_seq`. A client connects, fetches snapshot/history up to cursor `N`, then subscribes live for `seq > N`. The client reducer is idempotent by `canonical_seq`, so late-join, reload, and phone-wake cannot create a hole or double-apply an event. Last coherent state stays on screen while the transport reconnects (never blank, no manual refresh); reconnection is jittered to avoid a thundering herd.

An event durably accepted but failing one processing attempt is retried with idempotent canonical write and alerted/quarantined on repeated failure; it is never silently skipped, and a malformed/duplicate "poison" event cannot corrupt canonical state because writes are conditional on the canonical sequence and provider event id. Provider events are validated and normalized into a stable, version-aware canonical model, so an upstream schema change is rejected or migrated rather than silently corrupting state. If the delivery cache is lost, the owning partition rebuilds history from DynamoDB — canonical truth is never the only copy.

The lobby is the public, anonymous, read-only entry point: it lists all live matches with current score and match minute, and shows goals and cards as they happen with no manual refresh. The match page extends this with the full run-of-play, immediate full history, then live streaming. Because correctness is keyed to `canonical_seq`, the lobby and match views always agree with the event stream: no duplicate display, nothing disappears, and display order follows canonical order.

## Scale, latency and geography

The design serves 100,000 peak viewers across 8 matches at ~10 events/s steady and ~50 events/s burst, absorbing a +40,000 viewer surge in 120 s. The fixed local topology's bottleneck (one Nchan primary's per-worker fan-out throughput) is removed by **horizontal partitioning**: matches map to delivery nodes by deterministic hash, and a hot match is assigned a dedicated sub-shard so one popular match cannot overload a single node. Each node holds a deliberately conservative ~8k concurrent-SSE envelope (c7g.xlarge); the fleet is pre-scaled warm before kickoffs and runs N+1 with autoscaling for headroom. **Crowd-size invariance:** the same architecture serves 100 total viewers and 100,000 total viewers identically — only the partition count and node count scale; there is no fixed per-node ceiling that 100 viewers approach, so there is no M3-style fan-out throughput wall at small scale either.

Latency: the assignment targets goal p95 ≤2 s and routine p95 ≤5 s ingest-to-screen, with full history visible ≤2 s. The local POC reached 100k with zero correctness violations but measured fan_out p95 2757 ms and burst p95 3707 ms — it did **not** meet the frozen latency gates, so those targets are presented as a planning budget, not a production-measured result. A compact budget: durable ingest + canonical processing are sub-second (local + service facts); fan-out publication is the dominant stage; edge/network and browser parse/render remain production inferences. Full-history ≤2 s is a **bounded planning assumption**, not a measured browser result: it assumes a ~90-min match, ~60k events, ~300 B each (≈18 MB/match), and typical broadband transfer plus incremental render. Real provider payloads and browser render were not measured by the POC.

Geography: origin in eu-west-1; CloudFront edge serves static assets and fronts SSE over private origins. EU (~60%) has low RTT; NA (~40%) is reached via a transatlantic path — a production inference, not a measured result. Multi-region is not justified under the $3k budget; within-region failure domains span at least two AZs. The 60/40 split is addressed separately rather than hidden behind one global claim.

## Deployment and operations

Weekly live deploys are unnoticeable: backend delivery nodes roll via NLB connection draining and Instance Refresh with N+1 spare capacity; canonical state stays compatible across versions; the frontend ships immutable, versioned Next.js assets so an already-open client is not broken. A bad release rolls back without blanking viewers or deleting history. Slow clients are disconnected (bounded buffering) and resume from cursor. Observability covers provider ingest health, queue depth, processor errors, canonical-sequence anomalies, delivery-node CPU/memory/connections/OOM, Valkey health, target health, and CloudFront errors — plus sampled end-to-end viewer-screen latency (goals vs routine, EU vs NA) via server ingest timestamps and anonymous, low-rate browser telemetry. Production SLAs are observed, not asserted by the POC: SSE reconnect p95, history replay p95, end-to-end goal p95/p99 on EU and NA, and completeness (missing/out-of-order/dupes) on the production stream.

## Cost and trade-offs

Modeled baseline ≈ **$2,318/month** (2026-08-23 pricing, eu-west-1): delivery compute (16 × c7g.xlarge, 1-yr Savings Plan) ~$1,121; partition-local Valkey (16 × cache.t4g.medium reserved) ~$504; CloudFront Business flat-rate $200 (covers up to 50 TB DTO — base ~13.5 TB at H=120 fits); ingest/canonical (API Gateway + SQS FIFO + Lambda + DynamoDB) ~$290; NLB/NAT/CloudWatch/S3/Route53 ~$203. The dominant traffic assumption is 120 peak-equivalent match-hours/month at 100k concurrency; base data-transfer-out (~13.5 TB at H=120, per `100k × 1.25 evt/s × 250 B × 3600 × H`) sits inside the CloudFront Business 50 TB cap, so egress is effectively flat at the base. The conclusion is **within budget** with ~23% margin. Sensitivity: only sustained peak-hours beyond ~440/month (DTO > 50 TB) pushes past $3k, so the budget is **conditionally within** at very high live-hour volume.

Key trade-offs: self-hosted horizontally partitioned Nchan/Valkey over managed fan-out (cost/control at 100k SSE, and it directly fixes the POC bottleneck); DynamoDB over relational (serverless idempotent writes); single-region over multi-region (budget); CloudFront over direct ALB (private-origin protection + static CDN, with the honest caveat that live SSE is not edge-cached).

## Riskiest assumption and POC

The overall least-trusted assumption is **provider feed semantics** — no real provider or schema was supplied, so it was not locally testable. The riskiest locally testable assumption was fixed fan-out capacity at assignment scale.

The local experiment reached 100,000 active viewers with zero correctness violations, surge and late-join clean, but measured fan_out p95 2757 ms and burst p95 3707 ms, missing the frozen 500/1000 ms gates. M3 was therefore **hard-stopped without ACCEPT**: the single best-validated F1 probe showed the scale/correctness behavior succeeded while the frozen latency gates failed, and the terminal three-run v2.3.0 qualification campaign (seeds 42/43/44) was not run because the configuration was already demonstrably outside the gates. Investigation isolated the limit to fan-out throughput of the fixed 4-partition topology and declared config-only tuning exhausted. The proposal therefore replaces the fixed-capacity assumption with horizontally partitioned fan-out replicas, hot-match sub-sharding, resource-aware autoscaling, pre-scaled kickoff capacity, and N+1 headroom. The replacement topology was not itself benchmark-validated by the POC; its remaining claims rest on current service facts, explicit quotas, conservative assumptions, cost analysis, and required pre-launch production load testing.
