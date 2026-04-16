import { DateTime } from "luxon";
import type { Pool } from "pg";

import {
  deleteOccurrencesForEvent,
  getEventById,
  getEventByIdWithLocation,
  getRecurringPublishedEvents,
  replaceOccurrencesInWindow,
  setEventStatus,
} from "../db/eventRepo";
import { refreshEventSeries } from "../db/seriesRepo";
import { generateOccurrences, horizonForEvent } from "./occurrenceService";
import type { MeilisearchService } from "./meiliService";
import { clearSearchCache } from "./searchCache";

/**
 * Refresh the `event_series` row + sync the Meili series doc for the series
 * this event belongs to. Non-blocking — logs and swallows errors so lifecycle
 * operations don't fail on search-side hiccups (mirrors the pattern used for
 * the occurrence index).
 *
 * If `previousSeriesId` is provided and differs from the event's current
 * series_id, the previous series row is also refreshed so it drops this event
 * from its sibling aggregates (or gets deleted if this was its last sibling).
 * Without this, moving an event between series leaves a stale row behind.
 */
export async function syncSeriesForEvent(
  pool: Pool,
  meiliService: MeilisearchService,
  eventId: string,
  op: string,
  previousSeriesId?: string | null,
  skipSearch = false,
): Promise<void> {
  const event = await getEventById(pool, eventId);
  const seriesId = event?.series_id ?? null;

  const toRefresh = new Set<string>();
  if (seriesId) toRefresh.add(seriesId);
  if (previousSeriesId && previousSeriesId !== seriesId) toRefresh.add(previousSeriesId);

  for (const sid of toRefresh) {
    try {
      const survived = await refreshEventSeries(pool, sid);
      if (!skipSearch) {
        if (survived) {
          await meiliService.upsertSeriesDoc(pool, sid);
        } else {
          await meiliService.deleteSeriesDoc(sid);
        }
      }
    } catch (err) {
      console.error(`[${op}] Failed to sync event_series for series ${sid}:`, err);
    }
  }
}

/**
 * Variant used by the raw-DELETE escape routes in adminContent / events.ts,
 * where the parent event row is already gone so `getEventById` can't give us
 * the series_id. Caller captures `series_id` before DELETE and passes it in.
 */
export async function syncSeriesAfterHardDelete(
  pool: Pool,
  meiliService: MeilisearchService,
  seriesId: string,
): Promise<void> {
  try {
    const survived = await refreshEventSeries(pool, seriesId);
    if (survived) {
      await meiliService.upsertSeriesDoc(pool, seriesId);
    } else {
      await meiliService.deleteSeriesDoc(seriesId);
    }
  } catch (err) {
    console.error(`[hardDelete] Failed to sync event_series for series ${seriesId}:`, err);
  }
}

export async function regenerateOccurrences(
  pool: Pool,
  meiliService: MeilisearchService,
  eventId: string,
  skipSearch = false,
  previousSeriesId?: string | null,
): Promise<void> {
  const eventWithLocation = await getEventByIdWithLocation(pool, eventId);

  if (!eventWithLocation) {
    return;
  }

  const horizon = horizonForEvent(eventWithLocation.event);
  const generated = generateOccurrences(
    eventWithLocation.event,
    eventWithLocation.location,
    horizon,
  );

  await replaceOccurrencesInWindow(
    pool,
    eventId,
    horizon.fromUtc.toISO() ?? DateTime.utc().toISO()!,
    horizon.toUtc.toISO() ?? DateTime.utc().toISO()!,
    generated,
  );

  // Always refresh the event_series DB table so metadata stays consistent
  // (e.g. when the importer uses skipSearch=true). Only skip the Meili sync.
  await syncSeriesForEvent(
    pool,
    meiliService,
    eventId,
    "regenerateOccurrences",
    previousSeriesId,
    skipSearch,
  );

  if (!skipSearch) {
    await meiliService.upsertOccurrencesForEvent(pool, eventId).catch((err) => {
      console.error(`[regenerateOccurrences] Failed to sync Meilisearch for event ${eventId}:`, err);
    });
    clearSearchCache();
  }
}

export async function publishEvent(
  pool: Pool,
  meiliService: MeilisearchService,
  eventId: string,
  skipSearch = false,
): Promise<void> {
  const event = await getEventById(pool, eventId);
  if (
    event?.schedule_kind === "single" &&
    event.single_end_at &&
    DateTime.fromISO(event.single_end_at, { zone: "utc" }) < DateTime.utc()
  ) {
    throw new Error("event_expired_for_publish");
  }

  await setEventStatus(pool, eventId, "published");
  await regenerateOccurrences(pool, meiliService, eventId, skipSearch);
}

