#!/usr/bin/env bash
set -euo pipefail

poc_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Provenance: live checkout HEAD first, packaged poc/SOURCE_COMMIT fallback
# (see run-evidence-100k.sh); "unknown" is never emitted.
source_commit="$(git -C "$poc_dir" rev-parse HEAD 2>/dev/null || true)"
if ! [[ "$source_commit" =~ ^[0-9a-f]{40}$ ]] && [[ -f "$poc_dir/SOURCE_COMMIT" ]]; then
  source_commit="$(tr -d '[:space:]' < "$poc_dir/SOURCE_COMMIT")"
fi
[[ "$source_commit" =~ ^[0-9a-f]{40}$ ]] || { echo "Unable to resolve a valid source commit SHA (no git checkout and no valid poc/SOURCE_COMMIT)" >&2; exit 2; }
export GIT_COMMIT_SHA="$source_commit"

exec docker compose -f "$poc_dir/compose.yaml" up --build --abort-on-container-exit --exit-code-from runner
