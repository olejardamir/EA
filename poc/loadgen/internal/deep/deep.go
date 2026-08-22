// Package deep implements the bounded deep-verification cohort's semantic
// checks: full JSON decode, strict schema validation, payload/transport
// agreement, event-type/timestamp validation, score/clock internal
// consistency, publish→wire-arrival latency, and exact-range replay
// evaluation for reconnect/history/restart paths.
//
// Expected/observed boundary: expected values come from the publisher
// control service over HTTP; observed values are SSE wire frames. No
// function generates both sides.
package deep

import (
	"encoding/json"
	"fmt"
	"sync/atomic"
	"time"

	"ea/loadgen/internal/sse"
)

var KnownEventTypes = map[string]bool{
	"corner": true, "free_kick": true, "substitution": true, "offside": true,
	"goal": true, "yellow_card": true, "red_card": true, "var_review": true,
}

type MatchEvent struct {
	MatchID          string `json:"match_id"`
	CanonicalSeq     int64  `json:"canonical_seq"`
	EventType        string `json:"event_type"`
	PublishTimestamp string `json:"publish_timestamp"`
	Score            struct {
		Home int `json:"home"`
		Away int `json:"away"`
	} `json:"score"`
	Clock struct {
		Period         string `json:"period"`
		ElapsedSeconds int    `json:"elapsed_seconds"`
	} `json:"clock"`
	Description string `json:"description"`
	Padding     string `json:"padding"`
}

type LobbyState struct {
	Matches []struct {
		MatchID string `json:"match_id"`
	} `json:"matches"`
	Timestamp string `json:"timestamp"`
}

// SchemaError validates one match-event payload against the frozen schema.
func ValidateSchema(raw []byte, expectMatchID string) (*MatchEvent, error) {
	var ev MatchEvent
	if err := json.Unmarshal(raw, &ev); err != nil {
		return nil, fmt.Errorf("json: %w", err)
	}
	if ev.MatchID == "" || ev.CanonicalSeq <= 0 || ev.EventType == "" || ev.PublishTimestamp == "" {
		return nil, fmt.Errorf("missing required fields")
	}
	if !KnownEventTypes[ev.EventType] {
		return nil, fmt.Errorf("unknown event_type %q", ev.EventType)
	}
	if _, err := FastIsoMs(ev.PublishTimestamp); err != nil {
		return nil, fmt.Errorf("publish_timestamp invalid: %w", err)
	}
	if expectMatchID != "" && ev.MatchID != expectMatchID {
		return nil, fmt.Errorf("match_id %q, want %q", ev.MatchID, expectMatchID)
	}
	return &ev, nil
}

// FastIsoMs parses fixed-width ISO-8601 UTC ("YYYY-MM-DDTHH:mm:ss.mmmZ")
// with a memoized second-resolution prefix — mirrors fast-timestamp.ts.
// The memo is an atomic snapshot: many deep-viewer goroutines call this on the
// hot path, so a plain global would be a data race.
type isoMemo struct {
	prefix string
	baseMs int64
}

var isoMemoPtr atomic.Pointer[isoMemo]

func FastIsoMs(ts string) (int64, error) {
	if len(ts) == 24 && ts[23] == 'Z' && ts[19] == '.' &&
		ts[20] >= '0' && ts[20] <= '9' && ts[21] >= '0' && ts[21] <= '9' && ts[22] >= '0' && ts[22] <= '9' &&
		ts[10] == 'T' && ts[13] == ':' && ts[16] == ':' && ts[4] == '-' && ts[7] == '-' {
		prefix := ts[:19]
		if m := isoMemoPtr.Load(); m != nil && m.prefix == prefix {
			return m.baseMs + int64(ts[20]-'0')*100 + int64(ts[21]-'0')*10 + int64(ts[22]-'0'), nil
		}
		t, err := time.Parse("2006-01-02T15:04:05", prefix)
		if err != nil {
			return 0, err
		}
		isoMemoPtr.Store(&isoMemo{prefix: prefix, baseMs: t.UnixMilli()})
		return t.UnixMilli() + int64(ts[20]-'0')*100 + int64(ts[21]-'0')*10 + int64(ts[22]-'0'), nil
	}
	t, err := httpTimeParse(ts)
	if err != nil {
		return 0, err
	}
	return t.UnixMilli(), nil
}

