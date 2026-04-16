import type { Pool } from "pg";

export type EditSuggestionRow = {
  id: string;
  user_id: string;
  target_type: string;
  target_id: string;
  category: string;
  body: string;
  status: string;
  created_at: string;
};

export async function createEditSuggestion(
  pool: Pool,
  userId: string,
  targetType: string,
  targetId: string,
  category: string,
  body: string,
): Promise<EditSuggestionRow> {
  const result = await pool.query<EditSuggestionRow>(
    `INSERT INTO edit_suggestions (user_id, target_type, target_id, category, body)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, user_id, target_type, target_id, category, body, status, created_at`,
    [userId, targetType, targetId, category, body],
  );
  return result.rows[0];
}
