# Live Match Centre — Final Minimum Defensible Architecture

**Date:** 2026-08-19  
**Status:** FINAL SIMPLIFICATION PASS COMPLETE  
**Governing source:** `requirement.pdf`  
**Purpose:** Keep only components that directly earn their place against the assignment. A component is removed only if all assignment constraints remain satisfied and the replacement creates less total complexity.

---

## 1. Final result

The final production architecture is:

```text
Fans
  |
  v
CloudFront
  |------------------------------|
  |                              |
  v                              v
S3                         private NLB
Next.js static                  |
                                v
                         Nchan EC2 ASG
                                |
                                v
                   ElastiCache Redis OSS 7.1
                      shared Nchan storage
                                ^
                                |
                         internal HTTP POST
                                |
Provider -> API Gateway HTTP -> SQS FIFO -> TypeScript Lambda
                                           |
                                           v
                                       DynamoDB
```

There are only **two pieces of production application code**:

```text
1. TypeScript canonical processor Lambda
2. Next.js frontend + tiny native EventSource/canonical-seq reducer
```

Everything else is managed infrastructure or an existing open-source product.

---

## 2. Live transport: native SSE, not WebSockets

**KEEP: Nchan**  
**KEEP: native browser `EventSource`**  
**REMOVE: WebSocket client/server code, PartySocket, SocketCluster, Socket.IO, raw `ws`**

Fans are anonymous and read-only. The assignment needs server -> browser updates, not browser -> server messaging.

Nchan natively supports EventSource/SSE:
- HTTP GET subscription;
- an `id:` on each SSE message;
- `Last-Event-ID` resume;
- periodic SSE pings;
- per-channel buffers;
- `nchan_subscriber_first_message oldest`.

CloudFront supports chunked transfer and forwards a chunked response to the viewer as chunks arrive, so the live stream can pass through the existing global edge.

For `/live/*`:
- caching is disabled;
- Nchan emits an SSE heartbeat comfortably inside CloudFront's origin read timeout;
- response completion timeout is left unset so CloudFront does not impose a total lifetime on the stream.

The browser still validates the **application** `canonical_seq`. Nchan's transport message ID is not sports-event identity.

---

## 3. Full match history: Nchan buffer is the normal viewer path

**REMOVE: S3 match snapshots**  
**REMOVE: snapshot projector**  
**REMOVE: normal Replay API**  
**REMOVE: snapshot/live cutoff protocol**

For each active match:

```text
channel = match-001 … match-008  (bare Nchan channel_id; code publishes directly)
first message = oldest
message timeout = 0 while match is active
buffer size = enough for the entire active match
```

A late viewer does:

```text
open EventSource
 -> Nchan sends the oldest retained event
 -> streams the rest of the match history
 -> the same connection naturally becomes live
```

This is simpler than joining a snapshot to a separate live stream and removes that race completely.

The POC must now explicitly test:

```text
full buffered match history visible <= 2s
while fan-out is under load
```

DynamoDB still keeps canonical history so an Nchan/Redis delivery-store failure is rebuildable.

---

## 4. Lobby: one latest-state channel

**KEEP: one `lobby` Nchan channel**

Buffer length:

```text
1
```

On a lobby-visible change, the processor publishes the **complete current lobby state** for at most eight matches.

A new lobby viewer gets:
1. current complete state immediately;
2. replacement state whenever it changes.

This intentionally avoids:
- registry-version handshakes;
- sparse delta gaps;
- per-match lobby cutoffs;
- replay logic.

It is simpler and the payload remains small because the assignment caps live matches at eight.

---

## 5. Durable provider ingress: API Gateway -> SQS FIFO

**KEEP: API Gateway HTTP API**  
**KEEP: SQS FIFO**  
**REMOVE: dedicated ingest Lambda**

The provider is best-effort and has no long retry window, so the shortest safe boundary is:

```text
receive -> durably enqueue -> acknowledge
```

API Gateway HTTP APIs support direct `SQS-SendMessage` integration.

Use a provider-schema mapping to set:

```text
MessageGroupId = match_id
```

once the real provider contract identifies the match field. The assignment necessarily implies that incoming events can be associated with a match, but it does not specify the field/schema.

SQS FIFO provides transport serialization within each match. It does **not** create or prove provider semantic event order.

At the assignment's ~50 events/s burst, FIFO throughput is nowhere near its service limit.

---

## 6. One backend compute component

**KEEP: one TypeScript Lambda**

For each SQS event:

```text
1. validate / normalize provider event
2. apply only known provider semantic rules
3. derive score / clock / canonical state
4. transactionally commit canonical event + head/state + idempotency in DynamoDB
5. publish the committed event to Nchan over private HTTP
6. publish a full lobby state when the event is lobby-visible
7. acknowledge SQS only after the required work succeeds
```

If the canonical transaction succeeds but Nchan publication has an uncertain failure, SQS retries.

The retry:
- detects the already committed canonical event;
- republishes the same `canonical_seq`;
- never allocates a second canonical event;
- is harmless to the UI because the browser suppresses duplicate/regressing canonical sequences.

