import type { MetadataRoute } from "next";

import { apiBase } from "../lib/api";

const siteBase = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://beta.events.danceresource.org";

type EventSearchPage = {
  hits: Array<{
    event: {
      slug: string;
    };
  }>;
  pagination?: {
    page: number;
    totalPages: number;
  };
};

type OrganizerSearchPage = {
  items: Array<{ slug: string }>;
  pagination?: {
    page: number;
    totalPages: number;
  };
};

async function fetchJson<T>(path: string): Promise<T | null> {
  const response = await fetch(`${apiBase}${path}`, {
    next: { revalidate: 600 },
  }).catch(() => null);
  if (!response || !response.ok) {
    return null;
  }
  return response.json() as Promise<T>;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: `${siteBase}/events` },
    { url: `${siteBase}/organizers` },
  ];

  const eventSlugs = new Set<string>();
  const organizerSlugs = new Set<string>();

  const firstEvents = await fetchJson<EventSearchPage>("/events/search?page=1&pageSize=50");
  const eventPages = Math.min(firstEvents?.pagination?.totalPages ?? 1, 20);
  for (let page = 1; page <= eventPages; page += 1) {
    const payload = page === 1 ? firstEvents : await fetchJson<EventSearchPage>(`/events/search?page=${page}&pageSize=50`);
    for (const hit of payload?.hits ?? []) {
      if (hit.event.slug) {
        eventSlugs.add(hit.event.slug);
      }
    }
  }

  const firstOrganizers = await fetchJson<OrganizerSearchPage>("/organizers/search?page=1&pageSize=50");
  const organizerPages = Math.min(firstOrganizers?.pagination?.totalPages ?? 1, 20);
  for (let page = 1; page <= organizerPages; page += 1) {
    const payload = page === 1
      ? firstOrganizers
      : await fetchJson<OrganizerSearchPage>(`/organizers/search?page=${page}&pageSize=50`);
    for (const item of payload?.items ?? []) {
      if (item.slug) {
        organizerSlugs.add(item.slug);
      }
    }
  }

  for (const slug of eventSlugs) {
    entries.push({ url: `${siteBase}/events/${slug}` });
  }
  for (const slug of organizerSlugs) {
    entries.push({ url: `${siteBase}/organizers/${slug}` });
  }

  return entries;
}
