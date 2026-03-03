import type { Pool } from "pg";

export type MapFilterInput = {
  q?: string;
  from: string;
  to: string;
  practiceCategoryId?: string;
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

function buildWhere(input: Omit<MapFilterInput, "bbox">): { whereSql: string; values: unknown[] } {
  const values: unknown[] = [];
  const where: string[] = [
    "e.status = 'published'",
    "eo.status = 'published'",
    "eo.starts_at_utc >= $1::timestamptz",
    "eo.starts_at_utc <= $2::timestamptz",
  ];

  values.push(input.from, input.to);

  if (input.practiceCategoryId) {
    values.push(input.practiceCategoryId);
    where.push(`e.practice_category_id = $${values.length}::uuid`);
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
    lat: number;
    lng: number;
  }>(
    `
      select
        eo.id as occurrence_id,
        e.slug as event_slug,
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
