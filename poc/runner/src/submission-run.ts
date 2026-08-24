import http from "node:http"

const NCHAN_PUB_URL = process.env.NCHAN_PUB_URL || "http://localhost:8080"
const NCHAN_SUB_URL = process.env.NCHAN_SUB_URL || "http://localhost:8081"
const N_MATCHES = 8
const MATCHES = Array.from({ length: N_MATCHES }, (_, i) => `match-${i}`)
const STEP_CONNECTIONS = (process.env.STEP_CONNECTIONS || "100,500,1000")
  .split(",")
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => Number.isFinite(n) && n > 0)
const WARMUP_S = parseInt(process.env.WARMUP_SECONDS || "5", 10)
const MEASURE_S = parseInt(process.env.MEASURE_SECONDS || "25", 10)
const BURST_S = parseInt(process.env.BURST_SECONDS || "5", 10)
const SURGE_S = parseInt(process.env.SURGE_SECONDS || "5", 10)
const COOLDOWN_S = parseInt(process.env.COOLDOWN_SECONDS || "3", 10)

// Fresh connection per publish (Connection: close). Pooled keep-alive sockets
// were observed to black-hole the occasional publish with no error; a fresh
// connection makes every outcome attributable. Loopback cost is negligible.
const NO_KEEPALIVE = new http.Agent({ keepAlive: false })

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function pubUrl(m: string) {
  return `${NCHAN_PUB_URL}/pub/${m}`
}
function subUrl(m: string) {
  return `${NCHAN_SUB_URL}/sub/${m}`
}

type Phase = "idle" | "measure" | "burst" | "surge"

let CURRENT_PHASE: Phase = "idle"

interface SubRec {
  req: http.ClientRequest
  buffer: string
  measureLat: number[]
  burstLat: number[]
  seqs: Set<number>
  recvCount: number
  dupCount: number
  lastSeq: number
  outOfOrder: number
  closed: boolean
}

function newSub(): SubRec {
  return {
    req: null as unknown as http.ClientRequest,
    buffer: "",
    measureLat: [],
    burstLat: [],
    seqs: new Set(),
    recvCount: 0,
    dupCount: 0,
    lastSeq: -1,
    outOfOrder: 0,
    closed: false,
  }
}

async function publish(m: string, body: string): Promise<boolean> {
  return new Promise((resolve) => {
    const u = new URL(pubUrl(m))
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: "POST",
        agent: NO_KEEPALIVE,
        headers: {
          "Content-Type": "text/plain",
          "X-Event-Source-Event": "update",
          "Content-Length": Buffer.byteLength(body),
          Connection: "close",
        },
      },
      (res) => {
        res.resume()
        res.on("close", () =>
          resolve(res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300),
        )
      },
    )
    req.on("error", () => resolve(false))
    req.end(body)
  })
}

function openSubscriber(m: string, rec: SubRec): Promise<void> {
  return new Promise((resolve, reject) => {
    const u = new URL(subUrl(m))
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: "GET",
        headers: {
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.destroy()
          reject(new Error(`sub status ${res.statusCode}`))
          return
        }
        rec.req = req
        res.setTimeout(0)
        // SSE subscriber connections stay open for the whole experiment; resolve
        // as soon as the 200 streaming response is established.
        resolve()
        res.on("data", (chunk: Buffer) => {
          const arrived = Date.now()
          rec.buffer += chunk.toString("utf8")
          let idx: number
          while ((idx = rec.buffer.indexOf("\n\n")) !== -1) {
            const frame = rec.buffer.slice(0, idx)
            rec.buffer = rec.buffer.slice(idx + 2)
            for (const line of frame.split("\n")) {
              if (!line.startsWith("data:")) continue
              const payload = line.slice(5).replace(/^ /, "")
              try {
                const msg = JSON.parse(payload) as { t: number; seq: number }
                const latency = arrived - msg.t
                if (latency >= 0) {
                  if (CURRENT_PHASE === "burst") rec.burstLat.push(latency)
                  else rec.measureLat.push(latency)
                }
                const seq = msg.seq
                if (rec.seqs.has(seq)) rec.dupCount++
                else {
                  if (seq < rec.lastSeq) rec.outOfOrder++
                  rec.lastSeq = seq
                  rec.seqs.add(seq)
                }
                rec.recvCount++
              } catch {
                /* ignore malformed */
              }
            }
          }
        })
        res.on("end", () => {
          rec.closed = true
          resolve()
        })
        res.on("error", () => {
          rec.closed = true
          resolve()
        })
      },
    )
    req.on("error", (e) => reject(e))
    req.end()
  })
}

