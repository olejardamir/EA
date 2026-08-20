import type { ResourceMonitor, ResourceSnapshot } from "../ports/resource-monitor.js"

export class CgroupResourceMonitor implements ResourceMonitor {
  private eventLoopDelays: number[] = []
  private memoryMbPeak = 0
  private maxSamples = 1000

  measureEventLoop(): void {
    const start = process.hrtime.bigint()
    setImmediate(() => {
      const delay = Number(process.hrtime.bigint() - start) / 1_000_000
      this.eventLoopDelays.push(delay)
      if (this.eventLoopDelays.length > this.maxSamples) {
        this.eventLoopDelays.shift()
      }
    })
  }

  snapshot(): ResourceSnapshot {
    const mem = process.memoryUsage()
    const memMb = mem.heapUsed / (1024 * 1024)
    if (memMb > this.memoryMbPeak) {
      this.memoryMbPeak = memMb
    }

    let p99 = 0
    if (this.eventLoopDelays.length > 0) {
      const sorted = [...this.eventLoopDelays].sort((a, b) => a - b)
      const idx = Math.ceil(0.99 * sorted.length) - 1
      p99 = sorted[Math.max(0, idx)]
    }

    return {
      memoryMbPeak: this.memoryMbPeak,
      eventLoopDelayP99Ms: p99,
    }
  }
}
