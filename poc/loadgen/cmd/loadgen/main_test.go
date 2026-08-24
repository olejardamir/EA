package main

import (
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"ea/loadgen/internal/coordinator"
	"ea/loadgen/internal/deep"
	"ea/loadgen/internal/dut"
	"ea/loadgen/internal/hist"
	"ea/loadgen/internal/pool"
	"ea/loadgen/internal/publisher"
)

const testCommit = "c89159e8882206de9fffa2b170a38d76854288ce"

// validValidity is the all-green validity state (no reasons, every flag true).
func validValidity() coordinator.Validity {
	return coordinator.Validity{
		GeneratorValid:           true,
		SourcePortHeadroomValid:  true,
		NginxWorkerCapacityValid: true,
		EnvironmentValid:         true,
		TimingValid:              true,
	}
}

func testConfig(shardID int) *config {
	return &config{
		campaignID:     "camp-test",
		runIndex:       0,
		shardID:        shardID,
		shardTotal:     4,
		globalTarget:   100000,
		localTarget:    25000,
		surgeLocal:     10000,
		seed:           42,
		steadySeconds:  120,
		surgeSeconds:   120,
		burstSeconds:   30,
		sourceCommit:   testCommit,
		publisherOwner: false,
		restartTarget:  3,
		subURL:         "http://nchan-p0:8081/sub",
		pubURL:         "http://nchan-p0:8081/pub",
		controlURL:     "http://nchan-p0:8081/control",
		spareSubURL:    "",
		publisherURL:   "",
		redisAddr:      "redis:6379",
	}
}

func testShardRun(cfg *config) (*shardRun, *pool.Pool) {
	p := pool.New("http://127.0.0.1:1/sub", matchIDs(), cfg.localTarget)
	// Literal IP always resolves; the harness fix resolves once at startup.
	cl, _ := coordinator.NewClient("http://127.0.0.1:1", coordinator.Registration{
		CampaignID: cfg.campaignID, ShardID: cfg.shardID, ShardCount: cfg.shardTotal,
	})
	cl.ExperimentRunID = "run-test-0001"
	r := &shardRun{
		cfg:          cfg,
		pool:         p,
		pub:          publisher.New(""),
		cl:           cl,
		valid:        validValidity(),
		genStart:     time.Now(),
		srcPort:      &dut.SourcePortEvidence{HeadroomValid: true},
		redisInfo:    &dut.RedisInfo{UsedBytes: 1024, PeakBytes: 2048, ConnectedClients: 8},
		nchanMetrics: completeMetrics(),
		surgeStats:   &surgeRunStats{elapsedMs: int64(cfg.surgeSeconds) * 1000, deadlineMs: int64(cfg.surgeSeconds) * 1000},
		surgeDelta:   &counterSnapshot{},
		genRuntime:   &dut.GeneratorRuntimeEvidence{},
	}
	seedTiming(r)
	seedResources(r)
	exp := p.DeepExpected()
	r.deepAgree = &deepAgreementSnapshot{expected: exp, agreed: exp}
	return r, p
}

// completeMetrics returns a ControlMetrics snapshot with every mandatory R12
// field present and numeric.
func completeMetrics() *dut.ControlMetrics {
	cur, peak := int64(1024), int64(2048)
	cpu, thrC, thrU := int64(5000), int64(0), int64(0)
	oom, oomKill := int64(0), int64(0)
	return &dut.ControlMetrics{
		MemoryCurrentBytes: &cur, MemoryPeakBytes: &peak,
		CpuUsageUsec: &cpu, CpuThrottledCount: &thrC, CpuThrottledUsec: &thrU,
		MemoryOomEvents: &oom, MemoryOomKillEvents: &oomKill,
	}
}

// seedResources fills a synthetic shardRun with complete phase-spanning R12
// resource evidence: all seven stages numeric and healthy, a stable nginx
// worker set (replaced exactly once at the planned restart on the target), and
// spare snapshots across failover for the restart target.
func seedResources(r *shardRun) {
	isTarget := r.cfg.shardID == r.cfg.restartTarget
	mk := func() *dut.ControlMetrics {
		cur, peak := int64(1024), int64(2048)
		cpu, thrC, thrU := int64(5000), int64(0), int64(0)
		oom, oomKill := int64(0), int64(0)
		return &dut.ControlMetrics{
			MemoryCurrentBytes: &cur, MemoryPeakBytes: &peak,
			CpuUsageUsec: &cpu, CpuThrottledCount: &thrC, CpuThrottledUsec: &thrU,
			MemoryOomEvents: &oom, MemoryOomKillEvents: &oomKill,
		}
	}
	pids := func(stage string) []int64 {
		if isTarget && (stage == "post_restart" || stage == "final") {
			return []int64{201, 202}
		}
		return []int64{101, 102}
	}
	r.resMu.Lock()
	r.resSnapshots = map[string]*dut.ControlMetrics{}
	r.prefSnapshots = map[string]*dut.Preflight{}
	for _, stage := range resourceStages {
		r.resSnapshots[stage] = mk()
		master := int64(100)
		total := int64(100000)
		active := int64(500)
		r.prefSnapshots[stage] = &dut.Preflight{
			NginxMasterPid:         &master,
			NginxWorkerPids:        pids(stage),
			WorkerConnectionsTotal: &total,
			NginxActive:            &active,
		}
	}
	if isTarget && r.cfg.spareControl == "" {
		r.cfg.spareControl = "http://spare.invalid"
	}
	if isTarget {
		r.spareResSnaps = map[string]*dut.ControlMetrics{
			"post_restart": mk(),
			"final":        mk(),
		}
	}
	r.resMu.Unlock()
}

// seedTiming fills a synthetic shardRun with plausible measured phase-boundary
// evidence so assembleResult's R10 timing computation can pass; individual
// tests then corrupt specific fields to prove invalidation.
func seedTiming(r *shardRun) {
	now := time.Now()
	r.timingMu.Lock()
	defer r.timingMu.Unlock()
	r.runStartWall = now.Add(-time.Hour)
	if r.phaseStart == nil {
		r.phaseStart = map[string]time.Time{}
		r.phaseEnd = map[string]time.Time{}
	}
	cursor := r.runStartWall
	for _, phase := range coordinator.Phases {
		dur := 10 * time.Second
		if phase == "burst" {
			dur = time.Duration(r.cfg.burstSeconds)*time.Second + time.Second
		}
		if phase == "surge" {
			dur = time.Duration(r.cfg.surgeSeconds) * time.Second
		}
		r.phaseStart[phase] = cursor
		cursor = cursor.Add(dur)
		r.phaseEnd[phase] = cursor
		cursor = cursor.Add(2 * time.Second)
	}
	r.restartMeasured = true
	r.restartWindowMs = 5000
	r.lateJoinProbesRan = 1
	r.lateJoinMaxRecoveryMs = 500
}

func passingScenarios() []coordinator.ScenarioEvidence {
	return []coordinator.ScenarioEvidence{
		{Name: "late-join", Participated: true, Passed: true},
		{Name: "burst", Participated: true, Passed: true},
		{Name: "reconnect", Participated: true, Passed: true},
		{Name: "restart-replacement", Participated: false, Passed: true},
	}
}

func zeroCounters() map[string]float64 {
	return map[string]float64{}
}

// ── config ───────────────────────────────────────────────────────────────────

func TestLoadConfigMissingRequiredEnv(t *testing.T) {
	for _, name := range []string{"CAMPAIGN_ID", "GIT_COMMIT_SHA", "COORDINATOR_URL", "NCHAN_SUB_URL"} {
		t.Run(name, func(t *testing.T) {
			t.Setenv("CAMPAIGN_ID", "c")
			t.Setenv("GIT_COMMIT_SHA", testCommit)
			t.Setenv("COORDINATOR_URL", "http://coord")
			t.Setenv("NCHAN_SUB_URL", "http://sub")
			t.Setenv(name, "")
			if _, err := loadConfig(); err == nil || !strings.Contains(err.Error(), name) {
				t.Fatalf("want error naming %s, got %v", name, err)
			}
		})
	}
}

func TestLoadConfigRejectsShortCommitSHA(t *testing.T) {
	t.Setenv("CAMPAIGN_ID", "c")
	t.Setenv("GIT_COMMIT_SHA", "abc123")
	t.Setenv("COORDINATOR_URL", "http://coord")
	t.Setenv("NCHAN_SUB_URL", "http://sub")
	if _, err := loadConfig(); err == nil || !strings.Contains(err.Error(), "40-hex") {
		t.Fatalf("want 40-hex error, got %v", err)
	}
}

func TestLoadConfigRejectsShardIDOutOfRange(t *testing.T) {
	base := func() {
		t.Helper()
		t.Setenv("CAMPAIGN_ID", "c")
		t.Setenv("GIT_COMMIT_SHA", testCommit)
		t.Setenv("COORDINATOR_URL", "http://coord")
		t.Setenv("NCHAN_SUB_URL", "http://sub")
	}
	base()
	t.Setenv("SHARD_TOTAL", "4")
	t.Setenv("SHARD_ID", "4")
	if _, err := loadConfig(); err == nil || !strings.Contains(err.Error(), "SHARD_ID") {
		t.Fatalf("want SHARD_ID range error, got %v", err)
	}
	base()
	t.Setenv("SHARD_TOTAL", "4")
	t.Setenv("SHARD_ID", "-1")
	if _, err := loadConfig(); err == nil {
		t.Fatal("want negative SHARD_ID rejected")
	}
}

func TestLoadConfigRejectsRestartTargetRange(t *testing.T) {
	t.Setenv("CAMPAIGN_ID", "c")
	t.Setenv("GIT_COMMIT_SHA", testCommit)
	t.Setenv("COORDINATOR_URL", "http://coord")
	t.Setenv("NCHAN_SUB_URL", "http://sub")
	t.Setenv("SHARD_TOTAL", "4")
	t.Setenv("RESTART_TARGET_SHARD", "5")
	if _, err := loadConfig(); err == nil || !strings.Contains(err.Error(), "RESTART_TARGET_SHARD") {
		t.Fatalf("want restart target range error, got %v", err)
	}
}