function closeSub(rec: SubRec) {
  try {
    rec.req.destroy()
  } catch {
    /* ignore */
  }
  rec.closed = true
}

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[i]
}

function distribute(n: number): number[] {
  const base = Math.floor(n / N_MATCHES)
  const rem = n % N_MATCHES
  return MATCHES.map((_, i) => base + (i < rem ? 1 : 0))
}

interface StepResult {
  subscribers: number
  achieved_subscribers: number
  fan_out_p50_ms: number
  fan_out_p95_ms: number
  fan_out_p99_ms: number
  burst_p95_ms: number
  missing: number
  duplicates: number
  out_of_order: number
  received: number
  publishes: number
}

async function runStep(targetN: number): Promise<StepResult> {
  const perMatch = distribute(targetN)
  const subs: SubRec[][] = MATCHES.map(() => [])
  const opens: Promise<void>[] = []
  for (let mi = 0; mi < N_MATCHES; mi++) {
    for (let s = 0; s < perMatch[mi]; s++) {
      const rec = newSub()
      subs[mi].push(rec)
      opens.push(openSubscriber(MATCHES[mi], rec))
    }
  }
  await Promise.all(opens)
  const achieved = subs.flat().filter((r) => !r.closed).length

  const seqCounters = MATCHES.map(() => 0)
  let publishes = 0
  const publishOne = async (burst: boolean) => {
    const m = MATCHES[Math.floor(Math.random() * N_MATCHES)]
    const mi = MATCHES.indexOf(m)
    const seq = seqCounters[mi]++
    const body = JSON.stringify({ m, seq, t: Date.now() })
    await publish(m, body)
    publishes++
  }

  // warmup: let subscriptions settle
  await sleep(WARMUP_S * 1000)

  // steady measure
  CURRENT_PHASE = "measure"
  const measureEnd = Date.now() + MEASURE_S * 1000
  while (Date.now() < measureEnd) {
    await publishOne(false)
    await sleep(100)
  }

  // burst: higher publish rate
  CURRENT_PHASE = "burst"
  const burstEnd = Date.now() + BURST_S * 1000
  while (Date.now() < burstEnd) {
    await Promise.all([publishOne(true), publishOne(true)])
    await sleep(20)
  }

  // surge: open extra subscribers, keep publishing
  CURRENT_PHASE = "surge"
  const extraPerMatch = distribute(Math.floor(targetN / 2))
  const extra: SubRec[][] = MATCHES.map(() => [])
  const extraOpens: Promise<void>[] = []
  for (let mi = 0; mi < N_MATCHES; mi++) {
    for (let s = 0; s < extraPerMatch[mi]; s++) {
      const rec = newSub()
      extra[mi].push(rec)
      extraOpens.push(openSubscriber(MATCHES[mi], rec))
    }
  }
  await Promise.all(extraOpens)
  const surgeEnd = Date.now() + SURGE_S * 1000
  while (Date.now() < surgeEnd) {
    await publishOne(false)
    await sleep(100)
  }
  CURRENT_PHASE = "idle"
  for (const arr of extra) for (const rec of arr) closeSub(rec)

  // cooldown
  await sleep(COOLDOWN_S * 1000)
  for (const arr of subs) for (const rec of arr) closeSub(rec)

  // aggregate
  const allLat: number[] = []
  const burstLat: number[] = []
  let received = 0
  let dup = 0
  let ooo = 0
  const seen = MATCHES.map(() => new Set<number>())
  for (let mi = 0; mi < N_MATCHES; mi++) {
    for (const rec of subs[mi]) {
      allLat.push(...rec.measureLat)
      burstLat.push(...rec.burstLat)
      received += rec.recvCount
      dup += rec.dupCount
      ooo += rec.outOfOrder
      for (const s of rec.seqs) seen[mi].add(s)
    }
  }
  const expectedPerMatch = seqCounters
  let missing = 0
  for (let mi = 0; mi < N_MATCHES; mi++) {
    missing += expectedPerMatch[mi] - seen[mi].size
  }
  allLat.sort((a, b) => a - b)
  burstLat.sort((a, b) => a - b)
  return {
    subscribers: targetN,
    achieved_subscribers: achieved,
    fan_out_p50_ms: pct(allLat, 50),
    fan_out_p95_ms: pct(allLat, 95),
    fan_out_p99_ms: pct(allLat, 99),
    burst_p95_ms: pct(burstLat, 95),
    missing: Math.max(0, missing),
    duplicates: Math.max(0, dup),
    out_of_order: ooo,
    received,
    publishes,
  }
}

