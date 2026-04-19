import { DateTime } from "luxon";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/eventRepo", () => ({
  getEventByIdWithLocation: vi.fn(),
  getEventById: vi.fn(),
  setEventStatus: vi.fn(),
  deleteOccurrencesForEvent: vi.fn(),
  getRecurringPublishedEvents: vi.fn(),
  replaceOccurrencesInWindow: vi.fn(),
}));

vi.mock("../db/seriesRepo", () => ({
  refreshEventSeries: vi.fn().mockResolvedValue(true),
}));

import {
  deleteOccurrencesForEvent,
  getEventById,
  getEventByIdWithLocation,
  replaceOccurrencesInWindow,
  setEventStatus,
} from "../db/eventRepo";
import {
  archiveEvent,
  cancelEvent,
  publishEvent,
  regenerateOccurrences,
  unpublishEvent,
} from "./eventLifecycleService";

const EVENT_ID = "00000000-0000-0000-0000-000000000501";

function makeMeili() {
  return {
    upsertOccurrencesForEvent: vi.fn().mockResolvedValue(undefined),
    deleteOccurrencesByEventId: vi.fn().mockResolvedValue(undefined),
    upsertSeriesDoc: vi.fn().mockResolvedValue(undefined),
    deleteSeriesDoc: vi.fn().mockResolvedValue(undefined),
  };
}

describe("event lifecycle regeneration", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("regenerates recurring occurrences and upserts Meili once", async () => {
    vi.mocked(getEventByIdWithLocation).mockResolvedValue({
      event: {
        id: EVENT_ID,
        schedule_kind: "recurring",
        status: "published",
        event_timezone: "UTC",
        rrule: "FREQ=WEEKLY;COUNT=4",
        rrule_dtstart_local: "2026-03-01T10:00:00.000Z",
        duration_minutes: 90,
      },
      location: null,
    } as never);

    const meili = makeMeili();
    await regenerateOccurrences({} as never, meili as never, EVENT_ID);

    expect(vi.mocked(replaceOccurrencesInWindow)).toHaveBeenCalledTimes(1);
    const call = vi.mocked(replaceOccurrencesInWindow).mock.calls[0];
    const occurrences = call[4] as Array<{ startsAtUtc: string }>;
    expect(new Set(occurrences.map((o) => o.startsAtUtc)).size).toBe(occurrences.length);

    const from = DateTime.fromISO(call[2] as string, { zone: "utc" });
    const to = DateTime.fromISO(call[3] as string, { zone: "utc" });
    const days = to.diff(from, "days").days;
    expect(days).toBeGreaterThan(200);
    expect(days).toBeLessThan(215);
    expect(meili.upsertOccurrencesForEvent).toHaveBeenCalledWith(expect.anything(), EVENT_ID);
  });

  it("noops if the event is missing", async () => {
    vi.mocked(getEventByIdWithLocation).mockResolvedValue(null as never);
    const meili = makeMeili();
    await regenerateOccurrences({} as never, meili as never, EVENT_ID);
    expect(replaceOccurrencesInWindow).not.toHaveBeenCalled();
    expect(meili.upsertOccurrencesForEvent).not.toHaveBeenCalled();
  });

  it("skips Meili side-effects when skipSearch=true", async () => {
    vi.mocked(getEventByIdWithLocation).mockResolvedValue({
      event: {
        id: EVENT_ID,
        schedule_kind: "single",
        status: "published",
        event_timezone: "UTC",
        single_start_at: "2026-04-10T10:00:00.000Z",
        single_end_at: "2026-04-10T11:30:00.000Z",
        duration_minutes: 90,
        series_id: null,
      },
      location: null,
    } as never);
    vi.mocked(getEventById).mockResolvedValue({ id: EVENT_ID, series_id: null } as never);

    const meili = makeMeili();
    await regenerateOccurrences({} as never, meili as never, EVENT_ID, /* skipSearch */ true);

    expect(meili.upsertOccurrencesForEvent).not.toHaveBeenCalled();
    expect(meili.upsertSeriesDoc).not.toHaveBeenCalled();
  });
});

