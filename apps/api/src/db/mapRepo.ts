import type { Pool } from "pg";

export type MapFilterInput = {
  q?: string;
  from?: string;
  to?: string;
  dateRanges?: Array<{
    fromUtc: string;
    toUtc: string;
  }>;
  practiceCategoryId?: string;
  practiceCategoryIds?: string[];
  practiceSubcategoryId?: string;
  tags?: string[];
  languages?: string[];
  attendanceMode?: "in_person" | "online" | "hybrid";
  organizerId?: string;
  countryCode?: string;
  city?: string;
  hasGeo?: boolean;
  bbox: {
    west: number;
    south: number;
    east: number;
    north: number;
  };
  limit: number;
};

export type OrganizerMapFilterInput = {
  q?: string;
  tags?: string[];
  languages?: string[];
  roleKeys?: string[];
  practiceCategoryIds?: string[];
  countryCodes?: string[];
  city?: string;
  bbox: {
    west: number;
    south: number;
    east: number;
    north: number;
  };
  limit: number;
};

function buildWhere(input: Omit<MapFilterInput, "bbox">): { whereSql: string; values: unknown[] } {
  const values: unknown[] = [];
  const where: string[] = [
    "e.status = 'published'",
    "eo.status = 'published'",
  ];

  if (input.dateRanges?.length) {
    const clauses: string[] = [];
    for (const range of input.dateRanges) {
      values.push(range.fromUtc, range.toUtc);
      const fromIdx = values.length - 1;
      const toIdx = values.length;
      clauses.push(`(eo.starts_at_utc >= $${fromIdx}::timestamptz and eo.starts_at_utc < $${toIdx}::timestamptz)`);
    }
    where.push(`(${clauses.join(" or ")})`);
  } else {
    values.push(input.from, input.to);
    where.push(
      "eo.starts_at_utc >= $1::timestamptz",
      "eo.starts_at_utc <= $2::timestamptz",
    );
  }

  const normalizedPracticeCategoryIds = (
    input.practiceCategoryIds?.length
      ? input.practiceCategoryIds
      : input.practiceCategoryId
        ? [input.practiceCategoryId]
        : []
  ).filter(Boolean);
  if (normalizedPracticeCategoryIds.length === 1) {
    values.push(normalizedPracticeCategoryIds[0]);
    where.push(`e.practice_category_id = $${values.length}::uuid`);
  } else if (normalizedPracticeCategoryIds.length > 1) {
    values.push(normalizedPracticeCategoryIds);
    where.push(`e.practice_category_id = any($${values.length}::uuid[])`);
  }
  if (input.practiceSubcategoryId) {
    values.push(input.practiceSubcategoryId);
    where.push(`e.practice_subcategory_id = $${values.length}::uuid`);
  }
  if (input.tags?.length) {
    values.push(input.tags);
    where.push(`e.tags && $${values.length}::text[]`);
  }
  if (input.languages?.length) {
    values.push(input.languages);
    where.push(`e.languages && $${values.length}::text[]`);
  }
  if (input.attendanceMode) {
    values.push(input.attendanceMode);
    where.push(`e.attendance_mode = $${values.length}`);
  }
  if (input.organizerId) {
    values.push(input.organizerId);
    where.push(`exists (select 1 from event_organizers rel where rel.event_id = e.id and rel.organizer_id = $${values.length}::uuid)`);
  }
  if (input.countryCode) {
    values.push(input.countryCode.toLowerCase());
    where.push(`lower(eo.country_code) = $${values.length}`);
  }
  if (input.city) {
    values.push(input.city.toLowerCase());
    where.push(`lower(eo.city) = $${values.length}`);
  }
  if (typeof input.hasGeo === "boolean") {
    where.push(input.hasGeo ? "eo.geom is not null" : "eo.geom is null");
  }
  if (input.q) {
    values.push(`%${input.q.toLowerCase()}%`);
    where.push(`(lower(e.title) like $${values.length} or lower(e.slug) like $${values.length})`);
  }

  return {
    whereSql: where.join(" and "),
    values,
  };
}

