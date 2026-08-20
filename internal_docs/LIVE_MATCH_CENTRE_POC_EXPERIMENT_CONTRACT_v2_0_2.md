# POC Experiment Contract — Nchan + Redis OSS + SSE

**Contract ID:** POC-EXP-LMC-001
**Contract Version:** v2.0.2
**Date:** 2026-08-20
**Status:** FROZEN (corrected from v2.0.1; resolves §B/§AA/§C contradictions verified against Nchan 1.3.8 docs)
**Supersedes:** `LIVE_MATCH_CENTRE_POC_EXPERIMENT_CONTRACT_v2_0_1.md`, `LIVE_MATCH_CENTRE_POC_EXPERIMENT_CONTRACT_v2_0_0.md`, and the earlier raw-WebSocket experiment contract (never implemented)
**Governing architecture:** `LIVE_MATCH_CENTRE_MINIMUM_DEFENSIBLE_ARCHITECTURE.md`
**Governing milestones:** `LIVE_MATCH_CENTRE_ASSIGNMENT_MILESTONES (3).md` — Milestone 1
**Governing AI contract:** `AGENTS.md`

---

# 1. Exact Hypothesis

> **Can Nchan 1.3.8, backed by Redis OSS 7.2 (aligned with ElastiCache Redis OSS 7.1), deliver SSE fan-out to a large concurrent viewer population, replay a complete retained active-match event history to late-joining viewers within 2 seconds, and sustain reconnect/resume with correct canonical sequence ordering, under an assignment-mapped workload of 8 simulated matches at ~10 events/s steady and ~50 events/s burst, without the Nchan+Redis subsystem being the failure point?**

---

# 2. Exact Things the POC Proves (If ACCEPT)

1. Nchan + Redis OSS can hold and deliver a complete retained active-match event buffer to a late-joining SSE consumer within 2 seconds while the system is under steady + burst fan-out load.
2. Nchan + Redis can fan out SSE events to a large number of concurrent EventSource connections without the fan-out layer itself becoming the bottleneck (at the scale the local machine can support).
3. `Last-Event-ID` resume works correctly across Nchan restart when Redis is the shared backing store (Redis 7.2, aligned with ElastiCache Redis OSS 7.1): a reconnecting client receives no missing canonical sequences, no duplicates, and no out-of-order delivery.
4. The simulated 8-match workload with lobby + per-match channels behaves correctly under steady and burst conditions.
5. Slow/backpressured consumers are handled without unbounded memory growth on the Nchan side.

---

# 3. Exact Things the POC Does NOT Prove

1. End-to-end ingest-to-browser-render latency in a real Next.js application with CloudFront. The POC measures fan-out delivery latency from publisher to SSE client frame receipt, not browser render.
2. Production AWS performance. Local Docker networking is not equivalent to EC2/NLB/CloudFront.
3. DynamoDB, SQS, Lambda, CloudFront, S3, NLB, or any AWS managed service behavior.
4. Provider schema/semantic correctness (`ASM-PROVIDER-SEMANTICS` remains the least-trusted overall assumption).
5. The $3,000/month cost ceiling.
6. Geographic latency distribution (60% EU / 40% NA).
7. 100,000 actual concurrent connections if the local machine cannot support them — see Section 16.
8. Browser rendering, React state management, or Next.js App Router behavior.
9. Real provider feed integration.
10. Weekly rolling deploy/drain behavior in production.

---

# 4. Exact Nchan Version

**Nchan 1.3.8**

The POC MUST build Nchan from source inside a Dockerfile using a pinned official Nginx base image. Do not use an opaque community Nchan image.

Dockerfile approach (multi-stage build on ubuntu:24.04, compiles Nginx 1.27.4 + Nchan 1.3.8 from source):

```dockerfile
FROM ubuntu:24.04 AS builder

ARG NGINX_VERSION=1.27.4
ARG NCHAN_VERSION=1.3.8

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpcre3-dev libssl-dev zlib1g-dev \
    libcurl4-openssl-dev libyajl-dev \
    curl ca-certificates wget && \
    rm -rf /var/lib/apt/lists/*

# Download Nginx source
RUN cd /tmp && \
    wget -q https://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz && \
    tar xzf nginx-${NGINX_VERSION}.tar.gz

# Download Nchan source
RUN cd /tmp && \
    curl -fsSL https://github.com/slact/nchan/archive/refs/tags/v${NCHAN_VERSION}.tar.gz \
    | tar xz

# Build Nginx with Nchan module
RUN cd /tmp/nginx-${NGINX_VERSION} && \
    ./configure \
        --prefix=/etc/nginx \
        --sbin-path=/usr/sbin/nginx \
        --modules-path=/usr/lib64/nginx/modules \
        --conf-path=/etc/nginx/nginx.conf \
        --error-log-path=/var/log/nginx/error.log \
        --http-log-path=/var/log/nginx/access.log \
        --pid-path=/var/run/nginx.pid \
        --lock-path=/var/run/nginx.lock \
        --with-http_ssl_module \
        --with-http_v2_module \
        --with-http_realip_module \
        --with-http_stub_status_module \
        --add-module=/tmp/nchan-${NCHAN_VERSION} && \
    make -j$(nproc) && \
    make install && \
    rm -rf /tmp/nginx-${NGINX_VERSION} /tmp/nchan-${NCHAN_VERSION}

# Runtime stage
FROM ubuntu:24.04

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpcre3 libssl3 zlib1g libcurl4 libyajl2 \
    curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/sbin/nginx /usr/sbin/nginx
COPY --from=builder /etc/nginx/ /etc/nginx/

COPY nchan.conf /etc/nginx/nginx.conf
COPY nchan-2.conf /etc/nginx/nchan-2.conf
```

