// Package pool implements the lightweight viewer connection pool (design doc
// §3): one goroutine per connection, zero JSON decoding on the lightweight hot
// path, sequence continuity tracked from the frozen SSE id, shard-local state
// in one preallocated array, global aggregation via atomics only.
//
// Cohorts: light (continuity only), lobby (liveness only), reconnect (light +
// Last-Event-ID capture + exact-range replay proof), deep (full semantic +
// latency validation incl. payload/transport agreement).
//
// Coordination rules (race safety):
//   - every cross-goroutine lifecycle fact is an atomic (flags, lastSeq
//     mirror); plain ClientState fields stay owned by the viewer goroutine;
//   - Hold/Drain set the hold flag BEFORE cancelling the in-flight connection,
//     both under cancelMu, so a torn-down attempt can never be misattributed
//     as a failure (it either observes the flag or returns errPlannedDisconnect);
//   - resumeID / recFirst / recTarget are guarded by v.mu (orchestrator side);
//   - the capture slice is guarded by v.capMu (viewer writes, collector reads);
//   - reconnect required ranges are FROZEN at release time from the injected
//     independent publisher-head lookup — never derived from observed maxima.
package pool

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"ea/loadgen/internal/deep"
	"ea/loadgen/internal/hist"
	"ea/loadgen/internal/tracker"
)

type Role uint8

const (
	RoleLight Role = iota
	RoleLobby
	RoleReconnect
	RoleDeep
)

// Counters is the shard-global atomic aggregate (design doc §4: no locks on
// the hot path — one atomic add per frame counter at most).
type Counters struct {
	FramesReceived        atomic.Int64
	TransportIDPresent    atomic.Int64
	MissingSequences      atomic.Int64
	Duplicates            atomic.Int64
	OutOfOrder            atomic.Int64
	GapEvents             atomic.Int64
	ConnectionFailures    atomic.Int64
	UnexpectedDisconnects atomic.Int64
	PlannedDisconnects    atomic.Int64
	SchemaViolations      atomic.Int64
	StateViolations       atomic.Int64
	AgreementViolations   atomic.Int64 // deep: payload canonical_seq != sse id
	DeepFramesValidated   atomic.Int64 // frames fully validated by the deep cohort
	LobbyMalformed        atomic.Int64
	ReconnectAttempts     atomic.Int64
	ReconnectSucceeded    atomic.Int64
}

// ClientState mirrors design doc §3.1 (~64 B, fixed, no arrays). Owned by the
// viewer goroutine; cross-goroutine facts are mirrored into viewer atomics.
type ClientState struct {
	ID          int64
	MatchIdx    int32
	Role        Role
	SawFrame    bool
	LastSeq     uint64
	Received    uint64
	Missing     uint64
	Duplicates  uint64
	OutOfOrder  uint64
	Connected   uint32
	PlannedDisc uint32
}

// errPlannedDisconnect is returned by streamOnce when a connection attempt or
// live stream was torn down by a coordinated hold/drain. The run loop uses it
// to suppress failure attribution (no ConnectionFailure / UnexpectedDisconnect).
var errPlannedDisconnect = errors.New("planned disconnect")

type viewer struct {
	st      ClientState
	matchID string // "" for lobby

	// deep-role extras (owned by the viewer goroutine)
	state      deep.StateTracker
	scratch    []byte // last frame data payload (deep only)
	scratchLen int

	// ── coordinated lifecycle (atomics only) ──
	reconnectQ atomic.Bool   // held offline awaiting the coordinated release
	drained    atomic.Bool   // planned drain (restart drill) — suppresses attribution
	capturing  atomic.Bool   // record delivered seqs into capture while true
	everEst    atomic.Bool   // established at least once
	online     atomic.Bool   // currently established (goroutine-owned writes)
	sawDeep    atomic.Bool   // validated ≥1 deep frame (agreement eligibility)
	lastSeq    atomic.Uint64 // mirror of st.LastSeq for cross-goroutine reads

	cancelMu  sync.Mutex          // guards curCancel; makes hold-vs-connect race-free
	curCancel *context.CancelFunc // cancels the in-flight connection attempt

	mu        sync.Mutex // guards the orchestrator-side fields below
	resumeID  string     // captured Last-Event-ID pending transport use ("": none)
	recFirst  uint64     // frozen required-range lower bound (captured+1); 0 = none
	recTarget uint64     // frozen required-range upper bound (independent head)

	capMu   sync.Mutex // guards capture (viewer-goroutine writer, collector reader)
	capture []uint64   // received sequences while capture window open
}

