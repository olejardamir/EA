package sse

import (
	"bytes"
	"strings"
	"testing"
)

func feedAll(p *Parser, input string) []Frame {
	var frames []Frame
	for _, line := range strings.SplitAfter(input, "\n") {
		if line == "" {
			continue
		}
		line = strings.TrimSuffix(line, "\n")
		if f, ok := p.Feed([]byte(line)); ok {
			frames = append(frames, f)
		}
	}
	return frames
}

func TestBasicFrameIDAndData(t *testing.T) {
	p := NewParser()
	frames := feedAll(p, "id: 42\ndata: {\"a\":1}\n\n")
	if len(frames) != 1 {
		t.Fatalf("got %d frames, want 1", len(frames))
	}
	f := frames[0]
	if string(f.ID) != "42" {
		t.Errorf("id = %q, want 42", f.ID)
	}
	if string(f.Data) != `{"a":1}` {
		t.Errorf("data = %q", f.Data)
	}
}

func TestCRLFLineEndings(t *testing.T) {
	p := NewParser()
	frames := feedAll(p, "id: 7\r\ndata: x\r\n\r\n")
	if len(frames) != 1 {
		t.Fatalf("got %d frames, want 1", len(frames))
	}
	if string(frames[0].ID) != "7" || string(frames[0].Data) != "x" {
		t.Errorf("frame = id:%q data:%q", frames[0].ID, frames[0].Data)
	}
}

func TestMultipleDataLinesJoinedWithNewline(t *testing.T) {
	p := NewParser()
	frames := feedAll(p, "id: 1\ndata: a\ndata: b\n\n")
	if len(frames) != 1 || string(frames[0].Data) != "a\nb" {
		t.Fatalf("want joined data %q, got %#v", "a\\nb", frames)
	}
}

func TestCommentLinesIgnored(t *testing.T) {
	p := NewParser()
	if f, ok := p.Feed([]byte(": heartbeat")); ok {
		t.Fatalf("comment dispatched frame %+v", f)
	}
	frames := feedAll(p, ": ping\nid: 3\ndata: z\n\n")
	if len(frames) != 1 || string(frames[0].ID) != "3" {
		t.Fatalf("comment broke frame parse: %#v", frames)
	}
}

func TestLeadingSpaceAfterColonStripped(t *testing.T) {
	p := NewParser()
	frames := feedAll(p, "id:9\ndata:    padded\n\n")
	if len(frames) != 1 || string(frames[0].Data) != "   padded" {
		t.Fatalf("only one leading space must be stripped: %#v", frames)
	}
}

func TestBlankLineWithoutFieldsDispatchesNothing(t *testing.T) {
	p := NewParser()
	for _, line := range []string{"", "", ""} {
		if f, ok := p.Feed([]byte(line)); ok {
			t.Fatalf("empty dispatch: %+v", f)
		}
	}
}

func TestRetryAndUnknownFieldsIgnored(t *testing.T) {
	p := NewParser()
	frames := feedAll(p, "retry: 1500\nx-unknown: v\nid: 5\ndata: d\n\n")
	if len(frames) != 1 || string(frames[0].ID) != "5" {
		t.Fatalf("unexpected: %#v", frames)
	}
}

func TestResetClearsPartialState(t *testing.T) {
	p := NewParser()
	p.Feed([]byte("id: 99"))
	p.Reset()
	if f, ok := p.Feed([]byte("")); ok {
		t.Fatalf("reset left partial frame: %+v", f)
	}
	frames := feedAll(p, "id: 1\ndata: q\n\n")
	if len(frames) != 1 || string(frames[0].ID) != "1" {
		t.Fatalf("post-reset parse broken: %#v", frames)
	}
}

func TestFieldValueWithoutSpace(t *testing.T) {
	p := NewParser()
	frames := feedAll(p, "id:12\ndata:nospace\n\n")
	if len(frames) != 1 || string(frames[0].Data) != "nospace" || string(frames[0].ID) != "12" {
		t.Fatalf("no-space values broken: %#v", frames)
	}
}

func TestExtractCanonicalSeq(t *testing.T) {
	cases := []struct {
		in   string
		want uint64
		ok   bool
	}{
		{`{"canonical_seq":123,"x":1}`, 123, true},
		{`{"canonical_seq": 456}`, 456, true},
		{`{"canonical_seq":0}`, 0, true},
		{`{"canonical_seq":-5}`, 0, false}, // negatives rejected
		{`{"other":1}`, 0, false},
		{`{"canonical_seq":"12"}`, 0, false}, // quoted value is not scanned past the quote
		{``, 0, false},
		{`{"canonical_seq":99999999999999999999999}`, 0, false}, // overflow guard
	}
	for _, tc := range cases {
		got, ok := ExtractCanonicalSeq([]byte(tc.in))
		if ok != tc.ok || (ok && got != tc.want) {
			t.Errorf("ExtractCanonicalSeq(%q) = (%d,%v), want (%d,%v)", tc.in, got, ok, tc.want, tc.ok)
		}
	}
}

func TestExtractStringField(t *testing.T) {
	in := []byte(`{"publish_timestamp":"2026-01-01T00:00:00.000Z","esc":"a\"b","after":1}`)
	v, ok := ExtractStringField(in, "publish_timestamp")
	if !ok || string(v) != "2026-01-01T00:00:00.000Z" {
		t.Fatalf("plain extract failed: %q %v", v, ok)
	}
	v, ok = ExtractStringField(in, "esc")
	if !ok || !bytes.HasPrefix(v, []byte(`a\`)) {
		t.Fatalf("escape handling wrong: %q %v", v, ok)
	}
	if _, ok := ExtractStringField(in, "missing"); ok {
		t.Fatal("missing key must not match")
	}
}

func TestExtractCanonicalSeqHotPathAllocation(t *testing.T) {
	data := []byte(`{"match_id":"match_001","canonical_seq":987654,"event_type":"goal"}`)
	allocs := testing.AllocsPerRun(1000, func() {
		if _, ok := ExtractCanonicalSeq(data); !ok {
			t.Fatal("parse failed")
		}
	})
	if allocs > 1 {
		t.Errorf("hot path allocates %f allocs/op, want <=1", allocs)
	}
}

func BenchmarkFeed(b *testing.B) {
	p := NewParser()
	line := []byte(`id: 12345`)
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		p.Feed(line)
		p.Feed([]byte("data: {}"))
		p.Feed(nil)
	}
}
