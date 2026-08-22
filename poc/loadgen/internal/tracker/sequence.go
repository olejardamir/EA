// Package tracker implements the frozen full-population transport-continuity
// state machine (contract v2.2.0 §full-population):
//
//	first frame        -> initialize last_seq
//	seq == last+1      -> NEXT
//	seq == last        -> DUPLICATE
//	seq >  last+1      -> GAP (missing = seq - last - 1)
//	seq <  last        -> OUT_OF_ORDER
//
// The tracker is a fixed struct updated in place on the per-client hot path;
// it allocates nothing and retains no events. Aggregation into shard-global
// counters happens through plain integer adds owned by the single reader
// goroutine of the client (the connection read loop), so no synchronization
// is required on this struct itself.
package tracker

// Kind classifies one observed sequence transition.
type Kind uint8

const (
	First       Kind = iota // first frame on the connection: initializes last_seq
	Next                    // seq == last+1
	Duplicate               // seq == last
	Gap                     // seq > last+1 (missing = seq-last-1)
	OutOfOrder              // seq < last
)

// Tracker holds the minimal per-client continuity state (~48 bytes).
type Tracker struct {
	LastSeq     uint64
	Received    uint64
	Missing     uint64
	Duplicates  uint64
	OutOfOrder  uint64
	SawFrame    bool
}

// Observe advances the state machine for one delivered frame id.
func (t *Tracker) Observe(seq uint64) Kind {
	if !t.SawFrame {
		t.SawFrame = true
		t.LastSeq = seq
		t.Received = 1
		return First
	}
	t.Received++
	switch {
	case seq == t.LastSeq+1:
		t.LastSeq = seq
		return Next
	case seq == t.LastSeq:
		t.Duplicates++
		return Duplicate
	case seq > t.LastSeq:
		t.Missing += seq - t.LastSeq - 1
		t.LastSeq = seq
		return Gap
	default: // seq < lastSeq
		t.OutOfOrder++
		return OutOfOrder
	}
}
