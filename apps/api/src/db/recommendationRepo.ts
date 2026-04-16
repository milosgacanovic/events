import type { Pool } from "pg";

export type RecommendationRow = {
  id: string;
  sender_user_id: string;
  recipient_email: string;
  event_id: string;
  note: string | null;
  sent_at: string;
};

export async function createRecommendation(
  pool: Pool,
  senderUserId: string,
  recipientEmail: string,
  eventId: string,
  note?: string,
): Promise<RecommendationRow> {
  const result = await pool.query<RecommendationRow>(
    `INSERT INTO recommendations (sender_user_id, recipient_email, event_id, note)
     VALUES ($1, $2, $3, $4)
     RETURNING id, sender_user_id, recipient_email, event_id, note, sent_at`,
    [senderUserId, recipientEmail, eventId, note ?? null],
  );
  return result.rows[0];
}

export async function countDailyRecommendations(
  pool: Pool,
  userId: string,
): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM recommendations
     WHERE sender_user_id = $1 AND sent_at > now() - interval '1 day'`,
    [userId],
  );
  return parseInt(result.rows[0].count, 10);
}
