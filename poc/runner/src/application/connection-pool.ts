import type { Subscription, SubscriptionEvent } from "../ports/event-stream.js"
import type { EventStream } from "../ports/event-stream.js"
import type { MetricsRecorder } from "../ports/metrics.js"
import type { Clock } from "../ports/clock.js"
import { createSequenceTracker, type SequenceTracker } from "../domain/sequence-validator.js"
import { validateMatchEventPayload, type ValidMatchEvent } from "../domain/event-validator.js"

// Non-qualifying development diagnostics (probe-only, never set in qualifying runs).
const DUP_DEBUG = process.env.DUP_DEBUG === "1"
const GAP_DEBUG = process.env.GAP_DEBUG === "1"

export interface ConnectionEntry {
  id: number
  matchId: string
  subscription: Subscription
  tracker: SequenceTracker
  mode: "steady" | "reconnect"
  // §M3-HVR: True when the slow-consumer gate holds parsed frames and releases
  // them at application pace. Deferred release means publish_timestamp-based
  // latency no longer measures transport latency for this entry, so fan-out
  // latency recording is suppressed while set (sequence/live accounting stays).
  deferredDelivery?: boolean
}

export interface ConnectionPoolConfig {
  subUrl: string
  matchIds: string[]
  // Every shard observes the authoritative publisher stream. Updating a local
  // observed head here lets non-publisher shards freeze real reconnect ranges.
  onCanonicalHead?: (matchId: string, canonicalSeq: number) => void
}

// v2.1.0: planned partition-restart failover state — captured Last-Event-ID resume
// positions for every pooled viewer, taken before the partition node is restarted.
export interface PlannedFailoverToken {
  saved: Array<{ entry: ConnectionEntry; lastEventId: string | null }>
}

export interface PlannedFailoverResult {
  attempted: number
  reestablished: number
  failed: number
}

export class ConnectionPool {
  private connections: ConnectionEntry[] = []
  private config: ConnectionPoolConfig
  private metrics: MetricsRecorder
  private clock: Clock
  private _running = false
  private subscribersByChannel = new Map<string, number>()

  constructor(config: ConnectionPoolConfig, metrics: MetricsRecorder, clock: Clock) {
    this.config = config
    this.metrics = metrics
    this.clock = clock
  }

  getSubscriberCount(channel: string): number {
    return this.subscribersByChannel.get(channel) ?? 0
  }

  get size(): number {
    return this.connections.length
  }

  get running(): boolean {
    return this._running
  }

  set running(value: boolean) {
    this._running = value
  }

  get entries(): ReadonlyArray<ConnectionEntry> {
    return this.connections
  }

  add(entry: ConnectionEntry): void {
    this.connections.push(entry)
  }

  // §4.3: Remove a dead connection from active pool and decrement counts
  // §3.10.A: Exact-once guard — only decrement if entry is still in the pool.
  // §3.10.E: Returns whether this call actually removed the entry, so terminal
  // attribution (disconnect category) can be gated on first/only removal.
  private removeEntry(entry: ConnectionEntry): boolean {
    const idx = this.connections.indexOf(entry)
    if (idx >= 0) {
      this.connections.splice(idx, 1)
      const count = this.subscribersByChannel.get(entry.matchId) ?? 0
      this.subscribersByChannel.set(entry.matchId, Math.max(0, count - 1))
      this.metrics.setActiveConnections(this.connections.length)
      // §3.10.B: Increment connections_dropped for unexpected terminal errors
      this.metrics.incrementConnectionsDropped()
      return true
    }
    return false
  }

  // §3.4: Explicitly remove an active entry from pool with a reason label.
  // Used by ReconnectScenario to immediately remove cohort from active counts on close.
  // Removes from pool, decrements per-channel subscribers, updates active current metric,
  // records the appropriate disconnect category, and preserves saved reconnect state for resume.
  removeActiveEntry(entry: ConnectionEntry, reason: string, category?: "deliberate" | "network" | "server_initiated" | "unexpected"): void {
    const idx = this.connections.indexOf(entry)
    if (idx >= 0) {
      this.connections.splice(idx, 1)
      const count = this.subscribersByChannel.get(entry.matchId) ?? 0
      this.subscribersByChannel.set(entry.matchId, Math.max(0, count - 1))
      this.metrics.setActiveConnections(this.connections.length)
      // §3.14: Classify disconnect by actual category, not always deliberate
      switch (category ?? "deliberate") {
        case "deliberate": this.metrics.incrementDeliberateDisconnects(); break
        case "network": this.metrics.incrementNetworkFailures(); break
        case "server_initiated": this.metrics.incrementServerInitiatedDisconnects(); break
        case "unexpected": this.metrics.incrementUnexpectedClientDisconnects(); break
      }
    }
    void reason // reason is logged by caller, attribution counted here
  }

