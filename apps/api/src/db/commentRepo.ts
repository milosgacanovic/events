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
       ORDER BY c.created_at DESC
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
  const client = await pool.connect();
  try {
    await client.query("begin");

    // Snapshot context before delete so the moderation queue keeps usable info
    // even after the comment row is gone.
    const snapshotResult = await client.query<{
      body: string;
      display_name: string | null;
      event_id: string;
      event_title: string | null;
    }>(
      `SELECT c.body, u.display_name, c.event_id::text AS event_id, e.title AS event_title
       FROM comments c
       LEFT JOIN users u ON u.id = c.user_id
       LEFT JOIN events e ON e.id = c.event_id
       WHERE c.id = $1 AND c.user_id = $2`,
      [commentId, userId],
    );

    const snap = snapshotResult.rows[0];
    if (!snap) {
      await client.query("rollback");
      return false;
    }

    await client.query(
      `DELETE FROM comments WHERE id = $1 AND user_id = $2`,
      [commentId, userId],
    );

    // Transition every moderation_queue row for this comment (regardless of
    // prior status) to user_deleted so it disappears from pending/approved/
    // rejected views and lands only in the "Deleted by User" archive.
    await client.query(
      `UPDATE moderation_queue
       SET status = 'user_deleted',
           reviewed_at = now(),
           snapshot_user_id = $2,
           snapshot_user_name = $3,
           snapshot_content = $4,
           snapshot_target_type = 'event',
           snapshot_target_id = $5::uuid,
           snapshot_target_label = $6
       WHERE item_type = 'comment' AND item_id = $1`,
      [commentId, userId, snap.display_name, snap.body, snap.event_id, snap.event_title],
    );

    await client.query("commit");
    return true;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
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
