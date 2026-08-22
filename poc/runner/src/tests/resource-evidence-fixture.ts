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
