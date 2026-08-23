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
	FramesReceived           atomic.Int64
	TransportIDPresent       atomic.Int64
	MissingTransportID       atomic.Int64
	MissingSequences         atomic.Int64
	Duplicates               atomic.Int64
	OutOfOrder               atomic.Int64
	GapEvents                atomic.Int64
	ConnectionFailures       atomic.Int64
	UnexpectedDisconnects    atomic.Int64
	PlannedDisconnects       atomic.Int64
	SchemaViolations         atomic.Int64
	StateViolations          atomic.Int64
	AgreementViolations      atomic.Int64 // deep: payload canonical_seq != sse id (deprecated, transport vs canonical separate)
	DeepFramesValidated      atomic.Int64 // frames fully validated by the deep cohort
	LobbyMalformed           atomic.Int64
	ReconnectAttempts        atomic.Int64
	ReconnectSucceeded       atomic.Int64
	ReconnectMissingRawID    atomic.Int64 // held clients with no observed wire id
	MissingCanonicalSeq      atomic.Int64
	CanonicalParseErrors     atomic.Int64
	JSONParseErrors          atomic.Int64
	InvalidTimestampCount    atomic.Int64
	CanonicalStateViolations atomic.Int64
	FanOutBacklogSamples     atomic.Int64 // resumed-stream replay frames excluded from live latency evidence
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
	catchUp    atomic.Bool   // resumed stream still replaying buffered history
	readAt     atomic.Int64  // unix-ms arrival of the current frame's first bytes

	// goroutine-owned stream facts (no cross-goroutine writes)
	curBase string // subscriber base of the in-flight connection

	cancelMu  sync.Mutex          // guards curCancel; makes hold-vs-connect race-free
	curCancel *context.CancelFunc // cancels the in-flight connection attempt

	mu            sync.Mutex // guards the orchestrator-side fields below
	resumeID      string     // captured Last-Event-ID pending transport use ("": none)
	recFirst      uint64     // frozen required-range lower bound (captured+1); 0 = none
	recTarget     uint64     // frozen required-range upper bound (independent head)
	capturedCanon uint64     // canonical seq captured at hold time for range freeze

	capMu     sync.Mutex // guards capture (viewer-goroutine writer, collector reader)
	capture   []uint64   // received sequences while capture window open
	lastRawID string     // last SSE id string for Last-Event-ID resume
	lastCanon uint64     // last canonical_seq extracted from payload (0 = none)
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

	goalHist    hist.Histogram
	otherHist   hist.Histogram
	burstHist   hist.Histogram
	surgeHist   hist.Histogram
	backlogHist    hist.Histogram // resumed-stream history replay (not live evidence)
	transportHist  hist.Histogram // publish→wire-arrival attribution (DUT-side)
	procHist       hist.Histogram // wire-arrival→dispatch attribution (harness-side)

	upMu       sync.Mutex
	upstreams  map[string]*upstreamTransport // per-subscriber-base delivery attribution
	slowRing   [slowRingSize]SlowDelivery    // timestamped slow-delivery timeline (evidence)
	slowIdx    int
	histMu      sync.Mutex     // deep cohort only (256 writers/shard)
	burstOpen atomic.Bool
	surgeOpen atomic.Bool
	// fullTargetOpen gates terminal fan-out evidence: only deep-cohort
	// latency observed after the post-surge full population is reached may
	// enter the goal/other histograms (R06 provenance rule).
	fullTargetOpen atomic.Bool

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

// responseHeaderTimeout bounds the wait for SSE response headers. A package
// variable so tests can shorten it; production default is 15s.
var responseHeaderTimeout = func() time.Duration { return 15 * time.Second }

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
		// Bound the wait for response HEADERS only (SSE bodies stream
		// indefinitely afterwards). Without this, a connect accepted by the
		// kernel but never serviced by the server blocks the viewer goroutine
		// forever: the population silently shrinks, no retry ever happens,
		// and reconnect-cohort members drawn from the missing viewers can
		// never pass.
		ResponseHeaderTimeout: responseHeaderTimeout(),
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
		surgeHist:     *hist.New(hist.DefaultMaxMs),
		backlogHist:   *hist.New(hist.DefaultMaxMs),
		upstreams:     make(map[string]*upstreamTransport),
		transportHist: *hist.New(hist.DefaultMaxMs),
		procHist:      *hist.New(hist.DefaultMaxMs),
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

