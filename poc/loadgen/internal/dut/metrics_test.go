package dut

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestGetControlMetricsParsesPointers(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/metrics" {
			t.Errorf("path = %q", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"memory_current_bytes":123,"memory_peak_bytes":456,
			"cpu_usage_usec":789,"cpu_throttled_count":0,"cpu_throttled_usec":0,
			"memory_oom_events":null}`))
	}))
	defer srv.Close()
	m, err := GetControlMetrics(context.Background(), srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	if *m.MemoryCurrentBytes != 123 || *m.MemoryPeakBytes != 456 || *m.CpuUsageUsec != 789 {
		t.Fatalf("values wrong: %+v", m)
	}
	if m.MemoryOomEvents != nil {
		t.Fatalf("JSON null must stay nil: %+v", m.MemoryOomEvents)
	}
}

func TestPreflightPartitionSendsTarget(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/preflight") || !strings.Contains(r.URL.RawQuery, "target=25000") {
			t.Errorf("request = %s?%s", r.URL.Path, r.URL.RawQuery)
		}
		_, _ = w.Write([]byte(`{"sufficient":true,"reason":null,"usable_sse_capacity":60000,
			"nginx_worker_fd_soft":200000,"nginx_worker_fd_hard":400000,"cpu_quota":12}`))
	}))
	defer srv.Close()
	pf, err := PreflightPartition(context.Background(), srv.URL, 25000)
	if err != nil {
		t.Fatal(err)
	}
	if !pf.Sufficient || *pf.UsableSSECapacity != 60000 || *pf.CpuQuota != 12 {
		t.Fatalf("preflight wrong: %+v", pf)
	}
}

func TestHealthCheckAndRestartStatusHandling(t *testing.T) {
	ok := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && r.URL.Path == "/restart" {
			w.WriteHeader(http.StatusOK)
			return
		}
		if r.URL.Path != "/pub/healthcheck" {
			t.Errorf("healthcheck path = %q", r.URL.Path)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer ok.Close()
	ctx := context.Background()
	if err := HealthCheck(ctx, ok.URL+"/"); err != nil { // trailing slash must be trimmed
		t.Fatalf("healthcheck: %v", err)
	}
	if err := Restart(ctx, ok.URL); err != nil {
		t.Fatalf("restart: %v", err)
	}

	bad := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer bad.Close()
	if err := HealthCheck(ctx, bad.URL); err == nil {
		t.Error("503 healthcheck must fail")
	}
}

func TestComputeSourcePortEvidenceFrozenModel(t *testing.T) {
	cases := []struct {
		name           string
		low, high      int
		fdSoft, fdHard int64
		steady         int
		wantTimewait   int
		wantFree       int
	}{
		// Default Linux ephemeral range [32768,60999] = 28232 ports:
		// 25k steady viewers leave only 156 free -> invalid without sysctl expansion.
		{"default narrow range fails at shard scale", 32768, 60999, 1048576, 1048576, 25000, 2500, 156},
		// Expanded range [1024,65535] = 64512 ports: 64512-25000-2500-64-512 = 36436.
		{"expanded range passes at shard scale", 1024, 65535, 1048576, 1048576, 25000, 2500, 36436},
		{"tiny steady keeps timewait floor", 1024, 65535, 4096, 4096, 100, 2500, 61336},
		{"fd floor violated below 1.35x", 1024, 65535, 33749, 33749, 25000, 2500, 36436},
		{"fd exactly at 1.35x passes", 1024, 65535, 33750, 33750, 25000, 2500, 36436},
		{"range too small goes negative and invalid", 32768, 36000, 999999, 999999, 3000, 2500, -2843},
	}
	for _, tc := range cases {
		ev := ComputeSourcePortEvidence(tc.low, tc.high, tc.fdSoft, tc.fdHard, tc.steady)
		if ev.RangeSize != tc.high-tc.low+1 {
			t.Errorf("%s: range size %d", tc.name, ev.RangeSize)
		}
		if ev.ReconnectTIMEWaitAllowance != tc.wantTimewait {
			t.Errorf("%s: timewait %d, want %d", tc.name, ev.ReconnectTIMEWaitAllowance, tc.wantTimewait)
		}
		if ev.FreePorts != tc.wantFree {
			t.Errorf("%s: free %d, want %d", tc.name, ev.FreePorts, tc.wantFree)
		}
		wantValid := tc.wantFree >= 4000 && float64(tc.fdSoft) >= float64(tc.steady)*1.35
		if ev.HeadroomValid != wantValid {
			t.Errorf("%s: valid=%v, want %v (free=%d fdSoft=%d)", tc.name, ev.HeadroomValid, wantValid, ev.FreePorts, ev.FdSoftLimit)
		}
	}
}

func TestReadSourcePortRangeAndFdlimitLive(t *testing.T) {
	low, high, err := ReadSourcePortRange()
	if err != nil {
		t.Skipf("no /proc source-port range on this host: %v", err)
	}
	if low <= 0 || high <= low || high > 65535 {
		t.Fatalf("implausible range [%d,%d]", low, high)
	}
	soft, hard, err := ReadFdlimit()
	if err != nil {
		t.Skipf("no /proc/self/limits here: %v", err)
	}
	if soft < 1024 || hard < soft {
		t.Fatalf("implausible fd limits soft=%d hard=%d", soft, hard)
	}
}

func TestQueryRedisInfoMinimalRESP(t *testing.T) {
	infoBody := "# Server\r\nredis_version:7.2.0\r\nused_memory:111222333\r\nused_memory_peak:444555666\r\nconnected_clients:42\r\n"
	resp := "$" + itoa(len(infoBody)) + "\r\n" + infoBody + "\r\n"
	srv, addr := fakeRESPServer(t, resp)
	defer srv.Close()
	got, err := QueryRedisInfo(context.Background(), addr)
	if err != nil {
		t.Fatal(err)
	}
	if got.UsedBytes != 111222333 || got.PeakBytes != 444555666 || got.ConnectedClients != 42 {
		t.Fatalf("parsed info wrong: %+v", got)
	}
}

// fakeRESPServer answers one request with a canned bulk string then closes.
func fakeRESPServer(t *testing.T, reply string) (net.Listener, string) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan struct{})
	go func() {
		defer close(done)
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		buf := make([]byte, 512)
		_, _ = conn.Read(buf)
		_, _ = conn.Write([]byte(reply))
		_ = conn.Close()
	}()
	t.Cleanup(func() { _ = ln.Close(); <-done })
	return ln, ln.Addr().String()
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}
