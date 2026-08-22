// Command loadgen is one lightweight generator shard (design doc §3/§7): it
// registers with the TypeScript coordinator, drives every coordinated phase,
// validates the full population's transport continuity plus the bounded deep
// cohort's semantics, and submits one ShardExperimentResult to the single
// canonical machine-verdict path.
//
// Expected/observed boundary: expected values (canonical heads, frozen ranges,
// published totals) are fetched over HTTP from the independent publisher
// service; observed values are the SSE wire. No code path produces both.
package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"ea/loadgen/internal/coordinator"
	"ea/loadgen/internal/deep"
	"ea/loadgen/internal/dut"
	"ea/loadgen/internal/hist"
	"ea/loadgen/internal/pool"
	"ea/loadgen/internal/publisher"
)

const (
	matchCount        = 8
	deepPerMatch      = 32
	reconnectPerShard = 64
	lobbyFractionPct  = 2
	surgeGlobal       = 40000 // +40k viewers within the surge window (assignment)

	restartPrefillCount = 24 // frozen corner range per restart probe (owner)
	lateJoinProbeTO     = 30 * time.Second
	restartProbeTO      = 60 * time.Second
	establishFloorPct   = 0.98
)

type config struct {
	campaignID     string
	runIndex       int
	shardID        int
	shardTotal     int
	globalTarget   int
	localTarget    int
	surgeLocal     int
	seed           int
	sourceCommit   string
	publisherOwner bool
	restartTarget  int // 0-based shard id of the literal-restart partition

	coordinatorURL string
	subURL         string
	pubURL         string
	controlURL     string
	spareSubURL    string
	spareControl   string
	publisherURL   string
	redisAddr      string

	warmupSeconds    int
	steadySeconds    int
	surgeSeconds     int
	stabilizeSeconds int
	burstSeconds     int
	postBurstSeconds int
	settleSeconds    int
}

func envInt(name string, def int) int {
	if v := os.Getenv(name); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}

func loadConfig() (*config, error) {
	shardTotal := envInt("SHARD_TOTAL", 4)
	c := &config{
		campaignID:       os.Getenv("CAMPAIGN_ID"),
		runIndex:         envInt("GLOBAL_RUN_INDEX", 0),
		shardID:          envInt("SHARD_ID", 0),
		shardTotal:       shardTotal,
		globalTarget:     envInt("GLOBAL_TARGET", 100000),
		localTarget:      envInt("TARGET_CONNECTIONS", 25000),
		seed:             envInt("GLOBAL_SEED", 42),
		sourceCommit:     os.Getenv("GIT_COMMIT_SHA"),
		publisherOwner:   os.Getenv("PUBLISHER_OWNER") == "true",
		restartTarget:    envInt("RESTART_TARGET_SHARD", shardTotal) - 1,
		coordinatorURL:   strings.TrimSuffix(os.Getenv("COORDINATOR_URL"), "/"),
		subURL:           strings.TrimSuffix(os.Getenv("NCHAN_SUB_URL"), "/"),
		pubURL:           strings.TrimSuffix(os.Getenv("NCHAN_PUB_URL"), "/"),
		controlURL:       strings.TrimSuffix(os.Getenv("NCHAN_CONTROL_URL"), "/"),
		spareSubURL:      strings.TrimSuffix(os.Getenv("NCHAN_SPARE_SUB_URL"), "/"),
		spareControl:     strings.TrimSuffix(os.Getenv("NCHAN_SPARE_CONTROL_URL"), "/"),
		publisherURL:     strings.TrimSuffix(os.Getenv("PUBLISHER_URL"), "/"),
		redisAddr:        envStr("REDIS_ADDR", "redis:6379"),
		warmupSeconds:    envInt("WARMUP_SECONDS", 30),
		steadySeconds:    envInt("MEASURE_SECONDS", 120),
		surgeSeconds:     envInt("SURGE_SECONDS", 120),
		stabilizeSeconds: envInt("COOLDOWN_SECONDS", 10),
		burstSeconds:     envInt("BURST_SECONDS", 30),
		postBurstSeconds: envInt("POST_BURST_SECONDS", 10),
		settleSeconds:    envInt("SETTLE_SECONDS", 5),
	}
	c.surgeLocal = (c.globalTarget+surgeGlobal)/c.shardTotal - c.localTarget
	if c.surgeLocal < 0 {
		c.surgeLocal = 0
	}
	var missing []string
	for name, v := range map[string]string{
		"CAMPAIGN_ID":     c.campaignID,
		"GIT_COMMIT_SHA":  c.sourceCommit,
		"COORDINATOR_URL": c.coordinatorURL,
		"NCHAN_SUB_URL":   c.subURL,
	} {
		if strings.TrimSpace(v) == "" {
			missing = append(missing, name)
		}
	}
	if len(missing) > 0 {
		return nil, fmt.Errorf("missing required env: %s", strings.Join(missing, ","))
	}
	if len(c.sourceCommit) != 40 {
		return nil, fmt.Errorf("GIT_COMMIT_SHA must be the full 40-hex checkout SHA")
	}
	if c.shardID < 0 || c.shardID >= c.shardTotal {
		return nil, fmt.Errorf("SHARD_ID %d outside [0,%d)", c.shardID, c.shardTotal)
	}
	if c.restartTarget < 0 || c.restartTarget >= c.shardTotal {
		return nil, fmt.Errorf("RESTART_TARGET_SHARD %d outside [0,%d]", c.restartTarget+1, c.shardTotal)
	}
	return c, nil
}

func envStr(name string, def string) string {
	if v := os.Getenv(name); v != "" {
		return v
	}
	return def
}

func matchIDs() []string {
	out := make([]string, matchCount)
	for i := range out {
		// Frozen canonical identity: must equal MATCH_IDS in the TypeScript
		// domain (event.ts) — Nchan channel names and history endpoints are
		// derived from it on both sides of the boundary.
		out[i] = fmt.Sprintf("match-%03d", i+1)
	}
	return out
}

// restartMatchID is the frozen restart-drill probe channel (first canonical
// match). Kept as a named constant-equivalent so every drill path and any
// identity change stay in one place.
func restartMatchID() string { return matchIDs()[0] }

func logf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "[loadgen "+time.Now().UTC().Format(time.RFC3339)+"] "+format+"\n", args...)
}

// counterSnapshot freezes the pool-global counters for windowed deltas
// (the reconnect and restart-failover assignment metrics are measured as
// differences across their own windows, never lifetime totals).
type counterSnapshot struct {
	missing, duplicates, outOfOrder int64
	failures, unexpected            int64
	schema, agreement               int64
}

func takeSnapshot(p *pool.Pool) counterSnapshot {
	return counterSnapshot{
		missing:    p.Counters.MissingSequences.Load(),
		duplicates: p.Counters.Duplicates.Load(),
		outOfOrder: p.Counters.OutOfOrder.Load(),
		failures:   p.Counters.ConnectionFailures.Load(),
		unexpected: p.Counters.UnexpectedDisconnects.Load(),
		schema:     p.Counters.SchemaViolations.Load(),
		agreement:  p.Counters.AgreementViolations.Load(),
	}
}

func (a counterSnapshot) sub(b counterSnapshot) counterSnapshot {
	return counterSnapshot{
		missing:    a.missing - b.missing,
		duplicates: a.duplicates - b.duplicates,
		outOfOrder: a.outOfOrder - b.outOfOrder,
		failures:   a.failures - b.failures,
		unexpected: a.unexpected - b.unexpected,
		schema:     a.schema - b.schema,
		agreement:  a.agreement - b.agreement,
	}
}