func TestLoadConfigSurgeLocalMathAndTrimming(t *testing.T) {
	t.Setenv("CAMPAIGN_ID", "c")
	t.Setenv("GIT_COMMIT_SHA", testCommit)
	t.Setenv("COORDINATOR_URL", "http://coord/")
	t.Setenv("NCHAN_SUB_URL", "http://sub/")
	t.Setenv("GLOBAL_TARGET", "100000")
	t.Setenv("TARGET_CONNECTIONS", "25000")
	t.Setenv("SHARD_TOTAL", "4")
	cfg, err := loadConfig()
	if err != nil {
		t.Fatalf("loadConfig: %v", err)
	}
	// (100000+40000)/4 - 25000 = 10000
	if cfg.surgeLocal != 10000 {
		t.Fatalf("surgeLocal = %d, want 10000", cfg.surgeLocal)
	}
	if cfg.coordinatorURL != "http://coord" || cfg.subURL != "http://sub" {
		t.Fatalf("trailing slashes not trimmed: %q %q", cfg.coordinatorURL, cfg.subURL)
	}
	if cfg.restartTarget != 3 { // defaults to shardTotal-1
		t.Fatalf("restartTarget = %d, want 3", cfg.restartTarget)
	}
}

func TestLoadConfigSurgeLocalClampsNegative(t *testing.T) {
	t.Setenv("CAMPAIGN_ID", "c")
	t.Setenv("GIT_COMMIT_SHA", testCommit)
	t.Setenv("COORDINATOR_URL", "http://coord")
	t.Setenv("NCHAN_SUB_URL", "http://sub")
	t.Setenv("TARGET_CONNECTIONS", "60000") // local > per-shard share
	cfg, err := loadConfig()
	if err != nil {
		t.Fatalf("loadConfig: %v", err)
	}
	if cfg.surgeLocal != 0 {
		t.Fatalf("surgeLocal = %d, want clamped 0", cfg.surgeLocal)
	}
}

// ── population ───────────────────────────────────────────────────────────────

func TestBuildPopulationExactTotal(t *testing.T) {
	for _, target := range []int{5000, 25000} {
		p := pool.New("", matchIDs(), target)
		if err := buildPopulation(p, target); err != nil {
			t.Fatalf("target=%d: %v", target, err)
		}
		if got := p.ViewerCount(); got != target {
			t.Fatalf("target=%d registered %d viewers", target, got)
		}
		lobbyN := target * lobbyFractionPct / 100
		wantDeep := matchCount * deepPerMatch
		wantRec := reconnectPerShard
		_ = lobbyN
		_ = wantDeep
		_ = wantRec
	}
}

func TestBuildPopulationCohortMixMath(t *testing.T) {
	target := 25000
	lobbyN := target * lobbyFractionPct / 100 // 500
	matchN := target - lobbyN                 // 24500
	base := (matchN - matchCount*deepPerMatch) / matchCount
	extra := (matchN - matchCount*deepPerMatch) - base*matchCount
	recPerMatch := reconnectPerShard / matchCount

	// frozen invariants from the architecture design (§cohort mix)
	if lobbyN != 500 || wantInt(matchCount) != 8 || deepPerMatch != 32 ||
		reconnectPerShard != 64 || recPerMatch != 8 {
		t.Fatalf("frozen cohort constants drifted: lobby=%d base=%d extra=%d rec=%d",
			lobbyN, base, extra, recPerMatch)
	}
	lightTotal := (base-recPerMatch)*matchCount + extra
	total := lobbyN + matchCount*(deepPerMatch+recPerMatch) + lightTotal
	if total != target {
		t.Fatalf("mix sums to %d, want %d", total, target)
	}
}

func wantInt(n int) int { return n }

func TestBuildPopulationRejectsTooSmallTarget(t *testing.T) {
	p := pool.New("", matchIDs(), 300)
	err := buildPopulation(p, 300)
	if err == nil || !strings.Contains(err.Error(), "too small") {
		t.Fatalf("want too-small error, got %v", err)
	}
}

func TestMatchIDsShape(t *testing.T) {
	ids := matchIDs()
	if len(ids) != matchCount {
		t.Fatalf("len = %d, want %d", len(ids), matchCount)
	}
	if ids[0] != "match-001" || ids[len(ids)-1] != "match-008" {
		t.Fatalf("unexpected ids %v..%v", ids[0], ids[len(ids)-1])
	}
	for i, id := range ids {
		want := fmt.Sprintf("match-%03d", i+1)
		if id != want {
			t.Fatalf("ids[%d] = %q, want %q", i, id, want)
		}
	}
}

// ── counter snapshots (windowed deltas) ─────────────────────────────────────

func TestCounterSnapshotDeltaArithmetic(t *testing.T) {
	a := counterSnapshot{missing: 10, duplicates: 6, outOfOrder: 4, failures: 2, unexpected: 1, schema: 3, agreement: 5}
	b := counterSnapshot{missing: 7, duplicates: 6, outOfOrder: 0, failures: 0, unexpected: 1, schema: 1, agreement: 5}
	d := a.sub(b)
	if d.missing != 3 || d.duplicates != 0 || d.outOfOrder != 4 || d.failures != 2 ||
		d.unexpected != 0 || d.schema != 2 || d.agreement != 0 {
		t.Fatalf("delta wrong: %+v", d)
	}
}

func TestTakeSnapshotReadsPoolCounters(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	p.Counters.MissingSequences.Store(11)
	p.Counters.Duplicates.Store(4)
	snap := takeSnapshot(p)
	if snap.missing != 11 || snap.duplicates != 4 {
		t.Fatalf("snapshot mismatch: %+v", snap)
	}
	_ = r
}

// ── verdict classification (frozen local rule) ───────────────────────────────

func TestClassifyShardRules(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*shardRun, map[string]float64, *[]coordinator.ScenarioEvidence)
		want   coordinator.Verdict
	}{
		{
			name:   "all clean accepts",
			mutate: func(*shardRun, map[string]float64, *[]coordinator.ScenarioEvidence) {},
			want:   coordinator.VerdictAccept,
		},
		{
			name: "validity reason forces inconclusive",
			mutate: func(r *shardRun, _ map[string]float64, _ *[]coordinator.ScenarioEvidence) {
				r.reasonf("partition healthcheck: boom")
			},
			want: coordinator.VerdictInconclusive,
		},
		{
			name: "missing sequences rejects",
			mutate: func(_ *shardRun, c map[string]float64, _ *[]coordinator.ScenarioEvidence) {
				c["missing_sequences"] = 1
			},
			want: coordinator.VerdictReject,
		},
		{
			name: "reconnect gaps reject",
			mutate: func(_ *shardRun, c map[string]float64, _ *[]coordinator.ScenarioEvidence) {
				c["reconnect_gaps"] = 2
			},
			want: coordinator.VerdictReject,
		},
		{
			name: "restart failover duplicates reject",
			mutate: func(_ *shardRun, c map[string]float64, _ *[]coordinator.ScenarioEvidence) {
				c["restart_failover_duplicates"] = 1
			},
			want: coordinator.VerdictReject,
		},
		{
			name: "connection failures reject",
			mutate: func(_ *shardRun, c map[string]float64, _ *[]coordinator.ScenarioEvidence) {
				c["connection_failures"] = 1
			},
			want: coordinator.VerdictReject,
		},
		{
			name: "schema violations reject",
			mutate: func(_ *shardRun, c map[string]float64, _ *[]coordinator.ScenarioEvidence) {
				c["schema_violations"] = 1
			},
			want: coordinator.VerdictReject,
		},
		{
			name: "state agreement violations reject",
			mutate: func(_ *shardRun, c map[string]float64, _ *[]coordinator.ScenarioEvidence) {
				c["state_agreement_violations"] = 1
			},
			want: coordinator.VerdictReject,
		},
		{
			name: "baseline shortfall rejects",
			mutate: func(r *shardRun, _ map[string]float64, _ *[]coordinator.ScenarioEvidence) {
				r.baselineShortfall = true
			},
			want: coordinator.VerdictReject,
		},
		{
			name: "failed scenario rejects",
			mutate: func(_ *shardRun, _ map[string]float64, s *[]coordinator.ScenarioEvidence) {
				(*s)[2].Passed = false // reconnect scenario failed
			},
			want: coordinator.VerdictReject,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r, p := testShardRun(testConfig(0))
			defer p.Stop()
			scenarios := passingScenarios()
			counters := zeroCounters()
			tc.mutate(r, counters, &scenarios)
			if got := r.classifyShard(scenarios, counters); got != tc.want {
				t.Fatalf("verdict = %s, want %s", got, tc.want)
			}
		})
	}
}

func TestClassifyShardInvalidityFlagForcesInconclusive(t *testing.T) {
	for _, flag := range []string{"GeneratorValid", "SourcePortHeadroomValid", "NginxWorkerCapacityValid", "EnvironmentValid", "TimingValid"} {
		t.Run(flag, func(t *testing.T) {
			r, p := testShardRun(testConfig(0))
			defer p.Stop()
			switch flag {
			case "GeneratorValid":
				r.valid.GeneratorValid = false
			case "SourcePortHeadroomValid":
				r.valid.SourcePortHeadroomValid = false
			case "NginxWorkerCapacityValid":
				r.valid.NginxWorkerCapacityValid = false
			case "EnvironmentValid":
				r.valid.EnvironmentValid = false
			case "TimingValid":
				r.valid.TimingValid = false
			}
			got := r.classifyShard(passingScenarios(), zeroCounters())
			if got != coordinator.VerdictInconclusive {
				t.Fatalf("%s=false gave %s, want INCONCLUSIVE", flag, got)
			}
		})
	}
}

// ── result assembly (wire conformance) ───────────────────────────────────────

