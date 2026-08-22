import http from "node:http"
import type { EventPublisher } from "../ports/event-publisher.js"

export interface PublishStats {
  attempts: number
  successes: number
  definiteFailures: number
  ambiguousFailures: number
}

// Generous outcome-certainty window: a publish with no response inside this
// bound is AMBIGUOUS (outcome unknown). Observed DUT accept stalls during
// subscriber storms reach ~4-5s and DO resolve — aborting at 5s converted
// resolvable waits into false ambiguities. The contract freezes
// ambiguous_failures=0, not this client-side bound.
const PUBLISH_TIMEOUT_MS = 15000

// Fresh connection per publish (Connection: close): exactly one publish per
// run was observed black-holed on a pooled keep-alive socket that never
// answered, while every same-window request on other sockets succeeded. A
// dead reused socket cannot be distinguished from a lost request, so the
// transport removes the reuse instead of risking duplicate replays.
// Loopback connect cost is negligible at the frozen <=58 publications/s.
const NO_KEEPALIVE_AGENT = new http.Agent({ keepAlive: false })

export class NchanHttpPublisher implements EventPublisher {
  private pubUrl: string
  private _stats: PublishStats = { attempts: 0, successes: 0, definiteFailures: 0, ambiguousFailures: 0 }

  constructor(pubUrl: string) {
    this.pubUrl = pubUrl.replace(/\/$/, "")
  }

  get stats(): Readonly<PublishStats> { return this._stats }

  async publish(channel: string, body: string, eventType: string): Promise<boolean> {
    this._stats.attempts++
    return new Promise<boolean>((resolve) => {
      const url = new URL(`${this.pubUrl}/pub/${channel}`)
      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname + url.search,
          method: "POST",
          agent: NO_KEEPALIVE_AGENT,
          headers: {
            "Content-Type": "text/plain",
            "X-Event-Source-Event": eventType,
            "Content-Length": Buffer.byteLength(body),
            Connection: "close",
          },
          signal: AbortSignal.timeout(PUBLISH_TIMEOUT_MS),
        },
        (res) => {
          res.resume()
          res.on("close", () => {
            // §BM: Nchan v1.3.8: 200=accepted, 4xx/5xx=reject (definite)
            if (res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300) {
              this._stats.successes++
              resolve(true)
            } else {
              this._stats.definiteFailures++
              resolve(false)
            }
          })
        },
      )
      req.on("error", (err: Error) => {
        // §BM: timeout-after-connect (ambiguous) vs connect failure (definite)
        const isTimeout = err.name === "TimeoutError" ||
          err.message.includes("abort") ||
          err.message.includes("timeout")
        // Always-on trace: an ambiguity is a run-level gate failure, so its
        // channel and timestamp must be attributable in every log.
        console.log(`PUBAMBIG ${JSON.stringify({ t: Date.now(), channel, kind: isTimeout ? "timeout" : "error", msg: err.message })}`)
        if (isTimeout) {
          this._stats.ambiguousFailures++
        } else {
          this._stats.definiteFailures++
        }
        resolve(false)
      })
      req.end(body)
    })
  }

  async healthcheck(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const url = new URL(`${this.pubUrl}/pub/healthcheck`)
      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: "GET",
          agent: NO_KEEPALIVE_AGENT,
          signal: AbortSignal.timeout(3000),
        },
        (res) => {
          res.resume()
          res.on("close", () => resolve(res.statusCode === 200))
        },
      )
      req.on("error", () => resolve(false))
      req.end()
    })
  }
}
