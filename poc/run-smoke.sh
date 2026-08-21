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

project_name="ea-smoke-${source_commit:0:12}-$(date +%s)-$$"
compose=(docker compose --project-name "$project_name" --project-directory "$poc_dir" -f "$poc_dir/compose.smoke-portable.yaml")
build_mode=(--build)
if [[ "${SMOKE_NO_BUILD:-0}" == "1" ]]; then
  # Non-qualifying offline validation may use already-built pinned images; the
  # current runner source is still mounted read-only by the portable profile.
  build_mode=(--no-build)
fi
set +e
"${compose[@]}" up "${build_mode[@]}" --abort-on-container-exit --exit-code-from runner
smoke_status=$?
set -e
"${compose[@]}" down
exit "$smoke_status"
