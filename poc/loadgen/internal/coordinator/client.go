// Package coordinator speaks the EXISTING TypeScript global-coordinator HTTP
// protocol (/v1/register, /v1/barrier, /v1/result, /v1/abort) so there remains
// exactly one canonical machine verdict path (contract v2.2.0 §verdict).
package coordinator

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

// Phases mirrors COORDINATED_PHASES in the v2.2.0 coordinator (slow-consumer
// removed by the pre-freeze gate audit). Order is load-bearing: a shard may
// never skip an earlier boundary.
var Phases = []string{
	"preflight",
	"warmup",
	"steady",
	"surge",
	"target-barrier",
	"stabilization",
	"late-join",
	"burst",
	"post-burst",
	"reconnect",
	"restart-replacement",
	"final-metrics",
}

type Registration struct {
	CampaignID     string `json:"campaign_id"`
	ShardID        int    `json:"shard_id"`
	ShardCount     int    `json:"shard_count"`
	LocalTarget    int    `json:"local_target"`
	GlobalTarget   int    `json:"global_target"`
	Seed           int    `json:"seed"`
	SourceCommit   string `json:"source_commit"`
	PublisherOwner bool   `json:"publisher_owner"`
}

type BarrierReceipt struct {
	ExperimentRunID      string `json:"experiment_run_id"`
	Phase                string `json:"phase"`
	Boundary             string `json:"boundary"`
	ReleasedAtMs         int64  `json:"released_at_ms"`
	ParticipatingShardIDs []int `json:"participating_shard_ids"`
}

type AlignedSample struct {
	TimestampMs            int64  `json:"timestamp_ms"`
	Phase                  string `json:"phase"`
	ActiveCurrent          int64  `json:"active_current"`
	ConnectionsAttempted   int64  `json:"connections_attempted"`
	ConnectionsEstablished int64  `json:"connections_established"`
	ConnectionFailures     int64  `json:"connection_failures"`
}

// Client is one shard's view of the shared coordinator.
type Client struct {
	baseURL         string
	reg             Registration
	http            *http.Client
	ExperimentRunID string

	mu        sync.Mutex
	samples   []AlignedSample
	curPhase  string
	stopSampler chan struct{}
}

func NewClient(baseURL string, reg Registration) *Client {
	return &Client{
		baseURL: baseURL,
		reg:     reg,
		http:    &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *Client) post(path string, body any, timeout time.Duration, out any) error {
	payload, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodPost, c.baseURL+path, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("content-type", "application/json")
	client := *c.http
	client.Timeout = timeout
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	buf := new(bytes.Buffer)
	if _, err := buf.ReadFrom(resp.Body); err != nil {
		return err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("coordinator %d: %s", resp.StatusCode, buf.String())
	}
	if out != nil {
		return json.Unmarshal(buf.Bytes(), out)
	}
	return nil
}

// Register registers this shard; returns the authoritative run identity.
func (c *Client) Register() (runID string, err error) {
	var out struct {
		ExperimentRunID string `json:"experiment_run_id"`
		Seed            int    `json:"seed"`
		GlobalTarget    int    `json:"global_target"`
	}
	err = c.post("/v1/register", c.reg, 10*time.Second, &out)
	c.ExperimentRunID = out.ExperimentRunID
	return out.ExperimentRunID, err
}

// Barrier arrives at one phase boundary and blocks until all shards release.
func (c *Client) Barrier(phase, boundary string) (*BarrierReceipt, error) {
	body := map[string]any{
		"experiment_run_id": c.ExperimentRunID,
		"shard_id":          c.reg.ShardID,
		"phase":             phase,
		"boundary":          boundary,
	}
	var receipt BarrierReceipt
	// Barriers legitimately wait for every other shard; give them 11 minutes.
	if err := c.post("/v1/barrier", body, 11*time.Minute, &receipt); err != nil {
		return nil, err
	}
	c.mu.Lock()
	c.curPhase = phase
	c.mu.Unlock()
	return &receipt, nil
}

// StartSampling captures aligned population samples every interval until Stop.
func (c *Client) StartSampling(interval time.Duration, read func() (int64, int64, int64, int64)) {
	c.stopSampler = make(chan struct{})
	c.mu.Lock()
	c.curPhase = "preflight"
	c.mu.Unlock()
	capture := func() {
		active, attempted, established, failures := read()
		c.mu.Lock()
		c.samples = append(c.samples, AlignedSample{
			TimestampMs:            time.Now().UnixMilli(),
			Phase:                  c.curPhase,
			ActiveCurrent:          active,
			ConnectionsAttempted:   attempted,
			ConnectionsEstablished: established,
			ConnectionFailures:     failures,
		})
		c.mu.Unlock()
	}
	capture()
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				capture()
			case <-c.stopSampler:
				return
			}
		}
	}()
}

// StopSampling drains collected samples.
func (c *Client) StopSampling() []AlignedSample {
	if c.stopSampler != nil {
		close(c.stopSampler)
		c.stopSampler = nil
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	out := c.samples
	c.samples = nil
	return out
}

// SubmitResult hands the finished shard result to the canonical classifier.
func (c *Client) SubmitResult(result any) error {
	return c.post("/v1/result", result, 60*time.Second, nil)
}

// Abort signals experiment invalidity (never a DUT verdict) to the coordinator.
func (c *Client) Abort(reason string) {
	body := map[string]any{"shard_id": c.reg.ShardID, "reason": reason}
	_ = c.post("/v1/abort", body, 5*time.Second, nil)
}
