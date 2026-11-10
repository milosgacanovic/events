import { unstable_cache } from "next/cache";

import { apiBase } from "./api";

const siteBase = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://events.danceresource.org";
const configuredServerApiBase = process.env.INTERNAL_API_BASE_URL?.replace(/\/$/, "");
const absoluteApiBase = apiBase.startsWith("http")
  ? apiBase.replace(/\/$/, "")
  : `${siteBase}${apiBase.startsWith("/") ? "" : "/"}${apiBase}`;

function getServerApiBaseCandidates(): string[] {
  const values = [
    configuredServerApiBase,
    absoluteApiBase,
    "http://api:13001/api",
    "http://localhost:13001/api",
  ].filter((value): value is string => Boolean(value));
  return Array.from(new Set(values));
}

export const EVENT_SITEMAP_CHUNK_SIZE = 1000;

export type EventSitemapItem = {
  slug: string;
  lastmod?: string;
};

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

function normalizeIsoDate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}

type EventSitemapResponse = {
  items: Array<{ slug: string; lastmod?: string | null }>;
};

// Source of truth is the API's /seo/sitemap/events, which applies the same
// isEventIndexable() predicate as the event page's robots meta. Do NOT derive
// this list from /events/search again: that returns one (possibly stale)
// canonical slug per series and let archived pages into the sitemap.
const getAllEventSitemapItemsCached = unstable_cache(async (): Promise<EventSitemapItem[]> => {
  for (const base of getServerApiBaseCandidates()) {
    const response = await fetch(`${base}/seo/sitemap/events`, {
      next: { revalidate: 600 },
    }).catch(() => null);
    if (!response || !response.ok) {
      continue;
    }
    const payload = (await response.json()) as EventSitemapResponse;
    const items = payload.items
      .filter((item) => item.slug?.trim())
      .map((item) => ({ slug: item.slug.trim(), lastmod: normalizeIsoDate(item.lastmod ?? undefined) }));
    if (items.length === 0) {
      // Don't poison the cache with an empty result.
      throw new Error("events sitemap: API returned no items");
    }
    return items;
  }
  throw new Error("events sitemap: API unreachable");
}, ["events-sitemap-items-v3"], { revalidate: 600 });

export async function getEventSitemapItems(): Promise<EventSitemapItem[]> {
  return getAllEventSitemapItemsCached();
}

type OrganizerSearchResponse = {
  items: Array<{ slug: string; updatedAt?: string | null }>;
  pagination?: { page: number; totalPages: number };
};

const getAllOrganizerSitemapItemsCached = unstable_cache(async (): Promise<EventSitemapItem[]> => {
  const itemsBySlug = new Map<string, string | undefined>();
  let page = 1;
  while (true) {
    const params = new URLSearchParams({ page: String(page), pageSize: "50" });
    let result: OrganizerSearchResponse | null = null;
    for (const base of getServerApiBaseCandidates()) {
      const response = await fetch(`${base}/organizers/search?${params.toString()}`, {
        next: { revalidate: 600 },
      }).catch(() => null);
      if (response?.ok) {
        result = await response.json();
        break;
      }
    }
    if (!result?.items.length) break;
    for (const item of result.items) {
      if (item.slug) itemsBySlug.set(item.slug, normalizeIsoDate(item.updatedAt ?? undefined));
    }
    if (page >= (result.pagination?.totalPages ?? 1)) break;
    page++;
  }
  if (itemsBySlug.size === 0) {
    // Don't poison the cache with an empty result if the API was unreachable.
    throw new Error("organizers sitemap: no items returned from API");
  }
  return Array.from(itemsBySlug.entries()).map(([slug, lastmod]) => ({ slug, lastmod }));
}, ["organizers-sitemap-items-v2"], { revalidate: 600 });

export async function getOrganizerSitemapItems(): Promise<EventSitemapItem[]> {
  return getAllOrganizerSitemapItemsCached();
}

export function getSiteBase(): string {
  return siteBase;
}

export function toUrlSetXml(
  entries: Array<{ loc: string; lastmod?: string }>,
): string {
  const body = entries
    .map((entry) => {
      const loc = `<loc>${escapeXml(entry.loc)}</loc>`;
      const lastmod = entry.lastmod ? `<lastmod>${escapeXml(entry.lastmod)}</lastmod>` : "";
      return `<url>${loc}${lastmod}</url>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`;
}

export function toSitemapIndexXml(locations: string[]): string {
  const body = locations
    .map((loc) => `<sitemap><loc>${escapeXml(loc)}</loc></sitemap>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</sitemapindex>`;
}
