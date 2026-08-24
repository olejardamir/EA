# M3 ACCEPT PUSH — SUBMISSION ZIP SYNCHRONIZATION (prompt section 17)

Date: 2026-08-24
Branch: m3-accept-push
Pre-sync ZIP SHA-256: 24450a3db3449800d91c2b9b14f7a594434a3bda57ba40a112db25e93b8e9723
Post-sync ZIP SHA-256: 6ec3bb0a70ef78350901e54165f0c887307e7b001365cb755b0f832b468dc885

## What changed in the ZIP
1. Added at archive root:
   M3_ACCEPT_PUSH_EXHAUST_REMAINING_NCHAN_CONFIG_SPACE.md
   (SHA-256 d7b6b42a610af4b7298dfec2c0522c7b73d102e8949093e93677d60e61fdb9c9)
2. Updated README.md allowed agent-instruction-file list to include the new artifact.
3. Everything else in the ZIP is byte-identical to the pre-sync archive (rebuilt from
   the original extracted contents; the working evidence under
   poc/internal_docs/m3_evidence/accept-push/ was deliberately NOT included per
   prompt section 17).

## M3 result status
M3 ACCEPT NOT ACHIEVED (see M3_ACCEPT_PUSH_OUTCOME.md). F1 remains the best validated
configuration; B1 (p0-only backup) measured marginally better than an F1 control but
within run-to-run noise and ~7x over the frozen fan_out gate. proposal.md / README.md
M3 numbers are unchanged (no new best probe superseded F1). Word-count/audit gates and
extracted-ZIP POC smoke were not re-run because no probe superseded F1 (per section 17
they are only required when a new best M3 result is achieved).

## Repo-side copies (provenance only)
- internal_docs/M3_ACCEPT_PUSH_EXHAUST_REMAINING_NCHAN_CONFIG_SPACE.md
- poc/internal_docs/m3_evidence/accept-push/M3_ACCEPT_PUSH_EXHAUST_REMAINING_NCHAN_CONFIG_SPACE.md
- poc/internal_docs/m3_evidence/accept-push/{CANDIDATE_DECISIONS,M3_ACCEPT_PUSH_OUTCOME,
  M3_ACCEPT_PUSH_PROVENANCE}.md
- poc/internal_docs/m3_evidence/accept-push/{n1-4k,b1-4k,b1-100k,f1-100k-control}/*
