#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

REF="${1:-main}"
GIT_REMOTE="${GIT_REMOTE:-origin}"
ALLOW_DIRTY="${ALLOW_DIRTY:-0}"
PUBLIC_URL="${PUBLIC_URL:-https://events.danceresource.org}"
CURL_BIN="${CURL_BIN:-curl}"

BASE_COMPOSE="$REPO_ROOT/deploy/docker/docker-compose.base.yml"
ENV_FILE="$REPO_ROOT/.env"

active_color="$("$SCRIPT_DIR/bg-active-color.sh")"
if [[ "$active_color" == "blue" ]]; then
  inactive_color="green"
  inactive_api_port="13101"
  inactive_web_port="13100"
else
  inactive_color="blue"
  inactive_api_port="13001"
  inactive_web_port="13000"
fi

inactive_compose="$REPO_ROOT/deploy/docker/docker-compose.${inactive_color}.yml"
inactive_api_service="api_${inactive_color}"
inactive_web_service="web_${inactive_color}"

echo "Active color: $active_color"
echo "Deploy target (inactive color): $inactive_color"

if [[ "$ALLOW_DIRTY" != "1" ]] && [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is dirty. Commit/stash changes or set ALLOW_DIRTY=1." >&2
  exit 1
fi

echo "Fetching latest code from $GIT_REMOTE ..."
git fetch "$GIT_REMOTE"
git checkout "$REF"
git pull --ff-only "$GIT_REMOTE" "$REF"

echo "Ensuring shared infra is up (postgres + meili) ..."
docker compose --env-file "$ENV_FILE" -f "$BASE_COMPOSE" up -d postgres meilisearch

echo "Building inactive color services ..."
docker compose --env-file "$ENV_FILE" -f "$BASE_COMPOSE" -f "$inactive_compose" build "$inactive_api_service" "$inactive_web_service"

echo "Starting inactive color services ..."
docker compose --env-file "$ENV_FILE" -f "$BASE_COMPOSE" -f "$inactive_compose" up -d "$inactive_api_service" "$inactive_web_service"

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

echo "Waiting for inactive API health ..."
retry_curl "http://127.0.0.1:${inactive_api_port}/api/health" 40 2

echo "Running DB migrations (expand/contract-safe only) ..."
if ! docker compose --env-file "$ENV_FILE" -f "$BASE_COMPOSE" -f "$inactive_compose" exec -T "$inactive_api_service" npm run migrate -w @dr-events/api; then
  echo "Container migration failed (likely slim runtime image). Falling back to host migration ..."
  npm run migrate -w @dr-events/api
fi

echo "Waiting for inactive web readiness ..."
retry_curl "http://127.0.0.1:${inactive_web_port}/events" 40 2

echo "Switching Apache traffic to $inactive_color ..."
"$SCRIPT_DIR/bg-switch.sh" "$inactive_color"

echo "Running post-switch public smoke checks ..."
retry_curl "${PUBLIC_URL}/api/health" 20 2
retry_curl "${PUBLIC_URL}/events" 20 2
retry_curl "${PUBLIC_URL}/sitemap.xml" 20 2

echo "Running functional post-deploy smoke suite ..."
if ! SMOKE_URL="$PUBLIC_URL" npm run postdeploy:smoke --silent; then
  echo "Post-deploy smoke FAILED — previous color ($active_color) is still running." >&2
  echo "Inspect failures above; run 'npm run bg:rollback' to switch traffic back." >&2
  exit 1
fi

echo "Stopping previous color ($active_color) ..."
prev_compose="$REPO_ROOT/deploy/docker/docker-compose.${active_color}.yml"
docker compose --env-file "$ENV_FILE" -f "$BASE_COMPOSE" -f "$prev_compose" stop "api_${active_color}" "web_${active_color}"

echo "Blue/green deploy complete. Active color: $inactive_color"
