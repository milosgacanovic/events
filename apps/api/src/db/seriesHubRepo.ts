import type { Pool, PoolClient } from "pg";

import { deriveSeriesCadence, type SeriesCadence } from "../services/seriesCadenceService";
import { eventSlugCandidates } from "../utils/eventSlug";
import { getCityPagePath } from "./cityRepo";

/**
 * Series hub pages /series/<slug> (SEO round 3, Proposal A1).
 *
 * A hub lists a recurring series' upcoming dates. Only multi-sibling series
 * with at least SERIES_HUB_MIN_UPCOMING upcoming dates get a slug (and are
 * indexed); a hub whose series falls below that stays 200 but noindex.
 * Hub URLs live in series_slugs so they survive importer re-keys.
 */
export const SERIES_HUB_MIN_UPCOMING = 2;

const RESERVED_HUB_SLUGS = new Set(["new", "search", "in", "online"]);

export type HubCandidate = {
  series_id: string;
  title: string;
  city: string | null;
  country_code: string | null;
  organizer_name: string | null;
  organizer_id: string | null;
  upcoming_count: number;
};

/**
 * Live multi-sibling series with >= SERIES_HUB_MIN_UPCOMING upcoming dates.
 * The title is the most common title among upcoming siblings (a few series
 * join unrelated workshops under one key; the canonical sibling's title can
 * be the odd one out).
 */
export async function listHubCandidates(db: Pool | PoolClient): Promise<HubCandidate[]> {
  const res = await db.query<HubCandidate>(
    `
      with s as (
        select es.series_id, es.city, es.country_code, es.upcoming_count, es.organizers_json
        from event_series es
        where es.visibility = 'public' and es.sibling_count > 1 and es.upcoming_count >= $1
      ),
      titles as (
        select e.series_id, e.title, count(*) as n
        from events e
        join s on s.series_id = e.series_id
        where e.status = 'published' and e.visibility = 'public'
          and exists (select 1 from event_occurrences eo where eo.event_id = e.id and eo.ends_at_utc >= now())
        group by 1, 2
      ),
      top_title as (
        select distinct on (series_id) series_id, title
        from titles
        order by series_id, n desc, title
      )
      select s.series_id, coalesce(t.title, '') as title, s.city, s.country_code, s.upcoming_count,
        (s.organizers_json -> 0 ->> 'name') as organizer_name,
        (s.organizers_json -> 0 ->> 'id') as organizer_id
      from s
      left join top_title t on t.series_id = s.series_id
      order by s.series_id
    `,
    [SERIES_HUB_MIN_UPCOMING],
  );
  return res.rows.filter((r) => r.title.trim() !== "");
}

export type SlugPlan = {
  seriesId: string;
  title: string;
  city: string | null;
  organizer: string | null;
  slug: string;
  /** "new" slug, or "moved" from a dead re-keyed twin series. */
  kind: "new" | "moved";
  movedFromSeriesId?: string;
};

type DeadTwin = { slug: string; series_id: string; title: string; city: string | null; organizer_id: string | null };

function twinKey(title: string, organizerId: string | null, city: string | null): string {
  return `${title.trim().toLowerCase()}|${organizerId ?? ""}|${(city ?? "").trim().toLowerCase()}`;
}

/**
 * Plan slugs for qualifying series that have none. A dead series (no
 * upcoming dates) with the same title + first organizer + city hands its
 * current slug over (the upstream re-keyed it); otherwise a new slug comes
 * from the Task 7 generator: title + city, then + surname, then a number.
 */
export async function planSeriesSlugs(db: Pool | PoolClient): Promise<{ plans: SlugPlan[]; candidates: number; existing: number }> {
  const candidates = await listHubCandidates(db);
  const existingRes = await db.query<{ series_id: string; slug: string; is_current: boolean }>(
    `select series_id::text, slug, is_current from series_slugs`,
  );
  const taken = new Set(existingRes.rows.map((r) => r.slug));
  const hasCurrent = new Set(existingRes.rows.filter((r) => r.is_current).map((r) => r.series_id));

  // Current hub slugs whose series has no upcoming dates any more.
  const deadRes = await db.query<DeadTwin>(
    `
      select ss.slug, ss.series_id::text, es.title, es.city, (es.organizers_json -> 0 ->> 'id') as organizer_id
      from series_slugs ss
      join event_series es on es.series_id = ss.series_id
      where ss.is_current and coalesce(es.upcoming_count, 0) = 0
    `,
  );
  const deadByKey = new Map<string, DeadTwin>();
  for (const d of deadRes.rows) deadByKey.set(twinKey(d.title, d.organizer_id, d.city), d);

  const plans: SlugPlan[] = [];
  for (const c of candidates) {
    if (hasCurrent.has(c.series_id)) continue;
    const twin = deadByKey.get(twinKey(c.title, c.organizer_id, c.city));
    if (twin) {
      deadByKey.delete(twinKey(c.title, c.organizer_id, c.city));
      plans.push({ seriesId: c.series_id, title: c.title, city: c.city, organizer: c.organizer_name, slug: twin.slug, kind: "moved", movedFromSeriesId: twin.series_id });
      continue;
    }
    const options = await eventSlugCandidates({ title: c.title, city: c.city, organizerName: c.organizer_name });
    let slug = options.find((o) => !taken.has(o) && !RESERVED_HUB_SLUGS.has(o)) ?? null;
    if (!slug) {
      const last = options[options.length - 1];
      for (let i = 2; i <= 200 && !slug; i += 1) {
        const candidate = `${last}-${i}`;
        if (!taken.has(candidate)) slug = candidate;
      }
    }
    if (!slug) continue;
    taken.add(slug);
    plans.push({ seriesId: c.series_id, title: c.title, city: c.city, organizer: c.organizer_name, slug, kind: "new" });
  }
  return { plans, candidates: candidates.length, existing: hasCurrent.size };
}

