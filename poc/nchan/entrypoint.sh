#!/bin/bash
# §E/§6.7: Entrypoint that runs nginx as a supervised process and a test-only
# restart control server. When the runner triggers a literal Nginx process restart
# via the control server, this supervisor stops and restarts nginx without killing
# the container.
#
# NGINX_CONF env var selects which nginx config to load:
#   /etc/nginx/nginx.conf        (default, partition node p0)
#   /etc/nginx/nchan-2.conf      (partition node p1)
#   /etc/nginx/nchan-3.conf      (partition node p2)
#   /etc/nginx/nchan-4.conf      (partition node p3)
#   /etc/nginx/nchan-spare.conf  (spare replacement node)
#   /etc/nginx/nchan-portable.conf (portable bridge networking)
set -u

NGINX_CONF="${NGINX_CONF:-/etc/nginx/nginx.conf}"
CONTROL_PORT="${CONTROL_PORT:-18888}"

start_nginx() {
  echo "Starting nginx with config: $NGINX_CONF"
  nginx -c "$NGINX_CONF" -g 'daemon off;' &
  NGINX_PID=$!
}

cleanup() {
  kill "$NGINX_PID" "$CONTROL_PID" 2>/dev/null || true
  wait "$NGINX_PID" "$CONTROL_PID" 2>/dev/null || true
  exit 0
}

trap cleanup INT TERM

echo "Starting control server on port $CONTROL_PORT"
node /usr/local/bin/control-server.js &
CONTROL_PID=$!

# TEMP-DIAG: auto-backtrace any worker whose context switches freeze while it
# burns CPU (burst-onset livelock). Remove with the watcher once fixed.
# LIVELOCK_WATCHER=0 disables: gdb -p ATTACH STOPS the worker for the whole
# symbol-load + backtrace window; 39 attaches landed mid-drain in run S,
# each one pausing exactly the worker whose delivery queue was already the
# deepest. Needed to separate diagnostic interference from the base stall.
if [ -f /usr/local/bin/livelock-watcher.sh ] && [ "${LIVELOCK_WATCHER:-1}" != "0" ]; then
  /usr/local/bin/livelock-watcher.sh &
fi

start_nginx

# Supervisor loop: if nginx exits (stop or crash), restart it.
while true; do
  wait "$NGINX_PID" 2>/dev/null
  EXIT_CODE=$?
  if [ "$EXIT_CODE" -eq 0 ]; then
    echo "Nginx exited cleanly (stop signal), restarting..."
  else
    echo "Nginx exited with code $EXIT_CODE, restarting..."
  fi
  sleep 1
  start_nginx
done
