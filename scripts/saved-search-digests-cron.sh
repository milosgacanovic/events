#!/usr/bin/env bash
# Cron wrapper for sending saved-search digest emails.
#
# Executes `runSavedSearchDigests.js` inside the currently-active API
# container (blue or green). The worker:
#   1. lists saved searches whose `last_evaluated_at` is older than their
#      frequency interval (daily / weekly),
#   2. for each, asks Meili for matching series, then SQL for events
#      newly *published* since the last delivery (or since search creation,
#      capped 30 days back on first run),
#   3. dedups against `saved_search_sends`, sends one digest email per
#      saved search, marks events sent on success.
#
# ENABLE_SAVED_SEARCH_DIGESTS is passed at invocation so we can flip the
# feature on/off by toggling this cron entry without redeploying the API.
#
# Schedule via host crontab:
#   0 * * * * /opt/events/scripts/saved-search-digests-cron.sh >> /var/log/dr-events-saved-search-digests.log 2>&1
set -euo pipefail

cd /opt/events

COLOR="$(bash scripts/bg-active-color.sh)"
CONTAINER="dr_events_api_${COLOR}"

printf '[%s] digests:saved-searches starting on %s\n' "$(date -u +%FT%TZ)" "$CONTAINER"
# npm run digests:saved-searches uses tsx against src/, which isn't shipped
# in the production image — invoke the compiled JS directly instead.
docker exec -e ENABLE_SAVED_SEARCH_DIGESTS=true --workdir /app/apps/api "$CONTAINER" node dist/scripts/runSavedSearchDigests.js
printf '[%s] digests:saved-searches finished\n' "$(date -u +%FT%TZ)"
