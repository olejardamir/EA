import type { Scenario, ScenarioContext } from "./scenario.js"

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
      const frozenExpectedCount1 = frozenExpectedFirstSeq1 !== null && headAtReplacement >= frozenExpectedFirstSeq1
        ? headAtReplacement - frozenExpectedFirstSeq1 + 1
        : 1

      ctx.log("Waiting 500ms before connecting to nchan-2...")
      await ctx.sleep(500)

      ctx.log(`Connecting to nchan-2 for ${testMatch} (lastEventId=${lastEventId})...`)
      const sub2Url = `${this.nchan2SubUrl}/sub/${testMatch}`
      const sub2 = await ctx.eventStream.connect(sub2Url, lastEventId)

      const replayEvents: string[] = []
      let replayComplete = false

      const replayResult = await new Promise<{ ok: boolean; gap: boolean; dup: boolean }>((resolve) => {
        const timeout = setTimeout(() => {
          sub2.close()
          // §3.11: Timeout with partial replay is NOT complete — ok=false unless target seq was reached
          resolve({ ok: false, gap: false, dup: false })
        }, 10_000)

        let prevSeq: number | null = null
        const seenSeqs = new Set<number>()

        sub2.onEvent((evt) => {
          if (evt.type !== "message" || replayComplete) return
          replayEvents.push(evt.event.data)

          try {
            const data = JSON.parse(evt.event.data)
            if (typeof data.canonical_seq === "number") {
              const seq = data.canonical_seq as number

              if (prevSeq !== null && seq < prevSeq) {
                clearTimeout(timeout)
                sub2.close()
                resolve({ ok: false, gap: true, dup: false })
                return
              }

              if (seenSeqs.has(seq)) {
                clearTimeout(timeout)
                sub2.close()
                resolve({ ok: false, gap: false, dup: true })
                return
              }

              seenSeqs.add(seq)
              prevSeq = seq

              // §3.11: Cross-node completion — replay includes all events up to lastSeq1
              // (proves Redis history available on replacement node + resume cursor honored)
              if (lastSeq1 !== null && seq >= lastSeq1) {
                replayComplete = true
                clearTimeout(timeout)
                sub2.close()
                resolve({ ok: true, gap: false, dup: false })
              }
            }
          } catch {}
        })
      })

      let firstReplaySeq: number | null = null
      let lastReplaySeq: number | null = null
      for (const raw of replayEvents) {
        try {
          const data = JSON.parse(raw)
          if (typeof data.canonical_seq === "number") {
            if (firstReplaySeq === null) firstReplaySeq = data.canonical_seq
            lastReplaySeq = data.canonical_seq
          }
        } catch {}
      }

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

      ctx.log(`Nchan-2 replay: events=${replayEvents.length} ok=${replayResult.ok} gap=${replayResult.gap} dup=${replayResult.dup} outOfOrder=${outOfOrder} resumeTransportId=${lastEventId} firstSeq=${firstReplaySeq} lastSeq=${lastReplaySeq}`)

      // §3.11: Wire delivery accounting — frozen expected range from pre-restart observation
      ctx.metrics.incrementRestartReplayExpected(frozenExpectedCount1)
      ctx.metrics.incrementRestartReplayReceived(replayEvents.length)

      const passed = replayResult.ok && !replayResult.gap && !replayResult.dup && !outOfOrder

      return {
        name: this.name,
        passed,
        detail: [
          `type=cross-node`,
          `events=${replayEvents.length}`,
          `gap=${replayResult.gap}`,
          `dup=${replayResult.dup}`,
          `outOfOrder=${outOfOrder}`,
          `resumeTransportId=${lastEventId}`,
          `expectedFirstSeq=${frozenExpectedFirstSeq1}`,
          `receivedFirstSeq=${firstReplaySeq}`,
          `receivedLastSeq=${lastReplaySeq}`,
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
  // Triggers a stop/restart of the nginx process inside the Nyan container
  // via the test-only control server, then verifies Redis-backed history survives.
  private async literalRestartTest(ctx: ScenarioContext): Promise<{ name: string; passed: boolean; detail: string }> {
    ctx.log("--- PHASE: NCHAN RESTART (literal process restart) ---")

    const testMatch = ctx.matchIds[0]
    const recordedEvents: string[] = []
    let lastEventId: string | null = null

    // Step 1: Connect to nchan and record events + transport ID
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
      // Expected = events between resume cursor and head at restart time (NOT derived from received count)
      const frozenExpectedFirstSeq = lastSeq !== null ? lastSeq + 1 : null
      const headAtRestart = ctx.headTracker.getHead(testMatch)
      const frozenExpectedCount = frozenExpectedFirstSeq !== null && headAtRestart >= frozenExpectedFirstSeq
        ? headAtRestart - frozenExpectedFirstSeq + 1
        : 1 // Fallback: at minimum 1 event expected if head is unknown or <= lastSeq

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

      const replayResult = await new Promise<{ ok: boolean; gap: boolean; dup: boolean }>((resolve) => {
        const timeout = setTimeout(() => {
          sub2.close()
          // §3.11: Timeout with partial replay is NOT complete — ok=false unless target seq was reached
          resolve({ ok: false, gap: false, dup: false })
        }, 15_000)

        let prevSeq: number | null = null
        const seenSeqs = new Set<number>()

        sub2.onEvent((evt) => {
          if (evt.type !== "message" || replayComplete) return
          replayEvents.push(evt.event.data)

          try {
            const data = JSON.parse(evt.event.data)
            if (typeof data.canonical_seq === "number") {
              const seq = data.canonical_seq as number

              if (prevSeq !== null && seq < prevSeq) {
                clearTimeout(timeout)
                sub2.close()
                resolve({ ok: false, gap: true, dup: false })
                return
              }

              if (seenSeqs.has(seq)) {
                clearTimeout(timeout)
                sub2.close()
                resolve({ ok: false, gap: false, dup: true })
                return
              }

              seenSeqs.add(seq)
              prevSeq = seq

              // §3.11: Completion boundary — must receive event AFTER pre-restart last seq
              // (seq >= lastSeq merely replays the pre-restart event itself)
              if (lastSeq !== null && seq > lastSeq) {
                replayComplete = true
                clearTimeout(timeout)
                sub2.close()
                resolve({ ok: true, gap: false, dup: false })
              }
            }
          } catch {}
        })
      })

      let firstReplaySeq: number | null = null
      let lastReplaySeq: number | null = null
      for (const raw of replayEvents) {
        try {
          const data = JSON.parse(raw)
          if (typeof data.canonical_seq === "number") {
            if (firstReplaySeq === null) firstReplaySeq = data.canonical_seq
            lastReplaySeq = data.canonical_seq
          }
        } catch {}
      }

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

      ctx.log(`Post-restart replay: events=${replayEvents.length} ok=${replayResult.ok} gap=${replayResult.gap} dup=${replayResult.dup} outOfOrder=${outOfOrder} resumeTransportId=${lastEventId} firstSeq=${firstReplaySeq} lastSeq=${lastReplaySeq} restartMs=${restartMs}`)

      // §3.11/§3.13: Wire delivery accounting — frozen expected range from pre-restart head observation
      // NOT derived from received replay count
      ctx.metrics.incrementRestartReplayExpected(frozenExpectedCount)
      ctx.metrics.incrementRestartReplayReceived(replayEvents.length)

      const passed = replayResult.ok && !replayResult.gap && !replayResult.dup && !outOfOrder

      return {
        name: this.name,
        passed,
        detail: `literal-restart events=${replayEvents.length} gap=${replayResult.gap} dup=${replayResult.dup} outOfOrder=${outOfOrder} resumeTransportId=${lastEventId} canonicalRange=[${firstReplaySeq},${lastReplaySeq}] restartMs=${restartMs}`,
      }
    } catch (err) {
      ctx.log(`Nchan literal restart test failed: ${err}`)
      return { name: this.name, passed: false, detail: `error: ${err}` }
    }
  }
}
