package pool

import (
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"ea/loadgen/internal/deep"
)

// ── test SSE origin ──────────────────────────────────────────────────────

// matchServer is a minimal Nchan-like SSE origin: match channels stream ids
// 1..head contiguously. Fresh subscriptions replay from 1 (replayAll) or
// start live at head; Last-Event-ID resumes replay from resume+1 — mirroring
// Nchan's channel-history semantics closely enough for exactness proofs.
type matchServer struct {
	srv       *httptest.Server
	mu        sync.Mutex
	head      int64
	closed    bool
	conns     atomic.Int64
	replayAll bool
	omitIDs   bool // stream data frames with NO transport id line
	opaqueIDs bool // stream ids as opaque tokens (never parseable integers)
}

func newMatchServer(t *testing.T, replayAll bool) *matchServer {
	t.Helper()
	s := &matchServer{replayAll: replayAll}
	s.srv = httptest.NewServer(s)
	t.Cleanup(func() {
		s.mu.Lock()
		s.closed = true
		s.mu.Unlock()
		s.srv.Close()
	})
	return s
}

func (s *matchServer) setHead(h int64) { s.mu.Lock(); s.head = h; s.mu.Unlock() }

func (s *matchServer) closeConns() { s.mu.Lock(); s.closed = true; s.mu.Unlock() }

func (s *matchServer) isClosed() bool { s.mu.Lock(); defer s.mu.Unlock(); return s.closed }

func (s *matchServer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	fl, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "no flusher", http.StatusInternalServerError)
		return
	}
	s.conns.Add(1)
	if s.isClosed() {
		// origin shutting down: accept then deliver nothing (zero-frame death)
		return
	}
	w.Header().Set("content-type", "text/event-stream")
	w.Header().Set("cache-control", "no-cache")
	w.WriteHeader(http.StatusOK)

	var from int64
	if leid := r.Header.Get("Last-Event-ID"); leid != "" {
		if v, err := strconv.ParseInt(strings.TrimSpace(leid), 10, 64); err == nil {
			from = v
		}
	}
	s.mu.Lock()
	cur := s.head
	s.mu.Unlock()
	if !s.replayAll && from == 0 {
		from = cur // live-only subscription starts at current head
	}

	emit := func(i int64) bool {
		select {
		case <-r.Context().Done():
			return false
		default:
		}
		var err error
		switch {
		case s.omitIDs:
			_, err = fmt.Fprintf(w, "data: {\"n\":%d}\n\n", i)
		case s.opaqueIDs:
			_, err = fmt.Fprintf(w, "id: tok-%d-x\ndata: {\"n\":%d}\n\n", i, i)
		default:
			_, err = fmt.Fprintf(w, "id: %d\ndata: {\"n\":%d}\n\n", i, i)
		}
		if err != nil {
			return false
		}
		fl.Flush()
		return true
	}
	for i := from + 1; i <= cur; i++ {
		if !emit(i) {
			return
		}
	}
	for {
		select {
		case <-r.Context().Done():
			return
		case <-time.After(2 * time.Millisecond):
		}
		if s.isClosed() {
			return
		}
		s.mu.Lock()
		nh := s.head
		s.mu.Unlock()
		for i := cur + 1; i <= nh; i++ {
			if !emit(i) {
				return
			}
		}
		cur = nh
	}
}

func waitFor(t *testing.T, timeout time.Duration, what string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("condition not met within %s: %s", timeout, what)
}

// ── failure attribution ──────────────────────────────────────────────────

