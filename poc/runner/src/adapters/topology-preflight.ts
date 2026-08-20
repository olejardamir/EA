import { readFileSync } from "node:fs"
import os from "node:os"

// §4.2/§4.24: Topology and capacity preflight for 100k evidence mode
export interface TopologyPreflight {
  fd_soft_limit: number | null
  fd_hard_limit: number | null
  ephemeral_port_range: string | null
  ephemeral_port_count: number | null
  source_ip_count: number
  destination_tuple_capacity: number
  nginx_worker_processes: number
  nginx_worker_connections: number
  nginx_max_sse_capacity: number
  target_connections: number
  capacity_sufficient: boolean
  warnings: string[]
  // §4.24: Enhanced capacity proof fields
  non_viewer_fds: number
  fd_headroom: number | null
  subscribers_per_nchan_node: number
  nchan_node_count: number
  cpu_quota: number | null
  cpu_count: number
}

function readSysctl(key: string): string | null {
  try {
    return readFileSync(`/proc/sys/${key.replace(/\./g, "/")}`, "utf-8").trim()
  } catch {
    return null
  }
}

function readNoFileLimits(): { soft: number | null; hard: number | null } {
  try {
    const limits = readFileSync("/proc/self/limits", "utf-8")
    const line = limits.split("\n").find((l) => l.includes("Max open files"))
    if (!line) return { soft: null, hard: null }
    const parts = line.split(/\s+/)
    return {
      soft: parseInt(parts[3], 10) || null,
      hard: parseInt(parts[4], 10) || null,
    }
  } catch {
    return { soft: null, hard: null }
  }
}

// §4.24: Read CPU quota from cgroup v2 — cpu.max is a separate file from cpu.stat
function readCpuQuota(): number | null {
  // §3.3: cpu.max is at /sys/fs/cgroup/cpu.max (NOT inside cpu.stat)
  // Format: "$MAX $PERIOD" or "max $PERIOD" (unlimited)
  try {
    const max = readFileSync("/sys/fs/cgroup/cpu.max", "utf-8").trim()
    const parts = max.split(/\s+/)
    if (parts[0] === "max") return null // unlimited
    const quota = parseInt(parts[0], 10)
    const period = parseInt(parts[1], 10) || 100000
    if (isNaN(quota)) return null
    return Math.floor(quota / period)
  } catch {
    // Fallback: try cpu.stat cpu.max line (some cgroup v1/v2 hybrid mounts)
    try {
      const stat = readFileSync("/sys/fs/cgroup/cpu.stat", "utf-8")
      const maxLine = stat.split("\n").find((l) => l.startsWith("cpu.max"))
      if (!maxLine) return null
      const parts = maxLine.split(/\s+/)
      const quota = parseInt(parts[1], 10)
      if (parts[1] === "max" || isNaN(quota)) return null
      const period = parseInt(parts[2], 10) || 100000
      return Math.floor(quota / period)
    } catch {
      return null
    }
  }
}

// §4.24: Non-viewer FD overhead — Redis connection, Nchan control, publisher POST,
// event loop, stdin/stdout/stderr, listening sockets, internal nginx state.
// Conservative: 60 for internal sockets/state + 20 for Redis/control + 20 headroom.
const NON_VIEWER_FDS = 100

export function runTopologyPreflight(targetConnections: number, nginxWorkers = 4, nginxWorkerConns = 32768, nchanNodes = 2): TopologyPreflight {
  const warnings: string[] = []

  const { soft: fdSoft, hard: fdHard } = readNoFileLimits()

  const portRange = readSysctl("net.ipv4.ip_local_port_range")
  const ephemeralCount = portRange
    ? (() => {
        const parts = portRange.split(/[\s\t-]+/).map(Number)
        if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1]) || parts[0] > parts[1]) {
          warnings.push(`Failed to parse ephemeral port range: "${portRange}"`)
          return null
        }
        return parts[1] - parts[0] + 1
      })()
    : null

  // §4.2: Single source IP on host network — all connections share one source address
  const sourceIps = 1

  // §4.2: Destination tuples = source IPs × ephemeral ports
  const destTupleCapacity = sourceIps * (ephemeralCount ?? 0)

  // §4.24: Nginx capacity = workers × connections_per_worker
  const nginxMaxSseCapacity = nginxWorkers * nginxWorkerConns

  // §4.24: Non-viewer FD headroom
  const nonViewerFds = NON_VIEWER_FDS
  const requiredFds = targetConnections + nonViewerFds

  // §4.24: Assigned subscribers per Nchan node (even split)
  const subscribersPerNode = Math.ceil(targetConnections / nchanNodes)

  // §4.24: CPU quota from cgroup
  const cpuQuota = readCpuQuota()
  const cpuCount = os.cpus().length

  if (cpuQuota !== null && cpuQuota < nginxWorkers) {
    warnings.push(`CPU quota ${cpuQuota} cores < nginx worker_processes ${nginxWorkers} — may starve workers`)
  }

  const fdHeadroom = fdSoft !== null ? fdSoft - requiredFds : null
  if (fdHeadroom !== null && fdHeadroom < 0) {
    warnings.push(`FD headroom negative: ${fdHeadroom} (soft=${fdSoft}, required=${requiredFds})`)
  }

  const capacitySufficient = (() => {
    if (ephemeralCount === null) {
      warnings.push("Cannot parse /proc/sys/net/ipv4/ip_local_port_range — capacity cannot be verified")
      return false
    }
    if (fdSoft !== null && fdSoft < requiredFds) {
      warnings.push(`FD soft limit ${fdSoft} < required ${requiredFds} (target + non-viewer overhead)`)
      return false
    }
    if (ephemeralCount !== null && ephemeralCount < targetConnections) {
      warnings.push(`Ephemeral port range ${ephemeralCount} < target ${targetConnections}`)
      return false
    }
    if (nginxMaxSseCapacity < targetConnections) {
      warnings.push(`Nginx max capacity ${nginxMaxSseCapacity} < target ${targetConnections}`)
      return false
    }
    if (destTupleCapacity < targetConnections) {
      warnings.push(`Destination tuple capacity ${destTupleCapacity} (source_ips=${sourceIps} × ephemeral=${ephemeralCount}) < target ${targetConnections} — structurally insufficient for 100k`)
      return false
    }
    if (subscribersPerNode * nchanNodes < targetConnections) {
      warnings.push(`Subscriber capacity ${subscribersPerNode} × ${nchanNodes} nodes < target ${targetConnections}`)
      return false
    }
    return true
  })()

  return {
    fd_soft_limit: fdSoft,
    fd_hard_limit: fdHard,
    ephemeral_port_range: portRange,
    ephemeral_port_count: ephemeralCount,
    source_ip_count: sourceIps,
    destination_tuple_capacity: destTupleCapacity,
    nginx_worker_processes: nginxWorkers,
    nginx_worker_connections: nginxWorkerConns,
    nginx_max_sse_capacity: nginxMaxSseCapacity,
    target_connections: targetConnections,
    capacity_sufficient: capacitySufficient,
    warnings,
    non_viewer_fds: nonViewerFds,
    fd_headroom: fdHeadroom,
    subscribers_per_nchan_node: subscribersPerNode,
    nchan_node_count: nchanNodes,
    cpu_quota: cpuQuota,
    cpu_count: cpuCount,
  }
}
