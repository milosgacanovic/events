import type { Pool } from "pg";

export async function listCitySuggestions(
  pool: Pool,
  input: { q?: string; countryCode?: string; limit: number; exclude?: string[] },
) {
  const query = (input.q ?? "").trim().toLowerCase();
  const countryCode = (input.countryCode ?? "").trim().toLowerCase();

  const excluded = (input.exclude ?? []).map((value) => value.toLowerCase()).filter(Boolean);
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
        and (cardinality($4::text[]) = 0 or lower(eo.city) <> all($4::text[]))
      group by lower(eo.city)
      order by count(*) desc, lower(eo.city) asc
      limit $3
    `,
    [query, countryCode, input.limit, excluded],
  );

  return result.rows.map((row) => ({ city: row.city, count: Number(row.count) }));
}

export async function listTagSuggestions(
  pool: Pool,
  input: { q?: string; limit: number },
) {
  const query = (input.q ?? "").trim().toLowerCase();

  const result = await pool.query<{ tag: string; display: string | null; count: string }>(
    `
      with usage as (
        select lower(t.tag) as tag, count(*)::text as count
        from event_occurrences eo
        join events e on e.id = eo.event_id
        cross join unnest(e.tags) as t(tag)
        where eo.starts_at_utc >= now() and e.status = 'published'
        group by lower(t.tag)
      )
      select t.tag, t.display, coalesce(u.count, '0') as count
      from tags t
      left join usage u on u.tag = t.tag
      where ($1 = '' or t.tag like $1 || '%')
      order by t.sort_order, t.tag
      limit $2
    `,
    [query, input.limit],
  );

  return result.rows.map((row) => ({ tag: row.tag, display: row.display ?? row.tag, count: Number(row.count) }));
}

export async function listOrganizerCitySuggestions(
  pool: Pool,
  input: { q?: string; countryCode?: string; limit: number; exclude?: string[] },
) {
  const query = (input.q ?? "").trim().toLowerCase();
  const countryCode = (input.countryCode ?? "").trim().toLowerCase();

  const excluded = (input.exclude ?? []).map((value) => value.toLowerCase()).filter(Boolean);
  const result = await pool.query<{ city: string; count: string }>(
    `
      with organizer_city_sources as (
        select
          o.id as organizer_id,
          lower(o.city) as city,
          lower(o.country_code) as country_code
        from organizers o
        where o.status = 'published'
          and o.city is not null
          and o.city <> ''

        union all

        select
          o.id as organizer_id,
          lower(ol.city) as city,
          lower(ol.country_code) as country_code
        from organizers o
        join organizer_locations ol on ol.organizer_id = o.id
        where o.status = 'published'
          and ol.city is not null
          and ol.city <> ''
      ),
      dedup as (
        select distinct organizer_id, city, country_code
        from organizer_city_sources
      )
      select
        d.city,
        count(distinct d.organizer_id)::text as count
      from dedup d
      where ($1 = '' or d.city like $1 || '%')
        and ($2 = '' or d.country_code = $2)
        and (cardinality($4::text[]) = 0 or d.city <> all($4::text[]))
      group by d.city
      order by count(distinct d.organizer_id) desc, d.city asc
      limit $3
    `,
    [query, countryCode, input.limit, excluded],
  );

  return result.rows.map((row) => ({ city: row.city, count: Number(row.count) }));
}

export async function listOrganizerTagSuggestions(
  pool: Pool,
  input: { q?: string; limit: number },
) {
  const query = (input.q ?? "").trim().toLowerCase();

  const result = await pool.query<{ tag: string; count: string }>(
    `
      select
        lower(tag) as tag,
        count(*)::text as count
      from organizers o
      cross join unnest(o.tags) as tag
      where o.status = 'published'
        and ($1 = '' or lower(tag) like $1 || '%')
      group by lower(tag)
      order by count(*) desc, lower(tag) asc
      limit $2
    `,
    [query, input.limit],
  );

  return result.rows.map((row) => ({ tag: row.tag, count: Number(row.count) }));
}
