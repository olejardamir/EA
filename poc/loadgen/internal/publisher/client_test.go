package publisher

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func newServer(t *testing.T, status int, body string, seen *map[string]string) *Client {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if seen != nil {
			m := *seen
			payload := ""
			if r.Body != nil {
				buf := make([]byte, 512)
				n, _ := r.Body.Read(buf)
				payload = string(buf[:n])
			}
			m[r.Method+" "+r.URL.Path] = payload
		}
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	return New(srv.URL)
}

func TestControlPathsAndPayloads(t *testing.T) {
	seen := map[string]string{}
	c := newServer(t, http.StatusOK, `{}`, &seen)
	ctx := context.Background()
	if err := c.Reset(ctx); err != nil {
		t.Fatalf("reset: %v", err)
	}
	if err := c.Start(ctx); err != nil {
		t.Fatalf("start: %v", err)
	}
	if err := c.Stop(ctx); err != nil {
		t.Fatalf("stop: %v", err)
	}
	for _, path := range []string{"/v1/reset", "/v1/start", "/v1/stop"} {
		key := "POST " + path
		if _, ok := seen[key]; !ok {
			t.Errorf("missing call %s (seen=%v)", key, seen)
		}
	}
}

func TestBurstSendsSeconds(t *testing.T) {
	seen := map[string]string{}
	c := newServer(t, http.StatusOK, `{}`, &seen)
	if err := c.Burst(context.Background(), 17); err != nil {
		t.Fatal(err)
	}
	body := seen["POST /v1/burst"]
	var got map[string]any
	if err := json.Unmarshal([]byte(body), &got); err != nil || got["seconds"].(float64) != 17 {
		t.Fatalf("burst payload = %q (%v)", body, err)
	}
}

func TestPrefillParsesRange(t *testing.T) {
	c := newServer(t, http.StatusOK, `{"published":24,"first_seq":101,"last_seq":124}`, nil)
	pre, err := c.Prefill(context.Background(), "match_001", 24, "corner")
	if err != nil {
		t.Fatal(err)
	}
	if pre.Published != 24 || pre.FirstSeq != 101 || pre.LastSeq != 124 {
		t.Fatalf("prefill result wrong: %+v", pre)
	}
}

func TestEvidenceParsesHeadsAndTotals(t *testing.T) {
	body := `{
	  "started": true,
	  "heads": {"match_001": {"seq": 55,
	    "state": {"score": {"home": 2, "away": 1}, "clock": {"period": "2H", "elapsed_seconds": 2800}},
	    "last_event_type": "goal"}},
	  "totals": {"published": 9001, "attempts": 9003, "definite_failures": 2,
	             "ambiguous_failures": 0, "pending_peak": 5},
	  "burst_active": false,
	  "fetched_at_ms": 1724200000000
	}`
	c := newServer(t, http.StatusOK, body, nil)
	ev, err := c.Evidence(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if !ev.Started || ev.BurstActive || ev.Totals.Published != 9001 || ev.Totals.DefiniteFails != 2 {
		t.Fatalf("totals/flags wrong: %+v", ev)
	}
	h, ok := ev.Heads["match_001"]
	if !ok || h.Seq != 55 || h.LastEvent != "goal" ||
		h.State.Score.Home != 2 || h.State.Score.Away != 1 ||
		h.State.Clock.Period != "2H" || h.State.Clock.ElapsedSeconds != 2800 {
		t.Fatalf("head wrong: %+v", h)
	}
}

func TestErrorStatusSurfaces(t *testing.T) {
	c := newServer(t, http.StatusServiceUnavailable, `{"err":"down"}`, nil)
	if err := c.Start(context.Background()); err == nil {
		t.Fatal("503 must surface as error")
	} else if !strings.Contains(err.Error(), "503") {
		t.Fatalf("error should carry status: %v", err)
	}
}

func TestWaitForStartedPollsUntilPublished(t *testing.T) {
	var calls int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := atomic.AddInt64(&calls, 1)
		if n < 3 {
			_, _ = w.Write([]byte(`{"started":false,"heads":{},"totals":{"published":0}}`))
			return
		}
		_, _ = w.Write([]byte(`{"started":true,"heads":{"m":{"seq":1}},"totals":{"published":4}}`))
	}))
	defer srv.Close()
	c := New(srv.URL)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := c.WaitForStarted(ctx, 9*time.Second); err != nil {
		t.Fatalf("WaitForStarted failed after %d polls: %v", calls, err)
	}
	if atomic.LoadInt64(&calls) < 3 {
		t.Fatalf("expected >=3 polls, made %d", calls)
	}
}

func TestWaitForStartedHonorsDeadline(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"started":false,"heads":{},"totals":{"published":0}}`))
	}))
	defer srv.Close()
	c := New(srv.URL)
	start := time.Now()
	if err := c.WaitForStarted(context.Background(), 300*time.Millisecond); err == nil {
		t.Fatal("expected timeout error")
	}
	if d := time.Since(start); d < 250*time.Millisecond {
		t.Fatalf("returned before deadline: %s", d)
	}
}