Pin both `NCHAN_VERSION` and the Nginx base tag.

---

# 5. Exact Redis Version

**Redis 7.2 (official Docker image: `redis:7.2-bookworm`)**

This aligns with ElastiCache Redis OSS 7.1 support (Redis 7.2 code is the same OSS-licensed branch). Pin the exact tag.

---

# 6. Exact Docker/Container Topology

```text
docker compose
├── nchan
│   image: built from Dockerfile (nginx:1.27.4 + nchan 1.3.8)
│   ports: 8080 (publisher) + 8081 (subscriber)
│   depends_on: redis
│   deploy.resources.limits: cpus=4, memory=4G
│
├── redis
│   image: redis:7.2-bookworm
│   ports: 6379
│   deploy.resources.limits: cpus=2, memory=2G
│
└── runner
    TypeScript orchestrator: publisher + loadgen workers + aggregator
    deploy.resources.limits: cpus=8, memory=8G
```

Total container resource envelope: **14 CPUs, 14 GB RAM**. The host must have at least this much available.

The `runner` container spawns load-generator workers as child processes, each opening a portion of SSE connections. This avoids multi-container inter-communication overhead and simplifies metric collection.

---

# 7. Exact Nchan Configuration

The Nchan configuration file (`nchan.conf`) loaded into the Nginx config must freeze these parameters:

### Changelog for this section (v2.0.1 → v2.0.2)

| # | v2.0.1 (OLD) | v2.0.2 (NEW) | Why |
|---|---|---|---|
| 1 | `nchan_eventsource_event "update";` on match subscribers | REMOVED from match subscribers (retained on `/history/` endpoint only) | Nchan 1.3.8 `nchan_eventsource_event` overrides per-message `X-Event-Source-Event` headers, forcing every SSE frame to `event: update`. Removing it allows per-message event types (`goal`, `yellow_card`, etc.) to survive on the wire, matching §8. Source: Nchan 1.3.8 docs + risk register §AA |
| 2 | `nchan_subscriber_first_message newest;` (lobby) | `nchan_subscriber_first_message oldest;` (lobby) | Nchan 1.3.8: `newest` means "wait for the next published message"; `oldest` means "send the oldest buffered message immediately". With `buffer_length=1`, `oldest` delivers the single buffered (latest) state on connect. `newest` would NOT send the current state, violating the lobby requirement. Source: Nchan 1.3.8 subscriber docs §B |

### Changelog for this section (v2.0.0 → v2.0.1)

| # | v2.0.0 (OLD) | v2.0.1 (NEW) | Why |
|---|---|---|---|
| 1 | `nchan_eventsource;` (standalone directive) | REMOVED — EventSource is an argument to `nchan_subscriber eventsource;` | `nchan_eventsource` does not exist in Nchan 1.3.8 |
| 2 | `nchan心跳 interval 15s;` | `nchan_eventsource_ping_interval 15;` | Invalid syntax. Correct directive takes a number (seconds), not a time string |
| 3 | `nchan_subscriber_message_buffer_length 0;` | REMOVED — no such directive exists | Does not exist in Nchan 1.3.8 |
| 4 | `nchan_subscriber_connection_pool_size 256;` | REMOVED — no such directive exists | Does not exist in Nchan 1.3.8 |
| 5 | `nchan_subscriber_message_buffer_length 1;` (lobby) | `nchan_message_buffer_length 1;` | Correct name is `nchan_message_buffer_length` |
| 6 | `nchan_redis_storage_url "redis://redis:6379";` | REMOVED — no such directive | Replace with `nchan_redis_pass` + upstream block |
| 7 | `nchan_use_redis on;` | REMOVED — use `nchan_redis_pass` instead | Discouraged in Nchan docs |
| 8 | `nchan_redis_connect_timeout 5000;` | `nchan_redis_connect_timeout 5s;` | Takes Nginx time value, not ms |
| 9 | `nchan_redis_read_timeout 10000;` | `nchan_redis_command_timeout 5s;` | Correct directive is `nchan_redis_command_timeout` |
| 10 | `nchan_message_buffer_length 0;` (match) | `nchan_message_buffer_length 5000;` | 0 disables buffering entirely, contradicting late-join history (§15) |
| 11 | `nchan_message_timeout 0;` | `nchan_message_timeout 2h;` | 0 means no expiry; use 2h to survive test runs without unbounded growth |

### Redis upstream block

```nginx
upstream redis_backend {
    nchan_redis_server redis:6379;
    nchan_redis_connect_timeout 5s;
    nchan_redis_command_timeout 5s;
}
```

### Shared memory

```nginx
nchan_shared_memory_size 64m;
```

### Publisher endpoint (port 8080)

```nginx
server {
    listen 8080;

    location = /pub/healthcheck {
        return 200 'ok';
    }

    # §6.33: Lobby publisher — buffer_length=1 (latest state only).
    # Exact location (=) takes priority over regex (~) in Nginx.
    location = /pub/lobby {
        nchan_publisher;
        nchan_channel_id "lobby";
        nchan_message_timeout 2h;
        nchan_message_buffer_length 1;
        nchan_redis_pass redis_backend;
    }

    # Match publishers — buffer_length=5000 (§15).
    location ~ ^/pub/(.+)$ {
        nchan_publisher;
        nchan_channel_id $1;
        nchan_message_timeout 2h;
        nchan_message_buffer_length 5000;
        nchan_redis_pass redis_backend;
    }
}
```

### Subscriber endpoint (port 8081)

