#!/usr/bin/env bash
set -euo pipefail

poc_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(git -C "$poc_dir" rev-parse --show-toplevel)"
source_commit="$(git -C "$repo_dir" rev-parse HEAD)"
[[ "$source_commit" =~ ^[0-9a-f]{40}$ ]] || { echo "Unable to resolve a valid source commit SHA" >&2; exit 2; }
export GIT_COMMIT_SHA="$source_commit"

exec docker compose -f "$poc_dir/compose.evidence.yaml" up --build --abort-on-container-exit --exit-code-from runner