export async function fetchMapPoints(pool: Pool, input: MapFilterInput) {
  const { whereSql, values } = buildWhere(input);
  values.push(input.bbox.west, input.bbox.south, input.bbox.east, input.bbox.north);
  const westIndex = values.length - 3;
  const southIndex = values.length - 2;
  const eastIndex = values.length - 1;
  const northIndex = values.length;
  values.push(input.limit + 1);
  const limitIndex = values.length;

  const result = await pool.query<{
    occurrence_id: string;
    event_slug: string;
    event_title: string;
    starts_at_utc: string;
    event_timezone: string | null;
    lat: number;
    lng: number;
  }>(
    `
      select
        eo.id as occurrence_id,
        e.slug as event_slug,
        e.title as event_title,
        eo.starts_at_utc,
        e.event_timezone,
        st_y(eo.geom::geometry) as lat,
        st_x(eo.geom::geometry) as lng
      from event_occurrences eo
      join events e on e.id = eo.event_id
      where ${whereSql}
        and eo.geom is not null
        and st_intersects(
          eo.geom::geometry,
          ST_MakeEnvelope($${westIndex}, $${southIndex}, $${eastIndex}, $${northIndex}, 4326)
        )
      order by eo.starts_at_utc asc
      limit $${limitIndex}
    `,
    values,
  );

  return {
    points: result.rows.slice(0, input.limit),
    truncated: result.rows.length > input.limit,
  };
}

function buildOrganizerMapWhere(input: Omit<OrganizerMapFilterInput, "bbox" | "limit">): {
  whereSql: string;
  values: unknown[];
} {
  const whereParts: string[] = ["o.status = 'published'"];
  const values: unknown[] = [];

  if (input.q) {
    values.push(`%${input.q}%`);
    const idx = values.length;
    whereParts.push(`(o.name ilike $${idx} or o.slug ilike $${idx})`);
  }

  if (input.tags?.length) {
    values.push(input.tags);
    whereParts.push(`o.tags && $${values.length}::text[]`);
  }

  if (input.languages?.length) {
    values.push(input.languages);
    whereParts.push(`
      (
        o.languages && $${values.length}::text[]
        or exists (
          select 1
          from event_organizers eo
          join events e on e.id = eo.event_id
          where eo.organizer_id = o.id
            and e.status = 'published'
            and e.languages && $${values.length}::text[]
        )
      )
    `);
  }

  if (input.roleKeys?.length) {
    values.push(input.roleKeys);
    whereParts.push(`
      exists (
        select 1
        from event_organizers eo
        join events e on e.id = eo.event_id and e.status = 'published'
        join organizer_roles r on r.id = eo.role_id
        where eo.organizer_id = o.id
          and r.key = any($${values.length}::text[])
      )
    `);
  }

  if (input.practiceCategoryIds?.length) {
    values.push(input.practiceCategoryIds);
    whereParts.push(`
      exists (
        select 1
        from event_organizers eo
        join events e on e.id = eo.event_id and e.status = 'published'
        where eo.organizer_id = o.id
          and e.practice_category_id = any($${values.length}::uuid[])
      )
    `);
  }

  const normalizedCountryCodes = (input.countryCodes ?? [])
    .map((value) => value.toLowerCase())
    .filter(Boolean);
  if (normalizedCountryCodes.length === 1) {
    values.push(normalizedCountryCodes[0]);
    whereParts.push(`lower(o.country_code) = $${values.length}`);
  } else if (normalizedCountryCodes.length > 1) {
    values.push(normalizedCountryCodes);
    whereParts.push(`lower(o.country_code) = any($${values.length}::text[])`);
  }

  const normalizedCities = (input.city ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (normalizedCities.length === 1) {
    values.push(normalizedCities[0]);
    whereParts.push(`lower(o.city) = $${values.length}`);
  } else if (normalizedCities.length > 1) {
    values.push(normalizedCities);
    whereParts.push(`lower(o.city) = any($${values.length}::text[])`);
  }

  return {
    whereSql: whereParts.join(" and "),
    values,
  };
}

export async function fetchOrganizerMapPoints(pool: Pool, input: OrganizerMapFilterInput) {
  const { whereSql, values } = buildOrganizerMapWhere(input);
  values.push(input.bbox.west, input.bbox.south, input.bbox.east, input.bbox.north);
  const westIndex = values.length - 3;
  const southIndex = values.length - 2;
  const eastIndex = values.length - 1;
  const northIndex = values.length;
  values.push(input.limit + 1);
  const limitIndex = values.length;

  const result = await pool.query<{
    organizer_id: string;
    organizer_slug: string;
    lat: number;
    lng: number;
  }>(
    `
      select distinct on (o.id)
        o.id as organizer_id,
        o.slug as organizer_slug,
        st_y(ol.geom::geometry) as lat,
        st_x(ol.geom::geometry) as lng
      from organizers o
      join organizer_locations ol on ol.organizer_id = o.id
      where ${whereSql}
        and ol.geom is not null
        and st_intersects(
          ol.geom::geometry,
          ST_MakeEnvelope($${westIndex}, $${southIndex}, $${eastIndex}, $${northIndex}, 4326)
        )
      order by o.id, ol.created_at desc
      limit $${limitIndex}
    `,
    values,
  );

  return {
    points: result.rows.slice(0, input.limit),
    truncated: result.rows.length > input.limit,
  };
}
