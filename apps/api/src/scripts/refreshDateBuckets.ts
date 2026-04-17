import { Pool } from "pg";

import { config } from "../config";
import { MeilisearchService } from "../services/meiliService";

/**
 * Hourly cron: recompute `event_date_buckets` on every `event_series` row
 * and push the changed values into the Meili series index via a partial
 * update. Cheap — at 100k docs this should complete in seconds because the
 * heavy lifting (filter attribute updates, index rebuilds) happens only on
 * rows where the bucket set actually changes between runs.
 *
 * The full refresh path (`refreshEventSeries`) is still triggered by any
 * event write; this script exists purely to handle wall-clock drift so the
 * "today" / "this_week" counts on the filters chip stay accurate between
 * event edits.
 *
 * Usage (inside the API container):
 *   node /app/apps/api/dist/scripts/refreshDateBuckets.js
 */
async function main() {
  const pool = new Pool({ connectionString: config.DATABASE_URL });
  const meiliService = new MeilisearchService(config.MEILI_URL, config.MEILI_MASTER_KEY);

  try {
    // Recompute and update buckets in one SQL statement — same bucket logic
    // as refreshEventSeries, scoped to rows with at least one upcoming date.
    // `is distinct from` covers NULL equality so we only touch rows whose
    // bucket set actually changed this hour.
    const updateSql = `
      with now_utc as (select (now() at time zone 'UTC')::timestamp as n),
      candidates as (
        select
          es.series_id,
          array(
            select bucket from (values
              ('today',        (select date_trunc('day', n) from now_utc),
                                (select date_trunc('day', n) + interval '1 day' from now_utc)),
              ('tomorrow',     (select date_trunc('day', n) + interval '1 day' from now_utc),
                                (select date_trunc('day', n) + interval '2 days' from now_utc)),
              ('this_weekend',
                (select date_trunc('day', n) +
                  case when extract(isodow from n) <= 5 then make_interval(days := 6 - extract(isodow from n)::int)
                       when extract(isodow from n) = 6 then interval '0'
                       else interval '-1 day' end
                 from now_utc),
                (select date_trunc('day', n) +
                  case when extract(isodow from n) <= 5 then make_interval(days := 6 - extract(isodow from n)::int)
                       when extract(isodow from n) = 6 then interval '0'
                       else interval '-1 day' end + interval '2 days'
                 from now_utc)),
              ('this_week',    (select date_trunc('week', n) from now_utc),
                                (select date_trunc('week', n) + interval '1 week' from now_utc)),
              ('next_week',    (select date_trunc('week', n) + interval '1 week' from now_utc),
                                (select date_trunc('week', n) + interval '2 weeks' from now_utc)),
              ('this_month',   (select date_trunc('month', n) from now_utc),
                                (select date_trunc('month', n) + interval '1 month' from now_utc)),
              ('next_month',   (select date_trunc('month', n) + interval '1 month' from now_utc),
                                (select date_trunc('month', n) + interval '2 months' from now_utc))
            ) as t(bucket, from_ts, to_ts)
            where exists (
              select 1
              from event_occurrences eo
              where eo.series_id = es.series_id
                and eo.starts_at_utc >= greatest(t.from_ts, (select n from now_utc))
                and eo.starts_at_utc <  t.to_ts
            )
          ) as new_buckets
        from event_series es
        where es.earliest_upcoming_ts is not null
      )
      update event_series es
      set event_date_buckets = c.new_buckets
      from candidates c
      where c.series_id = es.series_id
        and c.new_buckets is distinct from es.event_date_buckets
      returning es.series_id
    `;

    // eslint-disable-next-line no-console
    console.log("Recomputing event_date_buckets...");
    const { rows } = await pool.query<{ series_id: string }>(updateSql);
    // eslint-disable-next-line no-console
    console.log(`Updated bucket sets on ${rows.length} series row(s).`);

    if (rows.length > 0) {
      // Partial-update the Meili index for changed series. Batch in groups
      // of 500 so the Meili HTTP payload stays well below its 10MB default.
      const ids = rows.map((r) => r.series_id);
      const batch = 500;
      for (let i = 0; i < ids.length; i += batch) {
        const slice = ids.slice(i, i + batch);
        for (const id of slice) {
          await meiliService.upsertSeriesDoc(pool, id).catch((err) => {
            // eslint-disable-next-line no-console
            console.error(`  upsertSeriesDoc failed for ${id}:`, err);
          });
        }
      }
    }

    // eslint-disable-next-line no-console
    console.log("Done.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
