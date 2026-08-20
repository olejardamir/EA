import fs from "node:fs"
import net from "node:net"
import { monitorEventLoopDelay } from "node:perf_hooks"
import type { ResourceMonitor, ResourceSnapshot } from "../ports/resource-monitor.js"

function readCgroupFile(path: string): string | null {
  try {
    return fs.readFileSync(path, "utf-8").trim()
  } catch {
    return null
  }
}

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
  private memoryMbPeak = 0
  private cpuPercentPeak = 0
  private redisMemoryMbPeak: number | null = null
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private prevCpuTime = 0
  private prevWallTime = 0
  // §AB: Use perf_hooks.monitorEventLoopDelay() for accurate event-loop delay
  // measurement instead of sparse setImmediate probes.
  private eventLoopMonitor: ReturnType<typeof monitorEventLoopDelay> | null = null

  // §AC: cgroup v2 cumulative counters — sampled once at snapshot time
  private cgroupCpuUsageUsec = 0
  private cgroupCpuThrottledCount = 0
  private cgroupCpuThrottledUsec = 0
  private cgroupMemoryCurrentBytes = 0
  private cgroupMemoryPeakBytes: number | null = null
  private cgroupMemoryOomEvents = 0
  private cgroupMemoryOomKillEvents = 0
  private cgroupCpuMaxQuota: number | null = null
  private cgroupMemoryMaxBytes: number | null = null

  constructor(redisUrl?: string) {
    if (redisUrl) {
      this.pollRedisMemory(redisUrl)
      this.pollTimer = setInterval(() => this.pollRedisMemory(redisUrl), 5000)
    }
    this.readCgroupV2Stats()
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

  startEventLoopMonitor(): void {
    // §AB: monitorEventLoopDelay provides high-resolution, continuous histogram
    // of event-loop delay. Resolution defaults to 10ms which is sufficient for
    // the frozen 50ms threshold.
    this.eventLoopMonitor = monitorEventLoopDelay({ resolution: 10 })
    this.eventLoopMonitor.enable()
  }

  stopEventLoopMonitor(): void {
    if (this.eventLoopMonitor) {
      this.eventLoopMonitor.disable()
      this.eventLoopMonitor = null
    }
  }

  // §AC: Read cgroup v2 runtime signals from the container's cgroup filesystem.
  // In Docker with cgroup v2, files are at /sys/fs/cgroup/ (single-cgroup).
  // In cgroup v1, these paths won't exist and fields will be null.
  private readCgroupV2Stats(): void {
    // cpu.stat is a multi-line key-value file: "usage_usec 123456\nnr_throttled 0\n..."
    const cpuStat = readCgroupFile("/sys/fs/cgroup/cpu.stat")
    if (cpuStat) {
      for (const line of cpuStat.split("\n")) {
        const [key, value] = line.split(" ")
        const num = parseInt(value, 10)
        if (isNaN(num)) continue
        switch (key) {
          case "usage_usec": this.cgroupCpuUsageUsec = num; break
          case "nr_throttled": this.cgroupCpuThrottledCount = num; break
          case "throttled_usec": this.cgroupCpuThrottledUsec = num; break
        }
      }
    }

    // memory.current — single integer (bytes)
    const memCurrent = readCgroupFile("/sys/fs/cgroup/memory.current")
    if (memCurrent) {
      const v = parseInt(memCurrent, 10)
      if (!isNaN(v)) this.cgroupMemoryCurrentBytes = v
    }

    // memory.peak — single integer (bytes), may not exist on all kernels
    const memPeak = readCgroupFile("/sys/fs/cgroup/memory.peak")
    if (memPeak) {
      const v = parseInt(memPeak, 10)
      if (!isNaN(v)) this.cgroupMemoryPeakBytes = v
    }

    // memory.events — multi-line: "oom 0\noom_kill 0\n..."
    const memEvents = readCgroupFile("/sys/fs/cgroup/memory.events")
    if (memEvents) {
      for (const line of memEvents.split("\n")) {
        const [key, value] = line.split(" ")
        const num = parseInt(value, 10)
        if (isNaN(num)) continue
        switch (key) {
          case "oom": this.cgroupMemoryOomEvents = num; break
          case "oom_kill": this.cgroupMemoryOomKillEvents = num; break
        }
      }
    }

    // cpu.max — either "max 100000" (unlimited) or "50000 100000" (50ms per 100ms period)
    const cpuMax = readCgroupFile("/sys/fs/cgroup/cpu.max")
    if (cpuMax) {
      const parts = cpuMax.split(" ")
      if (parts[0] === "max") {
        this.cgroupCpuMaxQuota = null // unlimited
      } else {
        const quota = parseInt(parts[0], 10)
        if (!isNaN(quota)) this.cgroupCpuMaxQuota = quota
      }
    }

    // memory.max — single integer (bytes) or "max" (unlimited)
    const memMax = readCgroupFile("/sys/fs/cgroup/memory.max")
    if (memMax && memMax !== "max") {
      const v = parseInt(memMax, 10)
      if (!isNaN(v)) this.cgroupMemoryMaxBytes = v
    }
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
    // §AC: Re-read cgroup v2 counters for fresh cumulative values
    this.readCgroupV2Stats()

    const mem = process.memoryUsage()
    const memMb = mem.heapUsed / (1024 * 1024)
    if (memMb > this.memoryMbPeak) {
      this.memoryMbPeak = memMb
    }

    let p99 = 0
    if (this.eventLoopMonitor) {
      // §AB: Use percentiles from the continuous histogram
      const histogram = this.eventLoopMonitor
      p99 = histogram.percentile(99) / 1_000_000 // ns -> ms
      histogram.reset()
    }

    return {
      memoryMbPeak: this.memoryMbPeak,
      eventLoopDelayP99Ms: p99,
      cpuPercentPeak: this.cpuPercentPeak,
      nchanMemoryMbPeak: null,
      redisMemoryMbPeak: this.redisMemoryMbPeak,
      // §AC: cgroup v2 runtime signals
      cpu_usage_usec: this.cgroupCpuUsageUsec,
      cpu_throttled_count: this.cgroupCpuThrottledCount,
      cpu_throttled_usec: this.cgroupCpuThrottledUsec,
      memory_current_bytes: this.cgroupMemoryCurrentBytes,
      memory_peak_bytes: this.cgroupMemoryPeakBytes,
      memory_oom_events: this.cgroupMemoryOomEvents,
      memory_oom_kill_events: this.cgroupMemoryOomKillEvents,
      cpu_max_quota: this.cgroupCpuMaxQuota,
      memory_max_bytes: this.cgroupMemoryMaxBytes,
    }
  }

  dispose(): void {
    this.stopEventLoopMonitor()
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }
}