type shardRun struct {
	cfg   *config
	pool  *pool.Pool
	pub   *publisher.Client
	cl    *coordinator.Client
	logMu sync.Mutex

	headCache atomic.Pointer[map[string]pool.CanonicalHead]

	valid coordinator.Validity

	srcPort      *dut.SourcePortEvidence
	redisInfo    *dut.RedisInfo
	nchanMetrics *dut.ControlMetrics
	spareMetrics *dut.ControlMetrics

	baselineShortfall bool
	pubPublished      int64
	genStart          time.Time
	// measured correctness deltas across the restart/failover window (set by
	// every shard: the target carries its drill window, bystanders their own
	// phase window). nil = window never measured → validity failure.
	restartDelta *counterSnapshot
	// R04/R05: machine-proof surge measurement and the true surge-window
	// correctness snapshot. nil = surge never measured → validity failure.
	surgeStats *surgeRunStats
	surgeDelta *counterSnapshot
}

func (r *shardRun) reasonf(format string, args ...any) {
	r.valid.Reasons = append(r.valid.Reasons, fmt.Sprintf(format, args...))
}

func (r *shardRun) refreshHeads(ctx context.Context) error {
	ev, err := r.pub.Evidence(ctx)
	if err != nil {
		return err
	}
	heads := make(map[string]pool.CanonicalHead, len(ev.Heads))
	for id, h := range ev.Heads {
		heads[id] = pool.CanonicalHead{
			Seq: h.Seq, Home: h.State.Score.Home, Away: h.State.Score.Away,
			Period: h.State.Clock.Period, Elapsed: h.State.Clock.ElapsedSeconds,
		}
	}
	r.headCache.Store(&heads)
	return nil
}

func (r *shardRun) headLookup(matchID string) (int64, bool) {
	if heads := r.headCache.Load(); heads != nil {
		h, ok := (*heads)[matchID]
		return h.Seq, ok
	}
	return 0, false
}

func (r *shardRun) logf(format string, args ...any) {
	r.logMu.Lock()
	defer r.logMu.Unlock()
	logf(format, args...)
}

// buildPopulation registers the frozen per-shard cohort mix:
//
//	lobby: 2% of target; matches share the remainder round-robin;
//	per match: 32 deep + 8 reconnect + remaining light.
func buildPopulation(p *pool.Pool, target int) error {
	matches := matchIDs()
	lobbyN := target * lobbyFractionPct / 100
	matchN := target - lobbyN
	base := (matchN - matchCount*deepPerMatch) / matchCount
	extra := (matchN - matchCount*deepPerMatch) - base*matchCount
	recPerMatch := reconnectPerShard / matchCount
	lightBase := base - recPerMatch
	if lightBase < 0 {
		return fmt.Errorf("target too small for frozen cohorts")
	}
	for i := 0; i < lobbyN; i++ {
		if err := p.Add(pool.RoleLobby, ""); err != nil {
			return err
		}
	}
	for mi, m := range matches {
		for i := 0; i < deepPerMatch; i++ {
			if err := p.Add(pool.RoleDeep, m); err != nil {
				return err
			}
		}
		for i := 0; i < recPerMatch; i++ {
			if err := p.Add(pool.RoleReconnect, m); err != nil {
				return err
			}
		}
		n := lightBase
		if mi < extra {
			n++
		}
		for i := 0; i < n; i++ {
			if err := p.Add(pool.RoleLight, m); err != nil {
				return err
			}
		}
	}
	return nil
}

func main() {
	cfg, err := loadConfig()
	if err != nil {
		logf("config error: %v", err)
		os.Exit(2)
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	reg := coordinator.Registration{
		CampaignID:     cfg.campaignID,
		ShardID:        cfg.shardID,
		ShardCount:     cfg.shardTotal,
		LocalTarget:    cfg.localTarget,
		GlobalTarget:   cfg.globalTarget,
		Seed:           cfg.seed,
		SourceCommit:   cfg.sourceCommit,
		PublisherOwner: cfg.publisherOwner,
	}
	cl := coordinator.NewClient(cfg.coordinatorURL, reg)
	runID, err := cl.Register()
	if err != nil {
		logf("register failed: %v", err)
		os.Exit(3)
	}
	logf("registered shard=%d/%d run=%s surge_local=%d", cfg.shardID, cfg.shardTotal, runID, cfg.surgeLocal)

	p := pool.New(cfg.subURL, matchIDs(), cfg.localTarget+cfg.surgeLocal)
	if cfg.spareSubURL != "" {
		p.SetSpare(cfg.spareSubURL)
	}
	baselineTarget := cfg.localTarget
	if cfg.globalTarget == 100000 {
		baselineTarget = cfg.localTarget - cfg.surgeLocal
	}
	if err := buildPopulation(p, baselineTarget); err != nil {
		logf("population error: %v", err)
		cl.Abort(err.Error())
		os.Exit(3)
	}

	r := &shardRun{cfg: cfg, pool: p, pub: publisher.New(cfg.publisherURL), cl: cl, genStart: time.Now()}
	p.SetHeadLookup(r.headLookup)

	result, runErr := r.execute(ctx)
	if runErr != nil {
		logf("run aborted: %v", runErr)
		result = r.failureResult(runErr)
	}
	if err := cl.SubmitResult(result); err != nil {
		logf("submit failed: %v", err)
		if runErr != nil {
			cl.Abort(runErr.Error())
		}
		os.Exit(4)
	}
	logf("result submitted verdict=%s", result.Verdict)
	if runErr != nil {
		cl.Abort(runErr.Error())
	}
}

func (r *shardRun) barrier(phase, boundary string) bool {
	receipt, err := r.cl.Barrier(phase, boundary)
	if err != nil {
		r.logf("barrier %s:%s failed: %v", phase, boundary, err)
		return false
	}
	r.logf("barrier %s:%s released", phase, boundary)
	_ = receipt
	return true
}

func sleepCtx(ctx context.Context, d time.Duration) bool {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-t.C:
		return true
	}
}