func TestAssembleResultWireConformance(t *testing.T) {
	r, p := testShardRun(testConfig(2))
	defer p.Stop()
	r.pubPublished = 12345
	r.restartDelta = &counterSnapshot{}

	res := r.assembleResult(nil, passingScenarios(),
		map[string]*deep.PathResult{}, map[string]*deep.PathResult{},
		struct{ agreed, disagreed, unmatched int64 }{}, time.Now())

	if res.ContractVersion != coordinator.ContractVersion {
		t.Fatalf("contract version = %q", res.ContractVersion)
	}
	if res.AggregateScope != "shard" || res.Scope != "shard" {
		t.Fatalf("scope fields wrong: %q/%q", res.AggregateScope, res.Scope)
	}
	if res.GlobalDirectAcceptEligible {
		t.Fatal("shard results must never be globally direct-accept eligible")
	}
	if res.ShardID != 2 || res.ShardCount != 4 || res.Seed != 42 || res.LocalTarget != 25000 {
		t.Fatalf("identity fields wrong: %+v", res)
	}
	if res.SourceCommit != testCommit {
		t.Fatalf("source commit not propagated")
	}
	if res.Verdict != coordinator.VerdictAccept {
		t.Fatalf("clean run verdict = %s, want ACCEPT", res.Verdict)
	}
	if !res.Validity.GeneratorValid || !res.Validity.EnvironmentValid {
		t.Fatalf("validity flags not derived from evidence: %+v", res.Validity)
	}

	// mandatory gated counters must always be present with finite values
	for _, name := range gatedCorrectnessCounters {
		v, ok := res.CorrectnessCounters[name]
		if !ok {
			t.Fatalf("gated counter %q missing", name)
		}
		if v != 0 {
			t.Fatalf("gated counter %q = %v on clean run", name, v)
		}
	}
	for _, name := range []string{"connection_failures", "unexpected_disconnects",
		"schema_violations", "state_agreement_violations"} {
		if _, ok := res.CorrectnessCounters[name]; !ok {
			t.Fatalf("mandatory counter %q missing", name)
		}
	}

	// non-owner shard must report zero published events
	if res.Workload.EventsPublished != 0 {
		t.Fatalf("non-owner reported published=%d", res.Workload.EventsPublished)
	}
	// resources maps present
	if res.Resources.Generator == nil || res.Resources.Nchan == nil || res.Resources.Redis == nil {
		t.Fatal("resources maps must be populated")
	}
	if res.Resources.Redis["connected_clients"] != int64(8) {
		t.Fatalf("redis evidence lost: %v", res.Resources.Redis)
	}
	// spare resources only from the restart-target shard
	if res.Resources.Spare != nil {
		t.Fatal("spare resources must be omitted on non-target shards")
	}
	// histograms present and structurally valid
	for name, h := range map[string]coordinator.HistogramWire{
		"fan_out": res.Histograms.FanOut, "goal": res.Histograms.GoalFanOut,
		"other": res.Histograms.OtherFanOut, "late_join": res.Histograms.LateJoin,
		"burst": res.Histograms.Burst,
	} {
		if h.MaxMs <= 0 {
			t.Fatalf("histogram %s has MaxMs=%d", name, h.MaxMs)
		}
	}
}

func TestAssembleResultOwnerReportsPublished(t *testing.T) {
	cfg := testConfig(0)
	cfg.publisherOwner = true
	r, p := testShardRun(cfg)
	defer p.Stop()
	r.pubPublished = 999
	res := r.assembleResult(nil, passingScenarios(), map[string]*deep.PathResult{},
		map[string]*deep.PathResult{},
		struct{ agreed, disagreed, unmatched int64 }{}, time.Now())
	if res.Workload.EventsPublished != 999 {
		t.Fatalf("owner published = %d, want 999", res.Workload.EventsPublished)
	}
	if res.PublisherOwner != true {
		t.Fatal("publisher_owner flag lost")
	}
}

func TestAssembleResultSpareResourcesOnRestartTargetOnly(t *testing.T) {
	cfg := testConfig(3) // restart target
	cfg.spareSubURL = "http://spare:8081/sub"
	r, p := testShardRun(cfg)
	defer p.Stop()
	r.spareMetrics = completeMetrics()
	res := r.assembleResult(nil, passingScenarios(), map[string]*deep.PathResult{},
		map[string]*deep.PathResult{},
		struct{ agreed, disagreed, unmatched int64 }{}, time.Now())
	if res.Resources.Spare == nil {
		t.Fatal("restart-target shard must emit spare resource evidence")
	}

	r2, p2 := testShardRun(testConfig(1)) // bystander
	defer p2.Stop()
	r2.spareMetrics = completeMetrics()
	res2 := r2.assembleResult(nil, passingScenarios(), map[string]*deep.PathResult{},
		map[string]*deep.PathResult{},
		struct{ agreed, disagreed, unmatched int64 }{}, time.Now())
	if res2.Resources.Spare != nil {
		t.Fatal("bystander must not emit spare resources")
	}
}

// ── R03: measured restart correctness windows ────────────────────────────────

// A clean measured window must keep the shard ACCEPT and must surface all
// five restart_failover_* counters as literal zero values.
func TestRestartMeasuredZeroWindowAccepts(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	r.restartDelta = &counterSnapshot{}
	res := r.assembleResult(nil, passingScenarios(), map[string]*deep.PathResult{},
		map[string]*deep.PathResult{},
		struct{ agreed, disagreed, unmatched int64 }{}, time.Now())
	if res.Verdict != coordinator.VerdictAccept {
		t.Fatalf("clean measured restart window verdict = %s, want ACCEPT", res.Verdict)
	}
	for _, name := range []string{
		"restart_failover_gaps", "restart_failover_duplicates",
		"restart_failover_order_violations", "restart_failover_connection_failures",
		"restart_failover_unexpected_disconnects",
	} {
		if v := res.CorrectnessCounters[name]; v != 0 {
			t.Fatalf("counter %q = %v on clean window, want 0", name, v)
		}
	}
}

// One observed gap inside the restart window must reach the top-level
// counter and force REJECT (valid measurement, real correctness failure).
func TestRestartOneGapRejects(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	r.restartDelta = &counterSnapshot{missing: 1}
	res := r.assembleResult(nil, passingScenarios(), map[string]*deep.PathResult{},
		map[string]*deep.PathResult{},
		struct{ agreed, disagreed, unmatched int64 }{}, time.Now())
	if got := res.CorrectnessCounters["restart_failover_gaps"]; got != 1 {
		t.Fatalf("restart_failover_gaps = %v, want 1", got)
	}
	if res.Verdict != coordinator.VerdictReject {
		t.Fatalf("verdict = %s, want REJECT", res.Verdict)
	}
}

func TestRestartOneDuplicateRejects(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	r.restartDelta = &counterSnapshot{duplicates: 1}
	res := r.assembleResult(nil, passingScenarios(), map[string]*deep.PathResult{},
		map[string]*deep.PathResult{},
		struct{ agreed, disagreed, unmatched int64 }{}, time.Now())
	if got := res.CorrectnessCounters["restart_failover_duplicates"]; got != 1 {
		t.Fatalf("restart_failover_duplicates = %v, want 1", got)
	}
	if res.Verdict != coordinator.VerdictReject {
		t.Fatalf("verdict = %s, want REJECT", res.Verdict)
	}
}

func TestRestartOneOrderViolationRejects(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	r.restartDelta = &counterSnapshot{outOfOrder: 1}
	res := r.assembleResult(nil, passingScenarios(), map[string]*deep.PathResult{},
		map[string]*deep.PathResult{},
		struct{ agreed, disagreed, unmatched int64 }{}, time.Now())
	if got := res.CorrectnessCounters["restart_failover_order_violations"]; got != 1 {
		t.Fatalf("restart_failover_order_violations = %v, want 1", got)
	}
	if res.Verdict != coordinator.VerdictReject {
		t.Fatalf("verdict = %s, want REJECT", res.Verdict)
	}
}

// An unmeasured window is a validity failure: INCONCLUSIVE with an explicit
// reason, never a silent zero.
func TestRestartUnmeasuredWindowInconclusive(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	r.restartDelta = nil // never measured
	res := r.assembleResult(nil, passingScenarios(), map[string]*deep.PathResult{},
		map[string]*deep.PathResult{},
		struct{ agreed, disagreed, unmatched int64 }{}, time.Now())
	found := false
	for _, reason := range res.Validity.Reasons {
		if strings.Contains(reason, "restart correctness window never measured") {
			found = true
		}
	}
	if !found {
		t.Fatalf("missing unmeasured-window validity reason: %+v", res.Validity)
	}
	if res.Verdict == coordinator.VerdictAccept {
		t.Fatal("unmeasured restart window must not ACCEPT")
	}
}

// Connection failures / unexpected disconnects observed during the window
// must be reported as their own counters, not folded into generic totals.
func TestRestartConnectionFailuresAndDisconnectsSurfaced(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	r.restartDelta = &counterSnapshot{failures: 2, unexpected: 3}
	res := r.assembleResult(nil, passingScenarios(), map[string]*deep.PathResult{},
		map[string]*deep.PathResult{},
		struct{ agreed, disagreed, unmatched int64 }{}, time.Now())
	if got := res.CorrectnessCounters["restart_failover_connection_failures"]; got != 2 {
		t.Fatalf("restart_failover_connection_failures = %v, want 2", got)
	}
	if got := res.CorrectnessCounters["restart_failover_unexpected_disconnects"]; got != 3 {
		t.Fatalf("restart_failover_unexpected_disconnects = %v, want 3", got)
	}
	if res.Verdict == coordinator.VerdictAccept {
		t.Fatal("connection failures in restart window must not ACCEPT")
	}
}

func TestAssembleResultLateJoinHistogramRecordsRecovery(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	neg := int64(-1)
	late := map[string]*deep.PathResult{
		"late_join:match_001": {Passed: true, RecoveryMs: 120},
		"late_join:match_002": {Passed: false, RecoveryMs: neg}, // clamp to max
		"spare_probe":         {Passed: true, RecoveryMs: 5},    // not a late-join key
	}
	res := r.assembleResult(nil, passingScenarios(), late, map[string]*deep.PathResult{},
		struct{ agreed, disagreed, unmatched int64 }{}, time.Now())
	lj := res.Histograms.LateJoin
	if lj.TotalCount != 2 {
		t.Fatalf("late-join histogram count = %d, want 2 (probe keys only)", lj.TotalCount)
	}
	var overflowOrMax int64
	for _, b := range lj.Buckets {
		if b[0] >= int64(hist.DefaultMaxMs) {
			overflowOrMax += b[1]
		}
	}
	if overflowOrMax < 1 {
		t.Fatal("negative recovery_ms was not clamped into the max bucket")
	}
}

// ── failure result (mid-run death fallback) ─────────────────────────────────