export async function unpublishEvent(
  pool: Pool,
  meiliService: MeilisearchService,
  eventId: string,
): Promise<void> {
  await setEventStatus(pool, eventId, "draft");
  await deleteOccurrencesForEvent(pool, eventId);
  await meiliService.deleteOccurrencesByEventId(eventId).catch((err) => {
    console.error(`[unpublishEvent] Failed to delete Meilisearch docs for event ${eventId}:`, err);
  });
  await syncSeriesForEvent(pool, meiliService, eventId, "unpublishEvent");
  clearSearchCache();
}

export async function cancelEvent(
  pool: Pool,
  meiliService: MeilisearchService,
  eventId: string,
): Promise<void> {
  await setEventStatus(pool, eventId, "cancelled");
  // Keep DB occurrences — the detail page renders upcoming dates with a
  // "cancelled" banner straight from Postgres, so users who follow a direct
  // URL still see when it was supposed to happen. But purge from Meili so
  // cancelled events disappear from public browsing (list, map, series).
  await regenerateOccurrences(pool, meiliService, eventId, /* skipSearch */ true);
  await meiliService.deleteOccurrencesByEventId(eventId).catch((err) => {
    console.error(`[cancelEvent] Failed to delete Meilisearch docs for event ${eventId}:`, err);
  });
  await syncSeriesForEvent(pool, meiliService, eventId, "cancelEvent");
  clearSearchCache();
}

export async function archiveEvent(
  pool: Pool,
  meiliService: MeilisearchService,
  eventId: string,
): Promise<void> {
  await setEventStatus(pool, eventId, "archived");
  await deleteOccurrencesForEvent(pool, eventId);
  await meiliService.deleteOccurrencesByEventId(eventId).catch((err) => {
    console.error(`[archiveEvent] Failed to delete Meilisearch docs for event ${eventId}:`, err);
  });
  await syncSeriesForEvent(pool, meiliService, eventId, "archiveEvent");
  clearSearchCache();
}

export async function refreshRecurringOccurrences(
  pool: Pool,
  meiliService: MeilisearchService,
): Promise<void> {
  const recurring = await getRecurringPublishedEvents(pool);

  // Clean up old occurrences from DB before syncing to Meilisearch, so the
  // subsequent upsert sees the authoritative post-cleanup state and stale
  // occurrence documents are not re-added to the search index.
  const cleanupBefore = DateTime.utc().minus({ days: 30 });
  await pool.query(`delete from event_occurrences where starts_at_utc < $1::timestamptz`, [
    cleanupBefore.toISO(),
  ]);

  const touchedSeriesIds = new Set<string>();
  for (const event of recurring) {
    const eventWithLocation = await getEventByIdWithLocation(pool, event.id);
    if (!eventWithLocation) {
      continue;
    }

    // Horizon is frequency-aware per event: daily series get 90d, weekly 180d,
    // monthly 365d, yearly 730d. Single-event fallback is 180d.
    const horizon = horizonForEvent(eventWithLocation.event);
    const generated = generateOccurrences(
      eventWithLocation.event,
      eventWithLocation.location,
      horizon,
    );

    await replaceOccurrencesInWindow(
      pool,
      event.id,
      horizon.fromUtc.toISO() ?? DateTime.utc().toISO()!,
      horizon.toUtc.toISO() ?? DateTime.utc().toISO()!,
      generated,
    );

    await meiliService.upsertOccurrencesForEvent(pool, event.id).catch((err) => {
      console.error(`[refreshRecurringOccurrences] Failed to sync Meilisearch for event ${event.id}:`, err);
    });

    if (eventWithLocation.event.series_id) {
      touchedSeriesIds.add(eventWithLocation.event.series_id);
    }
  }

  // Refresh series rows + Meili docs for every series touched this run.
  // Canonical rotation happens naturally inside refreshEventSeries when the
  // prior canonical's earliest-upcoming has passed.
  for (const seriesId of touchedSeriesIds) {
    try {
      const survived = await refreshEventSeries(pool, seriesId);
      if (survived) {
        await meiliService.upsertSeriesDoc(pool, seriesId);
      } else {
        await meiliService.deleteSeriesDoc(seriesId);
      }
    } catch (err) {
      console.error(
        `[refreshRecurringOccurrences] Failed to sync event_series for series ${seriesId}:`,
        err,
      );
    }
  }

  clearSearchCache();
}
