import type { Pool } from "pg";

export async function listUsersWithRoles(
  pool: Pool,
  input: {
    search?: string;
    page: number;
    pageSize: number;
    sort?: string;
    sortDir?: string;
    role?: string;
    hasNotes?: boolean;
  },
) {
  const page = Math.max(input.page, 1);
  const pageSize = Math.min(Math.max(input.pageSize, 1), 100);
  const offset = (page - 1) * pageSize;

  const whereParts: string[] = [];
  const values: unknown[] = [];

  if (input.search) {
    values.push(`%${input.search}%`);
    const idx = values.length;
    whereParts.push(`(u.display_name ilike $${idx} or u.email ilike $${idx} or u.keycloak_sub ilike $${idx})`);
  }

  if (input.role === "admin") {
    whereParts.push(`'admin' = ANY(u.roles)`);
  } else if (input.role === "editor") {
    whereParts.push(`'editor' = ANY(u.roles)`);
  }

  if (input.hasNotes) {
    whereParts.push(`u.admin_notes != ''`);
  }

  const whereSql = whereParts.length ? `where ${whereParts.join(" and ")}` : "";

  if (input.role === "suspended") {
    whereParts.push(`u.suspended_at is not null`);
  }

  const sortColumns: Record<string, string> = {
    created: "u.created_at",
    name: "u.display_name",
    email: "u.email",
    hosts: "host_count",
    events: "event_count",
    saves: "save_count",
    rsvps: "rsvp_count",
    follows: "follow_count",
    comments: "comment_count",
  };
  const sortCol = sortColumns[input.sort ?? ""] ?? "u.created_at";
  const sortDirection = input.sortDir === "asc" ? "asc" : "desc";
  const orderSql = `order by ${sortCol} ${sortDirection} nulls last`;

  const [itemsResult, totalResult] = await Promise.all([
    pool.query<{
      id: string;
      keycloak_sub: string;
      display_name: string | null;
      email: string | null;
      roles: string[];
      created_at: string;
      is_service_account: boolean;
      admin_notes: string;
      suspended_at: string | null;
      host_count: string;
      event_count: string;
      save_count: string;
      rsvp_count: string;
      follow_count: string;
      comment_count: string;
      alert_count: string;
    }>(
      `
        select
          u.id, u.keycloak_sub, u.display_name, u.email, u.roles, u.created_at,
          u.is_service_account, u.admin_notes, u.suspended_at,
          (select count(*)::text from host_users hu where hu.user_id = u.id) as host_count,
          (
            select count(distinct e.id)::text
            from events e
            left join event_users eu on eu.event_id = e.id and eu.user_id = u.id
            left join event_organizers eo on eo.event_id = e.id
            left join host_users hu2 on hu2.organizer_id = eo.organizer_id and hu2.user_id = u.id
            where e.created_by_user_id = u.id or eu.id is not null or hu2.id is not null
          ) as event_count,
          (select count(*)::text from saved_events se where se.user_id = u.id) as save_count,
          (select count(*)::text from event_rsvps r where r.user_id = u.id) as rsvp_count,
          (select count(*)::text from user_alerts ua where ua.user_id = u.id and ua.unsubscribed_at is null) as follow_count,
          (select count(*)::text from comments c where c.user_id = u.id) as comment_count,
          (select count(*)::text from saved_searches ss where ss.user_id = u.id and ss.unsubscribed_at is null) as alert_count
        from users u
        ${whereSql}
        ${orderSql}
        limit $${values.length + 1}
        offset $${values.length + 2}
      `,
      [...values, pageSize, offset],
    ),
    pool.query<{ count: string }>(
      `select count(*)::text as count from users u ${whereSql}`,
      values,
    ),
  ]);

  return {
    items: itemsResult.rows.map((r) => ({
      ...r,
      host_count: Number(r.host_count),
      event_count: Number(r.event_count),
      save_count: Number(r.save_count),
      rsvp_count: Number(r.rsvp_count),
      follow_count: Number(r.follow_count),
      comment_count: Number(r.comment_count),
      alert_count: Number(r.alert_count),
    })),
    pagination: {
      page,
      pageSize,
      totalPages: Math.max(Math.ceil(Number(totalResult.rows[0]?.count ?? "0") / pageSize), 1),
      totalItems: Number(totalResult.rows[0]?.count ?? "0"),
    },
  };
}

export async function updateUserNote(
  pool: Pool,
  userId: string,
  notes: string,
) {
  await pool.query(
    `update users set admin_notes = $2 where id = $1`,
    [userId, notes],
  );
}

export async function getUserLinkedHosts(pool: Pool, userId: string) {
  const result = await pool.query<{
    id: string;
    organizer_id: string;
    organizer_name: string;
  }>(
    `
      select hu.id, hu.organizer_id, o.name as organizer_name
      from host_users hu
      join organizers o on o.id = hu.organizer_id
      where hu.user_id = $1
      order by o.name
    `,
    [userId],
  );
  return result.rows;
}