func TestFailureResultShape(t *testing.T) {
	r, p := testShardRun(testConfig(1))
	defer p.Stop()
	runErr := errors.New("steady window interrupted")
	res := r.failureResult(runErr)

	if res.Verdict != coordinator.VerdictInconclusive {
		t.Fatalf("verdict = %s, want INCONCLUSIVE", res.Verdict)
	}
	if len(res.Validity.Reasons) != 1 || res.Validity.Reasons[0] != runErr.Error() {
		t.Fatalf("reasons = %v", res.Validity.Reasons)
	}
	if len(res.Samples) != 0 {
		t.Fatal("failure result must carry no samples")
	}
	if len(res.Scenarios) != 1 || res.Scenarios[0].Name != "restart-replacement" ||
		res.Scenarios[0].Participated || !res.Scenarios[0].Passed {
		t.Fatalf("bystander scenario evidence wrong: %+v", res.Scenarios)
	}
	for _, name := range gatedCorrectnessCounters {
		if v, ok := res.CorrectnessCounters[name]; !ok || v != 0 {
			t.Fatalf("gated counter %q missing/zero: %v %v", name, ok, v)
		}
	}
	for name, h := range map[string]coordinator.HistogramWire{
		"fan_out": res.Histograms.FanOut, "goal": res.Histograms.GoalFanOut,
		"other": res.Histograms.OtherFanOut, "late_join": res.Histograms.LateJoin,
		"burst": res.Histograms.Burst,
	} {
		if h.TotalCount != 0 || h.MaxMs != hist.DefaultMaxMs {
			t.Fatalf("histogram %s not the canonical empty wire: %+v", name, h)
		}
	}
	if res.ExperimentRunID != r.cl.ExperimentRunID || res.ShardID != 1 {
		t.Fatal("identity binding lost in failure path")
	}
}

// ── phase rates ──────────────────────────────────────────────────────────────

func TestPhaseRatesMath(t *testing.T) {
	samples := []coordinator.AlignedSample{
		{TimestampMs: 0, Phase: "warmup", ConnectionsAttempted: 0, ConnectionsEstablished: 0},
		{TimestampMs: 1000, Phase: "warmup", ConnectionsAttempted: 500, ConnectionsEstablished: 400},
		{TimestampMs: 2000, Phase: "warmup", ConnectionsAttempted: 1000, ConnectionsEstablished: 900},
		{TimestampMs: 2000, Phase: "surge", ConnectionsAttempted: 1000, ConnectionsEstablished: 900},
		{TimestampMs: 4000, Phase: "surge", ConnectionsAttempted: 3000, ConnectionsEstablished: 2900},
	}
	rates := phaseRates(samples)
	if len(rates) != 2 {
		t.Fatalf("phases = %d, want 2", len(rates))
	}
	w, s := rates[0], rates[1]
	if w.Phase != "warmup" || s.Phase != "surge" {
		t.Fatalf("phase order wrong: %s %s", w.Phase, s.Phase)
	}
	// warmup: dt=2s, attempted 1000 → 500/s; established 900 → 450/s
	if w.AttemptedPerSec != 500 || w.AcceptedPerSec != 450 {
		t.Fatalf("warmup rates = %v/%v", w.AttemptedPerSec, w.AcceptedPerSec)
	}
	// surge: dt=2s, attempted 2000 → 1000/s; established 2000 → 1000/s
	if s.AttemptedPerSec != 1000 || s.AcceptedPerSec != 1000 {
		t.Fatalf("surge rates = %v/%v", s.AttemptedPerSec, s.AcceptedPerSec)
	}
}

func TestPhaseRatesZeroDurationYieldsZero(t *testing.T) {
	samples := []coordinator.AlignedSample{
		{TimestampMs: 1000, Phase: "steady"},
		{TimestampMs: 1000, Phase: "steady"},
	}
	rates := phaseRates(samples)
	if len(rates) != 1 || rates[0].AttemptedPerSec != 0 || rates[0].AcceptedPerSec != 0 {
		t.Fatalf("zero-duration rates wrong: %+v", rates)
	}
}

// ── control metrics conversion ───────────────────────────────────────────────

func TestControlMetricsMapNilIsEmpty(t *testing.T) {
	m := controlMetricsMap(nil)
	if m == nil || len(m) != 0 {
		t.Fatalf("nil metrics must map to empty map, got %v", m)
	}
}

func TestControlMetricsMapDerefsAllKeys(t *testing.T) {
	v := int64(42)
	m := controlMetricsMap(&dut.ControlMetrics{
		MemoryCurrentBytes: &v, MemoryPeakBytes: &v, CpuUsageUsec: &v,
		CpuThrottledCount: &v, CpuThrottledUsec: &v,
		MemoryOomEvents: &v, MemoryOomKillEvents: &v,
	})
	for _, key := range []string{"memory_current_bytes", "memory_peak_bytes", "cpu_usage_usec",
		"cpu_throttled_count", "cpu_throttled_usec", "memory_oom_events", "oom_kill_events"} {
		if m[key] != int64(42) {
			t.Fatalf("%s = %v, want 42", key, m[key])
		}
	}
}

// R13: missing/null metrics stay missing — keys are omitted from the wire map
// rather than fabricated as zeros. Completeness is enforced separately by the
// mandatory-field gate (INCONCLUSIVE), never by coercion.
func TestControlMetricsMapNilStaysMissing(t *testing.T) {
	m := controlMetricsMap(&dut.ControlMetrics{})
	if len(m) != 0 {
		t.Fatalf("nil metrics must be omitted entirely, got %v", m)
	}
	partial := &dut.ControlMetrics{}
	v := int64(5)
	partial.MemoryPeakBytes = &v
	m = controlMetricsMap(partial)
	if _, ok := m["memory_peak_bytes"]; !ok {
		t.Fatal("present field must be emitted")
	}
	if len(m) != 1 {
		t.Fatalf("absent fields must stay absent, got %v", m)
	}
}

// ── scenario accounting ──────────────────────────────────────────────────────

func passedPath() *deep.PathResult {
	return &deep.PathResult{Passed: true}
}

func TestLateJoinScenarioAccounting(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()

	allPass := map[string]*deep.PathResult{}
	for round := 0; round < 8; round++ {
		for _, m := range matchIDs() {
			allPass[fmt.Sprintf("late_join:%s:round-%d", m, round)] = &deep.PathResult{Passed: true}
		}
	}
	sc := r.lateJoinScenario(allPass)
	if !sc.Participated || !sc.Passed {
		t.Fatalf("full-pass late-join must pass: %+v", sc)
	}
	if sc.Structured["probes_run"] != matchCount*8 {
		t.Fatalf("probes_run = %v", sc.Structured["probes_run"])
	}

	oneFails := map[string]*deep.PathResult{}
	for round := 0; round < 8; round++ {
		for _, m := range matchIDs() {
			oneFails[fmt.Sprintf("late_join:%s:round-%d", m, round)] = &deep.PathResult{Passed: true}
		}
	}
	oneFails["late_join:match-003:round-0"].Passed = false
	sc = r.lateJoinScenario(oneFails)
	if sc.Passed {
		t.Fatal("any failing probe must fail the scenario")
	}

	tooFew := map[string]*deep.PathResult{"late_join:match-001:round-0": passedPath()}
	sc = r.lateJoinScenario(tooFew)
	if sc.Passed {
		t.Fatal("incomplete probe set must fail the scenario")
	}
}

func TestReconnectScenarioParticipationGate(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()

	full := pool.ReconnectHoldResult{Selected: reconnectPerShard, ReadyBeforeHold: reconnectPerShard}
	results := map[string]*deep.PathResult{}
	for i := 0; i < reconnectPerShard; i++ {
		results[fmt.Sprintf("rec:%d", i)] = passedPath()
	}
	sc := r.reconnectScenario(full, reconnectPerShard, results)
	if !sc.Participated || !sc.Passed {
		t.Fatalf("exact 64 cohort all-passing must pass: %+v", sc.Detail)
	}

	sc = r.reconnectScenario(full, 0, map[string]*deep.PathResult{})
	if sc.Participated {
		t.Fatal("zero released must be non-participating")
	}
	// frozen rule: Passed requires participation; a zero-release window is
	// reported as not-passed evidence rather than a silent pass.
	if sc.Passed {
		t.Fatal("non-participating scenario must not claim pass")
	}

	failed := map[string]*deep.PathResult{}
	for i := 0; i < reconnectPerShard; i++ {
		if i == 0 {
			failed["rec:0"] = &deep.PathResult{}
			continue
		}
		failed[fmt.Sprintf("rec:%d", i)] = passedPath()
	}
	sc = r.reconnectScenario(full, reconnectPerShard, failed)
	if sc.Participated && sc.Passed {
		t.Fatal("failed replay must fail the scenario")
	}

	// shrunken evaluated denominator must fail
	shortResults := map[string]*deep.PathResult{}
	for i := 0; i < reconnectPerShard-1; i++ {
		shortResults[fmt.Sprintf("rec:%d", i)] = passedPath()
	}
	sc = r.reconnectScenario(full, reconnectPerShard, shortResults)
	if sc.Passed {
		t.Fatal("evaluated < released must fail the scenario")
	}

	empty := map[string]*deep.PathResult{}
	sc = r.reconnectScenario(full, reconnectPerShard, empty)
	if sc.Passed {
		t.Fatal("released>0 with zero evaluated results must fail")
	}

	// missing raw id (ready_before_hold < selected) must fail even if the
	// remaining clients pass
	shortReady := pool.ReconnectHoldResult{Selected: reconnectPerShard, ReadyBeforeHold: reconnectPerShard - 1}
	sc = r.reconnectScenario(shortReady, reconnectPerShard-1, shortResults)
	if sc.Passed {
		t.Fatal("missing raw resume state must fail the scenario")
	}
}

func TestCountPassedCounts(t *testing.T) {
	results := map[string]*deep.PathResult{
		"a": passedPath(), "b": {}, "c": passedPath(),
	}
	if got := countPassed(results); got != 2 {
		t.Fatalf("countPassed = %d, want 2", got)
	}
}

// ── restart scenario dispatch ────────────────────────────────────────────────

func TestRestartDispatchBystander(t *testing.T) {
	cfg := testConfig(0) // not restart target (3), not publisher owner
	r, p := testShardRun(cfg)
	defer p.Stop()
	sc := r.runRestartScenario(t.Context())
	if sc.Name != "restart-replacement" || sc.Participated || !sc.Passed {
		t.Fatalf("bystander dispatch wrong: %+v", sc)
	}
	if _, ok := sc.Structured["paths"]; !ok {
		t.Fatal("bystander structured evidence must carry paths map")
	}
}

