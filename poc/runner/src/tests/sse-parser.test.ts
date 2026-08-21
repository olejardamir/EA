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

  // §M3-GEN: manual-scan parser must preserve exact split-based semantics.
  describe("manual-scan semantic parity", () => {
    it("strips a lone trailing \\r from an unterminated remainder", () => {
      const frame = freshFrame()
      const { frames, remainder } = parseSSEChunk("id: 1\ndata: hel\r", frame)
      assert.equal(frames.length, 0)
      assert.equal(remainder, "data: hel")
      assert.equal(frame.id, "1")
      // Continuation parses identically to never having seen the split \r.
      const { frames: f2 } = parseSSEChunk(remainder + "lo\n\n", frame)
      assert.equal(f2.length, 1)
      assert.equal(f2[0].data, "hello")
    })

    it("lone CR does not terminate a line; exactly one terminal \\r strips per segment", () => {
      const frame = freshFrame()
      const { frames, remainder } = parseSSEChunk("id: 1\rdata: x\r\r", frame)
      // No \n anywhere: the whole buffer is one incomplete segment; only its
      // final \r is stripped from the buffered remainder.
      assert.equal(frames.length, 0)
      assert.equal(remainder, "id: 1\rdata: x\r")
      const { frames: f2 } = parseSSEChunk(remainder + "\n\n", frame)
      assert.equal(f2.length, 0)
      // The embedded \r survives inside the parsed id value, matching old
      // behavior; no data lines exist so nothing flushes.
      assert.equal(frame.id, "1\rdata: x")
    })

    it("double \\r before \\n strips only one", () => {
      const frame = freshFrame()
      const { frames } = parseSSEChunk("data: v\r\r\n\n", frame)
      assert.equal(frames.length, 1)
      assert.equal(frames[0].data, "v\r")
    })

    it("flushes on the implicit final empty segment after a trailing newline", () => {
      const frame = freshFrame()
      const { frames, remainder } = parseSSEChunk("id: 7\ndata: v\n", frame)
      assert.equal(frames.length, 1)
      assert.equal(frames[0].id, "7")
      assert.equal(remainder, "")
    })

    it("bare field line without colon contributes an empty value", () => {
      const frame = freshFrame()
      const { frames } = parseSSEChunk("id\ndata\n\n", frame)
      assert.equal(frames.length, 1)
      assert.equal(frames[0].id, "")
      assert.equal(frames[0].data, "")
    })

    it("no-colon line with trailing whitespace trims the field name", () => {
      const frame = freshFrame()
      const { frames } = parseSSEChunk("data   \n\n", frame)
      assert.equal(frames.length, 1)
      assert.equal(frames[0].data, "")
    })

    it("skips exactly one optional space after the colon", () => {
      const frame = freshFrame()
      const { frames } = parseSSEChunk("data:  two-spaces\n\n", frame)
      assert.equal(frames.length, 1)
      assert.equal(frames[0].data, " two-spaces")
    })

    it("field name with internal space does not match a known field", () => {
      const frame = freshFrame()
      const { frames } = parseSSEChunk("data :x\n\ndata:y\n\n", frame)
      assert.equal(frames.length, 1)
      assert.equal(frames[0].data, "y")
    })

    it("unknown fields are ignored entirely", () => {
      const frame = freshFrame()
      const { frames } = parseSSEChunk("retry: 100\nnoise: zzz\ndata: q\n\n", frame)
      assert.equal(frames.length, 1)
      assert.equal(frames[0].data, "q")
    })

    it("comment-only chunk leaves no residue or frame state", () => {
      const frame = freshFrame()
      const { frames, remainder } = parseSSEChunk(": ping\n: pong\n", frame)
      assert.equal(frames.length, 0)
      assert.equal(remainder, "")
    })

    it("CRLF split across chunk boundary still strips the CR", () => {
      const frame = freshFrame()
      const r1 = parseSSEChunk("id: 3\ndata: abc\r", frame)
      assert.equal(r1.remainder, "data: abc")
      const r2 = parseSSEChunk(r1.remainder + "\nevent: e\n\n", frame)
      assert.equal(r2.frames.length, 1)
      assert.equal(r2.frames[0].id, "3")
      assert.equal(r2.frames[0].event, "e")
      assert.equal(r2.frames[0].data, "abc")
    })
  })
})
