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
API_SERVICE="api_${COLOR}"
WEB_SERVICE="web_${COLOR}"

echo "Stopping old color stack: $COLOR"
docker compose -f "$BASE_COMPOSE" -f "$COLOR_COMPOSE" stop "$API_SERVICE" "$WEB_SERVICE"
echo "Done."
