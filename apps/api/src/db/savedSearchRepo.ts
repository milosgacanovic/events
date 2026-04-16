import type { Pool } from "pg";

export type SavedSearchRow = {
  id: string;
  user_id: string;
  label: string | null;
  filter_snapshot: Record<string, unknown>;
  frequency: string;
  notify_new: boolean;
  notify_reminders: boolean;
  notify_updates: boolean;
  unsubscribed_at: string | null;
  last_notified_at: string | null;
  created_at: string;
};

const COLUMNS = `
  id, user_id, label, filter_snapshot, frequency,
  notify_new, notify_reminders, notify_updates,
  unsubscribed_at, last_notified_at, created_at
`;

export async function createSavedSearch(
  pool: Pool,
  userId: string,
  data: {
    label?: string;
    filterSnapshot: Record<string, unknown>;
    frequency: string;
    notifyNew: boolean;
    notifyReminders: boolean;
    notifyUpdates: boolean;
  },
): Promise<SavedSearchRow> {
  const result = await pool.query<SavedSearchRow>(
    `INSERT INTO saved_searches (user_id, label, filter_snapshot, frequency, notify_new, notify_reminders, notify_updates)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${COLUMNS}`,
    [
      userId,
      data.label ?? null,
      JSON.stringify(data.filterSnapshot),
      data.frequency,
      data.notifyNew,
      data.notifyReminders,
      data.notifyUpdates,
    ],
  );
  return result.rows[0];
}

export async function updateSavedSearch(
  pool: Pool,
  userId: string,
  searchId: string,
  data: {
    label?: string;
    frequency?: string;
    notifyNew?: boolean;
    notifyReminders?: boolean;
    notifyUpdates?: boolean;
  },
): Promise<SavedSearchRow | null> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = 3;

  if (data.label !== undefined) { sets.push(`label = $${idx}`); values.push(data.label); idx++; }
  if (data.frequency !== undefined) { sets.push(`frequency = $${idx}`); values.push(data.frequency); idx++; }
  if (data.notifyNew !== undefined) { sets.push(`notify_new = $${idx}`); values.push(data.notifyNew); idx++; }
  if (data.notifyReminders !== undefined) { sets.push(`notify_reminders = $${idx}`); values.push(data.notifyReminders); idx++; }
  if (data.notifyUpdates !== undefined) { sets.push(`notify_updates = $${idx}`); values.push(data.notifyUpdates); idx++; }

  if (sets.length === 0) return null;

  const result = await pool.query<SavedSearchRow>(
    `UPDATE saved_searches SET ${sets.join(", ")}
     WHERE id = $1 AND user_id = $2
     RETURNING ${COLUMNS}`,
    [searchId, userId, ...values],
  );
  return result.rows[0] ?? null;
}

export async function deleteSavedSearch(
  pool: Pool,
  userId: string,
  searchId: string,
): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM saved_searches WHERE id = $1 AND user_id = $2`,
    [searchId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function listSavedSearches(
  pool: Pool,
  userId: string,
): Promise<SavedSearchRow[]> {
  const result = await pool.query<SavedSearchRow>(
    `SELECT ${COLUMNS} FROM saved_searches
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId],
  );
  return result.rows;
}
