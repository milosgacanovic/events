import type { Pool } from "pg";

import { deriveSeriesCadence, type SeriesCadence } from "../services/seriesCadenceService";
import { CITY_EXONYMS, cityKey, cityKeyToSlug } from "../utils/cityKey";
import { toSlugPart } from "../utils/eventSlug";

/**
 * City landing pages /events/in/<country>/<city> (SEO round 3, Proposal B).
 *
 * Events keep their raw city strings; a city page collects every raw
 * (country, city) pair whose normalized key resolves to the page's slug,
 * either through city_aliases (exonyms, districts) or because the key's slug
 * equals the city slug. Only owner-approved cities get a page.
 */

/** Below this many distinct upcoming series a city starts its 30-day grace. */
export const CITY_MIN_SERIES = 3;
export const CITY_NOINDEX_AFTER_DAYS = 30;

export type CityRow = {
  id: string;
  country_code: string;
  slug: string;
  display_name: string;
  approved: boolean;
  below_min_since: Date | null;
  updated_at: Date;
};

type CityIndex = {
  loadedAt: number;
  cities: Map<string, CityRow>;
  aliases: Map<string, string>;
};

const CITY_INDEX_TTL_MS = 5 * 60 * 1000;
let cityIndexCache: CityIndex | null = null;

function pairKey(countryCode: string, slugOrKey: string): string {
  return `${countryCode}/${slugOrKey}`;
}

export function clearCityIndexCache(): void {
  cityIndexCache = null;
}

async function loadCityIndex(pool: Pool): Promise<CityIndex> {
  if (cityIndexCache && Date.now() - cityIndexCache.loadedAt < CITY_INDEX_TTL_MS) return cityIndexCache;
  const [cities, aliases] = await Promise.all([
    pool.query<CityRow>(
      `select id, country_code, slug, display_name, approved, below_min_since, updated_at from cities`,
    ),
    pool.query<{ country_code: string; alias_key: string; city_slug: string }>(
      `select country_code, alias_key, city_slug from city_aliases`,
    ),
  ]);
  const index: CityIndex = {
    loadedAt: Date.now(),
    cities: new Map(cities.rows.map((row) => [pairKey(row.country_code, row.slug), row])),
    aliases: new Map(aliases.rows.map((row) => [pairKey(row.country_code, row.alias_key), row.city_slug])),
  };
  cityIndexCache = index;
  return index;
}

/** City slug a raw (country, city) pair belongs to, if that city is known. */
function resolveCitySlug(index: CityIndex, countryCode: string | null, rawCity: string | null): string | null {
  if (!countryCode || !rawCity) return null;
  const cc = countryCode.toLowerCase();
  const key = cityKey(rawCity);
  if (!key) return null;
  const slug = index.aliases.get(pairKey(cc, key)) ?? cityKeyToSlug(key);
  return slug && index.cities.has(pairKey(cc, slug)) ? slug : null;
}

/** Path of the approved city page for an event's city, or null. */
export async function getCityPagePath(
  pool: Pool,
  countryCode: string | null | undefined,
  rawCity: string | null | undefined,
): Promise<{ path: string; name: string } | null> {
  const index = await loadCityIndex(pool);
  const slug = resolveCitySlug(index, countryCode ?? null, rawCity ?? null);
  if (!slug || !countryCode) return null;
  const city = index.cities.get(pairKey(countryCode.toLowerCase(), slug));
  if (!city?.approved) return null;
  return { path: `/events/in/${city.country_code}/${city.slug}`, name: city.display_name };
}

export type CityPairStats = {
  country_code: string;
  city: string;
  series_keys: string[];
  organizer_ids: string[];
  occurrence_count: number;
  last_updated_at: Date;
};

/**
 * Upcoming in-person + hybrid, published + public occurrences grouped by raw
 * (country, city). Used by the seed script, the stats and the nightly refresh.
 */
export async function listUpcomingCityPairs(pool: Pool): Promise<CityPairStats[]> {
  const res = await pool.query<CityPairStats>(
    `
      select lower(eo.country_code) as country_code, eo.city,
        array_agg(distinct coalesce(e.series_id, e.id)::text) as series_keys,
        coalesce(array_agg(distinct eorg.organizer_id::text) filter (where eorg.organizer_id is not null), '{}') as organizer_ids,
        count(distinct eo.id)::int as occurrence_count,
        max(e.updated_at) as last_updated_at
      from event_occurrences eo
      join events e on e.id = eo.event_id
      left join event_organizers eorg on eorg.event_id = e.id
      where e.status = 'published' and e.visibility = 'public'
        and e.attendance_mode in ('in_person', 'hybrid')
        and eo.ends_at_utc >= now()
        and eo.country_code is not null and eo.city is not null and btrim(eo.city) <> ''
      group by 1, 2
    `,
  );
  return res.rows;
}

