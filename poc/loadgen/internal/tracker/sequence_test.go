package tracker

import "testing"

func TestFrozenTransitionSemantics(t *testing.T) {
	tr := &Tracker{}
	cases := []struct {
		seq  uint64
		want Kind
	}{
		{1, First},
		{2, Next},
		{3, Next},
		{3, Duplicate}, // seq == last
		{7, Gap},       // 4,5,6 missing
		{8, Next},
		{4, OutOfOrder}, // seq < last
	}
	var gotMissing uint64
	for _, tc := range cases {
		got := tr.Observe(tc.seq)
		if got != tc.want {
			t.Fatalf("Observe(%d) = %v, want %v (state: %+v)", tc.seq, got, tc.want, tr)
		}
		if got == Gap {
			gotMissing = tr.Missing
			if tr.Missing != 3 {
				t.Fatalf("gap of 4..6 must record Missing=3, got %d", tr.Missing)
			}
		}
	}
	// Received counts every delivered frame on the wire: 7 observations above
	// (1,2,3,dup-3,7,8,ooo-4). Duplicates and out-of-order frames still count;
	// gap holes do not. Must stay aligned with pool.observe.
	if tr.Received != 7 {
		t.Errorf("Received = %d, want 7", tr.Received)
	}
	if tr.LastSeq != 8 {
		t.Errorf("LastSeq = %d, want 8", tr.LastSeq)
	}
	if tr.Duplicates != 1 || tr.OutOfOrder != 1 || gotMissing != 3 {
		t.Errorf("aggregate counters wrong: dup=%d ooo=%d missing=%d", tr.Duplicates, tr.OutOfOrder, gotMissing)
	}
}

func TestFirstFrameInitializesAtAnyValue(t *testing.T) {
	tr := &Tracker{}
	if k := tr.Observe(1000); k != First {
		t.Fatalf("first observe = %v", k)
	}
	if tr.LastSeq != 1000 {
		t.Errorf("LastSeq = %d", tr.LastSeq)
	}
}

func TestZeroValueStartsFresh(t *testing.T) {
	tr := &Tracker{}
	if k := tr.Observe(0); k != First {
		t.Fatalf("zero-valued stream must still be First, got %v", k)
	}
	if k := tr.Observe(0); k != Duplicate {
		t.Fatalf("repeat zero must be Duplicate, got %v", k)
	}
}

func TestLongAscendingRunNeverFlags(t *testing.T) {
	tr := &Tracker{}
	for i := uint64(1); i <= 500000; i++ {
		if k := tr.Observe(i); k != First && k != Next {
			t.Fatalf("clean run flagged %v at seq %d", k, i)
		}
	}
	if tr.Missing != 0 || tr.Duplicates != 0 || tr.OutOfOrder != 0 {
		t.Errorf("clean run produced violations: %+v", tr)
	}
}

// BenchmarkObserve guards the frozen hot-path contract: the tracker is a fixed
// struct with no allocation and no synchronization.
func BenchmarkObserve(b *testing.B) {
	tr := &Tracker{}
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		tr.Observe(uint64(i))
	}
}