// execute drives every coordinated phase in canonical order
// (coordinator.Phases is load-bearing: no boundary may be skipped).
func (r *shardRun) execute(ctx context.Context) (*coordinator.ShardExperimentResult, error) {
	cfg := r.cfg
	startedAt := time.Now()

	// ── preflight ──
	if !r.barrier("preflight", "start") {
		return nil, fmt.Errorf("preflight start barrier")
	}
	maxTarget := cfg.localTarget
	if cfg.globalTarget != 100000 {
		maxTarget = cfg.localTarget + cfg.surgeLocal
	}
	sp, err := dut.BuildSourcePortEvidence(maxTarget)
	if err != nil {
		r.reasonf("source-port evidence: %v", err)
	} else {
		r.srcPort = sp
		if !sp.HeadroomValid {
			r.reasonf("source-port headroom invalid: free=%d fd_soft=%d", sp.FreePorts, sp.FdSoftLimit)
		}
	}
	if hErr := dut.HealthCheck(ctx, cfg.pubURL); hErr != nil {
		r.reasonf("partition healthcheck: %v", hErr)
	}
	if pf, pfErr := dut.PreflightPartition(ctx, cfg.controlURL, maxTarget); pfErr != nil {
		r.reasonf("partition preflight: %v", pfErr)
	} else if !pf.Sufficient {
		r.reasonf("partition capacity insufficient for %d", cfg.localTarget+cfg.surgeLocal)
	}
	if ri, riErr := dut.QueryRedisInfo(ctx, cfg.redisAddr); riErr != nil {
		r.reasonf("redis info: %v", riErr)
	} else {
		r.redisInfo = ri
	}
	if nm, nmErr := dut.GetControlMetrics(ctx, cfg.controlURL); nmErr != nil {
		r.reasonf("partition control metrics: %v", nmErr)
	} else {
		r.nchanMetrics = nm
	}
	if cfg.publisherOwner && cfg.publisherURL != "" {
		if werr := r.refreshHeads(ctx); werr != nil {
			r.reasonf("publisher evidence unreachable: %v", werr)
		} else if serr := r.pub.Reset(ctx); serr != nil {
			r.reasonf("publisher reset failed: %v", serr)
		}
	}
	r.valid.GeneratorValid = len(r.valid.Reasons) == 0
	if !r.barrier("preflight", "end") {
		return nil, fmt.Errorf("preflight end barrier")
	}

	// ── warmup: connect baseline population ──
	if !r.barrier("warmup", "start") {
		return nil, fmt.Errorf("warmup start barrier")
	}
	if cfg.publisherOwner && cfg.publisherURL != "" {
		// The independent publisher/control service owns canonical event
		// generation; the owner shard drives its lifecycle. Publication must
		// be live before the population connects so continuity windows open
		// on real traffic.
		if serr := r.pub.Start(ctx); serr != nil {
			r.reasonf("publisher start failed: %v", serr)
		} else if werr := r.pub.WaitForStarted(ctx, 30*time.Second); werr != nil {
			r.reasonf("publisher did not begin publication: %v", werr)
		}
	}
	r.pool.Start()
	r.cl.StartSampling(time.Second, func() (int64, int64, int64, int64) {
		return r.pool.ActiveCurrent(), r.pool.AttemptedTotal(), r.pool.EstablishedTotal(),
			r.pool.Counters.ConnectionFailures.Load()
	})
	baselineTarget2 := cfg.localTarget
	if cfg.globalTarget == 100000 {
		baselineTarget2 = cfg.localTarget - cfg.surgeLocal
	}
	if !waitEstablished(r.pool, baselineTarget2, time.Duration(cfg.warmupSeconds)*time.Second) {
		r.baselineShortfall = true
		r.logf("baseline establishment shortfall: active=%d target=%d",
			r.pool.ActiveCurrent(), cfg.localTarget)
	}
	r.logf("baseline established active=%d (target %d)", r.pool.ActiveCurrent(), baselineTarget2)
	if !r.barrier("warmup", "end") {
		return nil, fmt.Errorf("warmup end barrier")
	}

	// ── steady measure ──
	if !r.barrier("steady", "start") {
		return nil, fmt.Errorf("steady start barrier")
	}
	if !sleepCtx(ctx, time.Duration(cfg.steadySeconds)*time.Second) {
		return nil, fmt.Errorf("steady window interrupted")
	}
	if !r.barrier("steady", "end") {
		return nil, fmt.Errorf("steady end barrier")
	}

	// ── surge (+40k global within 120s; exact 24-batch integer schedule) ──
	if !r.barrier("surge", "start") {
		return nil, fmt.Errorf("surge start barrier")
	}
	surgeScenario := r.runSurge(ctx)
	if !r.barrier("surge", "end") {
		return nil, fmt.Errorf("surge end barrier")
	}
	r.logf("post-surge active=%d elapsed_ms=%d established=%d/%d",
		r.pool.ActiveCurrent(), r.surgeStats.elapsedMs,
		r.surgeStats.establishedAdds, r.surgeStats.attemptedAdds)

	// ── target-barrier: pure alignment boundary at full population ──
	if !r.barrier("target-barrier", "start") {
		return nil, fmt.Errorf("target-barrier start barrier")
	}
	sleepCtx(ctx, time.Second)
	if !r.barrier("target-barrier", "end") {
		return nil, fmt.Errorf("target-barrier end barrier")
	}

	// ── stabilization ──
	if !r.barrier("stabilization", "start") {
		return nil, fmt.Errorf("stabilization start barrier")
	}
	sleepCtx(ctx, time.Duration(cfg.stabilizeSeconds)*time.Second)
	if !r.barrier("stabilization", "end") {
		return nil, fmt.Errorf("stabilization end barrier")
	}

	// ── late join: full retained history probe per match against this
	// shard's own partition node (every ownership domain covered) ──
	if !r.barrier("late-join", "start") {
		return nil, fmt.Errorf("late-join start barrier")
	}
	if err := r.refreshHeads(ctx); err != nil {
		r.reasonf("late-join evidence fetch: %v", err)
	}
	lateResults := r.runLateJoinProbes(ctx)
	lateScenario := r.lateJoinScenario(lateResults)
	sleepCtx(ctx, 2*time.Second)
	if !r.barrier("late-join", "end") {
		return nil, fmt.Errorf("late-join end barrier")
	}

	// ── burst ──
	if !r.barrier("burst", "start") {
		return nil, fmt.Errorf("burst start barrier")
	}
	r.pool.BeginBurstWindow()
	if cfg.publisherOwner && cfg.publisherURL != "" {
		if berr := r.pub.Burst(ctx, cfg.burstSeconds); berr != nil {
			r.reasonf("burst trigger failed: %v", berr)
		}
	}
	sleepCtx(ctx, time.Duration(cfg.burstSeconds+2)*time.Second) // +2s tail coverage
	r.pool.EndBurstWindow()
	burstScenario := coordinator.ScenarioEvidence{
		Name:         "burst",
		Participated: true,
		Passed:       r.pool.BurstHistogram().TotalCount > 0,
		Detail:       fmt.Sprintf("burst window closed with %d deep-cohort samples", r.pool.BurstHistogram().TotalCount),
	}
	if !r.barrier("burst", "end") {
		return nil, fmt.Errorf("burst end barrier")
	}

	// ── post-burst settle ──
	if !r.barrier("post-burst", "start") {
		return nil, fmt.Errorf("post-burst start barrier")
	}
	sleepCtx(ctx, time.Duration(cfg.postBurstSeconds)*time.Second)
	if !r.barrier("post-burst", "end") {
		return nil, fmt.Errorf("post-burst end barrier")
	}

	// ── reconnect cohort drill (planned disconnect + Last-Event-ID replay) ──
	if !r.barrier("reconnect", "start") {
		return nil, fmt.Errorf("reconnect start barrier")
	}
	reconnectHold := r.pool.HoldReconnectCohort()
	sleepCtx(ctx, time.Duration(cfg.settleSeconds)*time.Second)
	if err := r.refreshHeads(ctx); err != nil {
		r.reasonf("reconnect evidence fetch: %v", err)
	}
	released := r.pool.ReleaseReconnectCohort()
	r.waitReconnectSettled(released, 30*time.Second)
	reconnectResults := r.pool.CollectReconnectResults()
	reconnectScenario := r.reconnectScenario(reconnectHold, released, reconnectResults)
	r.logf("reconnect drill selected=%d ready=%d released=%d results=%d passed=%d",
		reconnectHold.Selected, reconnectHold.ReadyBeforeHold, released,
		len(reconnectResults), countPassed(reconnectResults))
	if !r.barrier("reconnect", "end") {
		return nil, fmt.Errorf("reconnect end barrier")
	}

	// ── restart-replacement (partition-targeted drill) ──
	if !r.barrier("restart-replacement", "start") {
		return nil, fmt.Errorf("restart start barrier")
	}
	restartScenario := r.runRestartScenario(ctx)
	if !r.barrier("restart-replacement", "end") {
		return nil, fmt.Errorf("restart end barrier")
	}

	// ── final metrics: quiesce publication, freeze agreement, stop ──
	if !r.barrier("final-metrics", "start") {
		return nil, fmt.Errorf("final-metrics start barrier")
	}
	if cfg.publisherOwner && cfg.publisherURL != "" {
		if ev, err := r.pub.Evidence(ctx); err == nil {
			r.pubPublished = ev.Totals.Published
		}
		_ = r.pub.Stop(ctx) // quiesce publication so head agreement is final
	}
	time.Sleep(2 * time.Second) // in-flight frame drain
	samples := r.cl.StopSampling()
	r.pool.Stop()
	headAgreement := struct{ agreed, disagreed, unmatched int64 }{}
	if err := r.refreshHeads(ctx); err == nil {
		headAgreement.agreed, headAgreement.disagreed, headAgreement.unmatched =
			r.pool.DeepHeadAgreement(*r.headCache.Load())
		r.logf("deep head agreement agreed=%d disagreed=%d unmatched=%d",
			headAgreement.agreed, headAgreement.disagreed, headAgreement.unmatched)
	} else {
		r.reasonf("final evidence fetch: %v", err)
	}
	if !r.barrier("final-metrics", "end") {
		return nil, fmt.Errorf("final-metrics end barrier")
	}

	scenarios := []coordinator.ScenarioEvidence{
		surgeScenario, lateScenario, burstScenario, reconnectScenario, restartScenario,
	}
	return r.assembleResult(samples, scenarios, lateResults, reconnectResults, headAgreement, startedAt), nil
}

