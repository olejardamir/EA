#!/bin/bash
# Minimal reviewer-facing POC entrypoint: run nginx in the foreground only.
# No restart control server, no gdb livelock watcher, no diagnostic tooling.
set -u
exec nginx -g 'daemon off;'