/** Writes planned slugs (new rows; moved slugs re-point at the new series). */
export async function applySeriesSlugPlans(pool: Pool, plans: SlugPlan[]): Promise<{ inserted: number; moved: number }> {
  const client = await pool.connect();
  let inserted = 0;
  let moved = 0;
  try {
    await client.query("begin");
    for (const plan of plans) {
      if (plan.kind === "moved") {
        const res = await client.query(
          `update series_slugs set series_id = $1, updated_at = now() where slug = $2 and is_current`,
          [plan.seriesId, plan.slug],
        );
        moved += res.rowCount ?? 0;
      } else {
        const res = await client.query(
          `insert into series_slugs (slug, series_id, is_current) values ($1, $2, true) on conflict do nothing`,
          [plan.slug, plan.seriesId],
        );
        inserted += res.rowCount ?? 0;
      }
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  return { inserted, moved };
}

/**
 * Nightly: give newly qualifying series a hub slug. Does nothing until the
 * owner-reviewed initial backfill (scripts/backfillSeriesSlugs.ts) has run.
 */
export async function assignNewSeriesSlugs(pool: Pool): Promise<{ inserted: number; moved: number; skipped?: string }> {
  const any = await pool.query(`select 1 from series_slugs limit 1`);
  if (!any.rowCount) return { inserted: 0, moved: 0, skipped: "initial backfill not applied" };
  const { plans } = await planSeriesSlugs(pool);
  return applySeriesSlugPlans(pool, plans);
}

/** Current hub slug for a series, or null. */
export async function getCurrentHubSlug(pool: Pool, seriesId: string | null | undefined): Promise<string | null> {
  if (!seriesId) return null;
  const res = await pool.query<{ slug: string }>(
    `select slug from series_slugs where series_id = $1 and is_current limit 1`,
    [seriesId],
  );
  return res.rows[0]?.slug ?? null;
}

export type SeriesHubPayload =
  | { redirectTo: string }
  | {
    hub: {
      slug: string;
      title: string;
      venue: string | null;
      city: string | null;
      countryCode: string | null;
      practice: string | null;
      cadence: SeriesCadence | null;
      eventTimezone: string | null;
      description: string | null;
    };
    hosts: Array<{ slug: string; name: string; imageUrl: string | null }>;
    upcoming: Array<{ slug: string; title: string; startsAtUtc: string; endsAtUtc: string; eventTimezone: string | null }>;
    cityPage: { path: string; name: string } | null;
    seo: { indexable: boolean; lastmod: string | null };
  };

type HubOccurrenceRow = {
  event_id: string;
  slug: string;
  title: string;
  starts_at_utc: Date;
  ends_at_utc: Date;
  event_timezone: string | null;
  updated_at: Date;
  venue: string | null;
  city: string | null;
  country_code: string | null;
  practice: string | null;
  description_html: string | null;
};

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function getSeriesHub(pool: Pool, slug: string): Promise<SeriesHubPayload | null> {
  const slugRes = await pool.query<{ series_id: string; is_current: boolean }>(
    `select series_id::text, is_current from series_slugs where slug = $1`,
    [slug],
  );
  const row = slugRes.rows[0];
  if (!row) return null;
  if (!row.is_current) {
    const current = await getCurrentHubSlug(pool, row.series_id);
    return current ? { redirectTo: current } : null;
  }

  const occRes = await pool.query<HubOccurrenceRow>(
    `
      select e.id as event_id, e.slug, e.title, eo.starts_at_utc, eo.ends_at_utc, e.event_timezone, e.updated_at,
        nullif(btrim(l.label), '') as venue, eo.city, lower(eo.country_code) as country_code,
        p.label as practice, e.description_json ->> 'html' as description_html
      from event_occurrences eo
      join events e on e.id = eo.event_id
      left join locations l on l.id = eo.location_id
      left join practices p on p.id = e.practice_category_id
      where e.series_id = $1 and e.status = 'published' and e.visibility = 'public'
        and eo.ends_at_utc >= now()
      order by eo.starts_at_utc
    `,
    [row.series_id],
  );
  const occs = occRes.rows;

  // Title: most common among upcoming siblings (see listHubCandidates).
  const titleCounts = new Map<string, number>();
  for (const o of occs) titleCounts.set(o.title, (titleCounts.get(o.title) ?? 0) + 1);
  let title = Array.from(titleCounts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
  if (!title) {
    const fallback = await pool.query<{ title: string }>(`select title from event_series where series_id = $1`, [row.series_id]);
    title = fallback.rows[0]?.title ?? slug;
  }

  const next = occs[0] ?? null;
  const zone = next?.event_timezone || "UTC";
  const cadence = occs.length
    ? deriveSeriesCadence(
      { rrule: null, rrule_dtstart_local: null, duration_minutes: null, event_timezone: zone, schedule_kind: "single" } as never,
      occs.map((o) => ({ starts_at_utc: iso(o.starts_at_utc), ends_at_utc: iso(o.ends_at_utc) })),
    )
    : null;

  const eventIds = Array.from(new Set(occs.map((o) => o.event_id)));
  const hostRes = eventIds.length
    ? await pool.query<{ slug: string; name: string; image_url: string | null; n: number }>(
      `
        select o.slug, o.name, coalesce(o.image_url, o.avatar_path) as image_url, count(*)::int as n,
          min(coalesce(eo.display_order, 0)) as ord
        from event_organizers eo
        join organizers o on o.id = eo.organizer_id
        where eo.event_id = any($1::uuid[]) and o.status = 'published'
        group by o.slug, o.name, o.image_url, o.avatar_path
        order by ord, n desc, o.name
      `,
      [eventIds],
    )
    : { rows: [] };

  const seen = new Set<string>();
  const upcoming = occs
    .filter((o) => (seen.has(o.event_id) ? false : (seen.add(o.event_id), true)))
    .map((o) => ({
      slug: o.slug,
      title: o.title,
      startsAtUtc: iso(o.starts_at_utc),
      endsAtUtc: iso(o.ends_at_utc),
      eventTimezone: o.event_timezone,
    }));
  const lastmod = occs.reduce((max, o) => Math.max(max, new Date(o.updated_at).getTime()), 0);

  return {
    hub: {
      slug,
      title,
      venue: next?.venue ?? null,
      city: next?.city ?? null,
      countryCode: next?.country_code ?? null,
      practice: next?.practice ?? null,
      cadence,
      eventTimezone: next?.event_timezone ?? null,
      description: next?.description_html ?? null,
    },
    hosts: hostRes.rows.map((h) => ({ slug: h.slug, name: h.name, imageUrl: h.image_url })),
    upcoming,
    cityPage: next ? await getCityPagePath(pool, next.country_code, next.city) : null,
    seo: { indexable: upcoming.length >= SERIES_HUB_MIN_UPCOMING, lastmod: lastmod ? new Date(lastmod).toISOString() : null },
  };
}

/** Sitemap source: current hub slugs whose series has enough upcoming dates. */
export async function listIndexableHubsForSitemap(pool: Pool): Promise<Array<{ slug: string; lastmod: string | null }>> {
  const res = await pool.query<{ slug: string; lastmod: Date | null }>(
    `
      select ss.slug, max(e.updated_at) as lastmod
      from series_slugs ss
      join events e on e.series_id = ss.series_id
      where ss.is_current and e.status = 'published' and e.visibility = 'public'
        and exists (select 1 from event_occurrences eo where eo.event_id = e.id and eo.ends_at_utc >= now())
      group by ss.slug
      having count(distinct e.id) >= $1
      order by ss.slug
    `,
    [SERIES_HUB_MIN_UPCOMING],
  );
  return res.rows.map((r) => ({ slug: r.slug, lastmod: r.lastmod ? new Date(r.lastmod).toISOString() : null }));
}

/** Current hub slugs for a host's series (host page "Regular classes"). */
export async function listHubsForOrganizer(pool: Pool, organizerId: string): Promise<Array<{ slug: string; title: string }>> {
  const res = await pool.query<{ slug: string; title: string }>(
    `
      select distinct on (ss.slug) ss.slug, e.title
      from series_slugs ss
      join events e on e.series_id = ss.series_id
      join event_organizers eo on eo.event_id = e.id and eo.organizer_id = $1
      where ss.is_current and e.status = 'published' and e.visibility = 'public'
        and exists (select 1 from event_occurrences oc where oc.event_id = e.id and oc.ends_at_utc >= now())
      order by ss.slug, e.title
    `,
    [organizerId],
  );
  return res.rows.sort((a, b) => a.title.localeCompare(b.title));
}
