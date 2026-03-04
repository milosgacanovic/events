#!/usr/bin/env bash
set -euo pipefail

DEFAULT_COLOR="${1:-blue}"
if [[ "$DEFAULT_COLOR" != "blue" && "$DEFAULT_COLOR" != "green" ]]; then
  echo "Usage: $0 [blue|green]" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INCLUDES_DIR="$REPO_ROOT/deploy/apache/includes"
APACHE_ACTIVE_DIR="${APACHE_ACTIVE_DIR:-/etc/apache2/sites-available/includes}"

mkdir -p "$APACHE_ACTIVE_DIR"
cp "$INCLUDES_DIR/dr_events_api_${DEFAULT_COLOR}.conf" "$APACHE_ACTIVE_DIR/dr_events_api_active.conf"
cp "$INCLUDES_DIR/dr_events_web_${DEFAULT_COLOR}.conf" "$APACHE_ACTIVE_DIR/dr_events_web_active.conf"

apachectl configtest
apachectl graceful

echo "Initialized Apache blue/green active includes to color: $DEFAULT_COLOR"
