import type { Pool } from "pg";

export async function listAdminEvents(
  pool: Pool,
  input: {
    q?: string;
    status?: "draft" | "published" | "cancelled" | "archived";
    showUnlisted?: boolean;
    externalSource?: string;
    externalId?: string;
    organizerId?: string;
    ownerFilter?: "all" | "unassigned" | "has_owner";
    page: number;
    pageSize: number;
  },
) {
  const page = Math.max(input.page, 1);
  const pageSize = Math.min(Math.max(input.pageSize, 1), 100);
  const offset = (page - 1) * pageSize;

  const whereParts: string[] = [];
  const values: unknown[] = [];

  if (input.q) {
    values.push(`%${input.q}%`);
    const idx = values.length;
    whereParts.push(`(e.title ilike $${idx} or e.slug ilike $${idx})`);
  }

  if (input.status) {
    values.push(input.status);
    whereParts.push(`e.status = $${values.length}`);
  }
  if (!input.showUnlisted) {
    whereParts.push("e.visibility = 'public'");
  }

  if (input.externalSource && input.externalId) {
    values.push(input.externalSource);
    whereParts.push(`e.external_source = $${values.length}`);
    values.push(input.externalId);
    whereParts.push(`e.external_id = $${values.length}`);
  }

  if (input.organizerId) {
    values.push(input.organizerId);
    whereParts.push(`exists(select 1 from event_organizers eo2 where eo2.event_id = e.id and eo2.organizer_id = $${values.length})`);
  }

  if (input.ownerFilter === "unassigned") {
    whereParts.push(`e.created_by_user_id IS NULL AND NOT EXISTS(SELECT 1 FROM event_users eu WHERE eu.event_id = e.id)`);
  } else if (input.ownerFilter === "has_owner") {
    whereParts.push(`(e.created_by_user_id IS NOT NULL OR EXISTS(SELECT 1 FROM event_users eu WHERE eu.event_id = e.id))`);
  }

  const whereSql = whereParts.length ? `where ${whereParts.join(" and ")}` : "";

  const [itemsResult, totalResult] = await Promise.all([
    pool.query<{
      id: string;
      slug: string;
      title: string;
      external_source: string | null;
      external_id: string | null;
      externalSource: string | null;
      externalId: string | null;
      is_imported: boolean;
      import_source: string | null;
      isImported: boolean;
      importSource: string | null;
      detached_from_import: boolean;
      status: string;
      attendance_mode: string;
      schedule_kind: string;
      event_format_id: string | null;
      updated_at: string;
      published_at: string | null;
      practice_category_label: string | null;
      event_format_label: string | null;
      location_city: string | null;
      location_country: string | null;
      next_occurrence: string | null;
      host_names: string | null;
      created_by_name: string | null;
    }>(
      `
        select
          e.id,
          e.slug,
          e.title,
          e.external_source,
          e.external_id,
          e.external_source as "externalSource",
          e.external_id as "externalId",
          e.is_imported,
          e.import_source,
          e.is_imported as "isImported",
          e.import_source as "importSource",
          e.detached_from_import,
          e.status,
          e.attendance_mode,
          e.schedule_kind,
          e.event_format_id,
          e.updated_at,
          e.published_at,
          pc.label as practice_category_label,
          ef.label as event_format_label,
          loc_sub.city as location_city,
          loc_sub.country_code as location_country,
          next_occ.starts_at as next_occurrence,
          hosts_sub.host_names,
          u.display_name as created_by_name
        from events e
        left join practices pc on pc.id = e.practice_category_id
        left join event_formats ef on ef.id = e.event_format_id
        left join lateral (
          select l.city, l.country_code
          from event_locations el
          join locations l on l.id = el.location_id
          where el.event_id = e.id
          limit 1
        ) loc_sub on true
        left join lateral (
          select string_agg(o.name, ', ' order by eo.display_order) as host_names
          from event_organizers eo
          join organizers o on o.id = eo.organizer_id
          where eo.event_id = e.id
        ) hosts_sub on true
        left join lateral (
          select oc.starts_at_utc
          from event_occurrences oc
          where oc.event_id = e.id and oc.starts_at_utc > now()
          order by oc.starts_at_utc
          limit 1
        ) next_occ on true
        left join users u on u.id = e.created_by_user_id
        ${whereSql}
        order by e.updated_at desc
        limit $${values.length + 1}
        offset $${values.length + 2}
      `,
      [...values, pageSize, offset],
    ),
    pool.query<{ count: string }>(`select count(*)::text as count from events e ${whereSql}`, values),
  ]);

  const total = Number(totalResult.rows[0]?.count ?? "0");

  return {
    items: itemsResult.rows,
    pagination: {
      page,
      pageSize,
      totalPages: Math.max(Math.ceil(total / pageSize), 1),
      totalItems: total,
    },
  };
}

