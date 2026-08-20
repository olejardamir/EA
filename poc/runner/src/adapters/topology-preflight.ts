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

export function runTopologyPreflight(targetConnections: number, nginxWorkers = 4, nginxWorkerConns = 32768): TopologyPreflight {
  const warnings: string[] = []

  const { soft: fdSoft, hard: fdHard } = readNoFileLimits()

  const portRange = readSysctl("net.ipv4.ip_local_port_range")
  const ephemeralCount = portRange
    ? (() => {
        const [lo, hi] = portRange.split("-").map(Number)
        return hi - lo + 1
      })()
    : null

  // §4.2: Single source IP on host network — all connections share one source address
  // On host network, the runner shares the host's network namespace
  const sourceIps = 1

  // §4.2: Destination tuples = source IPs × ephemeral ports
  // Each SSE connection uses one ephemeral port from the runner's source
  const destTupleCapacity = sourceIps * (ephemeralCount ?? 28232)

  // §4.24: Nginx capacity = workers × connections_per_worker
  const nginxMaxSseCapacity = nginxWorkers * nginxWorkerConns

  // §4.24: Check FD headroom — each SSE connection needs at least one FD
  // Plus FDs for Redis, Nchan control, publisher, event loop, etc.
  const overheadFds = 100 // Redis, control connections, stdin/stdout/stderr, event loop, etc.
  const requiredFds = targetConnections + overheadFds

  const capacitySufficient = (() => {
    if (fdSoft !== null && fdSoft < requiredFds) {
      warnings.push(`FD soft limit ${fdSoft} < required ${requiredFds} (target + overhead)`)
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
  }
}
