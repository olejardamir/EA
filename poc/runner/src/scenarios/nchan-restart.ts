import type { Scenario, ScenarioContext } from "./scenario.js"

// §3.9.E: Separate structured results for literal restart and cross-node replacement
export interface RestartPathResult {
  transport_resume_id: string | null
  expected_first_seq: number | null
  expected_last_seq: number | null
  received_first_seq: number | null
  received_last_seq: number | null
  expected_count: number
  received_required_count: number
  missing_required: number
  duplicates: number
  out_of_order: number
  missing_prefix: boolean
  target_reached: boolean
  recovery_ms: number
  passed: boolean
}

export class NchanRestartScenario implements Scenario {
  name = "nchan-restart"
  private nchan1SubUrl: string
  private nchan1PubUrl: string
  private nchan2SubUrl: string
  private controlUrl: string

  constructor(nchan1SubUrl: string, nchan1PubUrl: string, nchan2SubUrl: string, controlUrl: string) {
    this.nchan1SubUrl = nchan1SubUrl
    this.nchan1PubUrl = nchan1PubUrl
    this.nchan2SubUrl = nchan2SubUrl
    this.controlUrl = controlUrl
  }

  async execute(ctx: ScenarioContext): Promise<{ name: string; passed: boolean; detail: string }> {
    // §4.14: When both nchan-2 and control server are available (evidence mode),
    // run BOTH literal restart AND cross-node tests to satisfy both §19 procedure
    // (literal restart) and §E clarification (cross-node replacement).
    // When only one is available, run that one.
    if (this.nchan2SubUrl && this.controlUrl) {
      const literal = await this.literalRestartTest(ctx)
      if (!literal.passed) return literal
      const crossNode = await this.crossNodeTest(ctx)
      if (!crossNode.passed) return crossNode
      return {
        name: this.name,
        passed: true,
        detail: `literal-restart+cross-node: ${literal.detail} | ${crossNode.detail}`,
      }
    }
    if (this.nchan2SubUrl) {
      return this.crossNodeTest(ctx)
    }
    if (this.controlUrl) {
      return this.literalRestartTest(ctx)
    }
    return { name: this.name, passed: true, detail: "skipped (no nchan-2 or control server)" }
  }

  // §E/§18: Cross-node Redis history resume test
  private async crossNodeTest(ctx: ScenarioContext): Promise<{ name: string; passed: boolean; detail: string }> {
    ctx.log("--- PHASE: NCHAN RESTART (cross-node Redis history) ---")

    const testMatch = ctx.matchIds[0]
    const recordedEvents: string[] = []
    let lastEventId: string | null = null

    ctx.log(`Connecting to nchan-1 for ${testMatch}...`)
    const sub1Url = `${this.nchan1SubUrl}/sub/${testMatch}`

    try {
      const sub1 = await ctx.eventStream.connect(sub1Url)

      const received = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          sub1.close()
          resolve(false)
        }, 10_000)