func TestUnexpectedDisconnectAccounting(t *testing.T) {
	srv := newMatchServer(t, true)
	srv.setHead(3)
	p := New(srv.srv.URL+"/sub/", []string{"m1"}, 4)
	if err := p.Add(RoleLight, "m1"); err != nil {
		t.Fatal(err)
	}
	p.Start()
	waitFor(t, 5*time.Second, "viewer saw frames", func() bool {
		return p.viewers[0].lastSeq.Load() >= 3
	})
	srv.closeConns()
	// established-then-dropped => UnexpectedDisconnect
	waitFor(t, 5*time.Second, "unexpected disconnect counted", func() bool {
		return p.Counters.UnexpectedDisconnects.Load() >= 1
	})
	// repair attempts against the closed stream establish then die at zero
	// frames => ConnectionFailure as well
	waitFor(t, 5*time.Second, "zero-frame death counted as failure", func() bool {
		return p.Counters.ConnectionFailures.Load() >= 1
	})
	p.Stop()
	if m := p.Counters.MissingSequences.Load(); m != 0 {
		t.Fatalf("contiguous stream produced %d missing", m)
	}
}

func TestPlannedHoldNeverAttributedAsFailure(t *testing.T) {
	srv := newMatchServer(t, true)
	srv.setHead(200) // steady live traffic during the hold window
	go func() {
		for i := int64(0); i < 400; i++ {
			time.Sleep(2 * time.Millisecond)
			srv.setHead(int64(201 + i))
		}
	}()
	p := New(srv.srv.URL+"/sub/", []string{"m1"}, 4)
	if err := p.Add(RoleLight, "m1"); err != nil {
		t.Fatal(err)
	}
	if err := p.Add(RoleDeep, "m1"); err != nil {
		t.Fatal(err)
	}
	p.Start()
	waitFor(t, 5*time.Second, "viewers streaming", func() bool {
		return p.viewers[0].lastSeq.Load() > 20 && p.viewers[1].lastSeq.Load() > 20
	})
	p.DrainAll()
	defer p.Stop()
	if cf := p.Counters.ConnectionFailures.Load(); cf != 0 {
		t.Fatalf("planned drain produced %d connection failures", cf)
	}
	if ud := p.Counters.UnexpectedDisconnects.Load(); ud != 0 {
		t.Fatalf("planned drain produced %d unexpected disconnects", ud)
	}
	if pd := p.Counters.PlannedDisconnects.Load(); pd != 2 {
		t.Fatalf("PlannedDisconnects = %d, want 2", pd)
	}
	for i, v := range p.viewers {
		if v.online.Load() {
			t.Fatalf("viewer %d still online after drain", i)
		}
	}
	p.ReleaseDrain()
	waitFor(t, 5*time.Second, "both viewers re-established", func() bool {
		return p.viewers[0].online.Load() && p.viewers[1].online.Load()
	})
	if cf := p.Counters.ConnectionFailures.Load(); cf != 0 {
		t.Fatalf("post-drain reconnection produced %d failures", cf)
	}
}

// ── reconnect cohort: frozen-range exactness ─────────────────────────────

