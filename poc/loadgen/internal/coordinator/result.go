package coordinator

// ShardExperimentResult mirrors the TypeScript ShardExperimentResult interface
// (global-coordinator.ts) at contract v2.2.0. This is the adapter/schema
// boundary for Go shard results: field names and shapes are load-bearing —
// the coordinator validates them strictly.

type Verdict string

const (
	VerdictAccept        Verdict = "ACCEPT"
	VerdictReject        Verdict = "REJECT"
	VerdictInconclusive  Verdict = "INCONCLUSIVE"
	VerdictNotApplicable Verdict = "NOT_APPLICABLE"
)

type Validity struct {
	GeneratorValid           bool     `json:"generator_valid"`
	SourcePortHeadroomValid  bool     `json:"source_port_headroom_valid"`
	NginxWorkerCapacityValid bool     `json:"nginx_worker_capacity_valid"`
	EnvironmentValid         bool     `json:"environment_valid"`
	TimingValid              bool     `json:"timing_valid"`
	Reasons                  []string `json:"reasons"`
}

type HistogramWire struct {
	MaxMs         int        `json:"max_ms"`
	TotalCount    int64      `json:"total_count"`
	OverflowCount int64      `json:"overflow_count"`
	Buckets       [][2]int64 `json:"buckets"` // sparse [ms,count] pairs, TS tuple shape
}

type ScenarioEvidence struct {
	Name         string         `json:"name"`
	Participated bool           `json:"participated"`
	Passed       bool           `json:"passed"`
	Detail       string         `json:"detail"`
	Structured   map[string]any `json:"structured,omitempty"`
}

type ShardExperimentResult struct {
	ContractVersion            string `json:"contract_version"`
	AggregateScope             string `json:"aggregate_scope"`
	Scope                      string `json:"scope"`
	GlobalDirectAcceptEligible bool   `json:"global_direct_accept_eligible"`

	ExperimentRunID string `json:"experiment_run_id"`
	CampaignID      string `json:"campaign_id"`
	RunIndex        int    `json:"run_index"`
	ShardID         int    `json:"shard_id"`
	ShardCount      int    `json:"shard_count"`
	LocalTarget     int    `json:"local_target"`
	GlobalTarget    int    `json:"global_target"`
	Seed            int    `json:"seed"`
	SourceCommit    string `json:"source_commit"`
	PublisherOwner  bool   `json:"publisher_owner"`

	Verdict    Verdict         `json:"verdict"`
	Validity   Validity        `json:"validity"`
	Samples    []AlignedSample `json:"samples"`
	Histograms struct {
		FanOut      HistogramWire `json:"fan_out"`
		GoalFanOut  HistogramWire `json:"goal_fan_out"`
		OtherFanOut HistogramWire `json:"other_fan_out"`
		LateJoin    HistogramWire `json:"late_join"`
		Burst       HistogramWire `json:"burst"`
	} `json:"histograms"`
	CorrectnessCounters map[string]float64 `json:"correctness_counters"`
	Workload            struct {
		EventsPublished int64 `json:"events_published"`
		PhaseRates      []struct {
			Phase           string  `json:"phase"`
			AttemptedPerSec float64 `json:"attempted_per_sec"`
			AcceptedPerSec  float64 `json:"accepted_per_sec"`
		} `json:"phase_rates"`
	} `json:"workload"`
	Resources struct {
		Generator map[string]any `json:"generator"`
		Nchan     map[string]any `json:"nchan"`
		Redis     map[string]any `json:"redis"`
		Spare     map[string]any `json:"spare,omitempty"`
	} `json:"resources"`
	Scenarios []ScenarioEvidence `json:"scenarios"`
}

// ContractVersion is the single canonical producer of the active contract
// version on the Go side; it must equal ACTIVE_CONTRACT_VERSION in TS.
const ContractVersion = "v2.2.0"
