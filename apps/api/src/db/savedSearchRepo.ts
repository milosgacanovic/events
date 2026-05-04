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
  unsubscribe_token: string;
  unsubscribed_at: string | null;
  last_notified_at: string | null;
  last_evaluated_at: string | null;
  created_at: string;
};

const COLUMNS = `
  id, user_id, label, filter_snapshot, frequency,
  notify_new, notify_reminders, notify_updates,
  unsubscribe_token, unsubscribed_at,
  last_notified_at, last_evaluated_at, created_at
`;

export async function createSavedSearch(
  pool: Pool,
  userId: string,
  data: {
    label?: string;
    filterSnapshot: Record<string, unknown>;
    frequency: string;
  },
): Promise<SavedSearchRow> {
  // Server-side hardcoded: only "new matches" digests are wired up. The
  // notify_reminders / notify_updates columns remain on the table for
  // possible future use on a per-event surface, but are stored as false so
  // they can't accidentally fire if a reminders worker ships later.
  const result = await pool.query<SavedSearchRow>(
    `INSERT INTO saved_searches (user_id, label, filter_snapshot, frequency, notify_new, notify_reminders, notify_updates)
     VALUES ($1, $2, $3, $4, true, false, false)
     RETURNING ${COLUMNS}`,
    [
      userId,
      data.label ?? null,
      JSON.stringify(data.filterSnapshot),
      data.frequency,
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
    paused?: boolean;
  },
): Promise<SavedSearchRow | null> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = 3;

  if (data.label !== undefined) { sets.push(`label = $${idx}`); values.push(data.label); idx++; }
  if (data.frequency !== undefined) { sets.push(`frequency = $${idx}`); values.push(data.frequency); idx++; }
  if (data.paused !== undefined) { sets.push(`unsubscribed_at = ${data.paused ? "now()" : "NULL"}`); }

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

export async function pauseAllSavedSearches(
  pool: Pool,
  userId: string,
  paused: boolean,
): Promise<number> {
  const result = await pool.query(
    paused
      ? `UPDATE saved_searches SET unsubscribed_at = now() WHERE user_id = $1 AND unsubscribed_at IS NULL`
      : `UPDATE saved_searches SET unsubscribed_at = NULL WHERE user_id = $1 AND unsubscribed_at IS NOT NULL`,
    [userId],
  );
  return result.rowCount ?? 0;
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

/* ────────────── Digest worker helpers ────────────── */

export type DueSavedSearchRow = SavedSearchRow & {
  user_email: string | null;
  user_display_name: string | null;
};

/**
 * List saved searches that are "due" for a digest evaluation. The 23h / 6d23h
 * grace windows let the hourly cron drift slightly without pushing the next
 * email out by an entire cycle.
 *
 * `last_evaluated_at` is the throttle: empty checks (no new matches) move it
 * forward but leave `last_notified_at` alone, so the UI's "Last sent" label
 * only reflects actual deliveries.
 */
export async function listDueSavedSearches(pool: Pool, limit = 500): Promise<DueSavedSearchRow[]> {
  const result = await pool.query<DueSavedSearchRow>(
    `
      SELECT
        ss.id, ss.user_id, ss.label, ss.filter_snapshot, ss.frequency,
        ss.notify_new, ss.notify_reminders, ss.notify_updates,
        ss.unsubscribe_token, ss.unsubscribed_at,
        ss.last_notified_at, ss.last_evaluated_at, ss.created_at,
        u.email AS user_email,
        u.display_name AS user_display_name
      FROM saved_searches ss
      JOIN users u ON u.id = ss.user_id
      WHERE ss.unsubscribed_at IS NULL
        AND ss.notify_new = true
        AND u.email IS NOT NULL
        AND (
          ss.last_evaluated_at IS NULL
          OR (ss.frequency = 'daily'  AND ss.last_evaluated_at < now() - interval '23 hours')
          OR (ss.frequency = 'weekly' AND ss.last_evaluated_at < now() - interval '6 days 23 hours')
        )
      ORDER BY ss.last_evaluated_at NULLS FIRST, ss.created_at
      LIMIT $1
    `,
    [limit],
  );
  return result.rows;
}

export type NewMatchRow = {
  event_id: string;
  event_slug: string;
  event_title: string;
  event_timezone: string | null;
  published_at: Date;
  starts_at_utc: Date;
  occ_city: string | null;
  occ_country_code: string | null;
};

/**
 * Find events newly *published* since `sinceIso` whose `series_id` is one of
 * the matching set (returned from a Meili search of the saved-search filter),
 * excluding events already mailed for this saved_search. Returns at most
 * `limit` rows; caller passes `limit + 1` to detect "more available."
 *
 * Ordering: newest published first, so a recent event is always at the top of
 * the digest. The lateral subquery picks the next upcoming occurrence per
 * event for display.
 */
export async function findNewMatchingEvents(
  pool: Pool,
  searchId: string,
  sinceIso: string,
  seriesIds: string[],
  limit: number,
): Promise<NewMatchRow[]> {
  if (seriesIds.length === 0) return [];
  const result = await pool.query<NewMatchRow>(
    `
      SELECT
        e.id              AS event_id,
        e.slug            AS event_slug,
        e.title           AS event_title,
        e.event_timezone,
        e.published_at,
        next_occ.starts_at_utc,
        next_occ.city          AS occ_city,
        next_occ.country_code  AS occ_country_code
      FROM events e
      LEFT JOIN saved_search_sends sss
        ON sss.search_id = $1::uuid AND sss.event_id = e.id
      LEFT JOIN LATERAL (
        SELECT eo.starts_at_utc, eo.city, eo.country_code
        FROM event_occurrences eo
        WHERE eo.event_id = e.id
          AND eo.status = 'published'
          AND eo.starts_at_utc > now()
        ORDER BY eo.starts_at_utc ASC
        LIMIT 1
      ) next_occ ON TRUE
      WHERE e.status = 'published'
        AND e.published_at IS NOT NULL
        AND e.published_at >= $2::timestamptz
        AND e.series_id = ANY($3::uuid[])
        AND sss.event_id IS NULL
        AND next_occ.starts_at_utc IS NOT NULL
      ORDER BY e.published_at DESC, e.id
      LIMIT $4
    `,
    [searchId, sinceIso, seriesIds, limit],
  );
  return result.rows;
}

/** Idempotent dedup write — mirrors `markSent` in alertRepo. */
export async function markSavedSearchSent(
  pool: Pool,
  searchId: string,
  eventIds: string[],
): Promise<number> {
  if (eventIds.length === 0) return 0;
  const result = await pool.query(
    `
      INSERT INTO saved_search_sends (search_id, event_id)
      SELECT $1::uuid, unnest($2::uuid[])
      ON CONFLICT (search_id, event_id) DO NOTHING
    `,
    [searchId, eventIds],
  );
  return result.rowCount ?? 0;
}

export async function touchSavedSearchEvaluatedAt(pool: Pool, searchId: string): Promise<void> {
  await pool.query(
    `UPDATE saved_searches SET last_evaluated_at = now() WHERE id = $1::uuid`,
    [searchId],
  );
}

export async function touchSavedSearchNotifiedAt(pool: Pool, searchId: string): Promise<void> {
  await pool.query(
    `UPDATE saved_searches
     SET last_notified_at = now(), last_evaluated_at = now()
     WHERE id = $1::uuid`,
    [searchId],
  );
}

/**
 * Idempotent unsubscribe — mirrors `unsubscribeByToken` from alertRepo. Returns
 * null both when the token is unknown and when the search is already
 * unsubscribed (the WHERE clause requires `unsubscribed_at IS NULL`). Caller
 * renders the same friendly success page either way to avoid token enumeration.
 */
export async function unsubscribeSavedSearchByToken(
  pool: Pool,
  token: string,
): Promise<SavedSearchRow | null> {
  const result = await pool.query<SavedSearchRow>(
    `
      UPDATE saved_searches
      SET unsubscribed_at = now()
      WHERE unsubscribe_token = $1::uuid AND unsubscribed_at IS NULL
      RETURNING ${COLUMNS}
    `,
    [token],
  );
  return result.rows[0] ?? null;
}
