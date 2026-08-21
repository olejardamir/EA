import http from "node:http"
import type { EventStream, Subscription, SubscriptionEvent, SSEEvent } from "../ports/event-stream.js"

interface ParsedFrame {
  id?: string
  event?: string
  data: string[]
}

// §M3-GEN: Manual scan replaces per-chunk split("\n") + per-line regex.
// Semantics preserved exactly: one trailing \r stripped per complete line,
// partial trailing line buffered as remainder WITH its trailing \r stripped
// (matches the previous split-based behavior), empty line flushes a frame
// only when data lines exist, ":" comments skipped, first colon splits
// field/value, exactly one optional space after the colon is skipped,
// no-colon lines are trimEnd()'d with an empty value, unknown fields ignored.
function processSSELineRange(buf: string, s: number, e: number, frame: ParsedFrame, frames: SSEEvent[]): void {
  if (s === e) {
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
    return
  }
  if (buf.charCodeAt(s) === 58 /* ':': comment line */) return

  let colonIdx = -1
  for (let i = s + 1; i < e; i++) {
    if (buf.charCodeAt(i) === 58 /* ':' */) { colonIdx = i; break }
  }

  if (colonIdx !== -1) {
    // §M3-GEN: dispatch on the field name via char codes without allocating
    // a substring per line ("data" dominates real traffic). Unknown fields
    // fall through to the string path for exact parity.
    const flen = colonIdx - s
    if (flen === 4
      && buf.charCodeAt(s) === 100 && buf.charCodeAt(s + 1) === 97
      && buf.charCodeAt(s + 2) === 116 && buf.charCodeAt(s + 3) === 97) {
      const vs = colonIdx + 2 <= e && buf.charCodeAt(colonIdx + 1) === 32 ? colonIdx + 2 : colonIdx + 1
      frame.data.push(buf.slice(vs, e))
      return
    }
    if (flen === 2 && buf.charCodeAt(s) === 105 && buf.charCodeAt(s + 1) === 100) {
      const vs = colonIdx + 2 <= e && buf.charCodeAt(colonIdx + 1) === 32 ? colonIdx + 2 : colonIdx + 1
      frame.id = buf.slice(vs, e)
      return
    }
    if (flen === 5
      && buf.charCodeAt(s) === 101 && buf.charCodeAt(s + 1) === 118
      && buf.charCodeAt(s + 2) === 101 && buf.charCodeAt(s + 3) === 110
      && buf.charCodeAt(s + 4) === 116) {
      const vs = colonIdx + 2 <= e && buf.charCodeAt(colonIdx + 1) === 32 ? colonIdx + 2 : colonIdx + 1
      frame.event = buf.slice(vs, e)
      return
    }
    return // known-field mismatch impossible here; unknown fields ignored
  }

  let field: string
  let valueStart: number
  if (colonIdx === -1) {
    field = buf.slice(s, e).trimEnd()
    valueStart = e
  } else {
    field = buf.slice(s, colonIdx)
    valueStart = colonIdx + 1
    if (valueStart < e && buf.charCodeAt(valueStart) === 32 /* ' ' */) valueStart++
  }

  switch (field) {
    case "id":
      frame.id = buf.slice(valueStart, e)
      break
    case "event":
      frame.event = buf.slice(valueStart, e)
      break
    case "data":
      frame.data.push(buf.slice(valueStart, e))
      break
  }
}

export function parseSSEChunk(buffer: string, frame: ParsedFrame): { frames: SSEEvent[]; remainder: string; error: boolean } {
  const frames: SSEEvent[] = []
  const len = buffer.length
  let pos = 0

  while (pos < len) {
    const nl = buffer.indexOf("\n", pos)
    if (nl === -1) break
    let end = nl
    if (end > pos && buffer.charCodeAt(end - 1) === 13 /* '\r' */) end--
    processSSELineRange(buffer, pos, end, frame, frames)
    pos = nl + 1
  }
  // A trailing terminator implies one final empty split segment, which the
  // previous implementation still ran through the empty-line flush check.
  if (len > 0 && buffer.charCodeAt(len - 1) === 10 /* '\n' */) {
    processSSELineRange(buffer, len, len, frame, frames)
  }

  let remainder = ""
  if (pos < len) {
    let rEnd = len
    if (buffer.charCodeAt(rEnd - 1) === 13 /* '\r' */) rEnd--
    remainder = rEnd > pos ? buffer.slice(pos, rEnd) : ""
  }
  return { frames, remainder, error: false }
}

class SSESubscription implements Subscription {
  private _connected = false
  private _lastEventId: string | null = null
  private _handlers: Array<(event: SubscriptionEvent) => void> = []
  private _res: http.IncomingMessage | null = null
  private _buffer = ""
  private _frame: ParsedFrame = { data: [] }
  private _closed = false
  private _decoder = new TextDecoder("utf-8", { fatal: false })
  private _onParseError?: () => void
  // §M3-RACE: Frames parsed between HTTP response start and the first
  // application-handler registration. Nchan writes a Last-Event-ID replay burst
  // immediately after connection establishment — often before ConnectionPool's
  // wireEntry() has run — so dropping unhandled data silently discarded entire
  // replay ranges. Buffered events are flushed exactly once, in arrival order,
  // by the first onEvent() call. The window is bounded by construction (the
  // pool registers its handler immediately after connect resolves); close()
  // clears the buffer.
  private _pendingEvents: SubscriptionEvent[] = []

