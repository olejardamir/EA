import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import {
  COORDINATED_PHASES,
  GlobalExperimentCoordinator,
} from "./application/global-coordinator.js"
import type {
  BarrierBoundary,
  CoordinatedPhase,
  ShardExperimentResult,
  ShardRegistration,
} from "./application/global-coordinator.js"

const port = parsePositiveInt(process.env.COORDINATOR_PORT ?? "3000", "COORDINATOR_PORT")
const shardCount = parsePositiveInt(process.env.SHARD_TOTAL ?? process.env.SHARD_COUNT ?? "4", "SHARD_TOTAL")
const globalTarget = parsePositiveInt(process.env.GLOBAL_TARGET ?? "100000", "GLOBAL_TARGET")
const seed = parseInt(process.env.GLOBAL_SEED ?? "42", 10)
if (!Number.isInteger(seed)) throw new Error("GLOBAL_SEED must be an integer")
const expectedSourceCommit = process.env.GIT_COMMIT_SHA
if (!expectedSourceCommit || !/^[0-9a-f]{40}$/i.test(expectedSourceCommit)) {
  throw new Error("GIT_COMMIT_SHA must be the full checkout SHA")
}

const coordinator = new GlobalExperimentCoordinator({
  experimentRunId: process.env.EXPERIMENT_RUN_ID || undefined,
  shardCount,
  globalTarget,
  seed,
})
const resultPath = process.env.GLOBAL_RESULT_PATH ?? "/tmp/evidence/global-result.json"
const maxRunMs = parsePositiveInt(process.env.COORDINATOR_MAX_RUN_MS ?? `${12 * 60_000}`, "COORDINATOR_MAX_RUN_MS")

function parsePositiveInt(value: string, name: string): number {
  const parsed = parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`)
  return parsed
}

function send(res: http.ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { "content-type": "application/json" })
  res.end(JSON.stringify(value))
}

async function body(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.length
    if (bytes > 100 * 1024 * 1024) throw new Error("request body exceeds 100 MiB")
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"))
}

let finalizing = false
function persistGlobalResult(): void {
  if (finalizing) return
  finalizing = true
  const result = coordinator.buildGlobalResult()
  fs.mkdirSync(path.dirname(resultPath), { recursive: true })
  const temporary = `${resultPath}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(result, null, 2)}\n`, "utf8")
  fs.renameSync(temporary, resultPath)
  // Exactly one global machine-readable result is emitted by the coordinator.
  process.stdout.write(`${JSON.stringify(result)}\n`)
  const exitCode = result.verdict === "ACCEPT" ? 0 : 1
  setImmediate(() => server.close(() => process.exit(exitCode)))
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/healthz") {
      send(res, 200, { status: "ok", experiment_run_id: coordinator.experimentRunId })
      return
    }
    if (req.method === "GET" && req.url === "/v1/status") {
      send(res, 200, {
        experiment_run_id: coordinator.experimentRunId,
        registered_shards: coordinator.registrationCount,
        collected_results: coordinator.resultCount,
        expected_shards: coordinator.shardCount,
        aborted: coordinator.aborted,
        complete: coordinator.complete,
      })
      return
    }
    if (req.method === "GET" && req.url === "/v1/result") {
      if (!coordinator.complete) {
        send(res, 409, { error: "global result is not complete" })
        return
      }
      send(res, 200, coordinator.buildGlobalResult())
      return
    }
    if (req.method !== "POST") {
      send(res, 404, { error: "not found" })
      return
    }

    const value = await body(req) as Record<string, unknown>
    if (req.url === "/v1/register") {
      if (value.source_commit !== expectedSourceCommit) throw new Error("source_commit does not match coordinator checkout")
      send(res, 200, coordinator.register(value as unknown as ShardRegistration))
      return
    }
    if (req.url === "/v1/barrier") {
      if (value.experiment_run_id !== coordinator.experimentRunId) throw new Error("experiment_run_id mismatch")
      const phase = value.phase as CoordinatedPhase
      const boundary = value.boundary as BarrierBoundary
      if (!COORDINATED_PHASES.includes(phase) || !["start", "end"].includes(boundary)) throw new Error("invalid barrier")
      const receipt = await coordinator.arrive(Number(value.shard_id), phase, boundary)
      send(res, 200, receipt)
      if (phase === "final-metrics" && boundary === "end" && coordinator.complete) persistGlobalResult()
      return
    }
    if (req.url === "/v1/abort") {
      coordinator.abort(`shard ${String(value.shard_id)}: ${String(value.reason ?? "unspecified")}`)
      send(res, 200, { aborted: true })
      setImmediate(persistGlobalResult)
      return
    }
    if (req.url === "/v1/result") {
      coordinator.submitResult(value as unknown as ShardExperimentResult)
      const complete = coordinator.complete
      send(res, complete ? 200 : 202, { accepted: true, complete })
      return
    }
    send(res, 404, { error: "not found" })
  } catch (error) {
    send(res, 400, { error: error instanceof Error ? error.message : String(error) })
  }
})

const deadline = setTimeout(() => {
  coordinator.abort(`coordinator deadline exceeded (${maxRunMs}ms)`)
  persistGlobalResult()
}, maxRunMs)
deadline.unref()
server.listen(port, "0.0.0.0", () => {
  process.stdout.write(`coordinator ready port=${port} experiment_run_id=${coordinator.experimentRunId} shards=${shardCount} global_target=${globalTarget} seed=${seed}\n`)
})