```nginx
server {
    listen 8081;

    # Per-match SSE subscriber
    location ~ ^/sub/(.+)$ {
        nchan_subscriber eventsource;
        nchan_channel_id $1;
        nchan_subscriber_first_message newest;
        nchan_eventsource_ping_interval 15;
        nchan_eventsource_ping_comment "keepalive";
        nchan_eventsource_ping_data "";
        # §AA: nchan_eventsource_event REMOVED — per-message X-Event-Source-Event
        # header forwarded to subscribers as-is for per-message event types.
        # Source: Nchan 1.3.8 docs — nchan_eventsource_event overrides
        # the per-message header, defeating per-message event type scheme.
        nchan_redis_pass redis_backend;
    }

    # Lobby SSE subscriber
    location /sub/lobby {
        nchan_subscriber eventsource;
        nchan_channel_id "lobby";
        # §B: oldest sends the oldest buffered message immediately on connect.
        # With buffer_length=1, this is the latest lobby state.
        # newest would WAIT for the next message, violating lobby semantics.
        nchan_subscriber_first_message oldest;
        nchan_message_buffer_length 1;
        nchan_eventsource_ping_interval 15;
        nchan_eventsource_ping_comment "keepalive";
        nchan_eventsource_ping_data "";
        nchan_eventsource_event "lobby";
        nchan_redis_pass redis_backend;
    }
}
```

### Key configuration rationale

| Parameter | Value | Rationale |
|---|---|---|
| `nchan_message_buffer_length` (match) | 5000 | Finite cap for late-join history. 0 disables buffering entirely (contradicts §15). |
| `nchan_message_timeout` (match) | 2h | POC retention: long enough that no required test history expires during a valid run. Production requirement: retain complete active-match history for as long as the match is active (timeout = 0 while active). The 2h value is a POC convenience, not a production design claim (§BN). |
| `nchan_message_buffer_length` (lobby) | 1 | Lobby retains only the latest state (§14). |
| `nchan_eventsource_ping_interval` | 15 | Keepalive pings every 15s (below CloudFront 30s idle timeout). |
| `nchan_subscriber eventsource` | argument to `nchan_subscriber` | Correct syntax: `eventsource` is a subscriber type, not a standalone directive. |
| `nchan_redis_pass` + `upstream` | recommended approach | `nchan_use_redis` is discouraged; use `nchan_redis_pass` with upstream block. |

### Channel naming convention

```text
match-001 … match-008  — per-match event channel (bare Nchan channel_id)
lobby                   — lobby latest-state channel
```

Publisher HTTP POSTs to:
```text
POST http://nchan:8080/pub/match-001   … POST http://nchan:8080/pub/match-008
POST http://nchan:8080/pub/lobby
```

Subscriber SSE connects to:
```text
GET http://nchan:8081/sub/match-001   … GET http://nchan:8081/sub/match-008
GET http://nchan:8081/sub/lobby
```

> Re-frozen to match implementation: code publishes to bare `match-001` channel_ids
> through Nchan's regex capture (`~ ^/pub/(.+)$`). The `match:<match_id>` convention
> from v2.0.0 was never implemented; this revision corrects the contract.

---

# 8. Exact Simulated Event Schema

Each published SSE message carries an `id:` field (for `Last-Event-ID` resume) and a JSON data payload.

### SSE framing

```text
id: <nchan_message_id>       ← Nchan auto-generated transport ID (for Last-Event-ID resume only)
event: <event_type>          ← per-message X-Event-Source-Event header value
data: <JSON payload>         ← contains canonical_seq as application truth
\n
```

> **§A clarification:** The `id:` field is Nchan's internal message sequence number,
> used exclusively for `Last-Event-ID` resume. Application-level ordering/dedup
> uses `canonical_seq` from the JSON payload. These are different concepts.
> Nchan auto-generates the `id:` field; the publisher does not set it explicitly.

### JSON data payload

```json
{
  "match_id": "match-001",
  "canonical_seq": 1234,
  "event_type": "goal",
  "publish_timestamp": "2026-08-19T12:00:00.123Z",
  "score": { "home": 2, "away": 1 },
  "clock": { "period": "2H", "elapsed_seconds": 6723 },
  "description": "Home team scores",
  "padding": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
}
```

Fields:

| Field | Type | Required | Purpose |
|---|---|---|---|
| `match_id` | string | yes | channel routing + verification |
| `canonical_seq` | integer | yes | application sequence; monotonic per match; used for ordering/dedup verification |
| `event_type` | string | yes | `goal`, `yellow_card`, `red_card`, `substitution`, `corner`, `free_kick`, `offside`, `var_review` |
| `publish_timestamp` | ISO 8601 | yes | T0 proxy for fan-out latency measurement |
| `score` | object | yes | `{ "home": N, "away": N }` |
| `clock` | object | yes | `{ "period": "1H"/"2H"/etc, "elapsed_seconds": N }` |
| `description` | string | yes | human-readable; contributes to realistic payload size |
| `padding` | string | yes | variable-length filler to reach target payload size |

The `padding` field is resized to hit the target payload sizes below. The publisher deterministically generates padding of the correct length.

---

# 9. Exact Payload Sizes

| Payload variant | Target size (JSON bytes) | Use |
|---|---|---|
| Routine event (corner, free_kick, substitution) | ~250 bytes | bulk of steady-state traffic |
| Goal event | ~350 bytes | important but less frequent |
| Lobby state update | ~1,200 bytes | 8 matches × ~150 bytes each |

The 250-byte routine payload is realistic: a compact sports event with match_id, seq, type, timestamp, score, clock, description, and minimal padding.

The 350-byte goal payload includes a longer description field.

