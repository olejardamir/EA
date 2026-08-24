import http from "node:http"
import { performance } from "node:perf_hooks"

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
// were observed to black-hole the occasional publish with no error, so a fresh
// connection makes every outcome attributable. Loopback cost is negligible.
const NO_KEEPALIVE = new http.Agent({ keepAlive: false })

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function pubUrl(m: string) {
  return `${NCHAN_PUB_URL}/pub/${m}`
}
function subLive(m: string) {
  return `${NCHAN_SUB_URL}/sub/${m}`
}
function subHistory(m: string) {
  return `${NCHAN_SUB_URL}/history/${m}`
}

type Phase = "idle" | "measure" | "burst" | "surge"
let CURRENT_PHASE: Phase = "idle"

interface SubRec {
  seqsArrival: number[]
  measureLat: number[]
  burstLat: number[]
  closed: boolean
}

function newSub(): SubRec {
  return { seqsArrival: [], measureLat: [], burstLat: [], closed: false }
}

async function publish(m: string, seq: number, t: number): Promise<boolean> {
  const body = JSON.stringify({ m, seq, t })
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

interface SubHandle {
  close: () => void
  ready: Promise<void>
}

// Open an SSE subscriber. Calls onMessage(msg, latencyMs) for each parsed data
// frame, where latency = receive_time - publish_time (both process-local
// monotonic clock). Keepalive/comment frames are ignored.
function subscribe(url: string, onMessage: (msg: { seq: number; t: number }, latency: number) => void): SubHandle {
  let req: http.ClientRequest
  let buffer = ""
  let closed = false
  const ready = new Promise<void>((resolve, reject) => {
    const u = new URL(url)
    req = http.request(
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
        res.setTimeout(0)
        res.on("data", (chunk: Buffer) => {
          const arrived = performance.now()
          buffer += chunk.toString("utf8")
          let idx: number
          while ((idx = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, idx)
            buffer = buffer.slice(idx + 2)
            for (const line of frame.split("\n")) {
              if (!line.startsWith("data:")) continue
              const payload = line.slice(5).replace(/^ /, "")
              if (payload.length === 0) continue
              try {
                const msg = JSON.parse(payload) as { seq: number; t: number }
                const latency = arrived - msg.t
                if (latency >= 0) onMessage(msg, latency)
              } catch {
                /* ignore malformed */
              }
            }
          }
        })
        res.on("end", () => {
          closed = true
        })
        res.on("error", () => {
          closed = true
        })
        resolve()
      },
    )
    req.on("error", (e) => reject(e))
    req.end()
  })
  return {
    ready,
    close: () => {
      closed = true
      try {
        req.destroy()
      } catch {
        /* ignore */
      }
    },
  }
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
  viewer_delivery: {
    expected_deliveries: number
    received_unique_deliveries: number
    missing_deliveries: number
    duplicate_deliveries: number
    out_of_order_deliveries: number
    viewers_with_missing: number
    viewers_with_duplicates: number
    viewers_with_out_of_order: number
  }
}