func httpTimeParse(ts string) (time.Time, error) {
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339} {
		if t, err := time.Parse(layout, ts); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("unparseable timestamp %q", ts)
}

// StateTracker performs score/clock internal-consistency reconstruction for
// one match stream. Rules mirror domain/match-state.ts:
//   - score may only change on a goal frame, by exactly +1 on one side
//   - clock elapsed is monotonic non-decreasing, advancing ≤45s per frame
//   - period transitions 1H → 2H once elapsed ≥ 2700
type StateTracker struct {
	LastScoreHome int
	LastScoreAway int
	LastElapsed   int
	LastPeriod    string
	LastSeq       int64
	Violations    int
	Started       bool
}

func (s *StateTracker) Observe(ev *MatchEvent) {
	if !s.Started {
		s.Started = true
		s.LastScoreHome = ev.Score.Home
		s.LastScoreAway = ev.Score.Away
		s.LastElapsed = ev.Clock.ElapsedSeconds
		s.LastPeriod = ev.Clock.Period
		s.LastSeq = ev.CanonicalSeq
		return
	}
	ok := true
	switch {
	case ev.Score.Home == s.LastScoreHome && ev.Score.Away == s.LastScoreAway:
		// unchanged is always fine
	case ev.Score.Home == s.LastScoreHome+1 && ev.Score.Away == s.LastScoreAway && ev.EventType == "goal":
	case ev.Score.Home == s.LastScoreHome && ev.Score.Away == s.LastScoreAway+1 && ev.EventType == "goal":
	default:
		ok = false
	}
	if ev.Clock.ElapsedSeconds < s.LastElapsed || ev.Clock.ElapsedSeconds-s.LastElapsed > 45 {
		ok = false
	}
	if ev.Clock.Period != "1H" && ev.Clock.Period != "2H" {
		ok = false
	}
	if ev.Clock.Period == "2H" && !(s.LastPeriod == "2H" || ev.Clock.ElapsedSeconds >= 2700) {
		ok = false
	}
	if ev.CanonicalSeq < s.LastSeq {
		ok = false // order violation inside semantic stream
	}
	if !ok {
		s.Violations++
	}
	s.LastScoreHome = ev.Score.Home
	s.LastScoreAway = ev.Score.Away
	s.LastElapsed = ev.Clock.ElapsedSeconds
	s.LastPeriod = ev.Clock.Period
	s.LastSeq = ev.CanonicalSeq
}

// AgreeWithHead compares reconstructed final state against the independent
// publisher canonical head (the EXPECTED side).
func (s *StateTracker) AgreeWithHead(seq int64, home, away, elapsed int, period string) bool {
	return s.Started && seq == s.LastSeq && home == s.LastScoreHome && away == s.LastScoreAway &&
		elapsed == s.LastElapsed && period == s.LastPeriod && s.Violations == 0
}

// PathResult is the exact-required-range evaluation shared by the reconnect,
// late-join history and restart paths. Shape-compatible with the coordinator's
// isExactRestartPathEvidence predicate.
type PathResult struct {
	TransportResumeID       string `json:"transport_resume_id"`
	ExpectedFirstSeq        int64  `json:"expected_first_seq"`
	ExpectedLastSeq         int64  `json:"expected_last_seq"`
	ReceivedFirstSeq        *int64 `json:"received_first_seq"`
	ReceivedLastSeq         *int64 `json:"received_last_seq"`
	ExpectedCount           int64  `json:"expected_count"`
	ReceivedRequiredCount   int64  `json:"received_required_count"`
	MissingRequired         int64  `json:"missing_required"`
	MissingRequiredSequences []int64 `json:"missing_required_sequences"`
	Duplicates              int64  `json:"duplicates"`
	OutOfOrder              int64  `json:"out_of_order"`
	OutOfRangeBeforeCount   int64  `json:"out_of_range_before_count"`
	OutOfRangeAfterCount    int64  `json:"out_of_range_after_count"`
	MissingPrefix           bool   `json:"missing_prefix"`
	TargetReached           bool   `json:"target_reached"`
	RecoveryMs              int64  `json:"recovery_ms"`
	Passed                  bool   `json:"passed"`
}