describe("publishEvent", () => {
  afterEach(() => vi.clearAllMocks());

  it("throws event_expired_for_publish when a single event already ended", async () => {
    vi.mocked(getEventById).mockResolvedValue({
      id: EVENT_ID,
      schedule_kind: "single",
      single_end_at: "2020-01-01T00:00:00.000Z",
    } as never);

    const meili = makeMeili();
    await expect(publishEvent({} as never, meili as never, EVENT_ID)).rejects.toThrow(
      "event_expired_for_publish",
    );
    expect(setEventStatus).not.toHaveBeenCalled();
  });

  it("sets status=published for a future single event and regenerates", async () => {
    vi.mocked(getEventById).mockResolvedValue({
      id: EVENT_ID,
      schedule_kind: "single",
      single_end_at: DateTime.utc().plus({ days: 7 }).toISO(),
      series_id: null,
    } as never);
    vi.mocked(getEventByIdWithLocation).mockResolvedValue({
      event: {
        id: EVENT_ID,
        schedule_kind: "single",
        status: "draft",
        event_timezone: "UTC",
        single_start_at: DateTime.utc().plus({ days: 7 }).toISO(),
        single_end_at: DateTime.utc().plus({ days: 7, hours: 2 }).toISO(),
        duration_minutes: 120,
        series_id: null,
      },
      location: null,
    } as never);

    const meili = makeMeili();
    await publishEvent({} as never, meili as never, EVENT_ID);
    expect(setEventStatus).toHaveBeenCalledWith(expect.anything(), EVENT_ID, "published");
    expect(replaceOccurrencesInWindow).toHaveBeenCalled();
  });
});

describe("unpublishEvent / cancelEvent / archiveEvent", () => {
  afterEach(() => vi.clearAllMocks());

  it("unpublishEvent sets status=draft, deletes occurrences in DB and Meili", async () => {
    vi.mocked(getEventById).mockResolvedValue({ id: EVENT_ID, series_id: null } as never);
    const meili = makeMeili();

    await unpublishEvent({ query: vi.fn() } as never, meili as never, EVENT_ID);

    expect(setEventStatus).toHaveBeenCalledWith(expect.anything(), EVENT_ID, "draft");
    expect(deleteOccurrencesForEvent).toHaveBeenCalledWith(expect.anything(), EVENT_ID);
    expect(meili.deleteOccurrencesByEventId).toHaveBeenCalledWith(EVENT_ID);
  });

  it("cancelEvent sets status=cancelled and deletes Meili occurrences but keeps DB rows", async () => {
    vi.mocked(getEventById).mockResolvedValue({ id: EVENT_ID, series_id: null } as never);
    vi.mocked(getEventByIdWithLocation).mockResolvedValue({
      event: {
        id: EVENT_ID,
        schedule_kind: "single",
        status: "cancelled",
        event_timezone: "UTC",
        single_start_at: "2026-04-10T10:00:00.000Z",
        single_end_at: "2026-04-10T11:30:00.000Z",
        duration_minutes: 90,
        series_id: null,
      },
      location: null,
    } as never);

    const meili = makeMeili();
    await cancelEvent({ query: vi.fn() } as never, meili as never, EVENT_ID);

    expect(setEventStatus).toHaveBeenCalledWith(expect.anything(), EVENT_ID, "cancelled");
    expect(deleteOccurrencesForEvent).not.toHaveBeenCalled(); // DB rows preserved
    expect(meili.deleteOccurrencesByEventId).toHaveBeenCalledWith(EVENT_ID);
  });

  it("archiveEvent sets status=archived and purges from DB and Meili", async () => {
    vi.mocked(getEventById).mockResolvedValue({ id: EVENT_ID, series_id: null } as never);
    const meili = makeMeili();

    await archiveEvent({ query: vi.fn() } as never, meili as never, EVENT_ID);

    expect(setEventStatus).toHaveBeenCalledWith(expect.anything(), EVENT_ID, "archived");
    expect(deleteOccurrencesForEvent).toHaveBeenCalledWith(expect.anything(), EVENT_ID);
    expect(meili.deleteOccurrencesByEventId).toHaveBeenCalledWith(EVENT_ID);
  });

  it("lifecycle operations swallow Meili deleteOccurrencesByEventId errors", async () => {
    vi.mocked(getEventById).mockResolvedValue({ id: EVENT_ID, series_id: null } as never);
    const meili = makeMeili();
    meili.deleteOccurrencesByEventId.mockRejectedValueOnce(new Error("meili down"));

    await expect(
      unpublishEvent({ query: vi.fn() } as never, meili as never, EVENT_ID),
    ).resolves.not.toThrow();
    expect(setEventStatus).toHaveBeenCalled();
  });
});
