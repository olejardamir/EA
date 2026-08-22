package dut

import (
	"context"
	"fmt"
	"os"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

// GeneratorRuntimeSample is one cgroup snapshot of the generator's own
// container resources. Missing metrics are recorded as available=false —
// they must never silently become zeros (R13).
type GeneratorRuntimeSample struct {
	Available     bool
	CPUUsec       int64 // cumulative cpu time in usec
	ThrottleCount int64
	ThrottledUsec int64
	OOMEvents     int64
	OomKills      int64
	MemoryCurrent int64 // bytes (-1 when unreadable)
	MemoryPeak    int64 // bytes (-1 when unreadable)
	At            time.Time
}

// GeneratorSchedulerLag is the frozen distribution of goroutine wake-up
// jitter measured by the monitor's probe (scheduler pressure evidence).
type GeneratorSchedulerLag struct {
	P50Ms float64
	P95Ms float64
	P99Ms float64
	MaxMs float64
}

// GeneratorRuntimeEvidence is the complete R09 per-shard generator validity
// measurement for one run: cgroup deltas across the run, windowed normalized
// CPU peak, scheduler-lag distribution, runtime internals, and the frozen
// source-port/FD headroom binding.
type GeneratorRuntimeEvidence struct {
	Start GeneratorRuntimeSample
	End   GeneratorRuntimeSample

	CPUDeltaUsec         int64
	ThrottledCountDelta  int64
	ThrottledUsecDelta   int64
	OOMDelta             int64
	OomKillDelta         int64
	WallMs               int64
	AssignedCores        float64
	NormalizedCPUPeakPct float64 // windowed max of interval-normalized CPU %

	SchedulerLag    GeneratorSchedulerLag
	GoroutinesPeak  int
	GCCycles        uint32
	GCPauseTotalMs  float64
	SrcPortRange    string
	SrcPortHeadroom bool
	FdSoft          int64
	FdHard          int64
}

// Gates applies the frozen R09 validity rules. A false return means the
// generator's own health cannot be proven — the run is INCONCLUSIVE, never
// ACCEPT.
func (e *GeneratorRuntimeEvidence) Gates() (bool, []string) {
	var reasons []string
	if !e.Start.Available || !e.End.Available {
		reasons = append(reasons, "generator cgroup metrics unavailable")
	} else {
		if e.NormalizedCPUPeakPct >= 90 {
			reasons = append(reasons, fmt.Sprintf("generator normalized CPU peak %.1f%% >= 90%%", e.NormalizedCPUPeakPct))
		}
		if e.SchedulerLag.P99Ms >= 100 {
			reasons = append(reasons, fmt.Sprintf("generator scheduler lag p99 %.1fms >= 100ms", e.SchedulerLag.P99Ms))
		}
		if e.ThrottledCountDelta != 0 {
			reasons = append(reasons, fmt.Sprintf("generator cpu throttled delta %d != 0", e.ThrottledCountDelta))
		}
		if e.OOMDelta != 0 {
			reasons = append(reasons, fmt.Sprintf("generator OOM delta %d != 0", e.OOMDelta))
		}
		if e.OomKillDelta != 0 {
			reasons = append(reasons, fmt.Sprintf("generator OOM-kill delta %d != 0", e.OomKillDelta))
		}
	}
	if !e.SrcPortHeadroom {
		reasons = append(reasons, "generator source-port headroom invalid")
	}
	return len(reasons) == 0, reasons
}

// EvidenceMap renders the evidence for the result wire (resources.generator).
// Unavailable cgroup metrics stay null — never coerced to zero.
func (e *GeneratorRuntimeEvidence) EvidenceMap() map[string]any {
	nullIfMissing := func(v int64, ok bool) any {
		if !ok {
			return nil
		}
		return v
	}
	m := map[string]any{
		"cgroup_cpu_usage_start":      nullIfMissing(e.Start.CPUUsec, e.Start.Available),
		"cgroup_cpu_usage_end":        nullIfMissing(e.End.CPUUsec, e.End.Available),
		"cgroup_cpu_usage_delta":      nullIfMissing(e.CPUDeltaUsec, e.Start.Available && e.End.Available),
		"assigned_cpu_cores":          e.AssignedCores,
		"normalized_cpu_peak_percent": e.NormalizedCPUPeakPct,
		"cpu_throttled_count_start":   nullIfMissing(e.Start.ThrottleCount, e.Start.Available),
		"cpu_throttled_count_end":     nullIfMissing(e.End.ThrottleCount, e.End.Available),
		"cpu_throttled_count_delta":   nullIfMissing(e.ThrottledCountDelta, e.Start.Available && e.End.Available),
		"cpu_throttled_usec_delta":    nullIfMissing(e.ThrottledUsecDelta, e.Start.Available && e.End.Available),
		"memory_current":              nullIfMissing(e.End.MemoryCurrent, e.End.Available && e.End.MemoryCurrent >= 0),
		"memory_peak":                 nullIfMissing(e.End.MemoryPeak, e.End.Available && e.End.MemoryPeak >= 0),
		"oom_events_start":            nullIfMissing(e.Start.OOMEvents, e.Start.Available),
		"oom_events_end":              nullIfMissing(e.End.OOMEvents, e.End.Available),
		"oom_events_delta":            nullIfMissing(e.OOMDelta, e.Start.Available && e.End.Available),
		"oom_kill_start":              nullIfMissing(e.Start.OomKills, e.Start.Available),
		"oom_kill_end":                nullIfMissing(e.End.OomKills, e.End.Available),
		"oom_kill_delta":              nullIfMissing(e.OomKillDelta, e.Start.Available && e.End.Available),
		"scheduler_lag_p50_ms":        e.SchedulerLag.P50Ms,
		"scheduler_lag_p95_ms":        e.SchedulerLag.P95Ms,
		"scheduler_lag_p99_ms":        e.SchedulerLag.P99Ms,
		"scheduler_lag_max_ms":        e.SchedulerLag.MaxMs,
		"goroutine_count_peak":        e.GoroutinesPeak,
		"gc_cycles":                   e.GCCycles,
		"gc_pause_total_ms":           e.GCPauseTotalMs,
		"source_port_range":           e.SrcPortRange,
		"source_port_headroom_valid":  e.SrcPortHeadroom,
		"fd_soft":                     e.FdSoft,
		"fd_hard":                     e.FdHard,
		"wall_ms":                     e.WallMs,
	}
	return m
}

// readCgroupV2Sample snapshots the generator container's cgroup-v2 state.
func readCgroupV2Sample() GeneratorRuntimeSample {
	s := GeneratorRuntimeSample{At: time.Now(), MemoryCurrent: -1, MemoryPeak: -1}
	cpuStat, err := os.ReadFile("/sys/fs/cgroup/cpu.stat")
	if err != nil {
		return s
	}
	for _, line := range strings.Split(string(cpuStat), "\n") {
		fields := strings.Fields(line)
		if len(fields) != 2 {
			continue
		}
		v, err := strconv.ParseInt(fields[1], 10, 64)
		if err != nil {
			continue
		}
		switch fields[0] {
		case "usage_usec":
			s.CPUUsec = v
		case "nr_throttled":
			s.ThrottleCount = v
		case "throttled_usec":
			s.ThrottledUsec = v
		}
	}
	memEvents, err := os.ReadFile("/sys/fs/cgroup/memory.events")
	if err == nil {
		for _, line := range strings.Split(string(memEvents), "\n") {
			fields := strings.Fields(line)
			if len(fields) != 2 {
				continue
			}
			v, err := strconv.ParseInt(fields[1], 10, 64)
			if err != nil {
				continue
			}
			switch fields[0] {
			case "oom":
				s.OOMEvents = v
			case "oom_kill":
				s.OomKills = v
			}
		}
	} else {
		return s
	}
	if b, err := os.ReadFile("/sys/fs/cgroup/memory.current"); err == nil {
		if v, err := strconv.ParseInt(strings.TrimSpace(string(b)), 10, 64); err == nil {
			s.MemoryCurrent = v
		}
	}
	if b, err := os.ReadFile("/sys/fs/cgroup/memory.peak"); err == nil {
		if v, err := strconv.ParseInt(strings.TrimSpace(string(b)), 10, 64); err == nil {
			s.MemoryPeak = v
		}
	}
	s.Available = true
	return s
}

// assignedCoreCount resolves the effective CPU allowance (quota/period),
// falling back to runtime.GOMAXPROCS-visible cores.
func assignedCoreCount() float64 {
	if b, err := os.ReadFile("/sys/fs/cgroup/cpu.max"); err == nil {
		fields := strings.Fields(string(b))
		if len(fields) == 2 && fields[0] != "max" {
			quota, errQ := strconv.ParseFloat(fields[0], 64)
			period, errP := strconv.ParseFloat(fields[1], 64)
			if errQ == nil && errP == nil && period > 0 && quota > 0 {
				return quota / period
			}
		}
	}
	return float64(runtime.NumCPU())
}

// percentile computes the nearest-rank percentile of a sorted slice.
func percentile(sorted []float64, p float64) float64 {
	if len(sorted) == 0 {
		return 0
	}
	idx := int(p * float64(len(sorted)))
	if idx >= len(sorted) {
		idx = len(sorted) - 1
	}
	return sorted[idx]
}

// GeneratorMonitor samples the generator container's own runtime health for
// the whole run window (R09). Its evidence gates the shard verdict: an
// unhealthy generator means the workload proof is untrustworthy.
type GeneratorMonitor struct {
	mu sync.Mutex

	started bool

	startSample GeneratorRuntimeSample
	endSample   GeneratorRuntimeSample

	normalizedPeakPct float64

	lagMu     sync.Mutex
	lagSorted []float64 // filled at stop from raw samples
	lagRaw    []time.Duration

	goroutinesPeak int
	gcCycles       uint32
	gcPauseTotalMs float64

	stopOnce sync.Once
	done     chan struct{}
}

// StartGeneratorMonitor begins background sampling of the generator's own
// cgroup + runtime health until Stop is called.
func StartGeneratorMonitor(ctx context.Context) *GeneratorMonitor {
	if ctx == nil {
		ctx = context.Background()
	}
	m := &GeneratorMonitor{done: make(chan struct{})}
	m.startSample = readCgroupV2Sample()
	m.goroutinesPeak = runtime.NumGoroutine()
	var ms runtime.MemStats
	runtime.ReadMemStats(&ms)
	m.gcCycles = ms.NumGC
	m.gcPauseTotalMs = float64(ms.PauseTotalNs) / 1e6

	go func() {
		ticker := time.NewTicker(500 * time.Millisecond)
		defer ticker.Stop()
		prev := m.startSample
		for {
			select {
			case <-ctx.Done():
				return
			case <-m.done:
				return
			case <-ticker.C:
				cur := readCgroupV2Sample()
				if cur.Available && prev.Available {
					wallMs := cur.At.Sub(prev.At).Seconds()
					if wallMs > 0 {
						pct := float64(cur.CPUUsec-prev.CPUUsec) / (wallMs * 1e6 * assignedCoreCount()) * 100
						m.mu.Lock()
						if pct > m.normalizedPeakPct {
							m.normalizedPeakPct = pct
						}
						m.mu.Unlock()
					}
					prev = cur
				}
				if g := runtime.NumGoroutine(); g > m.goroutinesPeak {
					m.goroutinesPeak = g
				}
			}
		}
	}()

	// Scheduler-lag probe: expects to wake every 20ms; the overshoot is the
	// observed scheduling delay distribution.
	go func() {
		ticker := time.NewTicker(20 * time.Millisecond)
		defer ticker.Stop()
		last := time.Now()
		for {
			select {
			case <-ctx.Done():
				return
			case <-m.done:
				return
			case <-ticker.C:
				now := time.Now()
				lag := now.Sub(last) - 20*time.Millisecond
				if lag < 0 {
					lag = 0
				}
				m.lagMu.Lock()
				m.lagRaw = append(m.lagRaw, lag)
				m.lagMu.Unlock()
				last = now
			}
		}
	}()
	m.started = true
	return m
}

// Stop freezes the evidence: takes the end cgroup snapshot, closes the
// sampler goroutines, and computes all deltas and distributions.
func (m *GeneratorMonitor) Stop() *GeneratorRuntimeEvidence {
	m.stopOnce.Do(func() {
		close(m.done)
		time.Sleep(60 * time.Millisecond) // let in-flight ticks land before the end snapshot
	})
	m.endSample = readCgroupV2Sample()
	var ms runtime.MemStats
	runtime.ReadMemStats(&ms)

	ev := &GeneratorRuntimeEvidence{
		Start:            m.startSample,
		End:              m.endSample,
		GoroutinesPeak:   m.goroutinesPeak,
		GCCycles:         ms.NumGC,
		GCPauseTotalMs:   float64(ms.PauseTotalNs) / 1e6,
		AssignedCores:    assignedCoreCount(),
		NormalizedCPUPeakPct: m.normalizedPeakPct,
	}
	if low, high, err := ReadSourcePortRange(); err == nil {
		ev.SrcPortRange = fmt.Sprintf("%d-%d", low, high)
	}
	if soft, hard, err := ReadFdlimit(); err == nil {
		ev.FdSoft, ev.FdHard = soft, hard
	}
	if m.startSample.Available && m.endSample.Available {
		ev.CPUDeltaUsec = m.endSample.CPUUsec - m.startSample.CPUUsec
		ev.ThrottledCountDelta = m.endSample.ThrottleCount - m.startSample.ThrottleCount
		ev.ThrottledUsecDelta = m.endSample.ThrottledUsec - m.startSample.ThrottledUsec
		ev.OOMDelta = m.endSample.OOMEvents - m.startSample.OOMEvents
		ev.OomKillDelta = m.endSample.OomKills - m.startSample.OomKills
		ev.WallMs = m.endSample.At.Sub(m.startSample.At).Milliseconds()
	}
	m.lagMu.Lock()
	sorted := make([]float64, len(m.lagRaw))
	for i, d := range m.lagRaw {
		sorted[i] = float64(d.Microseconds()) / 1000.0
	}
	m.lagRaw = nil
	sortFloats(sorted)
	m.lagMu.Unlock()
	ev.SchedulerLag = GeneratorSchedulerLag{
		P50Ms: percentile(sorted, 0.50),
		P95Ms: percentile(sorted, 0.95),
		P99Ms: percentile(sorted, 0.99),
		MaxMs: percentile(sorted, 1.0),
	}
	return ev
}

func sortFloats(v []float64) {
	for i := 1; i < len(v); i++ {
		for j := i; j > 0 && v[j] < v[j-1]; j-- {
			v[j], v[j-1] = v[j-1], v[j]
		}
	}
}