export type CityStats = {
  city: CityRow;
  seriesCount: number;
  hostCount: number;
  occurrenceCount: number;
  rawCities: string[];
  lastmod: string | null;
};

/** Stats for every known city (approved or not), merged across spellings. */
export async function computeCityStats(pool: Pool): Promise<CityStats[]> {
  const [index, pairs] = await Promise.all([loadCityIndex(pool), listUpcomingCityPairs(pool)]);
  const acc = new Map<string, { series: Set<string>; hosts: Set<string>; occ: number; raw: Set<string>; last: number }>();
  for (const pair of pairs) {
    const slug = resolveCitySlug(index, pair.country_code, pair.city);
    if (!slug) continue;
    const k = pairKey(pair.country_code, slug);
    const entry = acc.get(k) ?? { series: new Set(), hosts: new Set(), occ: 0, raw: new Set(), last: 0 };
    pair.series_keys.forEach((s) => entry.series.add(s));
    pair.organizer_ids.forEach((o) => entry.hosts.add(o));
    entry.occ += pair.occurrence_count;
    entry.raw.add(pair.city);
    entry.last = Math.max(entry.last, new Date(pair.last_updated_at).getTime());
    acc.set(k, entry);
  }
  return Array.from(index.cities.values()).map((city) => {
    const entry = acc.get(pairKey(city.country_code, city.slug));
    return {
      city,
      seriesCount: entry?.series.size ?? 0,
      hostCount: entry?.hosts.size ?? 0,
      occurrenceCount: entry?.occ ?? 0,
      rawCities: entry ? Array.from(entry.raw) : [],
      lastmod: entry?.last ? new Date(entry.last).toISOString() : null,
    };
  });
}

/**
 * Approved city pages are indexable until they have spent 30 days below the
 * minimum (CITY_MIN_SERIES distinct upcoming series). The page stays 200.
 */
