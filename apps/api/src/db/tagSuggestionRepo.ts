import type { Pool } from "pg";

export async function createTagSuggestion(
  pool: Pool,
  input: { tag: string; reason?: string; userId: string },
) {
  const result = await pool.query<{
    id: string;
    tag: string;
    reason: string | null;
    status: string;
    created_at: string;
  }>(
    `INSERT INTO tag_suggestions (tag, reason, suggested_by_user_id)
     VALUES ($1, $2, $3)
     RETURNING id, tag, reason, status, created_at`,
    [input.tag.trim().toLowerCase(), input.reason?.trim() || null, input.userId],
  );
  return result.rows[0];
}

export async function listTagSuggestions(
  pool: Pool,
  input: { status?: string; page: number; pageSize: number },
) {
  const page = Math.max(input.page, 1);
  const pageSize = Math.min(Math.max(input.pageSize, 1), 100);
  const offset = (page - 1) * pageSize;

  const whereParts: string[] = [];
  const values: unknown[] = [];

  if (input.status) {
    values.push(input.status);
    whereParts.push(`ts.status = $${values.length}`);
  }

  const where = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

  const [itemsResult, totalResult] = await Promise.all([
    pool.query<{
      id: string;
      tag: string;
      reason: string | null;
      status: string;
      admin_notes: string | null;
      created_at: string;
      resolved_at: string | null;
      suggested_by_name: string | null;
    }>(
      `SELECT ts.id, ts.tag, ts.reason, ts.status, ts.admin_notes,
              ts.created_at, ts.resolved_at,
              u.display_name AS suggested_by_name
       FROM tag_suggestions ts
       LEFT JOIN users u ON u.id = ts.suggested_by_user_id
       ${where}
       ORDER BY ts.created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, offset],
    ),
    pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM tag_suggestions ts ${where}`,
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

export async function updateTagSuggestionStatus(
  pool: Pool,
  input: { id: string; status: "approved" | "dismissed"; adminNotes?: string },
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query<{ id: string; tag: string; status: string }>(
      `UPDATE tag_suggestions
       SET status = $2, admin_notes = $3, resolved_at = now()
       WHERE id = $1
       RETURNING id, tag, status`,
      [input.id, input.status, input.adminNotes?.trim() || null],
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    if (input.status === "approved") {
      const tag = result.rows[0].tag;
      await client.query(
        `INSERT INTO tags (tag, sort_order)
         VALUES ($1, (SELECT coalesce(max(sort_order), 0) + 1 FROM tags))
         ON CONFLICT (tag) DO NOTHING`,
        [tag],
      );
    }

    await client.query("COMMIT");
    return result.rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
