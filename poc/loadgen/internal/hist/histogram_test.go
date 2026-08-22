package hist

import (
	"encoding/json"
	"testing"
)

func TestNewClampsMaxMs(t *testing.T) {
	if h := New(0); h.maxMs != DefaultMaxMs {
		t.Errorf("New(0) maxMs = %d", h.maxMs)
	}
	if h := New(-5); h.maxMs != DefaultMaxMs {
		t.Errorf("New(-5) maxMs = %d", h.maxMs)
	}
	if h := New(DefaultMaxMs + 1); h.maxMs != DefaultMaxMs {
		t.Errorf("oversize maxMs must clamp to %d", DefaultMaxMs)
	}
	if h := New(500); h.maxMs != 500 {
		t.Errorf("New(500) maxMs = %d", h.maxMs)
	}
}

func TestRecordNegativeCountsAsOverflow(t *testing.T) {
	h := New(100)
	h.Record(-1)
	s := h.Serialize()
	if s.TotalCount != 1 || s.OverflowCount != 1 {
		t.Fatalf("negative sample must be total=1 overflow=1, got %+v", s)
	}
	if len(s.Buckets) != 0 {
		t.Fatalf("overflow must not populate a bucket: %+v", s.Buckets)
	}
}

func TestRecordAboveWindowClampsToMaxBucket(t *testing.T) {
	h := New(100)
	h.Record(150)
	s := h.Serialize()
	if len(s.Buckets) != 1 || s.Buckets[0][0] != 100 || s.Buckets[0][1] != 1 {
		t.Fatalf("clamp expected bucket [[100,1]], got %+v", s.Buckets)
	}
}

func TestSerializeSparseAscendingLossless(t *testing.T) {
	h := New(1000)
	counts := map[int]int64{0: 3, 7: 1, 999: 2, 500: 4}
	for ms, n := range counts {
		for i := int64(0); i < n; i++ {
			h.Record(ms)
		}
	}
	s := h.Serialize()
	if s.TotalCount != 10 {
		t.Fatalf("total = %d", s.TotalCount)
	}
	// ascending order, only non-zero buckets
	var prev int64 = -1
	var sum int64
	for _, b := range s.Buckets {
		if b[0] <= prev {
			t.Fatalf("buckets not strictly ascending: %v after %d", b, prev)
		}
		prev = b[0]
		sum += b[1]
		if counts[int(b[0])] != b[1] {
			t.Errorf("bucket %d count %d, want %d", b[0], b[1], counts[int(b[0])])
		}
	}
	if sum != s.TotalCount {
		t.Fatalf("populated sum %d != total %d (lossless violation)", sum, s.TotalCount)
	}
}

// TestGoldenJSONShapeTSCompatibility is the byte-level cross-language contract:
// the serialized form must equal the TS StreamingHistogram wire shape
// {"max_ms":N,"total_count":N,"overflow_count":N,"buckets":[[ms,count],...]}
// so the TypeScript coordinator merges shard histograms without changes.
func TestGoldenJSONShapeTSCompatibility(t *testing.T) {
	h := New(30000)
	h.Record(12)
	h.Record(12)
	h.Record(3400)
	got, err := json.Marshal(h.Serialize())
	if err != nil {
		t.Fatal(err)
	}
	want := `{"max_ms":30000,"total_count":3,"overflow_count":0,"buckets":[[12,2],[3400,1]]}`
	if string(got) != want {
		t.Fatalf("wire shape drift:\n got %s\nwant %s", got, want)
	}
	var back Serialized
	if err := json.Unmarshal(got, &back); err != nil {
		t.Fatal(err)
	}
	if err := back.Validate(); err != nil {
		t.Fatalf("round-trip failed validation: %v", err)
	}
}

