#!/usr/bin/env bash
# Nightly safety-net: re-derive every event_series row from canonical events
# data, then rebuild both Meili indexes via the no-disruption swap path.
#
# Why:
#   - event_series is a denormalized cache populated by syncSeriesForEvent on
#     each event write. We've observed at least one write path bypassing that
#     hook (events.updated_at moved without a matching event_series refresh),
#     which leaves stale fields (cover_image_path, etc.) in the cache and in
#     turn in Meili. backfillEventSeries forces every row back in sync.
#   - reindexMeili then rebuilds both event_occurrences and event_series in
#     shadow indexes and atomically swaps. Search keeps hitting the live index
#     until the swap, so users see no flicker / no partial counts.
#
# Schedule via host crontab (runs ~13 min after refresh-occurrences-cron so
# the occurrence horizon is fresh when the series rows pick up upcoming_dates):
#   30 3 * * * /opt/events/scripts/nightly-reindex-cron.sh >> /var/log/dr-events-nightly-reindex.log 2>&1
set -euo pipefail

cd /opt/events

COLOR="$(bash scripts/bg-active-color.sh)"
CONTAINER="dr_events_api_${COLOR}"

printf '[%s] nightly-reindex starting on %s\n' "$(date -u +%FT%TZ)" "$CONTAINER"

printf '[%s] step 1/2: backfillEventSeries\n' "$(date -u +%FT%TZ)"
docker exec --workdir /app/apps/api "$CONTAINER" node dist/scripts/backfillEventSeries.js

printf '[%s] step 2/2: reindexMeili (swap)\n' "$(date -u +%FT%TZ)"
docker exec --workdir /app/apps/api "$CONTAINER" node dist/scripts/reindexMeili.js

printf '[%s] nightly-reindex finished\n' "$(date -u +%FT%TZ)"
