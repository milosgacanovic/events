import type { Pool } from "pg";

export type ModerationQueueRow = {
  id: string;
  item_type: string;
  item_id: string;
  status: string;
  moderator_id: string | null;
  moderator_note: string | null;
  reviewed_at: string | null;
  created_at: string;
};

const COLUMNS = `id, item_type, item_id, status, moderator_id, moderator_note, reviewed_at, created_at`;

export async function createQueueEntry(
  pool: Pool,
  itemType: string,
  itemId: string,
): Promise<ModerationQueueRow> {
  const result = await pool.query<ModerationQueueRow>(
    `INSERT INTO moderation_queue (item_type, item_id)
     VALUES ($1, $2)
     RETURNING ${COLUMNS}`,
    [itemType, itemId],
  );
  return result.rows[0];
}

export async function listPending(
  pool: Pool,
  itemType?: string,
): Promise<ModerationQueueRow[]> {
  if (itemType) {
    const result = await pool.query<ModerationQueueRow>(
      `SELECT ${COLUMNS} FROM moderation_queue
       WHERE status = 'pending' AND item_type = $1
       ORDER BY created_at ASC`,
      [itemType],
    );
    return result.rows;
  }
  const result = await pool.query<ModerationQueueRow>(
    `SELECT ${COLUMNS} FROM moderation_queue
     WHERE status = 'pending'
     ORDER BY created_at ASC`,
  );
  return result.rows;
}

export async function updateStatus(
  pool: Pool,
  queueId: string,
  status: string,
  moderatorId: string,
  note?: string,
): Promise<ModerationQueueRow | null> {
  const result = await pool.query<ModerationQueueRow>(
    `UPDATE moderation_queue
     SET status = $2, moderator_id = $3, moderator_note = $4, reviewed_at = now()
     WHERE id = $1
     RETURNING ${COLUMNS}`,
    [queueId, status, moderatorId, note ?? null],
  );
  return result.rows[0] ?? null;
}
