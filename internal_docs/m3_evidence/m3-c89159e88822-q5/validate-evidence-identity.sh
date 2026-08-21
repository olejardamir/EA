#!/usr/bin/env bash
# §24 evidence file identity validation — m3-c89159e88822-q5
# Usage: validate-evidence-identity.sh <dir-with-results>
set -euo pipefail

DIR="${1:?usage: validate-evidence-identity.sh <dir>}"
EXPECTED_COMMIT="c89159e8882206de9fffa2b170a38d76854288ce"
EXPECTED_CONTRACT="v2.0.5"
FAIL=0

check() { # check <label> <actual> <expected>
  if [ "$2" == "$3" ]; then
    echo "  OK   $1 = $2"
  else
    echo "  FAIL $1: got '$2' expected '$3'"
    FAIL=1
  fi
}

for N in 0 1 2; do
  F="$DIR/global-result-$N.json"
  echo "== global-result-$N.json =="
  if [ ! -f "$F" ]; then echo "  FAIL missing"; FAIL=1; continue; fi
  check contract_version    "$(jq -r .contract_version "$F")" "$EXPECTED_CONTRACT"
  check aggregate_scope     "$(jq -r .aggregate_scope "$F")" "simultaneous_global_run"
  check scope               "$(jq -r .scope "$F")" "global"
  check run_index           "$(jq -r .run_index "$F")" "$N"
  check seed                "$(jq -r .seed "$F")" "$((42 + N))"
  check global_target       "$(jq -r .global_target "$F")" "100000"
  check shard_count         "$(jq -r .shard_count "$F")" "4"
  check source_commit       "$(jq -r .source_commit "$F")" "$EXPECTED_COMMIT"
  check participating_ids   "$(jq -c .participating_shard_ids "$F")" "[0,1,2,3]"
  OWNERS=$(jq '[.shards[] | select(.publisher_owner == true)] | length' "$F" 2>/dev/null || \
           jq '[.. | objects | select(.publisher_owner? == true)] | length' "$F")
  check publisher_owners    "$OWNERS" "1"
done

echo "== campaign-result.json =="
C="$DIR/campaign-result.json"
if [ ! -f "$C" ]; then echo "  FAIL missing"; FAIL=1; else
  check contract_version "$(jq -r .contract_version "$C")" "$EXPECTED_CONTRACT"
  check aggregate_scope  "$(jq -r .aggregate_scope "$C")" "campaign"
  check scope            "$(jq -r .scope "$C")" "campaign"
  check run_count        "$(jq -r .run_count "$C")" "3"
  check run_indices      "$(jq -c .run_indices "$C")" "[0,1,2]"
  check source_commit    "$(jq -r .source_commit "$C")" "$EXPECTED_COMMIT"
  check global_target    "$(jq -r .global_target "$C")" "100000"
fi

echo
if [ "$FAIL" -eq 0 ]; then echo "IDENTITY VALIDATION: PASS"; else echo "IDENTITY VALIDATION: FAIL (non-qualifying)"; exit 1; fi
