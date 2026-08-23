package main

import (
	"context"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

func osReadDir(dir string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		names = append(names, e.Name())
	}
	return names, nil
}

func osReadFile(path string) ([]byte, error) { return os.ReadFile(path) }

func procComm(pid string) string {
	b, err := os.ReadFile(filepath.Join("/proc", pid, "comm"))
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(b))
}

// nchanStatusSample is one timestamped reading of a partition's
// /nchan_stub_status endpoint plus its per-worker CPU ticks. Sampling every
// second through the stall era turns "transport latency is high" into direct
// DUT-side evidence: subscriber counts, stored-message backlog, and frozen
// workers (flat CPU deltas) become visible on the run timeline.
type nchanStatusSample struct {
	TMs       int64             `json:"t_ms"`
	Port      string            `json:"port"`
	Fields    map[string]string `json:"fields,omitempty"`
	WorkerCPU map[string]int64  `json:"worker_cpu_ticks"`
}

// nchanStatusMonitor samples one partition every second into a bounded ring.
type nchanStatusMonitor struct {
	port   string
	client *http.Client
	mu     sync.Mutex
	ring   []nchanStatusSample
	idx    int
	full   bool
}

const nchanStatusRingSize = 2048 // ~34 min at 1 Hz covers the longest run

func newNchanStatusMonitor(port string) *nchanStatusMonitor {
	return &nchanStatusMonitor{
		port: port,
		client: &http.Client{
			Timeout: 900 * time.Millisecond,
		},
		ring: make([]nchanStatusSample, nchanStatusRingSize),
	}
}

func (m *nchanStatusMonitor) record(s nchanStatusSample) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.ring[m.idx] = s
	m.idx = (m.idx + 1) % nchanStatusRingSize
	if m.idx == 0 {
		m.full = true
	}
}

// Snapshot returns retained samples in chronological order.
func (m *nchanStatusMonitor) Snapshot() []nchanStatusSample {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []nchanStatusSample
	if m.full {
		out = append(out, m.ring[m.idx:]...)
	}
	out = append(out, m.ring[:m.idx]...)
	return out
}

// Run polls until ctx is done.
func (m *nchanStatusMonitor) Run(ctx context.Context) {
	t := time.NewTicker(1 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			s := nchanStatusSample{TMs: time.Now().UnixMilli(), Port: m.port, WorkerCPU: map[string]int64{}}
			resp, err := m.client.Get("http://host.docker.internal:" + m.port + "/nchan_stub_status")
			if err == nil {
				buf := make([]byte, 4096)
				n, _ := resp.Body.Read(buf)
				resp.Body.Close()
				s.Fields = map[string]string{}
				for _, line := range strings.Split(string(buf[:n]), "\n") {
					if i := strings.IndexByte(line, ':'); i > 0 {
						s.Fields[strings.TrimSpace(line[:i])] = strings.TrimSpace(line[i+1:])
					}
				}
			}
			for pid, ticks := range workerCPUTicks() {
				s.WorkerCPU[pid] = ticks
			}
			m.record(s)
		}
	}
}

// workerCPUTicks reads utime+stime (clock ticks) for every nginx worker in
// this container's PID namespace: flat deltas across seconds identify
// hard-frozen workers directly (the earlier debug-run observation).
func workerCPUTicks() map[string]int64 {
	out := map[string]int64{}
	entries, err := osReadDir("/proc")
	if err != nil {
		return out
	}
	for _, e := range entries {
		if !isNumeric(e) {
			continue
		}
		b, err := osReadFile("/proc/" + e + "/stat")
		if err != nil {
			continue
		}
		stat := string(b)
		// comm may contain spaces; find the closing paren
		i := strings.LastIndexByte(stat, ')')
		if i < 0 || i+2 >= len(stat) {
			continue
		}
		fields := strings.Fields(stat[i+2:])
		// fields[0]=state; utime=field 11 (index 11 after state), stime=12
		if len(fields) < 13 || fields[0] != "R" && fields[0] != "S" && fields[0] != "D" && fields[0] != "Z" {
			continue
		}
		ut := atoiOrZero(fields[11])
		st := atoiOrZero(fields[12])
		comm := procComm(e)
		if !strings.Contains(comm, "nginx") {
			continue
		}
		out[e] = ut + st
	}
	return out
}

func isNumeric(s string) bool {
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return len(s) > 0
}

func atoiOrZero(s string) int64 {
	v, _ := strconv.ParseInt(s, 10, 64)
	return v
}
