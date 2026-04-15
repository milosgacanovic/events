import { Pool } from "pg";

import { config } from "../config";
import { listAllActiveSeriesIds, refreshEventSeries } from "../db/seriesRepo";

/**
 * One-shot backfill: populate the `event_series` table from `events` +
 * `event_occurrences`. Safe to rerun — each row goes through the same
 * `refreshEventSeries` upsert used by the lifecycle hooks.
 *
 * Usage (inside the API container):
 *   node /app/apps/api/dist/scripts/backfillEventSeries.js
 */
async function main() {
  const pool = new Pool({ connectionString: config.DATABASE_URL });

  try {
    // eslint-disable-next-line no-console
    console.log("Listing active series_ids...");
    const seriesIds = await listAllActiveSeriesIds(pool);
    // eslint-disable-next-line no-console
    console.log(`Found ${seriesIds.length} series to refresh.`);

    let processed = 0;
    let kept = 0;
    let deleted = 0;
    for (const seriesId of seriesIds) {
      const survived = await refreshEventSeries(pool, seriesId);
      if (survived) kept++;
      else deleted++;
      processed++;
      if (processed % 200 === 0) {
        // eslint-disable-next-line no-console
        console.log(`  ${processed}/${seriesIds.length} (kept=${kept}, deleted=${deleted})`);
      }
    }

    // eslint-disable-next-line no-console
    console.log(`Done. kept=${kept}, deleted=${deleted}, total=${processed}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