func TestReconnectFrozenRangeExactReplay(t *testing.T) {
	srv := newMatchServer(t, true)
	srv.setHead(10)
	p := New(srv.srv.URL+"/sub/", []string{"m1"}, 4)
	if err := p.Add(RoleReconnect, "m1"); err != nil {
		t.Fatal(err)
	}
	p.Start()
	// wait until the viewer has consumed the whole static history so the
	// capture point is deterministic
	waitFor(t, 5*time.Second, "viewer reached seq 10", func() bool {
		return p.viewers[0].lastSeq.Load() == 10
	})
	captured := p.viewers[0].lastSeq.Load()

	p.SetHeadLookup(func(string) (int64, bool) { return 50, true })
	p.HoldReconnectCohort()
	if cf, ud := p.Counters.ConnectionFailures.Load(), p.Counters.UnexpectedDisconnects.Load(); cf != 0 || ud != 0 {
		t.Fatalf("planned hold attributed: cf=%d ud=%d", cf, ud)
	}
	if p.viewers[0].online.Load() {
		t.Fatal("viewer still online after hold")
	}

	srv.setHead(50) // publish 11..50 while the cohort is held
	if n := p.ReleaseReconnectCohort(); n != 1 {
		t.Fatalf("released = %d, want 1", n)
	}
	waitFor(t, 10*time.Second, "viewer replayed to frozen target 50", func() bool {
		return p.viewers[0].lastSeq.Load() >= 50
	})

	res := p.CollectReconnectResults()
	if len(res) != 1 {
		t.Fatalf("got %d results, want 1", len(res))
	}
	var r *deep.PathResult
	for _, v := range res {
		r = v
	}
	if !r.Passed {
		t.Fatalf("reconnect path failed: %+v", r)
	}
	if r.ExpectedFirstSeq != int64(captured)+1 || r.ExpectedLastSeq != 50 {
		t.Fatalf("frozen range = [%d..%d], want [%d..50]", r.ExpectedFirstSeq, r.ExpectedLastSeq, captured+1)
	}
	if r.MissingRequired != 0 || r.Duplicates != 0 || r.OutOfOrder != 0 || r.OutOfRangeBeforeCount != 0 {
		t.Fatalf("exactness violated: %+v", r)
	}
	if want := strconv.FormatUint(captured, 10); r.TransportResumeID != want {
		t.Fatalf("TransportResumeID = %q, want %q", r.TransportResumeID, want)
	}
	if ra := p.Counters.ReconnectAttempts.Load(); ra != 1 {
		t.Fatalf("ReconnectAttempts = %d, want 1", ra)
	}
	if rs := p.Counters.ReconnectSucceeded.Load(); rs != 1 {
		t.Fatalf("ReconnectSucceeded = %d, want 1", rs)
	}
	p.Stop()
}

// R01 regression: a client that never observed a real transport id on wire
// can never be treated as resume-ready. The canonical application sequence
// must never be synthesized into a Last-Event-ID token.
func TestMissingRawIDNeverSynthesizedFromCanonical(t *testing.T) {
	srv := newMatchServer(t, true)
	srv.mu.Lock()
	srv.omitIDs = true
	srv.mu.Unlock()
	srv.setHead(10)
	p := New(srv.srv.URL+"/sub/", []string{"m1"}, 4)
	if err := p.Add(RoleReconnect, "m1"); err != nil {
		t.Fatal(err)
	}
	p.Start()
	// On an id-less stream every frame is a missing_transport_id correctness
	// violation; the pipeline deliberately refuses to track canonical state
	// from such frames. Simulate the adversarial state the fallback used to
	// exploit — canonical sequence known while the raw wire id is absent.
	waitFor(t, 5*time.Second, "viewer received id-less frames", func() bool {
		return p.Counters.FramesReceived.Load() > 0 &&
			p.Counters.MissingTransportID.Load() > 0
	})
	if p.viewers[0].lastRawID != "" {
		t.Fatal("precondition broken: raw id observed on id-less stream")
	}
	p.viewers[0].lastCanon = 10
	p.viewers[0].lastSeq.Store(10)

	p.SetHeadLookup(func(string) (int64, bool) { return 50, true })
	hold := p.HoldReconnectCohort()
	if hold.Selected != 1 || hold.ReadyBeforeHold != 0 || hold.MissingRawID != 1 {
		t.Fatalf("hold evidence = %+v, want selected=1 ready=0 missing_raw_id=1", hold)
	}
	if n := p.Counters.ReconnectMissingRawID.Load(); n != 1 {
		t.Fatalf("ReconnectMissingRawID = %d, want 1", n)
	}
	if n := p.ReleaseReconnectCohort(); n != 0 {
		t.Fatalf("released = %d, want 0 (client without raw id is not resume-ready)", n)
	}
	p.viewers[0].mu.Lock()
	resumeEmpty := p.viewers[0].resumeID == ""
	p.viewers[0].mu.Unlock()
	if !resumeEmpty {
		t.Fatal("resumeID must stay empty — canonical seq must never become the transport token")
	}
	waitFor(t, 5*time.Second, "non-resume-ready viewer re-established normally", func() bool {
		return p.viewers[0].online.Load()
	})
	p.Stop()
}