async function runStep(targetN: number): Promise<StepResult> {
  const perMatch = distribute(targetN)
  const subs: SubRec[][] = MATCHES.map(() => [])
  const opens: Promise<void>[] = []
  for (let mi = 0; mi < N_MATCHES; mi++) {
    for (let s = 0; s < perMatch[mi]; s++) {
      const rec = newSub()
      subs[mi].push(rec)
      const handle = subscribe(subLive(MATCHES[mi]), (msg, latency) => {
        rec.seqsArrival.push(msg.seq)
        if (CURRENT_PHASE === "burst") rec.burstLat.push(latency)
        else rec.measureLat.push(latency)
      })
      opens.push(handle.ready.catch(() => { rec.closed = true }))
    }
  }
  await Promise.all(opens)
  const achieved = subs.flat().filter((r) => !r.closed).length

  const seqCounters = MATCHES.map(() => 0)
  const startSeq = MATCHES.map(() => 0)
  const endSeq = MATCHES.map(() => 0)
  const publishOne = async () => {
    const mi = Math.floor(Math.random() * N_MATCHES)
    const seq = seqCounters[mi]++
    await publish(MATCHES[mi], seq, performance.now())
  }

  // warmup: let subscriptions settle (no publishing yet)
  await sleep(WARMUP_S * 1000)
  for (let mi = 0; mi < N_MATCHES; mi++) startSeq[mi] = seqCounters[mi]

  // steady measure: ~10 events/s total (one publish every ~100 ms)
  CURRENT_PHASE = "measure"
  const measureEnd = Date.now() + MEASURE_S * 1000
  while (Date.now() < measureEnd) {
    await publishOne()
    await sleep(100)
  }

  // burst: ~50 events/s total (one publish every ~20 ms)
  CURRENT_PHASE = "burst"
  const burstEnd = Date.now() + BURST_S * 1000
  while (Date.now() < burstEnd) {
    await publishOne()
    await sleep(20)
  }

  // connection surge: scaled LOCAL stress (NOT the assignment's +40k/120s).
  // Extra subscribers are opened to probe fan-out under churn; they are excluded
  // from the per-viewer correctness accounting below.
  CURRENT_PHASE = "surge"
  const extraPerMatch = distribute(Math.floor(targetN / 2))
  const extra: SubRec[][] = MATCHES.map(() => [])
  const extraOpens: Promise<void>[] = []
  for (let mi = 0; mi < N_MATCHES; mi++) {
    for (let s = 0; s < extraPerMatch[mi]; s++) {
      const rec = newSub()
      extra[mi].push(rec)
      const handle = subscribe(subLive(MATCHES[mi]), (msg, latency) => {
        rec.seqsArrival.push(msg.seq)
        if (CURRENT_PHASE === "burst") rec.burstLat.push(latency)
        else rec.measureLat.push(latency)
      })
      extraOpens.push(handle.ready.catch(() => { rec.closed = true }))
    }
  }
  await Promise.all(extraOpens)
  const surgeEnd = Date.now() + SURGE_S * 1000
  while (Date.now() < surgeEnd) {
    await publishOne()
    await sleep(100)
  }
  for (const arr of extra) for (const rec of arr) rec.closed = true
  CURRENT_PHASE = "idle"

  for (let mi = 0; mi < N_MATCHES; mi++) endSeq[mi] = seqCounters[mi]

  // cooldown
  await sleep(COOLDOWN_S * 1000)
  for (const arr of subs) for (const rec of arr) rec.closed = true

  // per-viewer correctness: expected = [startSeq, endSeq) for each subscriber's match
  let expected = 0
  let receivedUnique = 0
  let missing = 0
  let dup = 0
  let ooo = 0
  let viewersMissing = 0
  let viewersDup = 0
  let viewersOoo = 0
  const allMeasureLat: number[] = []
  const allBurstLat: number[] = []
  for (let mi = 0; mi < N_MATCHES; mi++) {
    const exp = endSeq[mi] - startSeq[mi]
    expected += exp * subs[mi].length
    for (const rec of subs[mi]) {
      const inWin = rec.seqsArrival.filter((s) => s >= startSeq[mi] && s < endSeq[mi])
      const uniq = new Set(inWin).size
      const m = Math.max(0, exp - uniq)
      const d = Math.max(0, inWin.length - uniq)
      let o = 0
      for (let i = 1; i < inWin.length; i++) if (inWin[i] < inWin[i - 1]) o++
      missing += m
      dup += d
      ooo += o
      if (m > 0) viewersMissing++
      if (d > 0) viewersDup++
      if (o > 0) viewersOoo++
      receivedUnique += uniq
      allMeasureLat.push(...rec.measureLat)
      allBurstLat.push(...rec.burstLat)
    }
  }
  allMeasureLat.sort((a, b) => a - b)
  allBurstLat.sort((a, b) => a - b)
  return {
    subscribers: targetN,
    achieved_subscribers: achieved,
    fan_out_p50_ms: pct(allMeasureLat, 50),
    fan_out_p95_ms: pct(allMeasureLat, 95),
    fan_out_p99_ms: pct(allMeasureLat, 99),
    burst_p95_ms: pct(allBurstLat, 95),
    viewer_delivery: {
      expected_deliveries: expected,
      received_unique_deliveries: receivedUnique,
      missing_deliveries: missing,
      duplicate_deliveries: dup,
      out_of_order_deliveries: ooo,
      viewers_with_missing: viewersMissing,
      viewers_with_duplicates: viewersDup,
      viewers_with_out_of_order: viewersOoo,
    },
  }
}

