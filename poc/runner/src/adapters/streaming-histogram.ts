// §6.32: Bounded-memory streaming histogram for percentile computation.
// Replaces tail-truncated arrays that discard old samples and bias the distribution.
// Uses fixed-bucket integer-ms resolution over a frozen bounded latency range.

const DEFAULT_MAX_MS = 30_000
const DEFAULT_BUCKET_COUNT = DEFAULT_MAX_MS + 1

export interface SerializedHistogram {
  max_ms: number
  total_count: number
  overflow_count: number
  buckets: Array<[milliseconds: number, count: number]>
}

export class StreamingHistogram {
  private buckets: Uint32Array
  private maxMs: number
  private totalCount = 0
  private overflowCount = 0
  private trackedMax = 0

  constructor(maxMs = DEFAULT_MAX_MS) {
    this.maxMs = maxMs
    this.buckets = new Uint32Array(maxMs + 1)
  }

  record(ms: number): void {
    this.totalCount++
    if (ms < 0) {
      this.overflowCount++
      return
    }
    const bucket = Math.min(Math.round(ms), this.maxMs)
    this.buckets[bucket]++
    if (bucket > this.trackedMax) this.trackedMax = bucket
  }

  get count(): number {
    return this.totalCount
  }

  get max(): number {
    return this.trackedMax
  }

  get overflows(): number {
    return this.overflowCount
  }

  percentile(p: number): number {
    if (this.totalCount === 0) return 0
    const target = Math.ceil((p / 100) * this.totalCount)
    let cumulative = 0
    for (let i = 0; i <= this.maxMs; i++) {
      cumulative += this.buckets[i]
      if (cumulative >= target) return i
    }
    return this.trackedMax
  }

  p50(): number { return this.percentile(50) }
  p95(): number { return this.percentile(95) }
  p99(): number { return this.percentile(99) }

  // §BA: Export raw samples as a sorted array for pooled percentile across runs.
  // Only use for cross-run aggregation where raw samples are needed.
  toSortedArray(): number[] {
    const arr: number[] = []
    for (let ms = 0; ms <= this.maxMs; ms++) {
      const count = this.buckets[ms]
      for (let j = 0; j < count; j++) arr.push(ms)
    }
    return arr
  }

  // Merge another histogram into this one (for cross-worker aggregation)
  merge(other: StreamingHistogram): void {
    this.totalCount += other.totalCount
    this.overflowCount += other.overflowCount
    const limit = Math.min(this.maxMs, other.maxMs)
    for (let i = 0; i <= limit; i++) {
      this.buckets[i] += other.buckets[i]
    }
    if (other.maxMs > this.maxMs) {
      this.overflowCount += other.overflowCount
    }
    if (other.trackedMax > this.trackedMax) this.trackedMax = other.trackedMax
  }

  // §3.23: Clone this histogram for safe cross-run aggregation without mutating the original
  clone(): StreamingHistogram {
    const copy = new StreamingHistogram(this.maxMs)
    copy.totalCount = this.totalCount
    copy.overflowCount = this.overflowCount
    copy.trackedMax = this.trackedMax
    copy.buckets = new Uint32Array(this.buckets)
    return copy
  }

  // Sparse, lossless representation used for simultaneous cross-shard merging.
  // Percentiles must be recomputed from the merged buckets; percentile values
  // themselves are never averaged or maximized.
  serialize(): SerializedHistogram {
    const buckets: Array<[number, number]> = []
    for (let ms = 0; ms <= this.maxMs; ms++) {
      const count = this.buckets[ms]
      if (count > 0) buckets.push([ms, count])
    }
    return {
      max_ms: this.maxMs,
      total_count: this.totalCount,
      overflow_count: this.overflowCount,
      buckets,
    }
  }

  static deserialize(value: SerializedHistogram): StreamingHistogram {
    if (!Number.isInteger(value.max_ms) || value.max_ms < 1) {
      throw new Error("histogram max_ms must be a positive integer")
    }
    const histogram = new StreamingHistogram(value.max_ms)
    let populated = 0
    for (const [milliseconds, count] of value.buckets) {
      if (!Number.isInteger(milliseconds) || milliseconds < 0 || milliseconds > value.max_ms) {
        throw new Error(`invalid histogram bucket: ${milliseconds}`)
      }
      if (!Number.isInteger(count) || count < 1) {
        throw new Error(`invalid histogram bucket count: ${count}`)
      }
      histogram.buckets[milliseconds] = count
      populated += count
      if (milliseconds > histogram.trackedMax) histogram.trackedMax = milliseconds
    }
    if (populated + value.overflow_count !== value.total_count) {
      throw new Error("histogram population does not match total_count")
    }
    histogram.totalCount = value.total_count
    histogram.overflowCount = value.overflow_count
    return histogram
  }
}
