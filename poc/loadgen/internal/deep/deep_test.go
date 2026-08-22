package deep

import (
	"strings"
	"testing"
	"time"
)

func validEventJSON() []byte {
	return []byte(`{"match_id":"match_001","canonical_seq":42,"event_type":"goal","publish_timestamp":"2026-08-21T12:00:00.123Z","score":{"home":1,"away":0},"clock":{"period":"1H","elapsed_seconds":600},"description":"a goal","padding":""}`)
}

func TestValidateSchemaAcceptsCanonicalEvent(t *testing.T) {
	ev, err := ValidateSchema(validEventJSON(), "match_001")
	if err != nil {
		t.Fatalf("canonical event rejected: %v", err)
	}
	if ev.CanonicalSeq != 42 || ev.Score.Home != 1 || ev.Clock.Period != "1H" {
		t.Fatalf("decoded fields wrong: %+v", ev)
	}
}

func TestValidateSchemaRejectsMalformed(t *testing.T) {
	cases := []struct {
		name string
		raw  string
	}{
		{"not json", `{{{`},
		{"missing match_id", `{"canonical_seq":1,"event_type":"goal","publish_timestamp":"2026-08-21T12:00:00.000Z"}`},
		{"zero seq", `{"match_id":"m","canonical_seq":0,"event_type":"corner","publish_timestamp":"2026-08-21T12:00:00.000Z"}`},
		{"negative seq", `{"match_id":"m","canonical_seq":-2,"event_type":"corner","publish_timestamp":"2026-08-21T12:00:00.000Z"}`},
		{"missing event_type", `{"match_id":"m","canonical_seq":1,"publish_timestamp":"2026-08-21T12:00:00.000Z"}`},
		{"unknown event_type", `{"match_id":"m","canonical_seq":1,"event_type":"meteor_strike","publish_timestamp":"2026-08-21T12:00:00.000Z"}`},
		{"bad timestamp", `{"match_id":"m","canonical_seq":1,"event_type":"corner","publish_timestamp":"not-a-time"}`},
	}
	for _, tc := range cases {
		if _, err := ValidateSchema([]byte(tc.raw), ""); err == nil {
			t.Errorf("%s: accepted malformed event %s", tc.name, tc.raw)
		}
	}
	if _, err := ValidateSchema(validEventJSON(), "match_002"); err == nil {
		t.Error("match_id mismatch must be rejected when expectation is set")
	}
}

func TestFastIsoMsFixedWidthMatchesTimeParse(t *testing.T) {
	const ts = "2026-08-21T12:34:56.789Z"
	want, err := time.Parse(time.RFC3339, ts)
	if err != nil {
		t.Fatal(err)
	}
	got, err := FastIsoMs(ts)
	if err != nil {
		t.Fatal(err)
	}
	if got != want.UnixMilli() {
		t.Fatalf("FastIsoMs = %d, want %d", got, want.UnixMilli())
	}
	// memoized second call must return the identical value
	got2, err := FastIsoMs(ts)
	if err != nil || got2 != got {
		t.Fatalf("memoized parse diverged: (%d,%v)", got2, err)
	}
}

func TestFastIsoMSFallbackAndRejection(t *testing.T) {
	rfc, err := time.Parse(time.RFC3339Nano, "2026-01-02T03:04:05.5Z")
	if err != nil {
		t.Fatal(err)
	}
	got, err := FastIsoMs("2026-01-02T03:04:05.5Z")
	if err != nil || got != rfc.UnixMilli() {
		t.Fatalf("RFC3339 fallback = (%d,%v), want %d", got, err, rfc.UnixMilli())
	}
	for _, bad := range []string{"", "garbage", "2026-13-99T99:99:99.999Z"} {
		if _, err := FastIsoMs(bad); err == nil {
			t.Errorf("accepted unparseable timestamp %q", bad)
		}
	}
}

func TestStateTrackerCleanStreamNoViolations(t *testing.T) {
	s := &StateTracker{}
	events := []*MatchEvent{
		ev("", 1, 0, 10, "1H"),     // first frame initializes at 0-0/10s (not judged)
		ev("goal", 2, 1, 20, "1H"), // legal +1 on a goal frame
		ev("corner", 3, 1, 45, "1H"),
		ev("", 4, 1, 60, "1H"),
	}
	for _, e := range events {
		s.Observe(e)
	}
	if s.Violations != 0 {
		t.Fatalf("clean stream flagged %d violations", s.Violations)
	}
}