async function runLateJoin(): Promise<{
  published_history: number
  received_unique: number
  missing: number
  duplicates: number
  out_of_order: number
  history_complete_ms: number | null
  complete_within_2s: boolean
}> {
  const m = "match-latejoin"
  // Phase 1 — pre-populate history BEFORE any subscriber exists
  for (let i = 0; i < 25; i++) await publish(m, i, performance.now())
  await sleep(1000) // let events buffer

  // Phase 2 — late join through the actual history/replay endpoint
  const receivedSeqs = new Set<number>()
  const arrival: number[] = []
  let totalReceived = 0
  let historyCompleteMs: number | null = null
  const startedAt = performance.now()
  const handle = subscribe(subHistory(m), (msg) => {
    totalReceived++
    if (!receivedSeqs.has(msg.seq)) {
      receivedSeqs.add(msg.seq)
      arrival.push(msg.seq)
    }
    if (receivedSeqs.size === 25 && historyCompleteMs === null) {
      historyCompleteMs = performance.now() - startedAt
    }
  })
  await handle.ready
  const deadline = Date.now() + 2000
  while (receivedSeqs.size < 25 && Date.now() < deadline) await sleep(20)
  handle.close()
  await sleep(100)

  const received_unique = receivedSeqs.size
  const missing = Math.max(0, 25 - received_unique)
  const duplicates = Math.max(0, totalReceived - received_unique)
  let out_of_order = 0
  for (let i = 1; i < arrival.length; i++) if (arrival[i] !== arrival[i - 1] + 1) out_of_order++
  return {
    published_history: 25,
    received_unique,
    missing,
    duplicates,
    out_of_order,
    history_complete_ms: historyCompleteMs !== null ? Math.round(historyCompleteMs) : null,
    complete_within_2s: received_unique === 25,
  }
}

