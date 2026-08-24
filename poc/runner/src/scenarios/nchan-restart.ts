import type { RestartPathResult, Scenario, ScenarioContext } from "./scenario.js"
import type { ConnectionPool } from "../application/connection-pool.js"

// A small accepted range is deliberately created after each resume cursor. This
// prevents a vacuous restart PASS when the publisher happens to be between ticks.
const RESTART_REPLAY_DEPTH = 8

// §v2.1.0: role-based participation in the partition-targeted restart drill.
// - owner: publishes the frozen range and probes the SPARE node (cross-node
//   replacement evidence; safe because the spare carries no pool viewers).
// - target: owns the drill partition (shard i ↔ partition i); drains its pool
//   with planned attribution, literally restarts its own node, fails every
//   viewer over to the spare with Last-Event-ID resume, and proves exact-range
//   replay plus zero failover-window correctness deltas.
// - bystander: records non-participation with no fabricated paths.
export type RestartScenarioRole = "owner" | "target" | "bystander"

export interface NchanRestartOptions {
  role: RestartScenarioRole
  ownSubUrl: string
  ownPubUrl: string
  spareSubUrl: string
  controlUrl: string
  pool: ConnectionPool
  restartTargetShard: number
  shardId: number
  // Resume-probe completion window. Production default 15s; tests inject a
  // short bound so adversarial incomplete ranges do not stall suites.
  probeTimeoutMs?: number
}

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
 *
 * §M3-PACE-2: frames ABOVE the range are live continuation on a live channel —
 * the shared publisher keeps publishing while the probe reads. They are never
 * credited as replay (diagnostic counters only); loss is caught by
 * missing_required, duplicates and ordering, so their presence alone cannot
 * fail an otherwise exact replay. Frames BELOW the range remain a defect:
 * stale replay under the consumed position is never acceptable.
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
  private opts: NchanRestartOptions

  // §v2.1.0: settle window after mass failover — lets Last-Event-ID replay and
  // resumed live delivery flow through every pool tracker before deltas are read.
  // Replay-settle window after failing the pool over to the spare. The missed
  // range must fully drain into the (reconnect-mode) trackers BEFORE promotion to
  // steady, or the tail of the replay arrives post-promotion and is misclassified
  // as steady duplicate/out-of-order. 30s comfortably spans a full restart + replay
  // under burst load.
  private static readonly FAILOVER_SETTLE_MS = 30_000

  constructor(opts: NchanRestartOptions) {
    this.opts = opts
  }

  async execute(ctx: ScenarioContext): Promise<{ name: string; passed: boolean; detail: string }> {
    const startPop = ctx._activePopulationStart ?? 0
    try {
      if (this.opts.role === "owner") {
        return await this.spareProbeTest(ctx)
      }
      if (this.opts.role === "target") {
        return await this.failoverDrillTest(ctx)
      }
      return {
        name: this.name,
        passed: true,
        detail: `not-participating: restart drill targeted at partition ${this.opts.restartTargetShard} (shard ${this.opts.restartTargetShard})`,
      }
    } finally {
      // §3.11.C: Record active population for this scenario
      ctx._restartActivePopulation = { start: startPop, peak: startPop, end: startPop }
    }
  }

  // Shared: connect one probe subscriber and wait for live frames.
  private async collectLiveEvents(
    ctx: ScenarioContext,
    subUrl: string,
    minEvents: number,
    timeoutMs: number,
  ): Promise<{ ok: boolean; lastEventId: string | null; lastSeq: number | null }> {
    let lastEventId: string | null = null
    const frames: string[] = []
    const sub = await ctx.eventStream.connect(subUrl)
    try {
      const received = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          sub.close()
          resolve(false)
        }, timeoutMs)
        sub.onEvent((evt) => {
          if (evt.type !== "message") return
          frames.push(evt.event.data)
          if (evt.event.id) lastEventId = evt.event.id
          if (frames.length >= minEvents) {
            clearTimeout(timeout)
            sub.close()
            resolve(true)
          }
        })
      })
      if (!received) return { ok: false, lastEventId, lastSeq: null }
      let lastSeq: number | null = null
      for (const raw of canonicalSequences(frames)) lastSeq = raw
      return { ok: true, lastEventId, lastSeq }
    } catch (err) {
      try { sub.close() } catch {}
      throw err
    }
  }

  // Shared: reconnect one probe with Last-Event-ID and evaluate the frozen range.
  private async resumeProbe(
    ctx: ScenarioContext,
    subUrl: string,
    lastEventId: string | null,
    expectedFirstSeq: number,
    expectedLastSeq: number,
    accounting: "cross_node" | "failover",
  ): Promise<RestartPathResult> {
    const expectedCount = expectedLastSeq - expectedFirstSeq + 1
    const sub = await ctx.eventStream.connect(subUrl, lastEventId ?? undefined)
    const replayEvents: string[] = []
    let replayComplete = false

    await new Promise<void>((resolve) => {
      const finish = () => {
        if (replayComplete) return
        replayComplete = true
        clearInterval(poll)
        clearTimeout(timeout)
        sub.close()
        resolve()
      }
      const timeout = setTimeout(finish, this.opts.probeTimeoutMs ?? 15_000)
      const poll = setInterval(() => {
        const received = canonicalSequences(replayEvents)
        const inRange = new Set(received.filter((s) => s >= expectedFirstSeq && s <= expectedLastSeq))
        if (inRange.size >= expectedCount) finish()
      }, 100)

      sub.onEvent((evt) => {
        if (evt.type !== "message" || replayComplete) return
        replayEvents.push(evt.event.data)
        try {
          const seq = JSON.parse(evt.event.data).canonical_seq
          if (typeof seq === "number" && seq > expectedLastSeq) {
            // Ordered delivery guarantees required sequences arrive before any
            // beyond-range frame; reaching one before the set is complete means
            // the missing required sequences were lost. Bounded-wait trigger:
            // evaluation below reports them via missing_required. If the set
            // IS already complete, this is ordinary live continuation.
            finish()
          }
        } catch {}
      })
    })

    const pathResult = evaluateRestartRequiredRange({
      transportResumeId: lastEventId,
      expectedFirstSeq,
      expectedLastSeq,
      receivedSequences: canonicalSequences(replayEvents),
      recoveryMs: 0,
    })

    // Wire delivery accounting — replay is not live delivery.
    ctx.metrics.incrementRestartReplayExpected(expectedCount)
    ctx.metrics.incrementRestartReplayReceived(pathResult.received_required_count)
    if (accounting === "cross_node") {
      ctx.metrics.incrementCrossNodeExpected(expectedCount)
      ctx.metrics.incrementCrossNodeReceived(pathResult.received_required_count)
    }
    return pathResult
  }

  // §v2.1.0 owner role: cross-node replacement evidence against the SPARE node.
  // The spare is idle (no pool viewers), so probing it is safe mid-run. This proves
  // publish→replicate→resume semantics on the replacement node without touching p0.
  private async spareProbeTest(ctx: ScenarioContext): Promise<{ name: string; passed: boolean; detail: string }> {
    ctx.log("--- PHASE: NCHAN RESTART (owner: spare-node cross-node probe) ---")
    if (!this.opts.spareSubUrl) {
      return { name: this.name, passed: false, detail: "owner: no spare node configured" }
    }
    const testMatch = ctx.matchIds[0]
    try {
      ctx.log(`Connecting to spare for ${testMatch}...`)
      const live = await this.collectLiveEvents(ctx, `${this.opts.spareSubUrl}/sub/${testMatch}`, 3, 15_000)
      if (!live.ok || live.lastSeq === null || !live.lastEventId) {
        return { name: this.name, passed: false, detail: `spare-probe: insufficient live events on spare (ok=${live.ok})` }
      }
      ctx.log(`Spare live replication confirmed: lastSeq=${live.lastSeq}`)

      // Owner publishes the frozen range — serialized per match via publishPrefill.
      const frozenExpectedFirstSeq = live.lastSeq + 1
      const acceptedRange = await ctx.publisher.publishPrefill(testMatch, RESTART_REPLAY_DEPTH)
      const headAtProbe = acceptedRange.lastSeq
      if (acceptedRange.published !== RESTART_REPLAY_DEPTH || headAtProbe < frozenExpectedFirstSeq) {
        return { name: this.name, passed: false, detail: `spare-probe: invalid frozen range first=${frozenExpectedFirstSeq} head=${headAtProbe}` }
      }

      await ctx.sleep(500)
      ctx.log(`Resuming on spare with lastEventId=${live.lastEventId}, range=[${frozenExpectedFirstSeq}..${headAtProbe}]`)
      const pathResult = await this.resumeProbe(
        ctx,
        `${this.opts.spareSubUrl}/sub/${testMatch}`,
        live.lastEventId,
        frozenExpectedFirstSeq,
        headAtProbe,
        "cross_node",
      )
      ctx._restartReplay ??= {}
      ctx._restartReplay.spare_probe = pathResult

      return {
        name: this.name,
        passed: pathResult.passed,
        detail: [
          `type=spare-probe`,
          `missing=${pathResult.missing_required}`,
          `dup=${pathResult.duplicates}`,
          `outOfOrder=${pathResult.out_of_order}`,
          `outBefore=${pathResult.out_of_range_before_count}`,
          `outAfter=${pathResult.out_of_range_after_count}`,
          `targetReached=${pathResult.target_reached}`,
          `expectedCount=${pathResult.expected_count}`,
          `receivedCount=${pathResult.received_required_count}`,
        ].join(" "),
      }
    } catch (err) {
      ctx.log(`Owner spare probe failed: ${err}`)
      return { name: this.name, passed: false, detail: `error: ${err}` }
    }
  }

  // §v2.1.0 target role: literal partition restart + planned mass failover to spare.
  // Shard owns partition viewers; it drains them client-side (planned attribution),
  // restarts its OWN node via its own control server, fails every viewer over to the
  // spare with Last-Event-ID resume, then verifies exact-range replay AND zero
  // failover-window correctness deltas across the whole pool.
  private async failoverDrillTest(ctx: ScenarioContext): Promise<{ name: string; passed: boolean; detail: string }> {
    ctx.log("--- PHASE: NCHAN RESTART (target: literal partition restart + planned failover) ---")
    if (!this.opts.spareSubUrl || !this.opts.controlUrl) {
      return { name: this.name, passed: false, detail: "target: spare node or control server not configured" }
    }
    const testMatch = ctx.matchIds[0]
    try {
      // Step 1: dedicated probe on own node captures the resume cursor.
      ctx.log(`Connecting drill probe to own partition for ${testMatch}...`)
      const live = await this.collectLiveEvents(ctx, `${this.opts.ownSubUrl}/sub/${testMatch}`, 3, 15_000)
      if (!live.ok || live.lastSeq === null || !live.lastEventId) {
        return { name: this.name, passed: false, detail: `failover-drill: insufficient live events pre-restart (ok=${live.ok})` }
      }

      // Step 2: freeze upper bound from the global canonical head (fed by ALL pool
      // viewers across partitions). Wait until at least one event lands above the
      // probe cursor so the range can never be empty (§3.9.D).
      const frozenExpectedFirstSeq = live.lastSeq + 1
      const deadline = Date.now() + 10_000
      let headAtRestart = ctx.headTracker.getHead(testMatch)
      while (headAtRestart < frozenExpectedFirstSeq && Date.now() < deadline) {
        await ctx.sleep(200)
        headAtRestart = ctx.headTracker.getHead(testMatch)
      }
      if (headAtRestart < frozenExpectedFirstSeq) {
        return { name: this.name, passed: false, detail: `failover-drill: invalid frozen range first=${frozenExpectedFirstSeq} head=${headAtRestart}` }
      }
      ctx.log(`Frozen failover range [${frozenExpectedFirstSeq}..${headAtRestart}], pool=${this.opts.pool.size}`)

      // Step 3: snapshot correctness counters, drain pool with planned attribution.
      const before = ctx.metrics.snapshot()
      const token = this.opts.pool.beginPlannedFailover()

      // Step 4: literal restart of this shard's own partition node.
      ctx.log(`Triggering literal partition restart via ${this.opts.controlUrl}...`)
      const restartStart = Date.now()
      try {
        const resp = await fetch(`${this.opts.controlUrl}/restart`, { method: "POST", signal: AbortSignal.timeout(5000) })
        if (!resp.ok) {
          return { name: this.name, passed: false, detail: `control server returned ${resp.status}` }
        }
      } catch (err) {
        return { name: this.name, passed: false, detail: `control server unreachable: ${err}` }
      }

      // Step 5: fail the entire pool over to the spare with Last-Event-ID resume.
      ctx.log(`Failing over ${token.saved.length} viewers to ${this.opts.spareSubUrl}...`)
      const failover = await this.opts.pool.completePlannedFailover(ctx.eventStream, token, this.opts.spareSubUrl)

      // Step 6: exact-range replay proof from the drill probe on the spare.
      const pathResult = await this.resumeProbe(
        ctx,
        `${this.opts.spareSubUrl}/sub/${testMatch}`,
        live.lastEventId,
        frozenExpectedFirstSeq,
        headAtRestart,
        "failover",
      )
      ctx._restartReplay ??= {}
      ctx._restartReplay.failover_drill = pathResult

      // Step 7: settle window — replay + live flow through pool trackers.
      await ctx.sleep(NchanRestartScenario.FAILOVER_SETTLE_MS)
      const promoted = this.opts.pool.promoteEntriesToSteady()

      // Step 8: failover-window correctness deltas across the entire pool.
      const after = ctx.metrics.snapshot()
      const gaps = (after.missing_sequences - before.missing_sequences) + (after.reconnect_gaps - before.reconnect_gaps)
      const duplicates = (after.duplicates - before.duplicates) + (after.reconnect_duplicates - before.reconnect_duplicates)
      const orderViolations = (after.out_of_order - before.out_of_order) + (after.reconnect_order_violations - before.reconnect_order_violations)

      // Step 9: the restarted partition must recover (replacement semantics —
      // it rejoins empty; viewers intentionally stay on the spare).
      const healthUrl = `${this.opts.ownPubUrl}/pub/healthcheck`
      let recovered = false
      const recoveryDeadline = Date.now() + 30_000
      while (Date.now() < recoveryDeadline) {
        try {
          const resp = await fetch(healthUrl, { signal: AbortSignal.timeout(3000) })
          if (resp.ok) { recovered = true; break }
        } catch {}
        await ctx.sleep(500)
      }
      const restartMs = Date.now() - restartStart
      if (!recovered) {
        return { name: this.name, passed: false, detail: `partition node did not recover within 30s (${restartMs}ms)` }
      }
      ctx.log(`Partition recovered in ${restartMs}ms; promoted ${promoted} entries to steady`)

      const poolPassed = failover.failed === 0 && gaps === 0 && duplicates === 0 && orderViolations === 0
      ctx._failoverHealth = {
        attempted: failover.attempted,
        reestablished: failover.reestablished,
        failed: failover.failed,
        gaps,
        duplicates,
        order_violations: orderViolations,
        planned_disconnects: after.planned_restart_disconnects - before.planned_restart_disconnects,
        restart_ms: restartMs,
      }

      return {
        name: this.name,
        passed: pathResult.passed && poolPassed,
        detail: [
          `type=failover-drill`,
          `attempted=${failover.attempted}`,
          `reestablished=${failover.reestablished}`,
          `failed=${failover.failed}`,
          `gaps=${gaps}`,
          `dups=${duplicates}`,
          `ooo=${orderViolations}`,
          `plannedDisconnects=${ctx._failoverHealth.planned_disconnects}`,
          `restartMs=${restartMs}`,
          `rangeMissing=${pathResult.missing_required}`,
          `rangeDup=${pathResult.duplicates}`,
          `rangeOutOfOrder=${pathResult.out_of_order}`,
          `targetReached=${pathResult.target_reached}`,
        ].join(" "),
      }
    } catch (err) {
      ctx.log(`Failover drill failed: ${err}`)
      return { name: this.name, passed: false, detail: `error: ${err}` }
    }
  }
}
