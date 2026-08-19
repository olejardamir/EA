# Live Match Centre — Industry / Third-Party Solution Review

**Research date:** 2026-08-19  
**Purpose:** Bounded pre-POC review of existing real-time sports architectures, managed fan-out platforms, recovery patterns, reusable open-source components, and implementation ideas that could materially change the Live Match Centre design or POC.

## Executive conclusion

The research **does not overturn the current production architecture**.

The strongest conclusions are:

1. **The current history/snapshot + live-tail model matches real sports-feed practice.** Sportradar explicitly documents Push as stateless and recommends using the corresponding REST timeline/history endpoint to recover missed data after disconnect. That directly validates our separation between durable history and live delivery. We still cannot assume the assignment's unknown provider offers such a recovery endpoint.

2. **Managed WebSocket/pub-sub platforms solve connection scaling well, but most are economically misaligned with this assignment's $3,000/month ceiling when every delivered fan message is metered.** AWS AppSync Events, API Gateway WebSockets, and Ably all meter outbound deliveries. Under the architecture contract's existing illustrative sensitivity point of 100,000 viewers × 1.25 full events/s × 120 peak hours/month, the workload is 54 billion outbound deliveries/month before control traffic.

3. **Cloudflare Durable Objects is the strongest external alternative found.** It supports thousands of WebSocket clients per object, permits up to 32,768 hibernatable WebSockets per Durable Object, does not charge for outgoing WebSocket messages, and Workers has no egress/bandwidth charge. It could plausibly beat self-managed EC2 on cost and operations. However, it introduces a second cloud/vendor, requires sharding for a hot 100k-viewer match, and its production fan-out capacity cannot be honestly validated by the required local-only POC. Because AWS is preferred by the assignment and the existing AWS gateway risk is directly locally measurable, Cloudflare remains a **serious rejected alternative**, not the new selected design.

4. **The AWS sports reference architecture is useful for patterns and fixtures, not as code to copy wholesale.** AWS's reference solution uses Kinesis, Lambda, DynamoDB, AppSync and a simulated-game stack. Its GitHub repository is Apache-2.0 licensed, but its implementation is from the older AppSync GraphQL-subscription generation and is cloud-coupled. We should reuse the simulator/event-fixture idea, not import the whole solution.

5. **For the POC, reuse a mature WebSocket library rather than implementing RFC 6455 ourselves.** Gorilla WebSocket is BSD-2-Clause, stable, widely used, supports prepared messages specifically for sending the same payload efficiently to many connections, and supports write-buffer pooling. This directly matches our fan-out experiment.

---

# 1. Governing workload used for comparison

Assignment facts:

```text
8 concurrent live matches
~10 events/s total steady
~50 events/s total burst
100,000 concurrent viewers
+40,000 viewers in 120 seconds
~60% Europe / ~40% North America
goal p95 <= 2s ingest -> screen
other-event p95 <= 5s
full history <= 2s
budget <= $3,000/month at peak
AWS preferred, or justify alternative
```

For cost sensitivity only, this review reuses the internal architecture contract's existing illustrative point:

```text
100,000 viewers
1.25 full match events/s per viewer
120 peak viewer-hours/month
```

That gives:

```text
100,000 × 1.25 × 3,600 × 120
= 54,000,000,000 outbound fan deliveries/month
```

This is **not an assignment fact and not the final monthly workload**. It is useful only to show whether a per-delivery pricing model is even in the right order of magnitude.

---

# 2. Managed / third-party fan-out alternatives

## 2.1 AWS AppSync Events

### What it solves

AWS AppSync Events is a managed WebSocket Pub/Sub service. AWS states that it automatically manages WebSocket connections and scaling and supports broadcasting to large subscriber populations.

Current public pricing:

```text
$1.00 / million Event API operations
$0.08 / million connection minutes
```

Inbound messages, outbound broadcasts, handler invocations, connection/subscription/ping operations are metered operations. Messages are metered in 5 KB units.

### Sensitivity against our workload

At 54B outbound deliveries:

```text
54,000M × $1/M
≈ $54,000/month
```

Connection minutes for 100k viewers × 120 hours:

```text
720M connection-minutes × $0.08/M
≈ $57.60
```

The outbound-delivery charge dominates.

At the same average event rate, $3,000 of outbound-operation budget is consumed in only:

