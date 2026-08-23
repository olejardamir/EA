#!/bin/bash
# TEMP-DIAG: livelock watcher — polls nginx workers' voluntary context
# switches and CPU ticks every second. When a worker's vctx is frozen for
# FREEZE_SECS consecutive seconds while its CPU ticks still climb, dumps a
# gdb backtrace to stderr (once per pid per episode). Requires SYS_PTRACE.
set -u
FREEZE_SECS=5
MIN_TICKS=20

declare -A last_v last_t last_c frozen_count dumped

while true; do
  pids=$(pgrep -f "worker process" 2>/dev/null)
  now=$(date +%s%3N)
  for pid in $pids; do
    v=$(sed -n 's/^voluntary_ctxt_switches:[[:space:]]*//p' "/proc/$pid/status" 2>/dev/null)
    [ -z "$v" ] && continue
    stat=$(sed -n 's/.*) //p' "/proc/$pid/stat" 2>/dev/null)
    ticks=$(( $(echo "$stat" | awk '{print $12+$13}') ))
    lv=${last_v[$pid]:-}; lt=${last_t[$pid]:-}; lc=${last_c[$pid]:-}
    if [ -n "$lv" ] && [ "$lv" == "$v" ]; then
      n=${frozen_count[$pid]:-0}
      dc=$(( ticks - lc ))
      if [ "$dc" -ge "$MIN_TICKS" ]; then n=$((n+1)); else n=0; fi
      frozen_count[$pid]=$n
      if [ "$n" -ge "$FREEZE_SECS" ] && [ "${dumped[$pid]:-0}" == "0" ]; then
        dumped[$pid]=1
        echo "LIVELOCK-WATCHER: pid=$pid vctx frozen at $v for ${n}s while cpu +${dc} ticks — capturing backtrace"
        timeout 30 gdb -p "$pid" -batch \
          -ex "set pagination off" \
          -ex "bt 15" \
          -ex "info frame" \
          -ex "x/16gx \$rsp" \
          -ex detach 2>&1 | grep -vE "^\[|Reading symbols|Downloading|^warning"
        echo "LIVELOCK-WATCHER: backtrace done pid=$pid"
      fi
    else
      frozen_count[$pid]=0
      dumped[$pid]=0
    fi
    last_v[$pid]=$v
    last_t[$pid]=$now
    last_c[$pid]=$ticks
  done
  sleep 1
done
