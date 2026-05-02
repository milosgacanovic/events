import { Pool } from "pg";

import { config } from "../config";
import { refreshEventSeries } from "../db/seriesRepo";
import { MeilisearchService } from "../services/meiliService";

/**
 * Hourly cron: handles wall-clock drift on the Meili `event_series` index.
 * Four sweeps:
 *
 *  1. DB-stale series: rows whose `event_series.earliest_upcoming_ts` is null
 *     or in the past, but the underlying `event_occurrences` table has at
 *     least one future occurrence. These are recurring series that have
 *     simply moved past their first listed occurrence since last write.
 *     Re-project + push to Meili.
 *
 *  2. Meili past-stale: docs in the Meili index whose
 *     `earliest_upcoming_ts < now()`. Catches the case where DB is already
 *     correct but the Meili sync was missed for a stale doc.
 *
 *  3. Meili missing/null: DB-fresh series (earliest_upcoming_ts > now,
 *     visibility=public) whose Meili doc is missing entirely or has a null
 *     ts. Catches the gap that Sweeps 2 doesn't (it only sees `< now`).
 *
 *  4. event_date_buckets refresh: recompute the per-row bucket array and
 *     partial-update Meili for any row whose bucket set changed this hour.
 *
 * Usage (inside the API container):
 *   node /app/apps/api/dist/scripts/refreshDateBuckets.js
 */
async function main() {
  const pool = new Pool({ connectionString: config.DATABASE_URL });
  const meiliService = new MeilisearchService(config.MEILI_URL, config.MEILI_MASTER_KEY);

  try {
    // ────────────────────────────────────────────────────────────────────
    // Sweep 1: DB rows whose earliest_upcoming_ts is stale but future
    // occurrences exist. Re-project + sync to Meili.
    // ────────────────────────────────────────────────────────────────────
    const { rows: dbStale } = await pool.query<{ series_id: string }>(`
      select es.series_id
      from event_series es
      where (es.earliest_upcoming_ts is null or es.earliest_upcoming_ts < now())
        and exists (
          select 1
          from event_occurrences eo
          where eo.series_id = es.series_id
            and eo.starts_at_utc >= now()
        )
    `);
    // eslint-disable-next-line no-console
    console.log(`[stale-db] ${dbStale.length} series with stale earliest_upcoming_ts`);
    let dbRefreshed = 0;
    for (const { series_id } of dbStale) {
      try {
        const survived = await refreshEventSeries(pool, series_id);
        if (survived) {
          await meiliService.upsertSeriesDoc(pool, series_id);
          dbRefreshed++;
        } else {
          await meiliService.deleteSeriesDoc(series_id);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`  refreshEventSeries failed for ${series_id}:`, err);
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[stale-db] re-projected ${dbRefreshed}/${dbStale.length}`);

    // ────────────────────────────────────────────────────────────────────
    // Sweep 2: Meili docs whose earliest_upcoming_ts < now(). Push DB
    // state to Meili. Skip series we just refreshed in Sweep 1 — those
    // are already fresh in Meili.
    // ────────────────────────────────────────────────────────────────────
    const justRefreshed = new Set(dbStale.map((r) => r.series_id));
    const nowMs = Date.now();
    const meiliStaleIds: string[] = [];
    {
      const limit = 1000;
      let offset = 0;
      // Pull stale Meili docs in pages until we've drained the result set.
      // We only need their series_id (Meili docs use series_id as primary key
      // surfaced as `id` on the doc — we read `series_id` to match what
      // upsertSeriesDoc accepts).
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { hits } = await meiliService.searchSeries({
          filter: [`earliest_upcoming_ts < ${nowMs}`],
          limit,
          offset,
          attributesToRetrieve: ["series_id"],
        });
        for (const hit of hits) {
          const sid = (hit as unknown as { series_id?: string }).series_id;
          if (sid && !justRefreshed.has(sid)) meiliStaleIds.push(sid);
        }
        if (hits.length < limit) break;
        offset += limit;
        if (offset >= 50000) break; // hard safety bound
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[stale-meili] ${meiliStaleIds.length} additional Meili docs to re-sync`);
    let meiliPushed = 0;
    for (const sid of meiliStaleIds) {
      try {
        await meiliService.upsertSeriesDoc(pool, sid);
        meiliPushed++;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`  upsertSeriesDoc failed for ${sid}:`, err);
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[stale-meili] pushed ${meiliPushed}/${meiliStaleIds.length}`);

    // ────────────────────────────────────────────────────────────────────
    // Sweep 3: DB-fresh series missing or null in Meili. Catches series
    // whose DB row is correct but Meili lacks the doc entirely (e.g., a
    // past sync failure) or has a null earliest_upcoming_ts. Sweep 2 only
    // catches docs with `< now` — null and missing slip through.
    // ────────────────────────────────────────────────────────────────────
    const dbFreshIds = (await pool.query<{ series_id: string }>(`
      select series_id
      from event_series
      where earliest_upcoming_ts is not null
        and earliest_upcoming_ts > now()
        and visibility = 'public'
    `)).rows.map((r) => r.series_id);

    const meiliFreshIds = new Set<string>();
    {
      const limit = 1000;
      let offset = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { hits } = await meiliService.searchSeries({
          filter: [`earliest_upcoming_ts > ${nowMs}`, "visibility = public"],
          limit,
          offset,
          attributesToRetrieve: ["series_id"],
        });
        for (const hit of hits) {
          const sid = (hit as unknown as { series_id?: string }).series_id;
          if (sid) meiliFreshIds.add(sid);
        }
        if (hits.length < limit) break;
        offset += limit;
        if (offset >= 50000) break;
      }
    }

    const missingInMeili = dbFreshIds.filter((sid) => !meiliFreshIds.has(sid));
    // eslint-disable-next-line no-console
    console.log(`[missing-meili] ${missingInMeili.length} DB-fresh series missing or null in Meili`);
    let missingPushed = 0;
    for (const sid of missingInMeili) {
      try {
        await meiliService.upsertSeriesDoc(pool, sid);
        missingPushed++;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`  upsertSeriesDoc failed for ${sid}:`, err);
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[missing-meili] pushed ${missingPushed}/${missingInMeili.length}`);

    // ────────────────────────────────────────────────────────────────────
    // Sweep 4: event_date_buckets refresh (existing logic).
    // ────────────────────────────────────────────────────────────────────
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
              ('next_weekend',
                (select date_trunc('day', n) +
                  case when extract(isodow from n) <= 5 then make_interval(days := 6 - extract(isodow from n)::int)
                       when extract(isodow from n) = 6 then interval '0'
                       else interval '-1 day' end + interval '7 days'
                 from now_utc),
                (select date_trunc('day', n) +
                  case when extract(isodow from n) <= 5 then make_interval(days := 6 - extract(isodow from n)::int)
                       when extract(isodow from n) = 6 then interval '0'
                       else interval '-1 day' end + interval '9 days'
                 from now_utc)),
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
