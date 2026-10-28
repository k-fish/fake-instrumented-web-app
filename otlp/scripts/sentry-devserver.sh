#!/bin/bash
# Runs `sentry devserver --workers` in a restart loop.
#
# In --workers mode the devserver supervisor (honcho) stops every process as soon
# as any one of them exits. The process-spans consumer exits on a Kafka
# _MAX_POLL_EXCEEDED whenever the machine is briefly busy (cargo build, Snuba
# restart), which took the whole devserver down several times during the PoC.
set -u
SENTRY_REPO=${SENTRY_REPO:-$HOME/repos/sentry}
LOG=${SENTRY_DEV_LOG:-/tmp/otlp-poc/sentry-devserver.log}
cd "$SENTRY_REPO" || exit 1
source .venv/bin/activate
export PATH="$PWD/.devenv/bin:$PATH"
# Default is 1 granian worker; one request blocked on a dead socket then stalls the whole UI.
export SENTRY_GRANIAN_WORKERS=${SENTRY_GRANIAN_WORKERS:-2}
while true; do
  echo "$(date -u +%FT%TZ) starting sentry devserver --workers" >> "$LOG"
  sentry devserver --workers >> "$LOG" 2>&1
  echo "$(date -u +%FT%TZ) devserver exited rc=$?, restarting in 5s" >> "$LOG"
  sleep 5
done
