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

// §3.8A: Parse cgroup v2 cpu.max — handles "max" (unlimited) and numeric quota
function readCpuMax(raw: string): { quota: number | null; period: number } {
  const parts = raw.split(" ")
  if (parts[0] === "max" || parts[0] === "MAX") {
    return { quota: null, period: parseInt(parts[1], 10) || 100_000 }
  }
  const quota = parseInt(parts[0], 10)
  const period = parseInt(parts[1], 10) || 100_000
  if (isNaN(quota)) return { quota: null, period }
  return { quota, period }
}

// §3.8C: Detect host CPU count — prefers container effective CPUs when limited by cgroup
function detectHostCpus(): number {
  try {
    // §3.8: Prefer container effective CPUs when limited by cgroup
    const raw = readCgroupFile("/sys/fs/cgroup/cpu.max")
    if (raw) {
      const cpuMax = readCpuMax(raw)
      if (cpuMax.quota !== null && cpuMax.quota > 0) {
        return Math.max(1, Math.round(cpuMax.quota / cpuMax.period))
      }
    }
  } catch {}
  // Fall back to /proc/cpuinfo host count
  try {
    const cpuinfo = fs.readFileSync("/proc/cpuinfo", "utf8")
    const matches = cpuinfo.match(/^processor\s*:\s*\d+/gm)
    if (matches && matches.length > 0) return matches.length
  } catch {}
  return 2
}