// R01 regression: an opaque raw transport id survives byte-for-byte into the
// resume state even though it differs completely from the canonical sequence.
func TestOpaqueRawIDPreservedByteForByte(t *testing.T) {
	srv := newMatchServer(t, true)
	srv.mu.Lock()
	srv.opaqueIDs = true
	srv.mu.Unlock()
	srv.setHead(10)
	p := New(srv.srv.URL+"/sub/", []string{"m1"}, 4)
	if err := p.Add(RoleReconnect, "m1"); err != nil {
		t.Fatal(err)
	}
	p.Start()
	waitFor(t, 5*time.Second, "viewer reached canonical seq 10", func() bool {
		return p.viewers[0].lastSeq.Load() == 10
	})

	p.SetHeadLookup(func(string) (int64, bool) { return 50, true })
	hold := p.HoldReconnectCohort()
	if hold.ReadyBeforeHold != 1 || hold.MissingRawID != 0 {
		t.Fatalf("hold evidence = %+v, want ready=1 missing=0", hold)
	}
	p.viewers[0].mu.Lock()
	got := p.viewers[0].resumeID
	canon := p.viewers[0].capturedCanon
	p.viewers[0].mu.Unlock()
	if got != "tok-10-x" {
		t.Fatalf("resumeID = %q, want exact wire token %q", got, "tok-10-x")
	}
	if canon != 10 {
		t.Fatalf("capturedCanon = %d, want 10 (canonical tracked separately from raw id)", canon)
	}
	// unhold: release against unchanged head skips and restores the viewer
	p.ReleaseReconnectCohort()
	waitFor(t, 5*time.Second, "viewer re-established after skip-release", func() bool {
		return p.viewers[0].online.Load()
	})
	p.Stop()
}

func TestReleaseSkipsWhenNoNewEvents(t *testing.T) {
	srv := newMatchServer(t, true)
	srv.setHead(10)
	p := New(srv.srv.URL+"/sub/", []string{"m1"}, 4)
	if err := p.Add(RoleReconnect, "m1"); err != nil {
		t.Fatal(err)
	}
	p.Start()
	waitFor(t, 5*time.Second, "viewer reached seq 10", func() bool {
		return p.viewers[0].lastSeq.Load() == 10
	})
	// head lookup reports nothing newer than the capture point
	p.SetHeadLookup(func(string) (int64, bool) { return 10, true })
	p.HoldReconnectCohort()
	if n := p.ReleaseReconnectCohort(); n != 0 {
		t.Fatalf("released = %d, want 0", n)
	}
	if res := p.CollectReconnectResults(); len(res) != 0 {
		t.Fatalf("expected no results for unreleased cohort, got %d", len(res))
	}
	// viewer must be unheld and back online
	waitFor(t, 5*time.Second, "viewer re-established after skip-release", func() bool {
		return p.viewers[0].online.Load()
	})
	p.Stop()
}

func TestCollectEmptyCaptureYieldsFailedResult(t *testing.T) {
	srv := newMatchServer(t, true)
	srv.setHead(10)
	p := New(srv.srv.URL+"/sub/", []string{"m1"}, 4)
	if err := p.Add(RoleReconnect, "m1"); err != nil {
		t.Fatal(err)
	}
	p.Start()
	waitFor(t, 5*time.Second, "viewer reached seq 10", func() bool {
		return p.viewers[0].lastSeq.Load() == 10
	})
	// frozen target is 50 but the origin never publishes beyond 10: the wire
	// can never satisfy the required range
	p.SetHeadLookup(func(string) (int64, bool) { return 50, true })
	p.HoldReconnectCohort()
	if n := p.ReleaseReconnectCohort(); n != 1 {
		t.Fatalf("released = %d, want 1", n)
	}
	time.Sleep(150 * time.Millisecond) // let the resume connect deliver its (empty) replay
	res := p.CollectReconnectResults()
	if len(res) != 1 {
		t.Fatalf("got %d results, want 1 (empty capture must still yield a result)", len(res))
	}
	var r *deep.PathResult
	for _, v := range res {
		r = v
	}
	if r.Passed {
		t.Fatalf("empty capture passed: %+v", r)
	}
	if r.ExpectedFirstSeq != 11 || r.ExpectedLastSeq != 50 || r.MissingRequired != 40 {
		t.Fatalf("unexpected evaluation: %+v", r)
	}
	if rs := p.Counters.ReconnectSucceeded.Load(); rs != 0 {
		t.Fatalf("ReconnectSucceeded = %d, want 0", rs)
	}
	p.Stop()
}

