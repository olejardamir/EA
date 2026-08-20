export interface ResourceSnapshot {
  memoryMbPeak: number
  eventLoopDelayP99Ms: number
  cpuPercentPeak: number
  nchanMemoryMbPeak: number | null
  redisMemoryMbPeak: number | null
  // §AC: cgroup v2 runtime signals (runner)
  cpu_usage_usec: number | null           // cpu.stat usage_usec — total CPU time in microseconds
  cpu_throttled_count: number | null      // cpu.stat nr_throttled — number of times CPU was throttled
  cpu_throttled_usec: number | null       // cpu.stat throttled_usec — total throttled time in microseconds
  memory_current_bytes: number | null     // memory.current — current memory usage in bytes
  memory_peak_bytes: number | null        // memory.peak — peak memory usage (may not exist)
  memory_oom_events: number | null        // memory.events oom — number of OOM events
  memory_oom_kill_events: number | null   // memory.events oom_kill — number of OOM kills
  cpu_max_quota: number | null            // cpu.max — CPU quota in microseconds per period (or "max")
  cpu_max_period: number | null           // §3.8: cpu.max period in microseconds (typically 100000)
  memory_max_bytes: number | null         // memory.max — memory limit in bytes (or "max")
  // §4.9: Nchan container resource metrics
  nchan_cpu_usage_usec: number | null
  nchan_cpu_throttled_count: number | null
  nchan_cpu_throttled_usec: number | null
  nchan_memory_current_bytes: number | null
  nchan_memory_peak_bytes: number | null
  // cgroup memory.peak is retained separately because it spans the container
  // lifetime; nchan_memory_peak_bytes is the sampled peak for this run only.
  nchan_memory_container_lifetime_peak_bytes?: number | null
  nchan_memory_oom_events: number | null
  nchan_memory_oom_kill_events: number | null
  // §4.9: Redis connected-client peak
  redis_connected_clients_peak: number | null
  // §3.8: Nchan CPU percent peak (derived from cumulative cpu_usage_usec delta)
  nchan_cpu_percent_peak: number | null
  // §3.8: Redis CPU percent peak (derived from used_cpu_sys + used_cpu_user delta)
  redis_cpu_percent_peak: number | null
  // §3.8: Per-service CPU quotas — each service needs its own denominator for normalization
  nchan_cpu_max_quota: number | null  // Nchan container cpu.max quota (microseconds per period)
  redis_cpu_max_quota: number | null  // Redis container cpu.max quota (microseconds per period)
  nchan_cpu_max_period: number | null
  redis_cpu_max_period: number | null
  runner_cpuset_effective_cpus: number | null
  nchan_cpuset_effective_cpus: number | null
  redis_cpuset_effective_cpus: number | null
  // §3.8: CPU nanoseconds — derived from cpu_ms * 1_000_000
  cpu_ns: bigint | null
  // §3.8: Thread count from cgroup.threads (null if unavailable)
  thread_count: number | null
}

export interface NginxPreflight {
  worker_processes: number | null
  worker_connections: number | null
  nginx_active: number | null
  nginx_master_pid: number | null
  nginx_worker_pids: number[]
  nginx_master_fd_soft: number | null
  nginx_master_fd_hard: number | null
  nginx_worker_fd_soft: number | null
  nginx_worker_fd_hard: number | null
  cpu_quota: number | null
  worker_connections_total: number | null
  // §3.4.C: Usable SSE capacity after subtracting non-viewer FD overhead
  usable_sse_capacity: number | null
  sufficient: boolean
  reason: string
}

export interface ResourceMonitor {
  measureCpu(): void
  snapshot(): ResourceSnapshot
  startEventLoopMonitor(): void
  stopEventLoopMonitor(): void
  preflight(controlUrl: string, targetConnections?: number): Promise<NginxPreflight | null>
  dispose(): void
  // §3.8.C: Wait for initial Nchan/Redis polls to complete before taking baseline
  ready(): Promise<void>
}
