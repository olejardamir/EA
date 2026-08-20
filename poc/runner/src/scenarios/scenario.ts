import type { EventStream } from "../ports/event-stream.js"
import type { MetricsRecorder } from "../ports/metrics.js"
import type { Clock } from "../ports/clock.js"
import type { ResourceMonitor } from "../ports/resource-monitor.js"
import type { MatchHeadTracker } from "../domain/match-state.js"
import type { ExperimentConfig } from "../config/experiment-config.js"
import type { MatchEventPublisher } from "../adapters/match-event-publisher.js"

export interface ScenarioContext {
  publisher: MatchEventPublisher
  eventStream: EventStream
  metrics: MetricsRecorder
  clock: Clock
  resourceMonitor: ResourceMonitor
  headTracker: MatchHeadTracker
  config: ExperimentConfig
  matchIds: string[]
  log: (msg: string) => void
  sleep: (ms: number) => Promise<void>
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
