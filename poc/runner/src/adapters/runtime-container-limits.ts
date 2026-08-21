import { readFileSync } from "node:fs"

// §M2-3.3A: Machine evidence must describe the ACTUAL launched topology, never
// stale hard-coded constants. Runner limits are read from the live process and
// its own cgroup; DUT service limits are resolved from the environment the
// compose launcher explicitly provides (null when unknown — an honest unknown
// is preferred over a plausible but wrong number).

export interface ServiceResourceLimits {
  cpus: number | null
  memory_gb: number | null
  nofile_soft: number | null
  nofile_hard: number | null
}

export interface RuntimeContainerLimits {
  nchan: ServiceResourceLimits
  nchan_2: ServiceResourceLimits
  redis: ServiceResourceLimits
  runner: ServiceResourceLimits
}

export function parseProcLimitsMaxOpenFiles(text: string): { soft: number | null; hard: number | null } {
  const line = text.split("\n").find((l) => l.includes("Max open files"))
  if (!line) return { soft: null, hard: null }
  const parts = line.trim().split(/\s+/)
  return {
    soft: Number.parseInt(parts[3], 10) || null,
    hard: Number.parseInt(parts[4], 10) || null,
  }
}

// "400000 100000" -> 4 cores; "max 100000" -> null (unlimited)
export function parseCpuMaxCores(text: string | null): number | null {
  if (!text) return null
  const [quota, period] = text.trim().split(/\s+/)
  if (quota === "max") return null
  const quotaNum = Number.parseInt(quota, 10)
  const periodNum = Number.parseInt(period, 10)
  if (Number.isNaN(quotaNum) || Number.isNaN(periodNum) || periodNum <= 0) return null
  return quotaNum / periodNum
}

// "8589934592" -> 8 GiB; "max" -> null (unlimited)
export function parseMemoryMaxGiB(text: string | null): number | null {
  if (!text) return null
  const trimmed = text.trim()
  if (trimmed === "max") return null
  const bytes = Number.parseInt(trimmed, 10)
  if (Number.isNaN(bytes)) return null
  return bytes / (1024 * 1024 * 1024)
}

function envInt(env: Record<string, string | undefined>, key: string): number | null {
  const raw = env[key]
  if (raw === undefined || raw === "") return null
  const parsed = Number.parseInt(raw, 10)
  return Number.isNaN(parsed) ? null : parsed
}

function serviceLimitsFromEnv(
  env: Record<string, string | undefined>,
  prefix: string,
): ServiceResourceLimits {
  const quota = envInt(env, `${prefix}_CPU_MAX_QUOTA`)
  const period = envInt(env, `${prefix}_CPU_MAX_PERIOD`)
  const cpus = quota !== null && period !== null && period > 0 ? quota / period : null
  return {
    cpus,
    memory_gb: envInt(env, `${prefix}_MEMORY_GB`),
    nofile_soft: envInt(env, `${prefix}_NOFILE_SOFT`),
    nofile_hard: envInt(env, `${prefix}_NOFILE_HARD`),
  }
}

export function resolveRuntimeContainerLimits(
  env: Record<string, string | undefined> = process.env,
  readFile: (path: string) => string = (path) => readFileSync(path, "utf8"),
): RuntimeContainerLimits {
  let runnerNofile = { soft: null as number | null, hard: null as number | null }
  let runnerCpus: number | null = null
  let runnerMemoryGb: number | null = null
  try {
    runnerNofile = parseProcLimitsMaxOpenFiles(readFile("/proc/self/limits"))
    runnerCpus = parseCpuMaxCores(readFile("/sys/fs/cgroup/cpu.max"))
    runnerMemoryGb = parseMemoryMaxGiB(readFile("/sys/fs/cgroup/memory.max"))
  } catch {}

  return {
    nchan: serviceLimitsFromEnv(env, "NCHAN"),
    nchan_2: serviceLimitsFromEnv(env, "NCHAN2"),
    redis: serviceLimitsFromEnv(env, "REDIS"),
    runner: {
      cpus: runnerCpus,
      memory_gb: runnerMemoryGb,
      nofile_soft: runnerNofile.soft,
      nofile_hard: runnerNofile.hard,
    },
  }
}