async function runLateJoin(): Promise<{ published: number; received_within_2s: number }> {
  const m = "match-latejoin"
  const rec = newSub()
  await openSubscriber(m, rec)
  const published: number[] = []
  const start = Date.now()
  for (let i = 0; i < 25; i++) {
    const body = JSON.stringify({ m, seq: i, t: Date.now() })
    published.push(i)
    await publish(m, body)
    await sleep(70)
  }
  await sleep(2000)
  const received_within_2s = rec.recvCount
  closeSub(rec)
  // drain any late
  await sleep(500)
  return { published: published.length, received_within_2s }
}

async function runReconnect(): Promise<{
  ok: boolean
  before_close: number
  after_reconnect: number
}> {
  const m = "match-reconnect"
  const rec = newSub()
  await openSubscriber(m, rec)
  for (let i = 0; i < 5; i++) {
    await publish(m, JSON.stringify({ m, seq: i, t: Date.now() }))
    await sleep(120)
  }
  const before = rec.recvCount
  // force reconnect by destroying the socket; SSE should resume
  closeSub(rec)
  await sleep(300)
  const rec2 = newSub()
  await openSubscriber(m, rec2)
  for (let i = 5; i < 12; i++) {
    await publish(m, JSON.stringify({ m, seq: i, t: Date.now() }))
    await sleep(120)
  }
  const after = rec2.recvCount
  closeSub(rec2)
  await sleep(300)
  return { ok: after > 0, before_close: before, after_reconnect: after }
}

async function main() {
  console.log("=== EA Live Match Centre — Portable Fan-Out POC ===")
  console.log(`steps=${STEP_CONNECTIONS.join(",")} matches=${N_MATCHES}`)
  const steps: StepResult[] = []
  for (const n of STEP_CONNECTIONS) {
    console.log(`\n--- step subscribers=${n} ---`)
    const r = await runStep(n)
    steps.push(r)
    console.log(JSON.stringify(r))
  }
  const late_join = await runLateJoin()
  const reconnect = await runReconnect()
  const finalStep = steps[steps.length - 1]

  const result = {
    status: "COMPLETED",
    steps,
    late_join,
    reconnect,
    final_1000_subscriber: {
      achieved_subscribers: finalStep.achieved_subscribers,
      fan_out_p95_ms: finalStep.fan_out_p95_ms,
      missing: finalStep.missing,
      duplicates: finalStep.duplicates,
      out_of_order: finalStep.out_of_order,
    },
  }
  console.log("\n=== RESULT ===")
  console.log(JSON.stringify(result, null, 2))
  console.log("\nEXPERIMENT STATUS: COMPLETED")
}

main().catch((e) => {
  console.error("EXPERIMENT ERROR:", e)
  console.log("\nEXPERIMENT STATUS: ERROR")
  process.exit(1)
})
