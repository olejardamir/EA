#!/usr/bin/env node
"use strict"
const http = require("http")
const fs = require("fs")
const { execFile } = require("child_process")
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
  } else {
    res.writeHead(404)
    res.end("not found")
  }
})
server.listen(PORT, "0.0.0.0", () => {
  process.stdout.write(`control server listening on ${PORT}\n`)
})