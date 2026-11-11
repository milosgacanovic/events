#!/usr/bin/env bash
# Daily SEO audit (SEO round 3): samples event URLs from the live sitemaps and
# checks robots/canonical/JSON-LD/titles/descriptions/images, and that host
# pages link back to their events (scripts/seo_audit.py).
# Then the hydration regression test (apps/web/e2e/hydration.spec.ts): loads
# event/host/city/series pages under unusual timezones/locales and a stored
# "Your time" preference and fails on React hydration errors (#418/#423/#425).
#
# Every run is logged. A failing check sends a Telegram alert through the same
# dr-admin bot as the drift monitor; passing runs stay silent. The run is
# counted in the daily report's cron section (/usr/local/sbin/daily-report-collect.py),
# which matches the final "seo-audit finished — exit N" line.
#
# Schedule via host crontab:
#   30 4 * * * /opt/events/scripts/seo-audit-cron.sh >> /var/log/dr-events-seo-audit.log 2>&1
set -uo pipefail

cd /opt/events

# cron's PATH only has the old system node (/usr/bin, too old for
# Playwright); put the newest nvm node first.
NODE_BIN="$(ls -d /root/.nvm/versions/node/*/bin 2>/dev/null | sort -V | tail -1)"
[ -n "$NODE_BIN" ] && export PATH="$NODE_BIN:$PATH"

printf '[%s] seo-audit starting\n' "$(date -u +%FT%TZ)"

out=$(timeout 1200 python3 scripts/seo_audit.py --sample 60 2>&1)
status=$?
printf '%s\n' "$out"

printf '[%s] hydration test starting\n' "$(date -u +%FT%TZ)"
hyd_out=$(NO_COLOR=1 CI=1 timeout 900 npx --no-install playwright test apps/web/e2e/hydration.spec.ts --reporter=line 2>&1)
hyd_status=$?
printf '%s\n' "$hyd_out" | tail -40
printf '[%s] hydration test exit %s\n' "$(date -u +%FT%TZ)" "$hyd_status"
if [ "$hyd_status" -ne 0 ] && [ "$status" -eq 0 ]; then
  status=2
fi

if [ "$status" -ne 0 ] && [ -r /opt/events/.env ]; then
  # Don't `source` the .env (unquoted shell metachars); pluck the two values.
  TELEGRAM_BOT_TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' /opt/events/.env | head -1 | cut -d= -f2-)
  chat_id=$(grep -E '^TELEGRAM_CHAT_ID=' /opt/events/.env | head -1 | cut -d= -f2-)
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "$chat_id" ]; then
    fails=$(printf '%s\n' "$out" | grep -E '\[FAIL\]|^\s{6}' | head -8)
    if [ "$hyd_status" -ne 0 ]; then
      hyd_fails=$(printf '%s\n' "$hyd_out" | grep -E 'hydration error\(s\)|failed|Error:' | head -6)
      fails=$(printf '%s\nHydration test (exit %s):\n%s' "$fails" "$hyd_status" "${hyd_fails:-see log}")
    fi
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
