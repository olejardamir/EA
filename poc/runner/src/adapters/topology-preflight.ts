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
  // §3.2: Multi-shard topology recommendation
  recommended_shard_count: number
  shard_capacity_each: number
  topology_note: string | null
  // §3.2: Aggregate capacity across all shards
  shard_count: number
  aggregate_target_connections: number
  aggregate_destination_tuple_capacity: number
  viewer_sockets: number
  non_viewer_outbound_sockets: number
  reconnect_time_wait_allowance: number
  source_port_safety_margin: number
  source_port_required: number
  source_port_headroom: number | null
  source_port_headroom_valid: boolean
}

function readSysctl(key: string): string | null {
  try {
    return readFileSync(`/proc/sys/${key.replace(/\./g, "/")}`, "utf-8").trim()
  } catch {
    return null
  }
}

// §3.3: Read runner container's own FD limits — used as fallback when Nginx container limits unavailable
function readRunnerFdLimits(): { soft: number | null; hard: number | null } {
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

// Actual Nginx worker limits are obtained from /proc/<worker-pid>/limits by
// the Nchan control helper and may be supplied here for capacity arithmetic.
export interface NginxFdLimits {
  soft: number | null
  hard: number | null
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
export const NON_VIEWER_OUTBOUND_SOCKETS = 64
export const RECONNECT_TIME_WAIT_FRACTION = 0.10
export const SOURCE_PORT_SAFETY_MARGIN = 512
const NGINX_PER_WORKER_FD_RESERVE = 256

export function sourcePortHeadroom(targetConnections: number, ephemeralPortCount: number | null) {
  const reconnectTimeWaitAllowance = Math.ceil(targetConnections * RECONNECT_TIME_WAIT_FRACTION)
  const required = targetConnections + NON_VIEWER_OUTBOUND_SOCKETS + reconnectTimeWaitAllowance + SOURCE_PORT_SAFETY_MARGIN
  const headroom = ephemeralPortCount === null ? null : ephemeralPortCount - required
  return {
    viewer_sockets: targetConnections,
    non_viewer_outbound_sockets: NON_VIEWER_OUTBOUND_SOCKETS,
    reconnect_time_wait_allowance: reconnectTimeWaitAllowance,
    source_port_safety_margin: SOURCE_PORT_SAFETY_MARGIN,
    source_port_required: required,
    source_port_headroom: headroom,
    source_port_headroom_valid: headroom !== null && headroom >= 0,
  }
}

export function runTopologyPreflight(
  targetConnections: number,
  nginxWorkers = 4,
  nginxWorkerConns = 32768,
  nchanNodes = 1,
  nginxFdLimits?: NginxFdLimits,
): TopologyPreflight {
  const warnings: string[] = []

  // These are the runner/generator process limits. Nginx is validated separately
  // using the worker RLIMIT supplied by its control endpoint.
  const fdLimits = readRunnerFdLimits()
  const fdSoft = fdLimits.soft
  const fdHard = fdLimits.hard

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
  const portHeadroom = sourcePortHeadroom(targetConnections, ephemeralCount)

  // §3.2: Source IP count from multi-shard topology
  // Each Docker bridge-networked runner container gets a distinct source IP.
  // SHARD_TOTAL is canonical; SHARD_COUNT is legacy fallback.
  const shardCount = parseInt(process.env.SHARD_TOTAL ?? process.env.SHARD_COUNT ?? "1", 10) || 1
  const sourceIps = shardCount

  // §4.2: Destination tuples = source IPs × ephemeral ports
  const destTupleCapacity = sourceIps * (ephemeralCount ?? 0)

  // §4.24: Nginx capacity = workers × connections_per_worker
  // §3.3.C: Subtract non-viewer FDs (Redis, control, event loop, etc.) from usable SSE capacity
  const perWorkerConfiguredCapacity = nginxFdLimits?.soft
    ? Math.max(0, Math.min(nginxWorkerConns, nginxFdLimits.soft) - NGINX_PER_WORKER_FD_RESERVE)
    : Math.max(0, nginxWorkerConns - NGINX_PER_WORKER_FD_RESERVE)
  const nginxMaxSseCapacity = nginxWorkers * perWorkerConfiguredCapacity

  // §4.24: Non-viewer FD headroom
  const nonViewerFds = NON_VIEWER_FDS
  const requiredFds = targetConnections + nonViewerFds

  // §3.4.D: Live 100k subscriber load is directed to nchan-primary only.
  // nchan-2 is a replacement/recovery node, not a second capacity node.
  // Capacity must be proven against the primary node receiving all subscriber connections.
  const subscribersPerNode = targetConnections

  // §3.3: CPU quota is per-container. Runner CPU quota validates generator validity;
  // Nchan CPU quota validates DUT capacity. Do not cross-compare.
  const cpuQuota = readCpuQuota()
  const cpuCount = os.cpus().length

  const fdHeadroom = fdSoft !== null ? fdSoft - requiredFds : null
  if (fdHeadroom !== null && fdHeadroom < 0) {
    warnings.push(`FD headroom negative: ${fdHeadroom} (soft=${fdSoft}, required=${requiredFds})`)
  }

  const capacitySufficient = (() => {
    // §3.2: Aggregate target across all shards
    const aggregateTarget = targetConnections * shardCount
    if (ephemeralCount === null) {
      warnings.push("Cannot parse /proc/sys/net/ipv4/ip_local_port_range — capacity cannot be verified")
      return false
    }
    if (fdSoft !== null && fdSoft < requiredFds) {
      warnings.push(`FD soft limit ${fdSoft} < required ${requiredFds} (target + non-viewer overhead)`)
      return false
    }
    if (!portHeadroom.source_port_headroom_valid) {
      warnings.push(`Source-port headroom invalid: available=${ephemeralCount ?? "unknown"}, required=${portHeadroom.source_port_required} (viewers=${targetConnections} + non-viewer=${NON_VIEWER_OUTBOUND_SOCKETS} + reconnect/TIME_WAIT=${portHeadroom.reconnect_time_wait_allowance} + safety=${SOURCE_PORT_SAFETY_MARGIN})`)
      return false
    }
    if (nginxMaxSseCapacity < targetConnections) {
      warnings.push(`Nginx max capacity ${nginxMaxSseCapacity} < per-shard target ${targetConnections}`)
      return false
    }
    // §3.4.C: Nginx is shared across all shards — compare against aggregate target, not per-shard
    if (nginxMaxSseCapacity < aggregateTarget) {
      warnings.push(`Nginx usable capacity ${nginxMaxSseCapacity} < aggregate subscriber target ${aggregateTarget} (${shardCount} shards × ${targetConnections})`)
      return false
    }
    if (destTupleCapacity < aggregateTarget) {
      warnings.push(`Aggregate destination tuple capacity ${destTupleCapacity} (${sourceIps} shards × ephemeral=${ephemeralCount}) < aggregate target ${aggregateTarget} — structurally insufficient`)
      return false
    }
    if (subscribersPerNode * nchanNodes < targetConnections) {
      warnings.push(`Subscriber capacity ${subscribersPerNode} × ${nchanNodes} nodes < per-shard target ${targetConnections}`)
      return false
    }
    return true
  })()

  // §3.2: Multi-shard recommendation — each shard needs its own source IP/namespace
  // Single source IP = ~28k ephemeral ports max. Need ceil(target / ports_per_shard) shards.
  const portsPerShard = ephemeralCount ?? 28000
  const recommendedShardCount = Math.max(1, Math.ceil(targetConnections / portsPerShard))
  const shardCapacityEach = recommendedShardCount > 0 ? Math.ceil(targetConnections / recommendedShardCount) : targetConnections
  const topologyNote = sourceIps === 1 && targetConnections > portsPerShard
    ? `Single source IP (${sourceIps}) cannot establish ${targetConnections} connections (ephemeral port limit ${portsPerShard}). Recommend ${recommendedShardCount} generator shards with distinct network namespaces/source IPs.`
    : null

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
    recommended_shard_count: recommendedShardCount,
    shard_capacity_each: shardCapacityEach,
    topology_note: topologyNote,
    shard_count: shardCount,
    aggregate_target_connections: targetConnections * shardCount,
    aggregate_destination_tuple_capacity: destTupleCapacity,
    ...portHeadroom,
  }
}
