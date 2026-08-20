export interface ResourceSnapshot {
  memoryMbPeak: number
  eventLoopDelayP99Ms: number
}

export interface ResourceMonitor {
  measureEventLoop(): void
  snapshot(): ResourceSnapshot
}
