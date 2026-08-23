import http from "node:http"
import type { EventPublisher } from "../ports/event-publisher.js"
import type { PublishStats } from "./nchan-http-publisher.js"

const PUBLISH_TIMEOUT_MS = 15000
const NO_KEEPALIVE_AGENT = new http.Agent({ keepAlive: false })

function postOnce(urlStr: string, body: string, eventType: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const url = new URL(urlStr)
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
        res.on("close", () => resolve(res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300))
      },
    )
    req.on("error", () => resolve(false))
    req.end(body)
  })
}

export class RoutedNchanPublisher implements EventPublisher {
  private fallbackUrl: string
  private routes: Record<string, string[]>
  private lobbyUrls: string[]
  private _stats: PublishStats = { attempts: 0, successes: 0, definiteFailures: 0, ambiguousFailures: 0 }

  constructor(fallbackUrl: string, routes: Record<string, string[]>) {
    this.fallbackUrl = fallbackUrl.replace(/\/$/, "")
    this.routes = routes
    const lobby = routes["lobby"]
    this.lobbyUrls = Array.isArray(lobby) ? lobby : []
  }

  get stats(): Readonly<PublishStats> { return this._stats }

  async publish(channel: string, body: string, eventType: string): Promise<boolean> {
    this._stats.attempts++
    let urls: string[]
    if (channel === "lobby") {
      urls = this.lobbyUrls.length > 0 ? this.lobbyUrls.map((u) => `${u.replace(/\/$/, "")}/pub/${channel}`) : [`${this.fallbackUrl}/pub/${channel}`]
    } else {
      const mapped = this.routes[channel]
      if (Array.isArray(mapped) && mapped.length > 0) {
        urls = mapped.map((u) => `${u.replace(/\/$/, "")}/pub/${channel}`)
      } else {
        urls = [`${this.fallbackUrl}/pub/${channel}`]
      }
    }
    const results = await Promise.all(urls.map((u) => postOnce(u, body, eventType)))
    const ok = results.every(Boolean)
    if (ok) this._stats.successes++
    else this._stats.definiteFailures++
    return ok
  }

  async healthcheck(): Promise<boolean> {
    const urls = this.lobbyUrls.length > 0 ? this.lobbyUrls : [this.fallbackUrl]
    const checks = await Promise.all(urls.slice(0, 2).map((base) => new Promise<boolean>((resolve) => {
      const url = new URL(`${base.replace(/\/$/, "")}/pub/healthcheck`)
      const req = http.request({ hostname: url.hostname, port: url.port, path: url.pathname, method: "GET", agent: NO_KEEPALIVE_AGENT, signal: AbortSignal.timeout(3000) }, (res) => { res.resume(); res.on("close", () => resolve(res.statusCode === 200)) })
      req.on("error", () => resolve(false))
      req.end()
    })))
    return checks.every(Boolean)
  }
}