export async function listAdminOrganizers(
  pool: Pool,
  input: {
    q?: string;
    status?: "draft" | "published" | "archived";
    showArchived?: boolean;
    practiceCategoryId?: string;
    profileRoleId?: string;
    countryCode?: string;
    page: number;
    pageSize: number;
  },
) {
  const page = Math.max(input.page, 1);
  const pageSize = Math.min(Math.max(input.pageSize, 1), 100);
  const offset = (page - 1) * pageSize;

  const whereParts: string[] = [];
  const values: unknown[] = [];

  if (input.q) {
    values.push(`%${input.q}%`);
    const idx = values.length;
    whereParts.push(`(o.name ilike $${idx} or o.slug ilike $${idx})`);
  }

  if (input.status) {
    values.push(input.status);
    whereParts.push(`o.status = $${values.length}`);
  }

  if (input.practiceCategoryId) {
    values.push(input.practiceCategoryId);
    whereParts.push(`EXISTS(SELECT 1 FROM organizer_practices op WHERE op.organizer_id = o.id AND op.practice_id = $${values.length})`);
  }

  if (input.profileRoleId) {
    values.push(input.profileRoleId);
    whereParts.push(`EXISTS(SELECT 1 FROM organizer_profile_roles opr WHERE opr.organizer_id = o.id AND opr.role_id = $${values.length})`);
  }

  if (input.countryCode) {
    values.push(input.countryCode);
    whereParts.push(`o.country_code = $${values.length}`);
  }

  const whereSql = whereParts.length ? `where ${whereParts.join(" and ")}` : "";

  const [itemsResult, totalResult] = await Promise.all([
    pool.query<{
      id: string;
      slug: string;
      name: string;
      status: string;
      updated_at: string;
      managed_by_names: string | null;
      city: string | null;
      country_code: string | null;
      practice_labels: string | null;
      role_labels: string | null;
      event_count: string | null;
    }>(
      `
        select
          o.id,
          o.slug,
          o.name,
          o.status,
          o.updated_at,
          o.city,
          o.country_code,
          mgr.managed_by_names,
          practice_sub.practice_labels,
          role_sub.role_labels,
          event_count_sub.event_count
        from organizers o
        left join lateral (
          select string_agg(u.display_name, ', ') as managed_by_names
          from host_users hu
          join users u on u.id = hu.user_id
          where hu.organizer_id = o.id
        ) mgr on true
        left join lateral (
          select string_agg(p.label, ', ' order by p.sort_order) as practice_labels
          from organizer_practices op
          join practices p on p.id = op.practice_id
          where op.organizer_id = o.id
        ) practice_sub on true
        left join lateral (
          select string_agg(r.label, ', ') as role_labels
          from organizer_profile_roles opr
          join organizer_roles r on r.id = opr.role_id
          where opr.organizer_id = o.id
        ) role_sub on true
        left join lateral (
          select count(*)::text as event_count
          from event_organizers eo
          where eo.organizer_id = o.id
        ) event_count_sub on true
        ${whereSql}
        order by lower(o.name) asc
        limit $${values.length + 1}
        offset $${values.length + 2}
      `,
      [...values, pageSize, offset],
    ),
    pool.query<{ count: string }>(
      `select count(*)::text as count from organizers o ${whereSql}`,
      values,
    ),
  ]);

  const total = Number(totalResult.rows[0]?.count ?? "0");

  return {
    items: itemsResult.rows,
    pagination: {
      page,
      pageSize,
      totalPages: Math.max(Math.ceil(total / pageSize), 1),
      totalItems: total,
    },
  };
}

