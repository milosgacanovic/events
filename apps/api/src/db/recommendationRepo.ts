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

// ── Admin queries ─────────────────────────────────────────────────────

export async function listRecommendations(
  pool: Pool,
  input: { page: number; pageSize: number; senderSearch?: string; recipientSearch?: string },
) {
  const page = Math.max(input.page, 1);
  const pageSize = Math.min(Math.max(input.pageSize, 1), 100);
  const offset = (page - 1) * pageSize;

  const whereParts: string[] = [];
  const values: unknown[] = [];

  if (input.senderSearch) {
    values.push(`%${input.senderSearch}%`);
    whereParts.push(`(u.display_name ilike $${values.length} or u.email ilike $${values.length})`);
  }
  if (input.recipientSearch) {
    values.push(`%${input.recipientSearch}%`);
    whereParts.push(`r.recipient_email ilike $${values.length}`);
  }

  const whereClause = whereParts.length ? `where ${whereParts.join(" and ")}` : "";

  const [itemsRes, totalRes] = await Promise.all([
    pool.query<{
      id: string;
      sender_name: string | null;
      sender_email: string | null;
      recipient_email: string;
      event_id: string;
      event_title: string;
      note: string | null;
      sent_at: string;
    }>(
      `select r.id,
              u.display_name as sender_name, u.email as sender_email,
              r.recipient_email, r.event_id,
              e.title as event_title, r.note, r.sent_at
       from recommendations r
       join users u on u.id = r.sender_user_id
       join events e on e.id = r.event_id
       ${whereClause}
       order by r.sent_at desc
       limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, pageSize, offset],
    ),
    pool.query<{ count: string }>(
      `select count(*)::text as count
       from recommendations r
       join users u on u.id = r.sender_user_id
       ${whereClause}`,
      values,
    ),
  ]);

  const total = Number(totalRes.rows[0]?.count ?? "0");
  return {
    items: itemsRes.rows,
    pagination: { page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1), totalItems: total },
  };
}

export async function getRecommendationStats(pool: Pool) {
  const [totalRes, sendersRes, recipientsRes] = await Promise.all([
    pool.query<{ count: string }>("select count(*)::text as count from recommendations"),
    pool.query<{ count: string }>("select count(distinct sender_user_id)::text as count from recommendations"),
    pool.query<{ count: string }>("select count(distinct recipient_email)::text as count from recommendations"),
  ]);
  return {
    total: Number(totalRes.rows[0]?.count ?? "0"),
    uniqueSenders: Number(sendersRes.rows[0]?.count ?? "0"),
    uniqueRecipients: Number(recipientsRes.rows[0]?.count ?? "0"),
  };
}
