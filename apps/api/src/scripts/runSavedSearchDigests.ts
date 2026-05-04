import { Pool } from "pg";

import { config } from "../config";
import { listDueSavedSearches } from "../db/savedSearchRepo";
import { processSavedSearch } from "../services/savedSearchDigestService";
import { MeilisearchService } from "../services/meiliService";

// Stdout JSON logger shaped like FastifyBaseLogger — matches the pattern in
// runAlertNotifications.ts so sendEmail can be passed the same logger shape.
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
 * Saved-search digest worker entry point. Designed to be run on an hourly cron.
 * All orchestration logic lives in `services/savedSearchDigestService.ts` so it
 * can be unit-tested without triggering the script's IIFE on import.
 */
async function main() {
  const logger = makeLogger();

  if (!config.ENABLE_SAVED_SEARCH_DIGESTS) {
    logger.info("saved-search digests disabled (ENABLE_SAVED_SEARCH_DIGESTS=false); skipping run");
    return;
  }

  const pool = new Pool({ connectionString: config.DATABASE_URL });
  const meili = new MeilisearchService(config.MEILI_URL, config.MEILI_MASTER_KEY);

  try {
    const rows = await listDueSavedSearches(pool);
    if (rows.length === 0) {
      logger.info("no saved searches due for evaluation");
      return;
    }

    let emailsSent = 0;
    let emptyChecks = 0;
    let failures = 0;
    let totalEventsMarked = 0;

    for (const row of rows) {
      try {
        const result = await processSavedSearch(
          pool,
          meili,
          row,
          logger as never,
        );
        if (result.sent) {
          emailsSent += 1;
          totalEventsMarked += result.eventsMarked;
        } else {
          emptyChecks += 1;
        }
      } catch (err) {
        failures += 1;
        logger.warn({ err, searchId: row.id, userId: row.user_id }, "saved-search digest failed");
      }
    }

    logger.info(
      {
        emailsSent,
        emptyChecks,
        failures,
        totalEventsMarked,
        totalDue: rows.length,
      },
      "saved-search digests run complete",
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
