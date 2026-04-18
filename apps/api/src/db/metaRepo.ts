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
        lower(es.city) as city,
        count(*)::text as count
      from event_series es
      where es.visibility = 'public'
        and es.upcoming_count > 0
        and es.city is not null
        and es.city <> ''
        and ($1 = '' or lower(es.city) like $1 || '%')
        and ($2 = '' or lower(es.country_code) = $2)
        and (cardinality($4::text[]) = 0 or lower(es.city) <> all($4::text[]))
      group by lower(es.city)
      order by count(*) desc, lower(es.city) asc
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
        select lower(tag) as tag, count(*)::text as count
        from event_series es
        cross join unnest(es.tags) as tag
        where es.visibility = 'public' and es.upcoming_count > 0
        group by lower(tag)
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

/**
 * Suggest cities with country + approximate coordinates for the Follow/Notify form.
 * Pulls from published `event_occurrences` (the places where we actually have events) so
 * picking a suggestion always yields a point that's relevant to the catalog. Geocode
 * fallback (Nominatim) happens in the route layer when the local list is sparse.
 */
export async function listCitySuggestionsWithCoords(
  pool: Pool,
  input: { q?: string; limit: number },
) {
  const query = (input.q ?? "").trim().toLowerCase();
  const result = await pool.query<{
    city: string;
    country_code: string | null;
    lat: string;
    lng: string;
    count: string;
  }>(
    `
      select
        lower(eo.city) as city,
        lower(eo.country_code) as country_code,
        avg(ST_Y(eo.geom::geometry))::text as lat,
        avg(ST_X(eo.geom::geometry))::text as lng,
        count(*)::text as count
      from event_occurrences eo
      join events e on e.id = eo.event_id
      where e.status = 'published'
        and eo.city is not null
        and eo.city <> ''
        and eo.geom is not null
        and ($1 = '' or lower(eo.city) like $1 || '%')
      group by lower(eo.city), lower(eo.country_code)
      order by count(*) desc, lower(eo.city) asc
      limit $2
    `,
    [query, input.limit],
  );

  return result.rows.map((row) => ({
    city: row.city,
    countryCode: row.country_code,
    lat: Number(row.lat),
    lng: Number(row.lng),
    count: Number(row.count),
  }));
}

/**
 * Distinct country codes found in our published-occurrence catalog. Used by the
 * country combobox in the Follow/Notify modal so users see "useful" countries first.
 * Labels are computed client-side via Intl.DisplayNames.
 */
export async function listCountryCodesInUse(pool: Pool) {
  const result = await pool.query<{ country_code: string; count: string }>(
    `
      select lower(eo.country_code) as country_code, count(*)::text as count
      from event_occurrences eo
      join events e on e.id = eo.event_id
      where e.status = 'published'
        and eo.country_code is not null
        and eo.country_code <> ''
      group by lower(eo.country_code)
      order by count(*) desc, lower(eo.country_code) asc
    `,
  );
  return result.rows
    .filter((row) => /^[a-z]{2}$/.test(row.country_code))
    .map((row) => ({ code: row.country_code, count: Number(row.count) }));
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
