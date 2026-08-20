import { Publisher, getMatchIds } from "./publisher.js"
import { LoadGenWorker } from "./loadgen.js"
import { aggregateMetrics, printSummary } from "./aggregator.js"
import type { WorkerMetrics } from "./types.js"

const NCHAN_PUB_URL = process.env.NCHAN_PUB_URL ?? "http://nchan:8080"
const NCHAN_SUB_URL = process.env.NCHAN_SUB_URL ?? "http://nchan:8081"
const WORKER_COUNT = parseInt(process.env.WORKER_COUNT ?? "4", 10)
const TARGET_CONNECTIONS = parseInt(process.env.TARGET_CONNECTIONS ?? "5000", 10)
const WARMUP_SECONDS = parseInt(process.env.WARMUP_SECONDS ?? "30", 10)
const MEASURE_SECONDS = parseInt(process.env.MEASURE_SECONDS ?? "120", 10)
const BURST_SECONDS = parseInt(process.env.BURST_SECONDS ?? "30", 10)
const COOLDOWN_SECONDS = parseInt(process.env.COOLDOWN_SECONDS ?? "10", 10)
const SLOW_SECONDS = parseInt(process.env.SLOW_SECONDS ?? "30", 10)

const matchIds = getMatchIds()
const eventLog = new Map<string, number[]>()
const matchHeads = new Map<string, number>()

function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 23)
  console.log(`[${ts}] ${msg}`)
}

async function waitForNchan(): Promise<void> {
  log("Waiting for Nchan to be ready...")
  const deadline = Date.now() + 60000
  while (Date.now() < deadline) {
    try {
      const resp = await fetch(`${NCHAN_PUB_URL}/pub/healthcheck`, { signal: AbortSignal.timeout(3000) })
      if (resp.ok) {
        log("Nchan is ready")
        return
      }
    } catch {}
    await sleep(1000)
  }
  throw new Error("Nchan not ready after 60s")
}

async function main(): Promise<void> {
  log("=== POC Runner Starting ===")
  log(`Config: ${WORKER_COUNT} workers, ${TARGET_CONNECTIONS} target connections`)
  log(`Phases: warmup=${WARMUP_SECONDS}s, steady=${MEASURE_SECONDS}s, burst=${BURST_SECONDS}s`)

  await waitForNchan()

  // Create publisher
  const publisher = new Publisher({
    pubUrl: NCHAN_PUB_URL,
    burstMode: false,
    eventLog,
    onHeadUpdate: (matchId, seq) => {
      matchHeads.set(matchId, seq)
    },
  })

  // Create loadgen workers
  const connectionsPerWorker = Math.ceil(TARGET_CONNECTIONS / WORKER_COUNT)
  const workers: LoadGenWorker[] = []

  for (let i = 0; i < WORKER_COUNT; i++) {
    workers.push(
      new LoadGenWorker({
        workerId: i,
        subUrl: NCHAN_SUB_URL,
        connectionsPerWorker,
        connectionOffset: i * connectionsPerWorker,
        matchIds,
        burstMode: false,
        slowConsumerFraction: 0.05,
      })
    )
  }

  // Phase 1: Warm-up
  log(`\n--- PHASE: WARMUP (${WARMUP_SECONDS}s) ---`)
  publisher.start(true)

  log(`Connecting ${TARGET_CONNECTIONS} SSE clients...`)
  const connectStart = Date.now()
  await Promise.all(workers.map((w) => w.connectAll()))
  const connectDuration = Date.now() - connectStart
  log(`All connections established in ${connectDuration}ms`)

  // Wait for warm-up
  await sleep(WARMUP_SECONDS * 1000)
  log("Warm-up complete")

  // Phase 2: Steady-state measurement
  log(`\n--- PHASE: STEADY MEASUREMENT (${MEASURE_SECONDS}s) ---`)

  // Start event loop monitoring
  const loopMonitor = setInterval(() => {
    for (const w of workers) w.measureEventLoop()
  }, 100)

  const steadyStart = Date.now()

  // Late-join test at t=90s of steady
  const lateJoinPromise = (async () => {
    await sleep(90000)
    log("Executing late-join test...")
    const testMatch = matchIds[0]
    const head = matchHeads.get(testMatch) ?? 0
    if (head > 0) {
      // Use the last worker for late-join test
      const worker = workers[workers.length - 1]
      const latency = await worker.doLateJoin(testMatch, head)
      if (latency >= 0) {
        log(`Late-join: caught up to seq ${head} in ${latency}ms`)
      } else {
        log("Late-join: timed out")
      }
    }
  })()

  await sleep(MEASURE_SECONDS * 1000)
  const steadyDuration = Date.now() - steadyStart
  log(`Steady measurement complete (${steadyDuration}ms)`)

  // Phase 3: Burst
  log(`\n--- PHASE: BURST (${BURST_SECONDS}s) ---`)
  publisher.stop()
  await sleep(500)
  publisher.burstMode = true
  publisher.start(false)

  await sleep(BURST_SECONDS * 1000)
  log("Burst complete")

  // Phase 4: Post-burst steady
  log(`\n--- PHASE: POST-BURST STEADY (${COOLDOWN_SECONDS}s) ---`)
  publisher.stop()
  await sleep(500)
  publisher.burstMode = false
  publisher.start(true)

  await sleep(COOLDOWN_SECONDS * 1000)
  log("Post-burst steady complete")

  // Phase 5: Reconnect test
  log(`\n--- PHASE: RECONNECT TEST ---`)
  await publisher.stop()

  // Pick first 100 connections from first worker to reconnect
  log("Disconnecting connections for reconnect test...")
  const worker0 = workers[0]
  await worker0.reconnectAll(2000)

  await sleep(10000)
  log("Reconnect test complete")

  // Wait for late-join to finish
  await lateJoinPromise

  // Collect metrics
  log("\n--- COLLECTING METRICS ---")
  clearInterval(loopMonitor)
  const allMetrics: WorkerMetrics[] = workers.map((w) => w.getMetrics())
  const aggregated = aggregateMetrics(allMetrics)

  // Print results
  printSummary(aggregated, publisher.totalPublished)

  // Shutdown
  log("\nShutting down...")
  publisher.stop()
  for (const w of workers) {
    try {
      await w.disconnectAll()
    } catch {}
  }

  log("=== POC Runner Complete ===")
}

main().catch((err) => {
  console.error("Fatal error:", err)
  process.exit(1)
})

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