```text
~6.67 peak hours/month
```

before the rest of the architecture is paid for.

### Verdict

**Reject as selected fan-out layer for this assignment.**

Technically attractive and highly scalable, but the public per-delivery price is incompatible with the budget under our current sensitivity range.

### What to reuse

- channel-based sports update model;
- managed WebSocket semantics as an alternative considered in `proposal.md`;
- AWS sports reference simulator/event-fixture concepts.

---

## 2.2 Amazon API Gateway WebSocket APIs

### What it solves

Fully managed WebSocket connection endpoint with bidirectional routing and backend callbacks.

AWS currently documents:

```text
500 new connections/s/account/region default, increasable
no fixed concurrent-connection quota
$1.00 / million messages in the published US East example
$0.25 / million connection-minutes in that example
```

The assignment surge is:

```text
40,000 / 120s ≈ 333 new connections/s
```

so the default new-connection quota is not the main problem.

### Sensitivity

At 54B outbound messages:

```text
≈ $54,000 message charges
```

plus connection minutes and transfer.

### Verdict

**Reject for budget.**

It can plausibly satisfy the connection-arrival requirement, but per-recipient message metering dominates cost.

---

## 2.3 Ably

### What it solves

Managed global pub/sub with ordering, recovery/history features, connection recovery, and strong operational tooling.

Current published plans:

```text
Standard: 10k concurrent connections
Pro:      50k concurrent connections
Enterprise: unlimited/custom
```

Published per-minute model starts at:

```text
$2.50 / million messages
$1.00 / million connection-minutes
```

with advertised volume rates as low as:

```text
$0.50 / million messages
$0.20 / million connection-minutes
```

The Pro plan allows 500 new connections/s, which covers the ~333/s assignment surge, but 100k concurrent viewers requires Enterprise. Ably also documents a 50 outbound messages/s per connection limit; a single hot match receiving the assignment's full 50 events/s burst would sit directly on that boundary unless events are batched/conflated.

### Sensitivity

54B deliveries:

```text
published standard message rate: ~$135,000
advertised low volume rate:       ~$27,000
```

before package/custom enterprise pricing and the rest of the system.

### Verdict

**Reject for budget at this workload.**

### Reusable ideas

- connection-state recovery;
- history + rewind;
- message deltas/conflation as bandwidth/fan-out reduction techniques;
- explicit delivery/order semantics.

---

## 2.4 Pusher Channels

### What it solves

Simple managed WebSocket channels and global real-time delivery.

Current self-service ceiling is:

```text
30,000 concurrent connections
90 million messages/day
```

above which Enterprise/custom is required.

Pusher counts one publication plus every subscriber delivery as messages.

### Verdict

**Reject as a practical self-service fit.**

100k concurrency already requires Enterprise and the full-event fan-out volume is far above self-service message allowances. No public enterprise price proves compatibility with the $3k system-wide budget.

### Reusable ideas

Mostly product-level pub/sub/channel patterns; no architecture-changing advantage found.

---

## 2.5 PubNub

### What it solves

Managed global real-time messaging, message persistence/history, catch-up and high connection scale.

Current pricing is primarily MAU-based. PubNub's public page says 100,000 MAU is custom pricing that typically starts around **$3,000/month**. That already consumes the entire assignment infrastructure ceiling before AWS origin/storage/processing is included.

For an anonymous public sports site, monthly unique viewers can also be materially higher than peak concurrent viewers, making MAU pricing uncertain.

Important correctness detail: PubNub explicitly says it does **not** guarantee publication order and recommends placing a sequence number in messages when the application requires deterministic ordering. Its recovery/catch-up documentation also distinguishes short reconnect catch-up from persistent history.

### Verdict

**Reject for budget uncertainty and fit.**

### Reusable ideas

- sequence numbers remain application-level truth;
- short reconnect recovery should be backed by durable history for long gaps.

Those ideas are already present in our architecture.

---

# 3. Strongest alternative: Cloudflare Durable Objects

## Why it is materially different

Cloudflare Durable Objects changes the economics of fan-out:

- a Durable Object can act as a WebSocket server for thousands of clients;
- the Hibernation API keeps WebSockets connected while the object sleeps;
- current API documentation permits up to **32,768 WebSocket connections per Durable Object**, with practical capacity depending on workload;
- outgoing WebSocket messages are not billed as requests;
- Workers Paid has no additional data-transfer/egress or bandwidth charge;
- Durable Objects/Workers are globally distributed and support location hints/jurisdictions.

