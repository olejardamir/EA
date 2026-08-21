// §M3-GEN: Shared fast ISO-8601 UTC timestamp parser.
// publish_timestamp arrives as fixed-width ISO-8601 UTC
// ("YYYY-MM-DDTHH:mm:ss.mmmZ", 24 chars). new Date(...).getTime() per frame
// dominated the receive hot path (~62k frames/s/shard at 25k viewers).
// Memoize Date.parse of the second-resolution prefix — it changes once per
// second, so cache hit rate is ~99.998% per shard — and append millis
// arithmetically. Any non-canonical shape falls back to the original parse,
// preserving NaN semantics exactly.
let _isoPrefixCacheKey = ""
let _isoPrefixCacheMs = 0

export function fastIsoTimestampMs(ts: string): number {
  if (
    ts.length === 24
    && ts.charCodeAt(23) === 90 /* 'Z' */
    && ts.charCodeAt(19) === 46 /* '.' */
    && ts.charCodeAt(20) >= 48 && ts.charCodeAt(20) <= 57
    && ts.charCodeAt(21) >= 48 && ts.charCodeAt(21) <= 57
    && ts.charCodeAt(22) >= 48 && ts.charCodeAt(22) <= 57
  ) {
    const prefix = ts.slice(0, 19)
    let base = _isoPrefixCacheMs
    if (prefix !== _isoPrefixCacheKey) {
      base = Date.parse(prefix + "Z")
      if (!Number.isFinite(base)) return Number.NaN
      _isoPrefixCacheKey = prefix
      _isoPrefixCacheMs = base
    }
    return base
      + (ts.charCodeAt(20) - 48) * 100
      + (ts.charCodeAt(21) - 48) * 10
      + (ts.charCodeAt(22) - 48)
  }
  return new Date(ts).getTime()
}
