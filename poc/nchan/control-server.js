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

function getNchanMetrics() {
  const metrics = {
    memory_current_bytes: null,
    memory_peak_bytes: null,
    cpu_usage_usec: null,
    cpu_throttled_count: null,
    cpu_throttled_usec: null,
    memory_oom_events: null,
    memory_oom_kill_events: null,
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
  } else if (req.method === "GET" && req.url === "/preflight") {
    // §4.24: Runtime nginx capacity preflight
    const result = {
      worker_processes: null,
      worker_connections: null,
      nginx_active: null,
      nginx_reading: null,
      nginx_writing: null,
      fd_soft_limit: null,
      fd_hard_limit: null,
      cpu_quota: null,
      worker_connections_total: null,
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

    // Read FD limits from /proc/self/limits
    try {
      const limits = fs.readFileSync("/proc/self/limits", "utf-8")
      for (const line of limits.split("\n")) {
        if (line.includes("Max open files")) {
          const parts = line.trim().split(/\s+/)
          result.fd_soft_limit = parseInt(parts[3], 10)
          result.fd_hard_limit = parseInt(parts[4], 10)
        }
      }
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

    // Assess sufficiency
    const reasons = []
    if (result.worker_connections_total && result.worker_connections_total < 100000) {
      reasons.push(`worker_connections_total=${result.worker_connections_total} < 100000`)
    }
    if (result.fd_soft_limit && result.fd_soft_limit < 200000) {
      reasons.push(`fd_soft_limit=${result.fd_soft_limit} < 200000`)
    }
    if (result.cpu_quota && result.cpu_quota < 2) {
      reasons.push(`cpu_quota=${result.cpu_quota} < 2 (need >= 4 for DUT)`)
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