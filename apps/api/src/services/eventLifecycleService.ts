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
import { generateOccurrences, defaultOccurrenceHorizon } from "./occurrenceService";
import type { MeilisearchService } from "./meiliService";
import { clearSearchCache } from "./searchCache";

export async function regenerateOccurrences(
  pool: Pool,
  meiliService: MeilisearchService,
  eventId: string,
): Promise<void> {
  const eventWithLocation = await getEventByIdWithLocation(pool, eventId);

  if (!eventWithLocation) {
    return;
  }

  const horizon = defaultOccurrenceHorizon();
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

  await meiliService.upsertOccurrencesForEvent(pool, eventId).catch(() => {});
  clearSearchCache();
}

export async function publishEvent(
  pool: Pool,
  meiliService: MeilisearchService,
  eventId: string,
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
  await regenerateOccurrences(pool, meiliService, eventId);
}

export async function unpublishEvent(
  pool: Pool,
  meiliService: MeilisearchService,
  eventId: string,
): Promise<void> {
  await setEventStatus(pool, eventId, "draft");
  await deleteOccurrencesForEvent(pool, eventId);
  await meiliService.deleteOccurrencesByEventId(eventId).catch(() => {});
  clearSearchCache();
}

export async function cancelEvent(
  pool: Pool,
  meiliService: MeilisearchService,
  eventId: string,
): Promise<void> {
  await setEventStatus(pool, eventId, "cancelled");
  await regenerateOccurrences(pool, meiliService, eventId);
}

export async function refreshRecurringOccurrences(
  pool: Pool,
  meiliService: MeilisearchService,
): Promise<void> {
  const horizon = defaultOccurrenceHorizon();
  const recurring = await getRecurringPublishedEvents(pool);

  for (const event of recurring) {
    const eventWithLocation = await getEventByIdWithLocation(pool, event.id);
    if (!eventWithLocation) {
      continue;
    }

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

    await meiliService.upsertOccurrencesForEvent(pool, event.id).catch(() => {});
  }

  const cleanupBefore = DateTime.utc().minus({ days: 30 });
  await pool.query(`delete from event_occurrences where starts_at_utc < $1::timestamptz`, [
    cleanupBefore.toISO(),
  ]);
  clearSearchCache();
}