The 1,200-byte lobby payload contains the full current state of all 8 matches.

---

# 10. Eight-Match Workload Model

The publisher maintains 8 simulated matches:

```text
match-001 through match-008
```

Each match receives events at a rate derived from the total target:

### Steady-state distribution

```text
Total: ~10 events/s across 8 matches
Per-match average: ~1.25 events/s
```

Distribution is **not** perfectly uniform. The publisher uses a deterministic weighted distribution:

| Match | Weight | Approx events/s |
|---|---|---|
| match-001 | 2.0 | ~2.0 |
| match-002 | 1.5 | ~1.5 |
| match-003 | 1.5 | ~1.5 |
| match-004 | 1.0 | ~1.0 |
| match-005 | 1.0 | ~1.0 |
| match-006 | 0.8 | ~0.8 |
| match-007 | 0.7 | ~0.7 |
| match-008 | 0.5 | ~0.5 |
| **Total** | **9.0** | **~9.0** |

The remaining ~1.0 events/s is allocated as lobby-state updates (one full lobby publish per second).

Event types per match follow a realistic mix:

```text
70% routine (corner, free_kick, substitution, offside)
15% goal
10% yellow_card
3% red_card
2% var_review
```

Each match maintains its own monotonic `canonical_seq` starting from 1.

---

# 11. Hot-Match Worst/Concentrated Case

During the hot-match test phase:

```text
80% of ALL events are directed to match-001
remaining 20% distributed across match-002 through match-008
total rate: ~50 events/s burst
```

This means match-001 receives ~40 events/s while the system has all 100,000 viewers (or the local maximum) connected.

This tests the worst-case fan-out concentration: one channel must deliver ~40 events/s to every viewer subscribed to that match.

---

# 12. Steady Workload

```text
Duration: 120 seconds (after warm-up)
Total event rate: ~10 canonical events/s
Match event rate: ~9 events/s across 8 matches
Lobby updates: ~1/s (full lobby state)
Total SSE messages published: ~1,200
```

During this phase, all load-generator connections are established and stable.

---

# 13. Burst Workload

```text
Duration: 30 seconds
Match event rate: ~50 canonical events/s (80% match-001, 20% others)
Lobby updates: ~1/s (full lobby state)
Total SSE messages published: ~51/s (50 match + 1 lobby)
```

> **§G clarification:** "50 events/s burst" refers to match events only.
> Lobby publishes at ~1/s independently, bringing total SSE messages to ~51/s.
> The hot-match concentration (Section 11) applies: match-001 receives ~40 of the 50 match events/s.
Lobby updates: still ~1/s (unchanged)
Total SSE messages published during burst: ~1,530
```

The burst begins abruptly (not ramped) to simulate a real simultaneous-goal scenario.

During the burst, the hot-match concentration (Section 11) applies: match-001 receives ~40 of the 50 events/s.

After the 30-second burst, the system returns to steady state for 30 seconds before the next test phase.

---

# 14. Lobby Workload

The lobby channel publishes the full current state of all 8 matches as one SSE message.

```text
Frequency: 1/s (once per second)
Payload size: ~1,200 bytes
Buffer length: 1 (only the latest lobby state is retained)
First message for new subscriber: oldest (current state with buffer_length=1)
```

Lobby viewers receive:
1. Current state immediately on connect (oldest-first; with buffer_length=1 this is the latest state).
2. Replacement state whenever it changes.

This matches the production architecture exactly.

---

# 15. Full-Match-History Model

### Conservative maximum retained events per active match

```text
Maximum: 5,000 canonical events per match
```

This is sufficient for POC test timing: at ~9 events/s steady rate, 5,000 messages captures approximately 9 minutes of history. The POC's late-join test occurs well within this window. A full 90-minute match at ~1.25 events/s would produce ~6,750 events, exceeding the buffer; however, the POC does not run a full 90-minute match and does not claim to prove complete 90-minute history retention. The buffer size validates the mechanism; production would use `nchan_message_timeout 0` (infinite buffer) during active matches (§BN).

### Late-join test procedure

During the measurement phase, after the system has been running for at least 60 seconds under steady load:

1. Open a new SSE connection to a match channel with `Last-Event-ID: 0` (requesting oldest).
2. Nchan sends the oldest retained event and streams forward.
3. Measure the wall-clock time from connection open to receipt of the most recent event at the moment of connection.

### Late-join acceptance

```text
T_late_join_start = timestamp of SSE connection open
T_late_join_end   = timestamp when the client receives the event whose
                     canonical_seq equals or exceeds the match head at T_late_join_start
