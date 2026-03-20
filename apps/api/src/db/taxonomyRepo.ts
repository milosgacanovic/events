import type { Pool } from "pg";
import slugify from "slugify";

function toKeyBase(value: string): string {
  return slugify(value, {
    lower: true,
    strict: true,
    trim: true,
  }).slice(0, 90);
}

async function generateUniquePracticeKey(
  pool: Pool,
  input: {
    key?: string;
    label: string;
  },
): Promise<string> {
  const requestedKey = input.key?.trim();
  const base = requestedKey || toKeyBase(input.label) || "category";

  for (let i = 1; i < 2000; i += 1) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    const result = await pool.query<{ exists: boolean }>(
      `select exists(select 1 from practices where key = $1) as exists`,
      [candidate],
    );

    if (!result.rows[0]?.exists) {
      return candidate;
    }
  }

  throw new Error("Could not generate unique key for practices");
}

export async function createPractice(
  pool: Pool,
  input: {
    parentId?: string | null;
    level: 1 | 2;
    key?: string;
    label: string;
    sortOrder?: number;
    isActive?: boolean;
  },
) {
  const key = await generateUniquePracticeKey(pool, {
    key: input.key,
    label: input.label,
  });

  const result = await pool.query(
    `
      insert into practices (parent_id, level, key, label, sort_order, is_active)
      values ($1, $2, $3, $4, $5, $6)
      returning *
    `,
    [
      input.parentId ?? null,
      input.level,
      key,
      input.label,
      input.sortOrder ?? 0,
      input.isActive ?? true,
    ],
  );

  return result.rows[0];
}

export async function updatePractice(
  pool: Pool,
  id: string,
  input: {
    parentId?: string | null;
    level?: 1 | 2;
    key?: string;
    label?: string;
    sortOrder?: number;
    isActive?: boolean;
  },
) {
  const fields: Record<string, unknown> = {
    parent_id: input.parentId,
    level: input.level,
    key: input.key,
    label: input.label,
    sort_order: input.sortOrder,
    is_active: input.isActive,
  };

  const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
  if (!entries.length) {
    const result = await pool.query("select * from practices where id = $1", [id]);
    return result.rows[0] ?? null;
  }

  const values: unknown[] = [id];
  const setParts = entries.map(([key, value], index) => {
    values.push(value);
    return `${key} = $${index + 2}`;
  });

  const result = await pool.query(`update practices set ${setParts.join(", ")} where id = $1 returning *`, values);
  return result.rows[0] ?? null;
}

export async function createOrganizerRole(
  pool: Pool,
  input: {
    key: string;
    label: string;
    sortOrder?: number;
    isActive?: boolean;
  },
) {
  const result = await pool.query(
    `
      insert into organizer_roles (key, label, sort_order, is_active)
      values ($1, $2, $3, $4)
      returning *
    `,
    [input.key, input.label, input.sortOrder ?? 0, input.isActive ?? true],
  );

  return result.rows[0];
}

export async function updateOrganizerRole(
  pool: Pool,
  id: string,
  input: {
    key?: string;
    label?: string;
    sortOrder?: number;
    isActive?: boolean;
  },
) {
  const fields: Record<string, unknown> = {
    key: input.key,
    label: input.label,
    sort_order: input.sortOrder,
    is_active: input.isActive,
  };

  const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
  if (!entries.length) {
    const result = await pool.query("select * from organizer_roles where id = $1", [id]);
    return result.rows[0] ?? null;
  }

  const values: unknown[] = [id];
  const setParts = entries.map(([key, value], index) => {
    values.push(value);
    return `${key} = $${index + 2}`;
  });

  const result = await pool.query(
    `update organizer_roles set ${setParts.join(", ")} where id = $1 returning *`,
    values,
  );

  return result.rows[0] ?? null;
}

export async function listEventFormats(pool: Pool) {
  const result = await pool.query(
    `
      select id, key, label, sort_order, is_active
      from event_formats
      order by sort_order asc, label asc
    `,
  );
  return result.rows;
}

export async function createEventFormat(
  pool: Pool,
  input: {
    key: string;
    label: string;
    sortOrder?: number;
    isActive?: boolean;
  },
) {
  const result = await pool.query(
    `
      insert into event_formats (key, label, sort_order, is_active)
      values ($1, $2, $3, $4)
      returning *
    `,
    [input.key, input.label, input.sortOrder ?? 0, input.isActive ?? true],
  );

  return result.rows[0];
}