This avoids adding an outbox service or a second publisher Lambda.

---

## 7. Canonical state: one DynamoDB table

**KEEP: DynamoDB**

Use one logical DynamoDB table with item types for:

```text
EVENT
HEAD/STATE
IDEMPOTENCY
ACTIVE_MATCH
```

DynamoDB remains the source of truth for:
- immutable canonical history;
- score and clock state;
- canonical sequence;
- active matches;
- corrections/cancellations;
- provider-event idempotency when the real feed provides usable identity.

Do not collapse canonical truth into Nchan's Redis store. The fan-out workload should not be allowed to become the only home of application correctness.

---

## 8. Shared Nchan store: Redis OSS 7.1, not Valkey in the baseline

**KEEP: one managed Redis-compatible delivery store**  
**REFINE: use ElastiCache for Redis OSS 7.1 instead of assuming Valkey compatibility**

Nchan explicitly documents Redis storage, Redis Cluster, TLS, persistence, horizontal scalability and HA. Its current changelog also contains Redis >=7 fixes.

ElastiCache currently supports Redis OSS 7.1, and Redis 7.2-and-earlier code is BSD-3-Clause licensed.

Why not Valkey in the baseline:
- Valkey is attractive and cheaper in ElastiCache;
- but Nchan's documentation names Redis rather than Valkey;
- removing an unnecessary compatibility assumption is more valuable than saving one product name.

A future switch to Valkey is acceptable only after an explicit compatibility test.

Production shape:

```text
ElastiCache Redis OSS 7.1
node-based
cluster mode disabled
Multi-AZ primary + replica / automatic failover
```

The exact node size is cost/capacity work, not guessed here.

Why Redis remains necessary:

Without a shared Nchan store, a reconnect to another Nchan node cannot reliably continue from the same transport history. Removing Redis would force us to restore a replay API or per-node replication mechanism. Redis therefore removes more complexity than it adds.

---

## 9. Nchan hosting: EC2 Auto Scaling + one private NLB

**KEEP: EC2 Auto Scaling Group**  
**KEEP: one Network Load Balancer**  
**REMOVE: ECS**

Nchan is already a server product. A container scheduler adds little here.

Use:
- immutable Nchan AMI/image/config;
- EC2 Auto Scaling Group across multiple AZs;
- Instance Refresh for rolling releases;
- NLB health checks and draining;
- exact fleet size derived from the POC rather than guessed.

The **same private NLB** serves two purposes:

```text
CloudFront -> NLB -> Nchan subscriber endpoint
Lambda     -> NLB -> Nchan publisher endpoint
```

Only `/live/*` is routed from CloudFront to this origin. The publisher endpoint therefore stays private.

NLB remains because a multi-node Nchan fleet needs:
- one stable origin;
- health-based routing;
- connection draining;
- rolling replacement.

Removing it makes deployments and node failure harder, not simpler.

---

## 10. Edge: CloudFront stays, WAF leaves the baseline

**KEEP: CloudFront**  
**REMOVE FROM BASELINE: AWS WAF**

CloudFront remains because:
- ~60% of viewers are in Europe and ~40% in North America;
- it is already needed for the static frontend;
- it can be the single public viewer entry point;
- it supports private NLB VPC origins;
- it streams chunked origin responses as received.

The NLB/Nchan origin stays private.

AWS Shield Standard is automatically present for AWS customers at no extra charge for common network/transport DDoS events.

WAF is not necessary to satisfy the assignment and adds rules/cost/operational surface. Add it later only if a concrete application-layer abuse requirement justifies it.

Provider ingress remains a separate Regional API Gateway endpoint with:
- route/account throttling;
- provider-specific authentication when the actual provider contract is known.

Do not invent an HMAC/API-key mechanism the assignment never supplied.

---

## 11. Static frontend: S3 + Next.js static export stays

**KEEP: S3**  
**KEEP: Next.js App Router static export**

Do not serve frontend files from the Nchan EC2 fleet.

S3 keeps:
- frontend releases independent of live-connection releases;
- immutable assets easy to cache;
- Nchan nodes focused only on live delivery.

Use stable static routes, for example:

```text
/
/match?match_id=<id>
```

rather than depending on unknown runtime match IDs during a static build.

---

## 12. POC load generation correction

**REMOVE: Artillery as the primary SSE load generator**

The official Artillery product is strong for HTTP/WebSocket load testing, but the available Artillery SSE engine is explicitly described as experimental/not production-ready.

Using it would introduce a new uncertainty into the experiment.

Also do not use `xk6-sse`, because that brings Go back into the solution.

Use a **small TypeScript/Node.js raw SSE load generator** in the POC:
- open HTTP streaming connections;
- parse SSE frames;
- track event IDs and `canonical_seq`;
- record timing;
- expose its own CPU/memory/event-loop saturation metrics;
- run multiple generator containers if needed.

This is experiment code, not production infrastructure, and directly measures the protocol we actually selected.

---

## 13. Final component inventory

### Production

