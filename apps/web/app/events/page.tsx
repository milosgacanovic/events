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

const eventDateAllowed = new Set([
  "today",
  "tomorrow",
  "this_weekend",
  "this_week",
  "next_weekend",
  "next_week",
  "this_month",
  "next_month",
]);

function buildCanonical(searchParams: SearchParams): { canonical: string; noindex: boolean } {
  const page = getSingle(searchParams, "page");
  const practiceKey = getSingle(searchParams, "practice");
  const formatKey = getSingle(searchParams, "format");
  const allowedSingleFilter = practiceKey ? { key: "practice", value: practiceKey }
    : formatKey ? { key: "format", value: formatKey }
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
  const image = "https://wiki.danceresource.org/images/9/99/Danceresource.org_logo.png";
  const title = "Find Conscious Dance Events Worldwide | DanceResource";
  const description = "Discover ecstatic dance, 5Rhythms, contact improvisation and other conscious dance events near you or online. Global calendar updated daily.";
  return {
    title,
    description,
    alternates: { canonical },
    robots: noindex ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "DanceResource Events",
      type: "website",
      images: [{ url: image }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
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
    practiceCategoryIds: [],
    practiceSubcategoryId: getSingle(searchParams, "practiceSubcategoryId") ?? undefined,
    eventFormatIds: [],
    tags: (getSingle(searchParams, "tags") ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    languages: (getSingle(searchParams, "languages") ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    attendanceModes: csvToList(getSingle(searchParams, "attendanceMode")),
    countryCodes: csvToList(getSingle(searchParams, "countryCode")),
    cities: csvToList(getSingle(searchParams, "city")),
    eventDates: csvToList(getSingle(searchParams, "eventDate"))
      .map((item) => item.toLowerCase())
      .filter((item): item is NonNullable<EventSearchInitialQuery["eventDates"]>[number] => eventDateAllowed.has(item)),
    dateFrom: getSingle(searchParams, "dateFrom") ?? undefined,
    dateTo: getSingle(searchParams, "dateTo") ?? undefined,
    sort: (() => {
      const s = (sortParam ?? "").toLowerCase();
      if (s === "latest" || s === "startsatdesc") return "startsAtDesc";
      if (s === "recent" || s === "publishedatdesc") return "publishedAtDesc";
      if (s === "relevance") return "relevance";
      return "startsAtAsc";
    })(),
    view: viewParam === "map" ? "map" : viewParam === "discover" ? "discover" : "list",
    page: Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : 1,
    geoRadius: (() => {
      const nearMe = Number(getSingle(searchParams, "nearMe"));
      return Number.isFinite(nearMe) && nearMe > 0 ? nearMe * 1000 : undefined;
    })(),
  };

  const initialTaxonomy = await fetchServerJson<TaxonomyResponse>("/meta/taxonomies");
  const practiceParam = getSingle(searchParams, "practice");
  const formatParam = getSingle(searchParams, "format");
  const practiceIdParam = getSingle(searchParams, "practiceCategoryId");
  const formatIdParam = getSingle(searchParams, "eventFormatId");
  const practiceIdsFromKeys = (practiceParam ? csvToList(practiceParam) : [])
    .map((key) => initialTaxonomy?.practices.categories.find((category) => category.key === key)?.id ?? "")
    .filter(Boolean);
  const formatIdsFromKeys = (formatParam ? csvToList(formatParam) : [])
    .map((key) => initialTaxonomy?.eventFormats?.find((format) => format.key === key)?.id ?? "")
    .filter(Boolean) as string[];
  initialQuery.practiceCategoryIds = Array.from(new Set([
    ...csvToList(practiceIdParam),
    ...practiceIdsFromKeys,
  ]));
  initialQuery.eventFormatIds = Array.from(new Set([
    ...csvToList(formatIdParam),
    ...formatIdsFromKeys,
  ]));

  const params = new URLSearchParams();
  const nowIso = new Date().toISOString();
  const oneYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  if (initialQuery.q) params.set("q", initialQuery.q);
  if (initialQuery.practiceCategoryIds?.length) params.set("practiceCategoryId", initialQuery.practiceCategoryIds.join(","));
  if (initialQuery.practiceSubcategoryId) params.set("practiceSubcategoryId", initialQuery.practiceSubcategoryId);
  if (initialQuery.eventFormatIds?.length) params.set("eventFormatId", initialQuery.eventFormatIds.join(","));
  if (initialQuery.tags?.length) params.set("tags", initialQuery.tags.join(","));
  if (initialQuery.languages?.length) params.set("languages", initialQuery.languages.join(","));
  if (initialQuery.attendanceModes?.length) params.set("attendanceMode", initialQuery.attendanceModes.join(","));
  if (initialQuery.countryCodes?.length) params.set("countryCode", initialQuery.countryCodes.join(","));
  if (initialQuery.cities?.length) params.set("city", initialQuery.cities.join(","));
  if (initialQuery.eventDates?.length) params.set("eventDate", initialQuery.eventDates.join(","));
  const tzParam = getSingle(searchParams, "tz");
  if (tzParam) params.set("tz", tzParam);
  params.set("sort", initialQuery.sort ?? "startsAtAsc");
  params.set("from", nowIso);
  params.set("to", oneYear);
  params.set("page", String(initialQuery.page ?? 1));
  params.set("pageSize", "20");

  const initialResults = await fetchServerJson<SearchResponse>(`/events/search?${params.toString()}`);

  return (
    <EventSearchClient
      initialResults={initialResults}
      initialTaxonomy={initialTaxonomy}
      initialQuery={initialQuery}
    />
  );
}