// surgeRunStats is the R04 machine-proof measurement for one shard's surge
// window: population before/after, attempted vs established additions inside
// the frozen deadline, and the observed peak. All values are measured, never
// derived from targets — a shortfall must be visible as evidence.
type surgeRunStats struct {
	startActive     int64
	attemptedAdds   int64
	establishedAdds int64
	failedAdds      int64
	elapsedMs       int64
	finalActive     int64
	peakActive      int64

	expectedStart int64
	expectedAdds  int64
	expectedFinal int64
	deadlineMs    int64
}

// passed applies the frozen per-shard surge gates: exact pre-surge start,
// every planned addition attempted AND established within the deadline, zero
// failures, final ownership at or above the full post-surge target.
func (s *surgeRunStats) passed() bool {
	return s.startActive == s.expectedStart &&
		s.attemptedAdds == s.expectedAdds &&
		s.establishedAdds == s.expectedAdds &&
		s.failedAdds == 0 &&
		s.elapsedMs <= s.deadlineMs &&
		s.finalActive >= s.expectedFinal
}

// runSurge executes the surge window with full R04/R05 measurement: an exact
// 24-deadline integer schedule, establishment tracked against the hard
// deadline (establishments after it cannot pass), peak-active sampling, and
// true window correctness deltas (never lifetime totals).
func (r *shardRun) runSurge(ctx context.Context) coordinator.ScenarioEvidence {
	cfg := r.cfg
	expectedStart := int64(cfg.localTarget)
	if cfg.globalTarget == 100000 {
		expectedStart = int64(cfg.localTarget - cfg.surgeLocal)
	}
	st := &surgeRunStats{
		startActive:   r.pool.ActiveCurrent(),
		expectedStart: expectedStart,
		expectedAdds:  int64(cfg.surgeLocal),
		expectedFinal: int64(cfg.localTarget + cfg.surgeLocal),
		deadlineMs:    int64(cfg.surgeSeconds) * 1000,
	}
	before := takeSnapshot(r.pool)
	att0 := r.pool.AttemptedTotal()
	est0 := r.pool.EstablishedTotal()

	// peak sampler runs for the whole window so no transient population is missed
	var peak atomic.Int64
	peak.Store(st.startActive)
	stopPeak := make(chan struct{})
	peakDone := make(chan struct{})
	go func() {
		defer close(peakDone)
		t := time.NewTicker(50 * time.Millisecond)
		defer t.Stop()
		for {
			select {
			case <-stopPeak:
				return
			case <-t.C:
				cur := r.pool.ActiveCurrent()
				for {
					p := peak.Load()
					if cur <= p || peak.CompareAndSwap(p, cur) {
						break
					}
				}
			}
		}
	}()

	r.pool.BeginSurgeWindow()
	startWall := time.Now()
	r.rampSurge(ctx, cfg.surgeLocal, time.Duration(cfg.surgeSeconds)*time.Second)

	// establishment wait: connections established after the hard deadline do
	// not count toward passing (elapsedMs then exceeds deadlineMs → REJECT).
	targetEst := est0 + st.expectedAdds
	deadline := startWall.Add(time.Duration(st.deadlineMs) * time.Millisecond)
	for r.pool.EstablishedTotal() < targetEst && time.Now().Before(deadline) {
		if !sleepCtx(ctx, 25*time.Millisecond) {
			break
		}
	}
	close(stopPeak)
	<-peakDone

	st.elapsedMs = time.Since(startWall).Milliseconds()
	r.pool.EndSurgeWindow()
	delta := takeSnapshot(r.pool).sub(before)
	r.surgeDelta = &delta

	st.attemptedAdds = r.pool.AttemptedTotal() - att0
	st.establishedAdds = r.pool.EstablishedTotal() - est0
	st.failedAdds = st.attemptedAdds - st.establishedAdds
	if st.failedAdds < 0 {
		st.failedAdds = 0
	}
	st.finalActive = r.pool.ActiveCurrent()
	st.peakActive = peak.Load()
	r.surgeStats = st

	passed := st.passed()
	structured := map[string]any{
		"surge_start_active":        st.startActive,
		"surge_attempted_additions": st.attemptedAdds,
		"surge_established_additions": st.establishedAdds,
		"surge_failed_additions":    st.failedAdds,
		"surge_elapsed_ms":          st.elapsedMs,
		"surge_final_active":        st.finalActive,
		"surge_peak_active":         st.peakActive,

		"expected_start_active": st.expectedStart,
		"expected_additions":    st.expectedAdds,
		"expected_final_active": st.expectedFinal,
		"deadline_ms":           st.deadlineMs,

		"window_gaps":                   delta.missing,
		"window_duplicates":             delta.duplicates,
		"window_out_of_order":           delta.outOfOrder,
		"window_unexpected_disconnects": delta.unexpected,
	}
	detail := fmt.Sprintf("start=%d +att=%d est=%d fail=%d elapsed=%dms final=%d peak=%d",
		st.startActive, st.attemptedAdds, st.establishedAdds, st.failedAdds,
		st.elapsedMs, st.finalActive, st.peakActive)
	if !passed {
		detail += " (gate violation)"
	}
	return coordinator.ScenarioEvidence{
		Name:         "surge",
		Participated: true,
		Passed:       passed,
		Detail:       detail,
		Structured:   structured,
	}
}

// surgeBatches is the frozen contract §3 schedule: 24 launch deadlines spread
// evenly across the surge window (t=0,5,...,115s for the 120s assignment
// window). Each shard adds exactly surgeLocal viewers total.
const surgeBatches = 24

// surgeBatchSizes returns the exact per-batch viewer counts for n additions:
// the first n%surgeBatches batches carry one extra viewer so the total is
// exact (10000 → first 16×417, last 8×416).
func surgeBatchSizes(n int) []int {
	sizes := make([]int, surgeBatches)
	base := n / surgeBatches
	rem := n % surgeBatches
	for i := range sizes {
		if i < rem {
			sizes[i] = base + 1
		} else {
			sizes[i] = base
		}
	}
	return sizes
}

// rampSurge establishes exactly n additional lightweight connections on the
// frozen 24-deadline schedule spread evenly across the surge window.
func (r *shardRun) rampSurge(ctx context.Context, n int, window time.Duration) {
	if n <= 0 {
		return
	}
	batchGap := window / surgeBatches
	sizes := surgeBatchSizes(n)
	for i, batch := range sizes {
		if batch <= 0 {
			continue
		}
		if i > 0 && !sleepCtx(ctx, batchGap) {
			return
		}
		idx := make([]int, 0, batch)
		for j := 0; j < batch; j++ {
			vi, err := r.pool.AppendLightViewer()
			if err != nil {
				break
			}
			idx = append(idx, vi)
		}
		r.pool.StartIndices(idx)
	}
}

