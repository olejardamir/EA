// Command loadgen is one lightweight generator shard (design doc §3/§7): it
// registers with the TypeScript coordinator, drives every coordinated phase,
// validates the full population's transport continuity plus the bounded deep
// cohort's semantics, and submits one ShardExperimentResult to the single
// canonical machine-verdict path.
package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"runtime"
	"runtime/pprof"
	"strconv"
	"strings"
	"sync/atomic"
	"syscall"
	"time"

	"ea/loadgen/internal/coordinator"
	"ea/loadgen/internal/deep"
	"ea/loadgen/internal/dut"
	"ea/loadgen/internal/pool"
	"ea/loadgen/internal/publisher"
)

const (
	matchCount      = 8
	deepPerMatch    = 32
	reconnectPerShard = 64
	lobbyFractionPct  = 2
	lateJoinPerShard  = matchCount // one probe per match
	burstWindowCapMs  = 30_000
	lateJoinWindow    = 4000 // history exactness window lower bound margin (frozen)
)

type config struct {
	campaignID   string
	runIndex     int
	shardID      int
	shardTotal   int
	globalTarget int
	localTarget  int
	seed         int
	sourceCommit string
	publisherOwner bool
	restartTarget  int // 0-based

	coordinatorURL string
	subURL         string
	pubURL         string
	controlURL     string
	spareSubURL    string
	sparePubURL    string
	spareControl   string
	publisherURL   string
	redisAddr      string

	targetConnections int
	warmupSeconds     int
	steadySeconds     int
	surgeSeconds      int
	stabilizeSeconds  int
	burstSeconds      int
	postBurstSeconds  int
	settleSeconds     int
}

func envInt(name string, def int) int {
	if v := os.Getenv(name); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}
func envStr(name string, def string) string {
	if v := os.Getenv(name); v != "" {
		return v
	}
	return def
}

func loadConfig() (*config, error) {
	c := &config{
		campaignID:        os.Getenv("CAMPAIGN_ID"),
		runIndex:          envInt("GLOBAL_RUN_INDEX", 0),
		shardID:           envInt("SHARD_ID", 0),
		shardTotal:        envInt("SHARD_TOTAL", 4),
		globalTarget:      envInt("GLOBAL_TARGET", 100000),
		localTarget:       envInt("TARGET_CONNECTIONS", 25000),
		seed:              envInt("GLOBAL_SEED", 42),
		sourceCommit:      os.Getenv("GIT_COMMIT_SHA"),
		publisherOwner:    os.Getenv("PUBLISHER_OWNER") == "true",
		restartTarget:     envInt("RESTART_TARGET_SHARD", 4) - 1,
		coordinatorURL:    strings.TrimSuffix(os.Getenv("COORDINATOR_URL"), "/"),
		subURL:            strings.TrimSuffix(os.Getenv("NCHAN_SUB_URL"), "/"),
		pubURL:            strings.TrimSuffix(os.Getenv("NCHAN_PUB_URL"), "/"),
		controlURL:        strings.TrimSuffix(os.Getenv("NCHAN_CONTROL_URL"), "/"),
		spareSubURL:       strings.TrimSuffix(os.Getenv("NCHAN_SPARE_SUB_URL"), "/"),
		sparePubURL:       strings.TrimSuffix(os.Getenv("NCHAN_SPARE_PUB_URL"), "/"),
		spareControl:      strings.TrimSuffix(os.Getenv("NCHAN_SPARE_CONTROL_URL"), "/"),
		publisherURL:      strings.TrimSuffix(os.Getenv("PUBLISHER_URL"), "/"),
		redisAddr:         envStr("REDIS_ADDR", "127.0.0.1:6379"),
		targetConnections: envInt("TARGET_CONNECTIONS", 25000),
		warmupSeconds:     envInt("WARMUP_SECONDS", 30),
		steadySeconds:     envInt("MEASURE_SECONDS", 120),
		surgeSeconds:      envInt("SURGE_SECONDS", 120),
		stabilizeSeconds:  envInt("COOLDOWN_SECONDS", 10),
		burstSeconds:      envInt("BURST_SECONDS", 30),
		postBurstSeconds:  envInt("POST_BURST_SECONDS", 10),
		settleSeconds:     envInt("SETTLE_SECONDS", 5),
	}
	var missing []string
	for name, v := range map[string]string{
		"CAMPAIGN_ID":   c.campaignID,
		"GIT_COMMIT_SHA": c.sourceCommit,
		"COORDINATOR_URL": c.coordinatorURL,
		"NCHAN_SUB_URL": c.subURL,
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
	return c, nil
}

func matchIDs() []string {
	out := make([]string, matchCount)
	for i := range out {
		out[i] = fmt.Sprintf("match_%03d", i+1)
	}
	return out
}

type shardRun struct {
	cfg   *config
	pool  *pool.Pool
	pub   *publisher.Client
	cl    *coordinator.Client
	logf  func(format string, args ...any)
	valid coordinator.Validity
	headCache atomic.Pointer[map[string]pool.CanonicalHead]
}

func logf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "[loadgen "+time.Now().UTC().Format(time.RFC3339)+"] "+format+"\n", args...)
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

