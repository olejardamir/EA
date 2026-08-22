// Package hist implements the fixed-capacity integer-millisecond latency
// histogram. Its serialization is byte-compatible with the TypeScript
// StreamingHistogram sparse format (max_ms / total_count / overflow_count /
// buckets[[ms,count]]), so the existing coordinator merges shard histograms
// losslessly without format changes.
package hist

import "fmt"

// DefaultMaxMs matches the TS default 30,000 ms window.
const DefaultMaxMs = 30_000

// BucketPair is one sparse bucket in TS tuple form: exactly [milliseconds, count].
type BucketPair = [2]int64

// Serialized mirrors the TS SerializedHistogram wire shape byte-for-byte:
// {"max_ms":N,"total_count":N,"overflow_count":N,"buckets":[[ms,count],...]}.
type Serialized struct {
	MaxMs         int          `json:"max_ms"`
	TotalCount    int64        `json:"total_count"`
	OverflowCount int64        `json:"overflow_count"`
	Buckets       []BucketPair `json:"buckets"`
}

// Histogram is a fixed uint32 bucket array: 30,001 buckets = ~120 KiB.
type Histogram struct {
	maxMs     int
	buckets   []uint32
	total     int64
	overflows int64
	tracked   int
}

// New returns a histogram over [0, maxMs] ms.
func New(maxMs int) *Histogram {
	if maxMs <= 0 || maxMs > DefaultMaxMs {
		maxMs = DefaultMaxMs
	}
	return &Histogram{maxMs: maxMs, buckets: make([]uint32, maxMs+1)}
}

// Record adds one non-negative sample in milliseconds.
func (h *Histogram) Record(ms int) {
	h.total++
	if ms < 0 {
		h.overflows++
		return
	}
	if ms > h.maxMs {
		ms = h.maxMs
	}
	h.buckets[ms]++
	if ms > h.tracked {
		h.tracked = ms
	}
}

// Count reports the total recorded samples (including overflows).
func (h *Histogram) Count() int64 { return h.total }

func (h *Histogram) Percentile(p float64) int {
	if h.total == 0 {
		return 0
	}
	target := int64(float64(p)/100*float64(h.total) + 0.999999)
	if target < 1 {
		target = 1
	}
	var cumulative int64
	for ms := 0; ms <= h.maxMs; ms++ {
		cumulative += int64(h.buckets[ms])
		if cumulative >= target {
			return ms
		}
	}
	return h.tracked
}

// Merge adds another histogram's population into this one (same or smaller maxMs).
func (h *Histogram) Merge(other *Serialized) error {
	if other == nil {
		return nil
	}
	var populated int64
	for _, b := range other.Buckets {
		ms := int(b[0])
		if ms < 0 || ms > h.maxMs {
			continue
		}
		h.buckets[ms] += uint32(b[1])
		populated += b[1]
		if ms > h.tracked {
			h.tracked = ms
		}
	}
	h.total += other.TotalCount
	h.overflows += other.OverflowCount
	return nil
}

// Serialize emits the sparse lossless form (only non-zero buckets), matching
// StreamingHistogram.serialize(): [[ms,count],...] ascending.
func (h *Histogram) Serialize() Serialized {
	out := Serialized{MaxMs: h.maxMs, TotalCount: h.total, OverflowCount: h.overflows, Buckets: []BucketPair{}}
	for ms := 0; ms <= h.maxMs; ms++ {
		if c := h.buckets[ms]; c > 0 {
			out.Buckets = append(out.Buckets, BucketPair{int64(ms), int64(c)})
		}
	}
	return out
}

// Summary is the coordinator-facing percentile summary.
type Summary struct {
	P50Ms         int        `json:"p50_ms"`
	P95Ms         int        `json:"p95_ms"`
	P99Ms         int        `json:"p99_ms"`
	MaxMs         int        `json:"max_ms"`
	Count         int64      `json:"count"`
	OverflowCount int64      `json:"overflow_count"`
	Distribution  Serialized `json:"distribution"`
}

func (h *Histogram) Summarize() Summary {
	s := h.Serialize()
	return Summary{
		P50Ms: h.Percentile(50), P95Ms: h.Percentile(95), P99Ms: h.Percentile(99),
		MaxMs: h.tracked, Count: h.total, OverflowCount: h.overflows,
		Distribution: s,
	}
}

// Validate mirrors StreamingHistogram.deserialize invariants so malformed
// histograms are rejected client-side before submission.
func (s *Serialized) Validate() error {
	if s.MaxMs < 1 {
		return fmt.Errorf("histogram max_ms must be a positive integer")
	}
	var populated int64
	for _, b := range s.Buckets {
		if b[0] < 0 || b[0] > int64(s.MaxMs) {
			return fmt.Errorf("invalid histogram bucket: %d", b[0])
		}
		if b[1] < 1 {
			return fmt.Errorf("invalid histogram bucket count: %d", b[1])
		}
		populated += b[1]
	}
	if populated+s.OverflowCount != s.TotalCount {
		return fmt.Errorf("histogram population does not match total_count")
	}
	return nil
}
