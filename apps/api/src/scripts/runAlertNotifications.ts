import type { FastifyBaseLogger } from "fastify";
import { Pool } from "pg";

import { config } from "../config";
import { listPendingNotifications, markSent, type PendingNotificationRow } from "../db/alertRepo";
import { renderAlertDigestEmail } from "../services/alertEmailTemplate";
import { sendEmail } from "../services/emailService";

// Minimal stdout logger shaped like FastifyBaseLogger — enough for the methods
// sendEmail uses (info / warn / error). Avoids pulling in an extra logging dep.
type LoggerFn = (obj: object | string, msg?: string) => void;
type MiniLogger = {
  info: LoggerFn;
  warn: LoggerFn;
  error: LoggerFn;
  debug: LoggerFn;
  fatal: LoggerFn;
  trace: LoggerFn;
  child: () => MiniLogger;
  level: string;
  silent: () => void;
};

function makeLogger(): MiniLogger {
  const write = (level: string): LoggerFn => (obj, msg) => {
    const payload = typeof obj === "string" ? { msg: obj } : { ...obj, ...(msg ? { msg } : {}) };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ level, time: new Date().toISOString(), ...payload }));
  };
  const logger: MiniLogger = {
    info: write("info"),
    warn: write("warn"),
    error: write("error"),
    debug: write("debug"),
    fatal: write("fatal"),
    trace: write("trace"),
    child: () => logger,
    level: "info",
    silent: () => {},
  };
  return logger;
}

/**
 * Alert notification worker. Designed to be run on a cron cadence (every ~10 min).
 *
 * Each run queries `listPendingNotifications` (ST_DWithin + not-yet-sent dedup),
 * groups rows per (user, alert), renders one digest email per group, sends via SMTP,
 * and writes `user_alert_sends` to prevent re-sending.
 *
 * Feature-flagged behind `ENABLE_ALERT_NOTIFICATIONS` so it can ship to prod in a
 * quiet state while we spot-check the dry-run endpoint.
 */
async function main() {
  const logger = makeLogger();

  if (!config.ENABLE_ALERT_NOTIFICATIONS) {
    logger.info("alert notifications disabled (ENABLE_ALERT_NOTIFICATIONS=false); skipping run");
    return;
  }

  const pool = new Pool({ connectionString: config.DATABASE_URL });

  try {
    const rows = await listPendingNotifications(pool);
    if (rows.length === 0) {
      logger.info("no pending alert notifications");
      return;
    }

    // Group by (user_id, alert_id) — one digest per alert per user, regardless of how
    // many occurrences matched in this run. Preserves row order within the group
    // (the SQL orders by starts_at_utc).
    const groups = new Map<string, { key: string; first: PendingNotificationRow; rows: PendingNotificationRow[] }>();
    for (const row of rows) {
      const key = `${row.user_id}|${row.alert_id}`;
      const existing = groups.get(key);
      if (existing) {
        existing.rows.push(row);
      } else {
        groups.set(key, { key, first: row, rows: [row] });
      }
    }

    let emailsSent = 0;
    let occurrencesMarked = 0;
    let failures = 0;

    for (const group of groups.values()) {
      const { first, rows: groupRows } = group;
      if (!first.user_email) {
        logger.warn({ alertId: first.alert_id, userId: first.user_id }, "skipping alert — user has no email");
        continue;
      }

      const { subject, html } = renderAlertDigestEmail({
        userDisplayName: first.user_display_name,
        organizerName: first.organizer_name,
        organizerSlug: first.organizer_slug,
        locationLabel: first.location_label,
        radiusKm: first.radius_km,
        unsubscribeToken: first.unsubscribe_token,
        occurrences: groupRows.map((row) => ({
          eventId: row.event_id,
          eventSlug: row.event_slug,
          eventTitle: row.event_title,
          startsAtUtc: row.starts_at_utc,
          eventTimezone: row.event_timezone,
          city: row.occ_city,
          countryCode: row.occ_country_code,
        })),
      });

      try {
        await sendEmail(first.user_email, subject, html, logger as unknown as FastifyBaseLogger);
        emailsSent += 1;
        // Mark-sent happens *after* a successful send so a transient SMTP failure
        // doesn't silently swallow the notification. `markSent` uses upsert-on-conflict
        // so accidental re-runs are harmless.
        const inserted = await markSent(
          pool,
          first.alert_id,
          groupRows.map((row) => row.occurrence_id),
        );
        occurrencesMarked += inserted;
      } catch (err) {
        failures += 1;
        logger.warn({ err, alertId: first.alert_id, userId: first.user_id }, "alert email failed");
      }
    }

    logger.info(
      { emailsSent, occurrencesMarked, failures, groups: groups.size, rows: rows.length },
      "alert notifications run complete",
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
