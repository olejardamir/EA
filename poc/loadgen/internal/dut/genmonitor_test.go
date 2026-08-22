package dut

import (
	"strings"
	"testing"
	"time"
)

func availableSample(cpu, throttleCount, throttleUsec, oom, oomKill int64) GeneratorRuntimeSample {
	return GeneratorRuntimeSample{
		Available:     true,
		CPUUsec:       cpu,
		ThrottleCount: throttleCount,
		ThrottledUsec: throttleUsec,
		OOMEvents:     oom,
		OomKills:      oomKill,
		MemoryCurrent: 1024,
		MemoryPeak:    2048,
		At:            time.Now(),
	}
}

func cleanEvidence() *GeneratorRuntimeEvidence {
	return &GeneratorRuntimeEvidence{
		Start:                availableSample(1_000_000, 0, 0, 0, 0),
		End:                  availableSample(2_000_000, 0, 0, 0, 0),
		CPUDeltaUsec:         1_000_000,
		WallMs:               10_000,
		AssignedCores:        4,
		NormalizedCPUPeakPct: 50,
		SchedulerLag:         GeneratorSchedulerLag{P50Ms: 0.5, P95Ms: 1, P99Ms: 2, MaxMs: 5},
		GoroutinesPeak:       100,
		SrcPortHeadroom:      true,
		FdSoft:               1048576,
		FdHard:               1048577,
	}
}

// ── R09 frozen generator validity gates ─────────────────────────────────────

func TestGeneratorGatesCleanPass(t *testing.T) {
	ok, reasons := cleanEvidence().Gates()
	if !ok {
		t.Fatalf("clean evidence must pass: %v", reasons)
	}
}

func TestGeneratorGateBoundaries(t *testing.T) {
	tests := []struct {
		name    string
		mutate  func(*GeneratorRuntimeEvidence)
		wantSub string
	}{
		{
			name:    "normalized CPU at exactly 90 percent is invalid",
			mutate:  func(e *GeneratorRuntimeEvidence) { e.NormalizedCPUPeakPct = 90 },
			wantSub: "normalized CPU peak",
		},
		{
			name:    "normalized CPU just below 90 passes",
			mutate:  func(e *GeneratorRuntimeEvidence) { e.NormalizedCPUPeakPct = 89.9 },
			wantSub: "",
		},
		{
			name:    "scheduler lag p99 at exactly 100ms is invalid",
			mutate:  func(e *GeneratorRuntimeEvidence) { e.SchedulerLag.P99Ms = 100 },
			wantSub: "scheduler lag p99",
		},
		{
			name:    "scheduler lag p99 below 100ms passes",
			mutate:  func(e *GeneratorRuntimeEvidence) { e.SchedulerLag.P99Ms = 99.9 },
			wantSub: "",
		},
		{
			name:    "cpu throttled delta nonzero is invalid",
			mutate:  func(e *GeneratorRuntimeEvidence) { e.ThrottledCountDelta = 1 },
			wantSub: "throttled delta",
		},
		{
			name:    "oom delta nonzero is invalid",
			mutate:  func(e *GeneratorRuntimeEvidence) { e.OOMDelta = 1 },
			wantSub: "OOM delta",
		},
		{
			name:    "oom-kill delta nonzero is invalid",
			mutate:  func(e *GeneratorRuntimeEvidence) { e.OomKillDelta = 1 },
			wantSub: "OOM-kill delta",
		},
		{
			name:    "invalid source-port headroom is invalid",
			mutate:  func(e *GeneratorRuntimeEvidence) { e.SrcPortHeadroom = false },
			wantSub: "source-port headroom",
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			e := cleanEvidence()
			tc.mutate(e)
			ok, reasons := e.Gates()
			if tc.wantSub == "" {
				if !ok {
					t.Fatalf("expected pass, got reasons: %v", reasons)
				}
				return
			}
			if ok {
				t.Fatalf("expected gate violation %q to fail", tc.wantSub)
			}
			found := false
			for _, reason := range reasons {
				if strings.Contains(reason, tc.wantSub) {
					found = true
				}
			}
			if !found {
				t.Fatalf("reasons %v missing substring %q", reasons, tc.wantSub)
			}
		})
	}
}

// A missing cgroup sample must invalidate the measurement — never silently
// pass as zeros (R13 boundary for generator evidence).
func TestGeneratorMissingCgroupInvalidates(t *testing.T) {
	e := cleanEvidence()
	e.Start.Available = false
	ok, reasons := e.Gates()
	if ok {
		t.Fatal("missing start cgroup sample must invalidate")
	}
	if len(reasons) == 0 || !strings.Contains(reasons[0], "cgroup metrics unavailable") {
		t.Fatalf("unexpected reasons: %v", reasons)
	}
	e = cleanEvidence()
	e.End.Available = false
	if ok, _ := e.Gates(); ok {
		t.Fatal("missing end cgroup sample must invalidate")
	}
}

// Unavailable memory metrics render as null on the wire — never zero.
func TestGeneratorEvidenceMapNullPreservation(t *testing.T) {
	e := cleanEvidence()
	e.End.MemoryCurrent = -1
	e.End.MemoryPeak = -1
	m := e.EvidenceMap()
	if m["memory_current"] != nil || m["memory_peak"] != nil {
		t.Fatalf("unavailable memory metrics must be null, got current=%v peak=%v", m["memory_current"], m["memory_peak"])
	}
	if m["cgroup_cpu_usage_delta"] != int64(1_000_000) {
		t.Fatalf("cpu delta lost: %v", m["cgroup_cpu_usage_delta"])
	}
}

// The live monitor produces complete evidence on a real host: samples are
// taken, deltas are computed, and the wire map carries all mandatory fields.
func TestGeneratorMonitorLifecycle(t *testing.T) {
	m := StartGeneratorMonitor(nil)
	time.Sleep(300 * time.Millisecond)
	ev := m.Stop()
	if ev.Start.At.IsZero() || ev.End.At.IsZero() {
		t.Fatal("monitor never took its snapshots")
	}
	got, _ := ev.Gates()
	_ = got // host-dependent: cgroup may be unavailable in the test env; Gates must reflect that honestly
	mm := ev.EvidenceMap()
	for _, key := range []string{
		"cgroup_cpu_usage_start", "cgroup_cpu_usage_end", "assigned_cpu_cores",
		"scheduler_lag_p99_ms", "goroutine_count_peak", "gc_cycles", "source_port_range",
	} {
		if _, present := mm[key]; !present {
			t.Fatalf("mandatory generator field %q missing from evidence", key)
		}
	}
	if ev.GoroutinesPeak < 1 {
		t.Fatal("goroutine peak not measured")
	}
}