// §3.8F: Read thread count from cgroup.threads — guards against negative values
function readThreadCount(): number | null {
  try {
    const raw = parseInt(fs.readFileSync("/sys/fs/cgroup/cgroup.threads", "utf8").trim(), 10)
    if (isNaN(raw) || raw < 0) return 0
    return raw
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

export function parseRedisUsedMemoryBytes(info: string): number | null {
  for (const line of info.split("\r\n")) {
    if (line.startsWith("used_memory:")) {
      const bytes = parseInt(line.split(":")[1], 10)
      if (!isNaN(bytes)) return bytes
    }
  }
  return null
}

export function cpuUsageDeltaPercent(deltaUsec: number, wallDeltaSeconds: number): number | null {
  if (!Number.isFinite(deltaUsec) || deltaUsec < 0 || !Number.isFinite(wallDeltaSeconds) || wallDeltaSeconds <= 0) return null
  return (deltaUsec / 1_000_000 / wallDeltaSeconds) * 100
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
  cpu_max_quota: number | null  // §3.8: Nchan container cpu.max quota for normalization
  cpu_max_period: number | null
  cpuset_effective_cpus: string | null
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

// §3.9: CPU normalization — divide raw per-core % by core count for 0–100 range
export function normalizeCpuPercent(rawPercent: number | null, cpuLimitCores: number | null): number | null {
  if (rawPercent === null) return null
  if (cpuLimitCores === null || cpuLimitCores <= 0) return rawPercent // no limit: raw is already 0–100 per core
  return rawPercent / cpuLimitCores
}

export function countCpusetCpus(value: string | null | undefined): number | null {
  if (!value?.trim()) return null
  const cpus = new Set<number>()
  for (const token of value.split(",")) {
    const [firstRaw, lastRaw] = token.trim().split("-")
    const first = parseInt(firstRaw, 10)
    const last = lastRaw === undefined ? first : parseInt(lastRaw, 10)
    if (!Number.isInteger(first) || !Number.isInteger(last) || last < first) return null
    for (let cpu = first; cpu <= last; cpu++) cpus.add(cpu)
  }
  return cpus.size || null
}

export function effectiveCpuCapacity(
  quota: number | null,
  period: number | null,
  cpusetCpus: number | null,
): number | null {
  const quotaCapacity = quota !== null && period !== null && quota > 0 && period > 0 ? quota / period : null
  if (quotaCapacity !== null && cpusetCpus !== null) return Math.min(quotaCapacity, cpusetCpus)
  return quotaCapacity ?? cpusetCpus
}

export function sampleRunMemoryPeak(priorPeak: number | null, currentBytes: number | null): number | null {
  if (currentBytes === null) return priorPeak
  return priorPeak === null ? currentBytes : Math.max(priorPeak, currentBytes)
}

// §3.9: Baseline CPU percent — idle system baseline (no active workloads)
export function baselineCpuPercent(containerMode: "unlimited" | "limited" | "unknown"): number {
  switch (containerMode) {
    case "limited": return 0
    case "unlimited": return 0
    default: return 0
  }
}

// §3.9: Detect container mode from cgroup cpu.max quota
export function detectContainerMode(cpuMaxQuota: number | null): "unlimited" | "limited" | "unknown" {
  if (cpuMaxQuota === null) return "unlimited"
  if (cpuMaxQuota > 0) return "limited"
  return "unknown"
}

export class CgroupResourceMonitor implements ResourceMonitor {
  private memoryMbPeak = 0
  private cpuPercentPeak = 0
  private redisMemoryMbPeak: number | null = null
  private redisMemoryBytesPeak: number | null = null
  private nchanMemoryMbPeak: number | null = null
  private nchanCpuUsageUsec: number | null = null
  private nchanCpuThrottledCount: number | null = null
  private nchanCpuThrottledUsec: number | null = null
  private nchanMemoryCurrentBytes: number | null = null
  private nchanMemoryPeakBytes: number | null = null
  private nchanMemoryContainerLifetimePeakBytes: number | null = null
  private nchanMemoryOomEvents: number | null = null
  private nchanMemoryOomKillEvents: number | null = null
  private redisConnectedClientsPeak: number | null = null
  // §3.8: Per-service CPU quotas for normalization
  private nchanCpuMaxQuota: number | null = null
  private nchanCpuMaxPeriod: number | null = null  // §3.9: Nchan cpu.max period
  private redisCpuMaxQuota: number | null = null
  private redisCpuMaxPeriod: number | null = null  // §3.9: Redis cpu.max period (from env)
  private nchanCpusetEffectiveCpus: number | null = null
  private redisCpusetEffectiveCpus: number | null = null
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
  private eventLoopDelayP99PeakMs = 0

  // §AC: cgroup v2 cumulative counters — sampled once at snapshot time
  private cgroupCpuUsageUsec = 0
  private cgroupCpuThrottledCount = 0
  private cgroupCpuThrottledUsec = 0
  private cgroupMemoryCurrentBytes = 0
  private cgroupMemoryPeakBytes: number | null = null
  private cgroupMemoryOomEvents = 0
  private cgroupMemoryOomKillEvents = 0
  private cgroupCpuMaxQuota: number | null = null
  private cgroupCpuMaxPeriod: number | null = null  // §3.8: cpu.max period (typically 100000µs)
  private cgroupMemoryMaxBytes: number | null = null
  private cgroupThreadCount: number | null = null  // §3.8F: thread count from cgroup.threads

  private redisUrl?: string
  private nchanControlUrl?: string
  // §3.8.C: Track initial poll completion so baseline snapshot waits for Nchan/Redis data
  private _ready: Promise<void>
  // §3.8.C: Track whether each service has returned data at least once
  private _nchanDataReceived = false
  private _redisDataReceived = false

  constructor(redisUrl?: string, nchanControlUrl?: string) {
    this.redisUrl = redisUrl
    this.nchanControlUrl = nchanControlUrl
    // §3.8.A: Per-service CPU quotas — read env vars as fallback when control server unavailable.
    // Compose files pass NCHAN_CPU_MAX_QUOTA and REDIS_CPU_MAX_QUOTA.
    const envNchanQuota = parseInt(process.env.NCHAN_CPU_MAX_QUOTA ?? "", 10)
    if (!isNaN(envNchanQuota) && envNchanQuota > 0) this.nchanCpuMaxQuota = envNchanQuota
    const envNchanPeriod = parseInt(process.env.NCHAN_CPU_MAX_PERIOD ?? "", 10)
    if (!isNaN(envNchanPeriod) && envNchanPeriod > 0) this.nchanCpuMaxPeriod = envNchanPeriod
    const envRedisQuota = parseInt(process.env.REDIS_CPU_MAX_QUOTA ?? "", 10)
    if (!isNaN(envRedisQuota) && envRedisQuota > 0) this.redisCpuMaxQuota = envRedisQuota
    const envRedisPeriod = parseInt(process.env.REDIS_CPU_MAX_PERIOD ?? "", 10)
    if (!isNaN(envRedisPeriod) && envRedisPeriod > 0) this.redisCpuMaxPeriod = envRedisPeriod
    this.redisCpusetEffectiveCpus = countCpusetCpus(process.env.REDIS_CPUSET_EFFECTIVE_CPUS)
    // Redis's entrypoint exports its actual cgroup files to this shared volume.
    // Runtime observations override configured environment fallbacks.
    const redisCpuMax = readCgroupFile("/redis-cgroup/cpu.max")
    if (redisCpuMax) {
      const actual = readCpuMax(redisCpuMax)
      this.redisCpuMaxQuota = actual.quota
      this.redisCpuMaxPeriod = actual.period
    }
    this.redisCpusetEffectiveCpus = countCpusetCpus(
      readCgroupFile("/redis-cgroup/cpuset.cpus.effective"),
    ) ?? this.redisCpusetEffectiveCpus
    // §3.8.C: Run initial polls and wait for them before the first snapshot.
    // If a poll fails (service not yet ready), retry up to 3 times with 2s delays
    // so baseline captures actual data rather than nulls.
    const maxRetries = 3
    const retryDelayMs = 2000
    const tryPoll = async (pollFn: () => Promise<void>, isDataReceived: () => boolean): Promise<void> => {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        await pollFn()
        if (isDataReceived()) return
        if (attempt < maxRetries) await new Promise((r) => setTimeout(r, retryDelayMs))
      }
    }
    const polls: Promise<void>[] = []
    if (redisUrl) polls.push(tryPoll(() => this.pollRedisMemory(redisUrl), () => this._redisDataReceived))
    if (nchanControlUrl) polls.push(tryPoll(() => this.pollNchanMetrics(nchanControlUrl), () => this._nchanDataReceived))
    this._ready = Promise.all(polls).then(() => {})
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
      this._redisDataReceived = true
      const memoryBytes = parseRedisUsedMemoryBytes(info)
      if (memoryBytes !== null && (this.redisMemoryBytesPeak === null || memoryBytes > this.redisMemoryBytesPeak)) {
        this.redisMemoryBytesPeak = memoryBytes
        this.redisMemoryMbPeak = memoryBytes / (1024 * 1024)
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
        this._nchanDataReceived = true
        if (metrics.memory_peak_bytes !== null) {
          this.nchanMemoryContainerLifetimePeakBytes = metrics.memory_peak_bytes
        }
        if (metrics.memory_current_bytes !== null) {
          this.nchanMemoryCurrentBytes = metrics.memory_current_bytes
          // §3.8.D: Derive per-run memory peak from observed current_bytes, not container-lifetime memory.peak.
          // memory.peak is a cgroup high-water mark for the entire container lifetime and does not reset
          // between evidence runs that reuse the same container. Tracking the max of memory.current_bytes
          // across polls gives a genuine per-run peak.
          this.nchanMemoryPeakBytes = sampleRunMemoryPeak(this.nchanMemoryPeakBytes, metrics.memory_current_bytes)
          const memMb = metrics.memory_current_bytes / (1024 * 1024)
          if (this.nchanMemoryMbPeak === null || memMb > this.nchanMemoryMbPeak) {
            this.nchanMemoryMbPeak = memMb
          }
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
            const cpuPercent = cpuUsageDeltaPercent(cpuDelta, wallDelta)
            if (cpuPercent !== null) {
              // cpu_usage_usec is in microseconds; 1,000,000 usec over one
              // second is 100% of one CPU, not 100,000%.
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
        if (metrics.cpu_max_quota !== null) {
          this.nchanCpuMaxQuota = metrics.cpu_max_quota
        }
        if (metrics.cpu_max_period !== null) {
          this.nchanCpuMaxPeriod = metrics.cpu_max_period
        }
        this.nchanCpusetEffectiveCpus = countCpusetCpus(metrics.cpuset_effective_cpus)
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
    this.eventLoopDelayP99PeakMs = 0
    this.eventLoopMonitor.enable()
  }

  stopEventLoopMonitor(): void {
    if (this.eventLoopMonitor) {
      this.eventLoopMonitor.disable()
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
      const parsed = readCpuMax(cpuMax)
      this.cgroupCpuMaxQuota = parsed.quota
      this.cgroupCpuMaxPeriod = parsed.period
    }

    // memory.max — single integer (bytes) or "max" (unlimited)
    const memMax = readCgroupFile("/sys/fs/cgroup/memory.max")
    if (memMax && memMax !== "max") {
      const v = parseInt(memMax, 10)
      if (!isNaN(v)) this.cgroupMemoryMaxBytes = v
    }

    // §3.8F: cgroup.threads — thread count (may not exist)
    this.cgroupThreadCount = readThreadCount()
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

    let p99 = this.eventLoopDelayP99PeakMs
    if (this.eventLoopMonitor) {
      // §AB: Use percentiles from the continuous histogram
      const histogram = this.eventLoopMonitor
      const observedP99 = histogram.percentile(99) / 1_000_000 // ns -> ms
      if (Number.isFinite(observedP99)) this.eventLoopDelayP99PeakMs = Math.max(this.eventLoopDelayP99PeakMs, observedP99)
      p99 = this.eventLoopDelayP99PeakMs
    }

    return {
      memoryMbPeak: this.memoryMbPeak,
      eventLoopDelayP99Ms: p99,
      cpuPercentPeak: this.cpuPercentPeak,
      nchanMemoryMbPeak: this.nchanMemoryMbPeak,
      redisMemoryMbPeak: this.redisMemoryMbPeak,
      redisMemoryBytesPeak: this.redisMemoryBytesPeak,
      // §AC: cgroup v2 runtime signals (runner)
      cpu_usage_usec: this.cgroupCpuUsageUsec,
      cpu_throttled_count: this.cgroupCpuThrottledCount,
      cpu_throttled_usec: this.cgroupCpuThrottledUsec,
      memory_current_bytes: this.cgroupMemoryCurrentBytes,
      memory_peak_bytes: this.cgroupMemoryPeakBytes,
      memory_oom_events: this.cgroupMemoryOomEvents,
      memory_oom_kill_events: this.cgroupMemoryOomKillEvents,
      cpu_max_quota: this.cgroupCpuMaxQuota,
      cpu_max_period: this.cgroupCpuMaxPeriod,
      memory_max_bytes: this.cgroupMemoryMaxBytes,
      // §4.9: Nchan container resource metrics
      nchan_cpu_usage_usec: this.nchanCpuUsageUsec,
      nchan_cpu_throttled_count: this.nchanCpuThrottledCount,
      nchan_cpu_throttled_usec: this.nchanCpuThrottledUsec,
      nchan_memory_current_bytes: this.nchanMemoryCurrentBytes,
      nchan_memory_peak_bytes: this.nchanMemoryPeakBytes,
      nchan_memory_container_lifetime_peak_bytes: this.nchanMemoryContainerLifetimePeakBytes,
      nchan_memory_oom_events: this.nchanMemoryOomEvents,
      nchan_memory_oom_kill_events: this.nchanMemoryOomKillEvents,
      // §4.9: Redis connected-client peak
      redis_connected_clients_peak: this.redisConnectedClientsPeak,
      // §3.8: Nchan/Redis CPU percent peaks
      nchan_cpu_percent_peak: this.nchanCpuPercentPeak,
      redis_cpu_percent_peak: this.redisCpuPercentPeak,
      // §3.8: Per-service CPU quotas for normalization
      nchan_cpu_max_quota: this.nchanCpuMaxQuota,
      redis_cpu_max_quota: this.redisCpuMaxQuota,
      // §3.9: Per-service CPU periods for normalization
      nchan_cpu_max_period: this.nchanCpuMaxPeriod,
      redis_cpu_max_period: this.redisCpuMaxPeriod,
      runner_cpuset_effective_cpus: countCpusetCpus(readCgroupFile("/sys/fs/cgroup/cpuset.cpus.effective")),
      nchan_cpuset_effective_cpus: this.nchanCpusetEffectiveCpus,
      redis_cpuset_effective_cpus: this.redisCpusetEffectiveCpus,
      // §3.8E: CPU nanoseconds — derived from cpu_usage_usec
      cpu_ns: this.cgroupCpuUsageUsec > 0
        ? BigInt(this.cgroupCpuUsageUsec) * 1_000_000n
        : null,
      // §3.8F: Thread count from cgroup.threads
      thread_count: this.cgroupThreadCount,
    }
  }

  // §4.24: Runtime nginx capacity preflight
  async preflight(controlUrl: string, targetConnections = 100_000): Promise<NginxPreflight | null> {
    return new Promise((resolve) => {
      try {
        const url = new URL(controlUrl)
        const req = http.request({
          hostname: url.hostname,
          port: url.port,
          path: `/preflight?target=${encodeURIComponent(String(targetConnections))}`,
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

  // §3.8.C: Wait for initial Nchan/Redis polls to complete before baseline snapshot
  ready(): Promise<void> {
    return this._ready
  }

  dispose(): void {
    this.stopEventLoopMonitor()
    this.eventLoopMonitor = null
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }
}
