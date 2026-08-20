import type { EventStream } from "../ports/event-stream.js"
import type { MetricsRecorder } from "../ports/metrics.js"
import type { Clock } from "../ports/clock.js"
import type { ResourceMonitor } from "../ports/resource-monitor.js"
import type { MatchHeadTracker } from "../domain/match-state.js"
import type { ExperimentConfig } from "../config/experiment-config.js"
import type { MatchEventPublisher } from "../adapters/match-event-publisher.js"

export interface PhaseSnapshot {
  phase: string
  eventsPublished: number
  byMatch: Map<string, number>
  durationMs: number
}

export interface ScenarioContext {
  publisher: MatchEventPublisher
  eventStream: EventStream
  metrics: MetricsRecorder
  clock: Clock
  resourceMonitor: ResourceMonitor
  headTracker: MatchHeadTracker
  config: ExperimentConfig
  matchIds: string[]
  phaseSnapshots: PhaseSnapshot[]
  log: (msg: string) => void
  sleep: (ms: number) => Promise<void>
  // §BH: surge scenario writes health metrics here for main.ts aggregation
  _surgeHealth?: {
    fan_out_p95_ms: number
    missing_sequences: number
    duplicates: number
    out_of_order: number
    events_received: number
  }
}

export interface ScenarioResult {
  name: string
  passed: boolean
  detail: string
}

export interface Scenario {
  name: string
  execute(ctx: ScenarioContext): Promise<ScenarioResult>
}