func TestRestartDispatchFailoverUnavailableWithoutSpare(t *testing.T) {
	cfg := testConfig(3) // restart target
	r, p := testShardRun(cfg)
	defer p.Stop()
	sc := r.runRestartScenario(t.Context())
	if !sc.Participated || sc.Passed {
		t.Fatalf("target shard without spare must participate-and-fail: %+v", sc)
	}
	if !strings.Contains(sc.Detail, "unavailable") {
		t.Fatalf("detail should explain unavailability: %q", sc.Detail)
	}
}

func TestRestartDispatchSpareProbeUnavailableWithoutURLs(t *testing.T) {
	cfg := testConfig(0)
	cfg.publisherOwner = true // owner path, but spare/publisher URLs empty
	r, p := testShardRun(cfg)
	defer p.Stop()
	sc := r.runRestartScenario(t.Context())
	if !sc.Participated || sc.Passed {
		t.Fatalf("owner without spare URLs must participate-and-fail: %+v", sc)
	}
	if !strings.Contains(sc.Detail, "unavailable") {
		t.Fatalf("detail should explain unavailability: %q", sc.Detail)
	}
}

func TestRestartIdentityBindsRun(t *testing.T) {
	r, p := testShardRun(testConfig(2))
	defer p.Stop()
	id := r.restartIdentity()
	if id["campaign_id"] != "camp-test" ||
		id["experiment_run_id"] != "run-test-0001" ||
		id["shard_id"] != 2 {
		t.Fatalf("restart identity wrong: %+v", id)
	}
	if _, ok := id["run_index"]; !ok {
		t.Fatal("run_index required by coordinator predicate")
	}
}

// ── head cache ───────────────────────────────────────────────────────────────

func TestHeadLookupMissWithoutCache(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	if _, ok := r.headLookup("match_001"); ok {
		t.Fatal("empty cache must miss")
	}
}

func TestRefreshHeadsMapsPublisherEvidenceToCanonicalHeads(t *testing.T) {
	// Offline check of the mapping contract via a stubbed HTTP server would
	// duplicate publisher client tests; here we verify the cache store/load
	// round trip through headLookup after a manual store.
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	heads := map[string]pool.CanonicalHead{"match_001": {Seq: 77}}
	r.headCache.Store(&heads)
	seq, ok := r.headLookup("match_001")
	if !ok || seq != 77 {
		t.Fatalf("headLookup = %d,%v want 77,true", seq, ok)
	}
}

// ── histogram wire conversion ────────────────────────────────────────────────

func TestWireConversionPreservesHistogramLayout(t *testing.T) {
	h := hist.New(hist.DefaultMaxMs)
	h.Record(10)
	h.Record(20)
	h.Record(-1)                    // negative → overflow
	h.Record(hist.DefaultMaxMs + 1) // clamps into the max bucket
	s := h.Serialize()
	w := wire(s)
	if w.MaxMs != s.MaxMs || w.TotalCount != s.TotalCount || w.OverflowCount != s.OverflowCount {
		t.Fatalf("wire layout mismatch: %+v vs %+v", w, s)
	}
	if len(w.Buckets) != len(s.Buckets) {
		t.Fatalf("bucket count mismatch: %d vs %d", len(w.Buckets), len(s.Buckets))
	}
	// total counts all samples incl. the negative one (overflow); the
	// >maxMs sample clamps into the terminal bucket.
	if w.TotalCount != 4 || w.OverflowCount != 1 {
		t.Fatalf("counts wrong: total=%d overflow=%d", w.TotalCount, w.OverflowCount)
	}
	last := w.Buckets[len(w.Buckets)-1]
	if last[0] != int64(hist.DefaultMaxMs) || last[1] != 1 {
		t.Fatalf("clamped bucket wrong: %v", last)
	}
}

// ── wait helpers (floor semantics) ───────────────────────────────────────────

func TestWaitActiveFloorSemantics(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()

	if r.waitActive(0, 50*time.Millisecond) {
		t.Fatal("baseline<=0 cannot settle")
	}
	// baseline=1 → floor(1*0.98)=0 → settles immediately at zero activity.
	if !r.waitActive(1, 50*time.Millisecond) {
		t.Fatal("floor-0 baseline must settle")
	}
	// active stays 0; baseline 25 floor 24 (98%) — must time out false.
	if r.waitActive(25, 60*time.Millisecond) {
		t.Fatal("below-floor pool must not settle")
	}
}

func TestWaitEstablishedFloorSemantics(t *testing.T) {
	p := pool.New("", matchIDs(), 100)
	defer p.Stop()
	// target=1 → floor(1*0.98)=0 → passes with zero established connections.
	if !waitEstablished(p, 1, 50*time.Millisecond) {
		t.Fatal("floor-0 target must pass")
	}
	// floor(100 * 0.98) = 98 > 0 active → short timeout returns false quickly
	if waitEstablished(p, 100, 60*time.Millisecond) {
		t.Fatal("below-floor establishment must not pass")
	}
}

// ── ramp surge unit bounds ───────────────────────────────────────────────────

func TestRampSurgeNoopWhenNonpositive(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	before := p.ViewerCount()
	r.rampSurge(t.Context(), 0, 100*time.Millisecond)
	r.rampSurge(t.Context(), -5, 100*time.Millisecond)
	if p.ViewerCount() != before {
		t.Fatal("non-positive surge must add nothing")
	}
}

// ── R04: surge machine-proof ────────────────────────────────────────────────

// The contract §3 exact integer schedule: 24 batches, first n%24 carry one
// extra viewer. For the assignment's 10k/shard: 16×417 + 8×416 = 10,000.
func TestSurgeBatchSizesExactSchedule(t *testing.T) {
	sizes := surgeBatchSizes(10000)
	if len(sizes) != 24 {
		t.Fatalf("len(sizes) = %d, want 24", len(sizes))
	}
	sum := 0
	for i, s := range sizes {
		want := 417
		if i >= 16 {
			want = 416
		}
		if s != want {
			t.Fatalf("sizes[%d] = %d, want %d", i, s, want)
		}
		sum += s
	}
	if sum != 10000 {
		t.Fatalf("schedule total = %d, want 10000", sum)
	}
	if got := surgeBatchSizes(48); got[0] != 2 || got[23] != 2 {
		t.Fatal("evenly divisible schedule must be uniform")
	}
	if total := func(sizes []int) int {
		s := 0
		for _, v := range sizes {
			s += v
		}
		return s
	}(surgeBatchSizes(7)); total != 7 {
		t.Fatalf("remainder schedule total = %d, want 7", total)
	}
}

func TestSurgeRunStatsGateBoundaries(t *testing.T) {
	clean := func() surgeRunStats {
		return surgeRunStats{
			startActive:     15000,
			attemptedAdds:   10000,
			establishedAdds: 10000,
			failedAdds:      0,
			elapsedMs:       120000,
			finalActive:     25000,
			expectedStart:   15000,
			expectedAdds:    10000,
			expectedFinal:   25000,
			deadlineMs:      120000,
		}
	}
	tests := []struct {
		name   string
		mutate func(*surgeRunStats)
		pass   bool
	}{
		{"clean at exactly 120000ms", func(*surgeRunStats) {}, true},
		{"one short of establishment", func(s *surgeRunStats) { s.establishedAdds = 9999; s.failedAdds = 1 }, false},
		{"established after deadline (120001ms)", func(s *surgeRunStats) { s.elapsedMs = 120001 }, false},
		{"start population off by one", func(s *surgeRunStats) { s.startActive = 14999 }, false},
		{"final below post-surge target", func(s *surgeRunStats) { s.finalActive = 24999 }, false},
		{"attempted shortfall counts as failure", func(s *surgeRunStats) { s.attemptedAdds = 9998; s.failedAdds = 2 }, false},
		{"attempted beyond plan is a violation too", func(s *surgeRunStats) { s.attemptedAdds = 10001; s.failedAdds = 1 }, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			s := clean()
			tc.mutate(&s)
			if got := s.passed(); got != tc.pass {
				t.Fatalf("passed() = %v, want %v for %+v", got, tc.pass, s)
			}
		})
	}
}

// The surge window correctness deltas must come from the true window
// snapshot, not lifetime totals.
func TestAssembleResultSurgeWindowDeltas(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	r.restartDelta = &counterSnapshot{}
	r.surgeStats = &surgeRunStats{startActive: 10, attemptedAdds: 5, establishedAdds: 5, finalActive: 15,
		expectedStart: 10, expectedAdds: 5, expectedFinal: 15, deadlineMs: 120000, elapsedMs: 120000}
	r.surgeDelta = &counterSnapshot{missing: 1, duplicates: 2, outOfOrder: 3, unexpected: 4}
	res := r.assembleResult(nil, passingScenarios(), map[string]*deep.PathResult{},
		map[string]*deep.PathResult{},
		struct{ agreed, disagreed, unmatched int64 }{}, time.Now())
	for name, want := range map[string]float64{
		"surge_missing_sequences":      1,
		"surge_duplicates":             2,
		"surge_out_of_order":           3,
		"surge_unexpected_disconnects": 4,
	} {
		if got := res.CorrectnessCounters[name]; got != want {
			t.Fatalf("counter %q = %v, want %v", name, got, want)
		}
	}
	if res.Verdict != coordinator.VerdictReject {
		t.Fatalf("verdict = %s, want REJECT (nonzero surge window deltas)", res.Verdict)
	}
}

// An unmeasured surge window is a validity failure: INCONCLUSIVE with an
// explicit reason, never a silent zero.
func TestSurgeUnmeasuredWindowInconclusive(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	r.restartDelta = &counterSnapshot{}
	r.surgeStats, r.surgeDelta = nil, nil // never measured
	res := r.assembleResult(nil, passingScenarios(), map[string]*deep.PathResult{},
		map[string]*deep.PathResult{},
		struct{ agreed, disagreed, unmatched int64 }{}, time.Now())
	found := false
	for _, reason := range res.Validity.Reasons {
		if strings.Contains(reason, "surge population/correctness window never measured") {
			found = true
		}
	}
	if !found {
		t.Fatalf("missing unmeasured-surge validity reason: %+v", res.Validity)
	}
	if res.Verdict == coordinator.VerdictAccept {
		t.Fatal("unmeasured surge window must not ACCEPT")
	}
}

