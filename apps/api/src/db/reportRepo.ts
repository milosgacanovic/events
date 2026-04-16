import type { Pool } from "pg";

export type ReportRow = {
  id: string;
  user_id: string;
  target_type: string;
  target_id: string;
  reason: string;
  detail: string | null;
  status: string;
  created_at: string;
};

export async function createReport(
  pool: Pool,
  userId: string,
  targetType: string,
  targetId: string,
  reason: string,
  detail?: string,
): Promise<ReportRow | null> {
  try {
    const result = await pool.query<ReportRow>(
      `INSERT INTO reports (user_id, target_type, target_id, reason, detail)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, user_id, target_type, target_id, reason, detail, status, created_at`,
      [userId, targetType, targetId, reason, detail ?? null],
    );
    return result.rows[0];
  } catch (err: unknown) {
    // Unique constraint violation — user already reported this entity
    if ((err as { code?: string }).code === "23505") return null;
    throw err;
  }
}

export async function hasReported(
  pool: Pool,
  userId: string,
  targetType: string,
  targetId: string,
): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM reports WHERE user_id = $1 AND target_type = $2 AND target_id = $3
     ) AS exists`,
    [userId, targetType, targetId],
  );
  return result.rows[0].exists;
}
