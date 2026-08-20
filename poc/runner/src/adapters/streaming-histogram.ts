// §6.32: Bounded-memory streaming histogram for percentile computation.
// Replaces tail-truncated arrays that discard old samples and bias the distribution.
// Uses fixed-bucket integer-ms resolution over a frozen bounded latency range.

const DEFAULT_MAX_MS = 30_000
const DEFAULT_BUCKET_COUNT = DEFAULT_MAX_MS + 1

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
}
