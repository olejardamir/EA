#!/usr/bin/env bash
# Architecture-revision 100k probe (match-aware 16-shard fan-out).
# Non-qualifying development probe with the new horizontal topology.
set -euo pipefail
POC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VIEWERS="${1:-100000}"
case "$VIEWERS" in ''|*[!0-9]*) echo "viewers must be an integer" >&2; exit 2;; esac
(( VIEWERS >= 4000 && VIEWERS <= 100000 )) || { echo "probe scale must be 4000..100000" >&2; exit 2; }
(( VIEWERS % 4 == 0 )) || { echo "viewers must divide evenly across 4 shards" >&2; exit 2; }

PROBE_TARGET=$(( VIEWERS / 4 ))
STAMP="$(date +%Y%m%dT%H%M%S)"
PROJECT="ea-arch-${VIEWERS}-${STAMP,,}"

# Match-aware routes are precomputed (port scheme in compose.arch-revision-100k.yaml /
# generate-fanout-confs.py) and committed in poc/.env so the launcher needs no host Python.
set -a; source "$POC_DIR/.env"; set +a

echo "[arch-probe] viewers=${VIEWERS} per-shard=${PROBE_TARGET} project=${PROJECT}"
PUB_KEYS="$(printf '%s' "$NCHAN_PUB_ROUTES" | grep -o 'match-[0-9]*' | wc -l | tr -d ' ')"
echo "[arch-probe] NCHAN_PUB_ROUTES match keys=${PUB_KEYS}"

# Ports used by the 16 fanout instances + redis + publisher + coordinator (best-effort check)
if command -v ss >/dev/null 2>&1; then
  for p in 6379 8300 11080 11081 11180 11181 11280 11281 11380 11381 11480 11481 11580 11581 11680 11681 11780 11781 11880 11881 11980 11981 12080 12081 12180 12181 12280 12281 12380 12381 12480 12481 12580 12581; do
    if ss -tlnH 2>/dev/null | grep -q ":${p} " ; then
      echo "[arch-probe] host port ${p} already in use" >&2; ss -tlnp 2>&1 | grep ":${p} " | head -n 3 >&2 || true; exit 2
    fi
  done
fi

echo "[arch-probe] launching..."
set +e
COMPOSE_PROJECT_NAME="$PROJECT" \
 CAMPAIGN_ID="$PROJECT" \
 EXPERIMENT_RUN_ID="${PROJECT}-run0" \
 GLOBAL_RUN_INDEX=0 \
 GLOBAL_SEED=42 \
 PROBE_TARGET="$PROBE_TARGET" \
 PROBE_GLOBAL_TARGET="$VIEWERS" \
 docker compose --project-name "$PROJECT" --project-directory "$POC_DIR" \
  -f "$POC_DIR/compose.arch-revision-100k.yaml" -f "$POC_DIR/compose.arch-probe.yaml" \
  up --build --force-recreate --abort-on-container-exit --exit-code-from coordinator
status=$?
set -e
EVID_OUT="$POC_DIR/evidence-launches/$PROJECT"
mkdir -p "$EVID_OUT"
if docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT" | grep -q .; then
  docker run --rm -v "${PROJECT}_global-evidence:/evidence" -v "$EVID_OUT:/host" alpine \
    sh -c "cp /evidence/global-result-*.json /host/ 2>/dev/null; echo evidence_preserved"
fi
docker compose --project-name "$PROJECT" --project-directory "$POC_DIR" \
  -f "$POC_DIR/compose.arch-revision-100k.yaml" -f "$POC_DIR/compose.arch-probe.yaml" \
  down --volumes --remove-orphans >/dev/null 2>&1 || true
docker rm -f $(docker ps -aq --filter "label=com.docker.compose.project=$PROJECT") 2>/dev/null || true
docker network prune -f --filter "label=com.docker.compose.project=$PROJECT" >/dev/null 2>&1 || true
docker volume prune -f --filter "label=com.docker.compose.project=$PROJECT" >/dev/null 2>&1 || true
echo "[arch-probe] exit=$status"
exit "$status"
