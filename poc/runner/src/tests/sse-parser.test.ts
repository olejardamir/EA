import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { parseSSEChunk } from "../adapters/sse-http-client.js"
import type { ParsedFrame } from "../adapters/sse-http-client.js"

function freshFrame(): ParsedFrame {
  return { data: [] }
}

describe("SSE Parser", () => {
  it("parses a normal event", () => {
    const frame = freshFrame()
    const { frames, remainder } = parseSSEChunk("id: 1\nevent: update\ndata: hello\n\n", frame)
    assert.equal(remainder, "")
    assert.equal(frames.length, 1)
    assert.equal(frames[0].id, "1")
    assert.equal(frames[0].event, "update")
    assert.equal(frames[0].data, "hello")
  })

  it("parses fragmented chunks across calls", () => {
    const frame = freshFrame()

    // Chunk 1: "id: 12\neve" - id is parsed, "eve" is buffered as remainder
    const { frames: f1, remainder: r1 } = parseSSEChunk("id: 12\neve", frame)
    assert.equal(f1.length, 0)
    assert.equal(r1, "eve")
    assert.equal(frame.id, "12")

    // Chunk 2: remainder + "nt: update\ndata: {\"sco" - event field parsed, data is partial
    const { frames: f2, remainder: r2 } = parseSSEChunk(r1 + "nt: update\ndata: {\"sco", frame)
    assert.equal(f2.length, 0)
    assert.equal(frame.event, "update")

    // Chunk 3: remainder + "re\": 1}\n\n" completes the data field
    const { frames: f3 } = parseSSEChunk(r2 + 're": 1}\n\n', frame)
    assert.equal(f3.length, 1)
    assert.equal(f3[0].id, "12")
    assert.equal(f3[0].event, "update")
    assert.equal(f3[0].data, '{"score": 1}')
  })

  it("parses multiple events in one chunk", () => {
    const frame = freshFrame()
    const { frames } = parseSSEChunk("id: 1\ndata: a\n\nid: 2\ndata: b\n\n", frame)
    assert.equal(frames.length, 2)
    assert.equal(frames[0].id, "1")
    assert.equal(frames[0].data, "a")
    assert.equal(frames[1].id, "2")
    assert.equal(frames[1].data, "b")
  })

  it("parses multiline data", () => {
    const frame = freshFrame()
    const { frames } = parseSSEChunk("id: 1\ndata: line1\ndata: line2\n\n", frame)
    assert.equal(frames.length, 1)
    assert.equal(frames[0].data, "line1\nline2")
  })

  it("ignores comments", () => {
    const frame = freshFrame()
    const { frames } = parseSSEChunk(": keepalive\nid: 1\ndata: hello\n\n", frame)
    assert.equal(frames.length, 1)
    assert.equal(frames[0].id, "1")
    assert.equal(frames[0].data, "hello")
  })

  it("handles CRLF line endings", () => {
    const frame = freshFrame()
    const { frames } = parseSSEChunk("id: 1\r\ndata: hello\r\n\r\n", frame)
    assert.equal(frames.length, 1)
    assert.equal(frames[0].id, "1")
    assert.equal(frames[0].data, "hello")
  })

  it("handles missing trailing newline (truly incomplete)", () => {
    const frame = freshFrame()
    // "id: 1" is complete (before the \n), "data: hello" is the incomplete last line
    const { frames, remainder } = parseSSEChunk("id: 1\ndata: hello", frame)
    assert.equal(frames.length, 0)
    // remainder is just the last incomplete line; id was already parsed into frame state
    assert.equal(remainder, "data: hello")
    assert.equal(frame.id, "1") // id is preserved in frame state for next call
  })

  it("handles trailing newline after data (completes the frame)", () => {
    const frame = freshFrame()
    const { frames } = parseSSEChunk("id: 1\ndata: hello\n", frame)
    assert.equal(frames.length, 1)
    assert.equal(frames[0].data, "hello")
  })

  it("defaults event type to message", () => {
    const frame = freshFrame()
    const { frames } = parseSSEChunk("id: 1\ndata: hello\n\n", frame)
    assert.equal(frames[0].event, "message")
  })

  it("parses data with colon", () => {
    const frame = freshFrame()
    const { frames } = parseSSEChunk('id: 1\ndata: {"key":"value"}\n\n', frame)
    assert.equal(frames[0].data, '{"key":"value"}')
  })

  it("handles empty data field", () => {
    const frame = freshFrame()
    const { frames } = parseSSEChunk("id: 1\ndata:\n\n", frame)
    assert.equal(frames.length, 1)
    assert.equal(frames[0].data, "")
  })
})
