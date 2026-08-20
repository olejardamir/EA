import http from "node:http"
import type { EventStream, Subscription, SubscriptionEvent, SSEEvent } from "../ports/event-stream.js"

interface ParsedFrame {
  id?: string
  event?: string
  data: string[]
}

export function parseSSEChunk(buffer: string, frame: ParsedFrame): { frames: SSEEvent[]; remainder: string } {
  const frames: SSEEvent[] = []
  const lines = buffer.split("\n")

  let remainder = ""
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, "")

    if (i === lines.length - 1 && !buffer.endsWith("\n")) {
      remainder = line
      continue
    }

    if (line === "") {
      if (frame.data.length > 0) {
        frames.push({
          id: frame.id ?? null,
          event: frame.event ?? "message",
          data: frame.data.join("\n"),
        })
        frame.id = undefined
        frame.event = undefined
        frame.data = []
      }
      continue
    }

    if (line.startsWith(":")) continue

    const colonIdx = line.indexOf(":")
    let field: string
    let value: string

    if (colonIdx === -1) {
      field = line.trimEnd()
      value = ""
    } else {
      field = line.substring(0, colonIdx)
      value = line[colonIdx + 1] === " " ? line.substring(colonIdx + 2) : line.substring(colonIdx + 1)
    }

    switch (field) {
      case "id":
        frame.id = value
        break
      case "event":
        frame.event = value
        break
      case "data":
        frame.data.push(value)
        break
    }
  }

  return { frames, remainder }
}

class SSESubscription implements Subscription {
  private _connected = false
  private _lastEventId: string | null = null
  private _handler: ((event: SubscriptionEvent) => void) | null = null
  private _res: http.IncomingMessage | null = null
  private _buffer = ""
  private _frame: ParsedFrame = { data: [] }
  private _closed = false

  get connected(): boolean {
    return this._connected && !this._closed
  }

  get lastEventId(): string | null {
    return this._lastEventId
  }

  onEvent(handler: (event: SubscriptionEvent) => void): void {
    this._handler = handler
  }

  pause(): void {
    this._res?.pause()
  }

  resume(): void {
    this._res?.resume()
  }

  close(): void {
    if (this._closed) return
    this._closed = true
    this._connected = false
    this._res?.destroy()
  }

  attachResponse(res: http.IncomingMessage): void {
    this._res = res
    this._connected = true

    res.on("data", (chunk: Buffer) => {
      if (this._closed || !this._handler) return

      this._buffer += chunk.toString("utf-8")
      const { frames, remainder } = parseSSEChunk(this._buffer, this._frame)
      this._buffer = remainder

      for (const frame of frames) {
        if (frame.id !== undefined && frame.id !== null) {
          this._lastEventId = frame.id
        }
        this._handler({ type: "message", event: frame })
      }
    })

    res.on("end", () => {
      this._connected = false
      if (!this._closed && this._handler) {
        this._handler({ type: "error", error: new Error("stream ended") })
      }
    })

    res.on("error", (err) => {
      this._connected = false
      if (!this._closed && this._handler) {
        this._handler({ type: "error", error: err })
      }
    })
  }
}

export class SSEHttpClient implements EventStream {
  connect(url: string, lastEventId?: string | null): Promise<Subscription> {
    return new Promise((resolve, reject) => {
      const sub = new SSESubscription()
      const parsedUrl = new URL(url)

      const options: http.RequestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search,
        method: "GET",
        headers: {
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          ...(lastEventId ? { "Last-Event-ID": lastEventId } : {}),
        },
      }

      const req = http.request(options, (res) => {
        if (res.statusCode !== 200) {
          res.destroy()
          reject(new Error(`HTTP ${res.statusCode}`))
          return
        }

        sub.attachResponse(res)
        resolve(sub)
      })

      req.on("error", (err) => {
        reject(err)
      })

      req.setTimeout(10000, () => {
        req.destroy(new Error("connect timeout"))
      })

      req.end()
    })
  }
}

export type { ParsedFrame }
