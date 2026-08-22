import type { EventPublisher } from "../ports/event-publisher.js"

export interface PublishStats {
  attempts: number
  successes: number
  definiteFailures: number
  ambiguousFailures: number
}

export class NchanHttpPublisher implements EventPublisher {
  private pubUrl: string
  private _stats: PublishStats = { attempts: 0, successes: 0, definiteFailures: 0, ambiguousFailures: 0 }

  constructor(pubUrl: string) {
    this.pubUrl = pubUrl
  }

  get stats(): Readonly<PublishStats> { return this._stats }

  async publish(channel: string, body: string, eventType: string): Promise<boolean> {
    this._stats.attempts++
    try {
      const resp = await fetch(`${this.pubUrl}/pub/${channel}`, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
          "X-Event-Source-Event": eventType,
        },
        body,
        // Generous outcome-certainty window: a publish with no response inside
      // this bound is AMBIGUOUS (outcome unknown). Observed DUT accept stalls
      // during subscriber storms reach ~4-5s and DO resolve — aborting at 5s
      // converted resolvable waits into false ambiguities. The contract
      // freezes ambiguous_failures=0, not this client-side bound.
      signal: AbortSignal.timeout(15000),
      })
      if (resp.ok) {
        this._stats.successes++
        return true
      }
      // §BM: Non-2xx is a definite failure (Nchan v1.3.8: 200=accepted, 4xx/5xx=reject)
      this._stats.definiteFailures++
      return false
    } catch (err) {
      // §BM: Distinguish timeout-after-connect (ambiguous) from connect failure (definite)
      const isTimeout = err instanceof Error && (
        err.name === "TimeoutError" ||
        err.message.includes("abort") ||
        err.message.includes("timeout")
      )
      if (isTimeout) {
        this._stats.ambiguousFailures++
      } else {
        this._stats.definiteFailures++
      }
      return false
    }
  }

  async healthcheck(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.pubUrl}/pub/healthcheck`, { signal: AbortSignal.timeout(3000) })
      return resp.ok
    } catch {
      return false
    }
  }
}
