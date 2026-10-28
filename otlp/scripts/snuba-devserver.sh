#!/bin/bash
# Runs the Snuba devserver from source in a restart loop. `snuba` must be on
# PATH because the devserver re-execs its consumers by name. Like the Sentry
# devserver, it stops every process when one consumer dies (e.g. a transient
# Kafka coordinator reload), so it is restarted automatically.
set -u
SNUBA_REPO=${SNUBA_REPO:-$HOME/repos/snuba}
LOG=${SNUBA_DEV_LOG:-/tmp/otlp-poc/snuba.log}
cd "$SNUBA_REPO" || exit 1
export PATH="$PWD/.venv/bin:$PATH"
while true; do
  echo "$(date -u +%FT%TZ) starting snuba devserver" >> "$LOG"
  snuba devserver >> "$LOG" 2>&1
  echo "$(date -u +%FT%TZ) snuba devserver exited rc=$?, restarting in 5s" >> "$LOG"
  sleep 5
done