late_join_duration = T_late_join_end - T_late_join_start
```

The match head at connection time is captured by the publisher/aggregator and passed to the load generator so the load generator knows when it has caught up.

### Late-join must be tested under load

The late-join test MUST occur while the system is processing the steady-state workload AND while other connections are active. Late-join history replay must complete within **2 seconds** even under load.

---

# 16. Connection-Count Test

### Assignment requirement

```text
100,000 concurrent viewers
```

### Local test strategy

The POC must attempt to reach 100,000 concurrent SSE connections. However, a single Docker host may not support this due to:

- File descriptor limits (`ulimit -n`)
- Ephemeral port exhaustion (each outbound connection from a load generator uses a local port)
- Docker networking overhead
- Host memory for connection state
- Load generator CPU saturation

### Scale mapping approach

If the local machine cannot support 100,000 connections, the POC MUST:

1. Determine the **maximum sustainable connection count** the machine can support without generator or host saturation.
2. Measure per-resource utilization at that sustainable maximum.
3. Extrapolate to 100,000 connections using the measured per-resource utilization.
4. Report the result as **INCONCLUSIVE at the 100k scale** with a clear production mapping, NOT as a gateway failure.

### Multiple load-generator sharding

Use multiple load-generator containers (each opening a portion of connections) to distribute the load:

```text
loadgen-primary: connections 1 through N/2
loadgen-surge:   connections N/2+1 through N
```

Each generator shard monitors its own CPU, memory, event-loop delay, and connection count.

### Host prerequisites for high-connection runs

Before attempting high-connection tests, the host must be configured:

```bash
# Increase file descriptor limit (temporary, for the POC run)
sudo sysctl -w fs.file-max=2000000
sudo sysctl -w net.ipv4.ip_local_port_range="1024 65535"
sudo sysctl -w net.ipv4.tcp_tw_reuse=1
sudo sysctl -w net.core.somaxconn=65535
```

These MUST be documented in the POC README as required host setup.

---

# 17. +40,000 Viewers / 120-Second Surge

### Correct interpretation

The assignment means: total concurrency reaches 100,000, with +40,000 arriving within 120 seconds. The surge is NOT additive to 100k; it IS the ramp from 60k to 100k within 120 seconds.

### Local surge test

```text
Phase 1 (0-120s):    ramp from 0 to (max sustainable connections)
Phase 2 (120-240s):  hold steady
Phase 3 (240-360s):  surge: add +40% of current connections within 120 seconds
                      (scaled proportionally; e.g., if max is 10,000, add 4,000 in 120s)
Phase 4 (360-420s):  hold steady at peak
```

The surge rate scales proportionally:

```text
Assignment surge rate: 40,000 / 120s = 333 connections/s
If local max is 10,000: 4,000 / 120s = 33 connections/s
```

The surge must NOT cause existing connections to drop, miss events, or observe degraded fan-out latency beyond the frozen thresholds.

---

# 18. Reconnect/Resume Test

### Procedure

During the measurement phase:

1. Select a subset of established connections (e.g., 100 connections from one generator shard).
2. Forcefully terminate those connections (generator closes the SSE stream).
3. Wait 2 seconds (simulating brief network disruption).
4. Reconnect each terminated client using `Last-Event-ID` set to the last `id:` received before disconnection.
5. Verify:
   - No missing canonical sequences between last received and first new event.
   - No duplicate events (same `canonical_seq` received twice).
   - Events arrive in strict canonical order.
   - Total reconnect + catch-up time is within acceptable bounds.

### Reconnect must be tested against a different Nchan process if feasible

Because Redis is the shared backing store, the POC should attempt to reconnect some clients to the same Nchan process and some to a different one (if the topology includes more than one Nchan instance). This directly tests the Redis-backed cross-node history resume assumption.

For this test, optionally add a second Nchan container (`nchan-2`) on a different port, both backed by the same Redis. Route a subset of reconnecting clients to `nchan-2`.

### Reconnect timing

```text
T_reconnect_start = client closes connection
T_reconnect_end   = client has received all missed events through the sequence
                     that was current at T_reconnect_start