export async function deletePractice(pool: Pool, id: string): Promise<{ deleted: boolean; conflict?: string }> {
  // Check if any events reference this practice
  const usage = await pool.query<{ count: string }>(
    `select count(*)::text as count from events where practice_category_id = $1 or practice_subcategory_id = $1`,
    [id],
  );
  if (Number(usage.rows[0]?.count) > 0) {
    return { deleted: false, conflict: "Practice is referenced by events" };
  }
  // Check children
  const children = await pool.query<{ count: string }>(
    `select count(*)::text as count from practices where parent_id = $1`,
    [id],
  );
  if (Number(children.rows[0]?.count) > 0) {
    return { deleted: false, conflict: "Practice has subcategories" };
  }
  const result = await pool.query(`delete from practices where id = $1 returning id`, [id]);
  return { deleted: (result.rowCount ?? 0) > 0 };
}

export async function deleteEventFormat(pool: Pool, id: string): Promise<{ deleted: boolean; conflict?: string }> {
  const usage = await pool.query<{ count: string }>(
    `select count(*)::text as count from events where event_format_id = $1`,
    [id],
  );
  if (Number(usage.rows[0]?.count) > 0) {
    return { deleted: false, conflict: "Event format is referenced by events" };
  }
  const result = await pool.query(`delete from event_formats where id = $1 returning id`, [id]);
  return { deleted: (result.rowCount ?? 0) > 0 };
}

export async function deleteOrganizerRole(pool: Pool, id: string): Promise<{ deleted: boolean; conflict?: string }> {
  const usage = await pool.query<{ count: string }>(
    `select count(*)::text as count from organizer_profile_roles where role_id = $1`,
    [id],
  );
  if (Number(usage.rows[0]?.count) > 0) {
    return { deleted: false, conflict: "Role is referenced by organizer profiles" };
  }
  const result = await pool.query(`delete from organizer_roles where id = $1 returning id`, [id]);
  return { deleted: (result.rowCount ?? 0) > 0 };
}

export async function reorderPractices(
  pool: Pool,
  items: Array<{ id: string; sortOrder: number }>,
) {
  const ids = items.map((i) => i.id);
  const orders = items.map((i) => i.sortOrder);
  await pool.query(
    `UPDATE practices SET sort_order = d.sort_order
     FROM (SELECT unnest($1::uuid[]) AS id, unnest($2::int[]) AS sort_order) d
     WHERE practices.id = d.id`,
    [ids, orders],
  );
}

export async function reorderEventFormats(
  pool: Pool,
  items: Array<{ id: string; sortOrder: number }>,
) {
  const ids = items.map((i) => i.id);
  const orders = items.map((i) => i.sortOrder);
  await pool.query(
    `UPDATE event_formats SET sort_order = d.sort_order
     FROM (SELECT unnest($1::uuid[]) AS id, unnest($2::int[]) AS sort_order) d
     WHERE event_formats.id = d.id`,
    [ids, orders],
  );
}

export async function reorderOrganizerRoles(
  pool: Pool,
  items: Array<{ id: string; sortOrder: number }>,
) {
  const ids = items.map((i) => i.id);
  const orders = items.map((i) => i.sortOrder);
  await pool.query(
    `UPDATE organizer_roles SET sort_order = d.sort_order
     FROM (SELECT unnest($1::uuid[]) AS id, unnest($2::int[]) AS sort_order) d
     WHERE organizer_roles.id = d.id`,
    [ids, orders],
  );
}

export async function updateEventFormat(
  pool: Pool,
  id: string,
  input: {
    key?: string;
    label?: string;
    sortOrder?: number;
    isActive?: boolean;
  },
) {
  const fields: Record<string, unknown> = {
    key: input.key,
    label: input.label,
    sort_order: input.sortOrder,
    is_active: input.isActive,
  };

  const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
  if (!entries.length) {
    const result = await pool.query("select * from event_formats where id = $1", [id]);
    return result.rows[0] ?? null;
  }

  const values: unknown[] = [id];
  const setParts = entries.map(([key, value], index) => {
    values.push(value);
    return `${key} = $${index + 2}`;
  });

  const result = await pool.query(
    `update event_formats set ${setParts.join(", ")} where id = $1 returning *`,
    values,
  );

  return result.rows[0] ?? null;
}
