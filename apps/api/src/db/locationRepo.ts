import type { Pool } from "pg";

import type { LocationRow } from "../types/domain";
import { inferCountryCode } from "../utils/countryCode";

// UK postcode pattern, anchored — rejects "London N6 6BA" style fragments that
// importers have occasionally mis-routed into the city column.
const UK_POSTCODE_RE = /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/i;

// Drop city values that are obviously not a city name — e.g. the venue label
// itself, or a string containing a UK postcode. Prevents "Acland Burghley School
// Sports Centre" or "London N6 6BA" from ending up in locations.city, which
// breaks /events?city=london filtering.
function sanitizeCity(city: string | null | undefined, label: string | null | undefined): string | null {
  const trimmed = city?.trim();
  if (!trimmed) return null;
  if (UK_POSTCODE_RE.test(trimmed)) return null;
  if (label && label.trim().includes(" ") && trimmed.toLowerCase() === label.trim().toLowerCase()) return null;
  return trimmed;
}

export async function getLocationById(pool: Pool, id: string): Promise<LocationRow | null> {
  const result = await pool.query<LocationRow>(
    `
      select
        id,
        label,
        formatted_address,
        country_code,
        city,
        st_y(geom::geometry) as lat,
        st_x(geom::geometry) as lng
      from locations
      where id = $1
    `,
    [id],
  );

  return result.rows[0] ?? null;
}

export async function getEventDefaultLocation(pool: Pool, eventId: string): Promise<LocationRow | null> {
  const result = await pool.query<LocationRow>(
    `
      select
        l.id,
        l.label,
        l.formatted_address,
        l.country_code,
        l.city,
        st_y(l.geom::geometry) as lat,
        st_x(l.geom::geometry) as lng
      from event_locations el
      join locations l on l.id = el.location_id
      where el.event_id = $1
      limit 1
    `,
    [eventId],
  );

  return result.rows[0] ?? null;
}

export async function createLocation(
  pool: Pool,
  input: {
    label?: string | null;
    formattedAddress: string;
    countryCode?: string | null;
    city?: string | null;
    lat: number;
    lng: number;
  },
): Promise<LocationRow> {
  const resolvedCountryCode = inferCountryCode(input.countryCode ?? null, input.formattedAddress);
  const sanitizedCity = sanitizeCity(input.city, input.label);

  const result = await pool.query<LocationRow>(
    `
      insert into locations (label, formatted_address, country_code, city, geom)
      values ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography)
      returning
        id,
        label,
        formatted_address,
        country_code,
        city,
        st_y(geom::geometry) as lat,
        st_x(geom::geometry) as lng
    `,
    [
      input.label ?? null,
      input.formattedAddress,
      resolvedCountryCode,
      sanitizedCity,
      input.lng,
      input.lat,
    ],
  );

  return result.rows[0];
}

export async function updateLocation(
  pool: Pool,
  id: string,
  input: {
    label?: string | null;
    formattedAddress?: string | null;
    countryCode?: string | null;
    city?: string | null;
    lat?: number | null;
    lng?: number | null;
  },
): Promise<void> {
  const resolvedCountryCode = inferCountryCode(input.countryCode ?? null, input.formattedAddress ?? "");
  const sanitizedCity = sanitizeCity(input.city, input.label);
  await pool.query(
    `
      update locations set
        label = $2,
        formatted_address = $3,
        country_code = $4,
        city = $5,
        geom = ST_SetSRID(ST_MakePoint($7, $6), 4326)::geography
      where id = $1
    `,
    [
      id,
      input.label ?? null,
      input.formattedAddress ?? null,
      resolvedCountryCode,
      sanitizedCity,
      input.lat ?? 0,
      input.lng ?? 0,
    ],
  );
}

export async function setEventDefaultLocation(
  pool: Pool,
  eventId: string,
  locationId: string | null,
): Promise<void> {
  if (!locationId) {
    await pool.query("delete from event_locations where event_id = $1", [eventId]);
    return;
  }

  await pool.query(
    `
      insert into event_locations (event_id, location_id)
      values ($1, $2)
      on conflict (event_id)
      do update set location_id = excluded.location_id
    `,
    [eventId, locationId],
  );
}
