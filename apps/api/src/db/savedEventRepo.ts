import type { Pool } from "pg";

export type SavedEventRow = {
  id: string;
  user_id: string;
  event_id: string;
  occurrence_id: string | null;
  scope: string;
  created_at: string;
};

const SAVED_EVENT_COLUMNS = `
  id, user_id, event_id, occurrence_id, scope, created_at
`;

export async function saveEvent(
  pool: Pool,
  userId: string,
  eventId: string,
  occurrenceId?: string | null,
  scope: string = "all",
): Promise<SavedEventRow> {
  const result = await pool.query<SavedEventRow>(
    `INSERT INTO saved_events (user_id, event_id, occurrence_id, scope)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, event_id, COALESCE(occurrence_id, '00000000-0000-0000-0000-000000000000'))
     DO NOTHING
     RETURNING ${SAVED_EVENT_COLUMNS}`,
    [userId, eventId, occurrenceId ?? null, scope],
  );
  // If conflict (already saved), fetch the existing row
  if (result.rows.length === 0) {
    const existing = await pool.query<SavedEventRow>(
      `SELECT ${SAVED_EVENT_COLUMNS} FROM saved_events
       WHERE user_id = $1 AND event_id = $2
         AND COALESCE(occurrence_id, '00000000-0000-0000-0000-000000000000')
           = COALESCE($3::uuid, '00000000-0000-0000-0000-000000000000')`,
      [userId, eventId, occurrenceId ?? null],
    );
    return existing.rows[0];
  }
  return result.rows[0];
}

export async function unsaveEvent(
  pool: Pool,
  userId: string,
  eventId: string,
  occurrenceId?: string | null,
): Promise<boolean> {
  let result;
  if (occurrenceId) {
    result = await pool.query(
      `DELETE FROM saved_events WHERE user_id = $1 AND event_id = $2 AND occurrence_id = $3`,
      [userId, eventId, occurrenceId],
    );
  } else {
    // Delete the "all sessions" save (occurrence_id IS NULL)
    result = await pool.query(
      `DELETE FROM saved_events WHERE user_id = $1 AND event_id = $2 AND occurrence_id IS NULL`,
      [userId, eventId],
    );
  }
  return (result.rowCount ?? 0) > 0;
}

export async function isSaved(
  pool: Pool,
  userId: string,
  eventId: string,
): Promise<{ saved: boolean; scope: string | null; occurrenceId: string | null }> {
  const result = await pool.query<SavedEventRow>(
    `SELECT ${SAVED_EVENT_COLUMNS} FROM saved_events
     WHERE user_id = $1 AND event_id = $2 LIMIT 1`,
    [userId, eventId],
  );
  if (result.rows.length === 0) {
    return { saved: false, scope: null, occurrenceId: null };
  }
  return {
    saved: true,
    scope: result.rows[0].scope,
    occurrenceId: result.rows[0].occurrence_id,
  };
}

export type SavedEventListItem = {
  id: string;
  event_id: string;
  occurrence_id: string | null;
  scope: string;
  created_at: string;
  event_title: string;
  event_slug: string;
  event_status: string;
  single_start_at: string | null;
  next_occurrence_start: string | null;
  cover_image_path: string | null;
};

export async function listSavedEvents(
  pool: Pool,
  userId: string,
): Promise<SavedEventListItem[]> {
  const result = await pool.query<SavedEventListItem>(
    `SELECT
       se.id,
       se.event_id,
       se.occurrence_id,
       se.scope,
       se.created_at,
       e.title AS event_title,
       e.slug  AS event_slug,
       e.status AS event_status,
       e.single_start_at,
       (
         SELECT eo.starts_at_utc
         FROM event_occurrences eo
         WHERE eo.event_id = e.id
           AND eo.starts_at_utc >= now()
           AND eo.status = 'active'
         ORDER BY eo.starts_at_utc
         LIMIT 1
       ) AS next_occurrence_start,
       e.cover_image_path
     FROM saved_events se
     JOIN events e ON e.id = se.event_id
     WHERE se.user_id = $1
     ORDER BY COALESCE(
       (SELECT eo2.starts_at_utc FROM event_occurrences eo2
        WHERE eo2.event_id = e.id AND eo2.starts_at_utc >= now() AND eo2.status = 'active'
        ORDER BY eo2.starts_at_utc LIMIT 1),
       e.single_start_at,
       se.created_at
     ) ASC`,
    [userId],
  );
  return result.rows;
}

/** Batch check: returns a Set of event IDs that the user has saved. */
export async function savedEventIds(
  pool: Pool,
  userId: string,
  eventIds: string[],
): Promise<Set<string>> {
  if (eventIds.length === 0) return new Set();
  const result = await pool.query<{ event_id: string }>(
    `SELECT DISTINCT event_id FROM saved_events
     WHERE user_id = $1 AND event_id = ANY($2::uuid[])`,
    [userId, eventIds],
  );
  return new Set(result.rows.map((r) => r.event_id));
}
