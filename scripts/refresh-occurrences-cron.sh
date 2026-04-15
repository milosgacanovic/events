#!/usr/bin/env bash
# Daily cron wrapper for refreshing the event_occurrences materialization window.
#
# Executes `npm run occurrences:refresh` inside the currently-active API
# container (blue or green). The refresh script walks every recurring,
# published event and rematerializes its occurrences within the
# frequency-aware horizon defined in occurrenceService.ts. Without this cron
# the horizon's tail gradually shrinks toward "today" between manual edits,
# and long-running recurring series (e.g. weekly classes) silently run out of
# future occurrences.
#
# Schedule via host crontab:
#   17 3 * * * /opt/events/scripts/refresh-occurrences-cron.sh >> /var/log/dr-events-occurrence-refresh.log 2>&1
set -euo pipefail

cd /opt/events

COLOR="$(bash scripts/bg-active-color.sh)"
CONTAINER="dr_events_api_${COLOR}"

printf '[%s] occurrences:refresh starting on %s\n' "$(date -u +%FT%TZ)" "$CONTAINER"
# npm run occurrences:refresh uses tsx against src/, which isn't shipped in the
# production image — invoke the compiled JS directly instead.
docker exec --workdir /app/apps/api "$CONTAINER" node dist/scripts/refreshOccurrences.js
printf '[%s] occurrences:refresh finished\n' "$(date -u +%FT%TZ)"