  // §3.4: Re-add an entry to the active pool (e.g., after reconnect is established)
  addActiveEntry(entry: ConnectionEntry): void {
    this.connections.push(entry)
    const count = this.subscribersByChannel.get(entry.matchId) ?? 0
    this.subscribersByChannel.set(entry.matchId, count + 1)
    this.metrics.setActiveConnections(this.connections.length)
  }

  clear(): void {
    this.connections = []
    this.subscribersByChannel.clear()
  }

  createTracker(): SequenceTracker {
    return createSequenceTracker(0)
  }

  handleMessage(entry: ConnectionEntry, eventData: string, transportId?: string | null): void {
    if (!this._running) return

    let raw: unknown
    try {
      raw = JSON.parse(eventData)
    } catch {
      this.metrics.incrementJsonParseErrors()
      return
    }

    // Lobby frames intentionally use the frozen latest-state schema rather
    // than match canonical-sequence fields. Validate and count them without
    // feeding them into match sequence or fan-out histograms.
    if (entry.matchId === "lobby") {
      const lobby = raw as Record<string, unknown>
      const validLobby = Array.isArray(lobby.matches)
        && typeof lobby.timestamp === "string"
        && Number.isFinite(new Date(lobby.timestamp).getTime())
      if (!validLobby) {
        this.metrics.incrementSchemaValidationErrors()
        return
      }
      if (transportId === undefined || transportId === null || transportId === "") {
        this.metrics.incrementMissingTransportId()
      }
      this.metrics.incrementEventsReceived()
      if (entry.mode === "steady") this.metrics.incrementLiveReceivedDeliveries(1)
      return
    }

    // §3.16: Schema validation — validate required fields before influencing any metrics
    const validation = validateMatchEventPayload(raw)
    if (!validation.valid) {
      this.metrics.incrementSchemaValidationErrors()
      return
    }

    const data = raw as ValidMatchEvent

    // §3.16: Missing transport ID — SSE events must carry an id field
    if (transportId === undefined || transportId === null || transportId === "") {
      this.metrics.incrementMissingTransportId()
    }

    const seq = data.canonical_seq
    this.config.onCanonicalHead?.(data.match_id, seq)
    this.metrics.incrementEventsReceived()

    // §3.13: Live delivery accounting — received comes from actual frames received here.
    // Expected live deliveries are incremented by the publisher at accepted-publish time
    // using the currently eligible subscriber count (via onPublish callback). They must NOT
    // be incremented on receive, as that makes the delivery ratio tautological.
    if (entry.mode === "steady") {
      this.metrics.incrementLiveReceivedDeliveries(1)
    }

    // §T: Latency measurement from transmitted publish_timestamp
    // §M3-HVR: Skipped while deferredDelivery — the slow-consumer gate releases
    // backlog at application pace, so recvTime - publishTime reflects deliberate
    // client throttling, not transport latency. Recording it would poison the
    // global fan-out histogram and the healthy-degradation comparison.
    if (!entry.deferredDelivery) {
      const publishTime = new Date(data.publish_timestamp).getTime()
      const recvTime = this.clock.now()
      const latency = recvTime - publishTime
      if (latency < 0) {
        this.metrics.incrementLatencyInvalid()
      } else {
        if (latency >= 30000) {
          this.metrics.incrementLatencyOverflow()
        }
        this.metrics.recordFanOutLatency(latency)
      }
    }

    const classification = entry.tracker.classify(seq)
    switch (classification.kind) {
      case "GAP": {
        const gap = classification.received - classification.expected
        if (GAP_DEBUG) {
          console.log(`GAPDBG ${JSON.stringify({ t: this.clock.now(), conn: entry.id, match: entry.matchId, mode: entry.mode, expected: classification.expected, received: classification.received, gap })}`)
        }
        if (entry.mode === "steady") {
          this.metrics.incrementMissingSequences(gap)
        } else {
          this.metrics.incrementReconnectGaps(gap)
        }
        break
      }
      case "DUPLICATE":
        if (DUP_DEBUG) {
          console.log(`DUPDBG ${JSON.stringify({ t: this.clock.now(), conn: entry.id, match: entry.matchId, seq })}`)
        }
        if (entry.mode === "steady") this.metrics.incrementDuplicates()
        else this.metrics.incrementReconnectDuplicates()
        break
      case "OUT_OF_ORDER":
        if (entry.mode === "steady") this.metrics.incrementOutOfOrder()
        else this.metrics.incrementReconnectOrderViolations()
        break
    }
  }

