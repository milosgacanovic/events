#!/usr/bin/env bash
# Daily SEO audit (SEO round 3): samples event URLs from the live sitemaps and
# checks robots/canonical/JSON-LD/titles/descriptions/images, and that host
# pages link back to their events (scripts/seo_audit.py).
#
# Every run is logged. A failing check sends a Telegram alert through the same
# dr-admin bot as the drift monitor; passing runs stay silent. The run is
# counted in the daily report's cron section (/usr/local/sbin/daily-report-collect.py).
#
# Schedule via host crontab:
#   30 4 * * * /opt/events/scripts/seo-audit-cron.sh >> /var/log/dr-events-seo-audit.log 2>&1
set -uo pipefail

cd /opt/events

printf '[%s] seo-audit starting\n' "$(date -u +%FT%TZ)"

out=$(timeout 1200 python3 scripts/seo_audit.py --sample 60 2>&1)
status=$?
printf '%s\n' "$out"

if [ "$status" -ne 0 ] && [ -r /opt/events/.env ]; then
  # Don't `source` the .env (unquoted shell metachars); pluck the two values.
  TELEGRAM_BOT_TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' /opt/events/.env | head -1 | cut -d= -f2-)
  chat_id=$(grep -E '^TELEGRAM_CHAT_ID=' /opt/events/.env | head -1 | cut -d= -f2-)
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "$chat_id" ]; then
    fails=$(printf '%s\n' "$out" | grep -E '\[FAIL\]|^\s{6}' | head -8)
    [ -n "$fails" ] || fails=$(printf '%s\n' "$out" | tail -3)
    body=$(printf '🟡 events SEO audit failed (exit %s)\n\n%s\n\nLog: /var/log/dr-events-seo-audit.log' "$status" "$fails")
    curl -fsS -o /dev/null -X POST \
      "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${chat_id}" \
      --data-urlencode "text=${body}" \
      || printf '[%s] seo-audit telegram alert failed (curl exit non-zero)\n' "$(date -u +%FT%TZ)"
  fi
fi

printf '[%s] seo-audit finished — exit %s\n' "$(date -u +%FT%TZ)" "$status"
exit "$status"