func TestStateTrackerScoreRules(t *testing.T) {
	t.Run("goal advances exactly one side", func(t *testing.T) {
		s := &StateTracker{Started: true, LastScoreHome: 0, LastScoreAway: 0,
			LastElapsed: 100, LastPeriod: "1H", LastSeq: 5}
		s.Observe(ev("goal", 6, 1, 110, "1H"))
		if s.Violations != 0 {
			t.Fatalf("legal goal flagged: %+v", s)
		}
	})
	t.Run("score jump without goal frame", func(t *testing.T) {
		s := &StateTracker{Started: true, LastScoreHome: 0, LastScoreAway: 0,
			LastElapsed: 100, LastPeriod: "1H", LastSeq: 5}
		s.Observe(ev("corner", 6, 1, 110, "1H"))
		if s.Violations != 1 {
			t.Fatalf("non-goal score change not flagged: %+v", s)
		}
	})
	t.Run("double score jump on goal", func(t *testing.T) {
		s := &StateTracker{Started: true, LastScoreHome: 0, LastScoreAway: 0,
			LastElapsed: 100, LastPeriod: "1H", LastSeq: 5}
		s.Observe(ev("goal", 6, 2, 110, "1H"))
		if s.Violations != 1 {
			t.Fatalf("+2 goal not flagged: %+v", s)
		}
	})
}

func TestStateTrackerClockRules(t *testing.T) {
	cases := []struct {
		name    string
		elapsed int
		wantVio bool
	}{
		{"monotonic advance ok", 130, false},
		{"same elapsed ok", 100, false},
		{"backwards clock", 90, true},
		{"jump over 45s", 200, true},
	}
	for _, tc := range cases {
		s := &StateTracker{Started: true, LastScoreHome: 0, LastScoreAway: 0,
			LastElapsed: 100, LastPeriod: "1H", LastSeq: 5}
		s.Observe(ev("corner", 6, 0, tc.elapsed, "1H"))
		got := s.Violations > 0
		if got != tc.wantVio {
			t.Errorf("%s: violations=%v, want %v", tc.name, got, tc.wantVio)
		}
	}
}

func TestStateTrackerPeriodRules(t *testing.T) {
	ok := &StateTracker{Started: true, LastScoreHome: 0, LastScoreAway: 0,
		LastElapsed: 2700, LastPeriod: "1H", LastSeq: 9}
	ok.Observe(ev("", 10, 0, 2705, "2H"))
	if ok.Violations != 0 {
		t.Errorf("legal 2H transition flagged: %+v", ok)
	}
	bad := &StateTracker{Started: true, LastScoreHome: 0, LastScoreAway: 0,
		LastElapsed: 100, LastPeriod: "1H", LastSeq: 9}
	bad.Observe(ev("", 10, 0, 105, "2H"))
	if bad.Violations != 1 {
		t.Errorf("early 2H not flagged: %+v", bad)
	}
	junk := &StateTracker{Started: true, LastScoreHome: 0, LastScoreAway: 0,
		LastElapsed: 100, LastPeriod: "1H", LastSeq: 9}
	junk.Observe(ev("", 10, 0, 105, "ET"))
	if junk.Violations != 1 {
		t.Errorf("unknown period not flagged: %+v", junk)
	}
}

func TestStateTrackerSeqRegressionFlagged(t *testing.T) {
	s := &StateTracker{Started: true, LastScoreHome: 1, LastScoreAway: 0,
		LastElapsed: 100, LastPeriod: "1H", LastSeq: 50}
	s.Observe(ev("corner", 49, 1, 101, "1H"))
	if s.Violations != 1 {
		t.Fatalf("semantic seq regression not flagged: %+v", s)
	}
}

func TestAgreeWithHeadRequiresExactFinalState(t *testing.T) {
	s := &StateTracker{}
	s.Observe(ev("goal", 7, 2, 300, "1H"))
	if !s.AgreeWithHead(7, 2, 0, 300, "1H") {
		t.Fatal("matching head must agree")
	}
	for _, head := range [][4]any{
		{int64(8), 2, 0, 300},
	} {
		_ = head
	}
	if s.AgreeWithHead(8, 2, 0, 300, "1H") {
		t.Error("wrong seq agreed")
	}
	if s.AgreeWithHead(7, 3, 0, 300, "1H") {
		t.Error("wrong home score agreed")
	}
	if s.AgreeWithHead(7, 2, 0, 301, "1H") {
		t.Error("wrong elapsed agreed")
	}
	violating := &StateTracker{}
	violating.Observe(ev("corner", 7, 2, 300, "1H")) // first initializes; force violation next
	violating.Observe(ev("", 8, 5, 305, "1H"))
	if violating.AgreeWithHead(8, 5, 0, 305, "1H") {
		t.Error("violating tracker must never agree")
	}
}

func TestEvaluateRequiredRangeExactCompletePasses(t *testing.T) {
	var received []uint64
	for i := int64(10); i <= 19; i++ {
		received = append(received, uint64(i))
	}
	res := EvaluateRequiredRange("resume-1", 10, 19, received, 250)
	if !res.Passed {
		t.Fatalf("exact range failed: %+v", res)
	}
	if res.ExpectedCount != 10 || res.ReceivedRequiredCount != 10 || res.MissingRequired != 0 {
		t.Fatalf("counters wrong: %+v", res)
	}
	if res.RecoveryMs != 250 || res.TransportResumeID != "resume-1" {
		t.Fatalf("binding fields wrong: %+v", res)
	}
}

