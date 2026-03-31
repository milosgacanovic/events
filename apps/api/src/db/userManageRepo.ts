import type { Pool } from "pg";

export async function listUsersWithRoles(
  pool: Pool,
  input: { search?: string; page: number; pageSize: number },
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

  const whereSql = whereParts.length ? `where ${whereParts.join(" and ")}` : "";

  const [itemsResult, totalResult] = await Promise.all([
    pool.query<{
      id: string;
      keycloak_sub: string;
      display_name: string | null;
      email: string | null;
      roles: string[];
      created_at: string;
      is_service_account: boolean;
      host_count: string;
      event_count: string;
    }>(
      `
        select
          u.id, u.keycloak_sub, u.display_name, u.email, u.roles, u.created_at, u.is_service_account,
          (select count(*)::text from host_users hu where hu.user_id = u.id) as host_count,
          (
            select count(distinct e.id)::text
            from events e
            left join event_users eu on eu.event_id = e.id and eu.user_id = u.id
            left join event_organizers eo on eo.event_id = e.id
            left join host_users hu2 on hu2.organizer_id = eo.organizer_id and hu2.user_id = u.id
            where e.created_by_user_id = u.id or eu.id is not null or hu2.id is not null
          ) as event_count
        from users u
        ${whereSql}
        order by u.created_at desc
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
    })),
    pagination: {
      page,
      pageSize,
      totalPages: Math.max(Math.ceil(Number(totalResult.rows[0]?.count ?? "0") / pageSize), 1),
      totalItems: Number(totalResult.rows[0]?.count ?? "0"),
    },
  };
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
