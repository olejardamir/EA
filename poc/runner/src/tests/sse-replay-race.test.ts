import { describe, it } from "node:test"
import assert from "node:assert/strict"
import http from "node:http"
import type { SubscriptionEvent } from "../ports/event-stream.js"
import { SSEHttpClient } from "../adapters/sse-http-client.js"

// ═══════════════════════════════════════════════════════════════
// §M3-RACE: SSE reconnect/replay race prevention.
//
// Nchan writes a Last-Event-ID replay burst immediately after HTTP
// connection establishment — frequently BEFORE ConnectionPool's
// wireEntry() registers its handler on the resolved subscription.
// The old data handler returned early when no handler was registered,
// silently discarding entire replay ranges. These tests drive a real
// local HTTP server so the pre-registration window is exercised with
// genuine socket timing, not a mocked subscription.
// ═══════════════════════════════════════════════════════════════

interface ScriptedFrame {
  id: string
  data: string
}

function sseFrame(f: ScriptedFrame): string {
  return `id: ${f.id}\nevent: match_event\ndata: ${f.data}\n\n`
}

interface ServerHandle {
  port: number
  close: () => Promise<void>
}

// Server that writes the scripted replay burst IMMEDIATELY on request —
// racing the client's post-connect handler registration on purpose.
function replayServer(
  initial: ScriptedFrame[],
  opts: { keepOpenMs?: number; endAfterInitial?: boolean; live?: ScriptedFrame[]; liveAfterMs?: number } = {},
): Promise<ServerHandle> {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" })
      // Write everything in the same tick as connection establishment.
      for (const f of initial) res.write(sseFrame(f))
      if (opts.live && opts.live.length > 0) {
        setTimeout(() => {
          for (const f of opts.live!) res.write(sseFrame(f))
        }, opts.liveAfterMs ?? 30)
      }
      if (opts.endAfterInitial) setTimeout(() => res.end(), opts.keepOpenMs ?? 20)
    })
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number }
      resolve({
        port: addr.port,
        close: () => new Promise((r) => server.close(() => r())),
      })
    })
  })
}

const tick = (ms = 25) => new Promise((r) => setTimeout(r, ms))

describe("§M3-RACE: SSE replay-before-registration", () => {
  it("buffers a replay frame that arrives before onEvent() and flushes it exactly once", async () => {
    const server = await replayServer([{ id: "r-1", data: "replay-one" }], { endAfterInitial: true, keepOpenMs: 200 })
    try {
      const client = new SSEHttpClient()
      const sub = await client.connect(`http://127.0.0.1:${server.port}/sub/m1`)
      // Deliberate registration gap: replay data has time to arrive first.
      await tick(50)

      const received: SubscriptionEvent[] = []
      sub.onEvent((evt) => received.push(evt))
      await tick(50)

      const messages = received.filter((e) => e.type === "message")
      assert.equal(messages.length, 1, "pre-registration replay frame must be delivered exactly once")
      assert.equal((messages[0] as any).event.data, "replay-one")
      sub.close()
    } finally {
      await server.close()
    }
  })

  it("flushes several pre-registration frames in arrival order", async () => {
    const initial = [1, 2, 3, 4, 5].map((i) => ({ id: `r-${i}`, data: `replay-${i}` }))
    const server = await replayServer(initial, { endAfterInitial: true, keepOpenMs: 200 })
    try {
      const client = new SSEHttpClient()
      const sub = await client.connect(`http://127.0.0.1:${server.port}/sub/m1`)
      await tick(50)

      const seqs: string[] = []
      sub.onEvent((evt) => {
        if (evt.type === "message") seqs.push((evt as any).event.data)
      })
      await tick(50)

      assert.deepEqual(seqs, ["replay-1", "replay-2", "replay-3", "replay-4", "replay-5"], "buffered frames must flush in order")
      sub.close()
    } finally {
      await server.close()
    }
  })

  it("does not duplicate frames across buffer flush and subsequent live delivery", async () => {
    const server = await replayServer(
      [{ id: "r-1", data: "replay-a" }, { id: "r-2", data: "replay-b" }],
      { live: [{ id: "live-1", data: "live-c" }, { id: "live-2", data: "live-d" }], liveAfterMs: 40 },
    )
    try {
      const client = new SSEHttpClient()
      const sub = await client.connect(`http://127.0.0.1:${server.port}/sub/m1`)
      await tick(50)

      const seen: string[] = []
      sub.onEvent((evt) => {
        if (evt.type === "message") seen.push((evt as any).event.id)
      })
      await tick(120)

      assert.deepEqual(seen, ["r-1", "r-2", "live-1", "live-2"], "each frame exactly once, buffered before live")

      // A second handler must see the identical sequence — no re-flush, no loss.
      const second: string[] = []
      sub.onEvent((evt) => {
        if (evt.type === "message") second.push((evt as any).event.id)
      })
      assert.deepEqual(second, [], "registering another handler must not re-deliver the buffer")
      sub.close()
    } finally {
      await server.close()
    }
  })

  it("retains Last-Event-ID from frames that arrived before registration", async () => {
    const server = await replayServer(
      [{ id: "r-1", data: "a" }, { id: "r-7", data: "b" }, { id: "r-9", data: "c" }],
      { endAfterInitial: true, keepOpenMs: 300 },
    )
    try {
      const client = new SSEHttpClient()
      const sub = await client.connect(`http://127.0.0.1:${server.port}/sub/m1`)
      await tick(50)

      assert.equal(sub.lastEventId, "r-9", "resume token must track pre-registration replay position")

      // And the retained token survives the flush itself.
      sub.onEvent(() => {})
      assert.equal(sub.lastEventId, "r-9")
      sub.close()
    } finally {
      await server.close()
    }
  })

  it("delivers a terminal stream-end that occurred before registration at registration time", async () => {
    const server = await replayServer([{ id: "r-1", data: "only" }], { endAfterInitial: true, keepOpenMs: 10 })
    try {
      const client = new SSEHttpClient()
      const sub = await client.connect(`http://127.0.0.1:${server.port}/sub/m1`)
      // Wait long enough for the server to have ended the stream unhandled.
      await tick(80)
      assert.ok(!sub.connected, "stream already ended")

      const kinds: string[] = []
      sub.onEvent((evt) => kinds.push(evt.type))
      await tick(20)

      assert.deepEqual(kinds, ["message", "error"], "buffered message then terminal event, in order")
      sub.close()
    } finally {
      await server.close()
    }
  })
})