func TestValidateRejectsMalformed(t *testing.T) {
	cases := []struct {
		name string
		s    Serialized
	}{
		{"zero max_ms", Serialized{MaxMs: 0, TotalCount: 0}},
		{"negative bucket ms", Serialized{MaxMs: 10, TotalCount: 1, Buckets: []BucketPair{{-1, 1}}}},
		{"bucket above max_ms", Serialized{MaxMs: 10, TotalCount: 1, Buckets: []BucketPair{{11, 1}}}},
		{"zero bucket count", Serialized{MaxMs: 10, TotalCount: 1, Buckets: []BucketPair{{5, 0}}}},
		{"population mismatch", Serialized{MaxMs: 10, TotalCount: 5, OverflowCount: 1, Buckets: []BucketPair{{5, 2}}}},
	}
	for _, tc := range cases {
		if err := tc.s.Validate(); err == nil {
			t.Errorf("%s: Validate accepted malformed histogram %+v", tc.name, tc.s)
		}
	}
	valid := Serialized{MaxMs: 10, TotalCount: 3, OverflowCount: 1, Buckets: []BucketPair{{5, 2}}}
	if err := valid.Validate(); err != nil {
		t.Errorf("Validate rejected valid histogram: %v", err)
	}
}

func TestMergeAddsPopulations(t *testing.T) {
	a := New(1000)
	b := New(1000)
	for i := 0; i < 3; i++ {
		a.Record(10)
	}
	for i := 0; i < 2; i++ {
		b.Record(20)
	}
	b.Record(-3)
	sb := b.Serialize()
	if err := a.Merge(&sb); err != nil {
		t.Fatal(err)
	}
	m := a.Serialize()
	if m.TotalCount != 6 || m.OverflowCount != 1 {
		t.Fatalf("merged totals wrong: %+v", m)
	}
	found := map[int64]int64{}
	for _, p := range m.Buckets {
		found[p[0]] = p[1]
	}
	if found[10] != 3 || found[20] != 2 {
		t.Fatalf("merged buckets wrong: %v", m.Buckets)
	}
	if err := a.Merge(nil); err != nil {
		t.Errorf("nil merge must be a no-op, got %v", err)
	}
}

func TestMergeIgnoresOutOfRangeBuckets(t *testing.T) {
	h := New(100)
	other := Serialized{MaxMs: 200, TotalCount: 3, Buckets: []BucketPair{{50, 1}, {150, 2}}}
	if err := h.Merge(&other); err != nil {
		t.Fatal(err)
	}
	m := h.Serialize()
	// out-of-window bucket dropped from population view but totals preserved
	if m.TotalCount != 3 || m.OverflowCount != 0 {
		t.Fatalf("totals must merge verbatim: %+v", m)
	}
	if len(m.Buckets) != 1 || m.Buckets[0][0] != 50 {
		t.Fatalf("only in-window bucket may appear: %v", m.Buckets)
	}
}

func TestPercentileMonotonicAndBounded(t *testing.T) {
	h := New(DefaultMaxMs)
	for i := 0; i < 100; i++ {
		h.Record(i)
	}
	p50, p95, p99 := h.Percentile(50), h.Percentile(95), h.Percentile(99)
	if !(p50 <= p95 && p95 <= p99) {
		t.Fatalf("percentiles not monotonic: %d %d %d", p50, p95, p99)
	}
	if p50 < 49 || p99 > 99 {
		t.Fatalf("percentiles outside sane range: %d %d %d", p50, p95, p99)
	}
	if empty := New(10).Percentile(50); empty != 0 {
		t.Errorf("empty histogram percentile = %d, want 0", empty)
	}
}

func TestSummarizeFields(t *testing.T) {
	h := New(1000)
	h.Record(100)
	h.Record(200)
	s := h.Summarize()
	if s.Count != 2 || s.MaxMs != 200 {
		t.Fatalf("summary fields wrong: %+v", s)
	}
	if s.Distribution.TotalCount != 2 {
		t.Fatalf("distribution population wrong: %+v", s.Distribution)
	}
}

func BenchmarkRecordSerialize(b *testing.B) {
	h := New(DefaultMaxMs)
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		h.Record(i % DefaultMaxMs)
		if i%64 == 0 {
			_ = h.Serialize()
		}
	}
}
