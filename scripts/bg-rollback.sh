#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STATE_FILE="${STATE_FILE:-/var/run/dr_events_bg_previous_color}"
BASE_COMPOSE="$REPO_ROOT/deploy/docker/docker-compose.base.yml"
ENV_FILE="$REPO_ROOT/.env"
CURL_BIN="${CURL_BIN:-curl}"

if [[ -f "$STATE_FILE" ]]; then
  previous_color="$(tr -d '[:space:]' < "$STATE_FILE")"
else
  previous_color=""
fi

current="$("$SCRIPT_DIR/bg-active-color.sh" || true)"
if [[ "$previous_color" != "blue" && "$previous_color" != "green" ]] || [[ "$previous_color" == "$current" ]]; then
  if [[ "$current" == "blue" ]]; then
    previous_color="green"
  else
    previous_color="blue"
  fi
fi

if [[ "$previous_color" == "blue" ]]; then
  api_port="13001"
  web_port="13000"
else
  api_port="13101"
  web_port="13100"
fi

retry_curl() {
  local url="$1"
  local max_attempts="${2:-30}"
  local sleep_seconds="${3:-2}"
  local attempt=1
  until "$CURL_BIN" -fsS "$url" >/dev/null 2>&1; do
    if (( attempt >= max_attempts )); then
      echo "Health check failed: $url" >&2
      return 1
    fi
    attempt=$((attempt + 1))
    sleep "$sleep_seconds"
  done
}

echo "Rolling back to: $previous_color"

# bg-deploy.sh stops the previous color once a deploy succeeds, so it is
# normally exited here. Start it (existing containers, previous image; never
# rebuild) and wait until it answers before moving traffic onto it.
echo "Starting $previous_color services (no rebuild) ..."
docker compose --env-file "$ENV_FILE" -f "$BASE_COMPOSE" \
  -f "$REPO_ROOT/deploy/docker/docker-compose.${previous_color}.yml" \
  up -d --no-build --no-recreate "api_${previous_color}" "web_${previous_color}"

echo "Waiting for $previous_color API health ..."
if ! retry_curl "http://127.0.0.1:${api_port}/api/health" 40 2; then
  echo "Rollback aborted: $previous_color API is not healthy. Traffic stays on ${current:-the current color}." >&2
  exit 1
fi
echo "Waiting for $previous_color web readiness ..."
if ! retry_curl "http://127.0.0.1:${web_port}/events" 40 2; then
  echo "Rollback aborted: $previous_color web is not ready. Traffic stays on ${current:-the current color}." >&2
  exit 1
fi

"$SCRIPT_DIR/bg-switch.sh" "$previous_color"
echo "Rollback complete. Active color: $previous_color"
echo "The rolled-back-from color is still running; stop it with 'npm run bg:cleanup -- <color>' once you are sure."
