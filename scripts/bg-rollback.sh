#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_FILE="${STATE_FILE:-/var/run/dr_events_bg_previous_color}"

if [[ -f "$STATE_FILE" ]]; then
  previous_color="$(tr -d '[:space:]' < "$STATE_FILE")"
else
  previous_color=""
fi

if [[ "$previous_color" != "blue" && "$previous_color" != "green" ]]; then
  current="$("$SCRIPT_DIR/bg-active-color.sh")"
  if [[ "$current" == "blue" ]]; then
    previous_color="green"
  else
    previous_color="blue"
  fi
fi

echo "Rolling back to: $previous_color"
"$SCRIPT_DIR/bg-switch.sh" "$previous_color"
echo "Rollback complete. Active color: $previous_color"
