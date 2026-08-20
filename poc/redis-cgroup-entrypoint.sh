#!/bin/sh
set -eu

# Export Redis's own cgroup evidence through a read-only named volume mounted by
# the runner. This survives FLUSHALL and avoids treating Compose limits as if
# they were runtime observations.
mkdir -p /redis-cgroup
cp /sys/fs/cgroup/cpu.max /redis-cgroup/cpu.max
cp /sys/fs/cgroup/cpuset.cpus.effective /redis-cgroup/cpuset.cpus.effective

exec "$@"