  async connectAll(
    stream: EventStream,
    connectionsPerWorker: number,
    connectionOffset: number,
    onSlowConsumer?: (entry: ConnectionEntry) => void,
    lobbyFraction = 0,
  ): Promise<void> {
    this._running = true
    const batchSize = 50
    const batches = Math.ceil(connectionsPerWorker / batchSize)
    const lobbyCount = Math.floor(connectionsPerWorker * lobbyFraction)

    for (let b = 0; b < batches && this._running; b++) {
      const start = b * batchSize
      const end = Math.min(start + batchSize, connectionsPerWorker)
      const promises: Promise<void>[] = []

      for (let i = start; i < end; i++) {
        const connId = connectionOffset + i
        const isLobby = i < lobbyCount
        const matchId = isLobby
          ? "lobby"
          : this.config.matchIds[(connId - lobbyCount) % this.config.matchIds.length]
        const isSlow = i < Math.floor(connectionsPerWorker * 0.05)

        this.metrics.incrementConnectionsAttempted()

        promises.push(
          this.connectOne(stream, connId, matchId).then((entry) => {
            if (entry) {
              this.connections.push(entry)
              this.metrics.setActiveConnections(this.connections.length)
              if (isSlow) onSlowConsumer?.(entry)
            }
          }),
        )
      }

      await Promise.allSettled(promises)
      await new Promise((r) => setTimeout(r, 50))
    }
  }

  private async connectOne(
    stream: EventStream,
    connId: number,
    matchId: string,
  ): Promise<ConnectionEntry | null> {
    try {
      const url = `${this.config.subUrl}/sub/${matchId}`
      const subscription = await stream.connect(url, undefined, () => this.metrics.incrementSseParseErrors())
      const tracker = this.createTracker()
      this.metrics.incrementConnectionsEstablished()

      const entry: ConnectionEntry = {
        id: connId,
        matchId,
        subscription,
        tracker,
        mode: "steady",
      }

      this.wireEntry(entry)

      const count = this.subscribersByChannel.get(matchId) ?? 0
      this.subscribersByChannel.set(matchId, count + 1)

      return entry
    } catch {
      this.metrics.incrementConnectionFailures()
      return null
    }
  }

  // v2.1.0: shared terminal-event wiring for initial connects and failover reconnects.
  private wireEntry(entry: ConnectionEntry): void {
    entry.subscription.onEvent((evt) => this.processEntryEvent(entry, evt))
  }

  // §M3-RACE-4: the per-event body of wireEntry, extracted so a pre-wire
  // observer wrapper can forward buffered frames through the IDENTICAL pool
  // path (message accounting, tracker classification, terminal-error
  // attribution) while the initialization buffer flushes.
  private processEntryEvent(entry: ConnectionEntry, evt: SubscriptionEvent): void {
    if (!this._running) return
    if (evt.type === "message") {
      this.handleMessage(entry, evt.event.data, evt.event.id)
    } else if (evt.type === "error") {
      // §4.3: Terminal stream error — remove from active pool immediately
      // §4.17/§3.14: Disconnect attribution — classify error by cause
      // §3.10: Exact-once — removeEntry() handles connections_dropped increment and channel decrement.
      // §3.10.E: Attribution is gated on actual removal. A repeated terminal event for an
      // already-removed entry must not increment the category a second time:
      // exactly one terminal connection produces one attribution category, one active
      // removal, and one dropped increment.
      const msg = evt.error?.message ?? ""
      if (this.removeEntry(entry)) {
        if (/ECONNREFUSED|ETIMEDOUT|ECONNRESET|EPIPE|socket hang up|network|fetch failed/i.test(msg)) {
          this.metrics.incrementNetworkFailures()
        } else if (/stream ended/i.test(msg)) {
          // §4.17: Server ended the stream (graceful shutdown or Nchan restart)
          this.metrics.incrementServerInitiatedDisconnects()
        } else if (/abort/i.test(msg)) {
          // §3.14: Client-side abort (AbortController or manual abort)
          this.metrics.incrementUnexpectedClientDisconnects()
        } else {
          // §4.17: Unexpected client-side stream termination
          this.metrics.incrementUnexpectedClientDisconnects()
        }
      }
    }
  }