export function isCityIndexable(city: Pick<CityRow, "approved" | "below_min_since">, now = new Date()): boolean {
  if (!city.approved) return false;
  if (!city.below_min_since) return true;
  return new Date(city.below_min_since).getTime() > now.getTime() - CITY_NOINDEX_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

/** Sitemap source: every indexable approved city page. */
export async function listIndexableCitiesForSitemap(
  pool: Pool,
  now = new Date(),
): Promise<Array<{ countryCode: string; slug: string; lastmod: string | null }>> {
  const stats = await computeCityStats(pool);
  return stats
    .filter((s) => isCityIndexable(s.city, now) && s.seriesCount > 0)
    .map((s) => ({ countryCode: s.city.country_code, slug: s.city.slug, lastmod: s.lastmod }))
    .sort((a, b) => `${a.countryCode}/${a.slug}`.localeCompare(`${b.countryCode}/${b.slug}`));
}

/**
 * Nightly: start (or clear) each approved city's 30-day grace. Returns how
 * many rows changed.
 */
export async function refreshCityQualification(pool: Pool): Promise<{ started: number; cleared: number }> {
  const stats = await computeCityStats(pool);
  const below = stats.filter((s) => s.city.approved && s.seriesCount < CITY_MIN_SERIES).map((s) => s.city.id);
  const ok = stats.filter((s) => s.city.approved && s.seriesCount >= CITY_MIN_SERIES).map((s) => s.city.id);
  const started = below.length
    ? (await pool.query(
      `update cities set below_min_since = now(), updated_at = now()
        where id = any($1::uuid[]) and below_min_since is null`,
      [below],
    )).rowCount ?? 0
    : 0;
  const cleared = ok.length
    ? (await pool.query(
      `update cities set below_min_since = null, updated_at = now()
        where id = any($1::uuid[]) and below_min_since is not null`,
      [ok],
    )).rowCount ?? 0
    : 0;
  clearCityIndexCache();
  return { started, cleared };
}

/**
 * Nightly: map spellings that appeared since the seed ("PARIS", "Zürich",
 * a transliterated name) to the approved city they normalize to, so the
 * page keeps collecting them. Only adds aliases for approved cities.
 */
export async function syncCityAliases(pool: Pool): Promise<number> {
  const [index, pairs] = await Promise.all([loadCityIndex(pool), listUpcomingCityPairs(pool)]);
  let added = 0;
  for (const pair of pairs) {
    const cc = pair.country_code.toLowerCase();
    const key = cityKey(pair.city);
    if (!key || index.aliases.has(pairKey(cc, key))) continue;
    const slug = CITY_EXONYMS[cc]?.[key] ?? (await toSlugPart(key));
    if (!slug || !index.cities.get(pairKey(cc, slug))?.approved) continue;
    const res = await pool.query(
      `insert into city_aliases (country_code, alias_key, city_slug) values ($1, $2, $3) on conflict do nothing`,
      [cc, key, slug],
    );
    added += res.rowCount ?? 0;
    index.aliases.set(pairKey(cc, key), slug);
  }
  if (added) clearCityIndexCache();
  return added;
}

export type CityPageSeries = {
  title: string;
  nextEvent: { slug: string; startsAtUtc: string; endsAtUtc: string; eventTimezone: string | null };
  upcomingCount: number;
  cadence: SeriesCadence | null;
  venue: string | null;
  practice: string | null;
  hosts: Array<{ slug: string; name: string }>;
  hubSlug: string | null;
};

export type CityPagePayload = {
  city: { countryCode: string; slug: string; name: string };
  series: CityPageSeries[];
  hosts: Array<{ slug: string; name: string; imageUrl: string | null; seriesCount: number }>;
  practices: Array<{ label: string; seriesCount: number }>;
  stats: { seriesCount: number; hostCount: number; occurrenceCount: number };
  seo: { indexable: boolean; lastmod: string | null };
};

type CityOccurrenceRow = {
  series_key: string;
  event_id: string;
  slug: string;
  title: string;
  starts_at_utc: Date;
  ends_at_utc: Date;
  event_timezone: string | null;
  updated_at: Date;
  venue: string | null;
  practice: string | null;
  hub_slug: string | null;
  lat: number | null;
  lng: number | null;
};

/** Occurrences farther than this from the city's median point are dropped. */
const CITY_MAX_DISTANCE_KM = 100;

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Same-name cities in one country (Portland OR / Portland ME) and events with
 * a wrong country share a raw (country, city) pair. Keep only occurrences
 * near the city's median point; rows without coordinates stay.
 */
export function dropFarOccurrences<T extends { lat: number | null; lng: number | null }>(rows: T[]): T[] {
  const located = rows.filter((r) => r.lat !== null && r.lng !== null);
  if (located.length < 3) return rows;
  const cLat = median(located.map((r) => r.lat as number));
  const cLng = median(located.map((r) => r.lng as number));
  return rows.filter((r) => r.lat === null || r.lng === null || distanceKm(cLat, cLng, r.lat, r.lng) <= CITY_MAX_DISTANCE_KM);
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function getCityPage(pool: Pool, countryCode: string, slug: string): Promise<CityPagePayload | null> {
  const cc = countryCode.toLowerCase();
  const index = await loadCityIndex(pool);
  const city = index.cities.get(pairKey(cc, slug));
  if (!city?.approved) return null;

  // Raw spellings of this city among upcoming occurrences in the country.
  const rawRes = await pool.query<{ city: string }>(
    `select distinct eo.city from event_occurrences eo
      where lower(eo.country_code) = $1 and eo.ends_at_utc >= now() and eo.city is not null`,
    [cc],
  );
  const rawCities = rawRes.rows.map((r) => r.city).filter((raw) => resolveCitySlug(index, cc, raw) === slug);

  let rows: CityOccurrenceRow[] = [];
  if (rawCities.length) {
    const res = await pool.query<CityOccurrenceRow>(
      `
        select coalesce(e.series_id, e.id)::text as series_key, e.id as event_id, e.slug, e.title,
          eo.starts_at_utc, eo.ends_at_utc, e.event_timezone, e.updated_at,
          nullif(btrim(l.label), '') as venue,
          p.label as practice,
          ss.slug as hub_slug,
          case when eo.geom is null then null else st_y(eo.geom::geometry) end as lat,
          case when eo.geom is null then null else st_x(eo.geom::geometry) end as lng
        from event_occurrences eo
        join events e on e.id = eo.event_id
        left join locations l on l.id = eo.location_id
        left join practices p on p.id = e.practice_category_id
        left join series_slugs ss on ss.series_id = e.series_id and ss.is_current
        where lower(eo.country_code) = $1 and eo.city = any($2::text[])
          and e.status = 'published' and e.visibility = 'public'
          and e.attendance_mode in ('in_person', 'hybrid')
          and eo.ends_at_utc >= now()
        order by eo.starts_at_utc
      `,
      [cc, rawCities],
    );
    rows = dropFarOccurrences(res.rows);
  }

  const eventIds = Array.from(new Set(rows.map((r) => r.event_id)));
  const orgRes = eventIds.length
    ? await pool.query<{ event_id: string; slug: string; name: string; image_url: string | null; display_order: number }>(
      `
        select eo.event_id, o.slug, o.name, coalesce(o.image_url, o.avatar_path) as image_url,
          coalesce(eo.display_order, 0) as display_order
        from event_organizers eo
        join organizers o on o.id = eo.organizer_id
        where eo.event_id = any($1::uuid[]) and o.status = 'published'
        order by eo.display_order nulls last, o.name
      `,
      [eventIds],
    )
    : { rows: [] };
  const orgsByEvent = new Map<string, Array<{ slug: string; name: string; image_url: string | null }>>();
  for (const row of orgRes.rows) {
    const list = orgsByEvent.get(row.event_id) ?? [];
    if (!list.some((o) => o.slug === row.slug)) list.push(row);
    orgsByEvent.set(row.event_id, list);
  }

  // One row per series: its next occurrence, all upcoming dates for cadence.
  const bySeries = new Map<string, CityOccurrenceRow[]>();
  for (const row of rows) {
    const list = bySeries.get(row.series_key) ?? [];
    list.push(row);
    bySeries.set(row.series_key, list);
  }
  const hostAcc = new Map<string, { slug: string; name: string; imageUrl: string | null; series: Set<string> }>();
  const practiceAcc = new Map<string, Set<string>>();
  const series: CityPageSeries[] = [];
  let lastmod = 0;
  for (const [seriesKey, occs] of bySeries) {
    const next = occs[0];
    const zone = next.event_timezone || "UTC";
    const cadence = deriveSeriesCadence(
      { rrule: null, rrule_dtstart_local: null, duration_minutes: null, event_timezone: zone, schedule_kind: "single" } as never,
      occs.map((o) => ({ starts_at_utc: iso(o.starts_at_utc), ends_at_utc: iso(o.ends_at_utc) })),
    );
    const hosts = (orgsByEvent.get(next.event_id) ?? []).map((o) => ({ slug: o.slug, name: o.name }));
    for (const o of orgsByEvent.get(next.event_id) ?? []) {
      const h = hostAcc.get(o.slug) ?? { slug: o.slug, name: o.name, imageUrl: o.image_url, series: new Set<string>() };
      h.series.add(seriesKey);
      hostAcc.set(o.slug, h);
    }
    if (next.practice) {
      const set = practiceAcc.get(next.practice) ?? new Set<string>();
      set.add(seriesKey);
      practiceAcc.set(next.practice, set);
    }
    for (const o of occs) lastmod = Math.max(lastmod, new Date(o.updated_at).getTime());
    series.push({
      title: next.title,
      nextEvent: {
        slug: next.slug,
        startsAtUtc: iso(next.starts_at_utc),
        endsAtUtc: iso(next.ends_at_utc),
        eventTimezone: next.event_timezone,
      },
      upcomingCount: new Set(occs.map((o) => o.event_id)).size,
      cadence,
      venue: next.venue,
      practice: next.practice,
      hosts,
      hubSlug: next.hub_slug,
    });
  }
  series.sort((a, b) => a.nextEvent.startsAtUtc.localeCompare(b.nextEvent.startsAtUtc));

  const hosts = Array.from(hostAcc.values())
    .map((h) => ({ slug: h.slug, name: h.name, imageUrl: h.imageUrl, seriesCount: h.series.size }))
    .sort((a, b) => b.seriesCount - a.seriesCount || a.name.localeCompare(b.name));
  const practices = Array.from(practiceAcc.entries())
    .map(([label, set]) => ({ label, seriesCount: set.size }))
    .sort((a, b) => b.seriesCount - a.seriesCount || a.label.localeCompare(b.label));

  return {
    city: { countryCode: city.country_code, slug: city.slug, name: city.display_name },
    series,
    hosts,
    practices,
    stats: { seriesCount: series.length, hostCount: hosts.length, occurrenceCount: rows.length },
    seo: { indexable: isCityIndexable(city) && series.length > 0, lastmod: lastmod ? new Date(lastmod).toISOString() : null },
  };
}