This removes the exact per-recipient delivery charge that makes AppSync/API Gateway/Ably unattractive.

## Plausible architecture

A Cloudflare variant would look like:

```text
AWS canonical state/event pipeline
        |
        v
event publish to Cloudflare
        |
        v
match-region-shard Durable Objects
        |
        v
WebSocket fans
```

A 100k-viewer hot match would need multiple Durable Objects because practical object capacity is "thousands" even though the documented hard WebSocket count is 32,768.

## Why it still does not replace our selected design

### 1. AWS preference

The assignment explicitly prefers AWS. A hybrid AWS + Cloudflare system requires stronger justification and creates two operational/vendor failure domains.

### 2. Sharded fan-out becomes a new architecture-critical mechanism

For a hot match we must solve:

```text
connection -> shard placement
event -> every active shard
regional shard placement
reconnect -> correct shard
capacity rebalance
```

That is solvable, but it adds a second coordination problem.

### 3. The key capacity claim is not locally provable

The assignment requires a local-only POC with no cloud account. Local Durable Object emulation cannot prove Cloudflare's actual production socket/fan-out envelope.

By contrast, our selected EC2-style WebSocket gateway is ordinary process/socket behavior and can be meaningfully stress-tested locally.

### 4. Current architecture remains simpler to defend

The existing design keeps:

```text
AWS authority
AWS networking
AWS storage
AWS gateway compute
one operational platform
one directly testable fan-out hypothesis
```

## Verdict

**Serious non-dominated alternative, but current AWS EC2 gateway remains selected.**

Cloudflare is worth mentioning as a cost-efficient external alternative if proposal word budget permits, but it should not displace the main AppSync/API Gateway comparison unless doing so helps explain the decision.

---

# 4. How real sports systems solve the data/recovery problem

## 4.1 AWS Real-Time Live Sports Updates reference architecture

AWS's official reference solution uses:

```text
sports feed
-> Kinesis
-> Lambda transform/enrich
-> DynamoDB
-> AppSync subscriptions
-> web/mobile fans
```

It also includes a simulation stack for generated games.

The public GitHub repository:

```text
aws-solutions-library-samples/
real-time-live-sports-updates-using-aws-appsync
```

is Apache-2.0 licensed.

### What this validates

- feed normalization should be separated from fan delivery;
- sports events should be persisted/stateful before or alongside live distribution;
- a simulator is an appropriate way to test sports real-time flows;
- fan subscriptions/channels naturally map to game/match identity.

### What not to copy

The code was built for the older AppSync GraphQL-subscription solution and was last materially pushed years ago. Its simulator writes into Kinesis/Lambda infrastructure, so importing it into our local-only POC would add cloud coupling and irrelevant machinery.

**Reuse the concept and, if useful, event fixture shapes—not the complete deployment.**

---

## 4.2 Sportradar Push + REST recovery

Sportradar's soccer documentation is particularly relevant.

Their Push feed is explicitly **stateless**. They state that Push complements rather than replaces the REST API. If the Push connection drops, the integration should call the corresponding REST timeline/summary endpoint to recover what was missed.

This is essentially:

```text
durable/replayable history = backbone
push connection             = low-latency tail
```

That is the same conceptual shape as our:

```text
canonical event log + snapshot
        +
WebSocket live tail
```

### Architecture consequence

**No change required.**

It strengthens our reasoning that the live transport should not be the only source of history/recovery.

### Important boundary

We cannot assume our assignment's unknown provider gives us Sportradar-like REST recovery. If it does, production should use it. If it does not, our guarantee still begins only after durable application ingest.

---

## 4.3 Recent AWS sports implementations

Recent AWS sports case studies continue to use the same broad separation:

```text
live feed
-> container/serverless ingest
-> durable queue/store
-> independent downstream processing
```

Examples include F1 Track Pulse using a WebSocket feed into ECS and publishing processed data to DynamoDB and SQS.

### Architecture consequence

This reinforces, rather than changes, our current choice of:
- a short provider ingest path;
- decoupling with SQS;
- DynamoDB canonical state;
- independent downstream projection/delivery.

---

# 5. Code / components worth reusing

## 5.1 Node.js + TypeScript + `ws` — RECOMMENDED FOR POC