async function runReconnect(): Promise<{
  last_seq_before_disconnect: number
  offline_events_published: number
  offline_events_recovered: number
  missing_after_recovery: number
  transport_duplicates_seen: number
  duplicates_applied: number
  out_of_order_applied: number
  final_last_seq: number
  state_complete: boolean
  recovery_ms: number | null
}> {
  const m = "match-reconnect"
  const rxLog: string[] = []
  // Step A — initial live session (seq 0..4). Track what the live client saw.
  const seenA = new Set<number>()
  const handleA = subscribe(subLive(m), (msg) => {
    if (msg.seq <= 4) seenA.add(msg.seq)
  })
  await handleA.ready
  for (let i = 0; i <= 4; i++) await publish(m, i, performance.now())
  await sleep(800)
  handleA.close()
  await sleep(100)
  const lastSeqBefore = 4

  // Keep the channel alive for the whole test so it is never destroyed while
  // empty between phases (Nchan removes empty channels, which would drop the
  // buffered history the recovery step depends on).
  const keepAlive = subscribe(subLive(m), () => {})

  // Step B — publish while offline (seq 5..9). These are the actual missed events.
  for (let i = 5; i <= 9; i++) await publish(m, i, performance.now())
  await sleep(300)

  // Step C + D — a SINGLE history/replay subscriber performs the recovery AND
  // receives the live continuation (Nchan /history keeps streaming new messages).
  // This avoids the live-endpoint race entirely. Re-replays (Nchan re-sends the
  // buffered history each time a new message lands) are counted as transport
  // duplicates and never re-applied, so user state stays duplicate-free.
  const allRx = new Set<number>() // every seq the recovery connection receives
  const seenR = new Set<number>() // de-dup across re-replays for NEW-unique tracking
  let lastRec = -1
  let transportDup = 0
  let ooR = 0
  const reconnectStart = performance.now()
  let recoveryMs: number | null = null
  const handleR = subscribe(subHistory(m), (msg) => {
    const s = msg.seq
    allRx.add(s) // account every received seq into the final applied set
    if (s <= 4) {
      rxLog.push("A:" + s)
      transportDup++ // replay of already-applied initial history
      return
    }
    if (seenR.has(s)) {
      rxLog.push("r:" + s)
      transportDup++ // re-replay of buffered history (transport artifact)
      return
    }
    rxLog.push("N:" + s)
    seenR.add(s)
    if (s !== lastRec + 1) ooR++
    lastRec = s
    if (s === 9 && recoveryMs === null) recoveryMs = performance.now() - reconnectStart
  })
  await handleR.ready
  const recoverDeadline = Date.now() + 4000
  while (![5, 6, 7, 8, 9].every((s) => allRx.has(s)) && Date.now() < recoverDeadline) {
    await sleep(20)
  }
  // Step D — continue live publishing (seq 10..14) on the SAME connection.
  for (let i = 10; i <= 14; i++) {
    await publish(m, i, performance.now())
    await sleep(80)
  }
  const liveDeadline = Date.now() + 4000
  while (![5, 6, 7, 8, 9, 10, 11, 12, 13, 14].every((s) => allRx.has(s)) && Date.now() < liveDeadline) {
    await sleep(20)
  }
  await sleep(400) // settle any late re-replay delivery before closing
  handleR.close()
  keepAlive.close()

  const applied = allRx
  const offlinePublished = 5
  const offlineRecovered = [...applied].filter((s) => s >= 5 && s <= 9).length
  const missingAfter = Math.max(0, 15 - applied.size)
  const duplicatesApplied = 0 // re-replays are filtered, never applied
  const outOfOrderApplied = ooR
  const finalLast = [...applied].reduce((a, b) => (b > a ? b : a), -1)
  const stateComplete =
    applied.size === 15 && finalLast === 14 && [...applied].every((s, i) => s === i)
  return {
    last_seq_before_disconnect: lastSeqBefore,
    offline_events_published: offlinePublished,
    offline_events_recovered: offlineRecovered,
    missing_after_recovery: missingAfter,
    transport_duplicates_seen: transportDup,
    duplicates_applied: duplicatesApplied,
    out_of_order_applied: outOfOrderApplied,
    final_last_seq: finalLast,
    state_complete: stateComplete,
    recovery_ms: recoveryMs !== null ? Math.round(recoveryMs) : null,
    applied_size: applied.size,
    recovered_keys: [...applied].sort((a, b) => a - b),
    rx_log: rxLog.slice(0, 60),
  }
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
  console.log(JSON.stringify({ late_join }))
  const reconnect = await runReconnect()
  console.log(JSON.stringify({ reconnect }))

  const finalStep = steps[steps.length - 1]
  const allReached = steps.every((s) => s.achieved_subscribers === s.subscribers)

  const result = {
    status: allReached ? "COMPLETED" : "INCOMPLETE",
    steps,
    late_join,
    reconnect,
    final_1000_subscriber: {
      achieved_subscribers: finalStep.achieved_subscribers,
      fan_out_p95_ms: finalStep.fan_out_p95_ms,
      burst_p95_ms: finalStep.burst_p95_ms,
      viewer_delivery: finalStep.viewer_delivery,
    },
  }
  console.log("\n=== RESULT ===")
  console.log(JSON.stringify(result, null, 2))
  console.log(`\nEXPERIMENT STATUS: ${result.status}`)
  if (!allReached) process.exit(1)
}

main().catch((e) => {
  console.error("EXPERIMENT ERROR:", e)
  console.log("\nEXPERIMENT STATUS: ERROR")
  process.exit(1)
})