func waitEstablished(p *pool.Pool, target int, timeout time.Duration) bool {
	floor := int64(float64(target) * establishFloorPct)
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if p.ActiveCurrent() >= floor {
			return true
		}
		time.Sleep(250 * time.Millisecond)
	}
	return p.ActiveCurrent() >= floor
}

// waitReconnectSettled polls until every released viewer has produced its
// replay verdict (or the timeout elapses), then leaves a short tail for the
// final frames to land before collection.
func (r *shardRun) waitReconnectSettled(released int, timeout time.Duration) {
	if released == 0 {
		return
	}
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if r.pool.Counters.ReconnectSucceeded.Load() >= int64(released) &&
			r.pool.Counters.ReconnectAttempts.Load() >= int64(released) {
			break
		}
		time.Sleep(200 * time.Millisecond)
	}
	time.Sleep(time.Second)
}

func countPassed(results map[string]*deep.PathResult) int {
	n := 0
	for _, res := range results {
		if res.Passed {
			n++
		}
	}
	return n
}

// runLateJoinProbes probes each match's FULL retained history on this shard's
// own partition node (/history replays from the channel's oldest retained
// message; buffer cap 5000 keeps consumption bounded). Exactness over the
// complete buffer implies exactness over any subrange, and recovery_ms is the
// late-join catch-up latency sample.
func (r *shardRun) runLateJoinProbes(ctx context.Context) map[string]*deep.PathResult {
	out := make(map[string]*deep.PathResult, matchCount*8)
	sem := make(chan struct{}, 8)
	for round := 0; round < 8; round++ {
		for _, m := range matchIDs() {
			sem <- struct{}{}
			head, ok := r.headLookup(m)
			if !ok || head < 1 {
				out[fmt.Sprintf("late_join:%s:round-%d", m, round)] = &deep.PathResult{TransportResumeID: "history", Passed: false}
				<-sem
				continue
			}
			spec := pool.ProbeSpec{
				Key:      fmt.Sprintf("late_join:%s:round-%d", m, round),
				URL:      r.cfg.subURL + "/history/" + m,
				MatchID:  m,
				ResumeID: "history",
				First:    1,
				Target:   uint64(head),
			}
			res := r.pool.RunProbe(ctx, spec, lateJoinProbeTO)
			out[spec.Key] = res
			r.logf("late-join %s round %d passed=%v recovery_ms=%d missing=%d", m, round, res.Passed, res.RecoveryMs, res.MissingRequired)
			<-sem
		}
	}
	return out
}

func (r *shardRun) lateJoinScenario(results map[string]*deep.PathResult) coordinator.ScenarioEvidence {
	passed := 0
	exact := 0
	for _, res := range results {
		if res.Passed {
			passed++
		}
		if res.MissingRequired == 0 && res.Duplicates == 0 && res.OutOfOrder == 0 {
			exact++
		}
	}
	expected := matchCount * 8
	return coordinator.ScenarioEvidence{
		Name:         "late-join",
		Participated: true,
		Passed:       len(results) == expected && passed == expected,
		Detail: fmt.Sprintf("%d/%d probes exact, %d/%d passed",
			exact, expected, passed, expected),
		Structured: map[string]any{
			"probes_expected": expected,
			"probes_run":      len(results),
			"probes_passed":   passed,
			"probes_exact":    exact,
		},
	}
}

// reconnectScenario assembles the exact non-shrinking denominator evidence.
// Every field is measured: selected (frozen cohort), ready_before_hold (valid
// raw resume state), released, evaluated (one result per released client),
// passed, failed, missing_results. The drill passes only on the exact
// 64/64/64/64/64 with zero failures and zero missing results — a missing
// structured field or a shrunken denominator can never pass.
func (r *shardRun) reconnectScenario(hold pool.ReconnectHoldResult, released int, results map[string]*deep.PathResult) coordinator.ScenarioEvidence {
	passed := countPassed(results)
	evaluated := len(results)
	missingResults := released - evaluated
	if missingResults < 0 {
		missingResults = 0
	}
	failed := evaluated - passed
	if failed < 0 {
		failed = 0
	}
	structured := map[string]any{
		"selected":          hold.Selected,
		"ready_before_hold": hold.ReadyBeforeHold,
		"missing_raw_id":    hold.MissingRawID,
		"released":          released,
		"evaluated":         evaluated,
		"passed":            passed,
		"failed":            failed,
		"missing_results":   missingResults,
	}
	exact := hold.Selected == reconnectPerShard &&
		hold.ReadyBeforeHold == reconnectPerShard &&
		released == reconnectPerShard &&
		evaluated == reconnectPerShard &&
		passed == reconnectPerShard &&
		failed == 0 && missingResults == 0
	return coordinator.ScenarioEvidence{
		Name:         "reconnect",
		Participated: released > 0,
		Passed:       exact,
		Detail: fmt.Sprintf("selected=%d ready=%d released=%d evaluated=%d passed=%d failed=%d missing_results=%d",
			hold.Selected, hold.ReadyBeforeHold, released, evaluated, passed, failed, missingResults),
		Structured: structured,
	}
}

// runRestartScenario implements the bounded partition-targeted drill:
// the owner shard prefills a frozen corner range and probes the SPARE node's
// independent history domain; the restart-target shard drains its whole pool,
// literally restarts its partition node, fails over to the spare with
// Last-Event-ID resume, and proves the post-restart history exact; bystanders
// emit clean no-participation evidence.
func (r *shardRun) runRestartScenario(ctx context.Context) coordinator.ScenarioEvidence {
	if r.cfg.shardID == r.cfg.restartTarget {
		return r.runFailoverDrill(ctx)
	}
	// Owner/bystander partitions measure their own restart-phase correctness
	// window: any gap/duplicate/order violation observed while the target
	// shard fails over is real evidence and must reach the top-level counters.
	before := takeSnapshot(r.pool)
	var scenario coordinator.ScenarioEvidence
	if r.cfg.publisherOwner {
		scenario = r.runSpareProbe(ctx)
	} else {
		scenario = coordinator.ScenarioEvidence{
			Name:         "restart-replacement",
			Participated: false,
			Passed:       true,
			Detail:       "bystander partition unaffected",
			Structured:   map[string]any{"paths": map[string]any{}},
		}
	}
	delta := takeSnapshot(r.pool).sub(before)
	r.restartDelta = &delta
	if scenario.Structured == nil {
		scenario.Structured = map[string]any{}
	}
	scenario.Structured["pool"] = map[string]any{
		"failed":                 delta.failures,
		"gaps":                   delta.missing,
		"duplicates":             delta.duplicates,
		"order_violations":       delta.outOfOrder,
		"unexpected_disconnects": delta.unexpected,
	}
	return scenario
}

// restartIdentity binds restart-path evidence to the exact run (the
// coordinator's restartEvidenceMatchesRun predicate requires all four).
func (r *shardRun) restartIdentity() map[string]any {
	return map[string]any{
		"campaign_id":       r.cfg.campaignID,
		"experiment_run_id": r.cl.ExperimentRunID,
		"run_index":         r.cfg.runIndex,
		"shard_id":          r.cfg.shardID,
	}
}

