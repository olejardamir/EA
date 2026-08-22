# Live Match Centre POC — v2.2.0 Horizontal Partition (100k)

One-command 100k: `./run-evidence-100k.sh` (needs GIT_COMMIT_SHA, 3 runs, seeds 42-44, ~20 min, 4×25k + spare + Redis + publisher, Go crowd)
Probe: `./run-probe.sh 10000` (4k..100k, 2500 per shard for 10k)
Contract: `internal_docs/EXPERIMENT_CONTRACT_v2_2_0.md`, architecture `LOADGEN_ARCHITECTURE_v2_2_0.md`
Evidence: `internal_docs/m3_evidence/campaign-result-100k-*.json` (ACCEPT, 3× ACCEPT, 32 late-join)
Cost/proposal: `internal_docs/COST_MODEL_v2_2_0.md`, `PROPOSAL_v2_2_0.md`
Repro: `MILESTONE_4_V2_2_0_ACCEPT_RECONCILIATION.md`

Requires Docker, 12+ CPU, 32G RAM, host network, `net.ipv4.ip_local_port_range` 1024 65535.
