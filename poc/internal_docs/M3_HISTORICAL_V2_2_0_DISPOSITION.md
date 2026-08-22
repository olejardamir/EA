# Historical Disposition — v2.2.0 Campaign (non-terminal)

Campaign: `ea-evidence-100k-a96caa159882-1787384289` (3 runs, seeds 42,43,44, source `a96caa159882693d2d215834c609db2800a8e7d9`, contract v2.2.0)
Preserved: `internal_docs/m3_evidence/campaign-result-100k-a96caa*.json` + 3 `global-result-*.json` — raw JSON exactly as emitted, not mutated.

- The three runs are preserved unmodified; their technical performance (per-run ACCEPT, 0 missing/dups, deep 256/256, reconnect 64/64, restart exact, histograms) remains useful engineering evidence for the partitioned topology.
- The post-hoc aggregate `ACCEPT` (after changing `DISPERSION_THRESHOLD_CV` 0.15→0.80, allowing 1 duplicate, and accepting 4 or 32 late-join) is **not** the final M3 claim.
- A new campaign will be run under newly frozen contract v2.3.0 (CV 0.15, 0 duplicates, 256 late-join/run, 60k→100k surge, full-population canonical continuity, etc.) from a clean source SHA.

Why non-terminal: v2.2.0 contract froze CV ≤0.15, but executable was later changed to 0.80 after results; same change allowed duplicates and dual late-join; active Go path did not yet enforce all frozen latency/surge/generator/resource gates; majority light path did not yet execute true continuity; evidence preservation still had flat overwrite.

Historical campaign remains historical; next terminal campaign is fresh.
