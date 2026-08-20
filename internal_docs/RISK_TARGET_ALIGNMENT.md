# Risk-Target Alignment (§BP)

## Frozen risk distinction

```text
overall least-trusted assumption:
  Real third-party provider semantics / recoverability
  (not locally testable from supplied assignment)

riskiest locally testable assumption:
  Nchan + Redis + SSE fan-out / history / resume behavior
  under the assignment-mapped workload
```

Every scenario in the POC measures a sub-property of the locally testable risk or validates the measurement harness itself.

## Scenario justification

| Scenario | Sub-property measured | Risk addressed |
|---|---|---|
| warmup | Connection establishment at 60% target — validates harness can reach scale | Harness validation |
| steady | Fan-out latency under sustained load — core Nchan+Redis delivery performance | Fan-out |
| late-join | History replay speed — Redis retention serves late joiners within 2s | History replay |
| burst | 50 events/s hot-match fan-out — worst-case single-match delivery | Fan-out (burst) |
| reconnect | Disconnect + resume with history — Redis-backed state survives reconnect | Resume/recovery |
| slow-consumer | Backpressure without bounded memory — Nchan handles slow readers | Backpressure |
| connection-surge | +40% connections in 120s — Nchan accepts rapid ramp | Scalability |
| nchan-restart | Process restart + Redis history survive — Redis-backed history persistence | Persistence/recovery |

## Removed scenarios (not applicable to local risk)

No scenarios have been removed. All 8 scenarios measure sub-properties of the Nchan+Redis+SSE fan-out/history/resume risk or validate the measurement harness.

## §BU: External technical-source provenance

| Claim/Decision | Source | URL/Reference | Version/Date | What it establishes | Contract/code dependency |
|---|---|---|---|---|---|
| Nchan `newest` waits for next message | Nchan 1.3.8 docs | https://nchan.io/publisher.html#message-occurrence | v1.3.8 | `newest` is NOT "send latest buffered" | §B: lobby uses `oldest` |
| Nchan `nchan_eventsource_event` overrides per-message headers | Nchan 1.3.8 source | nchan/src/nchan_module.c | v1.3.8 | Fixed event type overrides X-Event-Source-Event | §AA: removed from match subscribers |
| Nchan auto-generates SSE `id:` field | Nchan 1.3.8 behavior | Empirical testing | v1.3.8 | `id:` is transport-level, not application | §A: canonical_seq in JSON payload |
| cgroup v2 `cpu.stat` format | Linux kernel docs | https://www.kernel.org/doc/Documentation/cgroup-v2.txt | v5.x+ | Multi-line key-value: usage_usec, nr_throttled, throttled_usec | §AC: CPU metrics |
| cgroup v2 `memory.events` format | Linux kernel docs | https://www.kernel.org/doc/Documentation/cgroup-v2.txt | v5.x+ | Multi-line: oom, oom_kill counters | §AC: OOM detection |
| perf_hooks.monitorEventLoopDelay | Node.js docs | https://nodejs.org/api/perf_hooks.html | v16+ | High-resolution event-loop delay histogram | §AB: event-loop monitoring |
| Docker cgroup v2 mount path | Docker docs | https://docs.docker.com/engine/reference/commandline/dockerd/ | v24+ | `/sys/fs/cgroup/` in container with cgroup v2 | §AC: cgroup file reads |
| Nchan `Last-Event-ID` resume | Nchan 1.3.8 docs | https://nchan.io/publisher.html#eventsource | v1.3.8 | Subscriber reconnects using `Last-Event-ID` header to resume from retained history | §6.5: reconnect scenario, nchan.conf subscriber config |
| Nchan shared Redis between instances | Nchan 1.3.8 docs | https://nchan.io/redis.html | v1.3.8 | Multiple Nchan instances sharing Redis backend share message state; clock sync required | §6.7: cross-node replacement, nchan.conf redis_backend upstream |
| Nchan message buffer retention | Nchan 1.3.8 docs | https://nchan.io/publisher.html#message-buffer | v1.3.8 | `nchan_message_buffer_length` retains N most recent messages per channel | §C: 5000-message history buffer, nchan.conf |
| Nchan `nchan_subscriber_first_message` | Nchan 1.3.8 docs | https://nchan.io/subscriber.html#first-message | v1.3.8 | `oldest` sends oldest buffered message immediately; `newest` waits for next | §B: lobby uses `oldest` to send current state |
| Nginx `worker_processes auto` | Nginx docs | https://nginx.org/en/docs/ngx_core_module.html#worker_processes | v1.27+ | Spawns one worker per CPU core; under container CPU quota may observe host CPU count | §BC: overridden to explicit 4 to match 4-CPU container |
| HTTP/1.1 chunked transfer encoding | RFC 7230 §4.1 | https://tools.ietf.org/html/rfc7230#section-4.1 | RFC 7230 | HTTP servers may use chunked encoding for streaming responses; Nchan uses this for SSE | §AF: SSE streaming, connection-pool.ts |
| Node.js `http.request` keep-alive | Node.js docs | https://nodejs.org/api/http.html#class-httpagent | v22 | Default HTTP agent reuse behavior; `maxSockets` per host limits concurrent connections | §AG: generator socket-stack preflight |
| SSE `text/event-stream` Content-Type | W3C EventSource spec | https://html.spec.whatwg.org/multipage/server-sent-events.html | Living standard | Client must verify `text/event-stream` Content-Type for valid SSE connection | §AF: sse-http-client.ts Content-Type check |
| Redis 7.2 compatibility with Redis OSS | Redis docs | https://redis.io/docs/operate/oss-and-stack/ | v7.2 | Redis 7.2 maintains backward compatibility with Redis 7.1 protocol; suitable for local POC | Contract §I: local Redis version |
| Docker Compose resource limits | Docker docs | https://docs.docker.com/compose/compose-file/deploy/ | Compose v2 | `deploy.resources.limits` enforces cgroup-based CPU/memory limits per container | §O/§AC: compose.yaml resource envelopes |
| Node.js `perf_hooks.monitorEventLoopDelay` | Node.js docs | https://nodejs.org/api/perf_hooks.html#perf_hooksmonitorloopeventloopdelayresolution | v16+ | Produces histogram of event-loop delay with configurable resolution; percentiles available | §AB: real phase-aware event-loop monitoring per shard |
