import fs from "node:fs"
import net from "node:net"
import http from "node:http"
import { monitorEventLoopDelay } from "node:perf_hooks"
import type { ResourceMonitor, ResourceSnapshot, NginxPreflight } from "../ports/resource-monitor.js"

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
      sock.write("INFO memory\r\nINFO clients\r\nINFO cpu\r\n")
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

function parseRedisConnectedClients(info: string): number | null {
  for (const line of info.split("\r\n")) {
    if (line.startsWith("connected_clients:")) {
      const val = parseInt(line.split(":")[1], 10)
      if (!isNaN(val)) return val
    }
  }
  return null
}

// §3.8: Parse Redis used_cpu_sys and used_cpu_user from INFO cpu output
function parseRedisCpuSys(info: string): number | null {
  for (const line of info.split("\r\n")) {
    if (line.startsWith("used_cpu_sys:")) {
      const val = parseFloat(line.split(":")[1])
      if (!isNaN(val)) return val
    }
  }
  return null
}

function parseRedisCpuUser(info: string): number | null {
  for (const line of info.split("\r\n")) {
    if (line.startsWith("used_cpu_user:")) {
      const val = parseFloat(line.split(":")[1])
      if (!isNaN(val)) return val
    }
  }
  return null
}

function fetchNchanMetrics(controlUrl: string): Promise<{
  memory_current_bytes: number | null
  memory_peak_bytes: number | null
  cpu_usage_usec: number | null
  cpu_throttled_count: number | null
  cpu_throttled_usec: number | null
  memory_oom_events: number | null
  memory_oom_kill_events: number | null
} | null> {
  return new Promise((resolve) => {
    try {
      const url = new URL(controlUrl)
      const req = http.request({
        hostname: url.hostname,
        port: url.port,
        path: "/metrics",
        method: "GET",
        timeout: 3000,
      }, (res) => {
        let data = ""
        res.on("data", (chunk) => { data += chunk })
        res.on("end", () => {
          try {
            resolve(JSON.parse(data))
          } catch {
            resolve(null)
          }
        })
      })
      req.on("error", () => resolve(null))
      req.on("timeout", () => { req.destroy(); resolve(null) })
      req.end()
    } catch {
      resolve(null)
    }
  })
}

export class CgroupResourceMonitor implements ResourceMonitor {
  private memoryMbPeak = 0
  private cpuPercentPeak = 0
  private redisMemoryMbPeak: number | null = null
  private nchanMemoryMbPeak: number | null = null
  private nchanCpuUsageUsec: number | null = null
  private nchanCpuThrottledCount: number | null = null
  private nchanCpuThrottledUsec: number | null = null
  private nchanMemoryCurrentBytes: number | null = null
  private nchanMemoryPeakBytes: number | null = null
  private nchanMemoryOomEvents: number | null = null
  private nchanMemoryOomKillEvents: number | null = null
  private redisConnectedClientsPeak: number | null = null
  // §3.8: Nchan CPU percent tracking
  private nchanCpuPercentPeak: number | null = null
  private prevNchanCpuUsageUsec: number | null = null
  private prevNchanWallTime: number = 0
  // §3.8: Redis CPU percent tracking
  private redisCpuPercentPeak: number | null = null
  private prevRedisCpuSys: number | null = null
  private prevRedisCpuUser: number | null = null
  private prevRedisWallTime: number = 0
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

  private redisUrl?: string
  private nchanControlUrl?: string

  constructor(redisUrl?: string, nchanControlUrl?: string) {
    this.redisUrl = redisUrl
    this.nchanControlUrl = nchanControlUrl
    if (redisUrl || nchanControlUrl) {
      this.pollTimer = setInterval(() => {
        if (this.redisUrl) this.pollRedisMemory(this.redisUrl)
        if (this.nchanControlUrl) this.pollNchanMetrics(this.nchanControlUrl)
      }, 5000)
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
      const clients = parseRedisConnectedClients(info)
      if (clients !== null && (this.redisConnectedClientsPeak === null || clients > this.redisConnectedClientsPeak)) {
        this.redisConnectedClientsPeak = clients
      }
      // §3.8: Compute Redis CPU percent from used_cpu_sys + used_cpu_user deltas
      const cpuSys = parseRedisCpuSys(info)
      const cpuUser = parseRedisCpuUser(info)
      if (cpuSys !== null && cpuUser !== null) {
        const totalCpu = cpuSys + cpuUser
        const wallTime = Date.now()
        if (this.prevRedisCpuSys !== null && this.prevRedisCpuUser !== null) {
          const cpuDelta = totalCpu - (this.prevRedisCpuSys + this.prevRedisCpuUser)
          const wallDelta = (wallTime - this.prevRedisWallTime) / 1000 // seconds
          if (wallDelta > 0) {
            // Redis reports CPU in seconds; convert to percentage of wall time
            const cpuPercent = (cpuDelta / wallDelta) * 100
            if (this.redisCpuPercentPeak === null || cpuPercent > this.redisCpuPercentPeak) {
              this.redisCpuPercentPeak = cpuPercent
            }
          }
        }
        this.prevRedisCpuSys = cpuSys
        this.prevRedisCpuUser = cpuUser
        this.prevRedisWallTime = wallTime
      }
    } catch {
      // Redis unavailable — leave metrics as-is
    }
  }