func TestEvaluateRequiredRangeDetectsMissing(t *testing.T) {
	res := EvaluateRequiredRange("r", 1, 5, []uint64{1, 2, 4, 5}, 0)
	if res.Passed {
		t.Fatal("missing middle sequence must fail")
	}
	if res.MissingRequired != 1 || len(res.MissingRequiredSequences) != 1 ||
		res.MissingRequiredSequences[0] != 3 {
		t.Fatalf("missing detection wrong: %+v", res)
	}
	if res.TargetReached {
		t.Error("TargetReached must be false with holes")
	}
}

func TestEvaluateRequiredRangeDuplicatesAndOrder(t *testing.T) {
	res := EvaluateRequiredRange("r", 1, 3, []uint64{1, 2, 2, 1, 3}, 0)
	// Only one transition sits below its immediate in-range predecessor
	// (the trailing 1 after 2); 3 resumes forward from there.
	if res.Duplicates != 2 || res.OutOfOrder != 1 {
		t.Fatalf("dup/ooo accounting wrong: %+v", res)
	}
	if res.Passed {
		t.Fatal("duplicate/out-of-order replay must not pass")
	}
	if res.ReceivedRequiredCount != 3 || res.MissingRequired != 0 {
		t.Fatalf("set membership wrong: %+v", res)
	}
}

func TestEvaluateRequiredRangeStaleBelowIsFatalAboveIsLive(t *testing.T) {
	res := EvaluateRequiredRange("r", 10, 12, []uint64{3, 10, 11, 12, 13, 14}, 0)
	if res.Passed {
		t.Fatal("stale below-range frame must be fatal (stale-replay evidence)")
	}
	if res.OutOfRangeBeforeCount != 1 || res.OutOfRangeAfterCount != 2 {
		t.Fatalf("range classification wrong: %+v", res)
	}
	live := EvaluateRequiredRange("r", 10, 12, []uint64{10, 11, 12, 13}, 0)
	if !live.Passed {
		t.Fatalf("above-range live continuation must tolerate: %+v", live)
	}
}

func TestEvaluateRequiredRangeMissingPrefix(t *testing.T) {
	res := EvaluateRequiredRange("r", 1, 3, []uint64{2, 3}, 0)
	if res.Passed || !res.MissingPrefix {
		t.Fatalf("missing prefix must be detected: %+v", res)
	}
	empty := EvaluateRequiredRange("r", 1, 3, nil, 0)
	if empty.Passed || empty.MissingPrefix {
		t.Fatalf("empty capture: prefix flag must stay clean but pass=false: %+v", empty)
	}
	if empty.ReceivedFirstSeq == nil || *empty.ReceivedFirstSeq != 0 {
		t.Fatalf("empty capture must emit zero-valued received_first_seq: %+v", empty.ReceivedFirstSeq)
	}
}

func TestExtractPublishTimestampMs(t *testing.T) {
	payload := validEventJSON()
	ms, ok := ExtractPublishTimestampMs(payload)
	if !ok {
		t.Fatal("timestamp extraction failed")
	}
	want, _ := time.Parse(time.RFC3339, "2026-08-21T12:00:00.123Z")
	if ms != want.UnixMilli() {
		t.Fatalf("ms = %d, want %d", ms, want.UnixMilli())
	}
	if _, ok := ExtractPublishTimestampMs([]byte(`{"x":1}`)); ok {
		t.Fatal("absent timestamp must not match")
	}
}

func TestParseCanonicalSeq(t *testing.T) {
	if v, ok := ParseCanonicalSeq([]byte("id: 123")); !ok || v != 123 {
		t.Fatalf("id line = (%d,%v)", v, ok)
	}
	// The scanner takes the FIRST run of digits on the line; a payload with
	// no digit characters at all must be rejected.
	if _, ok := ParseCanonicalSeq([]byte(`data: {"a":"x"}`)); ok {
		t.Fatal("digit-free line must not parse")
	}
	if _, ok := ParseCanonicalSeq([]byte("event: corner")); ok {
		t.Fatal("field name without digits must not parse")
	}
	if _, ok := ParseCanonicalSeq([]byte("id: 999999999999999999999999")); ok {
		t.Fatal("overflow must be rejected")
	}
}

// BenchmarkValidateSchema guards the bounded deep cohort's per-frame cost.
func BenchmarkValidateSchema(b *testing.B) {
	raw := validEventJSON()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		if _, err := ValidateSchema(raw, "match_001"); err != nil {
			b.Fatal(err)
		}
	}
}

func ev(eventType string, seq int64, home, elapsed int, period string) *MatchEvent {
	e := &MatchEvent{}
	e.MatchID = "match_001"
	e.CanonicalSeq = seq
	e.EventType = eventType
	e.PublishTimestamp = "2026-08-21T12:00:00.000Z"
	e.Score.Home = home
	e.Clock.Period = period
	e.Clock.ElapsedSeconds = elapsed
	return e
}

var _ = strings.TrimSpace
