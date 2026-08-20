import { EventSource } from "eventsource"
import type { WorkerMetrics } from "./types.js"

export interface LoadgenConfig {
  workerId: number
  subUrl: string
  connectionsPerWorker: number
  connectionOffset: number
  matchIds: string[]
  burstMode: boolean
  slowConsumerFraction: number
}

interface TrackedConnection {
  id: number
  matchId: string
  eventSource: EventSource
  lastSeq: number
  connected: boolean
  connectTime: number
  latenciesMs: number[]
  isSlow: boolean
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

export class LoadGenWorker {
  private config: LoadgenConfig
  private connections: TrackedConnection[] = []
  private metrics: WorkerMetrics
  private running = false
  private eventLoopDelays: number[] = []

  constructor(config: LoadgenConfig) {
    this.config = config
    this.metrics = {
      worker_id: config.workerId,
      connections_attempted: 0,
      connections_established: 0,
      connection_failures: 0,
      events_received: 0,
      missing_sequences: 0,
      duplicates: 0,
      out_of_order: 0,
      fan_out_latencies_ms: [],
      late_join_latencies_ms: [],
      reconnect_gaps: 0,
      reconnect_duplicates: 0,
      reconnect_order_violations: 0,
      slow_consumer_disconnects: 0,
      event_loop_delay_p99_ms: 0,
      memory_mb_peak: 0,
      connections_dropped: 0,
    }
  }

  async connectAll(): Promise<void> {
    this.running = true
    const batchSize = 50
    const batches = Math.ceil(this.config.connectionsPerWorker / batchSize)

    for (let b = 0; b < batches && this.running; b++) {
      const start = b * batchSize
      const end = Math.min(start + batchSize, this.config.connectionsPerWorker)
      const promises: Promise<void>[] = []

      for (let i = start; i < end; i++) {
        promises.push(this.connectOne(i))
      }
      await Promise.allSettled(promises)
      await sleep(50)
    }
  }

  private async connectOne(index: number): Promise<void> {
    const connId = this.config.connectionOffset + index
    const matchIdx = connId % this.config.matchIds.length
    const matchId = this.config.matchIds[matchIdx]
    const isSlow = index < Math.floor(this.config.connectionsPerWorker * this.config.slowConsumerFraction)

    this.metrics.connections_attempted++

    try {
      const url = `${this.config.subUrl}/sub/${matchId}`
      const es = new EventSource(url)

      const conn: TrackedConnection = {
        id: connId,
        matchId,
        eventSource: es,
        lastSeq: 0,
        connected: false,
        connectTime: Date.now(),
        latenciesMs: [],
        isSlow,
      }

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          es.close()
          reject(new Error("connect timeout"))
        }, 10000)

        es.addEventListener("open", () => {
          clearTimeout(timeout)
          conn.connected = true
          this.metrics.connections_established++
          resolve()
        })

