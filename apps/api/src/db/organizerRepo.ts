import type { CreateOrganizerInput, UpdateOrganizerInput } from "@dr-events/shared";
import type { Pool } from "pg";

import { generateUniqueSlug } from "../utils/slug";

type OrganizerRow = {
  id: string;
  slug: string;
  name: string;
  external_source: string | null;
  external_id: string | null;
  description_json: Record<string, unknown>;
  website_url: string | null;
  external_url: string | null;
  tags: string[];
  languages: string[];
  city: string | null;
  country_code: string | null;
  image_url: string | null;
  avatar_path: string | null;
  status: "published" | "draft" | "archived";
  created_at: string;
  updated_at: string;
};

export type OrganizerSearchInput = {
  q?: string;
  tags?: string[];
  languages?: string[];
  roleKeys?: string[];
  practiceCategoryIds?: string[];
  countryCode?: string;
  countryCodes?: string[];
  city?: string;
  page: number;
  pageSize: number;
};

function buildOrganizerWhere(filters: Omit<OrganizerSearchInput, "page" | "pageSize">): {
  whereSql: string;
  values: unknown[];
} {
  const whereParts: string[] = ["o.status = 'published'"];
  const values: unknown[] = [];

  if (filters.q) {
    values.push(`%${filters.q}%`);
    const idx = values.length;
    whereParts.push(`(o.name ilike $${idx} or o.slug ilike $${idx})`);
  }

  if (filters.tags?.length) {
    values.push(filters.tags);
    whereParts.push(`o.tags && $${values.length}::text[]`);
  }

  if (filters.languages?.length) {
    values.push(filters.languages);
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

  if (filters.roleKeys?.length) {
    values.push(filters.roleKeys);
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

  if (filters.practiceCategoryIds?.length) {
    values.push(filters.practiceCategoryIds);
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

  const normalizedCountryCodes = (
    filters.countryCodes?.length ? filters.countryCodes : filters.countryCode ? [filters.countryCode] : []
  )
    .map((value) => value.toLowerCase())
    .filter(Boolean);
  if (normalizedCountryCodes.length === 1) {
    values.push(normalizedCountryCodes[0]);
    whereParts.push(`lower(o.country_code) = $${values.length}`);
  } else if (normalizedCountryCodes.length > 1) {
    values.push(normalizedCountryCodes);
    whereParts.push(`lower(o.country_code) = any($${values.length}::text[])`);
  }

  const normalizedCities = (filters.city ?? "")
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

export async function searchOrganizers(pool: Pool, input: OrganizerSearchInput) {
  const page = Math.max(input.page, 1);
  const pageSize = Math.min(Math.max(input.pageSize, 1), 50);
  const offset = (page - 1) * pageSize;

  const { whereSql, values } = buildOrganizerWhere(input);

  const rows = await pool.query<
    OrganizerRow & {
      role_keys: string[];
      derived_languages: string[];
      practice_category_ids: string[];
    }
  >(
    `
      select
        o.*,
        coalesce(role_meta.role_keys, '{}'::text[]) as role_keys,
        coalesce(role_meta.derived_languages, '{}'::text[]) as derived_languages,
        coalesce(role_meta.practice_category_ids, '{}'::text[]) as practice_category_ids
      from organizers o
      left join lateral (
        select
          array_agg(distinct r.key order by r.key) as role_keys,
          array_remove(array_agg(distinct lower(ev_lang.language)), null) as derived_languages,
          array_agg(distinct e.practice_category_id::text order by e.practice_category_id::text) as practice_category_ids
        from event_organizers eo
        join organizer_roles r on r.id = eo.role_id
        join events e on e.id = eo.event_id and e.status = 'published'
        left join lateral unnest(e.languages) ev_lang(language) on true
        where eo.organizer_id = o.id
      ) role_meta on true
      where ${whereSql}
      order by o.name asc
      limit $${values.length + 1}
      offset $${values.length + 2}
    `,
    [...values, pageSize, offset],
  );

  const totalResult = await pool.query<{ count: string }>(
    `select count(*)::text as count from organizers o where ${whereSql}`,
    values,
  );

  const roleFacet = await pool.query<{ key: string; count: string }>(
    `
      with filtered as (
        select o.id
        from organizers o
        where ${whereSql}
      )
      select r.key, count(distinct f.id)::text as count
      from filtered f
      join event_organizers eo on eo.organizer_id = f.id
      join organizer_roles r on r.id = eo.role_id
      group by r.key
    `,
    values,
  );

  const languageFacet = await pool.query<{ language: string; count: string }>(
    `
      with filtered as (
        select coalesce(nullif(o.languages, '{}'::text[]), role_meta.derived_languages, '{}'::text[]) as languages
        from organizers o
        left join lateral (
          select array_remove(array_agg(distinct lower(ev_lang.language)), null) as derived_languages
          from event_organizers eo
          join events e on e.id = eo.event_id and e.status = 'published'
          left join lateral unnest(e.languages) ev_lang(language) on true
          where eo.organizer_id = o.id
        ) role_meta on true
        where ${whereSql}
      )
      select language, count(*)::text as count
      from filtered f
      cross join unnest(f.languages) language
      group by language
    `,
    values,
  );

  const practiceFacet = await pool.query<{ key: string; count: string }>(
    `
      with filtered as (
        select o.id
        from organizers o
        where ${whereSql}
      )
      select e.practice_category_id::text as key, count(distinct f.id)::text as count
      from filtered f
      join event_organizers eo on eo.organizer_id = f.id
      join events e on e.id = eo.event_id and e.status = 'published'
      where e.practice_category_id is not null
      group by e.practice_category_id::text
    `,
    values,
  );

  const countryFacet = await pool.query<{ country_code: string; count: string }>(
    `
      with filtered as (
        select o.id
        from organizers o
        where ${whereSql}
      )
      select lower(o.country_code) as country_code, count(distinct f.id)::text as count
      from filtered f
      join organizers o on o.id = f.id
      where o.country_code is not null
      group by lower(o.country_code)
    `,
    values,
  );

  const cityFacet = await pool.query<{ city: string; count: string }>(
    `
      with filtered as (
        select o.id
        from organizers o
        where ${whereSql}
      )
      select lower(o.city) as city, count(distinct f.id)::text as count
      from filtered f
      join organizers o on o.id = f.id
      where o.city is not null
        and o.city <> ''
      group by lower(o.city)
    `,
    values,
  );

  const tagFacet = await pool.query<{ tag: string; count: string }>(
    `
      with filtered as (
        select o.tags
        from organizers o
        where ${whereSql}
      )
      select tag, count(*)::text as count
      from filtered f
      cross join unnest(f.tags) tag
      group by tag
    `,
    values,
  );

  return {
    items: rows.rows,
    total: Number(totalResult.rows[0]?.count ?? "0"),
    facets: {
      roleKey: Object.fromEntries(roleFacet.rows.map((row) => [row.key, Number(row.count)])),
      languages: Object.fromEntries(
        languageFacet.rows.map((row) => [row.language, Number(row.count)]),
      ),
      practiceCategoryId: Object.fromEntries(
        practiceFacet.rows.map((row) => [row.key, Number(row.count)]),
      ),
      tags: Object.fromEntries(tagFacet.rows.map((row) => [row.tag, Number(row.count)])),
      countryCode: Object.fromEntries(
        countryFacet.rows.map((row) => [row.country_code, Number(row.count)]),
      ),
      city: Object.fromEntries(cityFacet.rows.map((row) => [row.city, Number(row.count)])),
    },
    pagination: {
      page,
      pageSize,
      totalPages: Math.max(Math.ceil(Number(totalResult.rows[0]?.count ?? "0") / pageSize), 1),
    },
  };
}

export async function getOrganizerBySlug(pool: Pool, slug: string) {
  const organizer = await pool.query<OrganizerRow>(
    `select * from organizers where slug = $1 and status = 'published'`,
    [slug],
  );

  if (!organizer.rowCount) {
    return null;
  }

  const upcoming = await pool.query<{
    occurrence_id: string;
    starts_at_utc: string;
    ends_at_utc: string;
    status: string;
    event_id: string;
    event_slug: string;
    event_title: string;
  }>(
    `
      select
        distinct
        eo.id as occurrence_id,
        eo.starts_at_utc,
        eo.ends_at_utc,
        eo.status,
        e.id as event_id,
        e.slug as event_slug,
        e.title as event_title
      from event_organizers rel
      join events e on e.id = rel.event_id
      join event_occurrences eo on eo.event_id = e.id
      where rel.organizer_id = $1
        and e.status in ('published', 'cancelled')
        and eo.starts_at_utc >= now()
      order by eo.starts_at_utc asc
      limit 20
    `,
    [organizer.rows[0].id],
  );

  const past = await pool.query<{
    occurrence_id: string;
    starts_at_utc: string;
    ends_at_utc: string;
    status: string;
    event_id: string;
    event_slug: string;
    event_title: string;
  }>(
    `
      select
        distinct
        eo.id as occurrence_id,
        eo.starts_at_utc,
        eo.ends_at_utc,
        eo.status,
        e.id as event_id,
        e.slug as event_slug,
        e.title as event_title
      from event_organizers rel
      join events e on e.id = rel.event_id
      join event_occurrences eo on eo.event_id = e.id
      where rel.organizer_id = $1
        and e.status in ('published', 'cancelled')
        and eo.starts_at_utc < now()
      order by eo.starts_at_utc desc
      limit 20
    `,
    [organizer.rows[0].id],
  );

  const locations = await pool.query<{
    id: string;
    label: string | null;
    formatted_address: string | null;
    country_code: string | null;
    city: string | null;
    lat: number | null;
    lng: number | null;
  }>(
    `
      select
        ol.id,
        ol.label,
        ol.formatted_address,
        ol.country_code,
        ol.city,
        st_y(ol.geom::geometry) as lat,
        st_x(ol.geom::geometry) as lng
      from organizer_locations ol
      where ol.organizer_id = $1
      order by ol.created_at desc
      limit 5
    `,
    [organizer.rows[0].id],
  );

  const practiceCategories = await pool.query<{ practice_category_id: string }>(
    `
      select distinct e.practice_category_id
      from event_organizers rel
      join events e on e.id = rel.event_id
      where rel.organizer_id = $1
        and e.status in ('published', 'cancelled')
    `,
    [organizer.rows[0].id],
  );

  return {
    organizer: organizer.rows[0],
    locations: locations.rows,
    upcomingOccurrences: upcoming.rows,
    pastOccurrences: past.rows,
    practiceCategoryIds: practiceCategories.rows.map((row) => row.practice_category_id),
  };
}

export async function createOrganizer(pool: Pool, input: CreateOrganizerInput) {
  const slug = await generateUniqueSlug(pool, "organizers", input.name);
  const imageUrl = input.imageUrl ?? input.avatarPath ?? null;

  const result = await pool.query<OrganizerRow>(
    `
      insert into organizers (
        slug,
        name,
        external_source,
        external_id,
        description_json,
        website_url,
        external_url,
        tags,
        languages,
        city,
        country_code,
        image_url,
        avatar_path,
        status
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      returning *
    `,
    [
      slug,
      input.name,
      input.externalSource ?? null,
      input.externalId ?? null,
      JSON.stringify(input.descriptionJson ?? {}),
      input.websiteUrl ?? null,
      input.externalUrl ?? null,
      input.tags,
      input.languages,
      input.city ?? null,
      input.countryCode?.toLowerCase() ?? null,
      imageUrl,
      input.avatarPath ?? imageUrl,
      input.status,
    ],
  );

  return result.rows[0];
}

function buildUpdateStatement(
  table: "organizers",
  id: string,
  fields: Record<string, unknown>,
): { sql: string; values: unknown[] } {
  const entries = Object.entries(fields).filter(([, value]) => value !== undefined);

  if (!entries.length) {
    return {
      sql: `select * from ${table} where id = $1`,
      values: [id],
    };
  }

  const values: unknown[] = [id];
  const setParts = entries.map(([key, value], index) => {
    values.push(value);
    return `${key} = $${index + 2}`;
  });

  return {
    sql: `update ${table} set ${setParts.join(", ")}, updated_at = now() where id = $1 returning *`,
    values,
  };
}

export async function updateOrganizer(pool: Pool, id: string, input: UpdateOrganizerInput) {
  const imageUrl = input.imageUrl ?? input.avatarPath;
  const fields: Record<string, unknown> = {
    name: input.name,
    external_source: input.externalSource,
    external_id: input.externalId,
    description_json: input.descriptionJson ? JSON.stringify(input.descriptionJson) : undefined,
    website_url: input.websiteUrl,
    external_url: input.externalUrl,
    tags: input.tags,
    languages: input.languages,
    city: input.city,
    country_code: input.countryCode?.toLowerCase(),
    image_url: imageUrl,
    avatar_path: input.avatarPath ?? imageUrl,
    status: input.status,
  };

  if (input.name) {
    fields.slug = await generateUniqueSlug(pool, "organizers", input.name, id);
  }

  const { sql, values } = buildUpdateStatement("organizers", id, fields);
  const result = await pool.query<OrganizerRow>(sql, values);
  return result.rows[0] ?? null;
}

export async function getOrganizerByExternalRef(
  pool: Pool,
  externalSource: string,
  externalId: string,
) {
  const result = await pool.query<OrganizerRow>(
    `
      select *
      from organizers
      where external_source = $1
        and external_id = $2
      limit 1
    `,
    [externalSource, externalId],
  );
  return result.rows[0] ?? null;
}
