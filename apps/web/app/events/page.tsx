import type { Metadata } from "next";

import {
  EventSearchClient,
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
  const params = new URLSearchParams();
  const nowIso = new Date().toISOString();
  const oneYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const q = getSingle(searchParams, "q");
  const practiceCategoryId = getSingle(searchParams, "practiceCategoryId");
  const practiceSubcategoryId = getSingle(searchParams, "practiceSubcategoryId");
  const eventFormatId = getSingle(searchParams, "eventFormatId");
  const tags = getSingle(searchParams, "tags");
  const languages = getSingle(searchParams, "languages");
  const attendanceMode = getSingle(searchParams, "attendanceMode");
  const countryCode = getSingle(searchParams, "countryCode");
  const city = getSingle(searchParams, "city");
  const sort = getSingle(searchParams, "sort") ?? "startsAtAsc";
  const page = getSingle(searchParams, "page") ?? "1";

  if (q) params.set("q", q);
  if (practiceCategoryId) params.set("practiceCategoryId", practiceCategoryId);
  if (practiceSubcategoryId) params.set("practiceSubcategoryId", practiceSubcategoryId);
  if (eventFormatId) params.set("eventFormatId", eventFormatId);
  if (tags) params.set("tags", tags);
  if (languages) params.set("languages", languages);
  if (attendanceMode) params.set("attendanceMode", attendanceMode);
  if (countryCode) params.set("countryCode", countryCode);
  if (city) params.set("city", city);
  params.set("sort", sort);
  params.set("from", nowIso);
  params.set("to", oneYear);
  params.set("page", page);
  params.set("pageSize", "20");

  const [initialResults, initialTaxonomy] = await Promise.all([
    fetchServerJson<SearchResponse>(`/events/search?${params.toString()}`),
    fetchServerJson<TaxonomyResponse>("/meta/taxonomies"),
  ]);

  return <EventSearchClient initialResults={initialResults} initialTaxonomy={initialTaxonomy} />;
}
