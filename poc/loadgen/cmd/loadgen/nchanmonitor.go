package main

import (
	"context"
	"encoding/json"
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
	port       string
	controlURL string
	client     *http.Client
	mu         sync.Mutex
	ring       []nchanStatusSample
	idx        int
	full       bool
}

const nchanStatusRingSize = 2048 // ~34 min at 1 Hz covers the longest run

func newNchanStatusMonitor(port, controlURL string) *nchanStatusMonitor {
	return &nchanStatusMonitor{
		port:       port,
		controlURL: controlURL,
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
			s := nchanStatusSample{TMs: time.Now().UnixMilli(), Port: m.port, Fields: map[string]string{}, WorkerCPU: map[string]int64{}}
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
			if m.controlURL != "" {
				resp2, err := m.client.Get(m.controlURL + "/workers/cpu")
				if err == nil {
					buf2 := make([]byte, 8192)
					n2, _ := resp2.Body.Read(buf2)
					resp2.Body.Close()
					var wc struct {
						Workers []struct {
							Pid     int    `json:"pid"`
							Utime   int64  `json:"utime"`
							Stime   int64  `json:"stime"`
							State   string `json:"state"`
							Wchan   string `json:"wchan,omitempty"`
							Syscall *int   `json:"syscall,omitempty"`
							Vctx    *int64 `json:"vctx,omitempty"`
							Nctx    *int64 `json:"nctx,omitempty"`
						} `json:"workers"`
					}
					if json.Unmarshal(buf2[:n2], &wc) == nil {
						for _, w := range wc.Workers {
							key := strconv.Itoa(w.Pid)
							s.WorkerCPU[key] = w.Utime + w.Stime
							s.Fields["worker_state_"+key] = w.State
							if w.Wchan != "" {
								s.Fields["worker_wchan_"+key] = w.Wchan
							}
							if w.Syscall != nil {
								s.Fields["worker_syscall_"+key] = strconv.Itoa(*w.Syscall)
							}
							if w.Vctx != nil {
								s.Fields["worker_vctx_"+key] = strconv.FormatInt(*w.Vctx, 10)
							}
							if w.Nctx != nil {
								s.Fields["worker_nctx_"+key] = strconv.FormatInt(*w.Nctx, 10)
							}
						}
					}
				}
			}
			m.record(s)
		}
	}
}
