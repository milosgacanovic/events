import type { FastifyBaseLogger } from "fastify";
import type { Pool } from "pg";

import { config } from "../config";
import {
  findNewMatchingEvents,
  markSavedSearchSent,
  touchSavedSearchEvaluatedAt,
  touchSavedSearchNotifiedAt,
  type DueSavedSearchRow,
} from "../db/savedSearchRepo";
import {
  renderSavedSearchDigestEmail,
  type SavedSearchDigestEvent,
} from "./savedSearchEmailTemplate";
import { sendEmail } from "./emailService";
import type { MeilisearchService } from "./meiliService";
import { buildSeriesMeiliFilters } from "../utils/seriesFilters";
import { filterSnapshotToSeriesInput } from "../utils/filterSnapshotToSeriesInput";

export const DIGEST_CAP = 20;
// First-run lookback cap. New saved searches see events published since
// `created_at`, but never older than 30 days — even if the worker has been
// off for months we don't want a single user receiving a 200-event back-fill.
export const FIRST_RUN_LOOKBACK_DAYS = 30;
// Number of series_ids to pull from Meili. The worker only needs the set the
// user's filter matches; 1000 is comfortably above any realistic per-filter
// distinct series count.
export const MEILI_SERIES_LIMIT = 1000;

export type ProcessResult = { sent: boolean; eventsMarked: number };

/**
 * Process a single due saved search end-to-end:
 *   1. Translate `filter_snapshot` → series filter.
 *   2. Ask Meili for matching series_ids.
 *   3. SQL: find events newly *published* since the last delivery (or search
 *      creation, on first run) whose `series_id` is in the matching set,
 *      excluding events already in `saved_search_sends`.
 *   4. If matches found, render + sendEmail; on success, mark sent + bump
 *      `last_notified_at`. SMTP failures leave both untouched so the next
 *      cycle retries.
 *   5. If no matches, bump `last_evaluated_at` only — UI's "Last sent"
 *      semantic stays accurate.
 */
export async function processSavedSearch(
  pool: Pool,
  meili: MeilisearchService,
  row: DueSavedSearchRow,
  logger: FastifyBaseLogger,
): Promise<ProcessResult> {
  const sinceIso = computeSinceIso(row);

  // Meili window: anything currently upcoming (the snapshot's eventDate
  // preset is layered on top by buildSeriesMeiliFilters). We're matching the
  // filter against series; "newly published" is a Postgres concern.
  const fromUtc = new Date().toISOString();
  const toUtc = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const { input, query } = filterSnapshotToSeriesInput(
    row.filter_snapshot ?? {},
    { fromUtc, toUtc },
  );
  // Only public events count for digest — same as the listing route.
  const filter = [...buildSeriesMeiliFilters(input), `visibility = "public"`];

  const meiliResult = await meili.searchSeries({
    q: query,
    filter,
    limit: MEILI_SERIES_LIMIT,
    attributesToRetrieve: ["series_id"],
  });
  const seriesIds = meiliResult.hits
    .map((h) => h.series_id)
    .filter((id): id is string => Boolean(id));

  if (seriesIds.length === 0) {
    await touchSavedSearchEvaluatedAt(pool, row.id);
    return { sent: false, eventsMarked: 0 };
  }

  // +1 lets us detect "more available" without an extra count query.
  const newMatches = await findNewMatchingEvents(
    pool,
    row.id,
    sinceIso,
    seriesIds,
    DIGEST_CAP + 1,
  );

  if (newMatches.length === 0) {
    await touchSavedSearchEvaluatedAt(pool, row.id);
    return { sent: false, eventsMarked: 0 };
  }

  const events: SavedSearchDigestEvent[] = newMatches.slice(0, DIGEST_CAP).map((r) => ({
    eventId: r.event_id,
    eventSlug: r.event_slug,
    eventTitle: r.event_title,
    startsAtUtc: r.starts_at_utc,
    eventTimezone: r.event_timezone,
    city: r.occ_city,
    countryCode: r.occ_country_code,
  }));
  // If we hit cap+1, we know totalMatches >= cap+1 but not the exact total.
  // Display "see 1+ more" rather than running a separate COUNT — the link
  // takes the user to the full filtered list anyway.
  const totalMatches =
    newMatches.length > DIGEST_CAP ? DIGEST_CAP + 1 : newMatches.length;

  if (!row.user_email) {
    // Defensive: the SQL filters on `email IS NOT NULL`, but the typing is
    // nullable so we re-check. Treat as non-deliverable; advance evaluated_at
    // so we don't re-query every hour.
    await touchSavedSearchEvaluatedAt(pool, row.id);
    return { sent: false, eventsMarked: 0 };
  }

  const filterUrl = buildFilterUrl(row.filter_snapshot ?? {});
  const { subject, html } = renderSavedSearchDigestEmail({
    userDisplayName: row.user_display_name,
    searchLabel: row.label,
    filterSummary: row.label ?? "",
    filterUrl,
    unsubscribeToken: row.unsubscribe_token,
    events,
    totalMatches,
  });

  // sendEmail catches its own SMTP errors and logs them, but if it throws
  // for any other reason we want dedup writes to skip — wrap in a flag so
  // the mark-sent / touch-notified writes only happen on actual delivery.
  let sendSucceeded = false;
  try {
    await sendEmail(row.user_email, subject, html, logger);
    sendSucceeded = true;
  } catch (err) {
    logger.warn({ err, searchId: row.id }, "saved-search digest email threw");
  }

  if (!sendSucceeded) {
    return { sent: false, eventsMarked: 0 };
  }

  // Persist deliveries: dedup table + bump last_notified_at + last_evaluated_at.
  const eventIds = newMatches.slice(0, DIGEST_CAP).map((r) => r.event_id);
  const inserted = await markSavedSearchSent(pool, row.id, eventIds);
  await touchSavedSearchNotifiedAt(pool, row.id);
  return { sent: true, eventsMarked: inserted };
}

export function computeSinceIso(row: DueSavedSearchRow): string {
  const lookbackFloor = new Date(Date.now() - FIRST_RUN_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  if (row.last_notified_at) {
    return new Date(row.last_notified_at).toISOString();
  }
  const createdAt = new Date(row.created_at);
  const since = createdAt > lookbackFloor ? createdAt : lookbackFloor;
  return since.toISOString();
}

export function buildFilterUrl(snapshot: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(snapshot)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      const joined = value.map((v) => String(v)).filter(Boolean).join(",");
      if (joined) params.set(key, joined);
    } else {
      const str = String(value);
      if (str) params.set(key, str);
    }
  }
  const qs = params.toString();
  return `${config.PUBLIC_BASE_URL}/events${qs ? `?${qs}` : ""}`;
}
