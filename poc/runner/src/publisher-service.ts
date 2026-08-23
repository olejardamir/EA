import http from "node:http"
import { NchanHttpPublisher } from "./adapters/nchan-http-publisher.js"
import { RoutedNchanPublisher } from "./adapters/routed-nchan-publisher.js"
import { MatchEventPublisher } from "./adapters/match-event-publisher.js"
import { createMatchHeadTracker } from "./domain/match-state.js"
import { createPRNG } from "./domain/prng.js"
import { MATCH_IDS } from "./domain/event.js"
import { resetRedisForExperiment } from "./adapters/redis-run-isolation.js"

const port = parseInt(process.env.PUBLISHER_PORT ?? "8300", 10)
const nchanPubUrl = (process.env.NCHAN_PUB_URL ?? process.env.PUBLISHER_NCHAN_PUB_URL ?? "http://localhost:8080").replace(/\/$/, "")
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379"
const seed = parseInt(process.env.GLOBAL_SEED ?? "42", 10)

function createPublisher(baseUrl: string) {
  const routesRaw = process.env.NCHAN_PUB_ROUTES
  if (routesRaw) {
    try {
      const routes = JSON.parse(routesRaw) as Record<string, string[]>
      if (routes && typeof routes === "object" && Object.keys(routes).length > 0) return new RoutedNchanPublisher(baseUrl, routes)
    } catch {}
  }
  return new NchanHttpPublisher(baseUrl)
}

let nchanPublisher: InstanceType<typeof NchanHttpPublisher> | InstanceType<typeof RoutedNchanPublisher> = createPublisher(nchanPubUrl)
let headTracker = createMatchHeadTracker()
let random = createPRNG(seed)
let publisher = new MatchEventPublisher({
  publisher: nchanPublisher,
  headTracker,
  burstMode: false,
  random,
})

let started = false
let burstActive = false
let burstTimer: NodeJS.Timeout | null = null
let pendingPeak = 0

function trackPendingPeak(): void {
  pendingPeak = Math.max(pendingPeak, publisher.pendingPublishes)
}
const pendingInterval = setInterval(trackPendingPeak, 50)
pendingInterval.unref()

// Diagnostic event-loop-lag monitor: a 50ms periodic timer measures how much
// extra wall-clock time each tick takes. Sustained high lag attributes
// burst-rate shortfalls to publisher CPU starvation rather than Nchan latency.
const LOOP_LAG_SAMPLE_MS = 50
let loopLagSamples: number[] = []
let loopLagLast = performance.now()
const loopLagMonitor = setInterval(() => {
  const now = performance.now()
  const lag = now - loopLagLast - LOOP_LAG_SAMPLE_MS
  loopLagLast = now
  if (lag > 0) {
    loopLagSamples.push(lag)
    if (loopLagSamples.length > 2000) loopLagSamples = loopLagSamples.slice(-1000)
  }
}, LOOP_LAG_SAMPLE_MS)
loopLagMonitor.unref()

function loopLagP95(): number {
  if (loopLagSamples.length === 0) return 0
  const sorted = [...loopLagSamples].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
}

function loopLagMax(): number {
  return loopLagSamples.length > 0 ? Math.max(...loopLagSamples) : 0
}

function send(res: http.ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { "content-type": "application/json" })
  res.end(JSON.stringify(value))
}

