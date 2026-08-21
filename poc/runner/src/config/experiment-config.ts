export interface ExperimentConfig {
  nchanPubUrl: string
  nchanSubUrl: string
  nchan2SubUrl: string
  nchan2PubUrl?: string
  nchanControlUrl: string
  redisUrl: string
  targetConnections: number
  warmupSeconds: number
  measureSeconds: number
  burstSeconds: number
  surgeSeconds?: number
  cooldownSeconds: number
  slowConsumerFraction: number
  lobbyFraction: number
  historyUrl: string
  seed: number
  runProfile: "smoke" | "evidence"
  runMode: "single" | "evidence" | "coordinated-shard"
  // v2.1.0: partitioned-topology wiring — spare node + restart drill target
  nchanSpareSubUrl: string
  nchanSparePubUrl?: string
  nchanSpareControlUrl: string
  restartTargetShard: number
  nchanMemoryGb: number
}

function requirePositiveInt(value: string | undefined, name: string, fallback?: number): number {
  if (value === undefined) {
    if (fallback === undefined) throw new Error(`Missing required env var: ${name}`)
    return fallback
  }
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

function requireFraction(value: string | undefined, name: string, fallback: number): number {
  if (value === undefined) return fallback
  const parsed = parseFloat(value)
  if (isNaN(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`Invalid ${name}: "${value}" must be a fraction between 0 and 1`)
  }
  return parsed
}

export function loadConfig(): ExperimentConfig {
  const nchanPubUrl = requireUrl(process.env.NCHAN_PUB_URL, "NCHAN_PUB_URL", "http://localhost:8080")
  const nchanSubUrl = requireUrl(process.env.NCHAN_SUB_URL, "NCHAN_SUB_URL", "http://localhost:8081")

  return {
    nchanPubUrl,
    nchanSubUrl,
    nchan2SubUrl: process.env.NCHAN2_SUB_URL ?? "",
    nchan2PubUrl: process.env.NCHAN2_PUB_URL
      ? requireUrl(process.env.NCHAN2_PUB_URL, "NCHAN2_PUB_URL", "")
      : undefined,
    nchanControlUrl: process.env.NCHAN_CONTROL_URL ?? "",
    redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
    targetConnections: requirePositiveInt(process.env.TARGET_CONNECTIONS, "TARGET_CONNECTIONS"),
    warmupSeconds: requirePositiveInt(process.env.WARMUP_SECONDS, "WARMUP_SECONDS", 30),
    measureSeconds: requirePositiveInt(process.env.MEASURE_SECONDS, "MEASURE_SECONDS", 120),
    burstSeconds: requirePositiveInt(process.env.BURST_SECONDS, "BURST_SECONDS", 30),
    surgeSeconds: requirePositiveInt(process.env.SURGE_SECONDS, "SURGE_SECONDS", 120),
    cooldownSeconds: requirePositiveInt(process.env.COOLDOWN_SECONDS, "COOLDOWN_SECONDS", 10),
    // §BR: Wire slowConsumerFraction from env (SLOW_CONSUMER_FRACTION) instead of hardcoding
    slowConsumerFraction: parseFloat(process.env.SLOW_CONSUMER_FRACTION ?? "0.05"),
    lobbyFraction: parseFloat(process.env.LOBBY_FRACTION ?? "0.02"),
    historyUrl: nchanSubUrl,
    seed: requirePositiveInt(process.env.SEED, "SEED", 42),
    runProfile: (process.env.RUN_PROFILE === "evidence" ? "evidence" : "smoke") as "smoke" | "evidence",
    runMode: process.env.RUN_MODE === "evidence"
      ? "evidence"
      : process.env.RUN_MODE === "coordinated-shard"
        ? "coordinated-shard"
        : "single",
    // v2.1.0: spare node + restart drill wiring (empty strings = feature absent)
    nchanSpareSubUrl: process.env.NCHAN_SPARE_SUB_URL
      ? requireUrl(process.env.NCHAN_SPARE_SUB_URL, "NCHAN_SPARE_SUB_URL", "")
      : "",
    nchanSparePubUrl: process.env.NCHAN_SPARE_PUB_URL
      ? requireUrl(process.env.NCHAN_SPARE_PUB_URL, "NCHAN_SPARE_PUB_URL", "")
      : undefined,
    nchanSpareControlUrl: process.env.NCHAN_SPARE_CONTROL_URL ?? "",
    // §v2.1.0: 1-based shard number; default 4 = last shard (index 3), matching
    // the coordinator's restartTargetShard = shardCount - 1.
    restartTargetShard: requirePositiveInt(process.env.RESTART_TARGET_SHARD, "RESTART_TARGET_SHARD", 4) - 1,
    nchanMemoryGb: requirePositiveInt(process.env.NCHAN_MEMORY_GB, "NCHAN_MEMORY_GB", 8),
  }
}
