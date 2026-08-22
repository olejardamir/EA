#!/usr/bin/env bash
set -euo pipefail

POC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Provenance: prefer the live checkout HEAD; fall back to the packaged
# poc/SOURCE_COMMIT file (written by the packaging step from the frozen HEAD)
# so the one-command reviewer path works from a ZIP-like copy with no .git.
# Both paths must yield a valid 40-hex commit SHA; "unknown" is never emitted.
SOURCE_COMMIT="$(git -C "$POC_DIR" rev-parse HEAD 2>/dev/null || true)"
if ! [[ "$SOURCE_COMMIT" =~ ^[0-9a-f]{40}$ ]] && [[ -f "$POC_DIR/SOURCE_COMMIT" ]]; then
  SOURCE_COMMIT="$(tr -d '[:space:]' < "$POC_DIR/SOURCE_COMMIT")"
fi
if ! [[ "$SOURCE_COMMIT" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Cannot determine a valid checkout commit SHA (no git checkout and no valid poc/SOURCE_COMMIT)" >&2
  exit 2
fi
GLOBAL_RUNS="${GLOBAL_RUNS:-3}"
BASE_GLOBAL_SEED="${BASE_GLOBAL_SEED:-42}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-ea-evidence-100k-${SOURCE_COMMIT:0:12}-$(date +%s)}"
CAMPAIGN_ID="${CAMPAIGN_ID:-$COMPOSE_PROJECT_NAME}"
CAMPAIGN_STARTED_AT_MS="${CAMPAIGN_STARTED_AT_MS:-$(( $(date +%s) * 1000 ))}"

if [[ ! "$SOURCE_COMMIT" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Cannot determine a valid checkout commit SHA" >&2
  exit 2
fi

export GIT_COMMIT_SHA="$SOURCE_COMMIT"
export CAMPAIGN_ID CAMPAIGN_STARTED_AT_MS
[[ "$GLOBAL_RUNS" =~ ^[0-9]+$ ]] && (( GLOBAL_RUNS == 3 )) || {
  echo "GLOBAL_RUNS must be exactly 3" >&2
  exit 2
}
[[ "$BASE_GLOBAL_SEED" =~ ^[0-9]+$ ]] || { echo "BASE_GLOBAL_SEED must be an integer" >&2; exit 2; }
# R07: qualifying mode is frozen to base seed 42 (runs 42,43,44). Development
# probes with other seeds must use the non-qualifying probe path.
[[ "$BASE_GLOBAL_SEED" == "42" ]] || { echo "BASE_GLOBAL_SEED must be the frozen qualifying base seed 42" >&2; exit 2; }
[[ "$CAMPAIGN_ID" == "$COMPOSE_PROJECT_NAME" ]] || { echo "CAMPAIGN_ID must equal COMPOSE_PROJECT_NAME" >&2; exit 2; }
[[ "$COMPOSE_PROJECT_NAME" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]+$ ]] || { echo "Invalid COMPOSE_PROJECT_NAME" >&2; exit 2; }

# R17: live-repository qualifying mode requires clean committed source before
# any Docker build — working tree, index, and unstaged diff all empty, and a
# valid 40-hex HEAD identifying the exact code built. The poc/SOURCE_COMMIT
# fallback remains only for the packaged reviewer mode with no .git.
if git -C "$POC_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  [[ -z "$(git -C "$POC_DIR" status --porcelain)" ]] || {
    echo "Qualifying launch requires a clean working tree (git status --porcelain not empty)" >&2
    exit 2
  }
  git -C "$POC_DIR" diff --quiet || { echo "Qualifying launch requires no unstaged diff" >&2; exit 2; }
  git -C "$POC_DIR" diff --cached --quiet || { echo "Qualifying launch requires no staged diff" >&2; exit 2; }
fi

# R16: campaign-isolated immutable evidence preservation. One canonical
# directory per campaign; refuse to touch an existing one so prior evidence
# (including q5/v2.2 artifacts) can never be overwritten.
EVIDENCE_DIR="$POC_DIR/internal_docs/m3_evidence/$CAMPAIGN_ID"
if [[ -e "$EVIDENCE_DIR" ]]; then
  echo "Evidence directory $EVIDENCE_DIR already exists; campaigns are immutable — choose a fresh CAMPAIGN_ID" >&2
  exit 2
fi
mkdir -p "$EVIDENCE_DIR"

CONTRACT_VERSION="$(sed -n 's/^export const ACTIVE_CONTRACT_VERSION = "\(.*\)"/\1/p' "$POC_DIR/runner/src/domain/active-contract.ts")"
printf '%s\n' "$SOURCE_COMMIT" > "$EVIDENCE_DIR/source-commit.txt"
printf '%s\n' "${CONTRACT_VERSION:-unknown}" > "$EVIDENCE_DIR/contract-version.txt"
printf '%s\n' "$*" > "$EVIDENCE_DIR/command.txt"
{
  echo "# M3 evidence campaign $CAMPAIGN_ID"
  echo "- started_at_ms: $CAMPAIGN_STARTED_AT_MS"
  echo "- source_commit: $SOURCE_COMMIT"
  echo "- contract_version: ${CONTRACT_VERSION:-unknown}"
  echo "- base_global_seed: $BASE_GLOBAL_SEED"
  echo "- global_runs: $GLOBAL_RUNS"
} > "$EVIDENCE_DIR/CAMPAIGN.md"
if [[ -f "$POC_DIR/runner/src/domain/active-contract.ts" ]]; then
  sha256sum "$POC_DIR/runner/src/domain/active-contract.ts" | awk '{print $1}' > "$EVIDENCE_DIR/contract.sha256"
fi
git -C "$POC_DIR" status --porcelain > "$EVIDENCE_DIR/git-status-before.txt" 2>/dev/null || true
{
  uname -a
  docker version 2>/dev/null | sed -n '1,20p'
  docker compose version 2>/dev/null
} > "$EVIDENCE_DIR/environment.txt"
docker compose --project-name x-provenance-render --project-directory "$POC_DIR" \
  -f "$POC_DIR/compose.evidence-100k.yaml" config > "$EVIDENCE_DIR/compose-config.txt" 2>/dev/null || true
docker images --digests --format '{{.Repository}}@{{.Digest}} {{.ID}}' \
  "$(docker compose --project-name x-provenance-render --project-directory "$POC_DIR" -f "$POC_DIR/compose.evidence-100k.yaml" config --images 2>/dev/null | head -1)" \
  > "$EVIDENCE_DIR/docker-images.txt" 2>/dev/null || true

# A qualifying campaign must never inherit results or service state. Refuse an
# existing Compose project instead of cleaning it and obscuring provenance.
if docker volume ls -q --filter "label=com.docker.compose.project=$COMPOSE_PROJECT_NAME" | grep -q . \
  || docker container ls -aq --filter "label=com.docker.compose.project=$COMPOSE_PROJECT_NAME" | grep -q . \
  || docker network ls -q --filter "label=com.docker.compose.project=$COMPOSE_PROJECT_NAME" | grep -q .; then
  echo "Compose project $COMPOSE_PROJECT_NAME already has storage/resources; choose a fresh campaign identity" >&2
  exit 2
fi

compose=(docker compose --project-name "$COMPOSE_PROJECT_NAME" --project-directory "$POC_DIR" -f "$POC_DIR/compose.evidence-100k.yaml")

for ((run_index = 0; run_index < GLOBAL_RUNS; run_index++)); do
  export GLOBAL_RUN_INDEX="$run_index"
  export GLOBAL_SEED="$((BASE_GLOBAL_SEED + run_index))"
  export EXPERIMENT_RUN_ID="${CAMPAIGN_ID}-global-${run_index}"
  export GLOBAL_RESULT_PATH="/evidence/global-result-${run_index}.json"

  # Continue through all frozen repetitions even when an individual global run
  # rejects or is inconclusive; the campaign aggregator owns final precedence.
  # R18/R16: exact per-run exit codes and full stdout/stderr are preserved in
  # the immutable campaign directory.
  set +e
  "${compose[@]}" up --build --force-recreate --abort-on-container-exit --exit-code-from coordinator "$@" \
    > "$EVIDENCE_DIR/run-${run_index}.stdout.log" \
    2> "$EVIDENCE_DIR/run-${run_index}.stderr.log"
  printf '%s\n' "$?" > "$EVIDENCE_DIR/run-${run_index}.exit"
  set -e
done

set +e
"${compose[@]}" run --rm --no-deps \
  -e GLOBAL_RUNS="$GLOBAL_RUNS" \
  -e GLOBAL_EVIDENCE_DIR=/evidence \
  -e CAMPAIGN_ID="$CAMPAIGN_ID" \
  -e GIT_COMMIT_SHA="$SOURCE_COMMIT" \
  -e BASE_GLOBAL_SEED="$BASE_GLOBAL_SEED" \
  -e CAMPAIGN_STARTED_AT_MS="$CAMPAIGN_STARTED_AT_MS" \
  coordinator npm run aggregate:global-campaign \
  > "$EVIDENCE_DIR/campaign.stdout.log" \
  2> "$EVIDENCE_DIR/campaign.stderr.log"
campaign_status=$?
printf '%s\n' "$campaign_status" > "$EVIDENCE_DIR/campaign.exit"
set -e

if docker volume ls -q --filter "label=com.docker.compose.project=$COMPOSE_PROJECT_NAME" | grep -q .; then
  docker run --rm -v "${COMPOSE_PROJECT_NAME}_global-evidence:/evidence" -v "$EVIDENCE_DIR:/host" alpine sh -c "cp /evidence/global-result-*.json /host/ 2>/dev/null; cp /evidence/campaign-result.json /host/campaign-result.json 2>/dev/null; echo evidence_preserved"
fi

# R16: machine-readable evidence manifest over the preserved artifacts.
{
  echo "# M3 evidence manifest — campaign $CAMPAIGN_ID"
  echo ""
  echo "| artifact | sha256 |"
  echo "|----------|--------|"
  for artifact in CAMPAIGN.md command.txt source-commit.txt contract-version.txt \
    contract.sha256 git-status-before.txt environment.txt compose-config.txt \
    docker-images.txt run-*.stdout.log run-*.stderr.log run-*.exit \
    global-result-*.json campaign.stdout.log campaign.stderr.log campaign.exit \
    campaign-result.json; do
    [[ -f "$EVIDENCE_DIR/$artifact" ]] || continue
    printf '| %s | %s |\n' "$artifact" "$(sha256sum "$EVIDENCE_DIR/$artifact" | awk '{print $1}')"
  done
} > "$EVIDENCE_DIR/M3_EVIDENCE_MANIFEST.md"

# R19: independent verdict audit. Recomputes every frozen gate from the raw
# per-run evidence without trusting any top-level verdict field, and writes
# M3_INDEPENDENT_VERDICT_AUDIT.md. Nonzero exit when it disagrees with a
# machine ACCEPT or when any check fails.
audit_status=0
if ( cd "$POC_DIR/runner" && GLOBAL_EVIDENCE_DIR="$EVIDENCE_DIR" \
    GIT_COMMIT_SHA="$SOURCE_COMMIT" CAMPAIGN_ID="$CAMPAIGN_ID" \
    BASE_GLOBAL_SEED="$BASE_GLOBAL_SEED" npm run --silent audit:independent \
    > "$EVIDENCE_DIR/audit.stdout.log" 2> "$EVIDENCE_DIR/audit.stderr.log" ); then
  audit_status=0
else
  audit_status=$?
fi

# R16: seal the campaign directory with a checksum manifest over every
# preserved artifact. Written once; nothing inside this directory is ever
# rewritten after sealing.
( cd "$EVIDENCE_DIR" && sha256sum CAMPAIGN.md command.txt source-commit.txt \
    contract-version.txt contract.sha256 git-status-before.txt environment.txt \
    compose-config.txt docker-images.txt M3_EVIDENCE_MANIFEST.md \
    run-*.stdout.log run-*.stderr.log run-*.exit global-result-*.json \
    campaign.stdout.log campaign.stderr.log campaign.exit campaign-result.json \
    audit.stdout.log audit.stderr.log M3_INDEPENDENT_VERDICT_AUDIT.md \
    > SHA256SUMS ) 2>/dev/null || true

"${compose[@]}" down
# Final launcher exit: 0 only when the campaign aggregation machine-verdicts
# ACCEPT (aggregator exits 0 exactly then) AND the independent audit agrees.
if (( campaign_status == 0 && audit_status == 0 )); then
  exit 0
fi
exit "${campaign_status:-1}"