```text
CloudFront
S3
API Gateway HTTP API
SQS FIFO
Lambda
DynamoDB
NLB
EC2 Auto Scaling
Nchan
ElastiCache Redis OSS 7.1
```

### Custom production code

```text
TypeScript canonical processor Lambda
Next.js frontend + native EventSource reducer
```

### Local POC only

```text
Nchan 1.3.8
Redis 7.x
TypeScript deterministic publisher
TypeScript SSE load generators
Docker Compose
```

For reproducibility, build the POC Nchan image from a pinned Nchan release on a pinned official Nginx base rather than trusting an unrelated community image.

---

## 14. Final falsification table

| Candidate removal | Result | Why |
|---|---|---|
| WAF | **REMOVE** | Not assignment-required; CloudFront private origin + Shield Standard + API throttling are enough for baseline |
| Valkey compatibility assumption | **REMOVE** | Use documented Nchan dependency: Redis OSS |
| Artillery for SSE | **REMOVE** | SSE support is experimental; would contaminate POC evidence |
| Redis shared Nchan store | **KEEP** | Otherwise cross-node resume requires replay/per-node replication |
| NLB | **KEEP** | Stable multi-node origin, health routing, drain/deploy |
| Auto Scaling | **KEEP** | Self-healing and weekly rolling replacement |
| API Gateway | **KEEP** | Minimal public HTTPS provider ingress |
| SQS FIFO | **KEEP** | Best-effort provider needs immediate durable acceptance |
| Lambda | **KEEP** | Domain normalization/score/clock/canonical sequencing must execute somewhere |
| DynamoDB | **KEEP** | Canonical correctness must remain independent from fan-out store |
| CloudFront | **KEEP** | Existing global viewer edge + private origin |
| S3 | **KEEP** | Decouples static frontend deploy from live transport |
| Nchan | **KEEP** | Removes the custom real-time server |
| Lobby channel | **KEEP** | Cheaper/simpler than replaying all eight match histories into lobby |
| Match snapshots | **REMOVE** | Nchan buffered channel gives one history-to-live stream |
| Replay API | **REMOVE from normal path** | Shared Nchan/Redis history handles join/reconnect |
| WebSockets | **REMOVE** | Read-only workload only needs SSE |

---

## 15. Assignment synchronization

The architecture still directly addresses:

```text
anonymous/read-only       -> EventSource
live lobby                -> one latest-state Nchan channel
score/minute              -> canonical processor
goals/cards/run of play   -> match SSE channel
late join                 -> oldest buffered event -> live
reload                    -> same
phone wake                -> EventSource resume
never blank               -> keep current UI during reconnect
no duplicate UI events    -> canonical_seq reducer
nothing disappears        -> immutable DynamoDB history + full Nchan active buffer
ordering                   -> canonical seq + per-match FIFO processing
goal p95 <= 2s            -> POC gives fan-out budget; production validates e2e
other p95 <= 5s           -> same path
history <= 2s             -> explicitly measured in POC
8 live matches            -> 8 match channels + lobby
10/s, burst 50/s          -> SQS/Lambda/Nchan workload
100k viewers              -> Nchan capacity POC
+40k / 2 minutes          -> POC connection-ramp scenario
60% EU / 40% NA           -> CloudFront viewer edge
<= $3k/month               -> cost model still must prove final instance/traffic numbers
weekly live deploys        -> NLB drain + ASG Instance Refresh + SSE resume
Next.js App Router         -> static export
AWS preferred              -> AWS production platform
score/clock from stream    -> canonical processor derives them from events
```

The least-trusted **overall** assumption is still the unknown provider semantics. The riskiest **locally testable** assumption is now the combined Nchan/Redis/SSE claim:

> Can this existing open-source fan-out layer provide 100k-scale mapped fan-out **and** replay a complete active match within 2 seconds, while maintaining acceptable latency and reconnect correctness?

---

## 16. Stop condition reached

One more simplification pass was performed against every remaining component.

Only three genuine removals/refinements survived:

```text
WAF baseline removed
Valkey compatibility assumption removed -> Redis OSS 7.1
Artillery SSE dependency removed -> direct TypeScript test generator
```

Every other candidate removal either:
- weakens a stated assignment constraint;
- restores more custom code than it removes;
- creates a larger failure domain;
- or makes live deployment/recovery harder.

**Further simplification is no longer recommended before evidence from the POC.**

The next change should come from measurement, not architecture tidying.

---

## 17. Primary research sources

- Assignment: `requirement.pdf`
- Nchan docs/changelog: https://nchan.io/ and https://nchan.io/changelog
- CloudFront custom-origin streaming behavior:
  https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/RequestAndResponseBehaviorCustomOrigin.html
- CloudFront VPC origins:
  https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-vpc-origins.html
- API Gateway AWS-service integrations:
  https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-aws-services.html
- SQS FIFO quotas:
  https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/quotas-messages.html
- ElastiCache engine versions:
  https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/engine-versions.html
- Redis licensing:
  https://github.com/redis/redis
- AWS Shield:
  https://aws.amazon.com/shield/pricing/
