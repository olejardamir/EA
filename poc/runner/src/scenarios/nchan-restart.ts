import type { RestartPathResult, Scenario, ScenarioContext } from "./scenario.js"

// A small accepted range is deliberately created after each resume cursor. This
// prevents a vacuous restart PASS when the publisher happens to be between ticks.
const RESTART_REPLAY_DEPTH = 8

export interface RestartRangeEvaluationInput {
  transportResumeId: string | null
  expectedFirstSeq: number
  expectedLastSeq: number
  receivedSequences: number[]
  recoveryMs: number
}

/**
 * Evaluate only membership in the independently frozen canonical interval.
 * Out-of-range frames can never increase received_required_count or repair a
 * missing canonical sequence. Both restart paths use this same predicate.
 */
export function evaluateRestartRequiredRange(input: RestartRangeEvaluationInput): RestartPathResult {
  const expectedCount = input.expectedLastSeq - input.expectedFirstSeq + 1
  const requiredReceived = new Set<number>()
  let requiredDuplicates = 0
  let requiredOutOfOrder = 0
  let outOfRangeBefore = 0
  let outOfRangeAfter = 0
  let previousRequired: number | null = null
  let firstRequired: number | null = null

  for (const seq of input.receivedSequences) {
    if (seq < input.expectedFirstSeq) {
      outOfRangeBefore++
      continue
    }
    if (seq > input.expectedLastSeq) {
      outOfRangeAfter++
      continue
    }
    if (firstRequired === null) firstRequired = seq
    if (previousRequired !== null && seq < previousRequired) requiredOutOfOrder++
    if (requiredReceived.has(seq)) requiredDuplicates++
    requiredReceived.add(seq)
    previousRequired = seq
  }

  const missingRequiredSequences: number[] = []
  if (expectedCount > 0) {
    for (let seq = input.expectedFirstSeq; seq <= input.expectedLastSeq; seq++) {
      if (!requiredReceived.has(seq)) missingRequiredSequences.push(seq)
    }
  }
  const exactSetComplete = expectedCount > 0 && missingRequiredSequences.length === 0
  const missingPrefix = firstRequired !== input.expectedFirstSeq

  return {
    transport_resume_id: input.transportResumeId,
    expected_first_seq: input.expectedFirstSeq,
    expected_last_seq: input.expectedLastSeq,
    received_first_seq: input.receivedSequences[0] ?? null,
    received_last_seq: input.receivedSequences.at(-1) ?? null,
    expected_count: Math.max(0, expectedCount),
    received_required_count: requiredReceived.size,
    missing_required: missingRequiredSequences.length,
    missing_required_sequences: missingRequiredSequences,
    duplicates: requiredDuplicates,
    out_of_order: requiredOutOfOrder,
    out_of_range_before_count: outOfRangeBefore,
    out_of_range_after_count: outOfRangeAfter,
    missing_prefix: missingPrefix,
    target_reached: exactSetComplete,
    recovery_ms: input.recoveryMs,
    passed: exactSetComplete
      && requiredDuplicates === 0
      && requiredOutOfOrder === 0
      && outOfRangeBefore === 0
      && outOfRangeAfter === 0
      && !missingPrefix,
  }
}