// ── restart drill: drain + spare failover ────────────────────────────────

func TestDrainAllPlannedAccountingAndSpareFailoverContinuity(t *testing.T) {
	primary := newMatchServer(t, true)
	primary.setHead(5)
	spare := newMatchServer(t, true)
	spare.setHead(7) // two events published while the shard is drained

	p := New(primary.srv.URL+"/sub/", []string{"m1"}, 8)
	p.SetSpare(spare.srv.URL + "/sub/")
	for i := 0; i < 2; i++ {
		if err := p.Add(RoleLight, "m1"); err != nil {
			t.Fatal(err)
		}
	}
	// registered but never started: never-established viewers are skipped by
	// DrainAll (nothing to attribute)
	if err := p.Add(RoleLight, "m1"); err != nil {
		t.Fatal(err)
	}
	p.StartIndices([]int{0, 1})
	waitFor(t, 5*time.Second, "both viewers at head 5", func() bool {
		return p.viewers[0].lastSeq.Load() == 5 && p.viewers[1].lastSeq.Load() == 5
	})

	if n := p.DrainAll(); n != 2 {
		t.Fatalf("DrainAll held %d viewers, want 2", n)
	}
	if cf, ud := p.Counters.ConnectionFailures.Load(), p.Counters.UnexpectedDisconnects.Load(); cf != 0 || ud != 0 {
		t.Fatalf("drain misattributed: cf=%d ud=%d", cf, ud)
	}
	if pd := p.Counters.PlannedDisconnects.Load(); pd != 2 {
		t.Fatalf("PlannedDisconnects = %d, want 2", pd)
	}

	p.ReleaseDrain() // activates the spare base
	if got := p.currentBase(); got != p.spareSub {
		t.Fatalf("currentBase = %q, want spare %q", got, p.spareSub)
	}
	waitFor(t, 10*time.Second, "viewers resumed on spare through seq 7", func() bool {
		return p.viewers[0].lastSeq.Load() == 7 && p.viewers[1].lastSeq.Load() == 7
	})
	// continuity across the failover: resume from 5, spare replays 6..7 —
	// any gap here would be a restart_failover_gap
	if m := p.Counters.MissingSequences.Load(); m != 0 {
		t.Fatalf("failover introduced %d missing sequences", m)
	}
	if c := spare.conns.Load(); c < 2 {
		t.Fatalf("spare accepted %d connections, want >= 2", c)
	}
	p.Stop()
}

// ── deep agreement eligibility ───────────────────────────────────────────

