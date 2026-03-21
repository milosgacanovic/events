import type { Pool } from "pg";

/**
 * Lists events the user can manage via 3 ownership paths:
 * 1. events.created_by_user_id = userId
 * 2. event linked to an organizer the user manages (via host_users)
 * 3. explicit event_users grant
 */
export async function listManagedEvents(
  pool: Pool,
  userId: string,
  input: {
    q?: string;
    status?: string;
    practiceCategoryId?: string;
    eventFormatId?: string;
    time?: "upcoming" | "past";
    sort?: string;
    page: number;
    pageSize: number;
  },
) {
  const page = Math.max(input.page, 1);
  const pageSize = Math.min(Math.max(input.pageSize, 1), 100);
  const offset = (page - 1) * pageSize;

  const whereParts: string[] = [];
  const values: unknown[] = [userId];

  if (input.q) {
    values.push(`%${input.q}%`);
    const idx = values.length;
    whereParts.push(`(e.title ilike $${idx} or e.slug ilike $${idx})`);
  }

  if (input.status) {
    values.push(input.status);
    whereParts.push(`e.status = $${values.length}`);
  }

  if (input.practiceCategoryId) {
    values.push(input.practiceCategoryId);
    whereParts.push(`e.practice_category_id = $${values.length}`);
  }

  if (input.eventFormatId) {
    values.push(input.eventFormatId);
    whereParts.push(`e.event_format_id = $${values.length}`);
  }

  if (input.time === "upcoming") {
    whereParts.push(`exists(select 1 from event_occurrences oc where oc.event_id = e.id and oc.starts_at_utc > now())`);
  } else if (input.time === "past") {
    whereParts.push(`not exists(select 1 from event_occurrences oc where oc.event_id = e.id and oc.starts_at_utc > now())`);
  }

  const extraWhere = whereParts.length ? `and ${whereParts.join(" and ")}` : "";

  const sortMap: Record<string, string> = {
    upcoming: "next_occ.starts_at_utc asc nulls last",
    edited: "e.updated_at desc",
    created: "e.created_at desc",
    title: "e.title asc",
  };
  const orderBy = sortMap[input.sort ?? ""] ?? "e.updated_at desc";

  const ownershipCte = `
    with managed_event_ids as (
      select e.id from events e where e.created_by_user_id = $1
      union
      select eo.event_id as id
        from event_organizers eo
        join host_users hu on hu.organizer_id = eo.organizer_id
        where hu.user_id = $1
      union
      select eu.event_id as id from event_users eu where eu.user_id = $1
    )
  `;

  const [itemsResult, totalResult] = await Promise.all([
    pool.query<{
      id: string;
      slug: string;
      title: string;
      status: string;
      attendance_mode: string;
      schedule_kind: string;
      event_format_id: string | null;
      is_imported: boolean;
      import_source: string | null;
      detached_from_import: boolean;
      cover_image_path: string | null;
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
        ${ownershipCte}
        select
          e.id, e.slug, e.title, e.status, e.attendance_mode,
          e.schedule_kind, e.event_format_id,
          e.is_imported, e.import_source, e.detached_from_import,
          e.cover_image_path, e.updated_at, e.published_at,
          pc.label as practice_category_label,
          ef.label as event_format_label,
          loc_sub.city as location_city,
          loc_sub.country_code as location_country,
          next_occ.starts_at_utc as next_occurrence,
          hosts_sub.host_names,
          u.display_name as created_by_name
        from events e
        join managed_event_ids m on m.id = e.id
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
        where 1=1 ${extraWhere}
        order by ${orderBy}
        limit $${values.length + 1}
        offset $${values.length + 2}
      `,
      [...values, pageSize, offset],
    ),
    pool.query<{ count: string }>(
      `
        ${ownershipCte}
        select count(*)::text as count
        from events e
        join managed_event_ids m on m.id = e.id
        where 1=1 ${extraWhere}
      `,
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

/**
 * Lists organizers the user can manage:
 * 1. organizers.created_by_user_id = userId
 * 2. host_users grant
 */
export async function listManagedOrganizers(
  pool: Pool,
  userId: string,
  input: {
    q?: string;
    status?: string;
    page: number;
    pageSize: number;
  },
) {
  const page = Math.max(input.page, 1);
  const pageSize = Math.min(Math.max(input.pageSize, 1), 100);
  const offset = (page - 1) * pageSize;

  const whereParts: string[] = [];
  const values: unknown[] = [userId];

  if (input.q) {
    values.push(`%${input.q}%`);
    const idx = values.length;
    whereParts.push(`(o.name ilike $${idx} or o.slug ilike $${idx})`);
  }

  if (input.status) {
    values.push(input.status);
    whereParts.push(`o.status = $${values.length}`);
  }

  const extraWhere = whereParts.length ? `and ${whereParts.join(" and ")}` : "";

  const ownershipCte = `
    with managed_org_ids as (
      select o.id from organizers o where o.created_by_user_id = $1
      union
      select hu.organizer_id as id from host_users hu where hu.user_id = $1
    )
  `;

  const [itemsResult, totalResult] = await Promise.all([
    pool.query<{
      id: string;
      slug: string;
      name: string;
      status: string;
      image_url: string | null;
      avatar_path: string | null;
      city: string | null;
      country_code: string | null;
      updated_at: string;
    }>(
      `
        ${ownershipCte}
        select
          o.id, o.slug, o.name, o.status,
          o.image_url, o.avatar_path, o.city, o.country_code,
          o.updated_at
        from organizers o
        join managed_org_ids m on m.id = o.id
        where 1=1 ${extraWhere}
        order by o.updated_at desc
        limit $${values.length + 1}
        offset $${values.length + 2}
      `,
      [...values, pageSize, offset],
    ),
    pool.query<{ count: string }>(
      `
        ${ownershipCte}
        select count(*)::text as count
        from organizers o
        join managed_org_ids m on m.id = o.id
        where 1=1 ${extraWhere}
      `,
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

export async function canUserEditEvent(
  pool: Pool,
  userId: string,
  eventId: string,
): Promise<boolean> {
  const result = await pool.query<{ ok: boolean }>(
    `
      select exists(
        select 1 from events where id = $2 and created_by_user_id = $1
        union all
        select 1 from event_users where user_id = $1 and event_id = $2
        union all
        select 1
          from event_organizers eo
          join host_users hu on hu.organizer_id = eo.organizer_id
          where hu.user_id = $1 and eo.event_id = $2
      ) as ok
    `,
    [userId, eventId],
  );
  return result.rows[0]?.ok ?? false;
}

export async function canUserEditOrganizer(
  pool: Pool,
  userId: string,
  organizerId: string,
): Promise<boolean> {
  const result = await pool.query<{ ok: boolean }>(
    `
      select exists(
        select 1 from organizers where id = $2 and created_by_user_id = $1
        union all
        select 1 from host_users where user_id = $1 and organizer_id = $2
      ) as ok
    `,
    [userId, organizerId],
  );
  return result.rows[0]?.ok ?? false;
}

export async function getDashboardStats(
  pool: Pool,
  userId: string,
) {
  const [eventsResult, hostsResult, upcomingResult, activityResult] = await Promise.all([
    pool.query<{ count: string }>(
      `
        select count(distinct e.id)::text as count
        from events e
        left join event_organizers eo on eo.event_id = e.id
        left join host_users hu on hu.organizer_id = eo.organizer_id and hu.user_id = $1
        left join event_users eu on eu.event_id = e.id and eu.user_id = $1
        where e.created_by_user_id = $1 or hu.id is not null or eu.id is not null
      `,
      [userId],
    ),
    pool.query<{ count: string }>(
      `
        select count(distinct o.id)::text as count
        from organizers o
        left join host_users hu on hu.organizer_id = o.id and hu.user_id = $1
        where o.created_by_user_id = $1 or hu.id is not null
      `,
      [userId],
    ),
    pool.query<{ count: string }>(
      `
        select count(distinct oc.event_id)::text as count
        from event_occurrences oc
        join events e on e.id = oc.event_id
        left join event_organizers eo on eo.event_id = e.id
        left join host_users hu on hu.organizer_id = eo.organizer_id and hu.user_id = $1
        left join event_users eu on eu.event_id = e.id and eu.user_id = $1
        where (e.created_by_user_id = $1 or hu.id is not null or eu.id is not null)
          and oc.starts_at_utc > now()
          and e.status = 'published'
      `,
      [userId],
    ),
    pool.query<{
      entity_type: string;
      entity_id: string;
      entity_name: string;
      action: string;
      activity_at: string;
    }>(
      `
        (
          select 'event' as entity_type, e.id as entity_id, e.title as entity_name,
            case when e.created_at = e.updated_at then 'created' else 'updated' end as action,
            e.updated_at as activity_at
          from events e
          left join event_organizers eo on eo.event_id = e.id
          left join host_users hu on hu.organizer_id = eo.organizer_id and hu.user_id = $1
          left join event_users eu on eu.event_id = e.id and eu.user_id = $1
          where e.created_by_user_id = $1 or hu.id is not null or eu.id is not null
        )
        union all
        (
          select 'host' as entity_type, o.id as entity_id, o.name as entity_name,
            case when o.created_at = o.updated_at then 'created' else 'updated' end as action,
            o.updated_at as activity_at
          from organizers o
          left join host_users hu on hu.organizer_id = o.id and hu.user_id = $1
          where o.created_by_user_id = $1 or hu.id is not null
        )
        order by activity_at desc
        limit 5
      `,
      [userId],
    ),
  ]);

  return {
    totalEventsCount: Number(eventsResult.rows[0]?.count ?? "0"),
    hostsCount: Number(hostsResult.rows[0]?.count ?? "0"),
    upcomingEventsCount: Number(upcomingResult.rows[0]?.count ?? "0"),
    recentActivity: activityResult.rows.map((r) => ({
      entityType: r.entity_type,
      entityId: r.entity_id,
      entityName: r.entity_name,
      action: r.action,
      activityAt: r.activity_at,
    })),
  };
}

export async function getAdminDashboardStats(pool: Pool) {
  const [events, hosts, editors, pendingApps] = await Promise.all([
    pool.query<{ count: string }>(`select count(*)::text as count from events`),
    pool.query<{ count: string }>(`select count(*)::text as count from organizers`),
    pool.query<{ count: string }>(`select count(*)::text as count from users`),
    pool.query<{ count: string }>(`select count(*)::text as count from editor_applications where status = 'pending'`),
  ]);

  return {
    totalEventsCount: Number(events.rows[0]?.count ?? "0"),
    totalHostsCount: Number(hosts.rows[0]?.count ?? "0"),
    totalUsersCount: Number(editors.rows[0]?.count ?? "0"),
    pendingApplicationsCount: Number(pendingApps.rows[0]?.count ?? "0"),
  };
}

export async function getAdminRecentActivity(pool: Pool) {
  const result = await pool.query<{
    entity_type: string;
    entity_id: string;
    entity_name: string;
    action: string;
    activity_at: string;
  }>(
    `
      (
        select 'event' as entity_type, e.id as entity_id, e.title as entity_name,
          case when e.created_at = e.updated_at then 'created' else 'updated' end as action,
          e.updated_at as activity_at
        from events e
      )
      union all
      (
        select 'host' as entity_type, o.id as entity_id, o.name as entity_name,
          case when o.created_at = o.updated_at then 'created' else 'updated' end as action,
          o.updated_at as activity_at
        from organizers o
      )
      order by activity_at desc
      limit 5
    `,
  );

  return result.rows.map((r) => ({
    entityType: r.entity_type,
    entityId: r.entity_id,
    entityName: r.entity_name,
    action: r.action,
    activityAt: r.activity_at,
  }));
}