// buildPopulation registers the frozen per-shard cohort mix:
//
//	lobby: 2% of target; matches share the remainder round-robin;
//	per match: 32 deep + 8 reconnect + remaining light.
func buildPopulation(p *pool.Pool, target int) error {
	matches := matchIDs()
	lobbyN := target * lobbyFractionPct / 100
	matchN := target - lobbyN
	base := (matchN - matchCount*(deepPerMatch)) / matchCount // light per match
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
	logf("registered shard=%d run=%s", cfg.shardID, runID)

	p := pool.New(cfg.subURL, matchIDs(), cfg.targetConnections+cfg.globalTarget)
	p.SetHeadLookup(func(matchID string) (int64, bool) { return r0.headLookup(matchID) })
	if err := buildPopulation(p, cfg.localTarget); err != nil {
		logf("population error: %v", err)
		cl.Abort(err.Error())
		os.Exit(3)
	}

	r := &shardRun{cfg: cfg, pool: p, pub: publisher.New(cfg.publisherURL), cl: cl}
	p.SetHeadLookup(r.headLookup)

	result, runErr := r.execute(ctx)
	if runErr != nil {
		logf("run aborted: %v", runErr)
		result = r.failureResult(runErr)
		cl.Abort(runErr.Error())
	}
	if err := cl.SubmitResult(result); err != nil {
		logf("submit failed: %v", err)
		os.Exit(4)
	}
	logf("result submitted verdict=%s", result.Verdict)
}

var r0 *shardRun // forward declaration resolved in main before pool start