export async function getUserLinkedEvents(pool: Pool, userId: string) {
  const result = await pool.query<{
    id: string;
    title: string;
    status: string;
  }>(
    `
      select distinct e.id, e.title, e.status
      from events e
      left join event_users eu on eu.event_id = e.id and eu.user_id = $1
      left join event_organizers eo on eo.event_id = e.id
      left join host_users hu on hu.organizer_id = eo.organizer_id and hu.user_id = $1
      where e.created_by_user_id = $1 or eu.id is not null or hu.id is not null
      order by e.title
    `,
    [userId],
  );
  return result.rows;
}

export async function linkUserToHost(
  pool: Pool,
  userId: string,
  organizerId: string,
  createdBy: string,
) {
  await pool.query(
    `insert into host_users (user_id, organizer_id, created_by) values ($1, $2, $3) on conflict do nothing`,
    [userId, organizerId, createdBy],
  );
}

export async function unlinkUserFromHost(
  pool: Pool,
  userId: string,
  organizerId: string,
) {
  await pool.query(
    `delete from host_users where user_id = $1 and organizer_id = $2`,
    [userId, organizerId],
  );
}

export async function linkUserToEvent(
  pool: Pool,
  userId: string,
  eventId: string,
  createdBy: string,
) {
  await pool.query(
    `insert into event_users (user_id, event_id, created_by) values ($1, $2, $3) on conflict do nothing`,
    [userId, eventId, createdBy],
  );
}

export async function unlinkUserFromEvent(
  pool: Pool,
  userId: string,
  eventId: string,
) {
  await pool.query(
    `delete from event_users where user_id = $1 and event_id = $2`,
    [userId, eventId],
  );
}

export async function getUserDetail(pool: Pool, userId: string) {
  const [user, saves, rsvps, follows, comments, hosts, events] = await Promise.all([
    pool.query<{
      id: string;
      keycloak_sub: string;
      display_name: string | null;
      email: string | null;
      roles: string[];
      created_at: string;
      is_service_account: boolean;
      admin_notes: string;
      suspended_at: string | null;
    }>(
      `select id, keycloak_sub, display_name, email, roles, created_at,
              is_service_account, admin_notes, suspended_at
       from users where id = $1`,
      [userId],
    ),
    pool.query<{
      id: string;
      event_id: string;
      event_title: string;
      event_slug: string;
      scope: string;
      created_at: string;
    }>(
      `select se.id, se.event_id, e.title as event_title, e.slug as event_slug,
              se.scope, se.created_at
       from saved_events se
       join events e on e.id = se.event_id
       where se.user_id = $1
       order by se.created_at desc
       limit 50`,
      [userId],
    ),
    pool.query<{
      id: string;
      event_id: string;
      event_title: string;
      event_slug: string;
      created_at: string;
    }>(
      `select r.id, r.event_id, e.title as event_title, e.slug as event_slug,
              r.created_at
       from event_rsvps r
       join events e on e.id = r.event_id
       where r.user_id = $1
       order by r.created_at desc
       limit 50`,
      [userId],
    ),
    pool.query<{
      id: string;
      organizer_id: string;
      organizer_name: string;
      radius_km: number;
      unsubscribed_at: string | null;
      created_at: string;
    }>(
      `select ua.id, ua.organizer_id, o.name as organizer_name,
              ua.radius_km, ua.unsubscribed_at, ua.created_at
       from user_alerts ua
       join organizers o on o.id = ua.organizer_id
       where ua.user_id = $1
       order by ua.created_at desc
       limit 50`,
      [userId],
    ),
    pool.query<{
      id: string;
      event_id: string;
      event_title: string;
      body: string;
      status: string;
      created_at: string;
    }>(
      `select c.id, c.event_id, e.title as event_title,
              c.body, c.status, c.created_at
       from comments c
       join events e on e.id = c.event_id
       where c.user_id = $1
       order by c.created_at desc
       limit 50`,
      [userId],
    ),
    pool.query<{ organizer_id: string; organizer_name: string }>(
      `select hu.organizer_id, o.name as organizer_name
       from host_users hu
       join organizers o on o.id = hu.organizer_id
       where hu.user_id = $1
       order by o.name`,
      [userId],
    ),
    pool.query<{ id: string; title: string; status: string }>(
      `select distinct e.id, e.title, e.status
       from events e
       left join event_users eu on eu.event_id = e.id and eu.user_id = $1
       left join event_organizers eo on eo.event_id = e.id
       left join host_users hu on hu.organizer_id = eo.organizer_id and hu.user_id = $1
       where e.created_by_user_id = $1 or eu.id is not null or hu.id is not null
       order by e.title`,
      [userId],
    ),
  ]);

  const row = user.rows[0];
  if (!row) return null;

  return {
    ...row,
    saves: saves.rows,
    rsvps: rsvps.rows,
    follows: follows.rows,
    comments: comments.rows,
    linkedHosts: hosts.rows,
    linkedEvents: events.rows,
  };
}

export async function suspendUser(
  pool: Pool,
  userId: string,
  suspended: boolean,
): Promise<{ suspended_at: string | null } | null> {
  const result = await pool.query<{ suspended_at: string | null }>(
    suspended
      ? `update users set suspended_at = now() where id = $1 returning suspended_at`
      : `update users set suspended_at = null where id = $1 returning suspended_at`,
    [userId],
  );
  return result.rows[0] ?? null;
}