  constructor(onParseError?: () => void) {
    this._onParseError = onParseError
  }

  get connected(): boolean {
    return this._connected && !this._closed
  }

  get lastEventId(): string | null {
    return this._lastEventId
  }

  // §3.17: Support multiple handlers — each onEvent call adds a handler.
  // This allows the pool and ThrottledSubscription to both receive events.
  onEvent(handler: (event: SubscriptionEvent) => void): void {
    this._handlers.push(handler)
    // §M3-RACE: First application handler attached — deliver everything that
    // arrived before registration, exactly once, in order, before any newer
    // live chunk. Swapping the array out first keeps a reentrant onEvent()
    // from triggering a second flush.
    if (this._handlers.length === 1 && this._pendingEvents.length > 0) {
      const pending = this._pendingEvents
      this._pendingEvents = []
      for (const evt of pending) {
        for (const h of [...this._handlers]) h(evt)
      }
    }
  }

  // §3.17: Return the last-registered handler (for backwards compatibility)
  getEventHandler(): ((event: SubscriptionEvent) => void) | null {
    return this._handlers.length > 0 ? this._handlers[this._handlers.length - 1] : null
  }

  // §M3-HVR: Remove a specific handler (slow-consumer replay probe collector teardown)
  removeEventHandler(handler: (event: SubscriptionEvent) => void): void {
    const idx = this._handlers.indexOf(handler)
    if (idx >= 0) this._handlers.splice(idx, 1)
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
    this._pendingEvents = []
    this._res?.destroy()
  }

  // §M3-RACE: Shared dispatch path for parsed messages and terminal events.
  // With no handler registered yet, events are buffered instead of dropped;
  // sequence accounting and Last-Event-ID tracking stay unconditional.
  // §M3-GEN: single-handler fast path avoids the per-frame spread copy
  // (~62k allocations/s per shard at 25k viewers); multi-handler dispatch
  // keeps the snapshot iteration so handlers added/removed DURING a dispatch
  // observe the same stable-iteration semantics as before.
  private _dispatchOrBuffer(evt: SubscriptionEvent): void {
    if (this._closed) return
    const handlers = this._handlers
    if (handlers.length === 0) {
      this._pendingEvents.push(evt)
      return
    }
    if (handlers.length === 1) {
      handlers[0](evt)
      return
    }
    for (const handler of [...handlers]) handler(evt)
  }

  attachResponse(res: http.IncomingMessage): void {
    this._res = res
    this._connected = true

    res.on("data", (chunk: Buffer) => {
      if (this._closed) return

      // §v2.1.1 drift item 12: capture wire-arrival time before any parsing or
      // dispatch work so delivery latency reflects transport receipt, not
      // generator event-loop scheduling.
      const arrivedAtMs = Date.now()

      try {
        // §AF: use TextDecoder with stream:true to handle multibyte chars
        // split across TCP chunks (e.g. 4-byte CJK chars at chunk boundary)
        this._buffer += this._decoder.decode(chunk, { stream: true })

        // §BJ: Detect null bytes indicating binary corruption in SSE stream
        if (this._buffer.includes("\0")) {
          this._onParseError?.()
          this._buffer = ""
          return
        }

        const { frames, remainder } = parseSSEChunk(this._buffer, this._frame)
        this._buffer = remainder

        for (const frame of frames) {
          if (frame.id !== undefined && frame.id !== null) {
            this._lastEventId = frame.id
          }
          // §3.17/§M3-RACE: Dispatch to all registered handlers, or buffer
          // until the first one registers — never drop.
          this._dispatchOrBuffer({ type: "message", event: frame, received_at_ms: arrivedAtMs })
        }
      } catch {
        // §BJ: Parse failure — invoke error callback
        this._onParseError?.()
      }
    })

    res.on("end", () => {
      this._connected = false
      // §M3-RACE: Terminal attribution must survive the pre-registration window
      // too — a stream that ends before wireEntry() still has to reach the pool.
      if (!this._closed) {
        this._dispatchOrBuffer({ type: "error", error: new Error("stream ended") })
      }
    })

    res.on("error", (err) => {
      this._connected = false
      if (!this._closed) {
        this._dispatchOrBuffer({ type: "error", error: err })
      }
    })
  }
}

export class SSEHttpClient implements EventStream {
  connect(url: string, lastEventId?: string | null, onParseError?: () => void): Promise<Subscription> {
    return new Promise((resolve, reject) => {
      const sub = new SSESubscription(onParseError)
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

        // §AF: Validate Content-Type is text/event-stream
        const contentType = res.headers["content-type"] ?? ""
        if (!contentType.includes("text/event-stream")) {
          res.destroy()
          reject(new Error(`Invalid Content-Type: ${contentType} (expected text/event-stream)`))
          return
        }

        sub.attachResponse(res)
        // §6.30: Clear handshake timeout once HTTP response is streaming.
        // The 10s connect timeout must not kill a healthy long-lived SSE stream
        // when Nchan heartbeat interval is 15s.
        req.setTimeout(0)
        req.removeAllListeners("timeout")
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
