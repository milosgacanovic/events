#!/usr/bin/env bash
set -euo pipefail

# Quick-deploy web frontend: local build + docker cp + restart
# Use for CSS/HTML/JS tweaks. For full deploys, use bg-deploy.sh.
#
# Usage: bash scripts/quick-deploy-web.sh [color]
#   color: blue|green (default: auto-detect active color)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Determine active color
COLOR="${1:-}"
if [ -z "$COLOR" ]; then
  COLOR=$("$SCRIPT_DIR/bg-active-color.sh" 2>/dev/null || echo "blue")
fi
CONTAINER="dr_events_web_${COLOR}"

echo "==> Quick-deploy web to $CONTAINER"

# Build env vars (must match docker-compose build args)
export NEXT_PUBLIC_API_BASE_URL=/api
export NEXT_PUBLIC_KEYCLOAK_URL=https://sso.danceresource.org
export NEXT_PUBLIC_KEYCLOAK_REALM=danceresource
export NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=events
export NEXT_PUBLIC_KEYCLOAK_LOGIN_REDIRECT_PATH=/auth/keycloak/callback
export NEXT_PUBLIC_KEYCLOAK_LOGOUT_REDIRECT_PATH=/admin
export NEXT_PUBLIC_MAP_TILE_URL="https://tile.openstreetmap.org/{z}/{x}/{y}.png"

START=$(date +%s)

echo "==> Building shared..."
npm run build -w @dr-events/shared --silent

echo "==> Building web (next build)..."
npm run build -w @dr-events/web --silent

echo "==> Copying standalone output to container..."
# Copy the three parts that make up the standalone app
docker cp "$PROJECT_DIR/apps/web/.next/standalone/." "$CONTAINER:/app/"
docker cp "$PROJECT_DIR/apps/web/.next/static/." "$CONTAINER:/app/apps/web/.next/static/"
docker cp "$PROJECT_DIR/apps/web/public/." "$CONTAINER:/app/apps/web/public/"

echo "==> Restarting container..."
docker restart "$CONTAINER"

# Wait for ready
echo -n "==> Waiting for web..."
for i in $(seq 1 30); do
  if docker exec "$CONTAINER" wget -qO- http://localhost:3000/ >/dev/null 2>&1; then
    echo " ready!"
    break
  fi
  echo -n "."
  sleep 1
done

END=$(date +%s)
echo "==> Done in $((END - START))s"
