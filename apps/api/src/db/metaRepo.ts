import type { Pool } from "pg";

export async function listCitySuggestions(
  pool: Pool,
  input: { q?: string; countryCode?: string; limit: number },
) {
  const query = (input.q ?? "").trim().toLowerCase();
  const countryCode = (input.countryCode ?? "").trim().toLowerCase();

  const result = await pool.query<{ city: string; count: string }>(
    `
      select
        lower(eo.city) as city,
        count(*)::text as count
      from event_occurrences eo
      join events e on e.id = eo.event_id
      where e.status = 'published'
        and eo.starts_at_utc >= now()
        and eo.city is not null
        and eo.city <> ''
        and ($1 = '' or lower(eo.city) like $1 || '%')
        and ($2 = '' or lower(eo.country_code) = $2)
      group by lower(eo.city)
      order by count(*) desc, lower(eo.city) asc
      limit $3
    `,
    [query, countryCode, input.limit],
  );

  return result.rows.map((row) => ({ city: row.city, count: Number(row.count) }));
}

export async function listTagSuggestions(
  pool: Pool,
  input: { q?: string; limit: number },
) {
  const query = (input.q ?? "").trim().toLowerCase();

  const result = await pool.query<{ tag: string; count: string }>(
    `
      with upcoming_events as (
        select distinct eo.event_id
        from event_occurrences eo
        where eo.starts_at_utc >= now()
      )
      select
        lower(tag) as tag,
        count(*)::text as count
      from upcoming_events ue
      join events e on e.id = ue.event_id
      cross join unnest(e.tags) as tag
      where e.status = 'published'
        and ($1 = '' or lower(tag) like $1 || '%')
      group by lower(tag)
      order by count(*) desc, lower(tag) asc
      limit $2
    `,
    [query, input.limit],
  );

  return result.rows.map((row) => ({ tag: row.tag, count: Number(row.count) }));
}
