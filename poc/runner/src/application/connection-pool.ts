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

  constructor(config: ConnectionPoolConfig, metrics: MetricsRecorder, clock: Clock) {
    this.config = config
    this.metrics = metrics
    this.clock = clock
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
      return
    }

    if (!data || typeof data.canonical_seq !== "number") return

    const seq = data.canonical_seq as number
    this.metrics.incrementEventsReceived()

    if (data.publish_timestamp) {
      const publishTime = new Date(data.publish_timestamp).getTime()
      const recvTime = this.clock.now()
      if (!isNaN(publishTime)) {
        const latency = recvTime - publishTime
        if (latency >= 0 && latency < 30000) {
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
  ): Promise<void> {
    const batchSize = 50
    const batches = Math.ceil(connectionsPerWorker / batchSize)

    for (let b = 0; b < batches && this._running; b++) {
      const start = b * batchSize
      const end = Math.min(start + batchSize, connectionsPerWorker)
      const promises: Promise<void>[] = []

      for (let i = start; i < end; i++) {
        const connId = connectionOffset + i
        const matchIdx = connId % this.config.matchIds.length
        const matchId = this.config.matchIds[matchIdx]
        const isSlow = i < Math.floor(connectionsPerWorker * 0.05)

        this.metrics.incrementConnectionsAttempted()

        promises.push(
          this.connectOne(stream, connId, matchId).then((entry) => {
            if (entry) {
              this.connections.push(entry)
              if (isSlow) onSlowConsumer?.(entry)
            }
          }).catch(() => {}),
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
      const subscription = await stream.connect(url)
      const tracker = this.createTracker()

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
        }
      })

      return entry
    } catch {
      return null
    }
  }

  async disconnectAll(): Promise<void> {
    this._running = false
    for (const conn of this.connections) {
      try {
        conn.subscription.close()
      } catch {}
      this.metrics.incrementConnectionsDropped()
    }
    this.connections = []
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

      try {
        const url = `${this.config.subUrl}/sub/${matchId}`
        const subscription = await stream.connect(url, lastEventId)
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
      } catch {}
    }
  }
}
