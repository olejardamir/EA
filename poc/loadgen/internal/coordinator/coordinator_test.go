package coordinator

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestPhasesOrderIsLoadBearing(t *testing.T) {
	want := []string{
		"preflight", "warmup", "steady", "surge", "target-barrier",
		"stabilization", "late-join", "burst", "post-burst",
		"reconnect", "restart-replacement", "final-metrics",
	}
	if len(Phases) != len(want) {
		t.Fatalf("phase count %d, want %d", len(Phases), len(want))
	}
	for i := range want {
		if Phases[i] != want[i] {
			t.Fatalf("Phases[%d] = %q, want %q (order is frozen)", i, Phases[i], want[i])
		}
	}
	seen := map[string]bool{}
	for _, p := range Phases {
		if seen[p] {
			t.Fatalf("duplicate phase %q", p)
		}
		seen[p] = true
	}
}

func TestContractVersionMatchesGoResultSchema(t *testing.T) {
	if ContractVersion != "v2.3.0" {
		t.Fatalf("ContractVersion = %q", ContractVersion)
	}
	res := ShardExperimentResult{ContractVersion: ContractVersion}
	b, _ := json.Marshal(res)
	if !strings.Contains(string(b), `"contract_version":"v2.3.0"`) {
		t.Fatal("wire field contract_version missing or wrong")
	}
}

func newTestClient(t *testing.T, handler http.HandlerFunc) (*Client, *httptest.Server) {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	return NewClient(srv.URL, Registration{
		CampaignID: "camp-test", ShardID: 2, ShardCount: 4,
		LocalTarget: 25000, GlobalTarget: 100000, Seed: 42,
		SourceCommit: strings.Repeat("a", 40), PublisherOwner: false,
	}), srv
}

func TestRegisterStoresRunIdentity(t *testing.T) {
	var gotBody map[string]any
	c, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/register" {
			t.Errorf("path = %q", r.URL.Path)
		}
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		_, _ = w.Write([]byte(`{"experiment_run_id":"run-xyz","seed":42,"global_target":100000}`))
	})
	runID, err := c.Register()
	if err != nil || runID != "run-xyz" || c.ExperimentRunID != "run-xyz" {
		t.Fatalf("Register = (%q,%v)", runID, err)
	}
	if gotBody["shard_id"].(float64) != 2 || gotBody["campaign_id"] != "camp-test" {
		t.Errorf("registration body wrong: %+v", gotBody)
	}
}

func TestBarrierPostsIdentityAndReturnsReceipt(t *testing.T) {
	var mu sync.Mutex
	var got map[string]any
	c, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		_ = json.NewDecoder(r.Body).Decode(&got)
		mu.Unlock()
		_, _ = w.Write([]byte(`{"experiment_run_id":"run-xyz","phase":"warmup","boundary":"start","released_at_ms":123,"participating_shard_ids":[0,1,2,3]}`))
	})
	c.ExperimentRunID = "run-xyz"
	rcpt, err := c.Barrier("warmup", "start")
	if err != nil {
		t.Fatal(err)
	}
	mu.Lock()
	defer mu.Unlock()
	if got["experiment_run_id"] != "run-xyz" || got["phase"] != "warmup" || got["boundary"] != "start" {
		t.Errorf("barrier body wrong: %+v", got)
	}
	if rcpt.ReleasedAtMs != 123 || len(rcpt.ParticipatingShardIDs) != 4 {
		t.Errorf("receipt wrong: %+v", rcpt)
	}
}

func TestSubmitResultAndErrorPropagation(t *testing.T) {
	status := http.StatusOK
	c, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(status)
	})
	if err := c.SubmitResult(map[string]any{"verdict": "ACCEPT"}); err != nil {
		t.Fatalf("submit on 200 failed: %v", err)
	}
	status = http.StatusConflict
	err := c.SubmitResult(map[string]any{})
	if err == nil || !strings.Contains(err.Error(), "409") {
		t.Fatalf("non-2xx must surface status, got %v", err)
	}
}

