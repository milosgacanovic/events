#!/usr/bin/env bash
# Daily drift monitor — report any published events whose event_series cache
# row lags more than 5 minutes behind events.updated_at. Each row reported is
# evidence that some write path bumped events without going through
# syncSeriesForEvent.
#
# Sequenced 15 min after the nightly backfill+reindex (which heals drift), so
# any rows surfacing here come from yesterday's writes before the backfill ran
# — i.e. the bypass-path footprint over the last 24h.
#
# Zero rows = silent (logged only). Non-zero rows = Telegram alert via the
# dr-admin bot, plus the row sample in the log. The drift summary is also
# folded into the daily-report JSON (see /usr/local/sbin/daily-report-collect.py).
#
# Schedule via host crontab:
#   45 3 * * * /opt/events/scripts/drift-monitor-cron.sh >> /var/log/dr-events-drift-monitor.log 2>&1
set -euo pipefail

cd /opt/events

printf '[%s] drift-monitor starting\n' "$(date -u +%FT%TZ)"

PG="docker exec dr_events_postgres psql -U dr_events -d dr_events -t -A"

# Pull the worst-drifted rows for the log + sample (used in Telegram body).
sample=$($PG -F'|' -c "
  select
    e.id,
    e.slug,
    e.updated_at,
    es.refreshed_at,
    e.updated_at - coalesce(es.refreshed_at, e.created_at) as lag
  from events e
  left join event_series es on es.series_id = e.series_id
  where e.status = 'published'
    and (es.refreshed_at is null or es.refreshed_at < e.updated_at - interval '5 minutes')
  order by lag desc nulls first
  limit 50;
")

echo "$sample" | while IFS='|' read -r id slug updated refreshed lag; do
  if [ -z "$id" ]; then continue; fi
  printf '  DRIFT id=%s slug=%s updated_at=%s refreshed_at=%s lag=%s\n' \
    "$id" "$slug" "$updated" "$refreshed" "$lag"
done

count=$($PG -c "
  select count(*)
  from events e
  left join event_series es on es.series_id = e.series_id
  where e.status = 'published'
    and (es.refreshed_at is null or es.refreshed_at < e.updated_at - interval '5 minutes');
")
count="${count// /}" # trim whitespace

# Telegram alert when drift is non-zero. Uses the same bot that delivers
# the 07:00 UTC daily-report summary — creds live in /opt/events/.env
# (mode 600). Silent on zero to avoid daily "all good" noise.
if [ "$count" -gt 0 ] && [ -r /opt/events/.env ]; then
  # Don't `source` the .env — some values contain unquoted shell metachars
  # and bash would try to execute them. Pluck the two we need.
  TELEGRAM_BOT_TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' /opt/events/.env | head -1 | cut -d= -f2-)
  chat_id=$(grep -E '^TELEGRAM_CHAT_ID=' /opt/events/.env | head -1 | cut -d= -f2-)
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "$chat_id" ]; then
    head=$(echo "$sample" | head -3 | awk -F'|' 'NF>=5 { printf "%s (lag %s)\n", $2, $5 }')
    body=$(printf '🟡 dr-events drift monitor\n%s rows where event_series lags >5min behind events\n\nTop 3:\n%s\n\nLog: /var/log/dr-events-drift-monitor.log' \
      "$count" "$head")
    curl -fsS -o /dev/null -X POST \
      "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${chat_id}" \
      --data-urlencode "text=${body}" \
      || printf '[%s] drift-monitor telegram alert failed (curl exit non-zero)\n' "$(date -u +%FT%TZ)"
  fi
fi

printf '[%s] drift-monitor finished — %s drifted rows\n' "$(date -u +%FT%TZ)" "$count"
