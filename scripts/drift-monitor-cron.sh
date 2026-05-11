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
# Zero rows = good. Non-zero rows = open the next bypass-hunt: pick a few and
# inspect their activity_log around the updated_at timestamp.
#
# Schedule via host crontab:
#   45 3 * * * /opt/events/scripts/drift-monitor-cron.sh >> /var/log/dr-events-drift-monitor.log 2>&1
set -euo pipefail

cd /opt/events

printf '[%s] drift-monitor starting\n' "$(date -u +%FT%TZ)"

# Query the active postgres container directly — no need to bounce through
# the API container.
docker exec dr_events_postgres psql -U dr_events -d dr_events -t -A -F'|' -c "
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
" | while IFS='|' read -r id slug updated refreshed lag; do
  if [ -z "$id" ]; then continue; fi
  printf '  DRIFT id=%s slug=%s updated_at=%s refreshed_at=%s lag=%s\n' \
    "$id" "$slug" "$updated" "$refreshed" "$lag"
done

count=$(docker exec dr_events_postgres psql -U dr_events -d dr_events -t -A -c "
  select count(*)
  from events e
  left join event_series es on es.series_id = e.series_id
  where e.status = 'published'
    and (es.refreshed_at is null or es.refreshed_at < e.updated_at - interval '5 minutes');
")

printf '[%s] drift-monitor finished — %s drifted rows\n' "$(date -u +%FT%TZ)" "$count"