func TestSamplingLifecycle(t *testing.T) {
	c, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {})
	var attempted int64
	c.StartSampling(20*time.Millisecond, func() (int64, int64, int64, int64) {
		attempted += 10
		return 5, attempted, 4, 0
	})
	time.Sleep(120 * time.Millisecond)
	samples := c.StopSampling()
	if len(samples) < 2 {
		t.Fatalf("expected multiple samples, got %d", len(samples))
	}
	if samples[0].Phase != "preflight" {
		t.Errorf("first sample phase = %q", samples[0].Phase)
	}
	last := samples[len(samples)-1]
	if last.ConnectionsAttempted <= samples[0].ConnectionsAttempted {
		t.Errorf("attempted counter not monotonic: %+v", samples)
	}
	// drain is final: a second stop returns empty
	if again := c.StopSampling(); len(again) != 0 {
		t.Errorf("second StopSampling returned %d samples", len(again))
	}
}

func TestAbortSwallowsTransportErrors(t *testing.T) {
	c, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	})
	c.Abort("boom") // must not panic; abort is best-effort by contract
}

// TestResultSchemaWireRoundTrip pins the exact wire shape the TypeScript
// coordinator validates strictly: histogram tuples stay arrays-of-pairs,
// verdicts are the closed enum, and every mandatory identity field survives
// a JSON round trip.
func TestResultSchemaWireRoundTrip(t *testing.T) {
	res := ShardExperimentResult{
		ContractVersion:            ContractVersion,
		AggregateScope:             "shard",
		Scope:                      "shard",
		GlobalDirectAcceptEligible: true,
		ExperimentRunID:            "run-1",
		CampaignID:                 "camp-1",
		RunIndex:                   1,
		ShardID:                    3,
		ShardCount:                 4,
		LocalTarget:                25000,
		GlobalTarget:               100000,
		Seed:                       43,
		SourceCommit:               strings.Repeat("b", 40),
		PublisherOwner:             true,
		Verdict:                    VerdictAccept,
		Histograms: struct {
			FanOut      HistogramWire `json:"fan_out"`
			GoalFanOut  HistogramWire `json:"goal_fan_out"`
			OtherFanOut HistogramWire `json:"other_fan_out"`
			LateJoin    HistogramWire `json:"late_join"`
			Burst       HistogramWire `json:"burst"`
			Surge       HistogramWire `json:"surge_fan_out,omitempty"`
		}{
			FanOut: HistogramWire{
				MaxMs: 30000, TotalCount: 3,
				Buckets: [][2]int64{{12, 2}, {3400, 1}},
			},
		},
		CorrectnessCounters: map[string]float64{"missing_sequences": 0},
		Samples: []AlignedSample{{
			TimestampMs: 1724200000000, Phase: "warmup", ActiveCurrent: 25000,
		}},
		Scenarios: []ScenarioEvidence{{
			Name: "late-join", Participated: true, Passed: true,
			Structured: map[string]any{"probes_passed": 8},
		}},
	}
	b, err := json.Marshal(res)
	if err != nil {
		t.Fatal(err)
	}
	var back ShardExperimentResult
	if err := json.Unmarshal(b, &back); err != nil {
		t.Fatal(err)
	}
	if back.Verdict != VerdictAccept || back.ShardID != 3 || back.Seed != 43 {
		t.Fatalf("identity round trip lost: %+v", back)
	}
	if len(back.Histograms.FanOut.Buckets) != 2 || back.Histograms.FanOut.Buckets[0][0] != 12 {
		t.Fatalf("tuple buckets broken: %+v", back.Histograms.FanOut.Buckets)
	}
	for _, key := range []string{
		`"contract_version":"v2.3.0"`, `"aggregate_scope":"shard"`,
		`"verdict":"ACCEPT"`, `"experiment_run_id":"run-1"`, `"publisher_owner":true`,
	} {
		if !strings.Contains(string(b), key) {
			t.Errorf("mandatory wire key missing: %s", key)
		}
	}
}

func TestVerdictEnumValues(t *testing.T) {
	for v, want := range map[Verdict]string{
		VerdictAccept:        "ACCEPT",
		VerdictReject:        "REJECT",
		VerdictInconclusive:  "INCONCLUSIVE",
		VerdictNotApplicable: "NOT_APPLICABLE",
	} {
		if string(v) != want {
			t.Errorf("verdict %q != %q", v, want)
		}
	}
}