func TestDeepHeadAgreementEverEstablishedEligibility(t *testing.T) {
	p := New("http://127.0.0.1:9/sub/", []string{"m1"}, 2) // unused origin
	v := &viewer{matchID: "m1"}
	v.st.Role = RoleDeep
	p.viewers = append(p.viewers, v)
	p.deepIdx = []int{0}
	heads := map[string]CanonicalHead{
		"m1": {Seq: 7, Home: 1, Away: 0, Period: "1H", Elapsed: 600},
	}

	// never established: unmatched, never penalized as disagreement
	a, d, u := p.DeepHeadAgreement(heads)
	if a != 0 || d != 0 || u != 1 {
		t.Fatalf("fresh viewer: agreed=%d disagreed=%d unmatched=%d, want 0/0/1", a, d, u)
	}
	// established but never validated a deep frame: still unmatched
	v.everEst.Store(true)
	a, d, u = p.DeepHeadAgreement(heads)
	if u != 1 {
		t.Fatalf("established-no-deep viewer counted as matched: %d/%d/%d", a, d, u)
	}
	// validated frames: judged even though currently OFFLINE — this is the
	// regression against the old Connected==1 skip that silently dropped
	// viewers between repair reconnects
	v.sawDeep.Store(true)
	a, d, u = p.DeepHeadAgreement(heads)
	if d != 1 {
		t.Fatalf("offline-but-eligible viewer not judged: %d/%d/%d", a, d, u)
	}
	v.state.Started = true
	v.state.LastSeq = 7
	v.state.LastScoreHome = 1
	v.state.LastScoreAway = 0
	v.state.LastElapsed = 600
	v.state.LastPeriod = "1H"
	a, d, u = p.DeepHeadAgreement(heads)
	if a != 1 || d != 0 || u != 0 {
		t.Fatalf("agreeing viewer misjudged: %d/%d/%d", a, d, u)
	}
}

// A disagreed deep client must carry per-viewer attribution: both sides of
// every compared field plus liveness at sample time, so silent tail
// truncation (view seq < head seq) is distinguishable from a semantic
// mismatch at evidence time.
func TestDeepHeadDisagreementDetail(t *testing.T) {
	p := New("http://127.0.0.1:9/sub/", []string{"m1"}, 2) // unused origin
	v := &viewer{matchID: "m1"}
	v.st.Role = RoleDeep
	p.viewers = append(p.viewers, v)
	p.deepIdx = []int{0}
	v.everEst.Store(true)
	v.sawDeep.Store(true)

	// silent truncation: viewer stopped short of the final head seq
	v.state.Started = true
	v.state.LastSeq = 5
	v.state.LastScoreHome = 1
	v.state.LastScoreAway = 0
	v.state.LastElapsed = 500
	v.state.LastPeriod = "1H"
	heads := map[string]CanonicalHead{
		"m1": {Seq: 7, Home: 2, Away: 0, Period: "1H", Elapsed: 600},
	}
	a, d, u, details := p.DeepHeadAgreementDetailed(heads)
	if a != 0 || d != 1 || u != 0 {
		t.Fatalf("disagreeing viewer misjudged: %d/%d/%d", a, d, u)
	}
	if len(details) != 1 {
		t.Fatalf("want exactly 1 disagreement detail, got %d", len(details))
	}
	got := details[0]
	if got.MatchID != "m1" {
		t.Fatalf("wrong match id: %q", got.MatchID)
	}
	if got.ViewLastSeq != 5 || got.HeadSeq != 7 {
		t.Fatalf("seq sides wrong: view=%d head=%d", got.ViewLastSeq, got.HeadSeq)
	}
	if got.ViewHome != 1 || got.HeadHome != 2 {
		t.Fatalf("score sides wrong: view=%d head=%d", got.ViewHome, got.HeadHome)
	}
	if got.Live {
		t.Fatal("offline viewer must not be reported live")
	}

	// agreeing viewer produces no detail records
	p.viewers[0].state.LastSeq = 7
	p.viewers[0].state.LastScoreHome = 2
	p.viewers[0].state.LastElapsed = 600
	a, d, u, details = p.DeepHeadAgreementDetailed(heads)
	if a != 1 || d != 0 || len(details) != 0 {
		t.Fatalf("agreement must produce no details: %d/%d details=%d", a, d, len(details))
	}

	// unmatched viewer is never in the disagreement list
	p.viewers[0].sawDeep.Store(false)
	_, _, _, details = p.DeepHeadAgreementDetailed(heads)
	if len(details) != 0 {
		t.Fatalf("unmatched viewer leaked into details: %d", len(details))
	}
}

// ── parser edge cases ────────────────────────────────────────────────────

