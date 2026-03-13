import type { Metadata } from "next";

import { OrganizerSearchClient, type OrganizerSearchInitialQuery, type OrganizerSearchResponse } from "../../components/OrganizerSearchClient";
import { apiBase } from "../../lib/api";

type SearchParams = Record<string, string | string[] | undefined>;

function getSingle(searchParams: SearchParams, key: string): string | null {
  const value = searchParams[key];
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }
  return null;
}

function csvToList(value: string | null): string[] | undefined {
  if (!value) {
    return undefined;
  }
  const items = value.split(",").map((item) => item.trim()).filter(Boolean);
  return items.length ? items : undefined;
}

async function fetchServerJson<T>(path: string): Promise<T | null> {
  const serverApiBase = process.env.INTERNAL_API_BASE_URL ?? apiBase;
  const response = await fetch(`${serverApiBase}${path}`, {
    cache: "no-store",
  }).catch(() => null);
  if (!response || !response.ok) {
    return null;
  }
  return response.json() as Promise<T>;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const hasFilters = ["q", "roleKey", "practice", "practiceCategoryId", "tags", "languages", "countryCode", "city"]
    .some((key) => getSingle(searchParams, key));
  return {
    title: "Find Dance Teachers & Hosts | DanceResource",
    description: "Browse conscious dance teachers, DJs, organizers and event hosts worldwide. Filter by practice, location and language.",
    alternates: { canonical: "/hosts" },
    robots: hasFilters
      ? { index: false, follow: true }
      : { index: true, follow: true },
  };
}

export default async function HostsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const pageNumber = Number(getSingle(searchParams, "page") ?? "1");
  const page = Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : 1;
  const initialQuery: OrganizerSearchInitialQuery = {
    q: getSingle(searchParams, "q") ?? undefined,
    roleKeys: csvToList(getSingle(searchParams, "roleKey")),
    tags: csvToList(getSingle(searchParams, "tags")),
    languages: csvToList(getSingle(searchParams, "languages")),
    countryCodes: csvToList(getSingle(searchParams, "countryCode")),
    cities: csvToList(getSingle(searchParams, "city")),
    view: getSingle(searchParams, "view") === "map" ? "map" : "list",
    page,
  };

  const params = new URLSearchParams();
  if (initialQuery.q) params.set("q", initialQuery.q);
  if (initialQuery.roleKeys?.length) params.set("roleKey", initialQuery.roleKeys.join(","));
  const practiceParam = getSingle(searchParams, "practice");
  const practiceCategoryIdParam = getSingle(searchParams, "practiceCategoryId");
  if (practiceCategoryIdParam) params.set("practiceCategoryId", practiceCategoryIdParam);
  if (practiceParam) params.set("practice", practiceParam);
  if (initialQuery.tags?.length) params.set("tags", initialQuery.tags.join(","));
  if (initialQuery.languages?.length) params.set("languages", initialQuery.languages.join(","));
  if (initialQuery.countryCodes?.length) params.set("countryCode", initialQuery.countryCodes.join(","));
  if (initialQuery.cities?.length) params.set("city", initialQuery.cities.join(","));
  params.set("page", String(page));
  params.set("pageSize", "20");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [initialTaxonomy, initialResults] = await Promise.all([
    fetchServerJson<any>("/meta/taxonomies"),
    fetchServerJson<OrganizerSearchResponse>(`/organizers/search?${params.toString()}`),
  ]);

  return (
    <OrganizerSearchClient
      initialQuery={initialQuery}
      initialTaxonomy={initialTaxonomy}
      initialResults={initialResults}
    />
  );
}
