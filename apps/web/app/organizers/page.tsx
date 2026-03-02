import { OrganizerSearchClient, type OrganizerSearchInitialQuery } from "../../components/OrganizerSearchClient";

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

export default function OrganizersPage({
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
    countryCode: getSingle(searchParams, "countryCode") ?? undefined,
    city: getSingle(searchParams, "city") ?? undefined,
    page: Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : 1,
  };

  return <OrganizerSearchClient initialQuery={initialQuery} />;
}