// runSpareProbe: prefill a frozen canonical range, then prove the SPARE
// node's full retained history for the probe match is exact (the spare is an
// independent history/fan-out domain sharing the Redis store).
func (r *shardRun) runSpareProbe(ctx context.Context) coordinator.ScenarioEvidence {
	structured := r.restartIdentity()
	structured["paths"] = map[string]any{}
	scenario := coordinator.ScenarioEvidence{
		Name:         "restart-replacement",
		Participated: true,
		Passed:       false,
		Detail:       "spare-probe not executed",
		Structured:   structured,
	}
	if r.cfg.spareSubURL == "" || r.cfg.publisherURL == "" {
		scenario.Detail = "spare probe unavailable: spare/publisher URL missing"
		return scenario
	}
	pre, err := r.pub.Prefill(ctx, restartMatchID(), restartPrefillCount, "corner")
	if err != nil {
		scenario.Detail = "prefill failed: " + err.Error()
		return scenario
	}
	if pre.Published != restartPrefillCount || pre.LastSeq < pre.FirstSeq {
		scenario.Detail = fmt.Sprintf("prefill incomplete: published=%d range=[%d..%d]",
			pre.Published, pre.FirstSeq, pre.LastSeq)
		return scenario
	}
	if err := r.refreshHeads(ctx); err != nil {
		scenario.Detail = "evidence fetch after prefill: " + err.Error()
		return scenario
	}
	head, ok := r.headLookup(restartMatchID())
	if !ok || head < pre.LastSeq {
		scenario.Detail = fmt.Sprintf("head %d behind prefill last_seq %d", head, pre.LastSeq)
		return scenario
	}
	spec := pool.ProbeSpec{
		Key:      "spare_probe",
		URL:      r.cfg.spareSubURL + "/history/" + restartMatchID(),
		MatchID:  restartMatchID(),
		ResumeID: "history",
		First:    1,
		Target:   uint64(head),
	}
	res := r.pool.RunProbe(ctx, spec, restartProbeTO)
	r.logf("spare_probe passed=%v recovery_ms=%d missing=%d target=%d",
		res.Passed, res.RecoveryMs, res.MissingRequired, head)
	structured["paths"] = map[string]any{"spare_probe": res}
	structured["prefill"] = map[string]any{
		"published": pre.Published, "first_seq": pre.FirstSeq, "last_seq": pre.LastSeq,
	}
	scenario.Passed = res.Passed
	scenario.Detail = fmt.Sprintf("spare history [1..%d] exact=%v recovery_ms=%d",
		head, res.Passed, res.RecoveryMs)
	return scenario
}

// runFailoverDrill: planned drain of the ENTIRE shard pool → literal
// partition-node restart → failover to the spare with captured Last-Event-ID
// resume → settle → prove the spare's post-restart history for match_001
// exact. Pool continuity deltas across the window are the assignment's
// restart_failover_* metrics; any real failure blocks the drill.
func (r *shardRun) runFailoverDrill(ctx context.Context) coordinator.ScenarioEvidence {
	structured := r.restartIdentity()
	structured["paths"] = map[string]any{}
	scenario := coordinator.ScenarioEvidence{
		Name:         "restart-replacement",
		Participated: true,
		Passed:       false,
		Detail:       "failover drill not executed",
		Structured:   structured,
	}
	if r.cfg.spareSubURL == "" {
		scenario.Detail = "failover drill unavailable: spare subscriber URL missing"
		return scenario
	}
	before := takeSnapshot(r.pool)
	baselineActive := r.pool.ActiveCurrent()

	if err := r.refreshHeads(ctx); err != nil {
		scenario.Detail = "pre-drain evidence fetch: " + err.Error()
		return scenario
	}
	drained := r.pool.DrainAll()
	r.logf("failover drain: %d viewers held offline", drained)

	restartStart := time.Now()
	restartErr := dut.Restart(ctx, r.cfg.controlURL)
	if restartErr != nil {
		scenario.Detail = "literal restart failed: " + restartErr.Error()
		// release the held pool regardless so the run can continue collecting
		r.pool.ReleaseDrain()
		r.waitActive(baselineActive, 45*time.Second)
		return scenario
	}
	restartMs := time.Since(restartStart).Milliseconds()

	r.pool.SetSpare(r.cfg.spareSubURL)
	r.pool.ReleaseDrain()
	settled := r.waitActive(baselineActive, 45*time.Second)
	r.logf("failover settle: active=%d/%d settled=%v", r.pool.ActiveCurrent(), baselineActive, settled)

	if err := r.refreshHeads(ctx); err != nil {
		scenario.Detail = "post-restart evidence fetch: " + err.Error()
		return scenario
	}
	head, ok := r.headLookup(restartMatchID())
	if !ok || head < 1 {
		scenario.Detail = "no post-restart canonical head for " + restartMatchID()
		return scenario
	}
	spec := pool.ProbeSpec{
		Key:      "failover_drill",
		URL:      r.cfg.spareSubURL + "/history/" + restartMatchID(),
		MatchID:  restartMatchID(),
		ResumeID: "history",
		First:    1,
		Target:   uint64(head),
	}
	res := r.pool.RunProbe(ctx, spec, restartProbeTO)
	r.logf("failover_drill passed=%v recovery_ms=%d missing=%d target=%d",
		res.Passed, res.RecoveryMs, res.MissingRequired, head)

	delta := takeSnapshot(r.pool).sub(before)
	r.restartDelta = &delta
	reestablished := r.pool.ActiveCurrent()
	structured["paths"] = map[string]any{"failover_drill": res}
	structured["restart_ms"] = restartMs
	structured["drained"] = drained
	structured["settled"] = settled
	structured["pool"] = map[string]any{
		"failed":                 delta.failures,
		"gaps":                   delta.missing,
		"duplicates":             delta.duplicates,
		"order_violations":       delta.outOfOrder,
		"unexpected_disconnects": delta.unexpected,
		"schema_violations":      delta.schema,
		"agreement_violations":   delta.agreement,
		"reestablished":          reestablished,
	}
	scenario.Passed = res.Passed && settled && drained > 0 &&
		delta.failures == 0 && delta.missing == 0 && delta.duplicates == 0 &&
		delta.outOfOrder == 0 && reestablished > 0
	scenario.Detail = fmt.Sprintf("drain=%d restart_ok settle=%v history[1..%d] exact=%v pool_delta(f=%d,g=%d,d=%d,o=%d)",
		drained, settled, head, res.Passed, delta.failures, delta.missing, delta.duplicates, delta.outOfOrder)
	return scenario
}

// waitActive polls until active recovers to 98% of baseline (failover settle).
func (r *shardRun) waitActive(baseline int64, timeout time.Duration) bool {
	if baseline <= 0 {
		return false
	}
	floor := int64(float64(baseline) * establishFloorPct)
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if r.pool.ActiveCurrent() >= floor {
			return true
		}
		time.Sleep(250 * time.Millisecond)
	}
	return r.pool.ActiveCurrent() >= floor
}

// classifyShard applies the frozen local verdict rule: validity failures mean
// the shard's evidence cannot be trusted (INCONCLUSIVE); local correctness,
// scenario, or establishment failures are genuine DUT-facing rejections;
// otherwise the shard accepts.
func (r *shardRun) classifyShard(scenarios []coordinator.ScenarioEvidence, counters map[string]float64) coordinator.Verdict {
	v := r.valid
	if !v.GeneratorValid || !v.SourcePortHeadroomValid || !v.NginxWorkerCapacityValid ||
		!v.EnvironmentValid || !v.TimingValid || len(v.Reasons) > 0 {
		return coordinator.VerdictInconclusive
	}
	for _, name := range gatedCorrectnessCounters {
		if counters[name] > 0 {
			return coordinator.VerdictReject
		}
	}
	if counters["connection_failures"] > 0 || counters["unexpected_disconnects"] > 0 ||
		counters["schema_violations"] > 0 || counters["state_agreement_violations"] > 0 {
		return coordinator.VerdictReject
	}
	if r.baselineShortfall {
		return coordinator.VerdictReject
	}
	for _, s := range scenarios {
		if !s.Passed {
			return coordinator.VerdictReject
		}
	}
	return coordinator.VerdictAccept
}

