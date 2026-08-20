#!/usr/bin/env bash
set -euo pipefail

POC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_DIR="$(git -C "$POC_DIR" rev-parse --show-toplevel)"
SOURCE_COMMIT="$(git -C "$REPOSITORY_DIR" rev-parse HEAD)"
GLOBAL_RUNS="${GLOBAL_RUNS:-3}"
BASE_GLOBAL_SEED="${BASE_GLOBAL_SEED:-42}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-ea-evidence-100k}"

if [[ ! "$SOURCE_COMMIT" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Cannot determine a valid checkout commit SHA" >&2
  exit 2
fi

export GIT_COMMIT_SHA="$SOURCE_COMMIT"
[[ "$GLOBAL_RUNS" =~ ^[0-9]+$ ]] && (( GLOBAL_RUNS >= 3 && GLOBAL_RUNS <= 8 )) || {
  echo "GLOBAL_RUNS must be in the frozen 3..8 range" >&2
  exit 2
}
[[ "$BASE_GLOBAL_SEED" =~ ^[0-9]+$ ]] || { echo "BASE_GLOBAL_SEED must be an integer" >&2; exit 2; }

compose=(docker compose --project-name "$COMPOSE_PROJECT_NAME" --project-directory "$POC_DIR" -f "$POC_DIR/compose.evidence-100k.yaml")

for ((run_index = 0; run_index < GLOBAL_RUNS; run_index++)); do
  export GLOBAL_RUN_INDEX="$run_index"
  export GLOBAL_SEED="$((BASE_GLOBAL_SEED + run_index))"
  export EXPERIMENT_RUN_ID="${SOURCE_COMMIT:0:12}-global-${run_index}-$(date +%s)"
  export GLOBAL_RESULT_PATH="/evidence/global-result-${run_index}.json"

  # Continue through all frozen repetitions even when an individual global run
  # rejects or is inconclusive; the campaign aggregator owns final precedence.
  "${compose[@]}" up --build --force-recreate --abort-on-container-exit --exit-code-from coordinator "$@" || true
done

set +e
"${compose[@]}" run --rm --no-deps \
  -e GLOBAL_RUNS="$GLOBAL_RUNS" \
  -e GLOBAL_EVIDENCE_DIR=/evidence \
  coordinator npm run aggregate:global-campaign
campaign_status=$?
set -e

"${compose[@]}" down
exit "$campaign_status"
