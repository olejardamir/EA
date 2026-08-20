#!/usr/bin/env bash
set -euo pipefail

POC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_DIR="$(git -C "$POC_DIR" rev-parse --show-toplevel)"
SOURCE_COMMIT="$(git -C "$REPOSITORY_DIR" rev-parse HEAD)"

if [[ ! "$SOURCE_COMMIT" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Cannot determine a valid checkout commit SHA" >&2
  exit 2
fi

export GIT_COMMIT_SHA="$SOURCE_COMMIT"
exec docker compose \
  --project-directory "$POC_DIR" \
  -f "$POC_DIR/compose.evidence-100k.yaml" \
  up --build --abort-on-container-exit --exit-code-from coordinator "$@"
