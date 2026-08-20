export interface ResourceSnapshot {
  memoryMbPeak: number
  eventLoopDelayP99Ms: number
  nchanMemoryMbPeak: number | null
  redisMemoryMbPeak: number | null
}

export interface ResourceMonitor {
  measureEventLoop(): void
  snapshot(): ResourceSnapshot
}
