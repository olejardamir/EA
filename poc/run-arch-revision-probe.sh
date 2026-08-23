#!/usr/bin/env bash
# Architecture-revision 100k probe (match-aware 16-shard fan-out).
# Non-qualifying development probe with the new horizontal topology.
set -euo pipefail
POC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VIEWERS="${1:-100000}"
case "$VIEWERS" in ''|*[!0-9]*) echo "viewers must be an integer" >&2; exit 2;; esac
(( VIEWERS >= 4000 && VIEWERS <= 100000 )) || { echo "probe scale must be 4000..100000" >&2; exit 2; }
(( VIEWERS % 4 == 0 )) || { echo "viewers must divide evenly across 4 shards" >&2; exit 2; }

SOURCE_COMMIT="$(git -C "$POC_DIR" rev-parse HEAD 2>/dev/null || git -C "$(dirname "$POC_DIR")" rev-parse HEAD 2>/dev/null || echo "unknown")"
PROBE_TARGET=$(( VIEWERS / 4 ))
STAMP="$(date +%Y%m%dT%H%M%S)"
PROJECT="ea-arch-${VIEWERS}-${STAMP,,}"

# Compute match-aware routes (must match the port scheme in generate-fanout-confs.py / compose.arch-revision-100k.yaml)
python3 - <<'PY' > /tmp/arch-routes.env
import json
matches=[]
for m in range(8):
  for s in range(2):
    k=m*2+s
    pub=11080+k*100
    sub=11081+k*100
H="host.docker.internal"
pub_routes={}
sub_routes={}
for m in range(8):
  mid=f"match-{m+1:03d}"
  k0=m*2; k1=m*2+1
  pub_routes[mid]=[f"http://{H}:{11080+k0*100}", f"http://{H}:{11080+k1*100}"]
  sub_routes[mid]=[f"http://{H}:{11081+k0*100}", f"http://{H}:{11081+k1*100}"]
all_pub=[f"http://{H}:{11080+k*100}" for k in range(16)]
all_sub=[f"http://{H}:{11081+k*100}" for k in range(16)]
pub_routes["lobby"]=all_pub
sub_routes["lobby"]=all_sub
import shlex
# Write as single-quoted values for Docker --env-file compatibility
print(f"NCHAN_PUB_ROUTES='{json.dumps(pub_routes)}'")
print(f"NCHAN_SUB_ROUTES='{json.dumps(sub_routes)}'")
PY

set -a; source /tmp/arch-routes.env; set +a

echo "[arch-probe] viewers=${VIEWERS} per-shard=${PROBE_TARGET} project=${PROJECT}"
echo "[arch-probe] NCHAN_PUB_ROUTES keys=$(python3 -c "import json,os; print(len(json.loads(os.environ['NCHAN_PUB_ROUTES'])))" 2>/dev/null || echo "?")"

# Ports used by the 16 fanout instances + redis + publisher + coordinator
for p in 6379 8300 11080 11081 11180 11181 11280 11281 11380 11381 11480 11481 11580 11581 11680 11681 11780 11781 11880 11881 11980 11981 12080 12081 12180 12181 12280 12281 12380 12381 12480 12481 12580 12581; do
  if ss -tlnH 2>/dev/null | grep -q ":${p} " ; then
    echo "[arch-probe] host port ${p} already in use" >&2; ss -tlnp 2>&1 | grep ":${p} " | head -n 3 >&2 || true; exit 2
  fi
done

echo "[arch-probe] launching..."
set +e
NCHAN_PUB_ROUTES="$NCHAN_PUB_ROUTES" NCHAN_SUB_ROUTES="$NCHAN_SUB_ROUTES" \
 GIT_COMMIT_SHA="$SOURCE_COMMIT" \
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
rm -f /tmp/arch-routes.env
echo "[arch-probe] exit=$status"
exit "$status"