// Pool owns every simulated viewer for one shard.
type Pool struct {
	subBase  string // e.g. http://host:8081/sub/
	spareSub string // restart failover target ("" = none)
	matchIDs []string

	viewers []*viewer
	deepIdx []int
	recIdx  []int

	Counters
	activeNow atomic.Int64

	goalHist  hist.Histogram
	otherHist hist.Histogram
	burstHist hist.Histogram
	histMu    sync.Mutex // deep cohort only (256 writers/shard)
	burstOpen atomic.Bool

	pathMu      sync.Mutex
	PathResults map[string]*deep.PathResult

	client *http.Client
	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup

	attempted   atomic.Int64
	established atomic.Int64
	surgeCursor atomic.Int64
	useSpare    atomic.Bool // dials go to spareSub once the failover is activated

	headFn func(matchID string) (int64, bool) // injected expected-head lookup (publisher evidence)
}

func New(subBase string, matchIDs []string, capacity int) *Pool {
	ctx, cancel := context.WithCancel(context.Background())
	transport := &http.Transport{
		DisableCompression: true,
		DialContext: (&net.Dialer{
			Timeout:   10 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		MaxIdleConns:        1024,
		MaxIdleConnsPerHost: 1024,
		MaxConnsPerHost:     0,
	}
	return &Pool{
		subBase:     strings.TrimSuffix(subBase, "/") + "/",
		matchIDs:    matchIDs,
		viewers:     make([]*viewer, 0, capacity),
		PathResults: make(map[string]*deep.PathResult),
		client:      &http.Client{Transport: transport},
		ctx:         ctx,
		cancel:      cancel,
		goalHist:    *hist.New(hist.DefaultMaxMs),
		otherHist:   *hist.New(hist.DefaultMaxMs),
		burstHist:   *hist.New(hist.DefaultMaxMs),
	}
}

// SetHeadLookup injects the independent publisher-evidence head source used to
// freeze reconnect/history ranges (expected side; never generator state).
func (p *Pool) SetHeadLookup(fn func(matchID string) (int64, bool)) { p.headFn = fn }

// SetSpare configures the failover subscriber base for the restart drill.
func (p *Pool) SetSpare(spareSubBase string) {
	p.spareSub = strings.TrimSuffix(spareSubBase, "/") + "/"
}

// currentBase selects primary vs failover subscriber base for new dials.
func (p *Pool) currentBase() string {
	if p.useSpare.Load() && p.spareSub != "" {
		return p.spareSub
	}
	return p.subBase
}

func matchChannel(matchID string) string { return "match:" + matchID }

// Add registers one viewer. idx must be unique within the pool.
func (p *Pool) Add(role Role, matchID string) error {
	v := &viewer{matchID: matchID, st: ClientState{MatchIdx: -1, Role: role}}
	switch role {
	case RoleLobby:
		if len(p.matchIDs) == 0 && matchID != "" {
			return errors.New("lobby viewer needs no match")
		}
	case RoleLight, RoleReconnect, RoleDeep:
		if matchID == "" {
			return errors.New("match viewer needs a match id")
		}
		for i, m := range p.matchIDs {
			if m == matchID {
				v.st.MatchIdx = int32(i)
				break
			}
		}
		if v.st.MatchIdx < 0 {
			return fmt.Errorf("unknown match %q", matchID)
		}
	}
	v.st.ID = int64(len(p.viewers))
	p.viewers = append(p.viewers, v)
	switch role {
	case RoleDeep:
		p.deepIdx = append(p.deepIdx, len(p.viewers)-1)
	case RoleReconnect:
		p.recIdx = append(p.recIdx, len(p.viewers)-1)
	}
	return nil
}

// Start launches one consumer goroutine per registered viewer.
func (p *Pool) Start() {
	for _, v := range p.viewers {
		vw := v
		p.wg.Add(1)
		go p.runLoop(vw)
	}
}

// Stop cancels every connection and waits for all goroutines.
func (p *Pool) Stop() {
	p.cancel()
	p.wg.Wait()
}

func (v *viewer) urlFor(base string) string {
	if v.st.Role == RoleLobby {
		return strings.TrimSuffix(base, "/") + "/lobby"
	}
	return base + matchChannel(v.matchID)
}

// runLoop maintains one viewer connection until pool shutdown. Coordinated
// holds (reconnect cohort / restart drain) park the loop offline without any
// connection attempt, so held viewers generate zero failure accounting.
func (p *Pool) runLoop(v *viewer) {
	defer p.wg.Done()
	for p.ctx.Err() == nil {
		if v.reconnectQ.Load() {
			// held offline awaiting the coordinated release
			select {
			case <-p.ctx.Done():
				return
			case <-time.After(20 * time.Millisecond):
			}
			continue
		}
		v.mu.Lock()
		resume := v.resumeID
		v.mu.Unlock()

		frames, established, err := p.streamOnce(v, v.urlFor(p.currentBase()), resume)
		if p.ctx.Err() != nil {
			return
		}
		switch {
		case errors.Is(err, errPlannedDisconnect),
			v.reconnectQ.Load(), // hold landed mid-stream: planned cancel
			v.drained.Load():    // drain landed mid-stream: planned cancel
			// planned teardown — no failure attribution
		default:
			// establishment failure counts once per failed attempt; a stream
			// that died before carrying any frame is a failure too
			if !established || frames == 0 {
				p.Counters.ConnectionFailures.Add(1)
			}
			// established-then-dropped while population must stay up
			if established {
				p.Counters.UnexpectedDisconnects.Add(1)
			}
		}
		if !v.reconnectQ.Load() && !v.drained.Load() {
			// immediate steady-state repair reconnect (not the cohort hold)
			select {
			case <-p.ctx.Done():
				return
			case <-time.After(250 * time.Millisecond):
			}
		}
	}
}

// streamOnce consumes one SSE connection with a byte-level parser
// (ReadSlice('\n'), no Scanner token allocation). Returns frames dispatched,
// whether the connection was established (HTTP 200 + bookkeeping), and the
// terminal error. The per-attempt context is cancelable through the viewer so
// coordinated holds tear the connection down immediately and cleanly.
func (p *Pool) streamOnce(v *viewer, url, resumeID string) (frames int64, established bool, err error) {
	cctx, ccancel := context.WithCancel(p.ctx)
	v.cancelMu.Lock()
	v.curCancel = &ccancel
	v.cancelMu.Unlock()
	defer func() {
		v.cancelMu.Lock()
		if v.curCancel != nil && v.curCancel == &ccancel {
			v.curCancel = nil
		}
		v.cancelMu.Unlock()
		ccancel()
	}()

	req, err := http.NewRequestWithContext(cctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, false, err
	}
	req.Header.Set("accept", "text/event-stream")
	req.Header.Set("cache-control", "no-cache")
	if resumeID != "" {
		req.Header.Set("last-event-id", resumeID)
	}
	p.NoteAttempt(1)
	resp, err := p.client.Do(req)
	if err != nil {
		return 0, false, err
	}
	if v.reconnectQ.Load() || v.drained.Load() {
		// hold/drain raced the attempt: tear down without establishment bookkeeping
		resp.Body.Close()
		return 0, false, errPlannedDisconnect
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return 0, false, fmt.Errorf("subscribe %s -> %d", url, resp.StatusCode)
	}

	p.NoteEstablish(1)
	p.activeNow.Add(1)
	established = true
	v.st.Connected = 1
	v.online.Store(true)
	v.everEst.Store(true)
	defer func() {
		v.online.Store(false)
		v.st.Connected = 0
		p.activeNow.Add(-1)
	}()

	if resumeID == "" {
		// Fresh subscription: the server makes no replay promise, so
		// continuity is judged per-connection. Cross-connection exactness is
		// asserted only on Last-Event-ID resume paths (assignment semantics).
		resetContinuity(&v.st)
	} else {
		// consume the pending resume exactly once (retry keeps it on failure)
		v.mu.Lock()
		v.resumeID = ""
		v.mu.Unlock()
	}

	br := bufio.NewReaderSize(resp.Body, 32*1024)
	var curID []byte

	dispatch := func() {
		if v.scratchLen == 0 && len(curID) == 0 {
			return
		}
		frames++
		p.dispatch(v, curID)
		curID = curID[:0]
		v.scratchLen = 0
	}

	for cctx.Err() == nil {
		line, rerr := br.ReadSlice('\n')
		if rerr != nil {
			if errors.Is(rerr, bufio.ErrBufferFull) {
				// oversized data line: count payload bytes, framing only
				if v.st.Role == RoleDeep && dataPrefix(line) {
					p.appendScratch(v, line[5:])
				} else if !dataPrefix(line) {
					// an id line can never be this large; treat as framing noise
					curID = curID[:0]
				}
				continue
			}
			if len(line) > 0 {
				if v.st.Role == RoleDeep && dataPrefix(line) {
					p.appendScratch(v, line[5:])
				}
				continue
			}
			return frames, true, rerr
		}
		trimmed := trimCR(line)
		switch {
		case len(trimmed) == 0:
			dispatch()
		case hasPrefixColon(trimmed, "id"):
			curID = append(curID[:0], trimmed[3:]...)
			p.Counters.TransportIDPresent.Add(1)
		case hasPrefixColon(trimmed, "data"):
			payload := trimmed[5:]
			if v.st.Role == RoleDeep {
				p.appendScratch(v, payload)
			}
		default:
			// event:, retry:, comments — ignored by the lightweight path
		}
	}
	return frames, true, cctx.Err()
}

func dataPrefix(line []byte) bool { return hasPrefixColon(line, "data") }

func (p *Pool) appendScratch(v *viewer, b []byte) {
	b = bytes.TrimLeft(b, " ")
	if len(v.scratch) < v.scratchLen+len(b) {
		grow := make([]byte, v.scratchLen+len(b), (v.scratchLen+len(b))*2)
		copy(grow, v.scratch[:v.scratchLen])
		v.scratch = grow
	}
	copy(v.scratch[v.scratchLen:], b)
	v.scratchLen += len(b)
}

func trimCR(line []byte) []byte {
	if n := len(line); n >= 1 && line[n-1] == '\n' {
		line = line[:n-1]
		if n2 := len(line); n2 >= 1 && line[n2-1] == '\r' {
			line = line[:n2-1]
		}
	}
	return line
}

// hasPrefixColon reports whether line starts with "<name>:" and returns the
// value slice bounds handled by the caller.
func hasPrefixColon(line []byte, name string) bool {
	if len(line) < len(name)+1 {
		return false
	}
	if string(line[:len(name)]) != name || line[len(name)] != ':' {
		return false
	}
	return true
}

// dispatch processes one frame. The lightweight path parses ONLY the id field
// (uint). Deep viewers additionally decode the full payload once.
func (p *Pool) dispatch(v *viewer, id []byte) {
	now := time.Now()
	p.Counters.FramesReceived.Add(1)

	if v.st.Role == RoleLobby {
		// liveness accounting only (frames carry no comparable sequence)
		return
	}

	seq, ok := parseUint(id)
	if !ok {
		p.Counters.SchemaViolations.Add(1)
		return
	}

	if v.capturing.Load() {
		v.capMu.Lock()
		v.capture = append(v.capture, seq)
		v.capMu.Unlock()
	}

	kind, missing := observe(&v.st, seq)
	v.lastSeq.Store(v.st.LastSeq)
	if missing > 0 {
		p.Counters.MissingSequences.Add(missing)
	}
	switch kind {
	case tracker.Gap:
		p.Counters.GapEvents.Add(1)
	case tracker.Duplicate:
		p.Counters.Duplicates.Add(1)
	case tracker.OutOfOrder:
		p.Counters.OutOfOrder.Add(1)
	}

	if v.st.Role == RoleLight || v.st.Role == RoleReconnect {
		return
	}

	// ── deep cohort: full payload validation ──
	if v.scratchLen == 0 {
		return
	}
	data := v.scratch[:v.scratchLen]
	ev, err := deep.ValidateSchema(data, v.matchID)
	if err != nil {
		p.Counters.SchemaViolations.Add(1)
		return
	}
	p.Counters.DeepFramesValidated.Add(1)
	v.sawDeep.Store(true)
	if uint64(ev.CanonicalSeq) != seq {
		p.Counters.AgreementViolations.Add(1)
	}
	v.state.Observe(ev)
	if pubMs, err := deep.FastIsoMs(ev.PublishTimestamp); err == nil {
		lat := int(now.UnixMilli() - pubMs)
		if lat < 0 {
			p.Counters.SchemaViolations.Add(1)
		} else {
			p.histMu.Lock()
			if p.burstOpen.Load() {
				p.burstHist.Record(lat)
			} else if ev.EventType == "goal" {
				p.goalHist.Record(lat)
			} else {
				p.otherHist.Record(lat)
			}
			p.histMu.Unlock()
		}
	}
}

// BeginBurstWindow routes deep-cohort latency samples into the burst histogram
// until EndBurstWindow is called (burst-phase isolation, coordinator gate).
func (p *Pool) BeginBurstWindow() { p.burstOpen.Store(true) }

// EndBurstWindow closes the burst sample window.
func (p *Pool) EndBurstWindow() { p.burstOpen.Store(false) }

// HistogramSnapshot returns serialized histogram evidence.
func (p *Pool) GoalHistogram() hist.Serialized  { return p.goalHist.Serialize() }
func (p *Pool) OtherHistogram() hist.Serialized { return p.otherHist.Serialize() }
func (p *Pool) BurstHistogram() hist.Serialized { return p.burstHist.Serialize() }

// CanonicalHead is the expected-side match state fetched from the independent
// publisher control service (never derived from generator observations).
type CanonicalHead struct {
	Seq     int64
	Home    int
	Away    int
	Period  string
	Elapsed int
}

// DeepHeadAgreement compares each deep viewer's reconstructed final state
// against independently fetched canonical heads. Call after publication has
// quiesced and heads are final; connections may still be live — eligibility
// is ever-established-and-validating (everEst + sawDeep), NOT
// currently-connected, so a viewer between repair reconnects at sample time
// is still judged rather than silently dropped. State reads happen in the
// quiesced window (publication stopped, no frames in flight); Stop() joins
// the goroutines before process exit.
func (p *Pool) DeepHeadAgreement(heads map[string]CanonicalHead) (agreed, disagreed, unmatched int64) {
	for _, i := range p.deepIdx {
		v := p.viewers[i]
		head, ok := heads[v.matchID]
		if !ok || !v.everEst.Load() || !v.sawDeep.Load() {
			unmatched++
			continue
		}
		if v.state.AgreeWithHead(head.Seq, head.Home, head.Away, head.Elapsed, head.Period) {
			agreed++
		} else {
			disagreed++
		}
	}
	return agreed, disagreed, unmatched
}

func resetContinuity(st *ClientState) {
	st.SawFrame = false
	st.LastSeq = 0
}

// observe advances one client's continuity state machine lock-free (the
// goroutine owns the struct). Returns the transition kind and how many
// missing frames this gap introduced (0 unless kind == Gap).
func observe(st *ClientState, seq uint64) (tracker.Kind, int64) {
	st.Received++
	if !st.SawFrame {
		st.SawFrame = true
		st.LastSeq = seq
		return tracker.First, 0
	}
	switch {
	case seq == st.LastSeq+1:
		st.LastSeq = seq
		return tracker.Next, 0
	case seq == st.LastSeq:
		st.Duplicates++
		return tracker.Duplicate, 0
	case seq > st.LastSeq+1:
		gap := seq - st.LastSeq - 1
		st.Missing += gap
		st.LastSeq = seq
		return tracker.Gap, int64(gap)
	default:
		st.OutOfOrder++
		return tracker.OutOfOrder, 0
	}
}

// parseUint parses leading decimal digits (SSE id field) without allocation.
func parseUint(b []byte) (uint64, bool) {
	if len(b) == 0 {
		return 0, false
	}
	var v uint64
	i := 0
	for i < len(b) && b[i] == ' ' {
		i++
	}
	if i >= len(b) {
		return 0, false
	}
	for ; i < len(b); i++ {
		c := b[i]
		if c < '0' || c > '9' {
			return 0, false // Nchan msgids are plain integers; reject anything else
		}
		nv := v*10 + uint64(c-'0')
		if nv < v {
			return 0, false
		}
		v = nv
	}
	return v, true
}

// ── coordinated cohort operations ───────────────────────────────────────

// awaitOffline polls until every viewer matching pending has dropped offline
// (online == false), or the timeout elapses.
func (p *Pool) awaitOffline(pending func(*viewer) bool, timeout time.Duration) {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		allDown := true
		for _, v := range p.viewers {
			if pending(v) && v.online.Load() {
				allDown = false
				break
			}
		}
		if allDown {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
}

// HoldReconnectCohort flags every eligible reconnect-cohort viewer for a
// planned disconnect and waits until each has actually dropped offline. The
// Last-Event-ID is frozen from the mirrored last-seen sequence; the flag is
// raised before the cancel fires so teardown can never be misattributed.
func (p *Pool) HoldReconnectCohort() {
	for _, i := range p.recIdx {
		v := p.viewers[i]
		last := v.lastSeq.Load()
		if last == 0 {
			continue // never established; nothing to resume
		}
		v.cancelMu.Lock()
		v.mu.Lock()
		v.resumeID = strconv.FormatUint(last, 10)
		v.mu.Unlock()
		v.reconnectQ.Store(true) // flag BEFORE cancel: teardown observes it
		if v.curCancel != nil {
			(*v.curCancel)()
		}
		v.cancelMu.Unlock()
		p.Counters.PlannedDisconnects.Add(1)
	}
	p.awaitOffline(func(v *viewer) bool { return v.reconnectQ.Load() }, 30*time.Second)
}

// ReleaseReconnectCohort lets the held viewers reconnect with their captured
// Last-Event-ID. Freezes each required range as [captured+1 .. publisher-head]
// using the independent expected-side lookup AT RELEASE TIME (the range never
// moves afterwards, regardless of what the wire delivers); opens the capture
// window. Viewers whose head shows nothing to replay are unheld without a
// capture window. Returns how many viewers were released with a live window.
func (p *Pool) ReleaseReconnectCohort() int {
	released := 0
	for _, i := range p.recIdx {
		v := p.viewers[i]
		if !v.reconnectQ.Load() {
			continue // never held this cycle
		}
		v.mu.Lock()
		resumeStr := v.resumeID
		v.mu.Unlock()
		if resumeStr == "" {
			v.reconnectQ.Store(false) // held without capture: just unhold
			continue
		}
		captured, _ := strconv.ParseUint(resumeStr, 10, 64)
		var head int64
		var ok bool
		if p.headFn != nil {
			head, ok = p.headFn(v.matchID)
		}
		if !ok || head <= int64(captured) {
			// no new events since capture: nothing to replay
			v.mu.Lock()
			v.resumeID = ""
			v.mu.Unlock()
			v.reconnectQ.Store(false)
			continue
		}
		v.mu.Lock()
		v.recFirst = captured + 1
		v.recTarget = uint64(head)
		v.mu.Unlock()
		v.capMu.Lock()
		v.capture = v.capture[:0]
		v.capMu.Unlock()
		v.capturing.Store(true) // window opens BEFORE unhold: no frame escapes
		v.reconnectQ.Store(false)
		p.Counters.ReconnectAttempts.Add(1)
		released++
	}
	return released
}

// CollectReconnectResults closes capture windows and evaluates exactness per
// released viewer against its FROZEN range. Every released viewer yields a
// result — an empty capture is a failed result (everything missing), never a
// silent pass-by-absence.
func (p *Pool) CollectReconnectResults() map[string]*deep.PathResult {
	out := make(map[string]*deep.PathResult)
	for _, i := range p.recIdx {
		v := p.viewers[i]
		v.capturing.Store(false) // close the window first
		v.capMu.Lock()
		snap := v.capture
		v.capture = nil
		v.capMu.Unlock()
		v.mu.Lock()
		first, target := v.recFirst, v.recTarget
		v.recFirst, v.recTarget = 0, 0
		v.mu.Unlock()
		if first == 0 {
			continue // never released this cycle
		}
		resumeEv := strconv.FormatUint(first-1, 10)
		res := deep.EvaluateRequiredRange(resumeEv, int64(first), int64(target), snap, 0)
		p.Counters.ReconnectSucceeded.Add(b2i(res.Passed))
		out[v.matchID+"#"+strconv.FormatInt(v.st.ID, 10)] = res
	}
	return out
}

func b2i(b bool) int64 {
	if b {
		return 1
	}
	return 0
}

// ── one-shot probe clients (late-join history, restart spare/failover) ──

// ProbeSpec freezes a required range BEFORE connecting: expected side is the
// independently fetched publisher head; observed side is what the wire sends.
type ProbeSpec struct {
	Key      string // evidence path key ("late_join:<match>", "spare_probe", ...)
	URL      string // complete subscribe/history URL
	MatchID  string
	ResumeID string // Last-Event-ID header ("" = full history endpoint)
	Target   uint64 // frozen upper bound of the required range
	First    uint64 // frozen lower bound (history endpoints replay from channel start)
}

// RunProbe connects once, consumes frames until Target reached or timeout,
// then evaluates the frozen required range exactly.
func (p *Pool) RunProbe(ctx context.Context, spec ProbeSpec, timeout time.Duration) *deep.PathResult {
	pctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	start := time.Now()

	req, err := http.NewRequestWithContext(pctx, http.MethodGet, spec.URL, nil)
	if err != nil {
		return failedProbe(spec, err.Error())
	}
	req.Header.Set("accept", "text/event-stream")
	if spec.ResumeID != "" {
		req.Header.Set("last-event-id", spec.ResumeID)
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return failedProbe(spec, err.Error())
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return failedProbe(spec, fmt.Sprintf("probe %s -> %d", spec.URL, resp.StatusCode))
	}

	br := bufio.NewReaderSize(resp.Body, 32*1024)
	var curID []byte
	var received []uint64
	scratch := make([]byte, 0, 4096)
	scratchLen := 0

	dispatch := func() *deep.PathResult {
		if len(curID) == 0 {
			return nil
		}
		seq, ok := parseUint(curID)
		curID = curID[:0]
		if !ok {
			return nil
		}
		received = append(received, seq)
		if spec.ResumeID != "" && scratchLen > 0 {
			// deep check on resumed payload when available (agreement proof)
			if ev, err := deep.ValidateSchema(scratch[:scratchLen], spec.MatchID); err == nil {
				if uint64(ev.CanonicalSeq) != seq {
					p.Counters.AgreementViolations.Add(1)
				}
			} else {
				p.Counters.SchemaViolations.Add(1)
			}
		}
		scratchLen = 0
		if seq >= spec.Target {
			return deep.EvaluateRequiredRange(spec.ResumeID, int64(spec.First), int64(spec.Target), received, time.Since(start).Milliseconds())
		}
		return nil
	}

	for {
		line, rerr := br.ReadSlice('\n')
		if rerr != nil {
			break
		}
		trimmed := trimCR(line)
		switch {
		case len(trimmed) == 0:
			if res := dispatch(); res != nil {
				p.recordPath(spec.Key, res)
				return res
			}
		case hasPrefixColon(trimmed, "id"):
			curID = append(curID[:0], trimmed[3:]...)
			p.Counters.TransportIDPresent.Add(1)
		case hasPrefixColon(trimmed, "data"):
			payload := bytes.TrimLeft(trimmed[5:], " ")
			if scratchLen+len(payload) > cap(scratch) {
				grow := make([]byte, scratchLen+len(payload), (scratchLen+len(payload))*2)
				copy(grow, scratch[:scratchLen])
				scratch = grow
			}
			copy(scratch[scratchLen:], payload)
			scratchLen += len(payload)
		}
		if pctx.Err() != nil {
			break
		}
	}
	res := deep.EvaluateRequiredRange(spec.ResumeID, int64(spec.First), int64(spec.Target), received, time.Since(start).Milliseconds())
	res.Passed = false // target not confirmed before stream end
	p.recordPath(spec.Key, res)
	return res
}

func failedProbe(spec ProbeSpec, detail string) *deep.PathResult {
	return &deep.PathResult{
		TransportResumeID: spec.ResumeID,
		ExpectedFirstSeq:  int64(spec.First),
		ExpectedLastSeq:   int64(spec.Target),
		ExpectedCount:     int64(spec.Target - spec.First + 1),
		Passed:            false,
	}
}

func (p *Pool) recordPath(key string, res *deep.PathResult) {
	p.pathMu.Lock()
	p.PathResults[key] = res
	p.pathMu.Unlock()
}

// TakePathResults drains accumulated path evidence for result assembly.
func (p *Pool) TakePathResults() map[string]*deep.PathResult {
	p.pathMu.Lock()
	defer p.pathMu.Unlock()
	out := p.PathResults
	p.PathResults = make(map[string]*deep.PathResult)
	return out
}

// DrainAll performs planned attribution + hold of every EVER-ESTABLISHED
// viewer (restart-drill prelude): captures Last-Event-ID per match viewer,
// marks drained, cancels each connection under cancelMu, waits for all
// connections to drop offline. Lobby viewers are drained too (planned) — a
// DUT restart kills their sockets and an undrained lobby would poison the
// unexpected-disconnect counter. Never-established viewers are skipped.
func (p *Pool) DrainAll() int64 {
	n := int64(0)
	for _, v := range p.viewers {
		if !v.everEst.Load() {
			continue
		}
		v.cancelMu.Lock()
		if v.st.Role != RoleLobby {
			if last := v.lastSeq.Load(); last != 0 {
				v.mu.Lock()
				v.resumeID = strconv.FormatUint(last, 10)
				v.mu.Unlock()
			}
		}
		v.drained.Store(true)
		v.reconnectQ.Store(true)
		if v.curCancel != nil {
			(*v.curCancel)()
		}
		v.cancelMu.Unlock()
		p.Counters.PlannedDisconnects.Add(1)
		n++
	}
	p.awaitOffline(func(v *viewer) bool { return v.drained.Load() }, 60*time.Second)
	return n
}

// ReleaseDrain reconnects every held viewer. Capture windows stay closed;
// pool-level continuity counters accumulate across the failover (gaps there
// are the restart_failover_* assignment metrics). If a spare base is
// configured, subsequent dials go to the spare.
func (p *Pool) ReleaseDrain() {
	if p.spareSub != "" {
		p.useSpare.Store(true)
	}
	for _, v := range p.viewers {
		v.drained.Store(false)
		v.reconnectQ.Store(false)
	}
}

// ActiveCurrent reports the current established-connection estimate.
func (p *Pool) ActiveCurrent() int64 { return p.activeNow.Load() }

// AttemptedTotal / EstablishedTotal derive from counters for sampling.
func (p *Pool) AttemptedTotal() int64 {
	return p.attempted.Load()
}

func (p *Pool) EstablishedTotal() int64 {
	return p.established.Load()
}

// NoteAttempt / NoteEstablish are called around connection attempts so the
// aligned sampler can report rates without walking the viewer array.
func (p *Pool) NoteAttempt(n int64)   { p.attempted.Add(n) }
func (p *Pool) NoteEstablish(n int64) { p.established.Add(n) }

// ViewerCount reports registered viewers.
func (p *Pool) ViewerCount() int { return len(p.viewers) }

// AppendLightViewer registers one additional lightweight match viewer
// distributed round-robin across matches WITHOUT starting it (surge ramp).
// Returns its index for a later StartIndices call.
func (p *Pool) AppendLightViewer() (int, error) {
	if len(p.matchIDs) == 0 {
		return -1, errors.New("no matches configured")
	}
	m := p.matchIDs[int(p.surgeCursor.Load())%len(p.matchIDs)]
	p.surgeCursor.Add(1)
	if err := p.Add(RoleLight, m); err != nil {
		return -1, err
	}
	return len(p.viewers) - 1, nil
}

// StartIndices launches consumer goroutines for specific viewer indices.
func (p *Pool) StartIndices(idx []int) {
	for _, i := range idx {
		if i < 0 || i >= len(p.viewers) {
			continue
		}
		vw := p.viewers[i]
		p.wg.Add(1)
		go p.runLoop(vw)
	}
}
