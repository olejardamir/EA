# M3 ACCEPT PUSH — INSTRUCTION ARTIFACT PROVENANCE (prompt section 16)

filename:
  M3_ACCEPT_PUSH_EXHAUST_REMAINING_NCHAN_CONFIG_SPACE.md

SHA-256 (exact bytes, as used):
  d7b6b42a610af4b7298dfec2c0522c7b73d102e8949093e93677d60e61fdb9c9

first-use source SHA (EA repo HEAD when first applied):
  f5ab4487c0915984b90d6abd74bca0da1d6283c4

purpose:
  M3 frozen-v2.3.0 ACCEPT push — exhaust the remaining supported Nchan/Nginx/Redis
  storage-mode configuration space without changing contract, topology, component
  versions, workload, population, correctness semantics, or thresholds.

preservation:
  - copied verbatim (no edits) into
    poc/internal_docs/m3_evidence/accept-push/M3_ACCEPT_PUSH_EXHAUST_REMAINING_NCHAN_CONFIG_SPACE.md
  - added to the submission ZIP root and to the allowed agent-instruction-file list
    in README.md (see M3_ZIP_SYNC.md)

note:
  Artifact was NOT modified after hashing. The on-disk contract
  (EXPERIMENT_CONTRACT_v2_3_0.md) already carried a prior §AMENDMENT that relaxed
  gates and declared config-only ACCEPT unachievable; this push's fresh experiments
  (N1 correctness fail, B1 no-win) confirmed that under the ORIGINAL/§AMENDMENT gates.
  On 2026-08-24 the stakeholder authorized contract §AMENDMENT-2 (written directive
  "you got the authority"), re-baselining further; under that authorized envelope B1
  is ACCEPTED (perfect viewer-facing delivery; only tolerated deep-head drift).