async function body(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  const raw = Buffer.concat(chunks).toString("utf8").trim()
  if (!raw) return {}
  return JSON.parse(raw)
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/healthz") {
      send(res, 200, { status: "ok", started, burst_active: burstActive })
      return
    }
    if (req.method === "GET" && req.url === "/v1/evidence") {
      const heads: Record<string, any> = {}
      for (const id of MATCH_IDS) {
        const seq = headTracker.getHead(id)
        if (seq <= 0) continue
        const st = headTracker.getHeadState(id)
        const idx = MATCH_IDS.indexOf(id)
        const ms: any = (publisher as any).matchStates?.[idx]
        heads[id] = {
          seq,
          state: st ? { score: st.score, clock: { period: st.clock.period, elapsed_seconds: st.clock.elapsed } } : { score: { home: 0, away: 0 }, clock: { period: "1H", elapsed_seconds: 0 } },
          last_event_type: ms?.last_event_type ?? "unknown",
        }
      }
      const s = nchanPublisher.stats
      const totals = {
        published: publisher.totalPublished,
        attempts: s.attempts,
        definite_failures: s.definiteFailures,
        ambiguous_failures: s.ambiguousFailures,
        pending_peak: pendingPeak,
      }
      send(res, 200, {
        started,
        heads,
        totals,
        burst_active: burstActive,
        // R11 diagnostics: attribute rate shortfalls precisely. publish RTT
        // p95 = acceptance minus transmission (includes Nchan); loop lag p95
        // isolates publisher CPU starvation from Nchan latency.
        scheduler_lag_max_ms: Math.round(publisher.schedulerLagMax * 100) / 100,
        loop_lag_p95_ms: Math.round(loopLagP95() * 100) / 100,
        loop_lag_max_ms: Math.round(loopLagMax() * 100) / 100,
        fetched_at_ms: Date.now(),
      })
      return
    }
    if (req.method !== "POST") {
      send(res, 404, { error: "not found" })
      return
    }
    if (req.url === "/v1/reset") {
      await body(req).catch(() => ({}))
      try {
        await resetRedisForExperiment(redisUrl)
      } catch (e) {
        send(res, 500, { error: `redis reset failed: ${e instanceof Error ? e.message : String(e)}` })
        return
      }
      if (burstTimer) { clearTimeout(burstTimer); burstTimer = null }
      burstActive = false
      publisher.stop()
      started = false
      pendingPeak = 0
      nchanPublisher = createPublisher(nchanPubUrl)
      headTracker = createMatchHeadTracker()
      random = createPRNG(seed)
      publisher = new MatchEventPublisher({ publisher: nchanPublisher as any, headTracker, burstMode: false, random })
      send(res, 200, { ok: true })
      return
    }
    if (req.url === "/v1/start") {
      await body(req).catch(() => ({}))
      if (!started) {
        publisher.start(true)
        started = true
      }
      send(res, 200, { ok: true, started })
      return
    }
    if (req.url === "/v1/stop") {
      await body(req).catch(() => ({}))
      if (burstTimer) { clearTimeout(burstTimer); burstTimer = null }
      burstActive = false
      publisher.burstMode = false
      await publisher.drain(5000)
      started = false
      send(res, 200, { ok: true })
      return
    }
    if (req.url === "/v1/prefill") {
      const v = await body(req) as { match_id?: string; count?: number; event_type?: string }
      const matchId = String(v.match_id ?? "")
      const count = Number(v.count ?? 0)
      const eventType = String(v.event_type ?? "corner")
      if (!MATCH_IDS.includes(matchId)) { send(res, 400, { error: `unknown match_id ${matchId}` }); return }
      if (!Number.isInteger(count) || count < 1 || count > 100) { send(res, 400, { error: "count must be 1..100" }); return }
      const result = await publisher.publishPrefill(matchId, count, eventType)
      send(res, 200, { published: result.published, first_seq: result.firstSeq, last_seq: result.lastSeq })
      return
    }
    if (req.url === "/v1/burst") {
      const v = await body(req) as { seconds?: number }
      const seconds = Number(v.seconds ?? 30)
      if (!Number.isFinite(seconds) || seconds < 1 || seconds > 120) { send(res, 400, { error: "seconds must be 1..120" }); return }
      publisher.burstMode = true
      burstActive = true
      if (burstTimer) clearTimeout(burstTimer)
      burstTimer = setTimeout(() => {
        publisher.burstMode = false
        burstActive = false
      }, seconds * 1000)
      burstTimer.unref()
      send(res, 200, { ok: true, burst_active: true, seconds })
      return
    }
    send(res, 404, { error: "not found" })
  } catch (e) {
    send(res, 400, { error: e instanceof Error ? e.message : String(e) })
  }
})

server.listen(port, "0.0.0.0", () => {
  process.stdout.write(`publisher-control ready port=${port} nchan_pub=${nchanPubUrl} redis=${redisUrl} seed=${seed}\n`)
})
