import type { Pool } from "pg";

export async function getSetting<T = Record<string, unknown>>(
  pool: Pool,
  key: string,
): Promise<T | null> {
  const result = await pool.query<{ value: T }>(
    `SELECT value FROM admin_settings WHERE key = $1`,
    [key],
  );
  return result.rows[0]?.value ?? null;
}

export async function updateSetting<T = Record<string, unknown>>(
  pool: Pool,
  key: string,
  value: T,
): Promise<T> {
  const result = await pool.query<{ value: T }>(
    `INSERT INTO admin_settings (key, value, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = now()
     RETURNING value`,
    [key, JSON.stringify(value)],
  );
  return result.rows[0].value;
}