        es.addEventListener("error", () => {
          clearTimeout(timeout)
          this.metrics.connection_failures++
          reject(new Error("connect failed"))
        })
      })

      // Register event handlers
      const messageHandler = (event: any) => {
        this.handleMessage(conn, event, "steady")
      }

      if (isSlow) {
        // Slow consumers: register a handler that closes after first few events
        // This simulates a consumer that can't keep up with the publish rate.
        // Nchan detects the disconnect and cleans up its internal buffer.
        let eventCount = 0
        const slowHandler = (event: any) => {
          this.handleMessage(conn, event, "steady")
          eventCount++
          if (eventCount >= 3) {
            setTimeout(() => {
              try { es.close() } catch {}
              this.metrics.slow_consumer_disconnects++
            }, 1000)
          }
        }
        es.addEventListener("message", slowHandler)
        es.addEventListener("update", slowHandler)
      } else {
        es.addEventListener("message", messageHandler)
        es.addEventListener("update", messageHandler)
      }

      es.addEventListener("lobby", () => {
        this.metrics.events_received++
      })

      es.addEventListener("ping", () => {})

      this.connections.push(conn)
    } catch {
      // Connection failed
    }
  }

  private handleMessage(
    conn: TrackedConnection,
    event: any,
    mode: "steady" | "reconnect"
  ): void {
    if (!this.running) return

    const recvTime = Date.now()

    let data: any
    try {
      data = JSON.parse(event.data)
    } catch {
      return
    }

    if (!data || typeof data.canonical_seq !== "number") return

    const seq = data.canonical_seq as number
    this.metrics.events_received++

    // Fan-out latency
    if (data.publish_timestamp) {
      const publishTime = new Date(data.publish_timestamp).getTime()
      if (!isNaN(publishTime)) {
        const latency = recvTime - publishTime
        if (latency >= 0 && latency < 30000) {
          conn.latenciesMs.push(latency)
          this.metrics.fan_out_latencies_ms.push(latency)
        }
      }
    }

    // Sequence tracking - only track if seq > lastSeq (avoid false positives from buffer replay)
    if (conn.lastSeq > 0) {
      if (seq <= conn.lastSeq) {
        // This is a replay of an already-received event (buffer replay on connect)
        // Don't count as duplicate - this is expected behavior
      } else if (seq > conn.lastSeq + 1) {
        // Gap detected
        const gap = seq - conn.lastSeq - 1
        if (mode === "steady") {
          this.metrics.missing_sequences += gap
        } else {
          this.metrics.reconnect_gaps += gap
        }
      }
      // else: seq === conn.lastSeq + 1, perfect sequential delivery
    }

    // Out-of-order: seq < lastSeq and not a buffer replay
    if (seq < conn.lastSeq && conn.lastSeq > 0 && mode === "steady") {
      this.metrics.out_of_order++
    }
    if (seq < conn.lastSeq && conn.lastSeq > 0 && mode === "reconnect") {
      this.metrics.reconnect_order_violations++
    }

    conn.lastSeq = Math.max(conn.lastSeq, seq)
  }

  async disconnectAll(): Promise<void> {
    this.running = false

    for (const conn of this.connections) {
      try {
        conn.eventSource.close()
      } catch {}
      this.metrics.connections_dropped++
    }
    this.connections = []
  }

  async reconnectAll(reconnectDelayMs = 2000): Promise<void> {
    const connsToReconnect = [...this.connections]
    await this.disconnectAll()

    await sleep(reconnectDelayMs)

    this.running = true
    for (const oldConn of connsToReconnect) {
      const matchIdx = oldConn.id % this.config.matchIds.length
      const matchId = this.config.matchIds[matchIdx]

      try {
        const url = `${this.config.subUrl}/sub/${matchId}`
        const es = new EventSource(url)

        const conn: TrackedConnection = {
          id: oldConn.id,
          matchId,
          eventSource: es,
          lastSeq: 0,
          connected: false,
          connectTime: Date.now(),
          latenciesMs: [],
          isSlow: false,
        }

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            es.close()
            reject(new Error("reconnect timeout"))
          }, 10000)

          es.addEventListener("open", () => {
            clearTimeout(timeout)
            conn.connected = true
            resolve()
          })

          es.addEventListener("error", () => {
            clearTimeout(timeout)
            reject(new Error("reconnect failed"))
          })
        })

        es.addEventListener("message", (event: any) => {
          this.handleMessage(conn, event, "reconnect")
        })

        es.addEventListener("update", (event: any) => {
          this.handleMessage(conn, event, "reconnect")
        })

        es.addEventListener("ping", () => {})
        es.addEventListener("lobby", () => {})

        this.connections.push(conn)
      } catch {
        // Reconnect failed
      }
    }
  }

  async doLateJoin(matchId: string, headSeq: number): Promise<number> {
    const startTime = Date.now()

    return new Promise<number>((resolve) => {
      try {
        // Use dedicated history endpoint with nchan_subscriber_first_message oldest
        const url = `${this.config.subUrl}/history/${matchId}`
        const es = new EventSource(url)

        let caughtUp = false

        const checkTimeout = setTimeout(() => {
          if (!caughtUp) {
            es.close()
            resolve(-1)
          }
        }, 10000)

        const handler = (event: any) => {
          if (caughtUp) return
          try {
            const data = JSON.parse(event.data)
            if (data && typeof data.canonical_seq === "number" && data.canonical_seq >= headSeq) {
              caughtUp = true
              clearTimeout(checkTimeout)
              es.removeEventListener("message", handler)
              es.removeEventListener("update", handler)
              const latency = Date.now() - startTime
              this.metrics.late_join_latencies_ms.push(latency)
              es.close()
              resolve(latency)
            }
          } catch {}
        }

        es.addEventListener("message", handler)
        es.addEventListener("update", handler)
        es.addEventListener("ping", () => {})
        es.addEventListener("lobby", () => {})

        es.addEventListener("error", () => {
          clearTimeout(checkTimeout)
          if (!caughtUp) resolve(-1)
        })
      } catch {
        resolve(-1)
      }
    })
  }

  getMetrics(): WorkerMetrics {
    const mem = process.memoryUsage()
    const memMb = mem.heapUsed / (1024 * 1024)
    if (memMb > this.metrics.memory_mb_peak) {
      this.metrics.memory_mb_peak = memMb
    }

    if (this.eventLoopDelays.length > 0) {
      const sorted = [...this.eventLoopDelays].sort((a, b) => a - b)
      this.metrics.event_loop_delay_p99_ms = percentile(sorted, 99)
    }

    return { ...this.metrics }
  }

  measureEventLoop(): void {
    const start = process.hrtime.bigint()
    setImmediate(() => {
      const delay = Number(process.hrtime.bigint() - start) / 1_000_000
      this.eventLoopDelays.push(delay)
      if (this.eventLoopDelays.length > 1000) {
        this.eventLoopDelays.shift()
      }
    })
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
