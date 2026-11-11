#!/usr/bin/env bash
set -euo pipefail

COLOR="${1:-}"
if [[ "$COLOR" != "blue" && "$COLOR" != "green" ]]; then
  echo "Usage: $0 <blue|green>" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BASE_COMPOSE="$REPO_ROOT/deploy/docker/docker-compose.base.yml"
COLOR_COMPOSE="$REPO_ROOT/deploy/docker/docker-compose.${COLOR}.yml"
ENV_FILE="$REPO_ROOT/.env"
API_SERVICE="api_${COLOR}"
WEB_SERVICE="web_${COLOR}"

active="$("$SCRIPT_DIR/bg-active-color.sh" || true)"
if [[ "$COLOR" == "$active" ]]; then
  echo "Refusing to stop $COLOR: it is the active color serving traffic." >&2
  exit 1
fi

echo "Stopping old color stack: $COLOR"
docker compose --env-file "$ENV_FILE" -f "$BASE_COMPOSE" -f "$COLOR_COMPOSE" stop "$API_SERVICE" "$WEB_SERVICE"
echo "Done."