reconnect_duration = T_reconnect_end - T_reconnect_start
```

This does not have a frozen 2-second SLO (that is the late-join requirement). Reconnect timing is measured and reported but the primary correctness check is: **no gaps, no duplicates, correct order**.

---

# 19. Nchan Node Restart/Replacement Test

### Purpose

Because shared Redis is specifically intended to make cross-node/history resume work, the experiment should attempt to falsify this assumption.

### Procedure

1. Run the system under steady load with active connections.
2. Gracefully stop the Nchan container (`docker stop nchan`).
3. Wait 5 seconds.
4. Restart the Nchan container (`docker start nchan`).
5. Verify:
   - Connections that were established before the restart receive correct history via `Last-Event-ID` resume after reconnecting.
   - The full retained match history is still available from Redis.
   - No events are missing or duplicated in the replayed history.

If the topology includes `nchan-2` (Section 18), reconnecting clients may be routed to `nchan-2` during the restart window, directly testing cross-node Redis-backed history.

> **§E clarification:** The current `nchan-restart` scenario performs cross-node
> replacement (nchan-1 -> nchan-2), not a literal Nchan process restart. Both tests
> are valuable: cross-node replacement tests Redis-backed history resume across
> Nchan instances; literal restart tests process lifecycle and state recovery.
> A literal restart test (docker stop/start on the same container) should be added
> as a separate scenario or combined into this one.
>
> **§AT clarification:** For any restart or cross-node replacement result to be
> valid, the wall-clock offset between every participating Nchan instance must be
> measured and recorded. Docker containers on the same host typically have
> sub-millisecond offset, but this must be verified, not assumed. If the measured
> offset exceeds 50ms, the cross-node/restart result is INCONCLUSIVE.

### Constraints

This test is executed **once** during the measurement sequence. It is not repeated in every measured run.

---

# 20. Slow-Client/Backpressure Behavior

### Classification

Slow-client/backpressure behavior is tested as part of the **main acceptance suite**, not a separate diagnostic.

### Procedure

1. Within one load-generator shard, designate 5% of connections as "slow consumers."
2. Slow consumers read from the SSE stream at a rate of 1 event per 2 seconds (deliberately slower than the publish rate).
3. Verify:
   - Nchan does not accumulate unbounded memory for slow consumers.
   - Slow consumers are either:
     - disconnected by Nchan after the buffer threshold, OR
     - catch up if the buffer can hold the backlog.
   - Non-slow consumers are not affected by slow consumers.
   - After a slow consumer is disconnected and reconnects with `Last-Event-ID`, it receives correct history.

### Nchan behavior expectation

Nchan disconnects slow subscribers when the per-subscriber message buffer is exceeded. The POC must verify this is the case and that it does not cause cascading problems.

> **§N clarification:** The acceptance criteria require that the POC observes
> at least one slow-consumer disconnect (`slow_consumer_disconnects > 0`) to
> confirm that Nchan's backpressure mechanism is real. If no slow consumer is
> disconnected during the test, the result is INCONCLUSIVE for the slow-client
> property, not PASS. The core hypothesis is: bounded server behavior under
> backpressure with no material harm to healthy clients.

---

# 21. Warm-Up Period

```text
Duration: 30 seconds
```

During warm-up:
- Publisher begins generating events.
- 60% of target connections are established (base connections).
- No measurements are recorded.
- Redis and Nchan caches are populated.

After warm-up, a 5-second stabilization pause occurs, then the measured phase begins.

> **§H clarification:** Warm-up establishes 60% of target connections (base).
> The remaining 40% are added during the connection-surge phase (Section 17)
> over 120 seconds, simulating the +40,000 viewer surge from the assignment.

---

# 22. Measured Duration

```text
Warm-up:              30 seconds
Stabilization:         5 seconds
Steady measurement:  120 seconds
Burst measurement:    30 seconds
Post-burst steady:    30 seconds
Late-join test:       executed at t=90s of steady measurement
Reconnect test:       executed at t=105s of steady measurement
Hot-match test:       60 seconds (during burst phase)
Nchan restart test:   1 event per measurement run (see Section 19)
Cool-down:            10 seconds
Total per run:       ~420 seconds (~7 minutes)
```

---

# 23. Number of Repeated Measured Runs

```text
Minimum measured runs: 3
Recommended:           5
```

All runs must produce consistent results within ±15% variance on key metrics (fan-out latency p95, late-join duration). If variance exceeds 15% across runs, run up to 5 additional runs and investigate.

One lucky run is never sufficient for an ACCEPT decision.

---

# 24. Container Resource Limits

| Container | CPUs | Memory |
|---|---|---|
| nchan | 4 | 4 GB |
| redis | 2 | 2 GB |
| runner | 8 | 8 GB |
| **Total** | **14** | **14 GB** |

These are Docker `deploy.resources.limits`. The host must have at least 16 CPUs and 16 GB RAM available for Docker.

### §O: Auxiliary topology resource envelope

The POC includes auxiliary containers beyond the primary DUT. Each component's resource envelope is frozen separately:

```text
DUT (nchan-primary):       4 CPUs, 4 GB RAM — the architecture under test
nchan-2 (replacement):     4 CPUs, 4 GB RAM — cross-node restart test only; not part of primary DUT capacity
Redis:                     2 CPUs, 2 GB RAM — backing store for both Nchan nodes
Runner (load generator):   8 CPUs, 8 GB RAM — measurement + load generation
```

Cross-node restart testing uses nchan-2 as a replacement node, not as additional DUT capacity. The ACCEPT/REJECT criteria apply to each Nchan node individually under its own 4 CPU / 4 GB envelope. Aggregate Nchan capacity across both nodes must not be claimed as single-node capacity.

The runner's 8 CPU / 8 GB envelope is the load-generator ceiling. Generator saturation (Section 30) applies to the runner, not the DUT.

---

# 25. Host Prerequisites

The host running `docker compose up --build` must satisfy:

```text
Docker version:           >= 24.0
Docker Compose version:   >= 2.20
Available CPUs:           >= 16
Available RAM:            >= 16 GB
File descriptor limit:    >= 1,000,000 (for high-connection tests)
Ephemeral port range:     1024-65535
tcp_tw_reuse:             enabled (for generator port recycling)
Disk:                     >= 5 GB free (for Docker images)
```

For connection counts above 10,000, the host prerequisites from Section 16 apply.

---

# 26. Timing Methodology

### Fan-out latency

```text
T0 = publish_timestamp embedded in the SSE event payload by the publisher
     (wall-clock ISO 8601 via Date.now().toISOString() at publish time)

T1 = timestamp when the SSE client frame is fully received and parsed
     (wall-clock via Date.now() at client receive time)

fan_out_latency = T1 - T0  (milliseconds)
```

> **§F clarification:** Both T0 and T1 use wall-clock timestamps (Date.now()),
> not monotonic process.hrtime.bigint(). process.hrtime.bigint() is used only
> for elapsed durations within the same process (e.g. phase timers).
> Cross-component latency requires wall-clock timestamps for comparability.

### Clock synchronization

The publisher and all load generators run on the same Docker host (or within the same Docker network). The `publish_timestamp` is a wall-clock ISO timestamp generated at publish time. The load generator records its own wall-clock receive time.

Because publisher and generator may be in different containers, clock drift is expected to be negligible (sub-millisecond on the same host). The POC must document the measured clock offset if measurable, or acknowledge that cross-container timing has a small uncertainty.

**Important limitation:** This is NOT a claim of ingest-to-browser-render latency. It measures publish-to-SSE-client-frame-receipt. The production latency budget includes additional stages (DynamoDB commit, gateway polling, CloudFront, browser render) not present in the POC.

### Late-join timing

```text
T_late_join_start = client connection open timestamp (wall-clock Date.now())
T_late_join_end   = timestamp when client receives the event whose
                     canonical_seq >= match_head_at_connection_time