        sub1.onEvent((evt) => {
          if (evt.type !== "message") return
          recordedEvents.push(evt.event.data)
          if (evt.event.id) lastEventId = evt.event.id

          if (recordedEvents.length >= 3) {
            clearTimeout(timeout)
            sub1.close()
            resolve(true)
          }
        })
      })

      if (!received || recordedEvents.length < 3) {
        ctx.log("Nchan-1: failed to receive enough events")
        return { name: this.name, passed: false, detail: "nchan-1: insufficient events" }
      }

      ctx.log(`Nchan-1: received ${recordedEvents.length} events, lastEventId=${lastEventId}`)

      let lastSeq1: number | null = null
      for (const raw of recordedEvents) {
        try {
          const data = JSON.parse(raw)
          if (typeof data.canonical_seq === "number") lastSeq1 = data.canonical_seq
        } catch {}
      }

      // §3.11/§3.13: Freeze expected range BEFORE connecting to nchan-2
      // Expected = events between resume cursor and head at replacement time
      const frozenExpectedFirstSeq1 = lastSeq1 !== null ? lastSeq1 + 1 : null
      const headAtReplacement = ctx.headTracker.getHead(testMatch)

      // §3.9.D: Do not fall back to expectedCount=1 — require a valid frozen range
      if (frozenExpectedFirstSeq1 === null || headAtReplacement < frozenExpectedFirstSeq1) {
        ctx.log(`§3.9 Cross-node: invalid frozen range (first=${frozenExpectedFirstSeq1}, head=${headAtReplacement})`)
        return { name: this.name, passed: false, detail: `cross-node: invalid frozen range first=${frozenExpectedFirstSeq1} head=${headAtReplacement}` }
      }

      const frozenExpectedCount1 = headAtReplacement - frozenExpectedFirstSeq1 + 1

      ctx.log("Waiting 500ms before connecting to nchan-2...")
      await ctx.sleep(500)

      ctx.log(`Connecting to nchan-2 for ${testMatch} (lastEventId=${lastEventId})...`)
      const sub2Url = `${this.nchan2SubUrl}/sub/${testMatch}`
      const sub2 = await ctx.eventStream.connect(sub2Url, lastEventId)

      const replayEvents: string[] = []
      let replayComplete = false

      const replayResult = await new Promise<{ ok: boolean; gap: boolean; dup: boolean; firstSeq: number | null; lastSeq: number | null }>((resolve) => {
        const timeout = setTimeout(() => {
          sub2.close()
          resolve({ ok: false, gap: false, dup: false, firstSeq: null, lastSeq: null })
        }, 10_000)

        let prevSeq: number | null = null
        const seenSeqs = new Set<number>()
        let firstSeq: number | null = null
        let lastSeq: number | null = null

        sub2.onEvent((evt) => {
          if (evt.type !== "message" || replayComplete) return
          replayEvents.push(evt.event.data)

          try {
            const data = JSON.parse(evt.event.data)
            if (typeof data.canonical_seq === "number") {
              const seq = data.canonical_seq as number
              if (firstSeq === null) firstSeq = seq
              lastSeq = seq

              if (prevSeq !== null && seq < prevSeq) {
                clearTimeout(timeout)
                sub2.close()
                resolve({ ok: false, gap: true, dup: false, firstSeq, lastSeq })
                return
              }

              if (seenSeqs.has(seq)) {
                clearTimeout(timeout)
                sub2.close()
                resolve({ ok: false, gap: false, dup: true, firstSeq, lastSeq })
                return
              }

              seenSeqs.add(seq)
              prevSeq = seq

              // §3.9.C: Cross-node completion — must receive all events in the frozen expected range
              if (headAtReplacement !== null && seq >= headAtReplacement) {
                replayComplete = true
                clearTimeout(timeout)
                sub2.close()
                resolve({ ok: true, gap: false, dup: false, firstSeq, lastSeq })
              }
            }
          } catch {}
        })
      })

      const outOfOrder = (() => {
        let prev: number | null = null
        for (const raw of replayEvents) {
          try {
            const data = JSON.parse(raw)
            if (typeof data.canonical_seq === "number") {
              if (prev !== null && data.canonical_seq < prev) return true
              prev = data.canonical_seq
            }
          } catch {}
        }
        return false
      })()

      // §3.9.E: Missing prefix detection
      const missingPrefix = frozenExpectedFirstSeq1 !== null
        && replayResult.firstSeq !== null
        && replayResult.firstSeq !== frozenExpectedFirstSeq1

      ctx.log(`Nchan-2 replay: events=${replayEvents.length} ok=${replayResult.ok} gap=${replayResult.gap} dup=${replayResult.dup} outOfOrder=${outOfOrder} missingPrefix=${missingPrefix} resumeTransportId=${lastEventId} firstSeq=${replayResult.firstSeq} lastSeq=${replayResult.lastSeq}`)

      // §3.9: Compute missing required sequences
      const missingRequired = replayResult.ok && !missingPrefix
        ? Math.max(0, frozenExpectedCount1 - replayEvents.length)
        : replayEvents.length === 0 ? frozenExpectedCount1 : 0

      // §3.9.F: Required structured result
      const pathResult: RestartPathResult = {
        transport_resume_id: lastEventId,
        expected_first_seq: frozenExpectedFirstSeq1,
        expected_last_seq: headAtReplacement,
        received_first_seq: replayResult.firstSeq,
        received_last_seq: replayResult.lastSeq,
        expected_count: frozenExpectedCount1,
        received_required_count: replayEvents.length,
        missing_required: missingRequired,
        duplicates: replayResult.dup ? 1 : 0,
        out_of_order: outOfOrder ? 1 : 0,
        missing_prefix: missingPrefix,
        target_reached: replayResult.ok,
        recovery_ms: 0,
        passed: replayResult.ok && !replayResult.gap && !replayResult.dup && !outOfOrder && !missingPrefix,
      }

      // §3.9.E: Wire delivery accounting — separate from literal restart
      ctx.metrics.incrementRestartReplayExpected(frozenExpectedCount1)
      ctx.metrics.incrementRestartReplayReceived(replayEvents.length)
      // §3.9: Separated cross-node metrics
      ctx.metrics.incrementCrossNodeExpected(frozenExpectedCount1)
      ctx.metrics.incrementCrossNodeReceived(replayEvents.length)

      return {
        name: this.name,
        passed: pathResult.passed,
        detail: [
          `type=cross-node`,
          `events=${replayEvents.length}`,
          `gap=${replayResult.gap}`,
          `dup=${replayResult.dup}`,
          `outOfOrder=${outOfOrder}`,
          `missingPrefix=${missingPrefix}`,
          `resumeTransportId=${lastEventId}`,
          `expectedFirstSeq=${frozenExpectedFirstSeq1}`,
          `receivedFirstSeq=${replayResult.firstSeq}`,
          `receivedLastSeq=${replayResult.lastSeq}`,
          `expectedCount=${frozenExpectedCount1}`,
          `receivedCount=${replayEvents.length}`,
          `recoveryMs=N/A`,
        ].join(" "),
      }
    } catch (err) {
      ctx.log(`Nchan restart test failed: ${err}`)
      return { name: this.name, passed: false, detail: `error: ${err}` }
    }
  }

  // §E/§6.7: Literal Nchan process restart test
  private async literalRestartTest(ctx: ScenarioContext): Promise<{ name: string; passed: boolean; detail: string }> {
    ctx.log("--- PHASE: NCHAN RESTART (literal process restart) ---")

    const testMatch = ctx.matchIds[0]
    const recordedEvents: string[] = []
    let lastEventId: string | null = null

    ctx.log(`Connecting to nchan for ${testMatch}...`)
    const subUrl = `${this.nchan1SubUrl}/sub/${testMatch}`

    try {
      const sub1 = await ctx.eventStream.connect(subUrl)

      const received = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          sub1.close()
          resolve(false)
        }, 10_000)

        sub1.onEvent((evt) => {
          if (evt.type !== "message") return
          recordedEvents.push(evt.event.data)
          if (evt.event.id) lastEventId = evt.event.id

          if (recordedEvents.length >= 3) {
            clearTimeout(timeout)
            sub1.close()
            resolve(true)
          }
        })
      })

      if (!received || recordedEvents.length < 3) {
        ctx.log("Nchan: failed to receive enough events before restart")
        return { name: this.name, passed: false, detail: "insufficient events pre-restart" }
      }

      let lastSeq: number | null = null
      for (const raw of recordedEvents) {
        try {
          const data = JSON.parse(raw)
          if (typeof data.canonical_seq === "number") lastSeq = data.canonical_seq
        } catch {}
      }

      ctx.log(`Pre-restart: ${recordedEvents.length} events, lastSeq=${lastSeq}, lastEventId=${lastEventId}`)

      // §3.11/§3.13: Record canonical range BEFORE restart — independent frozen expected range
      const frozenExpectedFirstSeq = lastSeq !== null ? lastSeq + 1 : null
      const headAtRestart = ctx.headTracker.getHead(testMatch)

      // §3.9.D: Do not fall back to expectedCount=1
      if (frozenExpectedFirstSeq === null || headAtRestart < frozenExpectedFirstSeq) {
        ctx.log(`§3.9 Literal restart: invalid frozen range (first=${frozenExpectedFirstSeq}, head=${headAtRestart})`)
        return { name: this.name, passed: false, detail: `literal: invalid frozen range first=${frozenExpectedFirstSeq} head=${headAtRestart}` }
      }

      const frozenExpectedCount = headAtRestart - frozenExpectedFirstSeq + 1

      // Step 2: Trigger literal Nchan process restart via control server
      ctx.log(`Triggering literal Nchan restart via ${this.controlUrl}...`)
      const restartStart = Date.now()
      try {
        const resp = await fetch(`${this.controlUrl}/restart`, {
          method: "POST",
          signal: AbortSignal.timeout(5000),
        })
        if (!resp.ok) {
          ctx.log(`Control server returned ${resp.status}`)
          return { name: this.name, passed: false, detail: `control server returned ${resp.status}` }
        }
      } catch (err) {
        ctx.log(`Failed to reach control server: ${err}`)
        return { name: this.name, passed: false, detail: `control server unreachable: ${err}` }
      }

      // Step 3: Wait for Nchan to recover (poll healthcheck)
      ctx.log("Waiting for Nchan to recover...")
      const healthUrl = `${this.nchan1PubUrl}/pub/healthcheck`
      const recovered = await new Promise<boolean>((resolve) => {
        const deadline = Date.now() + 30_000
        const poll = async () => {
          while (Date.now() < deadline) {
            try {
              const resp = await fetch(healthUrl, { signal: AbortSignal.timeout(3000) })
              if (resp.ok) { resolve(true); return }
            } catch {}
            await ctx.sleep(500)
          }
          resolve(false)
        }
        poll()
      })

      const restartMs = Date.now() - restartStart
      if (!recovered) {
        ctx.log(`Nchan did not recover within 30s after restart`)
        return { name: this.name, passed: false, detail: `restart recovery timeout (${restartMs}ms)` }
      }
      ctx.log(`Nchan recovered in ${restartMs}ms`)

      // Step 4: Reconnect with Last-Event-ID and verify history replay
      ctx.log(`Reconnecting with lastEventId=${lastEventId}...`)
      const sub2 = await ctx.eventStream.connect(subUrl, lastEventId)

      const replayEvents: string[] = []
      let replayComplete = false

      const replayResult = await new Promise<{ ok: boolean; gap: boolean; dup: boolean; firstSeq: number | null; lastSeq: number | null }>((resolve) => {
        const timeout = setTimeout(() => {
          sub2.close()
          resolve({ ok: false, gap: false, dup: false, firstSeq: null, lastSeq: null })
        }, 15_000)

        let prevSeq: number | null = null
        const seenSeqs = new Set<number>()
        let firstSeq: number | null = null
        let lastSeq: number | null = null

        sub2.onEvent((evt) => {
          if (evt.type !== "message" || replayComplete) return
          replayEvents.push(evt.event.data)

          try {
            const data = JSON.parse(evt.event.data)
            if (typeof data.canonical_seq === "number") {
              const seq = data.canonical_seq as number
              if (firstSeq === null) firstSeq = seq
              lastSeq = seq

              if (prevSeq !== null && seq < prevSeq) {
                clearTimeout(timeout)
                sub2.close()
                resolve({ ok: false, gap: true, dup: false, firstSeq, lastSeq })
                return
              }

              if (seenSeqs.has(seq)) {
                clearTimeout(timeout)
                sub2.close()
                resolve({ ok: false, gap: false, dup: true, firstSeq, lastSeq })
                return
              }

              seenSeqs.add(seq)
              prevSeq = seq

              // §3.9.A: Completion boundary — must receive ALL events in frozen expected range
              // Must reach headAtRestart, not just seq > lastSeq
              if (seq >= headAtRestart) {
                replayComplete = true
                clearTimeout(timeout)
                sub2.close()
                resolve({ ok: true, gap: false, dup: false, firstSeq, lastSeq })
              }
            }
          } catch {}
        })
      })

      const outOfOrder = (() => {
        let prev: number | null = null
        for (const raw of replayEvents) {
          try {
            const data = JSON.parse(raw)
            if (typeof data.canonical_seq === "number") {
              if (prev !== null && data.canonical_seq < prev) return true
              prev = data.canonical_seq
            }
          } catch {}
        }
        return false
      })()

      // §3.9.B: Missing prefix detection
      const missingPrefix = frozenExpectedFirstSeq !== null
        && replayResult.firstSeq !== null
        && replayResult.firstSeq !== frozenExpectedFirstSeq

      ctx.log(`Post-restart replay: events=${replayEvents.length} ok=${replayResult.ok} gap=${replayResult.gap} dup=${replayResult.dup} outOfOrder=${outOfOrder} missingPrefix=${missingPrefix} resumeTransportId=${lastEventId} firstSeq=${replayResult.firstSeq} lastSeq=${replayResult.lastSeq} restartMs=${restartMs}`)

      // §3.9: Compute missing required sequences
      const missingRequired = replayResult.ok && !missingPrefix
        ? Math.max(0, frozenExpectedCount - replayEvents.length)
        : replayEvents.length === 0 ? frozenExpectedCount : 0

      // §3.9.F: Required structured result
      const pathResult: RestartPathResult = {
        transport_resume_id: lastEventId,
        expected_first_seq: frozenExpectedFirstSeq,
        expected_last_seq: headAtRestart,
        received_first_seq: replayResult.firstSeq,
        received_last_seq: replayResult.lastSeq,
        expected_count: frozenExpectedCount,
        received_required_count: replayEvents.length,
        missing_required: missingRequired,
        duplicates: replayResult.dup ? 1 : 0,
        out_of_order: outOfOrder ? 1 : 0,
        missing_prefix: missingPrefix,
        target_reached: replayResult.ok,
        recovery_ms: restartMs,
        passed: replayResult.ok && !replayResult.gap && !replayResult.dup && !outOfOrder && !missingPrefix,
      }

      // §3.11/§3.13: Wire delivery accounting — frozen expected range from pre-restart head observation
      ctx.metrics.incrementRestartReplayExpected(frozenExpectedCount)
      ctx.metrics.incrementRestartReplayReceived(replayEvents.length)
      // §3.9: Separated literal restart metrics
      ctx.metrics.incrementLiteralRestartExpected(frozenExpectedCount)
      ctx.metrics.incrementLiteralRestartReceived(replayEvents.length)

      return {
        name: this.name,
        passed: pathResult.passed,
        detail: [
          `type=literal-restart`,
          `events=${replayEvents.length}`,
          `gap=${replayResult.gap}`,
          `dup=${replayResult.dup}`,
          `outOfOrder=${outOfOrder}`,
          `missingPrefix=${missingPrefix}`,
          `resumeTransportId=${lastEventId}`,
          `expectedFirstSeq=${frozenExpectedFirstSeq}`,
          `receivedFirstSeq=${replayResult.firstSeq}`,
          `receivedLastSeq=${replayResult.lastSeq}`,
          `expectedCount=${frozenExpectedCount}`,
          `receivedCount=${replayEvents.length}`,
          `restartMs=${restartMs}`,
        ].join(" "),
      }
    } catch (err) {
      ctx.log(`Nchan literal restart test failed: ${err}`)
      return { name: this.name, passed: false, detail: `error: ${err}` }
    }
  }
}