// A gate-violating measured surge must fail the surge scenario so the shard
// REJECTs (healthy measurement, real DUT-facing failure).
func TestSurgeScenarioFailureRejectsShard(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	r.restartDelta = &counterSnapshot{}
	r.surgeDelta = &counterSnapshot{}
	r.surgeStats = &surgeRunStats{
		startActive: 10, attemptedAdds: 5, establishedAdds: 4, failedAdds: 1,
		elapsedMs: 120000, finalActive: 14,
		expectedStart: 10, expectedAdds: 5, expectedFinal: 15, deadlineMs: 120000,
	}
	scenario := r.runSurgeScenarioForTest()
	if scenario.Passed {
		t.Fatal("gate-violating surge stats must fail the scenario")
	}
	scenarios := append(passingScenarios(), scenario)
	res := r.assembleResult(nil, scenarios, map[string]*deep.PathResult{},
		map[string]*deep.PathResult{},
		struct{ agreed, disagreed, unmatched int64 }{}, time.Now())
	if res.Verdict != coordinator.VerdictReject {
		t.Fatalf("verdict = %s, want REJECT", res.Verdict)
	}
}

// runSurgeScenarioForTest builds the surge scenario from pre-set stats without
// touching live connections (the real runSurge drives the pool).
func (r *shardRun) runSurgeScenarioForTest() coordinator.ScenarioEvidence {
	st := r.surgeStats
	delta := counterSnapshot{}
	if r.surgeDelta != nil {
		delta = *r.surgeDelta
	}
	passed := st.passed()
	return coordinator.ScenarioEvidence{
		Name:         "surge",
		Participated: true,
		Passed:       passed,
		Detail: fmt.Sprintf("start=%d +att=%d est=%d fail=%d elapsed=%dms final=%d",
			st.startActive, st.attemptedAdds, st.establishedAdds, st.failedAdds, st.elapsedMs, st.finalActive),
		Structured: map[string]any{
			"surge_start_active":          st.startActive,
			"surge_attempted_additions":   st.attemptedAdds,
			"surge_established_additions": st.establishedAdds,
			"surge_failed_additions":      st.failedAdds,
			"surge_elapsed_ms":            st.elapsedMs,
			"surge_final_active":          st.finalActive,
			"surge_peak_active":           st.peakActive,
			"window_gaps":                 delta.missing,
			"window_duplicates":           delta.duplicates,
			"window_out_of_order":         delta.outOfOrder,
		},
	}
}

// ── R10 timing validity ──────────────────────────────────────────────────────

// hasTimingReason reports whether any validity reason mentions the timing gate.
func hasTimingReason(res *coordinator.ShardExperimentResult, substr string) bool {
	for _, reason := range res.Validity.Reasons {
		if strings.Contains(reason, "timing invalid") && strings.Contains(reason, substr) {
			return true
		}
	}
	return false
}

// The placeholder `TimingValid = true` is gone: a run with no phase-boundary
// evidence at all must compute TimingValid=false and never ACCEPT.
func TestTimingPlaceholderTrueRemoved(t *testing.T) {
	src, err := os.ReadFile("main.go")
	if err != nil {
		t.Fatal(err)
	}
	for _, line := range strings.Split(string(src), "\n") {
		if strings.Contains(line, "TimingValid = true") {
			t.Fatalf("hard-coded TimingValid still present: %s", strings.TrimSpace(line))
		}
	}
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	r.timingMu.Lock()
	r.phaseStart, r.phaseEnd = map[string]time.Time{}, map[string]time.Time{}
	r.restartMeasured = false
	r.timingMu.Unlock()
	res := r.assembleResult(nil, passingScenarios(), map[string]*deep.PathResult{},
		map[string]*deep.PathResult{},
		struct{ agreed, disagreed, unmatched int64 }{}, time.Now())
	if res.Validity.TimingValid {
		t.Fatal("empty timing evidence must compute TimingValid=false")
	}
	if res.Verdict == coordinator.VerdictAccept {
		t.Fatal("missing mandatory timing evidence must not ACCEPT")
	}
}

// A phase that ended before it started is invalid evidence.
func TestTimingNegativeDurationInvalid(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	r.timingMu.Lock()
	r.phaseEnd["steady"] = r.phaseStart["steady"].Add(-time.Second)
	r.timingMu.Unlock()
	res := r.assembleResult(nil, passingScenarios(), map[string]*deep.PathResult{},
		map[string]*deep.PathResult{},
		struct{ agreed, disagreed, unmatched int64 }{}, time.Now())
	if !hasTimingReason(res, "ended before it started") {
		t.Fatalf("missing negative-duration reason: %+v", res.Validity.Reasons)
	}
	if res.Verdict == coordinator.VerdictAccept {
		t.Fatal("negative duration must not ACCEPT")
	}
}

// An implausible future timestamp is invalid evidence.
func TestTimingFutureTimestampInvalid(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	r.timingMu.Lock()
	future := time.Now().Add(10 * time.Minute)
	r.phaseStart["warmup"] = future
	r.phaseEnd["warmup"] = future.Add(time.Minute)
	r.timingMu.Unlock()
	res := r.assembleResult(nil, passingScenarios(), map[string]*deep.PathResult{},
		map[string]*deep.PathResult{},
		struct{ agreed, disagreed, unmatched int64 }{}, time.Now())
	if !hasTimingReason(res, "implausible future timestamp") {
		t.Fatalf("missing future-timestamp reason: %+v", res.Validity.Reasons)
	}
}

// A surge elapsed beyond its deadline invalidates the run's timing even when
// the surge scenario itself already failed (both signals must surface).
// Timing invalidity is an evidence-trust failure, so the frozen verdict rule
// yields INCONCLUSIVE — never a DUT-facing REJECT.
func TestTimingSurgeDeadlineViolationClassified(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	r.surgeDelta = &counterSnapshot{}
	r.surgeStats.elapsedMs = r.surgeStats.deadlineMs + 1
	res := r.assembleResult(nil, passingScenarios(), map[string]*deep.PathResult{},
		map[string]*deep.PathResult{},
		struct{ agreed, disagreed, unmatched int64 }{}, time.Now())
	if !hasTimingReason(res, "exceeds its") {
		t.Fatalf("missing deadline-violation reason: %+v", res.Validity.Reasons)
	}
	if res.Verdict != coordinator.VerdictInconclusive {
		t.Fatalf("verdict = %s, want INCONCLUSIVE for timing-evidence failure", res.Verdict)
	}
}

// A burst window shorter than its configured duration invalidates timing.
func TestTimingBurstShorterThanConfigInvalid(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	r.timingMu.Lock()
	r.phaseEnd["burst"] = r.phaseStart["burst"].Add(time.Duration(r.cfg.burstSeconds-1) * time.Second)
	r.timingMu.Unlock()
	res := r.assembleResult(nil, passingScenarios(), map[string]*deep.PathResult{},
		map[string]*deep.PathResult{},
		struct{ agreed, disagreed, unmatched int64 }{}, time.Now())
	if !hasTimingReason(res, "shorter than its configured") {
		t.Fatalf("missing short-burst reason: %+v", res.Validity.Reasons)
	}
}

// An unmeasured restart window is mandatory missing timing evidence.
func TestTimingUnmeasuredRestartInvalid(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	r.timingMu.Lock()
	r.restartMeasured = false
	r.timingMu.Unlock()
	res := r.assembleResult(nil, passingScenarios(), map[string]*deep.PathResult{},
		map[string]*deep.PathResult{},
		struct{ agreed, disagreed, unmatched int64 }{}, time.Now())
	if !hasTimingReason(res, "restart window was never measured") {
		t.Fatalf("missing unmeasured-restart reason: %+v", res.Validity.Reasons)
	}
}

// Late-join recovery at the probe timeout is not a valid timing sample.
func TestTimingLateJoinRecoveryAtTimeoutInvalid(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	r.timingMu.Lock()
	r.lateJoinMaxRecoveryMs = lateJoinProbeTO.Milliseconds()
	r.timingMu.Unlock()
	res := r.assembleResult(nil, passingScenarios(), map[string]*deep.PathResult{},
		map[string]*deep.PathResult{},
		struct{ agreed, disagreed, unmatched int64 }{}, time.Now())
	if !hasTimingReason(res, "probe timeout") {
		t.Fatalf("missing late-join timeout reason: %+v", res.Validity.Reasons)
	}
}

// Generator scheduler-lag p99 beyond the frozen ceiling invalidates timing.
func TestTimingSchedulerLagInvalidates(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	r.genRuntime.SchedulerLag.P99Ms = 250
	res := r.assembleResult(nil, passingScenarios(), map[string]*deep.PathResult{},
		map[string]*deep.PathResult{},
		struct{ agreed, disagreed, unmatched int64 }{}, time.Now())
	if !hasTimingReason(res, "scheduler lag p99") {
		t.Fatalf("missing scheduler-lag reason: %+v", res.Validity.Reasons)
	}
}

// Healthy synthetic runs still compute TimingValid=true with full evidence.
func TestTimingHealthyRunValid(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	res := r.assembleResult(nil, passingScenarios(), map[string]*deep.PathResult{},
		map[string]*deep.PathResult{},
		struct{ agreed, disagreed, unmatched int64 }{}, time.Now())
	if !res.Validity.TimingValid {
		t.Fatalf("healthy timing must be valid: %+v", res.Validity.Reasons)
	}
	timing, ok := res.Resources.Generator["timing"].(map[string]any)
	if !ok {
		t.Fatal("timing evidence must be exposed on the wire, not only a boolean")
	}
	if _, ok := timing["run_start_ms"]; !ok {
		t.Fatal("timing evidence must include run_start_ms")
	}
	for _, phase := range coordinator.Phases {
		entry, ok := timing[phase].(map[string]any)
		if !ok {
			t.Fatalf("phase %s missing from timing evidence", phase)
		}
		if _, ok := entry["duration_ms"]; !ok {
			t.Fatalf("phase %s missing duration_ms in timing evidence", phase)
		}
	}
}

// ── R11 publisher health and event rates ─────────────────────────────────────

