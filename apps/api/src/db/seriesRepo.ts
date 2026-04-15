import type { Pool, PoolClient } from "pg";

/**
 * Row shape of the `event_series` table — one row per distinct `series_id`,
 * denormalized from `events` + `event_occurrences` + `event_organizers`.
 *
 * Canonical fields mirror the "canonical sibling" (preferring public visibility,
 * then earliest upcoming occurrence, then earliest created_at).
 *
 * Union fields (`tags`, `languages`, `organizer_ids`) are aggregated across all
 * published/cancelled siblings of the series so facet lookups find the series
 * under any sibling's value.
 */
export type EventSeriesDocRow = {
  series_id: string;
  canonical_event_id: string;
  title: string;
  slug: string;
  cover_image_path: string | null;
  description_json: Record<string, unknown> | null;
  practice_category_id: string | null;
  practice_subcategory_id: string | null;
  event_format_id: string | null;
  attendance_mode: string;
  schedule_kind: string;
  event_timezone: string;
  country_code: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  tags: string[];
  languages: string[];
  organizer_ids: string[];
  upcoming_dates: string[]; // YYYY-MM-DD UTC strings
  earliest_upcoming_ts: string | null; // ISO UTC
  upcoming_count: number;
  sibling_count: number;
  has_geo: boolean;
  visibility: string;
  refreshed_at: string;
};

/**
 * Upsert the `event_series` row for `seriesId`. Picks the canonical sibling
 * via (visibility=public desc, earliest upcoming asc, created_at asc); unions
 * tags/languages/organizers across siblings; aggregates upcoming date buckets
 * (UTC) from `event_occurrences`.
 *
 * Returns `true` if the series has at least one published/cancelled sibling
 * (row written), `false` if the row was deleted because no siblings remain.
 *
 * Accepts an optional `PoolClient` so the caller can run the refresh inside
 * the same transaction as a preceding status/delete mutation — keeping the
 * series row consistent with its siblings at commit time.
 */
export async function refreshEventSeries(
  pool: Pool | PoolClient,
  seriesId: string,
): Promise<boolean> {
  const sql = `
    with siblings as (
      select *
      from events
      where series_id = $1
        and status in ('published', 'cancelled')
    ),
    upcoming_per_sibling as (
      select
        eo.event_id,
        min(eo.starts_at_utc) as earliest_upcoming
      from event_occurrences eo
      where eo.series_id = $1
        and eo.starts_at_utc >= now()
      group by eo.event_id
    ),
    canonical as (
      select s.*
      from siblings s
      left join upcoming_per_sibling u on u.event_id = s.id
      order by
        (s.visibility = 'public') desc,
        u.earliest_upcoming asc nulls last,
        s.created_at asc
      limit 1
    ),
    canonical_location as (
      -- Prefer the earliest upcoming occurrence's location; if none, fall back
      -- to the most recent past occurrence. Bools sort false<true in Postgres,
      -- so we negate the predicate for DESC ordering.
      select
        eo.country_code,
        eo.city,
        eo.geom
      from event_occurrences eo
      join canonical c on c.id = eo.event_id
      order by
        (eo.starts_at_utc >= now()) desc,
        case
          when eo.starts_at_utc >= now() then extract(epoch from eo.starts_at_utc)
          else -extract(epoch from eo.starts_at_utc)
        end asc
      limit 1
    ),
    tag_union as (
      select coalesce(array_agg(distinct t), '{}') as tags
      from siblings s, unnest(s.tags) as t
    ),
    language_union as (
      select coalesce(array_agg(distinct l), '{}') as languages
      from siblings s, unnest(s.languages) as l
    ),
    organizer_union as (
      select coalesce(array_agg(distinct eoz.organizer_id), '{}') as organizer_ids
      from siblings s
      join event_organizers eoz on eoz.event_id = s.id
    ),
    upcoming_all as (
      select eo.starts_at_utc
      from event_occurrences eo
      where eo.series_id = $1
        and eo.starts_at_utc >= now()
    ),
    upcoming_agg as (
      select
        coalesce(
          array_agg(distinct (starts_at_utc at time zone 'UTC')::date order by (starts_at_utc at time zone 'UTC')::date),
          '{}'
        ) as upcoming_dates,
        min(starts_at_utc) as earliest_upcoming_ts,
        count(*)::int as upcoming_count
      from upcoming_all
    ),
    sibling_agg as (
      select count(*)::int as sibling_count from siblings
    ),
    loc as (
      select * from canonical_location
    )
    insert into event_series (
      series_id,
      canonical_event_id,
      title,
      slug,
      cover_image_path,
      description_json,
      practice_category_id,
      practice_subcategory_id,
      event_format_id,
      attendance_mode,
      schedule_kind,
      event_timezone,
      country_code,
      city,
      geom,
      tags,
      languages,
      organizer_ids,
      upcoming_dates,
      earliest_upcoming_ts,
      upcoming_count,
      sibling_count,
      has_geo,
      visibility,
      refreshed_at
    )
    select
      $1::uuid,
      c.id,
      c.title,
      c.slug,
      c.cover_image_path,
      c.description_json,
      c.practice_category_id,
      c.practice_subcategory_id,
      c.event_format_id,
      c.attendance_mode,
      c.schedule_kind,
      c.event_timezone,
      loc.country_code,
      loc.city,
      loc.geom,
      (select tags from tag_union),
      (select languages from language_union),
      coalesce((select organizer_ids from organizer_union), '{}'),
      ua.upcoming_dates,
      ua.earliest_upcoming_ts,
      ua.upcoming_count,
      sa.sibling_count,
      loc.geom is not null,
      c.visibility,
      now()
    from canonical c
    cross join upcoming_agg ua
    cross join sibling_agg sa
    left join loc on true
    on conflict (series_id) do update set
      canonical_event_id = excluded.canonical_event_id,
      title = excluded.title,
      slug = excluded.slug,
      cover_image_path = excluded.cover_image_path,
      description_json = excluded.description_json,
      practice_category_id = excluded.practice_category_id,
      practice_subcategory_id = excluded.practice_subcategory_id,
      event_format_id = excluded.event_format_id,
      attendance_mode = excluded.attendance_mode,
      schedule_kind = excluded.schedule_kind,
      event_timezone = excluded.event_timezone,
      country_code = excluded.country_code,
      city = excluded.city,
      geom = excluded.geom,
      tags = excluded.tags,
      languages = excluded.languages,
      organizer_ids = excluded.organizer_ids,
      upcoming_dates = excluded.upcoming_dates,
      earliest_upcoming_ts = excluded.earliest_upcoming_ts,
      upcoming_count = excluded.upcoming_count,
      sibling_count = excluded.sibling_count,
      has_geo = excluded.has_geo,
      visibility = excluded.visibility,
      refreshed_at = now()
    returning series_id
  `;

  const result = await pool.query<{ series_id: string }>(sql, [seriesId]);
  if ((result.rowCount ?? 0) > 0) {
    return true;
  }

  // No canonical sibling — series has no published/cancelled events anymore.
  await pool.query(`delete from event_series where series_id = $1`, [seriesId]);
  return false;
}

