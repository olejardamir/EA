// Package sse provides a byte-level incremental Server-Sent-Events frame
// parser for the loadgen client hot path. It mirrors the semantics of the
// TS sse-http-client.ts frame scanner (poc/runner/src/adapters/sse-http-client.ts):
//
//   - frames are terminated by a blank line ("\n" or "\r\n")
//   - recognized fields: "id:", "event:", "data:" (multiple data lines are
//     joined with "\n"), "retry:", ":" comment lines ignored
//   - field names must be followed by ":"; a leading space after the colon
//     is stripped (SSE spec, same as TS implementation)
//   - a frame with no data lines is still dispatched when terminated by a
//     blank line if it carries an id or event field
//
// The parser never allocates per-line in steady state: Feed copies into
// caller-provided reusable buffers only when a frame completes.
package sse

import (
	"bytes"
)

// Frame is one complete SSE frame.
type Frame struct {
	ID    []byte // nil when the frame carried no id field
	Event []byte // nil when the frame carried no event field
	Data  []byte // joined data payload; nil when no data lines present
}

// Parser accumulates field state across Feed calls until a blank line
// completes a frame.
type Parser struct {
	id       []byte
	event    []byte
	data     [][]byte
	dataLen  int
	sawField bool
}

// NewParser returns a ready-to-use parser.
func NewParser() *Parser { return &Parser{} }

// Reset clears partial frame state (used on reconnect).
func (p *Parser) Reset() {
	p.id = nil
	p.event = nil
	p.data = p.data[:0]
	p.dataLen = 0
	p.sawField = false
}

func stripCR(line []byte) []byte {
	if n := len(line); n > 0 && line[n-1] == '\r' {
		return line[:n-1]
	}
	return line
}

// Feed consumes one line (without trailing newline). When the line completes
// a frame it returns the frame and true. The returned slices alias internal
// buffers that are invalidated by the next Feed call — callers must copy any
// bytes they retain beyond immediate use (the client tracker extracts scalars
// synchronously and retains nothing).
func (p *Parser) Feed(line []byte) (Frame, bool) {
	line = stripCR(line)

	if len(line) == 0 {
		if !p.sawField {
			return Frame{}, false
		}
		f := Frame{ID: p.id, Event: p.event}
		if len(p.data) == 1 {
			f.Data = p.data[0]
		} else if len(p.data) > 1 {
			f.Data = bytes.Join(p.data, []byte("\n"))
		}
		p.id = nil
		p.event = nil
		p.data = p.data[:0]
		p.dataLen = 0
		p.sawField = false
		return f, true
	}

	// Comment line (":...") per SSE spec.
	if line[0] == ':' {
		return Frame{}, false
	}

	var name, value []byte
	if i := bytes.IndexByte(line, ':'); i >= 0 {
		name = line[:i]
		value = line[i+1:]
		if len(value) > 0 && value[0] == ' ' {
			value = value[1:]
		}
	} else {
		name = line
		value = nil
	}

	switch string(name) {
	case "id":
		p.id = append(p.id[:0], value...)
	case "event":
		p.event = append(p.event[:0], value...)
	case "data":
		buf := make([]byte, len(value))
		copy(buf, value)
		p.data = append(p.data, buf)
		p.dataLen += len(value)
	case "retry", "heartbeat":
		// accepted and ignored
	default:
		// unknown fields ignored per SSE spec
	}
	p.sawField = true
	return Frame{}, false
}

// ExtractCanonicalSeq scans a MatchEvent JSON data payload for
// "canonical_seq" without full JSON decoding. Returns (seq, true) when found.
// This is the light-mode hot path: it avoids encoding/json entirely.
func ExtractCanonicalSeq(data []byte) (uint64, bool) {
	key := []byte(`"canonical_seq":`)
	i := bytes.Index(data, key)
	if i < 0 {
		return 0, false
	}
	j := i + len(key)
	for j < len(data) && (data[j] == ' ') {
		j++
	}
	start := j
	if j < len(data) && (data[j] == '-' || data[j] == '+') {
		j++
	}
	for j < len(data) && data[j] >= '0' && data[j] <= '9' {
		j++
	}
	if j == start {
		return 0, false
	}
	var v uint64
	neg := false
	k := start
	if data[k] == '-' {
		neg = true
		k++
	} else if data[k] == '+' {
		k++
	}
	for ; k < j; k++ {
		d := uint64(data[k] - '0')
		if v > (^uint64(0)-d)/10 {
			return 0, false // overflow guard: reject absurd values rather than wrap
		}
		v = v*10 + d
	}
	if neg {
		return 0, false // canonical sequences are positive integers
	}
	return v, true
}

// ExtractStringField scans a JSON object for "key":"value" and returns the
// unescaped-lite value (no escape processing; deep validation uses encoding/json).
func ExtractStringField(data []byte, key string) ([]byte, bool) {
	pattern := []byte(`"` + key + `":"`)
	i := bytes.Index(data, pattern)
	if i < 0 {
		return nil, false
	}
	j := i + len(pattern)
	start := j
	for j < len(data) {
		c := data[j]
		if c == '\\' {
			j += 2
			continue
		}
		if c == '"' {
			return data[start:j], true
		}
		j++
	}
	return nil, false
}
