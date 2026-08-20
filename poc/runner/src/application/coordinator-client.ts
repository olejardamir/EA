import type {
  AlignedSample,
  BarrierBoundary,
  BarrierReceipt,
  CoordinatedPhase,
  ShardExperimentResult,
  ShardRegistration,
} from "./global-coordinator.js"

async function requestJson<T>(url: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  const body = await response.text()
  if (!response.ok) throw new Error(`coordinator ${response.status}: ${body}`)
  return JSON.parse(body) as T
}

export class CoordinatedShardClient {
  readonly baseUrl: string
  readonly registration: ShardRegistration
  experimentRunId: string | null = null
  private sampler: ReturnType<typeof setInterval> | null = null
  private samples: AlignedSample[] = []
  private currentPhase: CoordinatedPhase = "preflight"

  constructor(baseUrl: string, registration: ShardRegistration) {
    this.baseUrl = baseUrl.replace(/\/$/, "")
    this.registration = registration
  }

  async register(): Promise<{ experiment_run_id: string; seed: number; global_target: number }> {
    const response = await requestJson<{ experiment_run_id: string; seed: number; global_target: number }>(
      `${this.baseUrl}/v1/register`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(this.registration) },
      10_000,
    )
    this.experimentRunId = response.experiment_run_id
    return response
  }

  async barrier(phase: CoordinatedPhase, boundary: BarrierBoundary): Promise<BarrierReceipt> {
    if (!this.experimentRunId) throw new Error("coordinator registration is required before barriers")
    this.currentPhase = phase
    return requestJson<BarrierReceipt>(
      `${this.baseUrl}/v1/barrier`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ experiment_run_id: this.experimentRunId, shard_id: this.registration.shard_id, phase, boundary }),
      },
      11 * 60_000,
    )
  }

  startSampling(read: () => Omit<AlignedSample, "timestamp_ms" | "phase">, intervalMs = 250): void {
    if (this.sampler) throw new Error("coordinator sampler already started")
    const capture = () => this.samples.push({ timestamp_ms: Date.now(), phase: this.currentPhase, ...read() })
    capture()
    this.sampler = setInterval(capture, intervalMs)
  }

  stopSampling(): AlignedSample[] {
    if (this.sampler) clearInterval(this.sampler)
    this.sampler = null
    return [...this.samples]
  }

  async submitResult(result: ShardExperimentResult): Promise<{ accepted: boolean; complete: boolean }> {
    return requestJson(
      `${this.baseUrl}/v1/result`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(result) },
      30_000,
    )
  }

  async abort(reason: string): Promise<void> {
    try {
      await requestJson(
        `${this.baseUrl}/v1/abort`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ shard_id: this.registration.shard_id, reason }),
        },
        5_000,
      )
    } catch {
      // The coordinator may itself be the failure. Preserve the original error.
    }
  }
}