/**
 * Fetch all event_series rows + derive the `_geo` coordinates from `geom`.
 * Used by the reindex script to populate the Meili series index.
 */
export async function fetchAllEventSeries(
  pool: Pool,
  opts: { batchSize?: number; offset?: number } = {},
): Promise<EventSeriesDocRow[]> {
  const batchSize = opts.batchSize ?? 1000;
  const offset = opts.offset ?? 0;

  const result = await pool.query<{
    series_id: string;
    canonical_event_id: string;
    title: string;
    slug: string;
    cover_image_path: string | null;
    description_json: Record<string, unknown> | null;
    practice_category_id: string | null;
    practice_subcategory_id: string | null;
    event_format_id: string | null;
    attendance_mode: string;
    schedule_kind: string;
    event_timezone: string;
    country_code: string | null;
    city: string | null;
    geom_text: string | null;
    tags: string[];
    languages: string[];
    organizer_ids: string[];
    upcoming_dates: string[];
    earliest_upcoming_ts: string | null;
    upcoming_count: number;
    sibling_count: number;
    has_geo: boolean;
    visibility: string;
    refreshed_at: string;
  }>(
    `
    select
      series_id,
      canonical_event_id,
      title,
      slug,
      cover_image_path,
      description_json,
      practice_category_id,
      practice_subcategory_id,
      event_format_id,
      attendance_mode,
      schedule_kind,
      event_timezone,
      country_code,
      city,
      case when geom is null then null else ST_AsText(geom::geometry) end as geom_text,
      tags,
      languages,
      organizer_ids,
      upcoming_dates::text[] as upcoming_dates,
      earliest_upcoming_ts,
      upcoming_count,
      sibling_count,
      has_geo,
      visibility,
      refreshed_at
    from event_series
    order by series_id
    limit $1 offset $2
    `,
    [batchSize, offset],
  );

  return result.rows.map((row) => {
    let lat: number | null = null;
    let lng: number | null = null;
    if (row.geom_text) {
      const match = row.geom_text.match(/\(([-0-9.]+) ([-0-9.]+)\)/);
      if (match) {
        lng = Number(match[1]);
        lat = Number(match[2]);
      }
    }
    return {
      series_id: row.series_id,
      canonical_event_id: row.canonical_event_id,
      title: row.title,
      slug: row.slug,
      cover_image_path: row.cover_image_path,
      description_json: row.description_json,
      practice_category_id: row.practice_category_id,
      practice_subcategory_id: row.practice_subcategory_id,
      event_format_id: row.event_format_id,
      attendance_mode: row.attendance_mode,
      schedule_kind: row.schedule_kind,
      event_timezone: row.event_timezone,
      country_code: row.country_code,
      city: row.city,
      lat,
      lng,
      tags: row.tags,
      languages: row.languages,
      organizer_ids: row.organizer_ids,
      upcoming_dates: row.upcoming_dates,
      earliest_upcoming_ts: row.earliest_upcoming_ts,
      upcoming_count: row.upcoming_count,
      sibling_count: row.sibling_count,
      has_geo: row.has_geo,
      visibility: row.visibility,
      refreshed_at: row.refreshed_at,
    };
  });
}

