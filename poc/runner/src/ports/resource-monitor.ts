export interface ResourceSnapshot {
  memoryMbPeak: number
  eventLoopDelayP99Ms: number
  cpuPercentPeak: number
  nchanMemoryMbPeak: number | null
  redisMemoryMbPeak: number | null
}

export interface ResourceMonitor {
  measureEventLoop(): void
  measureCpu(): void
  snapshot(): ResourceSnapshot
}
