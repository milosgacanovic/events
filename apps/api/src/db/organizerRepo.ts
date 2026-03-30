import type { CreateOrganizerInput, UpdateOrganizerInput } from "@dr-events/shared";
import type { Pool, PoolClient } from "pg";

import { generateUniqueSlug } from "../utils/slug";

type OrganizerRow = {
  id: string;
  slug: string;
  name: string;
  external_source: string | null;
  external_id: string | null;
  description_json: Record<string, unknown>;
  description_html: string | null;
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

type OrganizerLocationInput = {
  id?: string;
  externalSource?: string | null;
  externalId?: string | null;
  isPrimary?: boolean;
  label?: string | null;
  formattedAddress?: string | null;
  city?: string | null;
  countryCode?: string | null;
  lat?: number | null;
  lng?: number | null;
  provider?: string | null;
  placeId?: string | null;
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
  showArchived?: boolean;
  page: number;
  pageSize: number;
};

function normalizeDescriptionHtml(input: CreateOrganizerInput | UpdateOrganizerInput): string | null | undefined {
  if (input.descriptionHtml !== undefined) {
    return input.descriptionHtml?.trim() || null;
  }
  return undefined;
}

function normalizeLocations(
  input: CreateOrganizerInput | UpdateOrganizerInput,
): OrganizerLocationInput[] | undefined {
  if (input.locations) {
    return input.locations.map((location: OrganizerLocationInput) => ({
      ...location,
      countryCode: location.countryCode?.toLowerCase() ?? null,
      label: location.label?.trim() || null,
      formattedAddress: location.formattedAddress?.trim() || null,
      city: location.city?.trim() || null,
      provider: location.provider?.trim() || null,
      placeId: location.placeId?.trim() || null,
      externalSource: location.externalSource?.trim() || null,
      externalId: location.externalId?.trim() || null,
    }));
  }
  if (input.primaryLocation !== undefined) {
    if (input.primaryLocation === null) {
      return [];
    }
    return [{
      isPrimary: true,
      label: input.primaryLocation.label?.trim() || null,
      formattedAddress: input.primaryLocation.formattedAddress?.trim() || null,
      city: input.primaryLocation.city?.trim() || null,
      countryCode: input.primaryLocation.countryCode?.trim().toLowerCase() || null,
      lat: input.primaryLocation.lat ?? null,
      lng: input.primaryLocation.lng ?? null,
      provider: null,
      placeId: null,
      externalSource: null,
      externalId: null,
    }];
  }
  return undefined;
}

function buildOrganizerWhere(filters: Omit<OrganizerSearchInput, "page" | "pageSize">): {
  whereSql: string;
  values: unknown[];
} {
  const whereParts: string[] = [
    filters.showArchived
      ? "o.status in ('published', 'archived')"
      : "o.status = 'published'",
  ];
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
    whereParts.push(`o.languages && $${values.length}::text[]`);
  }

  if (filters.roleKeys?.length) {
    values.push(filters.roleKeys);
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

  if (filters.practiceCategoryIds?.length) {
    values.push(filters.practiceCategoryIds);
    whereParts.push(`
      exists (
        select 1
        from organizer_practices op
        where op.organizer_id = o.id
          and op.practice_id = any($${values.length}::uuid[])
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
    whereParts.push(`(lower(o.city) = $${values.length} or exists (
      select 1 from organizer_locations ol
      where ol.organizer_id = o.id and lower(ol.city) = $${values.length}
    ))`);
  } else if (normalizedCities.length > 1) {
    values.push(normalizedCities);
    whereParts.push(`(lower(o.city) = any($${values.length}::text[]) or exists (
      select 1 from organizer_locations ol
      where ol.organizer_id = o.id and lower(ol.city) = any($${values.length}::text[])
    ))`);
  }

  return {
    whereSql: whereParts.join(" and "),
    values,
  };
}

type FacetsRow = {
  role_facets: Record<string, number> | null;
  language_facets: Record<string, number> | null;
  practice_facets: Record<string, number> | null;
  country_facets: Record<string, number> | null;
  city_facets: Record<string, number> | null;
  tag_facets: Record<string, number> | null;
};

export async function searchOrganizers(pool: Pool, input: OrganizerSearchInput) {
  const page = Math.max(input.page, 1);
  const pageSize = Math.min(Math.max(input.pageSize, 1), 50);
  const offset = (page - 1) * pageSize;

  const { whereSql, values } = buildOrganizerWhere(input);

  // Two parallel queries: page rows (with total count) + all facets combined
  const [rows, facetsResult] = await Promise.all([
    pool.query<OrganizerRow & { total_count: string; role_keys: string[]; practice_category_ids: string[] }>(
      `
        select
          o.*,
          page.total_count,
          coalesce(profile_role_meta.role_keys, '{}'::text[]) as role_keys,
          coalesce(profile_practice_meta.practice_category_ids, '{}'::text[]) as practice_category_ids
        from (
          select id, count(*) over() as total_count from organizers o
          where ${whereSql}
          order by o.name asc
          limit $${values.length + 1}
          offset $${values.length + 2}
        ) page
        join organizers o on o.id = page.id
        left join lateral (
          select array_agg(distinct r.key order by r.key) as role_keys
          from organizer_profile_roles opr
          join organizer_roles r on r.id = opr.role_id
          where opr.organizer_id = o.id
        ) profile_role_meta on true
        left join lateral (
          select array_agg(distinct op.practice_id::text order by op.practice_id::text) as practice_category_ids
          from organizer_practices op
          where op.organizer_id = o.id
        ) profile_practice_meta on true
        order by o.name asc
      `,
      [...values, pageSize, offset],
    ),
    pool.query<FacetsRow>(
      `
        with filtered as (
          select o.id, o.languages, o.tags, o.country_code, o.city
          from organizers o
          where ${whereSql}
        ),
        profile_role_data as (
          select opr.organizer_id, r.key as role_key
          from filtered f
          join organizer_profile_roles opr on opr.organizer_id = f.id
          join organizer_roles r on r.id = opr.role_id
        ),
        profile_practice_data as (
          select op.organizer_id, op.practice_id::text as practice_id
          from filtered f
          join organizer_practices op on op.organizer_id = f.id
        )
        select
          (select coalesce(json_object_agg(role_key, cnt), '{}') from (select role_key, count(distinct organizer_id) as cnt from profile_role_data group by role_key) x) as role_facets,
          (select coalesce(json_object_agg(language, cnt), '{}') from (select language, count(*) as cnt from filtered cross join unnest(languages) as language group by language) x) as language_facets,
          (select coalesce(json_object_agg(practice_id, cnt), '{}') from (select practice_id, count(distinct organizer_id) as cnt from profile_practice_data where practice_id is not null group by practice_id) x) as practice_facets,
          (select coalesce(json_object_agg(cc, cnt), '{}') from (select lower(country_code) as cc, count(*) as cnt from filtered where country_code is not null group by lower(country_code)) x) as country_facets,
          (select coalesce(json_object_agg(city, cnt), '{}') from (select lower(city) as city, count(*) as cnt from filtered where city is not null and city <> '' group by lower(city)) x) as city_facets,
          (select coalesce(json_object_agg(tag, cnt), '{}') from (select tag, count(*) as cnt from filtered cross join unnest(tags) as tag group by tag) x) as tag_facets
      `,
      values,
    ),
  ]);

  const totalCount = Number(rows.rows[0]?.total_count ?? "0");
  const facets = facetsResult.rows[0] ?? {};

  return {
    items: rows.rows,
    total: totalCount,
    facets: {
      roleKey: (facets.role_facets ?? {}) as Record<string, number>,
      languages: (facets.language_facets ?? {}) as Record<string, number>,
      practiceCategoryId: (facets.practice_facets ?? {}) as Record<string, number>,
      tags: (facets.tag_facets ?? {}) as Record<string, number>,
      countryCode: (facets.country_facets ?? {}) as Record<string, number>,
      city: (facets.city_facets ?? {}) as Record<string, number>,
    },
    pagination: {
      page,
      pageSize,
      totalPages: Math.max(Math.ceil(totalCount / pageSize), 1),
    },
  };
}

export async function getOrganizerBySlug(
  pool: Pool,
  slug: string,
  options?: {
    includeNonPublic?: boolean;
  },
) {
  const includeNonPublic = options?.includeNonPublic ?? false;
  const organizer = await pool.query<OrganizerRow>(
    `
      select * from organizers
      where slug = $1
        and (
          status = 'published'
          or ($2::boolean = true and status in ('draft', 'archived'))
        )
    `,
    [slug, includeNonPublic],
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
    cover_image_url: string | null;
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
        e.title as event_title,
        e.cover_image_path as cover_image_url
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
    cover_image_url: string | null;
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
        e.title as event_title,
        e.cover_image_path as cover_image_url
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
    is_primary: boolean;
    external_source: string | null;
    external_id: string | null;
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
        ol.is_primary,
        ol.external_source,
        ol.external_id,
        ol.label,
        ol.formatted_address,
        ol.country_code,
        ol.city,
        st_y(ol.geom::geometry) as lat,
        st_x(ol.geom::geometry) as lng
      from organizer_locations ol
      where ol.organizer_id = $1
      order by ol.is_primary desc, ol.created_at desc
      limit 5
    `,
    [organizer.rows[0].id],
  );

  const practiceCategories = await pool.query<{ practice_category_id: string }>(
    `
      select op.practice_id::text as practice_category_id
      from organizer_practices op
      where op.organizer_id = $1
    `,
    [organizer.rows[0].id],
  );

  const roleKeys = await pool.query<{ role_key: string }>(
    `
      select r.key as role_key
      from organizer_profile_roles opr
      join organizer_roles r on r.id = opr.role_id
      where opr.organizer_id = $1
    `,
    [organizer.rows[0].id],
  );

  return {
    organizer: {
      ...organizer.rows[0],
      role_keys: roleKeys.rows.map((row) => row.role_key),
    },
    locations: locations.rows,
    upcomingOccurrences: upcoming.rows,
    pastOccurrences: past.rows,
    practiceCategoryIds: practiceCategories.rows.map((row) => row.practice_category_id),
  };
}

export async function createOrganizer(pool: Pool, input: CreateOrganizerInput) {
  const slug = input.slug || await generateUniqueSlug(pool, "organizers", input.name);
  const imageUrl = input.imageUrl ?? input.avatarPath ?? null;
  const locationCity = input.primaryLocation?.city ?? input.city ?? null;
  const locationCountryCode = input.primaryLocation?.countryCode ?? input.countryCode ?? null;
  const normalizedLocations = normalizeLocations(input);
  const normalizedDescriptionHtml = normalizeDescriptionHtml(input);
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await client.query<OrganizerRow>(
    `
      insert into organizers (
        slug,
        name,
        external_source,
        external_id,
        description_json,
        description_html,
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
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      returning *
    `,
    [
      slug,
      input.name,
      input.externalSource ?? null,
      input.externalId ?? null,
      JSON.stringify(input.descriptionJson ?? {}),
      normalizedDescriptionHtml ?? null,
      input.websiteUrl ?? null,
      input.externalUrl ?? null,
      input.tags,
      input.languages,
      locationCity,
      locationCountryCode?.toLowerCase() ?? null,
      imageUrl,
      input.avatarPath ?? imageUrl,
      input.status,
    ],
  );
    const created = result.rows[0];
    await syncOrganizerProfileRoles(client, created.id, input.profileRoleIds);
    await syncOrganizerPractices(client, created.id, input.practiceCategoryIds);
    await syncOrganizerLocations(client, created.id, normalizedLocations, input.primaryLocationId);
    await client.query("commit");
    return created;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
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
  const locationCity = input.primaryLocation?.city ?? input.city;
  const locationCountryCode = input.primaryLocation?.countryCode ?? input.countryCode;
  const normalizedLocations = normalizeLocations(input);
  const normalizedDescriptionHtml = normalizeDescriptionHtml(input);
  const fields: Record<string, unknown> = {
    name: input.name,
    external_source: input.externalSource,
    external_id: input.externalId,
    description_json: input.descriptionJson ? JSON.stringify(input.descriptionJson) : undefined,
    description_html: normalizedDescriptionHtml,
    website_url: input.websiteUrl,
    external_url: input.externalUrl,
    tags: input.tags,
    languages: input.languages,
    city: locationCity,
    country_code: locationCountryCode?.toLowerCase(),
    image_url: imageUrl,
    avatar_path: input.avatarPath ?? imageUrl,
    status: input.status,
  };

  if (input.name) {
    fields.slug = await generateUniqueSlug(pool, "organizers", input.name, id);
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    const { sql, values } = buildUpdateStatement("organizers", id, fields);
    const result = await client.query<OrganizerRow>(sql, values);
    const updated = result.rows[0] ?? null;
    if (!updated) {
      await client.query("rollback");
      return null;
    }
    await syncOrganizerProfileRoles(client, id, input.profileRoleIds);
    await syncOrganizerPractices(client, id, input.practiceCategoryIds);
    await syncOrganizerLocations(client, id, normalizedLocations, input.primaryLocationId);
    await client.query("commit");
    return updated;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function syncOrganizerLocations(
  client: PoolClient,
  organizerId: string,
  locations: OrganizerLocationInput[] | undefined,
  primaryLocationId: string | null | undefined,
) {
  if (locations === undefined) {
    return;
  }
  if (locations.length === 0) {
    await client.query("delete from organizer_locations where organizer_id = $1", [organizerId]);
    return;
  }

  const filtered = locations.filter((location) => Boolean(
    location.label?.trim()
      || location.formattedAddress?.trim()
      || location.city?.trim()
      || location.countryCode?.trim()
      || (location.lat !== undefined && location.lat !== null)
      || (location.lng !== undefined && location.lng !== null),
  ));
  if (filtered.length === 0) {
    await client.query("delete from organizer_locations where organizer_id = $1", [organizerId]);
    return;
  }

  const explicitPrimaryId = primaryLocationId ?? null;
  let primaryResolved = false;

  await client.query("delete from organizer_locations where organizer_id = $1", [organizerId]);
  for (let index = 0; index < filtered.length; index += 1) {
    const location = filtered[index];
    const isPrimary = explicitPrimaryId
      ? location.id === explicitPrimaryId
      : (!primaryResolved && (location.isPrimary || index === 0));
    if (isPrimary) {
      primaryResolved = true;
    }
    await client.query(
      `
        insert into organizer_locations (
          organizer_id,
          external_source,
          external_id,
          is_primary,
          label,
          formatted_address,
          city,
          country_code,
          provider,
          place_id,
          verified_at,
          geom
        )
        values (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          case
            when $11::double precision is not null and $12::double precision is not null
              then now()
            else null
          end,
          case
            when $11::double precision is not null and $12::double precision is not null
              then st_setsrid(st_makepoint($12::double precision, $11::double precision), 4326)::geography
            else null
          end
        )
      `,
      [
        organizerId,
        location.externalSource ?? null,
        location.externalId ?? null,
        isPrimary,
        location.label?.trim() || null,
        location.formattedAddress?.trim() || null,
        location.city?.trim() || null,
        location.countryCode?.trim().toLowerCase() || null,
        location.provider?.trim() || null,
        location.placeId?.trim() || null,
        location.lat ?? null,
        location.lng ?? null,
      ],
    );
  }
}

async function syncOrganizerProfileRoles(
  client: PoolClient,
  organizerId: string,
  roleIds: string[] | undefined,
) {
  if (!roleIds) {
    return;
  }
  await client.query("delete from organizer_profile_roles where organizer_id = $1", [organizerId]);
  for (let index = 0; index < roleIds.length; index += 1) {
    await client.query(
      `
        insert into organizer_profile_roles (organizer_id, role_id, display_order)
        values ($1, $2, $3)
      `,
      [organizerId, roleIds[index], index],
    );
  }
}

async function syncOrganizerPractices(
  client: PoolClient,
  organizerId: string,
  practiceIds: string[] | undefined,
) {
  if (!practiceIds) {
    return;
  }
  await client.query("delete from organizer_practices where organizer_id = $1", [organizerId]);
  for (let index = 0; index < practiceIds.length; index += 1) {
    await client.query(
      `
        insert into organizer_practices (organizer_id, practice_id, display_order)
        values ($1, $2, $3)
      `,
      [organizerId, practiceIds[index], index],
    );
  }
}

export async function getOrganizerRelated(pool: Pool, id: string) {
  const [events, locations, roles, practices, alerts] = await Promise.all([
    pool.query<{ event_id: string; slug: string; title: string; status: string }>(
      `select eo.event_id, e.slug, e.title, e.status
       from event_organizers eo
       join events e on e.id = eo.event_id
       where eo.organizer_id = $1
       order by e.title`,
      [id],
    ),
    pool.query<{ id: string; label: string | null; city: string | null; country_code: string | null }>(
      `select id, label, city, country_code from organizer_locations where organizer_id = $1 order by is_primary desc, created_at`,
      [id],
    ),
    pool.query<{ key: string; label: string }>(
      `select r.key, r.label from organizer_profile_roles opr join organizer_roles r on r.id = opr.role_id where opr.organizer_id = $1`,
      [id],
    ),
    pool.query<{ practice_id: string }>(
      `select practice_id::text from organizer_practices where organizer_id = $1`,
      [id],
    ),
    pool.query<{ count: string }>(
      `select count(*)::text as count from user_alerts where organizer_id = $1`,
      [id],
    ),
  ]);

  return {
    events: events.rows.map((r) => ({ eventId: r.event_id, slug: r.slug, title: r.title, status: r.status })),
    locations: locations.rows,
    roles: roles.rows,
    practices: practices.rows.map((r) => r.practice_id),
    alertCount: Number(alerts.rows[0]?.count ?? 0),
  };
}

export async function deleteOrganizer(
  pool: Pool,
  id: string,
): Promise<{ found: boolean; affectedEventIds: string[] }> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const affected = await client.query<{ event_id: string }>(
      `select event_id from event_organizers where organizer_id = $1`,
      [id],
    );
    const affectedEventIds = affected.rows.map((r) => r.event_id);
    const result = await client.query(
      `delete from organizers where id = $1 returning id`,
      [id],
    );
    await client.query("commit");
    return { found: (result.rowCount ?? 0) > 0, affectedEventIds };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
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
