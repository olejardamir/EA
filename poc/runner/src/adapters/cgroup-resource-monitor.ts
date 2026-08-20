import net from "node:net"
import type { ResourceMonitor, ResourceSnapshot } from "../ports/resource-monitor.js"

function redisInfo(redisUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = new URL(redisUrl)
    const sock = net.connect(parseInt(url.port) || 6379, url.hostname, () => {
      sock.write("INFO memory\r\n")
    })
    let data = ""
    sock.on("data", (chunk) => {
      data += chunk.toString()
      if (data.includes("\r\n\r\n")) {
        sock.destroy()
        resolve(data)
      }
    })
    sock.on("error", reject)
    setTimeout(() => { sock.destroy(); reject(new Error("redis-info-timeout")) }, 3000)
  })
}

function parseRedisUsedMemory(info: string): number | null {
  for (const line of info.split("\r\n")) {
    if (line.startsWith("used_memory:")) {
      const bytes = parseInt(line.split(":")[1], 10)
      if (!isNaN(bytes)) return bytes / (1024 * 1024)
    }
  }
  return null
}

export class CgroupResourceMonitor implements ResourceMonitor {
  private eventLoopDelays: number[] = []
  private memoryMbPeak = 0
  private cpuPercentPeak = 0
  private redisMemoryMbPeak: number | null = null
  private maxSamples = 1000
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private prevCpuTime = 0
  private prevWallTime = 0

  constructor(redisUrl?: string) {
    if (redisUrl) {
      this.pollRedisMemory(redisUrl)
      this.pollTimer = setInterval(() => this.pollRedisMemory(redisUrl), 5000)
    }
  }

  private async pollRedisMemory(redisUrl: string): Promise<void> {
    try {
      const info = await redisInfo(redisUrl)
      const memMb = parseRedisUsedMemory(info)
      if (memMb !== null && (this.redisMemoryMbPeak === null || memMb > this.redisMemoryMbPeak)) {
        this.redisMemoryMbPeak = memMb
      }
    } catch {
      // Redis unavailable — leave redisMemoryMbPeak as-is
    }
  }

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

  measureCpu(): void {
    const cpuTimes = process.cpuUsage()
    const totalCpu = cpuTimes.user + cpuTimes.system
    const wallTime = Date.now()

    if (this.prevWallTime > 0) {
      const cpuDelta = totalCpu - this.prevCpuTime
      const wallDelta = wallTime - this.prevWallTime
      if (wallDelta > 0) {
        const cpuPercent = (cpuDelta / 1000 / wallDelta) * 100
        if (cpuPercent > this.cpuPercentPeak) {
          this.cpuPercentPeak = cpuPercent
        }
      }
    }

    this.prevCpuTime = totalCpu
    this.prevWallTime = wallTime
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
      cpuPercentPeak: this.cpuPercentPeak,
      nchanMemoryMbPeak: null,
      redisMemoryMbPeak: this.redisMemoryMbPeak,
    }
  }

  dispose(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }
}