  // §v2.1.0 — Phase A of the planned partition-restart failover. Captures every pooled
  // viewer's Last-Event-ID resume position, closes each subscription client-side BEFORE
  // the partition node dies (the closed flag suppresses terminal error events, so none
  // of these disconnects can be misattributed as server-initiated), and removes the
  // entries from the pool with dedicated planned_restart attribution. The publisher's
  // expected-delivery accounting stops counting these viewers immediately (they are out
  // of the pool), keeping live expected/received symmetric across the outage window.
  beginPlannedFailover(): PlannedFailoverToken {
    const saved = this.connections.map((entry) => ({ entry, lastEventId: entry.subscription.lastEventId }))
    for (const { entry } of saved) {
      try {
        entry.subscription.close()
      } catch {}
      const idx = this.connections.indexOf(entry)
      if (idx >= 0) {
        this.connections.splice(idx, 1)
        const count = this.subscribersByChannel.get(entry.matchId) ?? 0
        this.subscribersByChannel.set(entry.matchId, Math.max(0, count - 1))
        this.metrics.setActiveConnections(this.connections.length)
        this.metrics.incrementPlannedRestartDisconnects()
      }
    }
    return { saved }
  }

  // §v2.1.0 — Phase B: reconnect every saved viewer to the replacement sub URL with its
  // captured Last-Event-ID. Nchan replays exactly the missed range before resuming live
  // delivery (validated by cross-node probes). Trackers are preserved and entries run in
  // "reconnect" mode during replay so replayed frames do not inflate live-delivery
  // accounting; any gap/duplicate/order violation across the failover window still lands
  // in globally-gated counters. The pool's sub URL is switched to the replacement node
  // (replacement semantics: viewers stay on the spare after the drill).
  async completePlannedFailover(
    stream: EventStream,
    token: PlannedFailoverToken,
    newSubUrl: string,
  ): Promise<PlannedFailoverResult> {
    let reestablished = 0
    let failed = 0
    const batchSize = 50
    for (let start = 0; start < token.saved.length; start += batchSize) {
      if (!this._running) break
      const batch = token.saved.slice(start, start + batchSize)
      await Promise.allSettled(batch.map(async ({ entry, lastEventId }) => {
        this.metrics.incrementConnectionsAttempted()
        try {
          const url = `${newSubUrl}/sub/${entry.matchId}`
          const subscription = await stream.connect(url, lastEventId ?? undefined, () => this.metrics.incrementSseParseErrors())
          entry.subscription = subscription
          entry.mode = "reconnect"
          this.wireEntry(entry)
          this.connections.push(entry)
          const count = this.subscribersByChannel.get(entry.matchId) ?? 0
          this.subscribersByChannel.set(entry.matchId, count + 1)
          this.metrics.incrementConnectionsEstablished()
          reestablished++
        } catch {
          this.metrics.incrementConnectionFailures()
          failed++
        }
      }))
      await new Promise((r) => setTimeout(r, 50))
    }
    this.metrics.setActiveConnections(this.connections.length)
    this.config.subUrl = newSubUrl
    return { attempted: token.saved.length, reestablished, failed }
  }

  // §M3-HVR: Slow-consumer replay probe — detach a single viewer with deliberate
  // attribution and return its Last-Event-ID resume position. Scoped variant of
  // beginPlannedFailover(): the client-side close suppresses terminal error
  // events, so this disconnect can never be misattributed as server-initiated.
  detachEntryForReplayProbe(entry: ConnectionEntry): string | null {
    const lastEventId = entry.subscription.lastEventId
    try {
      entry.subscription.close()
    } catch {}
    const idx = this.connections.indexOf(entry)
    if (idx >= 0) {
      this.connections.splice(idx, 1)
      const count = this.subscribersByChannel.get(entry.matchId) ?? 0
      this.subscribersByChannel.set(entry.matchId, Math.max(0, count - 1))
      this.metrics.setActiveConnections(this.connections.length)
      this.metrics.incrementDeliberateDisconnects()
    }
    return lastEventId
  }