late_join_duration = T_late_join_end - T_late_join_start
```

### Reconnect timing

```text
T_reconnect_start = client deliberate disconnect timestamp
T_reconnect_end   = timestamp when client has caught up to T_reconnect_start's head
reconnect_duration = T_reconnect_end - T_reconnect_start
```

---

# 27. Required Metrics

The aggregator MUST collect and report the following:

### Connection metrics

```text
connections_attempted
connections_established
connection_failures
active_connections_peak
connection_establishment_rate_peak (connections/s)
unexpected_disconnects
```

### Event metrics

```text
events_published_total
expected_fan_deliveries (events_published * subscribers_at_time_of_publish)
received_fan_deliveries (sum across all clients)
missing_canonical_sequences (gaps detected by clients)
duplicates (same canonical_seq received twice by same client)
out_of_order_sequences (canonical_seq N+1 received before N)
```

### Fan-out latency (per event delivery)

```text
fan_out_latency_p50
fan_out_latency_p95
fan_out_latency_p99
fan_out_latency_max
```

### Late-join metrics

```text
late_join_count (number of late-join tests performed)
late_join_duration_p50
late_join_duration_p95
late_join_duration_p99
late_join_duration_max
```

### Reconnect metrics

```text
reconnect_count
reconnect_duration_p50
reconnect_duration_p95
reconnect_gaps_detected
reconnect_duplicates_detected
reconnect_order_violations
```

### Resource metrics

```text
nchan_cpu_percent_peak
nchan_memory_mb_peak
redis_cpu_percent_peak
redis_memory_mb_peak
redis_connected_clients_peak
loadgen_cpu_percent_peak (per shard)
loadgen_memory_mb_peak (per shard)
loadgen_event_loop_delay_p99 (per shard)
loadgen_backlog_saturation_indicator (max pending events per shard)
```

### Slow-client metrics

```text
slow_consumer_disconnects
non_slow_consumer_impact (p95 latency for non-slow consumers with vs without slow consumers present)
```

### Nchan restart test

```text
nchan_restart_history_replay_correct (true/false)
nchan_restart_missing_sequences
nchan_restart_duplicates
nchan_restart_order_violations
nchan_restart_clock_offset_ms (measured wall-clock offset between Nchan instances, §AT)
```

---

# 28. ACCEPT Criteria

ALL of the following must be true for ACCEPT:

```text
Fan-out latency:
  p95 <= 500ms (publisher frame send to SSE client frame receipt)

Late-join history catch-up:
  p95 <= 2.0 seconds (connection open to caught-up)

Connections:
  >= 10,000 concurrent SSE connections sustained without Nchan failure
  OR
  machine maximum reached with per-resource extrapolation demonstrating
  that Nchan is not the bottleneck (document the maximum achieved)

  §L clarity: This criterion validates Nchan architecture at whatever scale
  the hardware supports. A run that reaches the machine maximum and
  demonstrates Nchan is not the bottleneck passes this ACCEPT criterion.
  The overall 100k-scale verdict is separate: if the machine cannot
  physically reach 100,000 connections, the run verdict is INCONCLUSIVE
  AT 100K SCALE (Section 30), not a gateway failure. Per-resource
  extrapolation may be reported as a production inference but must not
  silently convert an untested 100k target into measured ACCEPT.

Event correctness:
  missing_canonical_sequences == 0 (across all clients, all runs)
  duplicates == 0 (across all clients, all runs)
  out_of_order_sequences == 0 (across all clients, all runs)

Burst handling:
  fan_out_latency_p95 during burst <= 1.0 second
  no connection drops during burst attributable to Nchan/Redis

Reconnect/resume:
  reconnect_gaps_detected == 0
  reconnect_duplicates_detected == 0
  reconnect_order_violations == 0

Nchan restart:
  nchan_restart_history_replay_correct == true
  nchan_restart_missing_sequences == 0

Slow client:
  Nchan handles slow/backpressured consumers without unbounded memory growth
  slow_consumer_disconnects > 0 (backpressure mechanism observed)
  non_sustainable consumer impact on non-slow p95 <= 5% degradation

Resource health:
  nchan_memory_mb_peak < 3.5 GB (below 4 GB limit)
  redis_memory_mb_peak < 1.8 GB (below 2 GB limit)
  no container OOM kills
  no container CPU throttling events

Consistency:
  variance across measured runs <= 15% on fan_out_latency_p95 and
  late_join_duration_p95
```

---

# 29. REJECT Criteria

ANY of the following is REJECT:

```text
Blanket failure:
  Any mandatory ACCEPT criterion (Section 28) not met maps to REJECT
  unless the specific criterion's definition explicitly produces a
  different result (e.g., INCONCLUSIVE for generator saturation).

Fan-out latency:
  p95 > 500ms during steady state (fails ACCEPT threshold)

Late-join history catch-up:
  p95 > 2.0 seconds (Nchan + Redis cannot serve retained history within the
  assignment requirement)

Event correctness:
  missing_canonical_sequences > 0 in any run (Nchan/Redis lost events)
  out_of_order_sequences > 0 in any run (ordering broken)
  duplicates > 0 in any run (Nchan/Redis delivered duplicates)

Reconnect:
  reconnect_gaps_detected > 0 (Redis-backed history resume is broken)
  reconnect_duplicates_detected > 0

Nchan restart:
  nchan_restart_history_replay_correct == false (Redis-backed history does
  not survive Nchan process restart)
  nchan_restart_missing_sequences > 0

Slow client:
  Nchan unbounded memory growth under slow-consumer load
  slow_consumer_disconnects == 0 (backpressure mechanism not observed, §N)
  non_sustainable consumer impact on non-slow p95 > 5% degradation

Resource exhaustion:
  nchan_memory unbounded growth (memory increases linearly with time
  under steady state, indicating a leak or unbounded buffer)
  nchan_memory_mb_peak >= 3.5 GB
  redis_memory_mb_peak >= 1.8 GB
  container OOM kills observed
  container CPU throttling events observed