func (r *shardRun) barrier(phase, boundary string) (time.Time, bool) {
	receipt, err := r.cl.Barrier(phase, boundary)
	if err != nil {
		logf("barrier %s:%s failed: %v", phase, boundary, err)
		return time.Time{}, false
	}
	return time.UnixMilli(receipt.ReleasedAtMs), true
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

// execute drives every coordinated phase in canonical order.
func (r *shardRun) execute(ctx context.Context) (*coordinator.ShardExperimentResult, error) {
	cfg := r.cfg
	startedAt := time.Now()

	// ── preflight ──
	if _, ok := r.barrier("preflight", "start"); !ok {
		return nil, fmt.Errorf("preflight start barrier")
	}
	sp, err := dut.BuildSourcePortEvidence(cfg.localTarget)
	if err == nil && !sp.HeadroomValid {
		err = fmt.Errorf("source-port headroom invalid: %+v", sp)
	}
	if spErr := sp; spErr == nil {
		r.valid.SourcePortHeadroomValid = true
	}
	if healthErr := dut.HealthCheck(ctx, cfg.pubURL); healthErr == nil {
		r.valid.EnvironmentValid = true
	} else {
		r.valid.Reasons = append(r.valid.Reasons, "partition healthcheck: "+healthErr.Error())
	}
	if pf, pfErr := dut.PreflightPartition(ctx, cfg.controlURL, cfg.localTarget); pfErr == nil && pf.Sufficient {
		r.valid.NginxWorkerCapacityValid = true
	} else if pfErr != nil {
		r.valid.Reasons = append(r.valid.Reasons, "partition preflight: "+pfErr.Error())
	} else {
		r.valid.Reasons = append(r.valid.Reasons, fmt.Sprintf("partition capacity insufficient for %d", cfg.localTarget))
	}
	if ri, riErr := dut.QueryRedisInfo(ctx, cfg.redisAddr); riErr == nil {
		r.valid.EnvironmentValid = r.valid.EnvironmentValid && ri.UsedBytes >= 0
	} else {
		r.valid.Reasons = append(r.valid.Reasons, "redis info: "+riErr.Error())
	}
	if cfg.publisherOwner && cfg.publisherURL != "" {
		if werr := r.refreshHeads(ctx); werr != nil {
			r.valid.Reasons = append(r.valid.Reasons, "publisher evidence unreachable: "+werr.Error())
		} else if serr := r.pub.Reset(ctx); serr != nil {
			r.valid.Reasons = append(r.valid.Reasons, "publisher reset failed: "+serr.Error())
		}
	}
	r.valid.GeneratorValid = len(r.valid.Reasons) == 0
	if _, ok := r.barrier("preflight", "end"); !ok {
		return nil, fmt.Errorf("preflight end barrier")
	}

	// ── warmup: connect baseline ──
	if _, ok := r.barrier("warmup", "start"); !ok {
		return nil, fmt.Errorf("warmup start barrier")
	}
	r.pool.Start()
	r.cl.StartSampling(time.Second, func() (int64, int64, int64, int64) {
		return r.pool.ActiveCurrent(), r.pool.AttemptedTotal(), r.pool.EstablishedTotal(),
			r.pool.Counters.ConnectionFailures.Load()
	})
	if !waitEstablished(r.pool, cfg.localTarget, time.Duration(cfg.warmupSeconds)*time.Second) {
		r.valid.Reasons = append(r.valid.Reasons, "baseline establishment shortfall")
	}
	if _, ok := r.barrier("warmup", "end"); !ok {
		return nil, fmt.Errorf("warmup end barrier")
	}

	// ── steady measure ──
	if _, ok := r.barrier("steady", "start"); !ok {
		return nil, fmt.Errorf("steady start barrier")
	}
	if !sleepCtx(ctx, time.Duration(cfg.steadySeconds)*time.Second) {
		return nil, fmt.Errorf("steady window interrupted")
	}
	if _, ok := r.barrier("steady", "end"); !ok {
		return nil, fmt.Errorf("steady end barrier")
	}

	// ── surge (+40k global within 120s; local share ramps evenly) ──
	if _, ok := r.barrier("surge", "start"); !ok {
		return nil, fmt.Errorf("surge start barrier")
	}
	surgeLocal := (cfg.globalTarget + 40000)/cfg.shardTotal - cfg.localTarget
	if surgeLocal > 0 {
		r.rampSurge(surgeLocal, time.Duration(cfg.surgeSeconds)*time.Second)
	}
	if _, ok := r.barrier("surge", "end"); !ok {
		return nil, fmt.Errorf("surge end barrier")
	}

	// ── stabilization ──
	if _, ok := r.barrier("stabilization", "start"); !ok {
		return nil, fmt.Errorf("stabilization start barrier")
	}
	sleepCtx(ctx, time.Duration(cfg.stabilizeSeconds)*time.Second)
	if _, ok := r.barrier("stabilization", "end"); !ok {
		return nil, fmt.Errorf("stabilization end barrier")
	}

	// ── late join (history probes, one per match, all partitions covered) ──
	if _, ok := r.barrier("late-join", "start"); !ok {
		return nil, fmt.Errorf("late-join start barrier")
	}
	if err := r.refreshHeads(ctx); err != nil {
		r.valid.Reasons = append(r.valid.Reasons, "late-join evidence fetch: "+err.Error())
	}
	lateResults := r.runLateJoinProbes(ctx)
	if _, ok := r.barrier("late-join", "end"); !ok {
		return nil, fmt.Errorf("late-join end barrier")
	}

	// ── burst ──
	if _, ok := r.barrier("burst", "start"); !ok {
		return nil, fmt.Errorf("burst start barrier")
	}
	r.pool.BeginBurstWindow()
	if cfg.publisherOwner && cfg.publisherURL != "" {
		if berr := r.pub.Burst(ctx, cfg.burstSeconds); berr != nil {
			r.valid.Reasons = append(r.valid.Reasons, "burst trigger failed: "+berr.Error())
		}
	}
	sleepCtx(ctx, time.Duration(cfg.burstSeconds+2)*time.Second) // +2s tail coverage
	r.pool.EndBurstWindow()
	if _, ok := r.barrier("burst", "end"); !ok {
		return nil, fmt.Errorf("burst end barrier")
	}

	// ── post-burst settle ──
	if _, ok := r.barrier("post-burst", "start"); !ok {
		return nil, fmt.Errorf("post-burst start barrier")
	}
	sleepCtx(ctx, time.Duration(cfg.postBurstSeconds)*time.Second)
	if _, ok := r.barrier("post-burst", "end"); !ok {
		return nil, fmt.Errorf("post-burst end barrier")
	}

	// ── reconnect cohort drill ──
	if _, ok := r.barrier("reconnect", "start"); !ok {
		return nil, fmt.Errorf("reconnect start barrier")
	}
	r.pool.HoldReconnectCohort()
	sleepCtx(ctx, time.Duration(cfg.settleSeconds)*time.Second)
	if err := r.refreshHeads(ctx); err != nil {
		r.valid.Reasons = append(r.valid.Reasons, "reconnect evidence fetch: "+err.Error())
	}
	released := r.pool.ReleaseReconnectCohort()
	waitReconnectSettled(released, r.pool, 45*time.Second)
	reconnectResults := r.pool.CollectReconnectResults()
	if released > 0 && len(reconnectResults) == 0 {
		r.valid.Reasons = append(r.valid.Reasons, "no reconnect path evidence collected")
	}
	if _, ok := r.barrier("reconnect", "end"); !ok {
		return nil, fmt.Errorf("reconnect end barrier")
	}

	// ── restart-replacement (bounded: target shard only) ──
	scenario := r.runRestartScenario(ctx)
	if _, ok := r.barrier("restart-replacement", "start"); !ok {
		return nil, fmt.Errorf("restart start barrier")
	}
	sleepCtx(ctx, scenarioHold(scenario))
	if _, ok := r.barrier("restart-replacement", "end"); !ok {
		return nil, fmt.Errorf("restart end barrier")
	}

	// ── final metrics ──
	if _, ok := r.barrier("final-metrics", "start"); !ok {
		return nil, fmt.Errorf("final-metrics start barrier")
	}
	if cfg.publisherOwner && cfg.publisherURL != "" {
		_ = r.pub.Stop(ctx) // quiesce publication so head agreement is final
	}
	time.Sleep(2 * time.Second) // in-flight frame drain
	r.cl.StopSampling()
	r.pool.Stop()
	if err := r.refreshHeads(ctx); err == nil {
		agreed, disagreed, unmatched := r.pool.DeepHeadAgreement(*r.headCache.Load())
		logf("deep head agreement agreed=%d disagreed=%d unmatched=%d", agreed, disagreed, unmatched)
		if disagreed > 0 {
			r.pool.Counters.StateViolations.Add(disagreed)
		}
	}
	if _, ok := r.barrier("final-metrics", "end"); !ok {
		return nil, fmt.Errorf("final-metrics end barrier")
	}

	result := r.assembleResult(sp, lateResults, reconnectResults, []scenarioEvidence{scenario}, startedAt)
	return result, nil
}

func scenarioHold(s scenarioEvidence) time.Duration {
	if s.Name == "restart-replacement" && s.Participated {
		return 90 * time.Second
	}
	return time.Second
}

// rampSurge establishes n additional lightweight connections spread evenly
// across the surge window.
func (r *shardRun) rampSurge(n int, window time.Duration) {
	p := r.pool
	total := len(p.ViewerCount())
	_ = total
	added := 0
	step := 200 * time.Millisecond
	steps := int(window / step)
	perStep := (n + steps - 1) / steps
	ticker := time.NewTicker(step)
	defer ticker.Stop()
	for added < n {
		<-ticker.C
		batch := perStep
		if added+batch > n {
			batch = n - added
		}
		idx := make([]int, 0, batch)
		for i := 0; i < batch; i++ {
			vi, err := p.AppendLightViewer()
			if err != nil {
				break
			}
			idx = append(idx, vi)
			added++
		}
		p.StartIndices(idx)
	}
}

func waitEstablished(p *pool.Pool, target int, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if p.ActiveCurrent() >= int64(float64(target)*0.98) {
			return true
		}
		time.Sleep(250 * time.Millisecond)
	}
	return p.ActiveCurrent() >= int64(target)
}

