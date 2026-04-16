import type { Pool } from "pg";

export type CommentRow = {
  id: string;
  user_id: string;
  event_id: string;
  body: string;
  status: string;
  created_at: string;
};

export type CommentWithAuthor = CommentRow & {
  display_name: string | null;
};

const COLUMNS = `id, user_id, event_id, body, status, created_at`;
const PREFIXED_COLUMNS = `c.id, c.user_id, c.event_id, c.body, c.status, c.created_at`;

export async function createComment(
  pool: Pool,
  userId: string,
  eventId: string,
  body: string,
): Promise<CommentRow> {
  const result = await pool.query<CommentRow>(
    `INSERT INTO comments (user_id, event_id, body)
     VALUES ($1, $2, $3)
     RETURNING ${COLUMNS}`,
    [userId, eventId, body],
  );
  return result.rows[0];
}

export async function listApprovedComments(
  pool: Pool,
  eventId: string,
  limit: number = 50,
  offset: number = 0,
): Promise<{ items: CommentWithAuthor[]; total: number }> {
  const [itemsResult, countResult] = await Promise.all([
    pool.query<CommentWithAuthor>(
      `SELECT ${PREFIXED_COLUMNS}, u.display_name
       FROM comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.event_id = $1 AND c.status = 'approved'
       ORDER BY c.created_at ASC
       LIMIT $2 OFFSET $3`,
      [eventId, limit, offset],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM comments WHERE event_id = $1 AND status = 'approved'`,
      [eventId],
    ),
  ]);
  return {
    items: itemsResult.rows,
    total: parseInt(countResult.rows[0].count, 10),
  };
}

export async function deleteComment(
  pool: Pool,
  userId: string,
  commentId: string,
): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM comments WHERE id = $1 AND user_id = $2`,
    [commentId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function listUserComments(
  pool: Pool,
  userId: string,
): Promise<(CommentRow & { event_title: string; event_slug: string })[]> {
  const result = await pool.query<CommentRow & { event_title: string; event_slug: string }>(
    `SELECT ${PREFIXED_COLUMNS}, e.title AS event_title, e.slug AS event_slug
     FROM comments c
     JOIN events e ON e.id = c.event_id
     WHERE c.user_id = $1
     ORDER BY c.created_at DESC`,
    [userId],
  );
  return result.rows;
}

export async function countRecentComments(
  pool: Pool,
  userId: string,
  hours: number = 1,
): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM comments
     WHERE user_id = $1 AND created_at > now() - interval '1 hour' * $2`,
    [userId, hours],
  );
  return parseInt(result.rows[0].count, 10);
}