export async function getAdminEventById(pool: Pool, eventId: string) {
  const eventResult = await pool.query<{
    id: string;
    slug: string;
    title: string;
    description_json: Record<string, unknown>;
    external_source: string | null;
    external_id: string | null;
    externalSource: string | null;
    externalId: string | null;
    is_imported: boolean;
    import_source: string | null;
    isImported: boolean;
    importSource: string | null;
    cover_image_path: string | null;
    external_url: string | null;
    attendance_mode: "in_person" | "online" | "hybrid";
    online_url: string | null;
    practice_category_id: string;
    practice_subcategory_id: string | null;
    event_format_id: string | null;
    tags: string[];
    languages: string[];
    schedule_kind: "single" | "recurring";
    event_timezone: string;
    single_start_at: string | null;
    single_end_at: string | null;
    rrule: string | null;
    rrule_dtstart_local: string | null;
    duration_minutes: number | null;
    status: "draft" | "published" | "cancelled" | "archived";
    visibility: "public" | "unlisted";
    detached_from_import: boolean;
    detached_at: string | null;
    detached_by_user_id: string | null;
    created_by_user_id: string | null;
    created_at: string;
    updated_at: string;
    published_at: string | null;
  }>(
    `
      select
        e.id,
        e.slug,
        e.title,
        e.description_json,
        e.external_source,
        e.external_id,
        e.external_source as "externalSource",
        e.external_id as "externalId",
        e.is_imported,
        e.import_source,
        e.is_imported as "isImported",
        e.import_source as "importSource",
        e.cover_image_path,
        e.external_url,
        e.attendance_mode,
        e.online_url,
        e.practice_category_id,
        e.practice_subcategory_id,
        e.event_format_id,
        e.tags,
        e.languages,
        e.schedule_kind,
        e.event_timezone,
        e.single_start_at,
        e.single_end_at,
        e.rrule,
        e.rrule_dtstart_local,
        e.duration_minutes,
        e.status,
        e.visibility,
        e.detached_from_import,
        e.detached_at,
        e.detached_by_user_id,
        e.created_by_user_id,
        e.created_at,
        e.updated_at,
        e.published_at
      from events e
      where e.id = $1
      limit 1
    `,
    [eventId],
  );

  const event = eventResult.rows[0];
  if (!event) {
    return null;
  }

  const [organizerRolesResult, eventLocationResult] = await Promise.all([
    pool.query<{
      organizer_id: string;
      role_id: string;
      display_order: number;
    }>(
      `
        select
          rel.organizer_id,
          rel.role_id,
          rel.display_order
        from event_organizers rel
        where rel.event_id = $1
        order by rel.display_order asc
      `,
      [eventId],
    ),
    pool.query<{
      location_id: string;
      formatted_address: string;
      city: string | null;
      country_code: string | null;
      lat: number;
      lng: number;
    }>(
      `
        select
          el.location_id,
          l.formatted_address,
          l.city,
          l.country_code,
          st_y(l.geom::geometry) as lat,
          st_x(l.geom::geometry) as lng
        from event_locations el
        join locations l on l.id = el.location_id
        where el.event_id = $1
        limit 1
      `,
      [eventId],
    ),
  ]);

  return {
    ...event,
    organizer_roles: organizerRolesResult.rows,
    location_id: eventLocationResult.rows[0]?.location_id ?? null,
    location: eventLocationResult.rows[0]
      ? {
          id: eventLocationResult.rows[0].location_id,
          formatted_address: eventLocationResult.rows[0].formatted_address,
          city: eventLocationResult.rows[0].city,
          country_code: eventLocationResult.rows[0].country_code,
          lat: eventLocationResult.rows[0].lat,
          lng: eventLocationResult.rows[0].lng,
        }
      : null,
  };
}

