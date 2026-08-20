import type { Subscription } from "../ports/event-stream.js"
import type { EventStream } from "../ports/event-stream.js"
import type { MetricsRecorder } from "../ports/metrics.js"
import type { Clock } from "../ports/clock.js"
import { createSequenceTracker, type SequenceTracker } from "../domain/sequence-validator.js"

export interface ConnectionEntry {
  id: number
  matchId: string
  subscription: Subscription
  tracker: SequenceTracker
  mode: "steady" | "reconnect"
}

export interface ConnectionPoolConfig {
  subUrl: string
  matchIds: string[]
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
  private removeEntry(entry: ConnectionEntry): void {
    const idx = this.connections.indexOf(entry)
    if (idx >= 0) this.connections.splice(idx, 1)
    const count = this.subscribersByChannel.get(entry.matchId) ?? 0
    this.subscribersByChannel.set(entry.matchId, Math.max(0, count - 1))
    this.metrics.setActiveConnections(this.connections.length)
  }

  clear(): void {
    this.connections = []
  }

  createTracker(): SequenceTracker {
    return createSequenceTracker(0)
  }

  handleMessage(entry: ConnectionEntry, eventData: string): void {
    if (!this._running) return

    let data: any
    try {
      data = JSON.parse(eventData)
    } catch {
      this.metrics.incrementJsonParseErrors()
      return
    }

    if (!data || typeof data.canonical_seq !== "number") return

    const seq = data.canonical_seq as number
    this.metrics.incrementEventsReceived()

    if (data.publish_timestamp) {
      const publishTime = new Date(data.publish_timestamp).getTime()
      const recvTime = this.clock.now()
      if (isNaN(publishTime)) {
        this.metrics.incrementInvalidTimestampCount()
      } else {
        const latency = recvTime - publishTime
        // §T: Do not silently discard latencies. Record all valid samples,
        // count negative as timing-invalid, count >=30s as overflow.
        if (latency < 0) {
          this.metrics.incrementLatencyInvalid()
        } else {
          if (latency >= 30000) {
            this.metrics.incrementLatencyOverflow()
          }
          this.metrics.recordFanOutLatency(latency)
        }
      }
    }

    const classification = entry.tracker.classify(seq)
    switch (classification.kind) {
      case "GAP": {
        const gap = classification.received - classification.expected
        if (entry.mode === "steady") {
          this.metrics.incrementMissingSequences(gap)
        } else {
          this.metrics.incrementReconnectGaps(gap)
        }
        break
      }
      case "DUPLICATE":
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

      subscription.onEvent((evt) => {
        if (!this._running) return
        if (evt.type === "message") {
          this.handleMessage(entry, evt.event.data)
        } else if (evt.type === "error") {
          // §4.3: Terminal stream error — remove from active pool immediately
          // §4.17: Disconnect attribution — classify error by cause
          const msg = evt.error?.message ?? ""
          if (/ECONNREFUSED|ETIMEDOUT|ECONNRESET|EPIPE|socket hang up|network|fetch failed/i.test(msg)) {
            this.metrics.incrementNetworkFailures()
          } else {
            this.metrics.incrementServerInitiatedDisconnects()
          }
          this.removeEntry(entry)
        }
      })

      const count = this.subscribersByChannel.get(matchId) ?? 0
      this.subscribersByChannel.set(matchId, count + 1)

      return entry
    } catch {
      this.metrics.incrementConnectionFailures()
      return null
    }
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
            this.handleMessage(entry, evt.event.data)
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
