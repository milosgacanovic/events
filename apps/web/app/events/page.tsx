import type { Metadata } from "next";

import {
  EventSearchClient,
  type EventSearchInitialQuery,
  type SearchResponse,
  type TaxonomyResponse,
} from "../../components/EventSearchClient";
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

function csvToList(value: string | null): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildCanonical(searchParams: SearchParams): { canonical: string; noindex: boolean } {
  const page = getSingle(searchParams, "page");
  const practiceCategoryId = getSingle(searchParams, "practiceCategoryId");
  const eventFormatId = getSingle(searchParams, "eventFormatId");
  const allowedSingleFilter = practiceCategoryId ? { key: "practiceCategoryId", value: practiceCategoryId }
    : eventFormatId ? { key: "eventFormatId", value: eventFormatId }
      : null;
  const keys = Object.keys(searchParams).filter((key) => getSingle(searchParams, key) !== null);

  if (!allowedSingleFilter && keys.length === 0) {
    return { canonical: "/events", noindex: false };
  }

  if (
    allowedSingleFilter &&
    keys.every((key) => key === allowedSingleFilter.key || key === "page") &&
    (page === null || page === "1")
  ) {
    return {
      canonical: `/events?${allowedSingleFilter.key}=${encodeURIComponent(allowedSingleFilter.value)}`,
      noindex: false,
    };
  }

  if (allowedSingleFilter && keys.every((key) => key === allowedSingleFilter.key || key === "page")) {
    return {
      canonical: `/events?${allowedSingleFilter.key}=${encodeURIComponent(allowedSingleFilter.value)}`,
      noindex: true,
    };
  }

  return { canonical: "/events", noindex: true };
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { canonical, noindex } = buildCanonical(searchParams);
  return {
    alternates: { canonical },
    robots: noindex ? { index: false, follow: true } : { index: true, follow: true },
  };
}

async function fetchServerJson<T>(path: string): Promise<T | null> {
  const response = await fetch(`${apiBase}${path}`, {
    cache: "no-store",
  }).catch(() => null);
  if (!response || !response.ok) {
    return null;
  }
  return response.json() as Promise<T>;
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const viewParam = getSingle(searchParams, "view");
  const sortParam = getSingle(searchParams, "sort");
  const pageNumber = Number(getSingle(searchParams, "page") ?? "1");
  const initialQuery: EventSearchInitialQuery = {
    q: getSingle(searchParams, "q") ?? undefined,
    practiceCategoryId: getSingle(searchParams, "practiceCategoryId") ?? undefined,
    practiceSubcategoryId: getSingle(searchParams, "practiceSubcategoryId") ?? undefined,
    eventFormatId: getSingle(searchParams, "eventFormatId") ?? undefined,
    tags: (getSingle(searchParams, "tags") ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    languages: (getSingle(searchParams, "languages") ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    attendanceMode: getSingle(searchParams, "attendanceMode") ?? undefined,
    countryCodes: csvToList(getSingle(searchParams, "countryCode")),
    city: getSingle(searchParams, "city") ?? undefined,
    sort: sortParam === "startsAtDesc" ? "startsAtDesc" : "startsAtAsc",
    view: viewParam === "map" ? "map" : "list",
    page: Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : 1,
  };

  const params = new URLSearchParams();
  const nowIso = new Date().toISOString();
  const oneYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  if (initialQuery.q) params.set("q", initialQuery.q);
  if (initialQuery.practiceCategoryId) params.set("practiceCategoryId", initialQuery.practiceCategoryId);
  if (initialQuery.practiceSubcategoryId) params.set("practiceSubcategoryId", initialQuery.practiceSubcategoryId);
  if (initialQuery.eventFormatId) params.set("eventFormatId", initialQuery.eventFormatId);
  if (initialQuery.tags?.length) params.set("tags", initialQuery.tags.join(","));
  if (initialQuery.languages?.length) params.set("languages", initialQuery.languages.join(","));
  if (initialQuery.attendanceMode) params.set("attendanceMode", initialQuery.attendanceMode);
  if (initialQuery.countryCodes?.length) params.set("countryCode", initialQuery.countryCodes.join(","));
  if (initialQuery.city) params.set("city", initialQuery.city);
  params.set("sort", initialQuery.sort ?? "startsAtAsc");
  params.set("from", nowIso);
  params.set("to", oneYear);
  params.set("page", String(initialQuery.page ?? 1));
  params.set("pageSize", "20");

  const [initialResults, initialTaxonomy] = await Promise.all([
    fetchServerJson<SearchResponse>(`/events/search?${params.toString()}`),
    fetchServerJson<TaxonomyResponse>("/meta/taxonomies"),
  ]);

  return (
    <EventSearchClient
      initialResults={initialResults}
      initialTaxonomy={initialTaxonomy}
      initialQuery={initialQuery}
    />
  );
}
