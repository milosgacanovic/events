import type { Pool } from "pg";

export async function listAdminEvents(
  pool: Pool,
  input: {
    q?: string;
    status?: "draft" | "published" | "cancelled" | "archived";
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

  const whereSql = whereParts.length ? `where ${whereParts.join(" and ")}` : "";

  const [itemsResult, totalResult] = await Promise.all([
    pool.query<{
      id: string;
      slug: string;
      title: string;
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