```

---

# 30. INCONCLUSIVE Criteria

ANY of the following is INCONCLUSIVE (NOT converted to ACCEPT):

```text
Generator saturation:
  loadgen_cpu_percent_peak >= 90% before reaching target connection count
  loadgen_event_loop_delay_p99 >= 100ms
  loadgen_backlog_saturation_indicator > 1000 pending events
  Report: "load generator saturated first; Nchan capacity unknown at target scale"

Host OS limit:
  file descriptor exhaustion observed
  ephemeral port exhaustion observed
  Docker OOM kill on a load-generator container
  Report: "host OS limit reached; Nchan capacity unknown at target scale"

Timing invalidity:
  clock offset between publisher and generator > 50ms
  Report: "timing mechanism unreliable; latency results not trustworthy"

Docker networking bottleneck:
  Docker bridge networking saturates before Nchan does
  Report: "Docker networking became the bottleneck; Nchan capacity unknown"

Resource envelope violated:
  Container exceeded its frozen resource limit
  Report: "resource envelope could not be honored; test invalid at this config"

Measurement bug:
  Aggregator code error discovered post-run
  Report: "measurement bug; results discarded"

Insufficient runs:
  Variance across runs > 15% even after 8 runs
  Report: "results unstable; no reliable conclusion"

Slow-consumer backpressure not observed:
  slow_consumer_disconnects == 0 during the slow-client scenario
  Report: "slow-consumer backpressure not confirmed; bounded-memory result is inconclusive"

Nchan restart clock incompatible:
  Wall-clock offset between Nchan instances > 50ms during restart/replacement test (§AT)
  Report: "cross-Nchan clock offset too large; restart/replacement result not trustworthy"
```

---

# 31. Production Mapping

Every claim from this POC must be classified into exactly one of:

### ASSIGNMENT FACT

Values given directly by the assignment (e.g., 100,000 viewers, 10 events/s, 50 events/s burst, 8 matches, 2s goal latency, 5s other-event latency, 2s history join, $3,000/month, +40,000/120s).

### POC MEASUREMENT

Values directly measured during the local POC run (e.g., fan-out latency p95, late-join duration, connection count achieved, event correctness, Nchan memory usage).

### PLANNING ASSUMPTION

Values assumed for the POC design that are not assignment facts and not measured (e.g., 250-byte routine payload size, 5,000 event history cap, event type distribution, 15s heartbeat interval).

### PRODUCTION INFERENCE

Claims that extrapolate from local POC results to production (e.g., "Nchan handles X concurrent connections locally, therefore a multi-node EC2 fleet can scale to 100k"). Every production inference MUST:
- State the local measurement it is based on.
- State the mapping assumption (e.g., per-node capacity × fleet size).
- State what could invalidate the inference (e.g., AWS networking characteristics differ from Docker bridge).
- Be labelled INFERENCE, not MEASUREMENT.

### UNRESOLVED EXTERNAL ASSUMPTION

Claims that depend on external factors not available in the POC (e.g., real provider schema, AWS production performance, CloudFront edge behavior, ElastiCache Redis performance, NLB connection handling).

**Critical:** The local POC result does NOT prove AWS/EC2/NLB/CloudFront production performance. It provides evidence about the Nchan + Redis subsystem's inherent capability. Production inference requires additional reasoning and carries uncertainty.

---

# 32. Pre-Freeze Review Checklist

This contract was reviewed against the following before freezing:

| # | Question | Answer |
|---|---|---|
| 1 | Is any required experimental choice still ambiguous? | No. All versions, configurations, workloads, metrics, and thresholds are frozen. |
| 2 | Could the implementer make a new architecture decision? | No. Docker topology, Nchan config, event schema, and workload are fully specified. |
| 3 | Could success/failure be reinterpreted after seeing results? | No. ACCEPT/REJECT/INCONCLUSIVE criteria are frozen thresholds, not post-hoc judgments. |
| 4 | Is any assignment target silently weakened? | No. 100k connections is attempted; if the machine cannot reach it, the result is INCONCLUSIVE, not redefined as success at a lower target. |
| 5 | Is any local result being misrepresented as full production proof? | No. Section 31 explicitly classifies every claim type. |
| 6 | Could generator saturation be confused with Nchan failure? | No. Section 30 defines generator saturation as INCONCLUSIVE, not REJECT. |
| 7 | Is full-history <=2s actually measured? | Yes. Section 15 defines the late-join test with explicit timing. |
| 8 | Is reconnect/resume actually measured? | Yes. Section 18 defines reconnect test with gap/dup/order verification. |
| 9 | Are canonical duplicates/order/gaps actually measured? | Yes. Section 27 mandates tracking all three across all clients and all runs. |
| 10 | Does Redis materially participate in the property we are claiming? | Yes. Nchan restart test (Section 19) and cross-node reconnect (Section 18) specifically test Redis-backed history survival. |

---

# 33. File Location

```text
internal_docs/LIVE_MATCH_CENTRE_POC_EXPERIMENT_CONTRACT_v2_0_1.md
```

---

# 34. Relationship to Architecture

This POC tests the riskiest **locally testable** assumption in the current minimum defensible architecture:

```text
ASM-GW-CAPACITY (refined for Nchan + Redis + SSE)
```

The least-trusted **overall** assumption remains:

```text
ASM-PROVIDER-SEMANTICS
```

This POC does not address ASM-PROVIDER-SEMANTICS because the real provider schema is unavailable.

If this POC produces ACCEPT, the architecture is supported but NOT proven for production. If it produces REJECT, the architecture must be revisited at Milestone 4.