Repository:

```text
github.com/websockets/ws
```

License:

```text
MIT
```

Why it fits:

- stays in the same JavaScript/TypeScript ecosystem as Next.js;
- simple, widely used WebSocket server/client implementation;
- passes the Autobahn test suite;
- supports direct server broadcast patterns;
- supports ping/pong heartbeat handling;
- optional `bufferutil` native addon improves frame masking/unmasking performance;
- easy to instrument for connection counts, latency, backpressure, memory and event-loop delay.

Important caveat:

`ws` is intentionally a straightforward Node.js implementation, not the highest-performance possible WebSocket stack. That is useful for this assignment because the POC is supposed to test whether the selected approach has enough capacity. We should not start by hiding the risk behind an exotic high-performance runtime.

If `ws` materially fails the frozen capacity criterion, the next architecture branch would be:

```text
Node.js + uWebSockets.js
```

rather than changing language immediately. `uWebSockets.js` is a high-performance native V8 addon for Node.js, but it adds native/runtime complexity and should only be introduced if measurement justifies it.

### Recommendation

Use:

```text
Node.js
TypeScript
ws
custom TypeScript load generator
Docker Compose
```

For the fan-out path:
- serialize each event once;
- broadcast the same buffer/string to subscribed sockets;
- use bounded per-client state/queues;
- detect `bufferedAmount` / backpressure;
- terminate slow clients rather than allowing unbounded memory growth;
- record event-loop delay, CPU, memory, socket counts and fan-out latency.

## 5.2 Grafana k6 — USEFUL SECONDARY TOOL, NOT SOLE CAPACITY ORACLE

k6 supports WebSocket load tests. The current `k6/websockets` module uses a global event loop and allows multiple concurrent WebSockets per VU, improving efficiency.

Usefulness:

- smoke/reconnect tests;
- repeatable connection ramp;
- independent confirmation of basic behavior.

Concern:

A 100k-connection capacity experiment can easily become a **load-generator capacity test**. The assignment requires us to distinguish generator saturation from gateway saturation.

### Recommendation

Do not make k6 the only source of final capacity evidence unless we first demonstrate the generator has adequate headroom.

A lightweight TypeScript/Node.js load generator in a separate container gives us tighter control over:
- connection count;
- file descriptors;
- ephemeral ports;
- per-connection receive bookkeeping;
- generator CPU/memory;
- timestamp collection.

---

## 5.3 AWS sports simulator code — CONCEPTUAL REUSE ONLY

The Apache-2.0 simulator code can legally be reused with license compliance, but it is coupled to Kinesis and AWS Lambda.

### Recommendation

Do **not** import the full code.

Reuse:
- deterministic prerecorded event fixtures;
- concept of replaying a recorded game;
- explicit simulated match IDs/event IDs.

Write a much smaller local generator that can emit:

```text
8 matches
10 events/s steady total
50 events/s burst total
hot-match concentration
goal/card/routine event types
monotonic seq
fixed-size payload variants
```

---

# 6. What changes in our work plan

## Architecture decision

**UNCHANGED.**

Selected delivery remains:

```text
CloudFront
-> ALB
-> small EC2 WebSocket gateway fleet
```

with DynamoDB as canonical replay source.

The research strengthens the alternatives section rather than changing the winner.

## POC target

**UNCHANGED.**

The selected locally testable risk remains:

```text
ASM-GW-CAPACITY
```

because managed alternatives either:
- fail the public cost sensitivity;
- require enterprise/custom pricing;
- or, in Cloudflare's case, move the critical capacity claim into a cloud-managed service that cannot be validated by the required local-only POC.

## POC implementation direction

Refined to:

```text
Node.js
+ TypeScript
+ ws
+ bounded client queues / backpressure checks
+ explicit slow-client disconnect
+ custom TypeScript load generator
+ optional k6 smoke/secondary check
+ Docker Compose one-command execution
```

The final experiment contract must still freeze the exact implementation/workload/criteria before measurement.

---

# 7. Proposal implications

The final 1,500-word proposal should **not** contain a vendor survey.

The useful distilled reasoning is:

1. Managed WebSocket services were considered.
2. AppSync Events/API Gateway remove connection-management work but meter each fan delivery; at 100k viewers that cost model is the wrong shape for a $3k ceiling.
3. A self-managed gateway makes cost depend mainly on a small compute fleet + network bytes, so gateway capacity becomes the architecture-critical local POC.
4. Durable history plus a live tail mirrors real sports-feed recovery patterns.
5. The provider's real identity/order/recovery capabilities remain the least-trusted external assumption.

If one non-AWS alternative is mentioned, Cloudflare Durable Objects is the strongest one because its pricing avoids outbound WebSocket/egress charges. It still loses in the composed decision because of cross-cloud complexity, AWS preference, sharding, and inability to validate the real managed fan-out envelope locally.

---

# 8. Decision table

| Candidate | 100k connection fit | Fan-delivery pricing fit | History/recovery | Local capacity test | Assignment fit | Decision |
|---|---|---|---|---|---|---|
| AWS EC2 custom gateway | Yes, POC-derived | Good shape: compute + bytes | canonical DDB replay | **Yes** | AWS preferred | **SELECTED** |
| AWS AppSync Events | Managed scale | Poor at high delivery volume | external history still needed | No meaningful service-capacity test | AWS | Reject on cost |
| API Gateway WebSocket | Managed, quota supports surge | Poor at high delivery volume | external history still needed | No meaningful service-capacity test | AWS | Reject on cost |
| Ably | Enterprise required | Poor under sensitivity | strong managed features | No | non-AWS | Reject on cost |
| Pusher | Enterprise required | Custom/very high volume | service features | No | non-AWS | Reject |
| PubNub | Scale capable | ~100k MAU already custom/~$3k starting point | persistence/catch-up | No | non-AWS | Reject on budget uncertainty |
| Cloudflare Durable Objects | Strong with sharding | **Excellent pricing shape** | would still use AWS canonical replay | Production service capacity not locally provable | non-AWS/hybrid | Strong alternative; reject after composition |

---

# 9. Sources

Primary/vendor sources used in this review:

- AWS AppSync Events documentation: https://docs.aws.amazon.com/appsync/latest/eventapi/event-api-welcome.html
- AWS AppSync pricing: https://aws.amazon.com/appsync/pricing/
- AWS AppSync quotas: https://docs.aws.amazon.com/general/latest/gr/appsync.html
- AWS API Gateway pricing: https://aws.amazon.com/api-gateway/pricing/
- AWS API Gateway WebSocket quotas: https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-execution-service-websocket-limits-table.html
- AWS real-time live sports reference: https://aws.amazon.com/blogs/mobile/appsync-real-time-live-sports/
- AWS live-sports reference repository: https://github.com/aws-solutions-library-samples/real-time-live-sports-updates-using-aws-appsync
- AWS F1 Track Pulse architecture: https://aws.amazon.com/blogs/media/real-time-storytelling-the-aws-architecture-behind-formula-1-track-pulse/
- Sportradar Soccer Push documentation: https://developer.sportradar.com/soccer/docs/soccer-ig-push
- Ably pricing: https://ably.com/pricing
- Ably limits: https://ably.com/docs/platform/pricing/limits
- Pusher Channels pricing: https://pusher.com/channels/pricing/
- PubNub pricing: https://www.pubnub.com/pricing/
- PubNub ordering guidance: https://support.pubnub.com/hc/en-us/articles/360051494392-Does-PubNub-guarantee-the-order-of-messages
- PubNub catch-up guidance: https://support.pubnub.com/hc/en-us/articles/360051972051-Can-I-use-catchup-to-retrieve-older-messages
- Cloudflare Durable Objects WebSockets: https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- Cloudflare Durable Objects state/WebSocket limit: https://developers.cloudflare.com/durable-objects/api/state/
- Cloudflare Durable Objects pricing: https://developers.cloudflare.com/durable-objects/platform/pricing/
- Cloudflare Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Cloudflare Durable Object data location: https://developers.cloudflare.com/durable-objects/reference/data-location/
- ws: https://github.com/websockets/ws
- uWebSockets.js: https://github.com/uNetworking/uWebSockets.js
- Grafana k6 WebSockets: https://grafana.com/docs/k6/latest/using-k6/protocols/websockets/

---

# Final status

```text
Industry / third-party research: COMPLETE
Architecture winner changed: NO
POC target changed: NO
POC implementation direction refined: YES — Node.js/TypeScript, no Go
Next milestone: Freeze the POC experiment contract
```
