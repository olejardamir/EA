#!/usr/bin/env bash
# Non-qualifying development probe launcher for the partitioned topology.
# Runs ONE coordinated global run at the requested scale with shortened
# phase durations. Never used for qualifying evidence (contract v2.1.0).
#
# Usage: ./run-probe.sh <viewers>   e.g. ./run-probe.sh 10000
set -euo pipefail

POC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VIEWERS="${1:?usage: ./run-probe.sh <viewers>}"
case "$VIEWERS" in
  ''|*[!0-9]*) echo "viewers must be an integer" >&2; exit 2 ;;
esac
(( VIEWERS >= 4000 && VIEWERS <= 100000 )) || { echo "probe scale must be 4000..100000" >&2; exit 2; }
(( VIEWERS % 4 == 0 )) || { echo "viewers must divide evenly across 4 shards" >&2; exit 2; }

SOURCE_COMMIT="$(git -C "$POC_DIR" rev-parse HEAD)"
PROBE_TARGET=$(( VIEWERS / 4 ))
STAMP="$(date +%Y%m%dT%H%M%S)"
PROJECT="ea-probe-${VIEWERS}-${STAMP,,}"

for p in 6379 8080 8081 18080 18081 28080 28081 38080 38081 48080 48081 8300; do
  if ss -tlnH 2>/dev/null | grep -q ":${p} " ; then
    echo "[probe] host port ${p} already in use — stop the dev stack (ea-dev-redis/ea-nchan-dev) or other host service before probing" >&2
    ss -tlnp 2>&1 | grep ":${p} " | head -n 5 >&2 || true
    exit 2
  fi
done

echo "[probe] viewers=${VIEWERS} per-shard=${PROBE_TARGET} project=${PROJECT}"
set +e
GIT_COMMIT_SHA="$SOURCE_COMMIT" \
COMPOSE_PROJECT_NAME="$PROJECT" \
CAMPAIGN_ID="$PROJECT" \
EXPERIMENT_RUN_ID="${PROJECT}-run0" \
GLOBAL_RUN_INDEX=0 \
GLOBAL_SEED=42 \
PROBE_TARGET="$PROBE_TARGET" \
PROBE_GLOBAL_TARGET="$VIEWERS" \
docker compose --project-name "$PROJECT" --project-directory "$POC_DIR" \
  -f "$POC_DIR/compose.evidence-100k.yaml" -f "$POC_DIR/compose.probe.yaml" \
  up --build --force-recreate --abort-on-container-exit --exit-code-from coordinator
status=$?
set -e
# Preserve the run's evidence volume before scratch cleanup so failures can
# be diagnosed from full wire results, not just log lines.
EVID_OUT="$POC_DIR/evidence-launches/$PROJECT"
mkdir -p "$EVID_OUT"
if docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT" | grep -q .; then
  docker run --rm -v "${PROJECT}_global-evidence:/evidence" -v "$EVID_OUT:/host" alpine \
    sh -c "cp /evidence/global-result-*.json /host/ 2>/dev/null; echo evidence_preserved"
fi
# Robust scratch cleanup: compose down first, then force-sweep any labeled
# leftovers so a crashed phase can never leak networks/volumes that would
# collide with later probes (subnet pool exhaustion).
docker compose --project-name "$PROJECT" --project-directory "$POC_DIR" \
  -f "$POC_DIR/compose.evidence-100k.yaml" -f "$POC_DIR/compose.probe.yaml" \
  down --volumes --remove-orphans >/dev/null 2>&1 || true
docker rm -f $(docker ps -aq --filter "label=com.docker.compose.project=$PROJECT") 2>/dev/null || true
docker network prune -f --filter "label=com.docker.compose.project=$PROJECT" >/dev/null 2>&1 || true
docker volume prune -f --filter "label=com.docker.compose.project=$PROJECT" >/dev/null 2>&1 || true
echo "[probe] exit=$status"
exit "$status"
