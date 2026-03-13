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

const EVENT_QUERY_TO = "2100-01-01T00:00:00.000Z";
const API_PAGE_SIZE = 50;
export const EVENT_SITEMAP_CHUNK_SIZE = 1000;

type EventSearchResponse = {
  hits: Array<{
    event: {
      slug: string;
      lastSyncedAt?: string | null;
    };
  }>;
  pagination?: {
    page: number;
    totalPages: number;
  };
};

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

async function fetchEventPage(page: number, from: string): Promise<EventSearchResponse | null> {
  const params = new URLSearchParams({
    from,
    to: EVENT_QUERY_TO,
    sort: "publishedAtDesc",
    page: String(page),
    pageSize: String(API_PAGE_SIZE),
  });
  for (const base of getServerApiBaseCandidates()) {
    const response = await fetch(`${base}/events/search?${params.toString()}`, {
      next: { revalidate: 600 },
    }).catch(() => null);
    if (!response || !response.ok) {
      continue;
    }
    return response.json() as Promise<EventSearchResponse>;
  }
  return null;
}

const getAllEventSitemapItemsCached = unstable_cache(async (): Promise<EventSitemapItem[]> => {
  const itemsBySlug = new Map<string, string | undefined>();
  const from = new Date().toISOString();
  const firstPage = await fetchEventPage(1, from);
  const totalPages = Math.max(firstPage?.pagination?.totalPages ?? 1, 1);

  for (const hit of firstPage?.hits ?? []) {
    const slug = hit.event.slug?.trim();
    if (!slug) {
      continue;
    }
    const lastmod = normalizeIsoDate(hit.event.lastSyncedAt ?? undefined);
    const existing = itemsBySlug.get(slug);
    itemsBySlug.set(slug, existing && lastmod ? (existing > lastmod ? existing : lastmod) : existing ?? lastmod);
  }

  for (let page = 2; page <= totalPages; page += 1) {
    const payload = await fetchEventPage(page, from);
    for (const hit of payload?.hits ?? []) {
      const slug = hit.event.slug?.trim();
      if (!slug) {
        continue;
      }
      const lastmod = normalizeIsoDate(hit.event.lastSyncedAt ?? undefined);
      const existing = itemsBySlug.get(slug);
      itemsBySlug.set(slug, existing && lastmod ? (existing > lastmod ? existing : lastmod) : existing ?? lastmod);
    }
  }

  return Array.from(itemsBySlug.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([slug, lastmod]) => ({ slug, lastmod }));
}, ["events-sitemap-items"], { revalidate: 600 });

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
    const params = new URLSearchParams({ page: String(page), pageSize: "200" });
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
  return Array.from(itemsBySlug.entries()).map(([slug, lastmod]) => ({ slug, lastmod }));
}, ["organizers-sitemap-items"], { revalidate: 600 });

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