var gatedCorrectnessCounters = []string{
	"missing_sequences", "duplicates", "out_of_order",
	"reconnect_gaps", "reconnect_duplicates", "reconnect_order_violations",
	"reconnect_missing_raw_id",
	"restart_failover_gaps", "restart_failover_duplicates", "restart_failover_order_violations",
	"restart_failover_connection_failures", "restart_failover_unexpected_disconnects",
	"surge_missing_sequences", "surge_duplicates", "surge_out_of_order", "surge_unexpected_disconnects",
	"missing_transport_id", "missing_canonical_seq", "canonical_seq_parse_errors",
	"json_parse_errors", "invalid_timestamp_count", "canonical_payload_state_violations",
	"schema_validation_errors", "lobby_malformed",
}

// assembleResult builds the wire-conformant ShardExperimentResult. Every
// mandatory field the coordinator validates strictly is populated here.
func (r *shardRun) assembleResult(
	samples []coordinator.AlignedSample,
	scenarios []coordinator.ScenarioEvidence,
	lateResults, reconnectResults map[string]*deep.PathResult,
	agreement struct{ agreed, disagreed, unmatched int64 },
	startedAt time.Time,
) *coordinator.ShardExperimentResult {
	cfg := r.cfg
	res := &coordinator.ShardExperimentResult{
		ContractVersion:            coordinator.ContractVersion,
		AggregateScope:             "shard",
		Scope:                      "shard",
		GlobalDirectAcceptEligible: false,

		ExperimentRunID: r.cl.ExperimentRunID,
		CampaignID:      cfg.campaignID,
		RunIndex:        cfg.runIndex,
		ShardID:         cfg.shardID,
		ShardCount:      cfg.shardTotal,
		LocalTarget:     cfg.localTarget,
		GlobalTarget:    cfg.globalTarget,
		Seed:            cfg.seed,
		SourceCommit:    cfg.sourceCommit,
		PublisherOwner:  cfg.publisherOwner,

		Samples:   samples,
		Scenarios: scenarios,
	}

	// validity flags
	r.valid.SourcePortHeadroomValid = r.srcPort != nil && r.srcPort.HeadroomValid
	r.valid.NginxWorkerCapacityValid = r.nchanMetrics != nil && len(r.valid.Reasons) == 0
	r.valid.EnvironmentValid = r.redisInfo != nil && r.nchanMetrics != nil
	r.valid.TimingValid = true

	// histograms: fan_out merges all deep-latency classes; goal/other split
	// per assignment classes; late_join records catch-up ms per probe;
	// burst is the burst-window class.
	goal := r.pool.GoalHistogram()
	other := r.pool.OtherHistogram()
	burst := r.pool.BurstHistogram()
	surge := r.pool.SurgeHistogram()
	merged := hist.New(hist.DefaultMaxMs)
	for _, s := range []hist.Serialized{goal, other} {
		_ = merged.Merge(&s)
	}
	res.Histograms.FanOut = wire(merged.Serialize())
	res.Histograms.GoalFanOut = wire(goal)
	res.Histograms.OtherFanOut = wire(other)
	res.Histograms.Burst = wire(burst)
	res.Histograms.Surge = wire(surge)
	lateHist := hist.New(hist.DefaultMaxMs)
	for key, pr := range lateResults {
		if strings.HasPrefix(key, "late_join:") {
			ms := pr.RecoveryMs
			if ms < 0 {
				ms = hist.DefaultMaxMs
			}
			lateHist.Record(int(ms))
		}
	}
	res.Histograms.LateJoin = wire(lateHist.Serialize())

	// correctness counters: lifetime transport continuity, windowed cohort
	// deltas, deep semantic violations (lifetime), informational extras.
	recGaps, recDups, recOOO := int64(0), int64(0), int64(0)
	for _, pr := range reconnectResults {
		recGaps += pr.MissingRequired
		recDups += pr.Duplicates
		recOOO += pr.OutOfOrder
	}
	if r.restartDelta == nil {
		r.reasonf("restart correctness window never measured")
	}
	var restartGaps, restartDups, restartOOO, restartConnFail, restartUnexp float64
	if r.restartDelta != nil {
		restartGaps = float64(r.restartDelta.missing)
		restartDups = float64(r.restartDelta.duplicates)
		restartOOO = float64(r.restartDelta.outOfOrder)
		restartConnFail = float64(r.restartDelta.failures)
		restartUnexp = float64(r.restartDelta.unexpected)
	}
	if r.surgeStats == nil || r.surgeDelta == nil {
		r.reasonf("surge population/correctness window never measured")
	}
	var surgeMissing, surgeDups, surgeOOO, surgeUnexp float64
	if r.surgeDelta != nil {
		surgeMissing = float64(r.surgeDelta.missing)
		surgeDups = float64(r.surgeDelta.duplicates)
		surgeOOO = float64(r.surgeDelta.outOfOrder)
		surgeUnexp = float64(r.surgeDelta.unexpected)
	}
	res.CorrectnessCounters = map[string]float64{
		"missing_sequences":                       float64(r.pool.Counters.MissingSequences.Load()),
		"duplicates":                              float64(r.pool.Counters.Duplicates.Load()),
		"out_of_order":                            float64(r.pool.Counters.OutOfOrder.Load()),
		"reconnect_gaps":                          float64(recGaps),
		"reconnect_duplicates":                    float64(recDups),
		"reconnect_order_violations":              float64(recOOO),
		"reconnect_missing_raw_id":                float64(r.pool.Counters.ReconnectMissingRawID.Load()),
		"restart_failover_gaps":                   restartGaps,
		"restart_failover_duplicates":             restartDups,
		"restart_failover_order_violations":       restartOOO,
		"restart_failover_connection_failures":    restartConnFail,
		"restart_failover_unexpected_disconnects": restartUnexp,
		"surge_missing_sequences":                 surgeMissing,
		"surge_duplicates":                        surgeDups,
		"surge_out_of_order":                      surgeOOO,
		"surge_unexpected_disconnects":            surgeUnexp,
		"gap_events":                              float64(r.pool.Counters.GapEvents.Load()),
		"connection_failures":                     float64(r.pool.Counters.ConnectionFailures.Load()),
		"unexpected_disconnects":                  float64(r.pool.Counters.UnexpectedDisconnects.Load()),
		"planned_disconnects":                     float64(r.pool.Counters.PlannedDisconnects.Load()),
		"schema_violations":                       float64(r.pool.Counters.SchemaViolations.Load()),
		"schema_validation_errors":                float64(r.pool.Counters.SchemaViolations.Load()),
		"json_parse_errors":                       float64(r.pool.Counters.JSONParseErrors.Load()),
		"invalid_timestamp_count":                 float64(r.pool.Counters.InvalidTimestampCount.Load()),
		"state_violations":                        float64(r.pool.Counters.StateViolations.Load()),
		"canonical_payload_state_violations":      float64(r.pool.Counters.CanonicalStateViolations.Load()),
		"agreement_violations":                    float64(r.pool.Counters.AgreementViolations.Load()),
		"state_agreement_violations":              float64(agreement.disagreed),
		"transport_id_present":                    float64(r.pool.Counters.TransportIDPresent.Load()),
		"missing_transport_id":                    float64(r.pool.Counters.MissingTransportID.Load()),
		"missing_canonical_seq":                   float64(r.pool.Counters.MissingCanonicalSeq.Load()),
		"canonical_seq_parse_errors":              float64(r.pool.Counters.CanonicalParseErrors.Load()),
		"deep_frames_validated":                   float64(r.pool.Counters.DeepFramesValidated.Load()),
		"frames_received":                         float64(r.pool.Counters.FramesReceived.Load()),
		"lobby_malformed":                         float64(r.pool.Counters.LobbyMalformed.Load()),
	}

	// workload: only the authoritative publisher reports accepted workload.
	res.Workload.EventsPublished = 0
	if cfg.publisherOwner {
		res.Workload.EventsPublished = r.pubPublished
	}
	res.Workload.PhaseRates = phaseRates(samples)

	// resources: generator runtime, this partition's control metrics (with
	// the mandatory numeric oom_kill_events), shared Redis, spare (target).
	var ms runtime.MemStats
	runtime.ReadMemStats(&ms)
	res.Resources.Generator = map[string]any{
		"go_version":       runtime.Version(),
		"goroutines":       runtime.NumGoroutine(),
		"heap_alloc_bytes": ms.HeapAlloc,
		"heap_sys_bytes":   ms.HeapSys,
		"sys_bytes":        ms.Sys,
		"num_gc":           ms.NumGC,
		"uptime_seconds":   time.Since(r.genStart).Seconds(),
	}
	res.Resources.Nchan = controlMetricsMap(r.nchanMetrics)
	redisMap := map[string]any{}
	if r.redisInfo != nil {
		redisMap["memory_used_bytes"] = r.redisInfo.UsedBytes
		redisMap["memory_peak_bytes"] = r.redisInfo.PeakBytes
		redisMap["connected_clients"] = r.redisInfo.ConnectedClients
	}
	res.Resources.Redis = redisMap
	if cfg.shardID == cfg.restartTarget && r.spareMetrics != nil {
		res.Resources.Spare = controlMetricsMap(r.spareMetrics)
	}

	// validity snapshot taken after every reason is recorded so late
	// evidence failures (e.g. unmeasured restart window) reach the wire.
	res.Validity = r.valid
	res.Verdict = r.classifyShard(scenarios, res.CorrectnessCounters)
	if res.Verdict != coordinator.VerdictAccept {
		r.logf("shard verdict=%s validity_reasons=%v counters=%v scenarios=%v", res.Verdict, r.valid.Reasons, res.CorrectnessCounters, scenarios)
	}
	_ = startedAt
	return res
}

