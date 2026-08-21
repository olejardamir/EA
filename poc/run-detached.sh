#!/usr/bin/env bash
set -euo pipefail

SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"

write_timestamp() {
  date -u +%Y-%m-%dT%H:%M:%S.%3NZ
}

if [[ "${1:-}" == "--worker" ]]; then
  (( $# >= 3 )) || exit 2
  record_dir="$2"
  shift 2

  printf '%s\n' "$$" > "$record_dir/launcher_pid.txt"
  "$@" &
  child_pid=$!
  printf '%s\n' "$child_pid" > "$record_dir/child_pid.txt"

  requested_signal_status=0
  forward_signal() {
    local signal_name="$1"
    local signal_number="$2"
    requested_signal_status=$((128 + signal_number))
    kill -s "$signal_name" "$child_pid" 2>/dev/null || true
  }
  trap 'forward_signal HUP 1' HUP
  trap 'forward_signal INT 2' INT
  trap 'forward_signal TERM 15' TERM

  set +e
  wait "$child_pid"
  command_status=$?
  if (( requested_signal_status != 0 )); then
    wait "$child_pid" 2>/dev/null
    command_status=$requested_signal_status
  fi
  set -e
  trap - HUP INT TERM

  write_timestamp > "$record_dir/end_timestamp.txt"
  # Write the status last. Its presence is the atomic completion marker for
  # detached supervisors and evidence collectors.
  printf '%s\n' "$command_status" > "$record_dir/exit_status.txt"
  exit "$command_status"
fi

if (( $# < 3 )) || [[ "$2" != "--" ]]; then
  echo "Usage: $0 RECORD_DIRECTORY -- COMMAND [ARG ...]" >&2
  exit 2
fi

record_dir="$1"
shift 2
if [[ -e "$record_dir" ]]; then
  echo "Refusing to reuse detached evidence directory: $record_dir" >&2
  exit 2
fi
mkdir -p "$record_dir"

write_timestamp > "$record_dir/start_timestamp.txt"
{
  printf '%q' "$1"
  for argument in "${@:2}"; do
    printf ' %q' "$argument"
  done
  printf '\n'
} > "$record_dir/command.txt"

nohup setsid "$SCRIPT_PATH" --worker "$record_dir" "$@" \
  > "$record_dir/stdout-stderr.log" 2>&1 < /dev/null &
bootstrap_pid=$!
printf '%s\n' "$bootstrap_pid" > "$record_dir/bootstrap_pid.txt"

echo "Detached launcher started; evidence record: $record_dir"