func waitReconnectSettled(released int, p *pool.Pool, timeout time.Duration) {
	if released == 0 {
		return
	}
	time.Sleep(10 * time.Second) // replay ranges are small; generous fixed settle
}

// runLateJoinProbes probes each match's full retained history against the
// independently fetched publisher head (expected side), measuring catch-up.
func (r *shardRun) runLateJoinProbes(ctx context.Context) map[string]*deep.PathResult {
	out := make(map[string]*deep.PathResult)
	for _, m := range matchIDs() {
		head, ok := r.headLookup(m)
		if !ok || head < lateJoinWindow {
			out["late_join:"+m] = &deep.PathResult{Passed: false}
			continue
		}
		spec := pool.ProbeSpec{
			Key:     "late_join:" + m,
			URL:     r.cfg.subURL + "/history/match:" + m,
			MatchID: m,
			First:   uint64(head - lateJoinWindow + 1),
			Target:  uint64(head),
		}
		res := r.pool.RunProbe(ctx, spec, 15*time.Second)
		out[spec.Key] = res
	}
	return out
}

type scenarioEvidence = coordinator.ScenarioEvidence

// runRestartScenario implements the bounded drill: owner spare-probe on a
// frozen prefilled range; target shard planned-drain → literal partition
// restart → failover to spare with Last-Event-ID resume + failover probe;
// bystanders emit clean no-participation evidence.
func (r *shardRun) runRestartScenario(ctx context.Context) scenarioEvidence {
	cfg := r.cfg
	base := scenarioEvidence{
		Name:         "restart-replacement",
		Participated: false,
		Passed:       true,
		Detail:       "bystander partition unaffected",
		Structured:   map[string]any{"paths": map[string]any{}},
		identityFields: identity{campaign: cfg.campaignID},
	}
	switch cfg.shardID {
	case cfg.restartTarget:
		return r.runFailoverDrill(ctx)
	case 0:
		if cfg.publisherOwner {
			return r.runSpareProbe(ctx)
		}
		return base
	default:
		return base
	}
}

type identity struct{ campaign string }

func main() {}