  private async pollNchanMetrics(controlUrl: string): Promise<void> {
    try {
      const metrics = await fetchNchanMetrics(controlUrl)
      if (metrics) {
        if (metrics.memory_peak_bytes !== null) {
          const memMb = metrics.memory_peak_bytes / (1024 * 1024)
          if (this.nchanMemoryMbPeak === null || memMb > this.nchanMemoryMbPeak) {
            this.nchanMemoryMbPeak = memMb
          }
        }
        if (metrics.memory_current_bytes !== null) {
          this.nchanMemoryCurrentBytes = metrics.memory_current_bytes
        }
        if (metrics.memory_peak_bytes !== null) {
          this.nchanMemoryPeakBytes = metrics.memory_peak_bytes
        }
        if (metrics.cpu_usage_usec !== null) {
          // §3.8: Compute Nchan CPU percent from cumulative cpu_usage_usec delta
          // §3.9 CPU NORMALIZATION: All CPU percent values are "percentage of one CPU core".
          // 100% = one core fully utilized. To get fraction of assigned CPUs, divide by
          // the cgroup quota (readCpuQuota() in topology-preflight.ts). For example,
          // if Nchan has 4 CPUs assigned and reports 200%, that's 50% of assigned capacity.
          const wallTime = Date.now()
          if (this.prevNchanCpuUsageUsec !== null) {
            const cpuDelta = metrics.cpu_usage_usec - this.prevNchanCpuUsageUsec
            const wallDelta = (wallTime - this.prevNchanWallTime) / 1000 // seconds
            if (wallDelta > 0) {
              // cpu_usage_usec is in microseconds; convert to percentage of wall time
              const cpuPercent = (cpuDelta / 1000 / wallDelta) * 100
              if (this.nchanCpuPercentPeak === null || cpuPercent > this.nchanCpuPercentPeak) {
                this.nchanCpuPercentPeak = cpuPercent
              }
            }
          }
          this.prevNchanCpuUsageUsec = metrics.cpu_usage_usec
          this.prevNchanWallTime = wallTime
          this.nchanCpuUsageUsec = metrics.cpu_usage_usec
        }
        if (metrics.cpu_throttled_count !== null) {
          this.nchanCpuThrottledCount = metrics.cpu_throttled_count
        }
        if (metrics.cpu_throttled_usec !== null) {
          this.nchanCpuThrottledUsec = metrics.cpu_throttled_usec
        }
        if (metrics.memory_oom_events !== null) {
          this.nchanMemoryOomEvents = metrics.memory_oom_events
        }
        if (metrics.memory_oom_kill_events !== null) {
          this.nchanMemoryOomKillEvents = metrics.memory_oom_kill_events
        }
      }
    } catch {
      // Nchan unavailable — leave metrics as-is
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
    // §3.9 CPU NORMALIZATION: Runner CPU percent = (cpuDelta_us / 1000 / wallDelta_ms) * 100
    // Result is "percentage of one CPU core". Same normalization as Nchan/Redis.
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
      nchanMemoryMbPeak: this.nchanMemoryMbPeak,
      redisMemoryMbPeak: this.redisMemoryMbPeak,
      // §AC: cgroup v2 runtime signals (runner)
      cpu_usage_usec: this.cgroupCpuUsageUsec,
      cpu_throttled_count: this.cgroupCpuThrottledCount,
      cpu_throttled_usec: this.cgroupCpuThrottledUsec,
      memory_current_bytes: this.cgroupMemoryCurrentBytes,
      memory_peak_bytes: this.cgroupMemoryPeakBytes,
      memory_oom_events: this.cgroupMemoryOomEvents,
      memory_oom_kill_events: this.cgroupMemoryOomKillEvents,
      cpu_max_quota: this.cgroupCpuMaxQuota,
      memory_max_bytes: this.cgroupMemoryMaxBytes,
      // §4.9: Nchan container resource metrics
      nchan_cpu_usage_usec: this.nchanCpuUsageUsec,
      nchan_cpu_throttled_count: this.nchanCpuThrottledCount,
      nchan_cpu_throttled_usec: this.nchanCpuThrottledUsec,
      nchan_memory_current_bytes: this.nchanMemoryCurrentBytes,
      nchan_memory_peak_bytes: this.nchanMemoryPeakBytes,
      nchan_memory_oom_events: this.nchanMemoryOomEvents,
      nchan_memory_oom_kill_events: this.nchanMemoryOomKillEvents,
      // §4.9: Redis connected-client peak
      redis_connected_clients_peak: this.redisConnectedClientsPeak,
      // §3.8: Nchan/Redis CPU percent peaks
      nchan_cpu_percent_peak: this.nchanCpuPercentPeak,
      redis_cpu_percent_peak: this.redisCpuPercentPeak,
    }
  }

  // §4.24: Runtime nginx capacity preflight
  async preflight(controlUrl: string): Promise<NginxPreflight | null> {
    return new Promise((resolve) => {
      try {
        const url = new URL(controlUrl)
        const req = http.request({
          hostname: url.hostname,
          port: url.port,
          path: "/preflight",
          method: "GET",
          timeout: 5000,
        }, (res) => {
          let data = ""
          res.on("data", (chunk) => { data += chunk })
          res.on("end", () => {
            try {
              resolve(JSON.parse(data))
            } catch {
              resolve(null)
            }
          })
        })
        req.on("error", () => resolve(null))
        req.on("timeout", () => { req.destroy(); resolve(null) })
        req.end()
      } catch {
        resolve(null)
      }
    })
  }

  dispose(): void {
    this.stopEventLoopMonitor()
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }
}
