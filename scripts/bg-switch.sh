#!/usr/bin/env bash
set -euo pipefail

TARGET_COLOR="${1:-}"
if [[ "$TARGET_COLOR" != "blue" && "$TARGET_COLOR" != "green" ]]; then
  echo "Usage: $0 <blue|green>" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INCLUDES_DIR="${INCLUDES_DIR:-$REPO_ROOT/deploy/apache/includes}"
APACHE_CTL="${APACHE_CTL:-apachectl}"
API_ACTIVE_CONF="${API_ACTIVE_CONF:-/etc/apache2/sites-available/includes/dr_events_api_active.conf}"
WEB_ACTIVE_CONF="${WEB_ACTIVE_CONF:-/etc/apache2/sites-available/includes/dr_events_web_active.conf}"
STATE_FILE="${STATE_FILE:-/var/run/dr_events_bg_previous_color}"

API_SOURCE="$INCLUDES_DIR/dr_events_api_${TARGET_COLOR}.conf"
WEB_SOURCE="$INCLUDES_DIR/dr_events_web_${TARGET_COLOR}.conf"

if [[ ! -f "$API_SOURCE" || ! -f "$WEB_SOURCE" ]]; then
  echo "Missing include templates for color '$TARGET_COLOR' in $INCLUDES_DIR" >&2
  exit 1
fi

CURRENT_COLOR="$("$SCRIPT_DIR/bg-active-color.sh" || true)"
if [[ "$CURRENT_COLOR" == "$TARGET_COLOR" ]]; then
  echo "Already on $TARGET_COLOR"
  exit 0
fi

mkdir -p "$(dirname "$API_ACTIVE_CONF")" "$(dirname "$WEB_ACTIVE_CONF")"

API_BACKUP="$(mktemp)"
WEB_BACKUP="$(mktemp)"
trap 'rm -f "$API_BACKUP" "$WEB_BACKUP"' EXIT

if [[ -f "$API_ACTIVE_CONF" ]]; then
  cp "$API_ACTIVE_CONF" "$API_BACKUP"
fi
if [[ -f "$WEB_ACTIVE_CONF" ]]; then
  cp "$WEB_ACTIVE_CONF" "$WEB_BACKUP"
fi

cp "$API_SOURCE" "$API_ACTIVE_CONF"
cp "$WEB_SOURCE" "$WEB_ACTIVE_CONF"

if ! "$APACHE_CTL" configtest; then
  echo "Apache configtest failed. Restoring previous active includes." >&2
  if [[ -s "$API_BACKUP" ]]; then cp "$API_BACKUP" "$API_ACTIVE_CONF"; fi
  if [[ -s "$WEB_BACKUP" ]]; then cp "$WEB_BACKUP" "$WEB_ACTIVE_CONF"; fi
  exit 1
fi

"$APACHE_CTL" graceful

if [[ "$CURRENT_COLOR" == "blue" || "$CURRENT_COLOR" == "green" ]]; then
  printf '%s\n' "$CURRENT_COLOR" > "$STATE_FILE"
fi

echo "Switched active color to: $TARGET_COLOR"
