// Package dut collects generator-side evidence about the DUT (Nchan control
// servers, shared Redis) plus the generator's own kernel environment
// (ephemeral-port range, FD limits). It never alters DUT behavior.
package dut

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

type ControlMetrics struct {
	MemoryCurrentBytes  *int64 `json:"memory_current_bytes"`
	MemoryPeakBytes     *int64 `json:"memory_peak_bytes"`
	CpuUsageUsec        *int64 `json:"cpu_usage_usec"`
	CpuThrottledCount   *int64 `json:"cpu_throttled_count"`
	CpuThrottledUsec    *int64 `json:"cpu_throttled_usec"`
	MemoryOomEvents     *int64 `json:"memory_oom_events"`
	MemoryOomKillEvents *int64 `json:"memory_oom_kill_events"`
}

func GetControlMetrics(ctx context.Context, controlURL string) (*ControlMetrics, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimSuffix(controlURL, "/")+"/metrics", nil)
	if err != nil {
		return nil, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("control /metrics -> %d", resp.StatusCode)
	}
	var out ControlMetrics
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Preflight mirrors the control server's capacity preflight verdict.
type Preflight struct {
	Sufficient        bool   `json:"sufficient"`
	Reason            any    `json:"reason"`
	UsableSSECapacity *int64 `json:"usable_sse_capacity,omitempty"`
	NginxWorkerFdSoft *int64 `json:"nginx_worker_fd_soft,omitempty"`
	NginxWorkerFdHard *int64 `json:"nginx_worker_fd_hard,omitempty"`
	CpuQuota          *int64 `json:"cpu_quota,omitempty"`
}

func PreflightPartition(ctx context.Context, controlURL string, target int) (*Preflight, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		fmt.Sprintf("%s/preflight?target=%d", strings.TrimSuffix(controlURL, "/"), target), nil)
	if err != nil {
		return nil, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var out Preflight
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	return &out, nil
}

func HealthCheck(ctx context.Context, pubURL string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimSuffix(pubURL, "/")+"/pub/healthcheck", nil)
	if err != nil {
		return err
	}
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("healthcheck -> %d", resp.StatusCode)
	}
	return nil
}

// Restart triggers the literal partition-node restart via its control server.
func Restart(ctx context.Context, controlURL string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimSuffix(controlURL, "/")+"/restart", nil)
	if err != nil {
		return err
	}
	resp, err := (&http.Client{Timeout: 5 * time.Second}).Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("control /restart -> %d", resp.StatusCode)
	}
	return nil
}

// ── Minimal RESP client (INFO only; no external dependency) ─────────────

type RedisInfo struct {
	UsedBytes        int64
	PeakBytes        int64
	ConnectedClients int64
}

// RedisInfo queries INFO over a one-shot minimal RESP connection.
func QueryRedisInfo(ctx context.Context, addr string) (*RedisInfo, error) {
	var d net.Dialer
	conn, err := d.DialContext(ctx, "tcp", addr)
	if err != nil {
		return nil, err
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(5 * time.Second))
	if _, err := conn.Write([]byte("*1\r\n$4\r\nINFO\r\n")); err != nil {
		return nil, err
	}
	// Read until the bulk-string terminator "$N\r\n ... \r\n" is complete:
	// simplest correct approach for one-shot use is read-all-until-close-free
	// bounded loop keyed on RESP framing.
	reader := make([]byte, 0, 8192)
	buf := make([]byte, 4096)
	for {
		n, err := conn.Read(buf)
		if n > 0 {
			reader = append(reader, buf[:n]...)
			// A complete bulk reply ends with "\r\n" after $len bytes of body;
			// detect when total bytes >= header + declared length + 2.
			if len(reader) > 1 && reader[0] == '$' {
				if idx := indexCRLF(reader); idx > 0 {
					declared, perr := strconv.Atoi(string(reader[1:idx]))
					if perr == nil && len(reader) >= idx+2+declared+2 {
						break
					}
				}
			}
		}
		if err != nil {
			break
		}
	}
	out := &RedisInfo{}
	text := string(reader)
	for _, line := range strings.Split(text, "\r\n") {
		kv := strings.SplitN(line, ":", 2)
		if len(kv) != 2 {
			continue
		}
		switch kv[0] {
		case "used_memory":
			out.UsedBytes, _ = strconv.ParseInt(kv[1], 10, 64)
		case "used_memory_peak":
			out.PeakBytes, _ = strconv.ParseInt(kv[1], 10, 64)
		case "connected_clients":
			out.ConnectedClients, _ = strconv.ParseInt(kv[1], 10, 64)
		}
	}
	return out, nil
}

