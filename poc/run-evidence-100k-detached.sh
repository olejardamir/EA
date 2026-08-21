#!/usr/bin/env bash
set -euo pipefail

POC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_COMMIT="$(git -C "$POC_DIR" rev-parse HEAD 2>/dev/null || true)"
if ! [[ "$SOURCE_COMMIT" =~ ^[0-9a-f]{40}$ ]] && [[ -f "$POC_DIR/SOURCE_COMMIT" ]]; then
  SOURCE_COMMIT="$(tr -d '[:space:]' < "$POC_DIR/SOURCE_COMMIT")"
fi
if ! [[ "$SOURCE_COMMIT" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Cannot determine a valid source SHA" >&2
  exit 2
fi

project_name="${COMPOSE_PROJECT_NAME:-ea-evidence-100k-${SOURCE_COMMIT:0:12}-$(date +%s)}"
campaign_id="${CAMPAIGN_ID:-$project_name}"
campaign_started_at_ms="${CAMPAIGN_STARTED_AT_MS:-$(( $(date +%s) * 1000 ))}"
if [[ "$campaign_id" != "$project_name" ]]; then
  echo "CAMPAIGN_ID must equal COMPOSE_PROJECT_NAME" >&2
  exit 2
fi

record_dir="$POC_DIR/evidence-launches/$campaign_id"
exec "$POC_DIR/run-detached.sh" "$record_dir" -- \
  env \
    COMPOSE_PROJECT_NAME="$project_name" \
    CAMPAIGN_ID="$campaign_id" \
    CAMPAIGN_STARTED_AT_MS="$campaign_started_at_ms" \
    GLOBAL_RUNS="${GLOBAL_RUNS:-3}" \
    BASE_GLOBAL_SEED="${BASE_GLOBAL_SEED:-42}" \
    "$POC_DIR/run-evidence-100k.sh" "$@"

