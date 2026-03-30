import type { Pool } from "pg";

import { getGeocodeCache, upsertGeocodeCache } from "../db/geocodeRepo";

const NOMINATIM_PROVIDER = "nominatim";

type NominatimResponse = Array<{
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    country_code?: string;
  };
}>;

export async function geocodeSearch(pool: Pool, query: string, limit: number) {
  const normalizedQuery = query.trim();
  const cacheKey = `${normalizedQuery}::${limit}`;
  const cached = await getGeocodeCache(pool, NOMINATIM_PROVIDER, cacheKey);

  if (cached) {
    return cached;
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("q", normalizedQuery);
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url, {
    headers: {
      "User-Agent": "DanceResourceEvents/0.1 (+https://events.danceresource.org)",
      "Accept-Language": "en",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Geocode request failed with status ${response.status}`);
  }

  const data = (await response.json()) as NominatimResponse;
  const mapped = data.map((item) => ({
    formatted_address: item.display_name,
    lat: Number(item.lat),
    lng: Number(item.lon),
    country_code: item.address?.country_code ?? null,
    city: item.address?.city ?? item.address?.town ?? item.address?.village ?? null,
    raw: item,
  }));

  await upsertGeocodeCache(pool, NOMINATIM_PROVIDER, cacheKey, mapped);
  return mapped;
}