func indexCRLF(b []byte) int {
	for i := 0; i+1 < len(b); i++ {
		if b[i] == '\r' && b[i+1] == '\n' {
			return i
		}
	}
	return -1
}

// ── Local generator kernel environment ──────────────────────────────────

// SourcePortEvidence records the generator namespace ephemeral-port situation.
type SourcePortEvidence struct {
	IPLocalPortRangeLow        int   `json:"ip_local_port_range_low"`
	IPLocalPortRangeHigh       int   `json:"ip_local_port_range_high"`
	RangeSize                  int   `json:"range_size"`
	SteadyViewerSockets        int   `json:"steady_viewer_sockets"`
	ReconnectTIMEWaitAllowance int   `json:"reconnect_timewait_allowance"`
	ControlSockets             int   `json:"control_sockets"`
	SafetyMargin               int   `json:"safety_margin"`
	FreePorts                  int   `json:"free_ports"`
	HeadroomValid              bool  `json:"headroom_valid"`
	FdSoftLimit                int64 `json:"fd_soft_limit"`
	FdHardLimit                int64 `json:"fd_hard_limit"`
}

// ReadSourcePortRange parses /proc/sys/net/ipv4/ip_local_port_range.
func ReadSourcePortRange() (low, high int, err error) {
	data, err := os.ReadFile("/proc/sys/net/ipv4/ip_local_port_range")
	if err != nil {
		return 0, 0, err
	}
	parts := strings.Fields(string(data))
	if len(parts) < 2 {
		return 0, 0, fmt.Errorf("malformed ip_local_port_range: %q", data)
	}
	low, err = strconv.Atoi(parts[0])
	if err != nil {
		return 0, 0, err
	}
	high, err = strconv.Atoi(parts[1])
	if err != nil {
		return 0, 0, err
	}
	return low, high, nil
}

// ReadFdlimit returns this process's RLIMIT_NOFILE soft/hard values.
func ReadFdlimit() (soft, hard int64, err error) {
	data, err := os.ReadFile("/proc/self/limits")
	if err != nil {
		return 0, 0, err
	}
	for _, line := range strings.Split(string(data), "\n") {
		if strings.HasPrefix(line, "Max open files") {
			fields := strings.Fields(line)
			// "Max open files  <soft>  <hard>"
			if len(fields) >= 6 {
				s, e1 := strconv.ParseInt(fields[3], 10, 64)
				h, e2 := strconv.ParseInt(fields[4], 10, 64)
				if e1 == nil && e2 == nil {
					return s, h, nil
				}
			}
		}
	}
	return 0, 0, fmt.Errorf("Max open files not found in /proc/self/limits")
}

// BuildSourcePortEvidence reads the live kernel/FD environment and applies
// computeSourcePortEvidence.
func BuildSourcePortEvidence(steadyViewers int) (*SourcePortEvidence, error) {
	low, high, err := ReadSourcePortRange()
	if err != nil {
		return nil, err
	}
	fdSoft, fdHard, err := ReadFdlimit()
	if err != nil {
		return nil, err
	}
	return ComputeSourcePortEvidence(low, high, fdSoft, fdHard, steadyViewers), nil
}

// ComputeSourcePortEvidence is the pure frozen headroom accounting model
// (contract v2.2.0 §source-ports):
//
//	free = rangeSize - steady - reconnectTIME_WAIT(10% of steady, min 2500)
//	       - control(64) - safety(512)
//	valid ⇔ free ≥ 4000 AND fdSoft ≥ steady*1.35
func ComputeSourcePortEvidence(low, high int, fdSoft, fdHard int64, steadyViewers int) *SourcePortEvidence {
	timewait := steadyViewers / 10
	if timewait < 2500 {
		timewait = 2500
	}
	ev := &SourcePortEvidence{
		IPLocalPortRangeLow:        low,
		IPLocalPortRangeHigh:       high,
		RangeSize:                  high - low + 1,
		SteadyViewerSockets:        steadyViewers,
		ReconnectTIMEWaitAllowance: timewait,
		ControlSockets:             64,
		SafetyMargin:               512,
		FdSoftLimit:                fdSoft,
		FdHardLimit:                fdHard,
	}
	ev.FreePorts = ev.RangeSize - steadyViewers - timewait - ev.ControlSockets - ev.SafetyMargin
	ev.HeadroomValid = ev.FreePorts >= 4000 && fdSoft >= int64(float64(steadyViewers)*1.35)
	return ev
}