func TestParseUintRejectsNonNumericIDs(t *testing.T) {
	cases := []struct {
		in  string
		ok  bool
		val uint64
	}{
		{"", false, 0},
		{"   ", false, 0},
		{"42", true, 42},
		{" 7", true, 7}, // SSE "id: 7" yields a leading-space value
		{"12x", false, 0},
		{"-1", false, 0},
		{"99999999999999999999999", false, 0}, // overflow guard
	}
	for _, c := range cases {
		v, ok := parseUint([]byte(c.in))
		if ok != c.ok || (ok && v != c.val) {
			t.Fatalf("parseUint(%q) = (%d,%v), want (%d,%v)", c.in, v, ok, c.val, c.ok)
		}
	}
}

// ── R06: full-target latency provenance ─────────────────────────────────────

// Lower-population samples (pre-surge steady traffic) must never enter the
// goal/other fan-out evidence; surge/burst windows own their samples at any
// time. Only inside the full-target window do plain deep samples count.
func TestFullTargetWindowLatencyProvenance(t *testing.T) {
	p := New("http://unused/sub/", []string{"m1"}, 4)
	defer p.Stop()

	// Before the full-target window opens: nothing may reach goal/other.
	p.routeLatency(100, "goal")
	p.routeLatency(120, "other")
	if got := p.GoalHistogram().TotalCount + p.OtherHistogram().TotalCount; got != 0 {
		t.Fatalf("pre-full-target samples leaked into fan-out evidence: %d", got)
	}

	// Surge window owns its samples regardless of the gate state.
	p.BeginSurgeWindow()
	p.routeLatency(200, "other")
	p.EndSurgeWindow()
	if got := p.SurgeHistogram().TotalCount; got != 1 {
		t.Fatalf("surge histogram total = %d, want 1", got)
	}
	if got := p.GoalHistogram().TotalCount + p.OtherHistogram().TotalCount; got != 0 {
		t.Fatal("surge sample must not dilute fan-out evidence")
	}

	// Burst window likewise.
	p.BeginBurstWindow()
	p.routeLatency(300, "goal")
	p.EndBurstWindow()
	if got := p.BurstHistogram().TotalCount; got != 1 {
		t.Fatalf("burst histogram total = %d, want 1", got)
	}
	if got := p.GoalHistogram().TotalCount + p.OtherHistogram().TotalCount; got != 0 {
		t.Fatal("burst sample must not dilute fan-out evidence")
	}

	// After BeginFullTargetWindow: plain samples land in their classes.
	p.BeginFullTargetWindow()
	p.routeLatency(10, "goal")
	p.routeLatency(20, "other")
	p.routeLatency(30, "other")
	goal, other := p.GoalHistogram(), p.OtherHistogram()
	if goal.TotalCount != 1 || other.TotalCount != 2 {
		t.Fatalf("post-window routing wrong: goal=%d other=%d, want 1/2", goal.TotalCount, other.TotalCount)
	}
}

