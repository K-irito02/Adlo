#!/usr/bin/env bash
set -euo pipefail

# Stop brainstorm server
# Usage: stop-server.sh <session-dir>

if [[ $# -lt 1 ]]; then
  echo "Usage: stop-server.sh <session-dir>"
  exit 1
fi

SESSION_DIR="$1"
STATE_DIR="$SESSION_DIR/state"
PID_FILE="$STATE_DIR/server.pid"
STOP_FILE="$STATE_DIR/server-stopped"

if [[ -f "$PID_FILE" ]]; then
  PID=$(cat "$PID_FILE")
  kill "$PID" 2>/dev/null && echo "Server process $PID stopped" || echo "Process $PID not found (already stopped)"
  rm -f "$PID_FILE"
else
  echo "No PID file found at $PID_FILE"
fi

echo "stopped at $(date)" > "$STOP_FILE"
echo "Server stopped: $SESSION_DIR"