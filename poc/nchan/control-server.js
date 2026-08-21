#!/usr/bin/env node
"use strict"
const http = require("http")
const fs = require("fs")
const { execFile } = require("child_process")
const { execSync } = require("child_process")
const PORT = parseInt(process.env.CONTROL_PORT || "18888", 10)

function readCgroupFile(path) {
  try {
    return fs.readFileSync(path, "utf-8").trim()
  } catch {
    return null
  }
}

// §M2-3: Find all nginx process IDs by scanning /proc.
// Returns { master, workers } — master is the oldest nginx process (lowest PID,
// started first by the entrypoint); workers are the remaining nginx processes.
function findNginxProcesses() {
  const pids = []
  try {
    for (const name of fs.readdirSync("/proc")) {
      if (!/^\d+$/.test(name)) continue
      let comm = null
      try {
        comm = fs.readFileSync(`/proc/${name}/comm`, "utf-8").trim()
      } catch {
        continue // process vanished between readdir and read
      }
      if (comm === "nginx" || comm === "nginx: master" || comm.startsWith("nginx:")) pids.push(parseInt(name, 10))
    }
  } catch {}
  pids.sort((a, b) => a - b)
  // Master started first → lowest PID. Workers were forked after → higher PIDs.
  const master = pids.length > 0 ? pids[0] : null
  const workers = pids.slice(1)
  return { master, workers }
}

// §M2-3: Read RLIMIT_NOFILE from a specific process — proves the ACTUAL
// Nginx master/worker FD limits, not a helper process's limits.
function readProcFdLimits(pid) {
  if (pid === null || pid === undefined) return { soft: null, hard: null }
  try {
    const limits = fs.readFileSync(`/proc/${pid}/limits`, "utf-8")
    for (const line of limits.split("\n")) {
      if (line.includes("Max open files")) {
        const parts = line.trim().split(/\s+/)
        return { soft: parseInt(parts[3], 10), hard: parseInt(parts[4], 10) }
      }
    }
  } catch {}
  return { soft: null, hard: null }
}

