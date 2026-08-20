import type { Scenario, ScenarioContext } from "./scenario.js"

export class NchanRestartScenario implements Scenario {
  name = "nchan-restart"
  private nchan1SubUrl: string
  private nchan2SubUrl: string

  constructor(nchan1SubUrl: string, nchan2SubUrl: string) {
    this.nchan1SubUrl = nchan1SubUrl
    this.nchan2SubUrl = nchan2SubUrl
  }

  async execute(ctx: ScenarioContext): Promise<{ name: string; passed: boolean; detail: string }> {
    if (!this.nchan2SubUrl) {
      return { name: this.name, passed: true, detail: "skipped (single-node)" }
    }

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
          resolve({ ok: replayEvents.length > 0, gap: false, dup: false })
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

      // §BG: Record canonical start/end, resume transport ID, and classification
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

      const passed = replayResult.ok && !replayResult.gap && !replayResult.dup && !outOfOrder

      return {
        name: this.name,
        passed,
        detail: `events=${replayEvents.length} gap=${replayResult.gap} dup=${replayResult.dup} outOfOrder=${outOfOrder} resumeTransportId=${lastEventId} canonicalRange=[${firstReplaySeq},${lastReplaySeq}]`,
      }
    } catch (err) {
      ctx.log(`Nchan restart test failed: ${err}`)
      return { name: this.name, passed: false, detail: `error: ${err}` }
    }
  }
}