export async function getAdminOrganizerById(pool: Pool, organizerId: string) {
  const result = await pool.query<{
    id: string;
    slug: string;
    name: string;
    description_json: Record<string, unknown>;
    description_html: string | null;
    website_url: string | null;
    external_url: string | null;
    tags: string[];
    languages: string[];
    image_url: string | null;
    avatar_path: string | null;
    city: string | null;
    country_code: string | null;
    status: "draft" | "published" | "archived";
    created_at: string;
    updated_at: string;
  }>(
    `
      select
        o.id,
        o.slug,
        o.name,
        o.description_json,
        o.description_html,
        o.website_url,
        o.external_url,
        o.tags,
        o.languages,
        o.image_url,
        o.avatar_path,
        o.city,
        o.country_code,
        o.status,
        o.created_at,
        o.updated_at
      from organizers o
      where o.id = $1
      limit 1
    `,
    [organizerId],
  );

  const organizer = result.rows[0];
  if (!organizer) {
    return null;
  }
  const [profileRoles, profilePractices] = await Promise.all([
    pool.query<{ role_id: string }>(
      `
        select role_id
        from organizer_profile_roles
        where organizer_id = $1
        order by display_order asc
      `,
      [organizerId],
    ),
    pool.query<{ practice_id: string }>(
      `
        select practice_id
        from organizer_practices
        where organizer_id = $1
        order by display_order asc
      `,
      [organizerId],
    ),
  ]);
  const [derivedRoles, derivedPractices, locations] = await Promise.all([
    pool.query<{ role_id: string }>(
      `
        select distinct eo.role_id
        from event_organizers eo
        join events e on e.id = eo.event_id
        where eo.organizer_id = $1
          and e.status in ('published', 'cancelled')
      `,
      [organizerId],
    ),
    pool.query<{ practice_id: string }>(
      `
        select distinct e.practice_category_id as practice_id
        from event_organizers eo
        join events e on e.id = eo.event_id
        where eo.organizer_id = $1
          and e.status in ('published', 'cancelled')
          and e.practice_category_id is not null
      `,
      [organizerId],
    ),
    pool.query<{
      id: string;
      is_primary: boolean;
      external_source: string | null;
      external_id: string | null;
      provider: string | null;
      place_id: string | null;
      verified_at: string | null;
      label: string | null;
      formatted_address: string | null;
      city: string | null;
      country_code: string | null;
      lat: number | null;
      lng: number | null;
    }>(
      `
        select
          ol.id,
          ol.is_primary,
          ol.external_source,
          ol.external_id,
          ol.provider,
          ol.place_id,
          ol.verified_at,
          ol.label,
          ol.formatted_address,
          ol.city,
          ol.country_code,
          st_y(ol.geom::geometry) as lat,
          st_x(ol.geom::geometry) as lng
        from organizer_locations ol
        where ol.organizer_id = $1
        order by ol.is_primary desc, ol.created_at desc
      `,
      [organizerId],
    ),
  ]);

  return {
    ...organizer,
    profile_role_ids: profileRoles.rows.map((row) => row.role_id),
    practice_category_ids: profilePractices.rows.map((row) => row.practice_id),
    derived_role_ids: derivedRoles.rows.map((row) => row.role_id),
    derived_practice_category_ids: derivedPractices.rows.map((row) => row.practice_id),
    locations: locations.rows,
  };
}
