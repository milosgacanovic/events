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

import { getEventByIdWithLocation, replaceOccurrencesInWindow } from "../db/eventRepo";
import { regenerateOccurrences } from "./eventLifecycleService";

describe("event lifecycle regeneration", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("regenerates recurring occurrences and upserts Meili once", async () => {
    vi.mocked(getEventByIdWithLocation).mockResolvedValue({
      event: {
        id: "00000000-0000-0000-0000-000000000501",
        schedule_kind: "recurring",
        status: "published",
        event_timezone: "UTC",
        rrule: "FREQ=WEEKLY;COUNT=4",
        rrule_dtstart_local: "2026-03-01T10:00:00.000Z",
        duration_minutes: 90,
      },
      location: null,
    } as never);

    const meiliService = {
      upsertOccurrencesForEvent: vi.fn().mockResolvedValue(undefined),
    };

    await regenerateOccurrences({} as never, meiliService as never, "00000000-0000-0000-0000-000000000501");

    expect(vi.mocked(replaceOccurrencesInWindow)).toHaveBeenCalledTimes(1);
    const call = vi.mocked(replaceOccurrencesInWindow).mock.calls[0];
    const occurrences = call[4] as Array<{ startsAtUtc: string }>;
    const starts = occurrences.map((item) => item.startsAtUtc);
    expect(occurrences.length).toBeGreaterThan(0);
    expect(new Set(starts).size).toBe(starts.length);

    const fromIso = call[2] as string;
    const toIso = call[3] as string;
    const from = DateTime.fromISO(fromIso, { zone: "utc" });
    const to = DateTime.fromISO(toIso, { zone: "utc" });
    expect(to.diff(from, "days").days).toBeGreaterThan(390);
    expect(meiliService.upsertOccurrencesForEvent).toHaveBeenCalledWith(
      expect.anything(),
      "00000000-0000-0000-0000-000000000501",
    );
  });
});