  // §M3-HVR: Reattach a replay-probe viewer on its owner partition with its saved
  // Last-Event-ID. Same wiring path as completePlannedFailover(): tracker preserved,
  // reconnect mode during the replay window (replayed frames stay out of live
  // accounting), pool counters updated. Caller promotes back to steady afterwards.
  //
  // §M3-RACE-4: `preWireHandler` is registered BEFORE wireEntry() so the §M3-RACE
  // initialization-buffer flush reaches it — a probe collector attached only after
  // this method returns misses every frame that flushed to the pool handler alone
  // in between (observed as 81.8% replay coverage on busy channels). While `wired`
  // is false, the wrapper ALSO forwards each event through processEntryEvent so
  // tracker/reconnect/terminal-error accounting stays identical to a pool-handler-
  // first flush. Exactly-once holds structurally: the flush and wireEntry() run in
  // one synchronous block with no await between them, so no event can interleave —
  // buffered frames forward once here, post-wire live frames take the normal
  // single-dispatch path.
  async reattachAfterReplayProbe(
    stream: EventStream,
    entry: ConnectionEntry,
    lastEventId: string | null,
    preWireHandler?: (evt: SubscriptionEvent) => void,
  ): Promise<boolean> {
    this.metrics.incrementConnectionsAttempted()
    try {
      const url = `${this.config.subUrl}/sub/${entry.matchId}`
      const subscription = await stream.connect(url, lastEventId ?? undefined, () => this.metrics.incrementSseParseErrors())
      entry.subscription = subscription
      // Reconnect mode must be active before any frame can flow, including
      // frames flushed from the initialization buffer below.
      entry.mode = "reconnect"
      if (preWireHandler) {
        let wired = false
        subscription.onEvent((evt) => {
          if (!wired) this.processEntryEvent(entry, evt)
          preWireHandler(evt)
        })
        this.wireEntry(entry)
        wired = true
      } else {
        this.wireEntry(entry)
      }
      this.connections.push(entry)
      const count = this.subscribersByChannel.get(entry.matchId) ?? 0
      this.subscribersByChannel.set(entry.matchId, count + 1)
      this.metrics.incrementConnectionsEstablished()
      this.metrics.setActiveConnections(this.connections.length)
      return true
    } catch {
      this.metrics.incrementConnectionFailures()
      return false
    }
  }

  // §v2.1.0 — After the failover replay window has settled, promote failover entries back
  // to steady mode so subsequent live deliveries resume normal live-delivery accounting.
  promoteEntriesToSteady(): number {
    let promoted = 0
    for (const entry of this.connections) {
      if (entry.mode === "reconnect") {
        entry.mode = "steady"
        promoted++
      }
    }
    return promoted
  }

  async disconnectAll(): Promise<void> {
    this._running = false
    for (const conn of this.connections) {
      try {
        conn.subscription.close()
      } catch {}
      // §4.17: Deliberate teardown — track as deliberate disconnect
      this.metrics.incrementDeliberateDisconnects()
      const count = this.subscribersByChannel.get(conn.matchId) ?? 0
      this.subscribersByChannel.set(conn.matchId, Math.max(0, count - 1))
    }
    // §4.17: Track shutdown cleanup — the full teardown itself is a cleanup action
    this.metrics.incrementShutdownCleanup()
    this.connections = []
    this.metrics.setActiveConnections(0)
  }

  async reconnectAll(
    stream: EventStream,
    delayMs: number,
  ): Promise<void> {
    const oldConnections = [...this.connections]
    await this.disconnectAll()

    await new Promise((r) => setTimeout(r, delayMs))

    this._running = true
    for (const old of oldConnections) {
      const matchIdx = old.id % this.config.matchIds.length
      const matchId = this.config.matchIds[matchIdx]
      const lastEventId = old.subscription.lastEventId

      this.metrics.incrementConnectionsAttempted()

      try {
      const url = `${this.config.subUrl}/sub/${matchId}`
      const subscription = await stream.connect(url, lastEventId, () => this.metrics.incrementSseParseErrors())
        const tracker = this.createTracker()

        const entry: ConnectionEntry = {
          id: old.id,
          matchId,
          subscription,
          tracker,
          mode: "reconnect",
        }

        subscription.onEvent((evt) => {
          if (!this._running) return
          if (evt.type === "message") {
            this.handleMessage(entry, evt.event.data, evt.event.id)
          }
        })

        this.connections.push(entry)
        const count = this.subscribersByChannel.get(matchId) ?? 0
        this.subscribersByChannel.set(matchId, count + 1)
      } catch {
        this.metrics.incrementConnectionFailures()
      }
    }
    // §R: Update active connection count after reconnect completes
    this.metrics.setActiveConnections(this.connections.length)
  }
}
