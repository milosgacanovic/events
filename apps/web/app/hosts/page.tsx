import { OrganizerSearchClient, type OrganizerSearchInitialQuery } from "../../components/OrganizerSearchClient";
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

export default async function HostsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const pageNumber = Number(getSingle(searchParams, "page") ?? "1");
  const initialQuery: OrganizerSearchInitialQuery = {
    q: getSingle(searchParams, "q") ?? undefined,
    roleKeys: csvToList(getSingle(searchParams, "roleKey")),
    tags: csvToList(getSingle(searchParams, "tags")),
    languages: csvToList(getSingle(searchParams, "languages")),
    countryCodes: csvToList(getSingle(searchParams, "countryCode")),
    cities: csvToList(getSingle(searchParams, "city")),
    view: getSingle(searchParams, "view") === "map" ? "map" : "list",
    page: Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : 1,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const initialTaxonomy = await fetchServerJson<any>("/meta/taxonomies");

  return <OrganizerSearchClient initialQuery={initialQuery} initialTaxonomy={initialTaxonomy} />;
}