function getNchanMetrics() {
  const metrics = {
    memory_current_bytes: null,
    memory_peak_bytes: null,
    cpu_usage_usec: null,
    cpu_throttled_count: null,
    cpu_throttled_usec: null,
    memory_oom_events: null,
    memory_oom_kill_events: null,
    cpu_max_quota: null,
    cpu_max_period: null,
    cpuset_effective_cpus: null,
  }

  const memCurrent = readCgroupFile("/sys/fs/cgroup/memory.current")
  if (memCurrent) {
    const v = parseInt(memCurrent, 10)
    if (!isNaN(v)) metrics.memory_current_bytes = v
  }

  const memPeak = readCgroupFile("/sys/fs/cgroup/memory.peak")
  if (memPeak) {
    const v = parseInt(memPeak, 10)
    if (!isNaN(v)) metrics.memory_peak_bytes = v
  }

  const cpuStat = readCgroupFile("/sys/fs/cgroup/cpu.stat")
  if (cpuStat) {
    for (const line of cpuStat.split("\n")) {
      const [key, value] = line.split(" ")
      const num = parseInt(value, 10)
      if (isNaN(num)) continue
      switch (key) {
        case "usage_usec": metrics.cpu_usage_usec = num; break
        case "nr_throttled": metrics.cpu_throttled_count = num; break
        case "throttled_usec": metrics.cpu_throttled_usec = num; break
      }
    }
  }

  const memEvents = readCgroupFile("/sys/fs/cgroup/memory.events")
  if (memEvents) {
    for (const line of memEvents.split("\n")) {
      const [key, value] = line.split(" ")
      const num = parseInt(value, 10)
      if (isNaN(num)) continue
      switch (key) {
        case "oom": metrics.memory_oom_events = num; break
        case "oom_kill": metrics.memory_oom_kill_events = num; break
      }
    }
  }

  const cpuMax = readCgroupFile("/sys/fs/cgroup/cpu.max")
  if (cpuMax) {
    const [quota, period] = cpuMax.split(/\s+/)
    const parsedPeriod = parseInt(period, 10)
    if (quota !== "max") {
      const parsedQuota = parseInt(quota, 10)
      if (!isNaN(parsedQuota)) metrics.cpu_max_quota = parsedQuota
    }
    if (!isNaN(parsedPeriod)) metrics.cpu_max_period = parsedPeriod
  }
  metrics.cpuset_effective_cpus = readCgroupFile("/sys/fs/cgroup/cpuset.cpus.effective")

  return metrics
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/restart") {
    res.writeHead(200, { "Content-Type": "text/plain" })
    res.end("restarting\n")
    setTimeout(() => {
      execFile("/bin/bash", ["/usr/local/bin/nchan-restart.sh"], (err) => {
        if (err) process.stderr.write(`restart error: ${err.message}\n`)
      })
    }, 100)
  } else if (req.method === "GET" && req.url === "/healthcheck") {
    res.writeHead(200, { "Content-Type": "text/plain" })
    res.end("ok")
  } else if (req.method === "GET" && req.url === "/metrics") {
    const metrics = getNchanMetrics()
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify(metrics))
  } else if (req.method === "GET" && req.url.startsWith("/preflight")) {
    // §4.24: Runtime nginx capacity preflight
    const result = {
      worker_processes: null,
      worker_connections: null,
      nginx_active: null,
      nginx_reading: null,
      nginx_writing: null,
      nginx_master_pid: null,
      nginx_worker_pids: [],
      nginx_master_fd_soft: null,
      nginx_master_fd_hard: null,
      nginx_worker_fd_soft: null,
      nginx_worker_fd_hard: null,
      cpu_quota: null,
      worker_connections_total: null,
      per_worker_connection_ceiling: null,
      per_worker_fd_reserve: 256,
      per_worker_usable_sse_capacity: null,
      capacity_model: "theoretical_even_distribution",
      worker_distribution_observed: false,
      sufficient: false,
      reason: null,
    }

    // Read worker_processes from nginx config
    try {
      const conf = fs.readFileSync("/etc/nginx/nginx.conf", "utf-8")
      const wpMatch = conf.match(/worker_processes\s+(\d+)/)
      if (wpMatch) result.worker_processes = parseInt(wpMatch[1], 10)
      const wcMatch = conf.match(/worker_connections\s+(\d+)/)
      if (wcMatch) result.worker_connections = parseInt(wcMatch[1], 10)
    } catch {}

    // Query stub_status
    try {
      const status = execSync("curl -sf http://127.0.0.1:8080/nginx_status 2>/dev/null", { encoding: "utf-8", timeout: 3000 })
      const lines = status.trim().split("\n")
      // Active connections: N
      const activeMatch = lines[0]?.match(/Active connections:\s+(\d+)/)
      if (activeMatch) result.nginx_active = parseInt(activeMatch[1], 10)
      // server accepts handled requests
      //  reading: N writing: N waiting: N
      const rwMatch = lines[2]?.match(/reading:\s+(\d+)\s+writing:\s+(\d+)/)
      if (rwMatch) {
        result.nginx_reading = parseInt(rwMatch[1], 10)
        result.nginx_writing = parseInt(rwMatch[2], 10)
      }
    } catch {}

    // Read the actual Nginx master and worker RLIMIT_NOFILE values. A helper's
    // /proc/self/limits is not evidence for another process' inherited limit.
    function parseFdLimits(pid) {
      try {
        const limits = fs.readFileSync(`/proc/${pid}/limits`, "utf-8")
        const line = limits.split("\n").find((value) => value.startsWith("Max open files"))
        if (!line) return null
        const match = line.match(/^Max open files\s+(\d+|unlimited)\s+(\d+|unlimited)/)
        if (!match) return null
        const parse = (value) => value === "unlimited" ? Number.MAX_SAFE_INTEGER : parseInt(value, 10)
        return { soft: parse(match[1]), hard: parse(match[2]) }
      } catch {
        return null
      }
    }
    try {
      const nginxProcesses = []
      for (const entry of fs.readdirSync("/proc")) {
        if (!/^\d+$/.test(entry)) continue
        try {
          const comm = fs.readFileSync(`/proc/${entry}/comm`, "utf-8").trim()
          if (comm !== "nginx") continue
          const status = fs.readFileSync(`/proc/${entry}/status`, "utf-8")
          const parent = parseInt(status.match(/^PPid:\s+(\d+)/m)?.[1] || "0", 10)
          const cmdline = fs.readFileSync(`/proc/${entry}/cmdline`, "utf-8").replace(/\0/g, " ")
          nginxProcesses.push({ pid: parseInt(entry, 10), parent, cmdline })
        } catch {}
      }
      const master = nginxProcesses.find((process) => process.cmdline.includes("master process"))
        || nginxProcesses.find((process) => !nginxProcesses.some((candidate) => candidate.pid === process.parent))
      const workers = master
        ? nginxProcesses.filter((process) => process.parent === master.pid)
        : nginxProcesses.filter((process) => process.cmdline.includes("worker process"))
      const masterLimits = master ? parseFdLimits(master.pid) : null
      const workerLimits = workers.map((worker) => parseFdLimits(worker.pid)).filter(Boolean)
      result.nginx_master_pid = master?.pid ?? null
      result.nginx_worker_pids = workers.map((worker) => worker.pid)
      result.worker_processes = workers.length || result.worker_processes
      result.nginx_master_fd_soft = masterLimits?.soft ?? null
      result.nginx_master_fd_hard = masterLimits?.hard ?? null
      result.nginx_worker_fd_soft = workerLimits.length ? Math.min(...workerLimits.map((limit) => limit.soft)) : null
      result.nginx_worker_fd_hard = workerLimits.length ? Math.min(...workerLimits.map((limit) => limit.hard)) : null
    } catch {}

    // Read CPU quota from cgroup
    try {
      const cpuMax = fs.readFileSync("/sys/fs/cgroup/cpu.max", "utf-8").trim()
      const [quota, period] = cpuMax.split(" ")
      if (quota !== "max") {
        result.cpu_quota = Math.floor(parseInt(quota, 10) / parseInt(period, 10))
      }
    } catch {}

    // Compute total capacity
    if (result.worker_processes && result.worker_connections) {
      result.worker_connections_total = result.worker_processes * result.worker_connections
    }

    // Capacity is bounded independently for every worker by both the configured
    // worker_connections ceiling and that worker's actual RLIMIT_NOFILE.
    const PER_WORKER_FD_RESERVE = 256
    if (result.worker_processes && result.worker_connections && result.nginx_worker_fd_soft) {
      result.per_worker_connection_ceiling = Math.min(result.worker_connections, result.nginx_worker_fd_soft)
      const perWorker = Math.max(0, result.per_worker_connection_ceiling - PER_WORKER_FD_RESERVE)
      result.per_worker_usable_sse_capacity = perWorker
      result.usable_sse_capacity = result.worker_processes * perWorker
    }

    // Assess sufficiency against the requested aggregate target.
    const requestedTarget = (() => {
      try {
        const parsed = new URL(req.url, "http://localhost")
        const value = parseInt(parsed.searchParams.get("target") || "100000", 10)
        return Number.isInteger(value) && value > 0 ? value : 100000
      } catch { return 100000 }
    })()
    result.target_connections = requestedTarget
    const reasons = []
    const usableCapacity = result.usable_sse_capacity ?? result.worker_connections_total
    if (!result.nginx_master_fd_soft || !result.nginx_worker_fd_soft || result.nginx_worker_pids.length === 0) {
      reasons.push("actual Nginx master/worker RLIMIT_NOFILE could not be read")
    }
    if (usableCapacity === null || usableCapacity < requestedTarget) {
      reasons.push(`usable_sse_capacity=${usableCapacity} < ${requestedTarget}`)
    }
    if (result.cpu_quota && result.cpu_quota < 4) {
      reasons.push(`cpu_quota=${result.cpu_quota} < 4 (need >= 4 for DUT — frozen primary Nchan 4-CPU limit)`)
    }

    result.sufficient = reasons.length === 0
    result.reason = reasons.length > 0 ? reasons.join("; ") : "OK"

    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify(result))
  } else {
    res.writeHead(404)
    res.end("not found")
  }
})
server.listen(PORT, "0.0.0.0", () => {
  process.stdout.write(`control server listening on ${PORT}\n`)
})
