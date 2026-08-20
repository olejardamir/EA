import type { Clock } from "../ports/clock.js"

export class SystemClock implements Clock {
  now(): number {
    return Date.now()
  }

  hrtime(): bigint {
    return process.hrtime.bigint()
  }
}
