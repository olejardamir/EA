package main

import (
	"io"
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
	Deep      []json.RawMessage `json:"workers_deep,omitempty"`
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
							Pid        int    `json:"pid"`
							Utime      int64  `json:"utime"`
							Stime      int64  `json:"stime"`
							State      string `json:"state"`
							Wchan      string `json:"wchan,omitempty"`
							Syscall    *int   `json:"syscall,omitempty"`
							Vctx       *int64 `json:"vctx,omitempty"`
							Nctx       *int64 `json:"nctx,omitempty"`
							WriteBytes *int64 `json:"write_bytes,omitempty"`
							ReadBytes  *int64 `json:"read_bytes,omitempty"`
							Wchar      *int64 `json:"wchar,omitempty"`
							Rchar      *int64 `json:"rchar,omitempty"`
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
							// Drain-rate discriminator: per-worker cumulative
							// wchar/rchar (ALL syscall I/O bytes, sockets
							// included — write_bytes is storage-only and
							// stays zero for SSE fan-out). Deltas between
							// samples give each stalled worker's actual
							// egress rate.
							if w.Wchar != nil {
								s.Fields["worker_wchar_"+key] = strconv.FormatInt(*w.Wchar, 10)
							}
							if w.Rchar != nil {
								s.Fields["worker_rchar_"+key] = strconv.FormatInt(*w.Rchar, 10)
							}
						}
					}
				}
				// TEMP-DIAG: nginx_status Reading/Writing/Waiting — locates the
				// delivery backlog inside the node: thousands Writing = frames
				// queued in local SSE output; high Waiting + low Writing = the
				// stall is upstream (redis relay / IPC), not socket writes.
				resp3, err3 := m.client.Get(m.controlURL + "/preflight?target=1")
				if err3 == nil {
					buf3 := make([]byte, 8192)
					n3, _ := resp3.Body.Read(buf3)
					resp3.Body.Close()
				var pf struct {
					NginxReading *int `json:"nginx_reading"`
					NginxWriting *int `json:"nginx_writing"`
					NginxWaiting *int `json:"nginx_waiting"`
					NginxActive  *int `json:"nginx_active"`
				}
				if json.Unmarshal(buf3[:n3], &pf) == nil {
					if pf.NginxReading != nil {
						s.Fields["status_reading"] = strconv.Itoa(*pf.NginxReading)
					}
					if pf.NginxWriting != nil {
						s.Fields["status_writing"] = strconv.Itoa(*pf.NginxWriting)
					}
					if pf.NginxWaiting != nil {
						s.Fields["status_waiting"] = strconv.Itoa(*pf.NginxWaiting)
					}
					if pf.NginxActive != nil {
						s.Fields["status_active"] = strconv.Itoa(*pf.NginxActive)
					}
				}
			}
				// TEMP-DIAG: kernel socket-queue sums in this container's
				// netns. Large tx_queue during the stall = SSE bytes pending
				// in kernel send buffers (clients not reading); tx_queue ~0
				// while workers still drain = the backlog sits in nginx
				// userland chains, not the kernel.
				resp5, err5 := m.client.Get(m.controlURL + "/net/tcpsum")
				if err5 == nil {
					buf5 := make([]byte, 4096)
					n5, _ := resp5.Body.Read(buf5)
					resp5.Body.Close()
					var ts struct {
						Sockets      int64 `json:"sockets"`
						TxQueueBytes int64 `json:"tx_queue_bytes"`
						RxQueueBytes int64 `json:"rx_queue_bytes"`
						TxNonempty   int64 `json:"tx_nonempty"`
						RxNonempty   int64 `json:"rx_nonempty"`
					}
					if json.Unmarshal(buf5[:n5], &ts) == nil {
						s.Fields["tcp_sockets"] = strconv.FormatInt(ts.Sockets, 10)
						s.Fields["tcp_txq_bytes"] = strconv.FormatInt(ts.TxQueueBytes, 10)
						s.Fields["tcp_rxq_bytes"] = strconv.FormatInt(ts.RxQueueBytes, 10)
						s.Fields["tcp_txq_nonempty"] = strconv.FormatInt(ts.TxNonempty, 10)
						s.Fields["tcp_rxq_nonempty"] = strconv.FormatInt(ts.RxNonempty, 10)
					}
				}
			}
			// Client-side counterpart: this loadgen container's own netns
			// socket queues. Large rx_queue during the stall = frames the DUT
			// delivered but client readers have not consumed yet — proves the
			// bottleneck is downstream consumption, not DUT egress.
			if lsock, rxB, txB, rxN, txN, err := readLocalTcpQueues(); err == nil {
				s.Fields["cli_tcp_sockets"] = strconv.FormatInt(lsock, 10)
				s.Fields["cli_rxq_bytes"] = strconv.FormatInt(rxB, 10)
				s.Fields["cli_txq_bytes"] = strconv.FormatInt(txB, 10)
				s.Fields["cli_rxq_nonempty"] = strconv.FormatInt(rxN, 10)
				s.Fields["cli_txq_nonempty"] = strconv.FormatInt(txN, 10)
			}
		// TEMP-DIAG: ptrace-grade per-worker snapshot each second (syscall,
		// kernel stack, wchan, state) — kept as a parallel evidence stream so
		// the Fields map stays flat for the stub-status fields.
		if m.controlURL != "" {
			resp4, err4 := m.client.Get(m.controlURL + "/workers/deep")
			if err4 == nil {
				buf4, _ := io.ReadAll(resp4.Body)
				resp4.Body.Close()
				var dp struct {
					Workers []json.RawMessage `json:"workers"`
				}
				if json.Unmarshal(buf4, &dp) == nil {
					s.Deep = dp.Workers
				}
			}
		}
			m.record(s)
		}
	}
}
