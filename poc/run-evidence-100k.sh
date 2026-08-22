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
[[ "$GLOBAL_RUNS" =~ ^[0-9]+$ ]] && (( GLOBAL_RUNS >= 3 && GLOBAL_RUNS <= 8 )) || {
  echo "GLOBAL_RUNS must be in the frozen 3..8 range" >&2
  exit 2
}
[[ "$BASE_GLOBAL_SEED" =~ ^[0-9]+$ ]] || { echo "BASE_GLOBAL_SEED must be an integer" >&2; exit 2; }
[[ "$CAMPAIGN_ID" == "$COMPOSE_PROJECT_NAME" ]] || { echo "CAMPAIGN_ID must equal COMPOSE_PROJECT_NAME" >&2; exit 2; }
[[ "$COMPOSE_PROJECT_NAME" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]+$ ]] || { echo "Invalid COMPOSE_PROJECT_NAME" >&2; exit 2; }

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
  "${compose[@]}" up --build --force-recreate --abort-on-container-exit --exit-code-from coordinator "$@" || true
done

set +e
"${compose[@]}" run --rm --no-deps \
  -e GLOBAL_RUNS="$GLOBAL_RUNS" \
  -e GLOBAL_EVIDENCE_DIR=/evidence \
  -e CAMPAIGN_ID="$CAMPAIGN_ID" \
  -e GIT_COMMIT_SHA="$SOURCE_COMMIT" \
  -e BASE_GLOBAL_SEED="$BASE_GLOBAL_SEED" \
  -e CAMPAIGN_STARTED_AT_MS="$CAMPAIGN_STARTED_AT_MS" \
  coordinator npm run aggregate:global-campaign
campaign_status=$?
set -e

mkdir -p "$POC_DIR/internal_docs/m3_evidence"
if docker volume ls -q --filter "label=com.docker.compose.project=$COMPOSE_PROJECT_NAME" | grep -q .; then
  docker run --rm -v "${COMPOSE_PROJECT_NAME}_global-evidence:/evidence" -v "$POC_DIR/internal_docs/m3_evidence:/host" alpine sh -c 'cp /evidence/campaign-result.json /host/campaign-result-100k-'"$SOURCE_COMMIT"'".json 2>/dev/null; cp /evidence/global-result-*.json /host/ 2>/dev/null; echo "evidence preserved to internal_docs/m3_evidence"'
fi

"${compose[@]}" down
exit "$campaign_status"
