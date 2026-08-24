# Live Match Centre — Design Proposal

## Architecture

```text
Third-party feed (best-effort push)
        |
        v
API Gateway HTTP API
        |
        v
SQS FIFO, MessageGroupId = match_id
        |
        v
Lambda canonical processor
validate / normalize / dedupe / derive score + minute
        |
        v
DynamoDB
canonical ordered events + current match state
        |
        +--------------------> history/snapshot API
        |
        v
delivery publisher
        |
        v
fan-out shard groups
each group = shared Valkey + multiple Nchan replicas
        |
        v
CloudFront/static Next.js + regional SSE endpoints
        |
        v
Next.js App Router client
history first, then live EventSource stream
```

The system separates **canonical truth** from **delivery state**. DynamoDB stores the durable event history and derived score/minute. Valkey/Nchan is a rebuildable delivery layer used only for low-latency replay and fan-out.

The provider boundary is deliberately explicit. The assignment says delivery is best-effort and does not define stable event IDs, provider sequence numbers, or an authoritative reconciliation endpoint. Once an event reaches our ingress, SQS and idempotent canonical processing prevent us from losing it. If the production provider supplies event identity/order or a snapshot/reconciliation API, the adapter uses it to detect gaps, duplicates, and upstream reordering. If it does not, an event that the provider never sends cannot be reconstructed from nothing; that is the largest external dependency risk and must be resolved in the provider contract rather than hidden by the application design.

## Correctness, history and client behavior

Each accepted event is normalized into a versioned canonical model. The processor writes the event and updated match state idempotently in DynamoDB and only publishes after the canonical write succeeds. A stable `canonical_seq` is assigned in accepted canonical order. Provider IDs/order are used when the real feed supplies them; they are not invented as an assignment fact.

Late join is a snapshot-to-stream handoff. The client requests current state plus history through sequence `N`, renders it immediately, and then subscribes to live events after `N`. Every live event carries `canonical_seq`; the reducer ignores a sequence it has already applied and buffers a small gap rather than rendering newer state over missing earlier state. On reconnect or phone wake it resumes from the last applied cursor. Existing coherent state remains visible while reconnecting, so the user never sees a blank feed or needs a manual refresh.

The score and minute shown in both lobby and match views are derived from the same canonical events as the timeline. The browser never independently increments the official score or clock. This prevents the score panel and event list from disagreeing because of separate client-side state.

The public frontend has no accounts and no write path. With Next.js App Router, server-rendered page shells deliver fast first paint; client components handle live state. The main component boundaries are `LiveMatchList`, `MatchCard`, `ScoreHeader`, `EventTimeline`, and a shared `useMatchStream` hook/reducer. The lobby consumes the same canonical stream and shows every live match, score, minute, goals, and cards without refresh.

## Scale, hot matches and geography

Peak requirements are eight live matches, about 10 events/s total with bursts near 50/s, 100,000 concurrent viewers, and a +40,000-viewer surge in two minutes.

The critical production rule is that **a match is not limited to one fan-out node**. A match maps to a fan-out shard group, and each group can contain multiple Nchan replicas. All replicas assigned to that match receive the same canonical publication through the group's Valkey channel; the connection endpoint distributes new SSE viewers across those replicas. A very hot match is given its own group and can add replicas without moving existing sockets. New viewers are assigned to the least-loaded healthy replica; existing viewers stay connected until normal reconnect or draining. This means one match can consume many nodes rather than being capped by one node's connection limit.

The fleet is pre-scaled before known kickoffs, keeps N+1 spare capacity, and autoscales on concurrent connections, CPU, memory, and reconnect/admission pressure. A +40,000/120s surge is roughly 333 new viewers/s, so admission capacity is kept warm instead of depending on reactive instance launch time.

The origin is in `eu-west-1`, close to the 60% European audience. Static Next.js assets are edge-cached. North American viewers use the same correctness path with a longer network leg. The design stays single-region because active-active multi-region is difficult to justify inside the $3,000/month ceiling; production monitoring therefore reports latency separately for Europe and North America rather than assuming identical RTT.

## Latency, deployment and operations

The assignment targets p95 ingest-to-screen latency of at most 2 s for goals, 5 s for other events, and full history visible within 2 s. These are production SLOs, not claims that the local POC measured internet/browser end-to-end latency.

A 90-minute match at an even share of the stated 10 events/s total is about 6,750 events. At an assumed ~300 B/event that is about 2 MB of event data, so the network transfer is modest; browser parsing/rendering must still be measured before launch. Goals are prioritized through the same pipeline, with queue age, publish latency, SSE delivery latency, and sampled browser render telemetry tracked separately.

Weekly deploys use rolling replacement with connection draining and N+1 capacity. Existing SSE connections are allowed to drain; reconnects resume from `canonical_seq`. Schema changes are backward-compatible across one deployment window, and frontend assets are immutable/versioned so an already-open page keeps working during deployment.

Operational alarms cover ingest silence, malformed provider data, queue depth, canonical sequence anomalies, Lambda failures, DynamoDB throttling, Nchan/Valkey health, connection counts, CPU/memory, reconnect storms, history latency, and sampled end-to-end latency. Slow consumers have bounded buffers and reconnect from their cursor rather than consuming unbounded server memory.

## Cost and trade-offs

The modeled peak-month baseline is about **$2,318/month** under the stated workload assumptions: roughly $1,121 for 16 `c7g.xlarge` delivery instances, $504 for 16 `cache.t4g.medium` Valkey nodes, $200 for CloudFront Business, about $290 for API Gateway/SQS/Lambda/DynamoDB, and about $203 for NLB/NAT/CloudWatch/S3/Route53. The estimate assumes about 120 peak-equivalent match-hours/month and ~250 B live payloads. At those assumptions it is below the $3,000 ceiling with about 23% headroom. The cost claim is conditional on that traffic model and must be re-priced before launch.

The main trade-offs are SSE/Nchan over custom WebSockets for simpler one-way public streaming; DynamoDB over a relational database for idempotent event/state writes at low operational load; single-region over active-active multi-region for cost; and self-hosted fan-out over a managed pub/sub service for predictable control of 100,000 long-lived connections.

## Riskiest assumption and proof of concept

The largest overall risk is the third-party feed contract: best-effort push alone cannot guarantee detection of an event that is never sent, and the assignment does not provide the identity/order/reconciliation semantics needed to test that locally.

The riskiest **locally testable** assumption is fan-out capacity: whether a fixed Nchan/Redis/SSE tier can serve assignment-scale concurrency while preserving correctness and sufficiently low latency. The POC simulates the feed and measures real SSE delivery.

The best correctness-clean 100,000-viewer run reached 100,000 active viewers with zero viewer-facing missing, duplicate, out-of-order, or state-consistency violations, but measured fan-out p95 was about **4.242 s**, burst p95 about **11.006 s**, and late-join p95 about **0.906 s**. Those results disprove the fixed-capacity production assumption: fan-out latency alone is too high to confidently meet the assignment's 2 s/5 s ingest-to-screen targets.

Therefore the production proposal does not scale by making one fan-out node larger. It scales a hot match across multiple delivery replicas, keeps capacity warm, and preserves DynamoDB as canonical truth. The replacement topology is a design response to the measured failure and must itself pass production-scale load testing before launch.
