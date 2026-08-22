// Package publisher is the Go-side client of the lightweight TypeScript
// publisher/control service. It forms the EXPECTED side of the frozen
// expected/observed boundary: canonical heads and state are fetched over HTTP
// from a service that never reads generator state; the OBSERVED side is the
// SSE wire itself.
package publisher

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type HeadState struct {
	Score struct {
		Home int `json:"home"`
		Away int `json:"away"`
	} `json:"score"`
	Clock struct {
		Period         string `json:"period"`
		ElapsedSeconds int    `json:"elapsed_seconds"`
	} `json:"clock"`
}

// Evidence is the /v1/evidence response: independent canonical expectation.
type Evidence struct {
	Started bool                `json:"started"`
	Heads   map[string]HeadInfo `json:"heads"`
	Totals  struct {
		Published      int64 `json:"published"`
		Attempts       int64 `json:"attempts"`
		DefiniteFails  int64 `json:"definite_failures"`
		AmbiguousFails int64 `json:"ambiguous_failures"`
		PendingPeak    int64 `json:"pending_peak"`
	} `json:"totals"`
	BurstActive bool  `json:"burst_active"`
	FetchedAtMs int64 `json:"fetched_at_ms"`
	// Optional R11 diagnostics (absent in older publishers; never gated).
	SchedulerLagP95Ms float64 `json:"scheduler_lag_p95_ms,omitempty"`
	SchedulerLagMaxMs float64 `json:"scheduler_lag_max_ms,omitempty"`
	LoopLagP95Ms      float64 `json:"loop_lag_p95_ms,omitempty"`
	LoopLagMaxMs      float64 `json:"loop_lag_max_ms,omitempty"`
}

type HeadInfo struct {
	Seq       int64     `json:"seq"`
	State     HeadState `json:"state"`
	LastEvent string    `json:"last_event_type"`
}

type Client struct {
	base string
	http *http.Client
}

func New(base string) *Client {
	return &Client{base: base, http: &http.Client{Timeout: 15 * time.Second}}
}

func (c *Client) do(ctx context.Context, method, path string, body any, out any) error {
	var reader *bytes.Reader
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(payload)
	} else {
		reader = bytes.NewReader(nil)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.base+path, reader)
	if err != nil {
		return err
	}
	if body != nil {
		req.Header.Set("content-type", "application/json")
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	buf := new(bytes.Buffer)
	if _, err := buf.ReadFrom(resp.Body); err != nil {
		return err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("publisher %s -> %d: %s", path, resp.StatusCode, buf.String())
	}
	if out != nil && buf.Len() > 0 {
		return json.Unmarshal(buf.Bytes(), out)
	}
	return nil
}

// Reset clears retained Redis history for run isolation (owner shard, preflight).
func (c *Client) Reset(ctx context.Context) error {
	return c.do(ctx, http.MethodPost, "/v1/reset", map[string]any{}, nil)
}

// Start begins steady publication (~9 match events/s + 1 lobby/s).
func (c *Client) Start(ctx context.Context) error {
	return c.do(ctx, http.MethodPost, "/v1/start", map[string]any{}, nil)
}

// Stop halts publication.
func (c *Client) Stop(ctx context.Context) error {
	return c.do(ctx, http.MethodPost, "/v1/stop", map[string]any{}, nil)
}

// Prefill publishes an exact serialized range of one event type to one match —
// the frozen-range producer for restart probes (owner shard only).
func (c *Client) Prefill(ctx context.Context, matchID string, count int, eventType string) (*PrefillResult, error) {
	var out PrefillResult
	err := c.do(ctx, http.MethodPost, "/v1/prefill", map[string]any{
		"match_id": matchID, "count": count, "event_type": eventType,
	}, &out)
	return &out, err
}

type PrefillResult struct {
	Published int64 `json:"published"`
	FirstSeq  int64 `json:"first_seq"`
	LastSeq   int64 `json:"last_seq"`
}

// Burst switches the publisher to burst rate for the given duration.
func (c *Client) Burst(ctx context.Context, seconds int) error {
	return c.do(ctx, http.MethodPost, "/v1/burst", map[string]any{"seconds": seconds}, nil)
}

// Evidence fetches the current canonical heads/state/counters.
func (c *Client) Evidence(ctx context.Context) (*Evidence, error) {
	var out Evidence
	err := c.do(ctx, http.MethodGet, "/v1/evidence", nil, &out)
	return &out, err
}

// WaitForStarted polls until the publisher reports it has begun publishing.
func (c *Client) WaitForStarted(ctx context.Context, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		ev, err := c.Evidence(ctx)
		if err == nil && ev.Started && ev.Totals.Published > 0 {
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(500 * time.Millisecond):
		}
	}
	return fmt.Errorf("publisher did not start within %s", timeout)
}
