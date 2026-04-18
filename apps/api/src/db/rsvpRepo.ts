import type { Pool } from "pg";

export type RsvpRow = {
  id: string;
  user_id: string;
  event_id: string;
  occurrence_id: string | null;
  created_at: string;
};

const RSVP_COLUMNS = `id, user_id, event_id, occurrence_id, created_at`;

export async function createRsvp(
  pool: Pool,
  userId: string,
  eventId: string,
  occurrenceId?: string | null,
): Promise<RsvpRow> {
  const result = await pool.query<RsvpRow>(
    `INSERT INTO event_rsvps (user_id, event_id, occurrence_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, event_id, COALESCE(occurrence_id, '00000000-0000-0000-0000-000000000000'))
     DO NOTHING
     RETURNING ${RSVP_COLUMNS}`,
    [userId, eventId, occurrenceId ?? null],
  );
  if (result.rows.length === 0) {
    const existing = await pool.query<RsvpRow>(
      `SELECT ${RSVP_COLUMNS} FROM event_rsvps
       WHERE user_id = $1 AND event_id = $2
         AND COALESCE(occurrence_id, '00000000-0000-0000-0000-000000000000')
           = COALESCE($3::uuid, '00000000-0000-0000-0000-000000000000')`,
      [userId, eventId, occurrenceId ?? null],
    );
    return existing.rows[0];
  }
  return result.rows[0];
}

export async function deleteRsvp(
  pool: Pool,
  userId: string,
  eventId: string,
  occurrenceId?: string | null,
): Promise<boolean> {
  let result;
  if (occurrenceId) {
    result = await pool.query(
      `DELETE FROM event_rsvps WHERE user_id = $1 AND event_id = $2 AND occurrence_id = $3`,
      [userId, eventId, occurrenceId],
    );
  } else {
    result = await pool.query(
      `DELETE FROM event_rsvps WHERE user_id = $1 AND event_id = $2 AND occurrence_id IS NULL`,
      [userId, eventId],
    );
  }
  return (result.rowCount ?? 0) > 0;
}

export async function getRsvpStatus(
  pool: Pool,
  userId: string,
  eventId: string,
  occurrenceId?: string | null,
): Promise<{ going: boolean; occurrenceId: string | null; occurrenceIds: string[] }> {
  const result = await pool.query<RsvpRow>(
    `SELECT ${RSVP_COLUMNS} FROM event_rsvps
     WHERE user_id = $1 AND event_id = $2`,
    [userId, eventId],
  );
  const rows = result.rows;
  const occurrenceIds = rows
    .map((row) => row.occurrence_id)
    .filter((id): id is string => typeof id === "string");
  if (rows.length === 0) {
    return { going: false, occurrenceId: null, occurrenceIds };
  }
  if (occurrenceId) {
    const match = rows.find((row) => row.occurrence_id === occurrenceId);
    return {
      going: !!match,
      occurrenceId: match ? match.occurrence_id : null,
      occurrenceIds,
    };
  }
  return {
    going: true,
    occurrenceId: rows[0].occurrence_id,
    occurrenceIds,
  };
}

export async function getRsvpCount(
  pool: Pool,
  eventId: string,
  occurrenceId?: string | null,
): Promise<number> {
  let result;
  if (occurrenceId) {
    result = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM event_rsvps WHERE event_id = $1 AND occurrence_id = $2`,
      [eventId, occurrenceId],
    );
  } else {
    result = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM event_rsvps WHERE event_id = $1`,
      [eventId],
    );
  }
  return parseInt(result.rows[0].count, 10);
}

export type RsvpListItem = {
  id: string;
  event_id: string;
  occurrence_id: string | null;
  created_at: string;
  event_title: string;
  event_slug: string;
  single_start_at: string | null;
  next_occurrence_start: string | null;
  rsvp_occurrence_start: string | null;
  cover_image_path: string | null;
};

export async function listUserRsvps(
  pool: Pool,
  userId: string,
): Promise<RsvpListItem[]> {
  const result = await pool.query<RsvpListItem>(
    `SELECT
       r.id,
       r.event_id,
       r.occurrence_id,
       r.created_at,
       e.title AS event_title,
       e.slug  AS event_slug,
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
       (
         SELECT eo.starts_at_utc
         FROM event_occurrences eo
         WHERE eo.id = r.occurrence_id
       ) AS rsvp_occurrence_start,
       e.cover_image_path
     FROM event_rsvps r
     JOIN events e ON e.id = r.event_id
     WHERE r.user_id = $1
     ORDER BY COALESCE(
       (SELECT eo3.starts_at_utc FROM event_occurrences eo3 WHERE eo3.id = r.occurrence_id),
       (SELECT eo2.starts_at_utc FROM event_occurrences eo2
        WHERE eo2.event_id = e.id AND eo2.starts_at_utc >= now() AND eo2.status = 'active'
        ORDER BY eo2.starts_at_utc LIMIT 1),
       e.single_start_at,
       r.created_at
     ) ASC`,
    [userId],
  );
  return result.rows;
}