/**
 * Fetch a single event_series doc row by series_id. Returns null if the row
 * doesn't exist (series has no published/cancelled siblings). Used by the
 * Meili per-series upsert path.
 */
export async function getEventSeriesBySeriesId(
  pool: Pool,
  seriesId: string,
): Promise<EventSeriesDocRow | null> {
  const result = await pool.query<{
    series_id: string;
    canonical_event_id: string;
    title: string;
    slug: string;
    cover_image_path: string | null;
    description_json: Record<string, unknown> | null;
    practice_category_id: string | null;
    practice_subcategory_id: string | null;
    event_format_id: string | null;
    attendance_mode: string;
    schedule_kind: string;
    event_timezone: string;
    country_code: string | null;
    city: string | null;
    geom_text: string | null;
    tags: string[];
    languages: string[];
    organizer_ids: string[];
    upcoming_dates: string[];
    earliest_upcoming_ts: string | null;
    upcoming_count: number;
    sibling_count: number;
    has_geo: boolean;
    visibility: string;
    refreshed_at: string;
  }>(
    `
    select
      series_id,
      canonical_event_id,
      title,
      slug,
      cover_image_path,
      description_json,
      practice_category_id,
      practice_subcategory_id,
      event_format_id,
      attendance_mode,
      schedule_kind,
      event_timezone,
      country_code,
      city,
      case when geom is null then null else ST_AsText(geom::geometry) end as geom_text,
      tags,
      languages,
      organizer_ids,
      upcoming_dates::text[] as upcoming_dates,
      earliest_upcoming_ts,
      upcoming_count,
      sibling_count,
      has_geo,
      visibility,
      refreshed_at
    from event_series
    where series_id = $1
    `,
    [seriesId],
  );
  const row = result.rows[0];
  if (!row) return null;

  let lat: number | null = null;
  let lng: number | null = null;
  if (row.geom_text) {
    const match = row.geom_text.match(/\(([-0-9.]+) ([-0-9.]+)\)/);
    if (match) {
      lng = Number(match[1]);
      lat = Number(match[2]);
    }
  }
  return {
    series_id: row.series_id,
    canonical_event_id: row.canonical_event_id,
    title: row.title,
    slug: row.slug,
    cover_image_path: row.cover_image_path,
    description_json: row.description_json,
    practice_category_id: row.practice_category_id,
    practice_subcategory_id: row.practice_subcategory_id,
    event_format_id: row.event_format_id,
    attendance_mode: row.attendance_mode,
    schedule_kind: row.schedule_kind,
    event_timezone: row.event_timezone,
    country_code: row.country_code,
    city: row.city,
    lat,
    lng,
    tags: row.tags,
    languages: row.languages,
    organizer_ids: row.organizer_ids,
    upcoming_dates: row.upcoming_dates,
    earliest_upcoming_ts: row.earliest_upcoming_ts,
    upcoming_count: row.upcoming_count,
    sibling_count: row.sibling_count,
    has_geo: row.has_geo,
    visibility: row.visibility,
    refreshed_at: row.refreshed_at,
  };
}

/**
 * List all distinct series_ids that have at least one published/cancelled
 * sibling. Used by the backfill script to seed event_series from scratch.
 */
export async function listAllActiveSeriesIds(pool: Pool): Promise<string[]> {
  const result = await pool.query<{ series_id: string }>(
    `
    select distinct series_id
    from events
    where status in ('published', 'cancelled')
    `,
  );
  return result.rows.map((r) => r.series_id);
}
