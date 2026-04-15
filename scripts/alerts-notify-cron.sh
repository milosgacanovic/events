#!/usr/bin/env bash
# Cron wrapper for sending Follow/Notify email digests.
#
# Executes `runAlertNotifications.js` inside the currently-active API container
# (blue or green). The script:
#   1. queries occurrences for active alerts where the event was created AFTER
#      the alert was set AND the occurrence hasn't been sent for this alert yet,
#   2. groups rows by (user, alert), renders one digest email per group,
#   3. records `user_alert_sends` rows so re-runs are idempotent.
#
# ENABLE_ALERT_NOTIFICATIONS is passed at invocation so we can flip the feature
# on/off by toggling this cron entry without redeploying the API.
#
# Schedule via host crontab:
#   */10 * * * * /opt/events/scripts/alerts-notify-cron.sh >> /var/log/dr-events-alerts-notify.log 2>&1
set -euo pipefail

cd /opt/events

COLOR="$(bash scripts/bg-active-color.sh)"
CONTAINER="dr_events_api_${COLOR}"

printf '[%s] alerts:notify starting on %s\n' "$(date -u +%FT%TZ)" "$CONTAINER"
# npm run alerts:notify uses tsx against src/, which isn't shipped in the
# production image — invoke the compiled JS directly instead.
docker exec -e ENABLE_ALERT_NOTIFICATIONS=true --workdir /app/apps/api "$CONTAINER" node dist/scripts/runAlertNotifications.js
printf '[%s] alerts:notify finished\n' "$(date -u +%FT%TZ)"
