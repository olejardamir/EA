// R11 publisher-evidence fixture: structured per-boundary counter snapshots
// and measured publication rates matching the production wire shape exposed
// by the Go loadgen under resources.generator.publisher. Healthy totals, eight
// advancing match heads, steady/burst accepted rates inside the frozen windows.
export function validPublisherEvidence(): Record<string, unknown> {
  const heads = (seq: number): Record<string, number> => {
    const out: Record<string, number> = {}
    for (let i = 0; i < 8; i++) out[`match-${i}`] = seq
    return out
  }
  const snap = (published: number, seq: number): Record<string, unknown> => ({
    attempts: published + 2,
    published,
    definite_failures: 0,
    ambiguous_failures: 0,
    pending_peak: 10,
    heads: heads(seq),
    fetched_at_ms: Date.now(),
  })
  return {
    "warmup:end": snap(10, 1),
    "steady:start": snap(20, 2),
    "steady:end": snap(120, 12), // +100 over a 10s window → 10.0/s
    "burst:start": snap(130, 13),
    "burst:end": snap(1680, 63), // +1550 over a 31s window → 50.0/s
    "final-metrics:start": snap(1690, 64),
    publication_rates: {
      steady_accepted_per_sec: 10.0,
      burst_accepted_per_sec: 50.0,
    },
  }
}
