import http from "node:http"
import type {
  AlignedSample,
  BarrierBoundary,
  BarrierReceipt,
  CoordinatedPhase,
  ShardExperimentResult,
  ShardRegistration,
} from "./global-coordinator.js"

export async function requestJson<T>(url: string, init: RequestInit, timeoutMs: number): Promise<T> {
  // Node fetch/Undici has an independent default headers timeout (~300s).
  // Coordinated barriers may legitimately wait longer, so use one explicit
  // transport deadline and never retry a failed measurement-plane request.
  return new Promise<T>((resolve, reject) => {
    const parsed = new URL(url)
    const request = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: `${parsed.pathname}${parsed.search}`,
      method: init.method ?? "GET",
      headers: init.headers as http.OutgoingHttpHeaders | undefined,
    }, (response) => {
      let responseBody = ""
      response.setEncoding("utf8")
      response.on("data", (chunk) => { responseBody += chunk })
      response.on("end", () => {
        const status = response.statusCode ?? 0
        if (status < 200 || status >= 300) {
          reject(new Error(`coordinator ${status}: ${responseBody}`))
          return
        }
        try {
          resolve(JSON.parse(responseBody) as T)
        } catch (error) {
          reject(new Error(`coordinator returned invalid JSON: ${String(error)}`))
        }
      })
    })
    request.setTimeout(timeoutMs, () => request.destroy(new Error(`coordinator request timeout after ${timeoutMs}ms`)))
    request.on("error", reject)
    if (typeof init.body === "string" || Buffer.isBuffer(init.body)) request.write(init.body)
    request.end()
  })
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
