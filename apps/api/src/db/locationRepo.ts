import type { Pool } from "pg";

import type { LocationRow } from "../types/domain";
import { inferCountryCode } from "../utils/countryCode";

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
      input.city ?? null,
      input.lng,
      input.lat,
    ],
  );

  return result.rows[0];
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