// EvaluateRequiredRange judges membership in the independently frozen interval.
// Frames above the range are live continuation (diagnostic only); frames below
// remain fatal stale-replay evidence. Mirrors isExactRestartPathEvidence.
func EvaluateRequiredRange(resumeID string, first, last int64, received []uint64, recoveryMs int64) *PathResult {
	expectedCount := last - first + 1
	inRange := make(map[uint64]bool)
	var dups, ooo, before, after int64
	var prev uint64
	var firstSeen uint64
	sawAny := false
	for _, seq := range received {
		if seq < uint64(first) {
			before++
			continue
		}
		if seq > uint64(last) {
			after++
			continue
		}
		if !sawAny {
			firstSeen = seq
			sawAny = true
		}
		if sawAny && len(inRange) > 0 && seq < prev {
			ooo++
		}
		if inRange[seq] {
			dups++
		}
		inRange[seq] = true
		prev = seq
	}
	missing := make([]int64, 0)
	for seq := first; seq <= last; seq++ {
		if !inRange[uint64(seq)] {
			missing = append(missing, seq)
		}
	}
	exactComplete := expectedCount > 0 && int64(len(missing)) == 0
	res := &PathResult{
		TransportResumeID:        resumeID,
		ExpectedFirstSeq:         first,
		ExpectedLastSeq:          last,
		ExpectedCount:            expectedCount,
		ReceivedRequiredCount:    int64(len(inRange)),
		MissingRequired:          int64(len(missing)),
		MissingRequiredSequences: missing,
		Duplicates:               dups,
		OutOfOrder:               ooo,
		OutOfRangeBeforeCount:    before,
		OutOfRangeAfterCount:     after,
		MissingPrefix:            sawAny && firstSeen != uint64(first),
		TargetReached:            exactComplete,
		RecoveryMs:               recoveryMs,
	}
	var rf int64
	var rl int64
	rfValid := false
	for _, s := range received {
		if s >= uint64(first) {
			rf = int64(s)
			rfValid = true
			break
		}
	}
	if rfValid {
		res.ReceivedFirstSeq = &rf
	} else {
		res.ReceivedFirstSeq = new(int64)
	}
	if len(received) > 0 {
		rl = int64(received[len(received)-1])
		res.ReceivedLastSeq = &rl
	} else {
		res.ReceivedLastSeq = new(int64)
	}
	res.Passed = exactComplete && dups == 0 && ooo == 0 && before == 0 && !res.MissingPrefix
	return res
}

// ExtractPublishTimestampMs scans a MatchEvent payload for the frozen-width
// ISO publish_timestamp and parses it via the memoized fast parser without a
// full JSON decode. Used on the deep hot path for latency measurement.
func ExtractPublishTimestampMs(data []byte) (int64, bool) {
	v, ok := sse.ExtractStringField(data, "publish_timestamp")
	if !ok || len(v) != 24 {
		return 0, false
	}
	ms, err := FastIsoMs(string(v))
	if err != nil {
		return 0, false
	}
	return ms, true
}

// ParseCanonicalSeq extracts the dense canonical sequence from an SSE id or
// data line without allocation-heavy decoding. Used by tests and probes.
func ParseCanonicalSeq(line []byte) (int64, bool) {
	start := -1
	for i, c := range line {
		if c >= '0' && c <= '9' {
			start = i
			break
		}
	}
	if start < 0 {
		return 0, false
	}
	v := int64(0)
	for i := start; i < len(line) && line[i] >= '0' && line[i] <= '9'; i++ {
		v = v*10 + int64(line[i]-'0')
		if v > 1<<62 {
			return 0, false
		}
	}
	return v, true
}
