import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { parseSSEChunk } from "../adapters/sse-http-client.js"
import type { ParsedFrame } from "../adapters/sse-http-client.js"

function freshFrame(): ParsedFrame {
  return { data: [] }
}

describe("SSE parser edge cases", () => {
  it("handles empty buffer", () => {
    const frame = freshFrame()
    const { frames, remainder } = parseSSEChunk("", frame)
    assert.equal(frames.length, 0)
    assert.equal(remainder, "")
  })

  it("handles keepalive comments only", () => {
    const frame = freshFrame()
    const { frames } = parseSSEChunk(": keepalive\n: keepalive\n\n", frame)
    assert.equal(frames.length, 0)
  })

  it("handles very long data lines", () => {
    const frame = freshFrame()
    const longData = "x".repeat(10000)
    const { frames } = parseSSEChunk(`id: 1\ndata: ${longData}\n\n`, frame)
    assert.equal(frames.length, 1)
    assert.equal(frames[0].data, longData)
  })

  it("handles rapid sequential events", () => {
    const frame = freshFrame()
    const chunks = Array.from({ length: 100 }, (_, i) => `id: ${i + 1}\ndata: event-${i}\n\n`)
    const { frames } = parseSSEChunk(chunks.join(""), frame)
    assert.equal(frames.length, 100)
    assert.equal(frames[0].id, "1")
    assert.equal(frames[99].id, "100")
  })
})
