#!/usr/bin/env bash
# Hourly cron wrapper for recomputing event_series.event_date_buckets.
#
# The bucket set on each series (today, tomorrow, this_week, etc.) is
# computed against wall-clock UTC. Without an hourly refresh the "Today"
# chip count drifts — series whose only upcoming occurrence fell today
# still show bucket=today at midnight UTC and continue to pollute the
# facet until the next event edit triggers refreshEventSeries.
#
# The script runs in the currently-active API container and partial-updates
# Meili only for rows whose bucket set actually changed.
#
# Schedule via host crontab:
#   7 * * * * /opt/events/scripts/refresh-date-buckets-cron.sh >> /var/log/dr-events-date-buckets.log 2>&1
set -euo pipefail

cd /opt/events

COLOR="$(bash scripts/bg-active-color.sh)"
CONTAINER="dr_events_api_${COLOR}"

printf '[%s] refreshDateBuckets starting on %s\n' "$(date -u +%FT%TZ)" "$CONTAINER"
docker exec --workdir /app/apps/api "$CONTAINER" node dist/scripts/refreshDateBuckets.js
printf '[%s] refreshDateBuckets finished\n' "$(date -u +%FT%TZ)"
