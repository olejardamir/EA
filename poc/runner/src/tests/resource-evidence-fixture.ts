// R12 resource-evidence fixture: structured phase-spanning DUT snapshots and
// complete Redis evidence matching the production wire shape exposed by the Go
// loadgen under resources.generator.resource_stages / resources.redis.
export function validResourceStages(): Record<string, unknown> {
  const snap = (): Record<string, number> => ({
    memory_current_bytes: 1024,
    memory_peak_bytes: 2048,
    cpu_usage_usec: 5000,
    cpu_throttled_count: 0,
    cpu_throttled_usec: 0,
    memory_oom_events: 0,
    oom_kill_events: 0,
  })
  const partition: Record<string, unknown> = {}
  for (const stage of [
    "baseline", "post_steady", "post_surge", "post_burst",
    "post_reconnect", "post_restart", "final",
  ]) {
    partition[stage] = snap()
  }
  return {
    partition_stages: partition,
    spare_stages: {
      post_restart: snap(),
      final: snap(),
    },
    worker_topology: {},
    reject_reasons: [],
  }
}

export function validRedisEvidence(): Record<string, number | null> {
  return {
    memory_used_bytes: 500,
    memory_peak_bytes: 900,
    connected_clients: 8,
  }
}

// R14: explicit deep-cohort head-agreement account (256 per shard).
export function validDeepAgreement(): Record<string, unknown> {
  return { expected: 256, agreed: 256, disagreed: 0, unmatched: 0 }
}

// R15: every mandatory terminal-gated correctness field present at zero.
export function validCorrectnessCounters(): Record<string, number> {
  const keys = [
    "missing_sequences", "duplicates", "out_of_order",
    "missing_transport_id", "missing_canonical_seq", "canonical_seq_parse_errors",
    "schema_validation_errors", "json_parse_errors", "invalid_timestamp_count",
    "state_violations", "canonical_payload_state_violations", "lobby_malformed",
    "reconnect_gaps", "reconnect_duplicates", "reconnect_order_violations",
    "reconnect_missing_raw_id",
    "restart_failover_gaps", "restart_failover_duplicates", "restart_failover_order_violations",
    "restart_failover_connection_failures", "restart_failover_unexpected_disconnects",
    "surge_missing_sequences", "surge_duplicates", "surge_out_of_order", "surge_unexpected_disconnects",
    "connection_failures", "unexpected_disconnects",
    "agreement_violations", "state_agreement_violations",
    "deep_unmatched",
  ]
  return Object.fromEntries(keys.map((key) => [key, 0]))
}