// seedPublisher fills an owner shard's run with plausible per-boundary
// publisher snapshots: healthy totals, eight advancing heads, and steady/burst
// publication rates inside the frozen windows. Tests then corrupt specific
// fields to prove invalidation.
func seedPublisher(r *shardRun) {
	r.cfg.publisherOwner = true
	r.cfg.publisherURL = "http://publisher.invalid"
	now := time.Now()
	mkHeads := func(seq int64) map[string]publisher.HeadInfo {
		heads := map[string]publisher.HeadInfo{}
		for i := 0; i < expectedMatchCount; i++ {
			heads[fmt.Sprintf("match-%d", i)] = publisher.HeadInfo{Seq: seq}
		}
		return heads
	}
	snap := func(published int64, seq int64) *publisher.Evidence {
		ev := &publisher.Evidence{}
		ev.Started = true
		ev.Heads = mkHeads(seq)
		ev.Totals.Published = published
		ev.Totals.Attempts = published + 2
		ev.Totals.PendingPeak = 10
		ev.FetchedAtMs = now.UnixMilli()
		return ev
	}
	r.pubPhaseMu.Lock()
	r.pubPhase = map[string]*publisher.Evidence{
		"warmup:end":          snap(10, 1),
		"steady:start":        snap(20, 2),
		"steady:end":          snap(120, 12), // +100 over the seeded 10s steady window → 10.0/s
		"burst:start":         snap(130, 13),
		"burst:end":           snap(1680, 63), // +1550 over the seeded 31s burst window → 50.0/s
		"final-metrics:start": snap(1690, 64),
	}
	r.pubPhaseMu.Unlock()
}

// assembleOwner runs assembleResult on a shard carrying seeded publisher
// evidence, applying any test-provided corruption first.
func assembleOwner(r *shardRun) *coordinator.ShardExperimentResult {
	return r.assembleResult(nil, passingScenarios(), map[string]*deep.PathResult{},
		map[string]*deep.PathResult{},
		struct{ agreed, disagreed, unmatched int64 }{}, time.Now())
}

func hasPublisherReason(res *coordinator.ShardExperimentResult, substr string) bool {
	for _, reason := range res.Validity.Reasons {
		if strings.Contains(reason, substr) {
			return true
		}
	}
	return false
}

// A healthy owner shard with full publisher evidence stays valid.
func TestPublisherHealthyRunValid(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	seedTiming(r)
	seedPublisher(r)
	res := assembleOwner(r)
	if !res.Validity.GeneratorValid && hasPublisherReason(res, "publisher") {
		t.Fatalf("healthy publisher evidence must not add reasons: %+v", res.Validity.Reasons)
	}
	if _, ok := res.Resources.Generator["publisher"].(map[string]any); !ok {
		t.Fatal("structured publisher evidence must be exposed on the wire")
	}
}

// Missing publisher boundary snapshots invalidate the owner's evidence.
func TestPublisherMissingSnapshotsInvalid(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	seedTiming(r)
	seedPublisher(r)
	r.pubPhaseMu.Lock()
	delete(r.pubPhase, "final-metrics:start")
	r.pubPhaseMu.Unlock()
	res := assembleOwner(r)
	if !hasPublisherReason(res, "publisher evidence never captured") {
		t.Fatalf("missing final snapshot reason absent: %+v", res.Validity.Reasons)
	}
	if res.Verdict == coordinator.VerdictAccept {
		t.Fatal("missing publisher evidence must not ACCEPT")
	}
}

// Any definite or ambiguous publisher failure invalidates the workload.
func TestPublisherFailuresInvalidate(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	seedTiming(r)
	seedPublisher(r)
	r.pubPhaseMu.Lock()
	r.pubPhase["final-metrics:start"].Totals.DefiniteFails = 1
	r.pubPhase["final-metrics:start"].Totals.AmbiguousFails = 2
	r.pubPhaseMu.Unlock()
	res := assembleOwner(r)
	if !hasPublisherReason(res, "definite failures 1 != 0") || !hasPublisherReason(res, "ambiguous failures 2 != 0") {
		t.Fatalf("failure reasons absent: %+v", res.Validity.Reasons)
	}
	if res.Verdict == coordinator.VerdictAccept {
		t.Fatal("publisher failures must not ACCEPT")
	}
}

// Pending peak above the frozen ceiling invalidates.
func TestPublisherPendingPeakGate(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	seedTiming(r)
	seedPublisher(r)
	r.pubPhaseMu.Lock()
	r.pubPhase["final-metrics:start"].Totals.PendingPeak = 1001
	r.pubPhaseMu.Unlock()
	res := assembleOwner(r)
	if !hasPublisherReason(res, "pending peak 1001 > 1000") {
		t.Fatalf("pending-peak reason absent: %+v", res.Validity.Reasons)
	}
}

// Every match head must be present and advanced across the run.
func TestPublisherHeadAdvancementGates(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	seedTiming(r)
	seedPublisher(r)
	r.pubPhaseMu.Lock()
	delete(r.pubPhase["final-metrics:start"].Heads, "match-7")
	stalled := r.pubPhase["final-metrics:start"].Heads["match-6"]
	stalled.Seq = r.pubPhase["warmup:end"].Heads["match-6"].Seq
	r.pubPhase["final-metrics:start"].Heads["match-6"] = stalled
	r.pubPhaseMu.Unlock()
	res := assembleOwner(r)
	if !hasPublisherReason(res, "reported 7 match heads, want 8") {
		t.Fatalf("head-count reason absent: %+v", res.Validity.Reasons)
	}
	if !hasPublisherReason(res, "match match-6 head did not advance") {
		t.Fatalf("stalled-head reason absent: %+v", res.Validity.Reasons)
	}
}

// Accepted publication rates outside the frozen windows invalidate.
func TestPublisherRateWindowGates(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	seedTiming(r)
	seedPublisher(r)
	r.pubPhaseMu.Lock()
	r.pubPhase["steady:end"].Totals.Published = 400 // 38/s — above the steady window
	r.pubPhase["burst:end"].Totals.Published = 1400 // ~41/s... below burst floor? no: (1400-130)/31 ≈ 41/s inside; use 2000 → 60.3/s outside
	r.pubPhase["burst:end"].Totals.Published = 2000
	r.pubPhaseMu.Unlock()
	res := assembleOwner(r)
	if !hasPublisherReason(res, "steady accepted rate") || !hasPublisherReason(res, "outside frozen") {
		t.Fatalf("rate-window reasons absent: %+v", res.Validity.Reasons)
	}
	if !strings.Contains(strings.Join(res.Validity.Reasons, "\n"), "burst accepted rate") {
		t.Fatalf("burst rate reason absent: %+v", res.Validity.Reasons)
	}
	if res.Verdict == coordinator.VerdictAccept {
		t.Fatal("out-of-window publication rates must not ACCEPT")
	}
}

// Non-owner shards carry no publisher gate obligations.
func TestPublisherNonOwnerSkipsGates(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	res := assembleOwner(r)
	for _, reason := range res.Validity.Reasons {
		if strings.Contains(reason, "publisher") {
			t.Fatalf("non-owner must not be gated on publisher evidence: %s", reason)
		}
	}
}

// ── R12 phase-spanning DUT resource evidence ─────────────────────────────────

// hasRejectNote reports whether any REJECT-level resource note matches.
func hasRejectNote(res *coordinator.ShardExperimentResult, substr string) bool {
	stages, _ := res.Resources.Generator["resource_stages"].(map[string]any)
	notes, _ := stages["reject_reasons"].([]string)
	for _, note := range notes {
		if strings.Contains(note, substr) {
			return true
		}
	}
	return false
}

// Missing resource stages invalidate the run (INCONCLUSIVE, never silent).
func TestResourceMissingStageInvalid(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	r.resMu.Lock()
	delete(r.resSnapshots, "post_surge")
	r.resMu.Unlock()
	res := assembleOwner(r)
	if !hasPublisherReason(res, "resource stage post_surge never captured") {
		t.Fatalf("missing-stage reason absent: %+v", res.Validity.Reasons)
	}
	if res.Verdict == coordinator.VerdictAccept {
		t.Fatal("missing resource stage must not ACCEPT")
	}
}

// A stage missing mandatory numeric fields is invalidating (no zero coercion).
func TestResourceIncompleteFieldsInvalid(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	r.resMu.Lock()
	r.resSnapshots["final"].CpuThrottledUsec = nil
	r.resMu.Unlock()
	res := assembleOwner(r)
	if !hasPublisherReason(res, "missing mandatory numeric fields") {
		t.Fatalf("incomplete-fields reason absent: %+v", res.Validity.Reasons)
	}
}

// Memory peak at/above the frozen ceiling is REJECT-level with valid evidence.
func TestResourceMemoryPeakLimitReject(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	r.restartDelta = &counterSnapshot{}
	peak := int64(dutMemoryPeakLimitBytes)
	r.resMu.Lock()
	r.resSnapshots["post_steady"].MemoryPeakBytes = &peak
	r.resMu.Unlock()
	res := assembleOwner(r)
	if res.Verdict != coordinator.VerdictReject {
		t.Fatalf("verdict = %s, want REJECT for memory peak >= limit (%+v)", res.Verdict, res.Validity.Reasons)
	}
}

// OOM-kill delta > 0 across the run is REJECT-level.
func TestResourceOomKillDeltaReject(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	r.restartDelta = &counterSnapshot{}
	kill := int64(1)
	r.resMu.Lock()
	r.resSnapshots["final"].MemoryOomKillEvents = &kill
	r.resMu.Unlock()
	res := assembleOwner(r)
	if res.Verdict != coordinator.VerdictReject || !hasRejectNote(res, "OOM-kill delta 1 > 0") {
		t.Fatalf("verdict = %s, reasons %+v", res.Verdict, res.Validity.Reasons)
	}
}

// Required throttle delta > 0 across the run is REJECT-level.
func TestResourceThrottleDeltaReject(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	r.restartDelta = &counterSnapshot{}
	thr := int64(3)
	r.resMu.Lock()
	r.resSnapshots["final"].CpuThrottledCount = &thr
	r.resMu.Unlock()
	res := assembleOwner(r)
	if res.Verdict != coordinator.VerdictReject || !hasRejectNote(res, "cpu throttle delta 3 > 0") {
		t.Fatalf("verdict = %s, reasons %+v", res.Verdict, res.Validity.Reasons)
	}
}

// Unplanned worker death on a bystander partition is REJECT-level.
func TestResourceWorkerDeathReject(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	r.restartDelta = &counterSnapshot{}
	r.resMu.Lock()
	r.prefSnapshots["post_reconnect"].NginxWorkerPids = []int64{101}
	r.resMu.Unlock()
	res := assembleOwner(r)
	if res.Verdict != coordinator.VerdictReject || !hasRejectNote(res, "worker death detected") {
		t.Fatalf("verdict = %s, reasons %+v", res.Verdict, res.Validity.Reasons)
	}
}

