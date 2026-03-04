#!/usr/bin/env bash
set -euo pipefail

API_ACTIVE_CONF="${API_ACTIVE_CONF:-/etc/apache2/sites-available/includes/dr_events_api_active.conf}"
WEB_ACTIVE_CONF="${WEB_ACTIVE_CONF:-/etc/apache2/sites-available/includes/dr_events_web_active.conf}"

detect_color() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    return 1
  fi

  if grep -qE '13101|13100|_green' "$file"; then
    printf 'green\n'
    return 0
  fi
  if grep -qE '13001|13000|_blue' "$file"; then
    printf 'blue\n'
    return 0
  fi
  return 1
}

if color="$(detect_color "$API_ACTIVE_CONF")"; then
  printf '%s\n' "$color"
  exit 0
fi

if color="$(detect_color "$WEB_ACTIVE_CONF")"; then
  printf '%s\n' "$color"
  exit 0
fi

printf 'blue\n'
