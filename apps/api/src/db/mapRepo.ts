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
  attendanceModes?: Array<"in_person" | "online" | "hybrid">;
  eventFormatIds?: string[];
  organizerId?: string;
  countryCode?: string;
  city?: string;
  geoLat?: number;
  geoLng?: number;
  geoRadius?: number;
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
  if (input.eventFormatIds?.length === 1) {
    values.push(input.eventFormatIds[0]);
    where.push(`e.event_format_id = $${values.length}::uuid`);
  } else if (input.eventFormatIds && input.eventFormatIds.length > 1) {
    values.push(input.eventFormatIds);
    where.push(`e.event_format_id = any($${values.length}::uuid[])`);
  }
  if (input.attendanceModes?.length === 1) {
    values.push(input.attendanceModes[0]);
    where.push(`e.attendance_mode = $${values.length}`);
  } else if (input.attendanceModes && input.attendanceModes.length > 1) {
    values.push(input.attendanceModes);
    where.push(`e.attendance_mode = any($${values.length}::text[])`);
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
  if (input.geoLat != null && input.geoLng != null && input.geoRadius != null) {
    values.push(input.geoLng, input.geoLat, input.geoRadius);
    where.push(
      `ST_DWithin(eo.geom, ST_SetSRID(ST_MakePoint($${values.length - 2}, $${values.length - 1}), 4326)::geography, $${values.length})`,
    );
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
          join events e on e.id = eo.event_id and e.status = 'published'
          where eo.organizer_id = o.id
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
        from organizer_profile_roles opr
        join organizer_roles r on r.id = opr.role_id
        where opr.organizer_id = o.id
          and r.key = any($${values.length}::text[])
      )
    `);
  }

  if (input.practiceCategoryIds?.length) {
    values.push(input.practiceCategoryIds);
    whereParts.push(`
      (
        exists (
          select 1
          from organizer_practices op
          where op.organizer_id = o.id
            and op.practice_id = any($${values.length}::uuid[])
        )
        or exists (
          select 1
          from event_organizers eo
          join events e on e.id = eo.event_id and e.status = 'published'
          where eo.organizer_id = o.id
            and e.practice_category_id = any($${values.length}::uuid[])
        )
      )
    `);
  }

  return {
    whereSql: whereParts.join(" and "),
    values,
  };
}

export async function fetchOrganizerMapPoints(pool: Pool, input: OrganizerMapFilterInput) {
  const { whereSql, values } = buildOrganizerMapWhere(input);
  const normalizedCountryCodes = (input.countryCodes ?? [])
    .map((value) => value.toLowerCase())
    .filter(Boolean);
  const normalizedCities = (input.city ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  values.push(normalizedCountryCodes);
  const countryFilterIndex = values.length;
  values.push(normalizedCities);
  const cityFilterIndex = values.length;
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
    organizer_name: string;
    practice_labels: string[];
    lat: number;
    lng: number;
  }>(
    `
      with filtered_organizers as (
        select
          o.id as organizer_id,
          o.slug as organizer_slug,
          o.name as organizer_name
        from organizers o
        where ${whereSql}
      ),
      latest_profile_points as (
        select
          ol.organizer_id,
          ol.geom::geometry as geom
        from (
          select
            ol.organizer_id,
            ol.geom,
            row_number() over (
              partition by ol.organizer_id
              order by ol.created_at desc, ol.id desc
            ) as rn
          from organizer_locations ol
          join filtered_organizers fo on fo.organizer_id = ol.organizer_id
          where ol.geom is not null
            and (
              cardinality($${countryFilterIndex}::text[]) = 0
              or lower(coalesce(ol.country_code, '')) = any($${countryFilterIndex}::text[])
            )
            and (
              cardinality($${cityFilterIndex}::text[]) = 0
              or lower(coalesce(ol.city, '')) = any($${cityFilterIndex}::text[])
            )
            and st_intersects(
              ol.geom::geometry,
              ST_MakeEnvelope($${westIndex}, $${southIndex}, $${eastIndex}, $${northIndex}, 4326)
            )
        ) ol
        where ol.rn = 1
      ),
      selected_points as (
        select organizer_id, geom from latest_profile_points
      ),
      practice_meta as (
        select
          practices_union.organizer_id,
          array_agg(distinct practices_union.practice_label order by practices_union.practice_label) as practice_labels
        from (
          select
            op.organizer_id,
            p.label as practice_label
          from organizer_practices op
          join practices p on p.id = op.practice_id

          union

          select
            eo.organizer_id,
            p.label as practice_label
          from event_organizers eo
          join events e on e.id = eo.event_id and e.status = 'published'
          join practices p on p.id = e.practice_category_id
        ) practices_union
        group by practices_union.organizer_id
      )
      select
        fo.organizer_id,
        fo.organizer_slug,
        fo.organizer_name,
        coalesce(pm.practice_labels, '{}'::text[]) as practice_labels,
        st_y(sp.geom) as lat,
        st_x(sp.geom) as lng
      from filtered_organizers fo
      join selected_points sp on sp.organizer_id = fo.organizer_id
      left join practice_meta pm on pm.organizer_id = fo.organizer_id
      order by
        fo.organizer_name asc
      limit $${limitIndex}
    `,
    values,
  );

  return {
    points: result.rows.slice(0, input.limit),
    truncated: result.rows.length > input.limit,
  };
}
