#!/bin/bash
# Runs the Snuba devserver from source. `snuba` must be on PATH because the
# devserver re-execs its consumers by name.
set -u
SNUBA_REPO=${SNUBA_REPO:-$HOME/repos/snuba}
LOG=${SNUBA_DEV_LOG:-/tmp/otlp-poc/snuba.log}
cd "$SNUBA_REPO" || exit 1
export PATH="$PWD/.venv/bin:$PATH"
exec snuba devserver >> "$LOG" 2>&1
