package pool

import (
	"fmt"
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
		if _, err := fmt.Fprintf(w, "id: %d\ndata: {\"n\":%d}\n\n", i, i); err != nil {
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