func matchChannel(matchID string) string { return matchID }

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
		return strings.TrimSuffix(base, "/") + "/sub/lobby"
	}
	return strings.TrimSuffix(base, "/") + "/sub/" + matchChannel(v.matchID)
}

// runLoop maintains one viewer connection until pool shutdown. Coordinated
// holds (reconnect cohort / restart drain) park the loop offline without any
// connection attempt, so held viewers generate zero failure accounting.
func (p *Pool) runLoop(v *viewer) {
	defer p.wg.Done()
	// Deterministic reconnect stagger: releasing a drained pool wakes every
	// viewer goroutine at once, and 12k simultaneous dials spike the
	// generator container past its frozen CPU-health envelope exactly during
	// the failover window. Spreading repairs by viewer ID (~2s span) is
	// semantically neutral — the settle gate bounds total recovery time.
	wasHeldOffline := false
	for p.ctx.Err() == nil {
		if v.reconnectQ.Load() {
			// held offline awaiting the coordinated release
			wasHeldOffline = true
			select {
			case <-p.ctx.Done():
				return
			case <-time.After(20 * time.Millisecond):
			}
			continue
		}
		if wasHeldOffline {
			wasHeldOffline = false
			select {
			case <-p.ctx.Done():
				return
			case <-time.After(time.Duration(v.st.ID%100) * 20 * time.Millisecond):
			}
		}
		v.mu.Lock()
		resume := v.resumeID
		v.mu.Unlock()

		base := p.currentBase()
	v.curBase = base
	frames, established, err := p.streamOnce(v, v.urlFor(base), resume)
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
		resetContinuity(&v.st)
	} else {
		v.mu.Lock()
		v.resumeID = ""
		v.mu.Unlock()
		// Resumed streams start inside buffered history; latency samples are
		// diverted to the backlog histogram until a fresh frame proves the
		// stream reached the live tail (see liveTailThresholdMs).
		v.catchUp.Store(true)
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
				if v.matchID != "" {
					if dataPrefix(line) {
						p.appendScratch(v, line[5:])
					}
				} else if !dataPrefix(line) {
					curID = curID[:0]
				}
				continue
			}
			if len(line) > 0 {
				if v.matchID != "" {
					if dataPrefix(line) {
						p.appendScratch(v, line[5:])
					}
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
			if v.matchID != "" {
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
	if v.scratchLen == 0 {
		// First chunk of a new frame: stamp wire arrival for two-sided
		// latency attribution (publish→read vs read→dispatch).
		v.readAt.Store(time.Now().UnixMilli())
	}
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

func (p *Pool) dispatch(v *viewer, id []byte) {
	now := time.Now()
	p.Counters.FramesReceived.Add(1)

	if v.st.Role == RoleLobby {
		if v.scratchLen > 0 {
			if !bytes.Contains(v.scratch[:v.scratchLen], []byte(`"matches"`)) {
				p.Counters.LobbyMalformed.Add(1)
			}
		}
		return
	}

	rawID := string(bytes.TrimSpace(id))
	if rawID == "" {
		p.Counters.MissingTransportID.Add(1)
		return
	}
	v.mu.Lock()
	v.lastRawID = rawID
	v.mu.Unlock()
	p.Counters.TransportIDPresent.Add(1)

	var canonSeq uint64
	if v.scratchLen > 0 {
		if c, ok := extractCanonSeq(v.scratch[:v.scratchLen]); ok {
			canonSeq = c
			v.mu.Lock()
			v.lastCanon = c
			v.mu.Unlock()
		} else {
			if bytes.Index(v.scratch[:v.scratchLen], []byte(`"canonical_seq"`)) < 0 {
				p.Counters.MissingCanonicalSeq.Add(1)
			} else {
				p.Counters.CanonicalParseErrors.Add(1)
			}
			p.Counters.JSONParseErrors.Add(1)
			return
		}
	} else {
		p.Counters.MissingCanonicalSeq.Add(1)
		return
	}

	if v.capturing.Load() {
		v.capMu.Lock()
		v.capture = append(v.capture, canonSeq)
		v.capMu.Unlock()
	}

	kind, missing := observe(&v.st, canonSeq)
	v.lastSeq.Store(v.st.LastSeq)
	v.mu.Lock()
	v.lastCanon = canonSeq
	v.mu.Unlock()
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
		p.Counters.DeepFramesValidated.Add(1)
		v.sawDeep.Store(true)
		if v.st.Role == RoleLight {
			return
		}
		if v.st.Role == RoleReconnect {
			return
		}
	}

	if v.scratchLen == 0 {
		return
	}
	data := v.scratch[:v.scratchLen]
	ev, err := deep.ValidateSchema(data, v.matchID)
	if err != nil {
		p.Counters.SchemaViolations.Add(1)
		p.Counters.JSONParseErrors.Add(1)
		if strings.Contains(err.Error(), "publish_timestamp") {
			p.Counters.InvalidTimestampCount.Add(1)
		}
		return
	}
	p.Counters.DeepFramesValidated.Add(1)
	v.sawDeep.Store(true)
	prevViolations := v.state.Violations
	v.state.Observe(ev)
	if v.state.Violations > prevViolations {
		p.Counters.CanonicalStateViolations.Add(1)
		p.Counters.StateViolations.Add(1)
	}
	if pubMs, err := deep.FastIsoMs(ev.PublishTimestamp); err != nil {
		p.Counters.InvalidTimestampCount.Add(1)
	} else {
		latMs := int(now.UnixMilli() - pubMs)
		if latMs < 0 {
			latMs = 0
		}
		readAtMs := v.readAt.Load()
		transportMs := int(readAtMs - pubMs)
		if transportMs < 0 {
			transportMs = 0
		}
		procMs := int(now.UnixMilli() - readAtMs)
		if procMs < 0 {
			procMs = 0
		}
		p.recordDeepLatency(v, latMs, transportMs, procMs, ev.EventType)
	}
}

// recordDeepLatency routes one deep-cohort latency sample with resumed-stream
// provenance: frames arriving on a stream that is still replaying buffered
// history carry pre-disconnect publish timestamps (backlog age, not transport
// latency) and must never enter the live fan-out evidence. transportMs /
// procMs split the sample into DUT-side (publish→wire arrival) and
// harness-side (wire arrival→dispatch) attribution diagnostics.
func (p *Pool) recordDeepLatency(v *viewer, latMs, transportMs, procMs int, eventType string) {
	if v.catchUp.Load() {
		if latMs >= liveTailThresholdMs {
			p.histMu.Lock()
			p.backlogHist.Record(latMs)
			p.histMu.Unlock()
			p.Counters.FanOutBacklogSamples.Add(1)
			return
		}
		// A freshly published frame arrived on the resumed stream — it has
		// reached the live tail; from here on samples are genuine.
		v.catchUp.Store(false)
	}
	p.routeLatency(latMs, eventType)
	p.histMu.Lock()
	p.transportHist.Record(transportMs)
	p.procHist.Record(procMs)
	p.histMu.Unlock()
	if base := v.curBase; base != "" {
		p.upMu.Lock()
		u := p.upstreams[base]
		if u == nil {
			u = &upstreamTransport{}
			p.upstreams[base] = u
		}
		p.upMu.Unlock()
		u.samples.Add(1)
		if latMs >= liveTailThresholdMs {
			u.slow.Add(1)
			p.slowRing[p.slowIdx%slowRingSize] = SlowDelivery{
				TMs:   time.Now().UnixMilli(),
				Base:  base,
				LatMs: latMs,
			}
			p.slowIdx++
		}
	}
}

// UpstreamEvidence renders per-subscriber-base delivery attribution for the
// wire: samples and slow(>=5s) counts per base URL. Evidence-only.
func (p *Pool) UpstreamEvidence() map[string]map[string]int64 {
	p.upMu.Lock()
	defer p.upMu.Unlock()
	out := make(map[string]map[string]int64, len(p.upstreams))
	for base, u := range p.upstreams {
		out[base] = map[string]int64{"samples": u.samples.Load(), "slow": u.slow.Load()}
	}
	return out
}

// SlowDeliveryTimeline returns the retained slow deliveries in chronological
// order (ring order normalized). Evidence-only.
func (p *Pool) SlowDeliveryTimeline() []SlowDelivery {
	p.upMu.Lock()
	defer p.upMu.Unlock()
	n := p.slowIdx
	if n > slowRingSize {
		n = slowRingSize
	}
	out := make([]SlowDelivery, 0, n)
	start := p.slowIdx - n
	for i := start; i < p.slowIdx; i++ {
		e := p.slowRing[i%slowRingSize]
		if e.TMs != 0 {
			out = append(out, e)
		}
	}
	return out
}

// liveTailThresholdMs bounds catch-up detection for resumed deep streams: a
// frame published within the last 5 s proves the stream is at the live tail;
// anything older on a resumed stream is buffered-history replay.
const liveTailThresholdMs = 5000

// upstreamTransport attributes deep-cohort transport latency to the subscriber
// base (nchan partition) that delivered the frame: a single lagging partition
// shows up as one base with a high slow share while every shard's aggregate
// degrades by that partition's channel share.
type upstreamTransport struct {
	samples atomic.Int64
	slow    atomic.Int64 // transport latency >= liveTailThresholdMs
}

// slowRingSize bounds the timestamped slow-delivery timeline kept in memory:
// enough to cover repeated multi-second stall clusters across a full run.
const slowRingSize = 4096

// SlowDelivery is one deep-cohort frame whose transport latency reached the
// slow threshold, recorded with its wall-clock time and delivering base so
// the run timeline can be correlated with phase windows and DUT state.
type SlowDelivery struct {
	TMs   int64  `json:"t_ms"`
	Base  string `json:"base"`
	LatMs int    `json:"lat_ms"`
}

// routeLatency applies the frozen phase-window provenance rules for
// deep-cohort latency evidence: surge and burst windows own their samples;
// everything else counts toward the terminal fan-out gates ONLY inside the
// post-surge full-target window — lower-population samples (60k warmup/steady)
// must never dilute the 100k full-target gate.
func (p *Pool) routeLatency(latMs int, eventType string) {
	p.histMu.Lock()
	defer p.histMu.Unlock()
	if p.surgeOpen.Load() {
		p.surgeHist.Record(latMs)
		return
	}
	if p.burstOpen.Load() {
		p.burstHist.Record(latMs)
		return
	}
	if !p.fullTargetOpen.Load() {
		return
	}
	if eventType == "goal" {
		p.goalHist.Record(latMs)
	} else {
		p.otherHist.Record(latMs)
	}
}

func (p *Pool) BeginSurgeWindow() { p.surgeOpen.Store(true) }

func (p *Pool) EndSurgeWindow() { p.surgeOpen.Store(false) }

// BeginFullTargetWindow opens the terminal fan-out evidence window: from here
// on the population is at the post-surge full target, so deep-cohort latency
// counts toward the goal/other fan-out gates. Samples observed before this
// point are excluded (lower-load provenance rule).
func (p *Pool) BeginFullTargetWindow() { p.fullTargetOpen.Store(true) }

func (p *Pool) SurgeHistogram() hist.Serialized { return p.surgeHist.Serialize() }

// BeginBurstWindow routes deep-cohort latency samples into the burst histogram
// until EndBurstWindow is called (burst-phase isolation, coordinator gate).
func (p *Pool) BeginBurstWindow() { p.burstOpen.Store(true) }

// EndBurstWindow closes the burst sample window.
func (p *Pool) EndBurstWindow() { p.burstOpen.Store(false) }

// HistogramSnapshot returns serialized histogram evidence.
func (p *Pool) GoalHistogram() hist.Serialized  { return p.goalHist.Serialize() }
func (p *Pool) OtherHistogram() hist.Serialized { return p.otherHist.Serialize() }

// BacklogHistogram returns resumed-stream history-replay latency samples that
// were excluded from the live fan-out evidence (diagnostic provenance class).
func (p *Pool) BacklogHistogram() hist.Serialized { return p.backlogHist.Serialize() }

// TransportHistogram / ProcDelayHistogram return the two-sided latency
// attribution diagnostics for deep-cohort samples (publish→wire-arrival vs
// wire-arrival→dispatch); never gated, evidence-only.
func (p *Pool) TransportHistogram() hist.Serialized { return p.transportHist.Serialize() }
func (p *Pool) ProcDelayHistogram() hist.Serialized { return p.procHist.Serialize() }
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

// HeadDisagreement is the per-viewer attribution for one deep client whose
// reconstructed final state did not match the canonical head: it records both
// sides of every compared field plus connection liveness, so a silent tail
// truncation (viewer lastSeq < head seq) is distinguishable at evidence time
// from a semantic mismatch on equal seqs.
type HeadDisagreement struct {
	MatchID string `json:"match_id"`

	ViewLastSeq int64  `json:"view_last_seq"`
	ViewHome    int    `json:"view_home"`
	ViewAway    int    `json:"view_away"`
	ViewPeriod  string `json:"view_period"`
	ViewElapsed int    `json:"view_elapsed"`
	Violations  int64  `json:"semantic_violations"`

	HeadSeq     int64  `json:"head_seq"`
	HeadHome    int    `json:"head_home"`
	HeadAway    int    `json:"head_away"`
	HeadPeriod  string `json:"head_period"`
	HeadElapsed int    `json:"head_elapsed"`

	Live bool `json:"live_at_sample"` // connected when heads were sampled
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
	agreed, disagreed, unmatched, _ = p.DeepHeadAgreementDetailed(heads)
	return agreed, disagreed, unmatched
}

// DeepHeadAgreementDetailed is DeepHeadAgreement with per-viewer disagreement
// attribution: every disagreed deep client is described by a HeadDisagreement
// record bound to its match and both sides of the comparison.
func (p *Pool) DeepHeadAgreementDetailed(heads map[string]CanonicalHead) (
	agreed, disagreed, unmatched int64, details []HeadDisagreement,
) {
	for _, i := range p.deepIdx {
		v := p.viewers[i]
		head, ok := heads[v.matchID]
		if !ok || !v.everEst.Load() || !v.sawDeep.Load() {
			unmatched++
			continue
		}
		if v.state.AgreeWithHead(head.Seq, head.Home, head.Away, head.Elapsed, head.Period) {
			agreed++
			continue
		}
		disagreed++
		details = append(details, HeadDisagreement{
			MatchID:     v.matchID,
			ViewLastSeq: v.state.LastSeq,
			ViewHome:    v.state.LastScoreHome,
			ViewAway:    v.state.LastScoreAway,
			ViewPeriod:  v.state.LastPeriod,
			ViewElapsed: v.state.LastElapsed,
			Violations:  int64(v.state.Violations),
			HeadSeq:     head.Seq,
			HeadHome:    head.Home,
			HeadAway:    head.Away,
			HeadPeriod:  head.Period,
			HeadElapsed: head.Elapsed,
			Live:        v.online.Load(),
		})
	}
	return agreed, disagreed, unmatched, details
}

// DeepExpected returns the configured deep-cohort denominator for this pool:
// the exact number of clients every head-agreement account must classify into
// exactly one of agreed/disagreed/unmatched.
func (p *Pool) DeepExpected() int64 {
	return int64(len(p.deepIdx))
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

// parseUint parses Nchan SSE id field without allocation. Nchan 1.3.8 ids
// are "msec:counter" (e.g. "1787373030:0"); plain integers are also accepted
// for test harnesses. For msec:counter we combine as msec*100000+counter so
// sequential messages are strictly +1 even within the same millisecond.
func parseUint(b []byte) (uint64, bool) {
	if len(b) == 0 {
		return 0, false
	}
	i := 0
	for i < len(b) && b[i] == ' ' {
		i++
	}
	if i >= len(b) {
		return 0, false
	}
	var first uint64
	var haveFirst bool
	for ; i < len(b) && b[i] >= '0' && b[i] <= '9'; i++ {
		nv := first*10 + uint64(b[i]-'0')
		if nv < first {
			return 0, false
		}
		first = nv
		haveFirst = true
	}
	if !haveFirst {
		return 0, false
	}
	if i == len(b) {
		return first, true
	}
	if b[i] == ':' {
		i++
		var second uint64
		var haveSecond bool
		for ; i < len(b) && b[i] >= '0' && b[i] <= '9'; i++ {
			nv := second*10 + uint64(b[i]-'0')
			if nv < second {
				return 0, false
			}
			second = nv
			haveSecond = true
		}
		if !haveSecond {
			return 0, false
		}
		for ; i < len(b) && b[i] == ' '; i++ {
		}
		if i != len(b) {
			return 0, false
		}
		return first*100000 + second, true
	}
	for ; i < len(b) && b[i] == ' '; i++ {
	}
	if i == len(b) {
		return first, true
	}
	return 0, false
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

// ReconnectHoldResult carries the exact pre-hold denominator evidence: every
// frozen reconnect client is selected before the phase, and readiness requires
// a REAL nonempty raw SSE id observed on wire (never synthesized from the
// canonical application sequence).
type ReconnectHoldResult struct {
	Selected        int // frozen cohort size (= 64/shard)
	ReadyBeforeHold int // clients with valid raw resume state at hold time
	MissingRawID    int // clients without an observed wire id — cannot resume
}

func (p *Pool) HoldReconnectCohort() ReconnectHoldResult {
	selected := len(p.recIdx)
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		allReady := true
		for _, i := range p.recIdx {
			v := p.viewers[i]
			v.mu.Lock()
			// Valid raw resume state = real nonempty SSE id observed on wire
			// AND canonical application state. A missing raw id can never be
			// replaced by the canonical sequence number.
			ready := v.lastRawID != "" && (v.lastCanon != 0 || v.lastSeq.Load() != 0)
			v.mu.Unlock()
			if !ready {
				allReady = false
				break
			}
		}
		if allReady {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	readyBeforeHold := 0
	for _, i := range p.recIdx {
		v := p.viewers[i]
		v.mu.Lock()
		raw := v.lastRawID
		canon := v.lastCanon
		v.mu.Unlock()
		if canon == 0 {
			canon = v.lastSeq.Load()
		}
		if raw == "" {
			// No real transport id observed on wire: this client is NOT
			// resume-ready. Do not synthesize a token; record explicit
			// incomplete evidence so the drill cannot pass.
			p.Counters.ReconnectMissingRawID.Add(1)
			continue
		}
		readyBeforeHold++
		v.cancelMu.Lock()
		v.mu.Lock()
		v.resumeID = raw
		v.capturedCanon = canon
		v.mu.Unlock()
		v.reconnectQ.Store(true)
		if v.curCancel != nil {
			(*v.curCancel)()
		}
		v.cancelMu.Unlock()
		p.Counters.PlannedDisconnects.Add(1)
	}
	p.awaitOffline(func(v *viewer) bool { return v.reconnectQ.Load() }, 30*time.Second)
	return ReconnectHoldResult{
		Selected:        selected,
		ReadyBeforeHold: readyBeforeHold,
		MissingRawID:    selected - readyBeforeHold,
	}
}

func (p *Pool) ReleaseReconnectCohort() int {
	released := 0
	for _, i := range p.recIdx {
		v := p.viewers[i]
		if !v.reconnectQ.Load() {
			continue
		}
		v.mu.Lock()
		resumeStr := v.resumeID
		captured := v.capturedCanon
		v.mu.Unlock()
		if resumeStr == "" {
			v.reconnectQ.Store(false)
			continue
		}
		var head int64
		var ok bool
		if p.headFn != nil {
			head, ok = p.headFn(v.matchID)
		}
		if !ok || captured == 0 || head <= int64(captured) {
			v.mu.Lock()
			v.resumeID = ""
			v.capturedCanon = 0
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
		v.capturing.Store(true)
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

func extractCanonSeq(data []byte) (uint64, bool) {
	for _, key := range []string{`"canonical_seq"`, `"n"`} {
		idx := bytes.Index(data, []byte(key))
		if idx < 0 {
			continue
		}
		rest := data[idx+len(key):]
		colon := bytes.IndexByte(rest, ':')
		if colon < 0 {
			continue
		}
		rest = rest[colon+1:]
		for len(rest) > 0 && (rest[0] == ' ' || rest[0] == '"') {
			rest = rest[1:]
		}
		var v uint64
		var n int
		for n < len(rest) && rest[n] >= '0' && rest[n] <= '9' {
			v = v*10 + uint64(rest[n]-'0')
			n++
		}
		if n > 0 {
			return v, true
		}
	}
	return 0, false
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
		collectSeq := seq
		isHistoryProbe := strings.HasPrefix(spec.Key, "late_join:") || spec.Key == "spare_probe" || spec.Key == "failover_drill"
		if isHistoryProbe && scratchLen > 0 {
			if ev, err := deep.ValidateSchema(scratch[:scratchLen], spec.MatchID); err == nil {
				collectSeq = uint64(ev.CanonicalSeq)
			} else {
				p.Counters.SchemaViolations.Add(1)
			}
		} else if spec.ResumeID != "" && scratchLen > 0 {
			if ev, err := deep.ValidateSchema(scratch[:scratchLen], spec.MatchID); err == nil {
				if uint64(ev.CanonicalSeq) != seq {
					p.Counters.AgreementViolations.Add(1)
				}
			} else {
				p.Counters.SchemaViolations.Add(1)
			}
		}
		received = append(received, collectSeq)
		scratch = scratch[:0]
		scratchLen = 0
		if collectSeq >= spec.Target {
			return deep.EvaluateRequiredRange(spec.ResumeID, int64(spec.First), int64(spec.Target), received, time.Since(start).Milliseconds())
		}
		if !isHistoryProbe && seq >= spec.Target {
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
			scratch = append(scratch[:scratchLen], payload...)
			scratchLen = len(scratch)
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
			v.mu.Lock()
			if v.lastRawID != "" {
				v.resumeID = v.lastRawID
			}
			v.mu.Unlock()
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