// controlMetricsMap converts control-server metrics into the wire map. The
// coordinator requires a finite numeric oom_kill_events for EVERY partition;
// when metrics were fetched the value is always emitted (0 for absent
// counters). A nil input yields an empty map and the missing evidence is
// reported through validity reasons instead (INCONCLUSIVE, never silent).
func controlMetricsMap(m *dut.ControlMetrics) map[string]any {
	out := map[string]any{}
	if m == nil {
		return out
	}
	out["memory_current_bytes"] = derefInt64(m.MemoryCurrentBytes)
	out["memory_peak_bytes"] = derefInt64(m.MemoryPeakBytes)
	out["cpu_usage_usec"] = derefInt64(m.CpuUsageUsec)
	out["cpu_throttled_count"] = derefInt64(m.CpuThrottledCount)
	out["cpu_throttled_usec"] = derefInt64(m.CpuThrottledUsec)
	out["memory_oom_events"] = derefInt64(m.MemoryOomEvents)
	out["oom_kill_events"] = derefInt64(m.MemoryOomKillEvents)
	return out
}

func derefInt64(p *int64) int64 {
	if p == nil {
		return 0
	}
	return *p
}

// phaseRates derives attempted/accepted rates per phase from aligned samples.
func phaseRates(samples []coordinator.AlignedSample) []struct {
	Phase           string  `json:"phase"`
	AttemptedPerSec float64 `json:"attempted_per_sec"`
	AcceptedPerSec  float64 `json:"accepted_per_sec"`
} {
	type acc struct {
		phase                        string
		firstT, lastT                int64
		firstA, lastA, firstE, lastE int64
	}
	order := []string{}
	byPhase := map[string]*acc{}
	for _, s := range samples {
		a, ok := byPhase[s.Phase]
		if !ok {
			a = &acc{phase: s.Phase, firstT: s.TimestampMs, firstA: s.ConnectionsAttempted, firstE: s.ConnectionsEstablished}
			byPhase[s.Phase] = a
			order = append(order, s.Phase)
		}
		a.lastT = s.TimestampMs
		a.lastA = s.ConnectionsAttempted
		a.lastE = s.ConnectionsEstablished
	}
	out := make([]struct {
		Phase           string  `json:"phase"`
		AttemptedPerSec float64 `json:"attempted_per_sec"`
		AcceptedPerSec  float64 `json:"accepted_per_sec"`
	}, 0, len(order))
	for _, name := range order {
		a := byPhase[name]
		dt := float64(a.lastT-a.firstT) / 1000.0
		rate := struct {
			Phase           string  `json:"phase"`
			AttemptedPerSec float64 `json:"attempted_per_sec"`
			AcceptedPerSec  float64 `json:"accepted_per_sec"`
		}{Phase: name}
		if dt > 0 {
			rate.AttemptedPerSec = float64(a.lastA-a.firstA) / dt
			rate.AcceptedPerSec = float64(a.lastE-a.firstE) / dt
		}
		out = append(out, rate)
	}
	return out
}

// failureResult builds a conforming INCONCLUSIVE result when the run dies
// mid-flight, so the coordinator still collects this shard's evidence slot.
func (r *shardRun) failureResult(runErr error) *coordinator.ShardExperimentResult {
	cfg := r.cfg
	res := &coordinator.ShardExperimentResult{
		ContractVersion:            coordinator.ContractVersion,
		AggregateScope:             "shard",
		Scope:                      "shard",
		GlobalDirectAcceptEligible: false,

		ExperimentRunID: r.cl.ExperimentRunID,
		CampaignID:      cfg.campaignID,
		RunIndex:        cfg.runIndex,
		ShardID:         cfg.shardID,
		ShardCount:      cfg.shardTotal,
		LocalTarget:     cfg.localTarget,
		GlobalTarget:    cfg.globalTarget,
		Seed:            cfg.seed,
		SourceCommit:    cfg.sourceCommit,
		PublisherOwner:  cfg.publisherOwner,

		Verdict: coordinator.VerdictInconclusive,
		Samples: []coordinator.AlignedSample{},
		Scenarios: []coordinator.ScenarioEvidence{{
			Name:         "restart-replacement",
			Participated: false,
			Passed:       true,
			Detail:       "bystander partition unaffected",
			Structured:   map[string]any{"paths": map[string]any{}},
		}},
	}
	res.Validity = coordinator.Validity{
		Reasons: []string{runErr.Error()},
	}
	empty := wire(hist.New(hist.DefaultMaxMs).Serialize())
	res.Histograms.FanOut = empty
	res.Histograms.GoalFanOut = empty
	res.Histograms.OtherFanOut = empty
	res.Histograms.LateJoin = empty
	res.Histograms.Burst = empty
	res.Histograms.Surge = empty
	res.CorrectnessCounters = map[string]float64{}
	for _, name := range gatedCorrectnessCounters {
		res.CorrectnessCounters[name] = 0
	}
	return res
}

// wire converts a histogram serialization into the wire type (identical
// underlying layout; explicit conversion keeps the two schemas decoupled).
func wire(s hist.Serialized) coordinator.HistogramWire {
	return coordinator.HistogramWire(s)
}
