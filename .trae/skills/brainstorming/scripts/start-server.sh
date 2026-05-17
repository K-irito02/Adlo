#!/usr/bin/env bash
set -euo pipefail

# Start brainstorm server
# Usage: start-server.sh [--project-dir <path>] [--host <ip>] [--url-host <hostname>] [--foreground]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR=""
HOST="127.0.0.1"
URL_HOST=""
FOREGROUND=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-dir) PROJECT_DIR="$2"; shift 2 ;;
    --host) HOST="$2"; shift 2 ;;
    --url-host) URL_HOST="$2"; shift 2 ;;
    --foreground) FOREGROUND=true; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ -z "$URL_HOST" ]]; then
  if [[ "$HOST" == "127.0.0.1" || "$HOST" == "localhost" ]]; then
    URL_HOST="localhost"
  else
    URL_HOST="$HOST"
  fi
fi

SESSION_ID="$$-$(date +%Y%m%d-%H%M%S)"

if [[ -n "$PROJECT_DIR" ]]; then
  SESSION_DIR="$PROJECT_DIR/.superpowers/brainstorm/$SESSION_ID"
else
  SESSION_DIR="/tmp/brainstorm-$SESSION_ID"
fi

STATE_DIR="$SESSION_DIR/state"
CONTENT_DIR="$SESSION_DIR/content"
PID_FILE="$STATE_DIR/server.pid"
LOG_FILE="$STATE_DIR/server.log"

mkdir -p "$CONTENT_DIR" "$STATE_DIR"

# Kill existing server if any
if [[ -f "$PID_FILE" ]]; then
  OLD_PID=$(cat "$PID_FILE")
  kill "$OLD_PID" 2>/dev/null || true
  rm -f "$PID_FILE"
fi

cd "$SCRIPT_DIR"

export BRAINSTORM_DIR="$SESSION_DIR"
export BRAINSTORM_HOST="$HOST"
export BRAINSTORM_URL_HOST="$URL_HOST"
export BRAINSTORM_OWNER_PID="$$"

if $FOREGROUND; then
  echo "$$" > "$PID_FILE"
  exec node server.cjs
else
  node server.cjs > "$LOG_FILE" 2>&1 &
  SERVER_PID=$!
  echo "$SERVER_PID" > "$PID_FILE"

  # Wait for server-started message
  for i in $(seq 1 50); do
    sleep 0.1
    if [[ -f "$LOG_FILE" ]]; then
      LINE=$(grep -o '{"type":"server-started".*}' "$LOG_FILE" | head -1)
      if [[ -n "$LINE" ]]; then
        echo "$LINE"
        exit 0
      fi
    fi
  done

  echo '{"error": "Server failed to start within 5 seconds"}'
  exit 1
fi