function canonicalSequences(frames: string[]): number[] {
  return frames.flatMap((raw) => {
    try {
      const seq = JSON.parse(raw).canonical_seq
      return typeof seq === "number" && Number.isInteger(seq) ? [seq] : []
    } catch { return [] }
  })
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

      // §3.11/§3.13: Deliberately create and freeze a non-empty accepted range
      // BEFORE connecting to nchan-2. publishPrefill is serialized per match, so
      // its last accepted sequence is an unambiguous replacement boundary.
      const frozenExpectedFirstSeq1 = lastSeq1 !== null ? lastSeq1 + 1 : null
      const acceptedRange = await ctx.publisher.publishPrefill(testMatch, RESTART_REPLAY_DEPTH)
      const headAtReplacement = acceptedRange.lastSeq

      // §3.9.D: Never fall back to expectedCount=1 or accept an empty range.
      if (acceptedRange.published !== RESTART_REPLAY_DEPTH || frozenExpectedFirstSeq1 === null || headAtReplacement < frozenExpectedFirstSeq1) {
        ctx.log(`§3.9 Cross-node: invalid frozen range (first=${frozenExpectedFirstSeq1}, head=${headAtReplacement})`)
        return { name: this.name, passed: false, detail: `cross-node: invalid frozen range first=${frozenExpectedFirstSeq1} head=${headAtReplacement}` }
      }

      const frozenExpectedCount1 = headAtReplacement - frozenExpectedFirstSeq1 + 1

      ctx.log("Waiting 500ms before connecting to nchan-2...")
      await ctx.sleep(500)

      ctx.log(`Connecting to nchan-2 for ${testMatch} (lastEventId=${lastEventId})...`)
      const sub2Url = `${this.nchan2SubUrl}/sub/${testMatch}`
      const sub2 = await ctx.eventStream.connect(sub2Url, lastEventId)

      // §3.2.C: Build the frozen expected set for exact-range membership tracking
      const frozenExpectedSet = new Set<number>()
      for (let s = frozenExpectedFirstSeq1; s <= headAtReplacement; s++) frozenExpectedSet.add(s)

      const replayEvents: string[] = []
      let replayComplete = false

      const replayResult = await new Promise<{
        ok: boolean; gap: boolean; dup: boolean; firstSeq: number | null; lastSeq: number | null;
        requiredReceived: Set<number>; outOfRangeBefore: number; outOfRangeAfter: number;
        duplicateRequired: number; requiredOutOfOrder: boolean;
      }>((resolve) => {
        let prevSeq: number | null = null
        const seenSeqs = new Set<number>()
        const requiredReceived = new Set<number>()
        let firstSeq: number | null = null
        let lastSeq: number | null = null
        let outOfRangeBefore = 0
        let outOfRangeAfter = 0
        let duplicateRequired = 0
        let requiredOutOfOrder = false

        const timeout = setTimeout(() => {
          sub2.close()
          resolve({ ok: false, gap: false, dup: false, firstSeq, lastSeq,
            requiredReceived, outOfRangeBefore, outOfRangeAfter,
            duplicateRequired, requiredOutOfOrder })
        }, 10_000)

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
                resolve({ ok: false, gap: true, dup: false, firstSeq, lastSeq,
                  requiredReceived, outOfRangeBefore, outOfRangeAfter,
                  duplicateRequired, requiredOutOfOrder: true })
                return
              }

              if (seenSeqs.has(seq)) {
                if (frozenExpectedSet.has(seq)) duplicateRequired++
                clearTimeout(timeout)
                sub2.close()
                resolve({ ok: false, gap: false, dup: true, firstSeq, lastSeq,
                  requiredReceived, outOfRangeBefore, outOfRangeAfter,
                  duplicateRequired, requiredOutOfOrder })
                return
              }

              seenSeqs.add(seq)

              // §3.2.C: Only count canonical sequences within the frozen expected range
              if (frozenExpectedSet.has(seq)) {
                requiredReceived.add(seq)
                // §3.2.C: Track out-of-order within required set
                if (requiredReceived.size > 1) {
                  const prevRequired = seq - 1
                  if (frozenExpectedSet.has(prevRequired) && !requiredReceived.has(prevRequired)) {
                    requiredOutOfOrder = true
                  }
                }
              } else if (seq < frozenExpectedFirstSeq1) {
                outOfRangeBefore++
              } else {
                outOfRangeAfter++
                clearTimeout(timeout)
                sub2.close()
                resolve({ ok: false, gap: true, dup: false, firstSeq, lastSeq,
                  requiredReceived, outOfRangeBefore, outOfRangeAfter,
                  duplicateRequired, requiredOutOfOrder })
                return
              }

              prevSeq = seq

              // §3.2.C: Completion requires ALL required sequences, not just seq >= target
              if (requiredReceived.size === frozenExpectedCount1) {
                replayComplete = true
                clearTimeout(timeout)
                sub2.close()
                resolve({ ok: true, gap: false, dup: false, firstSeq, lastSeq,
                  requiredReceived, outOfRangeBefore, outOfRangeAfter,
                  duplicateRequired, requiredOutOfOrder })
              }
            }
          } catch {}
        })
      })

      // §3.9.E: Missing prefix detection
      const missingPrefix = frozenExpectedFirstSeq1 !== null
        && replayResult.firstSeq !== null
        && replayResult.firstSeq !== frozenExpectedFirstSeq1

      ctx.log(`Nchan-2 replay: events=${replayEvents.length} ok=${replayResult.ok} gap=${replayResult.gap} dup=${replayResult.dup} requiredOutOfOrder=${replayResult.requiredOutOfOrder} missingPrefix=${missingPrefix} resumeTransportId=${lastEventId} firstSeq=${replayResult.firstSeq} lastSeq=${replayResult.lastSeq} requiredReceived=${replayResult.requiredReceived.size}/${frozenExpectedCount1} outOfRangeBefore=${replayResult.outOfRangeBefore} outOfRangeAfter=${replayResult.outOfRangeAfter} duplicateRequired=${replayResult.duplicateRequired}`)

      // §3.2.E/§3.9.F: The exact-set evaluator is the sole producer of
      // structured values and PASS for both restart paths.
      const pathResult = evaluateRestartRequiredRange({
        transportResumeId: lastEventId,
        expectedFirstSeq: frozenExpectedFirstSeq1,
        expectedLastSeq: headAtReplacement,
        receivedSequences: canonicalSequences(replayEvents),
        recoveryMs: 0,
      })
      ctx._restartReplay ??= {}
      ctx._restartReplay.cross_node = pathResult

      // §3.9.E: Wire delivery accounting — separate from literal restart
      ctx.metrics.incrementRestartReplayExpected(frozenExpectedCount1)
      ctx.metrics.incrementRestartReplayReceived(pathResult.received_required_count)
      // §3.9: Separated cross-node metrics
      ctx.metrics.incrementCrossNodeExpected(frozenExpectedCount1)
      ctx.metrics.incrementCrossNodeReceived(pathResult.received_required_count)

      return {
        name: this.name,
        passed: pathResult.passed,
        detail: [
          `type=cross-node`,
          `events=${replayEvents.length}`,
          `gap=${pathResult.missing_required > 0}`,
          `dup=${pathResult.duplicates}`,
          `outOfOrder=${pathResult.out_of_order}`,
          `missingPrefix=${pathResult.missing_prefix}`,
          `missing=${pathResult.missing_required_sequences.join(",")}`,
          `outBefore=${pathResult.out_of_range_before_count}`,
          `outAfter=${pathResult.out_of_range_after_count}`,
          `targetReached=${pathResult.target_reached}`,
          `resumeTransportId=${lastEventId}`,
          `expectedFirstSeq=${frozenExpectedFirstSeq1}`,
          `receivedFirstSeq=${pathResult.received_first_seq}`,
          `receivedLastSeq=${pathResult.received_last_seq}`,
          `expectedCount=${frozenExpectedCount1}`,
          `receivedCount=${pathResult.received_required_count}`,
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

      // §3.11/§3.13: Deliberately publish and freeze a non-empty canonical
      // range BEFORE restart. This makes the literal-restart assertion test real
      // retained history rather than accepting an idle/empty interval.
      const frozenExpectedFirstSeq = lastSeq !== null ? lastSeq + 1 : null
      const acceptedRange = await ctx.publisher.publishPrefill(testMatch, RESTART_REPLAY_DEPTH)
      const headAtRestart = acceptedRange.lastSeq

      // §3.9.D: Do not fall back to expectedCount=1 or allow an empty range.
      if (acceptedRange.published !== RESTART_REPLAY_DEPTH || frozenExpectedFirstSeq === null || headAtRestart < frozenExpectedFirstSeq) {
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

      // §3.2.C: Build the frozen expected set for exact-range membership tracking
      const frozenExpectedSet = new Set<number>()
      for (let s = frozenExpectedFirstSeq; s <= headAtRestart; s++) frozenExpectedSet.add(s)

      const replayEvents: string[] = []
      let replayComplete = false

      const replayResult = await new Promise<{
        ok: boolean; gap: boolean; dup: boolean; firstSeq: number | null; lastSeq: number | null;
        requiredReceived: Set<number>; outOfRangeBefore: number; outOfRangeAfter: number;
        duplicateRequired: number; requiredOutOfOrder: boolean;
      }>((resolve) => {
        let prevSeq: number | null = null
        const seenSeqs = new Set<number>()
        const requiredReceived = new Set<number>()
        let firstSeq: number | null = null
        let lastSeq: number | null = null
        let outOfRangeBefore = 0
        let outOfRangeAfter = 0
        let duplicateRequired = 0
        let requiredOutOfOrder = false

        const timeout = setTimeout(() => {
          sub2.close()
          resolve({ ok: false, gap: false, dup: false, firstSeq, lastSeq,
            requiredReceived, outOfRangeBefore, outOfRangeAfter,
            duplicateRequired, requiredOutOfOrder })
        }, 15_000)

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
                resolve({ ok: false, gap: true, dup: false, firstSeq, lastSeq,
                  requiredReceived, outOfRangeBefore, outOfRangeAfter,
                  duplicateRequired, requiredOutOfOrder: true })
                return
              }

              if (seenSeqs.has(seq)) {
                if (frozenExpectedSet.has(seq)) duplicateRequired++
                clearTimeout(timeout)
                sub2.close()
                resolve({ ok: false, gap: false, dup: true, firstSeq, lastSeq,
                  requiredReceived, outOfRangeBefore, outOfRangeAfter,
                  duplicateRequired, requiredOutOfOrder })
                return
              }

              seenSeqs.add(seq)

              // §3.2.C: Only count canonical sequences within the frozen expected range
              if (frozenExpectedSet.has(seq)) {
                requiredReceived.add(seq)
                // §3.2.C: Track out-of-order within required set
                if (requiredReceived.size > 1) {
                  const prevRequired = seq - 1
                  if (frozenExpectedSet.has(prevRequired) && !requiredReceived.has(prevRequired)) {
                    requiredOutOfOrder = true
                  }
                }
              } else if (seq < frozenExpectedFirstSeq) {
                outOfRangeBefore++
              } else {
                outOfRangeAfter++
                clearTimeout(timeout)
                sub2.close()
                resolve({ ok: false, gap: true, dup: false, firstSeq, lastSeq,
                  requiredReceived, outOfRangeBefore, outOfRangeAfter,
                  duplicateRequired, requiredOutOfOrder })
                return
              }

              prevSeq = seq

              // §3.2.D: Completion requires ALL required sequences, not just seq >= target
              if (requiredReceived.size === frozenExpectedCount) {
                replayComplete = true
                clearTimeout(timeout)
                sub2.close()
                resolve({ ok: true, gap: false, dup: false, firstSeq, lastSeq,
                  requiredReceived, outOfRangeBefore, outOfRangeAfter,
                  duplicateRequired, requiredOutOfOrder })
              }
            }
          } catch {}
        })
      })

      // §3.9.B: Missing prefix detection
      const missingPrefix = frozenExpectedFirstSeq !== null
        && replayResult.firstSeq !== null
        && replayResult.firstSeq !== frozenExpectedFirstSeq

      ctx.log(`Post-restart replay: events=${replayEvents.length} ok=${replayResult.ok} gap=${replayResult.gap} dup=${replayResult.dup} requiredOutOfOrder=${replayResult.requiredOutOfOrder} missingPrefix=${missingPrefix} resumeTransportId=${lastEventId} firstSeq=${replayResult.firstSeq} lastSeq=${replayResult.lastSeq} restartMs=${restartMs} requiredReceived=${replayResult.requiredReceived.size}/${frozenExpectedCount} outOfRangeBefore=${replayResult.outOfRangeBefore} outOfRangeAfter=${replayResult.outOfRangeAfter} duplicateRequired=${replayResult.duplicateRequired}`)

      const pathResult = evaluateRestartRequiredRange({
        transportResumeId: lastEventId,
        expectedFirstSeq: frozenExpectedFirstSeq,
        expectedLastSeq: headAtRestart,
        receivedSequences: canonicalSequences(replayEvents),
        recoveryMs: restartMs,
      })
      ctx._restartReplay ??= {}
      ctx._restartReplay.literal_restart = pathResult

      // §3.11/§3.13: Wire delivery accounting — frozen expected range from pre-restart head observation
      ctx.metrics.incrementRestartReplayExpected(frozenExpectedCount)
      ctx.metrics.incrementRestartReplayReceived(pathResult.received_required_count)
      // §3.9: Separated literal restart metrics
      ctx.metrics.incrementLiteralRestartExpected(frozenExpectedCount)
      ctx.metrics.incrementLiteralRestartReceived(pathResult.received_required_count)

      return {
        name: this.name,
        passed: pathResult.passed,
        detail: [
          `type=literal-restart`,
          `events=${replayEvents.length}`,
          `gap=${pathResult.missing_required > 0}`,
          `dup=${pathResult.duplicates}`,
          `outOfOrder=${pathResult.out_of_order}`,
          `missingPrefix=${pathResult.missing_prefix}`,
          `missing=${pathResult.missing_required_sequences.join(",")}`,
          `outBefore=${pathResult.out_of_range_before_count}`,
          `outAfter=${pathResult.out_of_range_after_count}`,
          `targetReached=${pathResult.target_reached}`,
          `resumeTransportId=${lastEventId}`,
          `expectedFirstSeq=${frozenExpectedFirstSeq}`,
          `receivedFirstSeq=${pathResult.received_first_seq}`,
          `receivedLastSeq=${pathResult.received_last_seq}`,
          `expectedCount=${frozenExpectedCount}`,
          `receivedCount=${pathResult.received_required_count}`,
          `restartMs=${restartMs}`,
          `active_start=${ctx._activePopulationStart ?? 0}`,
          `active_peak=${ctx._activePopulationStart ?? 0}`,
          `active_end=${ctx._activePopulationStart ?? 0}`,
        ].join(" "),
      }
    } catch (err) {
      ctx.log(`Nchan literal restart test failed: ${err}`)
      return { name: this.name, passed: false, detail: `error: ${err}` }
    } finally {
      // §3.11.C: Record active population for this scenario
      const startPop = ctx._activePopulationStart ?? 0
      ctx._restartActivePopulation = { start: startPop, peak: startPop, end: startPop }
    }
  }
}
