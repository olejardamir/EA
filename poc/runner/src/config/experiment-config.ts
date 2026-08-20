export interface ExperimentConfig {
  nchanPubUrl: string
  nchanSubUrl: string
  redisUrl: string
  workerCount: number
  targetConnections: number
  warmupSeconds: number
  measureSeconds: number
  burstSeconds: number
  cooldownSeconds: number
  slowConsumerFraction: number
  historyUrl: string
}

function requirePositiveInt(value: string | undefined, name: string, fallback: number): number {
  if (value === undefined) return fallback
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name}: "${value}" must be a positive integer`)
  }
  return parsed
}

function requireUrl(value: string | undefined, name: string, fallback: string): string {
  if (value === undefined) return fallback
  try {
    new URL(value)
    return value
  } catch {
    throw new Error(`Invalid ${name}: "${value}" is not a valid URL`)
  }
}

export function loadConfig(): ExperimentConfig {
  const nchanPubUrl = requireUrl(process.env.NCHAN_PUB_URL, "NCHAN_PUB_URL", "http://localhost:8080")
  const nchanSubUrl = requireUrl(process.env.NCHAN_SUB_URL, "NCHAN_SUB_URL", "http://localhost:8081")

  return {
    nchanPubUrl,
    nchanSubUrl,
    redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
    workerCount: requirePositiveInt(process.env.WORKER_COUNT, "WORKER_COUNT", 4),
    targetConnections: requirePositiveInt(process.env.TARGET_CONNECTIONS, "TARGET_CONNECTIONS", 10000),
    warmupSeconds: requirePositiveInt(process.env.WARMUP_SECONDS, "WARMUP_SECONDS", 30),
    measureSeconds: requirePositiveInt(process.env.MEASURE_SECONDS, "MEASURE_SECONDS", 60),
    burstSeconds: requirePositiveInt(process.env.BURST_SECONDS, "BURST_SECONDS", 30),
    cooldownSeconds: requirePositiveInt(process.env.COOLDOWN_SECONDS, "COOLDOWN_SECONDS", 10),
    slowConsumerFraction: 0.05,
    historyUrl: nchanSubUrl,
  }
}
