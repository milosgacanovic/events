import type { Pool } from "pg";

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