// The restart target's workers must be replaced exactly once and stay stable.
func TestResourceTargetRestartWorkerStability(t *testing.T) {
	cfg := testConfig(3)
	cfg.shardID = 3
	r, p := testShardRun(cfg)
	defer p.Stop()
	r.restartDelta = &counterSnapshot{}
	res := assembleOwner(r)
	for _, reason := range res.Validity.Reasons {
		if strings.Contains(reason, "worker death") || strings.Contains(reason, "did not replace") {
			t.Fatalf("healthy target restart flagged: %s", reason)
		}
	}
	// A second change after the planned drill is unplanned worker death.
	r.resMu.Lock()
	r.prefSnapshots["final"].NginxWorkerPids = []int64{301, 302}
	r.resMu.Unlock()
	res = assembleOwner(r)
	if res.Verdict != coordinator.VerdictReject || !hasRejectNote(res, "unplanned worker death") {
		t.Fatalf("verdict = %s, reasons %+v", res.Verdict, res.Validity.Reasons)
	}
}

// Worker_connections exhaustion at the final stage is REJECT-level.
func TestResourceConnectionsExhaustedReject(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	r.restartDelta = &counterSnapshot{}
	total, active := int64(1000), int64(1000)
	r.resMu.Lock()
	r.prefSnapshots["final"].WorkerConnectionsTotal = &total
	r.prefSnapshots["final"].NginxActive = &active
	r.resMu.Unlock()
	res := assembleOwner(r)
	if res.Verdict != coordinator.VerdictReject || !hasRejectNote(res, "exhausted") {
		t.Fatalf("verdict = %s, reasons %+v", res.Verdict, res.Validity.Reasons)
	}
}

// Spare evidence is mandatory across failover on the restart target.
func TestResourceSpareEvidenceMandatory(t *testing.T) {
	cfg := testConfig(3)
	cfg.shardID = 3
	cfg.spareControl = "http://spare.invalid"
	r, p := testShardRun(cfg)
	defer p.Stop()
	res := assembleOwner(r)
	for _, reason := range res.Validity.Reasons {
		if strings.Contains(reason, "spare") {
			t.Fatalf("seeded spare evidence flagged: %s", reason)
		}
	}
	r.resMu.Lock()
	delete(r.spareResSnaps, "post_restart")
	r.resMu.Unlock()
	res = assembleOwner(r)
	if !hasPublisherReason(res, "spare resource evidence incomplete") {
		t.Fatalf("missing-spare reason absent: %+v", res.Validity.Reasons)
	}
	if res.Verdict == coordinator.VerdictAccept {
		t.Fatal("missing spare evidence on the restart target must not ACCEPT")
	}
}

// The wire carries the full stage map so gates are auditable.
func TestResourceEvidenceOnWire(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	res := assembleOwner(r)
	stages, ok := res.Resources.Generator["resource_stages"].(map[string]any)
	if !ok {
		t.Fatal("resource_stages evidence missing from the wire")
	}
	partition, ok := stages["partition_stages"].(map[string]any)
	if !ok {
		t.Fatal("partition_stages missing")
	}
	for _, stage := range resourceStages {
		if _, ok := partition[stage]; !ok {
			t.Fatalf("stage %s missing from wire evidence", stage)
		}
	}
	if _, ok := stages["worker_topology"].(map[string]any)["baseline"]; !ok {
		t.Fatal("baseline worker topology missing")
	}
}

// ── R13 missing metrics stay missing, and always invalidate ──────────────────

// Every mandatory control metric, when null, must add a validity reason and
// prevent ACCEPT — no zero-coercion anywhere.
func TestR13EachMissingMandatoryMetricInvalidates(t *testing.T) {
	fields := []struct {
		name string
		nuke func(m *dut.ControlMetrics)
	}{
		{"memory_current_bytes", func(m *dut.ControlMetrics) { m.MemoryCurrentBytes = nil }},
		{"memory_peak_bytes", func(m *dut.ControlMetrics) { m.MemoryPeakBytes = nil }},
		{"cpu_usage_usec", func(m *dut.ControlMetrics) { m.CpuUsageUsec = nil }},
		{"cpu_throttled_count", func(m *dut.ControlMetrics) { m.CpuThrottledCount = nil }},
		{"cpu_throttled_usec", func(m *dut.ControlMetrics) { m.CpuThrottledUsec = nil }},
		{"memory_oom_events", func(m *dut.ControlMetrics) { m.MemoryOomEvents = nil }},
		{"oom_kill_events", func(m *dut.ControlMetrics) { m.MemoryOomKillEvents = nil }},
	}
	for _, f := range fields {
		t.Run(f.name, func(t *testing.T) {
			r, p := testShardRun(testConfig(0))
			defer p.Stop()
			f.nuke(r.nchanMetrics)
			res := assembleOwner(r)
			if !hasPublisherReason(res, "partition control metrics missing mandatory numeric fields") {
				t.Fatalf("missing %s did not invalidate: %+v", f.name, res.Validity.Reasons)
			}
			if res.Verdict == coordinator.VerdictAccept {
				t.Fatalf("missing %s must not ACCEPT", f.name)
			}
		})
	}
}

// The wire map omits absent keys instead of fabricating zeros (audited via a
// stage snapshot rendered through resourceEvidence).
func TestR13WireOmitsNullStageFields(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	r.resMu.Lock()
	m := completeMetrics()
	m.MemoryOomKillEvents = nil
	r.resSnapshots["final"] = m
	r.resMu.Unlock()
	res := assembleOwner(r)
	stages := res.Resources.Generator["resource_stages"].(map[string]any)
	partition := stages["partition_stages"].(map[string]any)
	final := partition["final"].(map[string]any)
	if _, present := final["oom_kill_events"]; present {
		t.Fatal("null oom_kill_events must be omitted from the wire, not emitted as 0")
	}
	if !hasPublisherReason(res, "missing mandatory numeric fields") || res.Verdict == coordinator.VerdictAccept {
		t.Fatalf("incomplete stage must invalidate: %+v", res.Validity.Reasons)
	}
}

// ── R14 explicit deep-cohort denominator/head agreement ──────────────────────

// A deep client that never established/validated/matched is surfaced as an
// explicit unmatched REJECT, never silently dropped.
func TestDeepUnmatchedRejects(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	r.restartDelta = &counterSnapshot{}
	r.deepAgree.unmatched = 1
	r.deepAgree.agreed--
	res := assembleOwner(r)
	if res.Verdict != coordinator.VerdictReject {
		t.Fatalf("verdict = %s, want REJECT for unmatched deep client", res.Verdict)
	}
	if got := res.CorrectnessCounters["deep_unmatched"]; got != 1 {
		t.Fatalf("deep_unmatched counter = %v, want 1", got)
	}
}

// Head disagreement is a REJECT-level violation with the explicit account.
func TestDeepDisagreementRejects(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	r.restartDelta = &counterSnapshot{}
	r.deepAgree.disagreed = 2
	r.deepAgree.agreed -= 2
	res := assembleOwner(r)
	stages := res.Resources.Generator["resource_stages"].(map[string]any)
	notes, _ := stages["reject_reasons"].([]string)
	found := false
	for _, note := range notes {
		if strings.Contains(note, "deep head agreement") && strings.Contains(note, "2 disagreements") {
			found = true
		}
	}
	if !found || res.Verdict != coordinator.VerdictReject {
		t.Fatalf("verdict = %s, notes %+v", res.Verdict, notes)
	}
}

// An account that does not close (categories do not sum to expected) is
// invalidating evidence.
func TestDeepAccountingNotClosingInvalid(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	r.deepAgree.agreed-- // agreed+disagreed+unmatched now < expected
	res := assembleOwner(r)
	if !hasPublisherReason(res, "deep-cohort accounting does not close") {
		t.Fatalf("non-closing account reason absent: %+v", res.Validity.Reasons)
	}
	if res.Verdict == coordinator.VerdictAccept {
		t.Fatal("non-closing deep accounting must not ACCEPT")
	}
}

// Missing head-agreement evidence entirely is mandatory-missing.
func TestDeepAgreementMissingInvalid(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	r.deepAgree = nil
	res := assembleOwner(r)
	if !hasPublisherReason(res, "deep-cohort denominator/head agreement never recorded") {
		t.Fatalf("missing-agreement reason absent: %+v", res.Validity.Reasons)
	}
	if res.Verdict == coordinator.VerdictAccept {
		t.Fatal("missing deep agreement must not ACCEPT")
	}
}

// The full explicit account rides the wire.
func TestDeepAgreementOnWire(t *testing.T) {
	r, p := testShardRun(testConfig(0))
	defer p.Stop()
	res := assembleOwner(r)
	da, ok := res.Resources.Generator["deep_agreement"].(map[string]any)
	if !ok {
		t.Fatal("deep_agreement evidence missing from the wire")
	}
	for _, field := range []string{"expected", "agreed", "disagreed", "unmatched"} {
		if _, ok := da[field]; !ok {
			t.Fatalf("deep_agreement missing %s", field)
		}
	}
}

// §27 ladder regression (R10 follow-up): EVERY shard must carry a measured
// restart window. The markRestartWindow helper is the single choke point used
// by both the failover drill (restart target) and the owner/bystander
// observed-window path; marking a positive window must clear the timing gate
// on any shard role, and a non-positive window stays invalid.
func TestMarkRestartWindowMeasuredOnEveryShardRole(t *testing.T) {
	for _, shardID := range []int{0, 1, 2, 3} {
		r, p := testShardRun(testConfig(shardID))
		defer p.Stop()
		r.timingMu.Lock()
		r.restartMeasured = false
		r.timingMu.Unlock()

		r.markRestartWindow(42)
		if !r.restartMeasured {
			t.Fatalf("shard %d: window not marked as measured", shardID)
		}
		res := r.assembleResult(nil, passingScenarios(), map[string]*deep.PathResult{},
			map[string]*deep.PathResult{},
			struct{ agreed, disagreed, unmatched int64 }{}, time.Now())
		if hasTimingReason(res, "restart window was never measured") {
			t.Fatalf("shard %d: measured window still flagged unmeasured: %+v", shardID, res.Validity.Reasons)
		}

		r.markRestartWindow(0)
		res = r.assembleResult(nil, passingScenarios(), map[string]*deep.PathResult{},
			map[string]*deep.PathResult{},
			struct{ agreed, disagreed, unmatched int64 }{}, time.Now())
		if !hasTimingReason(res, "not a positive measurement") {
			t.Fatalf("shard %d: zero window accepted as valid timing: %+v", shardID, res.Validity.Reasons)
		}
	}
}
