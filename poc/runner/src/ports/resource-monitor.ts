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
  memory_max_bytes: number | null         // memory.max — memory limit in bytes (or "max")
  // §4.9: Nchan container resource metrics
  nchan_cpu_usage_usec: number | null
  nchan_cpu_throttled_count: number | null
  nchan_cpu_throttled_usec: number | null
  nchan_memory_current_bytes: number | null
  nchan_memory_peak_bytes: number | null
  nchan_memory_oom_events: number | null
  nchan_memory_oom_kill_events: number | null
}

export interface ResourceMonitor {
  measureCpu(): void
  snapshot(): ResourceSnapshot
  startEventLoopMonitor(): void
  stopEventLoopMonitor(): void
  dispose(): void
}
