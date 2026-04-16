import { Pool } from "pg";

import { config } from "../config";

/**
 * One-off cleanup: delete rows from `event_series` whose `series_id` is no
 * longer referenced by any published/cancelled event.
 *
 * These orphans accumulated before commit 46ead95, when the importer's
 * `?skipSearch=true` PATCH path skipped `syncSeriesForEvent` entirely. When an
 * event moved from `series_id = self.id` into a shared `series_id`, the old
 * self-series row was never deleted by `refreshEventSeries`'s fallback
 * `delete ... where series_id = $1` branch. Post-46ead95 the lifecycle code
 * no longer creates orphans, so this script is effectively run-once.
 *
 * Safe to rerun — idempotent (no-op on a clean DB). Run after a full Meili
 * reindex to propagate the deletions to the search index.
 *
 * Usage (inside the API container):
 *   node /app/apps/api/dist/scripts/cleanupOrphanSeries.js
 */
const ORPHAN_PREDICATE = `
  series_id not in (
    select distinct series_id
    from events
    where status in ('published', 'cancelled')
  )
`;

async function main() {
  const pool = new Pool({ connectionString: config.DATABASE_URL });

  try {
    const countBefore = await pool.query<{ count: string }>(
      `select count(*)::text as count from event_series where ${ORPHAN_PREDICATE}`,
    );
    const orphanCount = Number(countBefore.rows[0]?.count ?? "0");
    // eslint-disable-next-line no-console
    console.log(`Found ${orphanCount} orphan event_series rows.`);

    if (orphanCount === 0) {
      // eslint-disable-next-line no-console
      console.log("Nothing to delete.");
      return;
    }

    const deleteResult = await pool.query(
      `delete from event_series where ${ORPHAN_PREDICATE}`,
    );
    // eslint-disable-next-line no-console
    console.log(`Deleted ${deleteResult.rowCount ?? 0} rows.`);

    const countAfter = await pool.query<{ count: string }>(
      `select count(*)::text as count from event_series`,
    );
    // eslint-disable-next-line no-console
    console.log(`event_series row count after cleanup: ${countAfter.rows[0]?.count ?? "0"}.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