// A connect accepted by the kernel but never serviced (no response headers)
// must fail and retry, not hang the viewer goroutine forever. This is the
// harness-side guard for the silent population-shrink wedge observed at
// terminal scale: reconnect-cohort members drawn from hung viewers can
// never pass, and no retry ever happens.
func TestHangingServerFailsAndRetries(t *testing.T) {
	orig := responseHeaderTimeout
	responseHeaderTimeout = func() time.Duration { return 300 * time.Millisecond }
	defer func() { responseHeaderTimeout = orig }()

	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer l.Close()
	go func() {
		for {
			conn, err := l.Accept()
			if err != nil {
				return
			}
			// accept and hold: never read, never respond
			go func(c net.Conn) {
				time.Sleep(10 * time.Second)
				c.Close()
			}(conn)
		}
	}()

	p := New(fmt.Sprintf("http://%s/sub/", l.Addr().String()), []string{"match-001"}, 4)
	if err := p.Add(RoleLight, "match-001"); err != nil {
		t.Fatal(err)
	}
	p.StartIndices([]int{len(p.viewers) - 1})

	deadline := time.Now().Add(5 * time.Second)
	attempts := int64(0)
	for time.Now().Before(deadline) {
		attempts = p.Counters.ConnectionFailures.Load()
		if attempts >= 2 {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	if attempts < 2 {
		t.Fatalf("hanging server did not produce >=2 counted connection failures (got %d): viewer goroutine is hung", attempts)
	}
}

// ── resumed-stream backlog provenance ────────────────────────────────────────

// A deep viewer resuming with Last-Event-ID first replays buffered history:
// those frames carry pre-disconnect publish timestamps, so their recv-publish
// delta is backlog age. They must land in the backlog diagnostic class and
// never in the live fan-out evidence, until a fresh frame proves the stream
// reached the live tail.
func TestResumedStreamBacklogProvenance(t *testing.T) {
	p := New("http://unused/sub/", []string{"m1"}, 4)
	defer p.Stop()
	p.BeginFullTargetWindow()
	v := &viewer{}
	v.st.Role = RoleDeep
	v.matchID = "m1"

	// Simulate the resumed-stream state (as streamOnce sets it).
	v.catchUp.Store(true)

	// Old frame on a catching-up stream: backlog class, not live evidence.
	p.recordDeepLatency(v, 600000, 599990, 10, "goal")
	if got := p.GoalHistogram().TotalCount + p.OtherHistogram().TotalCount; got != 0 {
		t.Fatalf("backlog sample leaked into live fan-out evidence: %d", got)
	}
	if got := p.BacklogHistogram().TotalCount; got != 1 {
		t.Fatalf("backlog histogram total = %d, want 1", got)
	}
	if got := p.Counters.FanOutBacklogSamples.Load(); got != 1 {
		t.Fatalf("FanOutBacklogSamples = %d, want 1", got)
	}

	// Fresh frame (< threshold): proves live tail; catch-up ends and the
	// sample is genuine live evidence.
	p.recordDeepLatency(v, 40, 35, 5, "other")
	if v.catchUp.Load() {
		t.Fatal("fresh frame must clear the catch-up state")
	}
	if got := p.OtherHistogram().TotalCount; got != 1 {
		t.Fatalf("live-tail sample missing from other histogram: %d", got)
	}

	// After catch-up ends, even old-ish frames are ordinary live samples.
	p.recordDeepLatency(v, 4900, 4890, 10, "goal")
	if got := p.GoalHistogram().TotalCount; got != 1 {
		t.Fatalf("post-catch-up goal total = %d, want 1", got)
	}
	if got := p.BacklogHistogram().TotalCount; got != 1 {
		t.Fatalf("backlog total changed after catch-up: %d", got)
	}

	// Two-sided attribution diagnostics: every non-backlog sample is split
	// into publish→wire and wire→dispatch components.
	if got := p.TransportHistogram().TotalCount; got != 2 {
		t.Fatalf("transport attribution total = %d, want 2", got)
	}
	if got := p.ProcDelayHistogram().TotalCount; got != 2 {
		t.Fatalf("process-delay attribution total = %d, want 2", got)
	}
}

// Fresh (never-resumed) streams are never affected by the catch-up logic.
func TestFreshStreamLatencyUnaffected(t *testing.T) {
	p := New("http://unused/sub/", []string{"m1"}, 4)
	defer p.Stop()
	p.BeginFullTargetWindow()
	v := &viewer{}
	v.st.Role = RoleDeep
	v.matchID = "m1"

	p.recordDeepLatency(v, 600000, 599990, 10, "goal")
	if got := p.GoalHistogram().TotalCount; got != 1 {
		t.Fatalf("fresh-stream sample missing from goal histogram: %d", got)
	}
	if got := p.BacklogHistogram().TotalCount; got != 0 {
		t.Fatalf("fresh-stream sample misfiled as backlog: %d", got)
	}
}
