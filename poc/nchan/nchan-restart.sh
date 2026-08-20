#!/bin/bash
# §E/§6.7: Stop nginx so the entrypoint supervisor restarts it.
# Only stops the nginx process; does NOT start a new one.
# The entrypoint supervisor loop detects nginx exit and restarts with
# the correct NGINX_CONF and daemon-off settings.
set -u
echo "[$(date -Iseconds)] restart: stopping nginx..."
nginx -s stop 2>/dev/null || true
# Wait for nginx master process to exit (max 10s)
for i in $(seq 1 20); do
  if ! pgrep -x nginx >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done
echo "[$(date -Iseconds)] restart: nginx stopped, supervisor will restart"
