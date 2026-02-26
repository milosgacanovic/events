import type { Pool } from "pg";

export async function listAdminEvents(
  pool: Pool,
  input: {
    q?: string;
    status?: "draft" | "published" | "cancelled" | "archived";
    externalSource?: string;
    externalId?: string;
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

  if (input.externalSource && input.externalId) {
    values.push(input.externalSource);
    whereParts.push(`e.external_source = $${values.length}`);
    values.push(input.externalId);
    whereParts.push(`e.external_id = $${values.length}`);
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
      status: string;
      attendance_mode: string;
      schedule_kind: string;
      updated_at: string;
      published_at: string | null;
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
          e.status,
          e.attendance_mode,
          e.schedule_kind,
          e.updated_at,
          e.published_at
        from events e
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

  const whereSql = whereParts.length ? `where ${whereParts.join(" and ")}` : "";

  const [itemsResult, totalResult] = await Promise.all([
    pool.query<{
      id: string;
      slug: string;
      name: string;
      status: string;
      updated_at: string;
    }>(
      `
        select
          o.id,
          o.slug,
          o.name,
          o.status,
          o.updated_at
        from organizers o
        ${whereSql}
        order by o.updated_at desc
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
    cover_image_path: string | null;
    external_url: string | null;
    attendance_mode: "in_person" | "online" | "hybrid";
    online_url: string | null;
    practice_category_id: string;
    practice_subcategory_id: string | null;
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
        e.cover_image_path,
        e.external_url,
        e.attendance_mode,
        e.online_url,
        e.practice_category_id,
        e.practice_subcategory_id,
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
    website_url: string | null;
    tags: string[];
    languages: string[];
    avatar_path: string | null;
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
        o.website_url,
        o.tags,
        o.languages,
        o.avatar_path,
        o.status,
        o.created_at,
        o.updated_at
      from organizers o
      where o.id = $1
      limit 1
    `,
    [organizerId],
  );

  return result.rows[0] ?? null;
}
