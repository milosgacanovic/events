import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";

import { generateOccurrences, horizonForEvent } from "./occurrenceService";

const baseEvent = {
  id: "11111111-1111-1111-1111-111111111111",
  slug: "weekly-dance",
  title: "Weekly Dance",
  description_json: {},
  external_source: null,
  external_id: null,
  is_imported: false,
  import_source: null,
  cover_image_path: null,
  external_url: null,
  attendance_mode: "in_person" as const,
  online_url: null,
  practice_category_id: "22222222-2222-2222-2222-222222222222",
  practice_subcategory_id: null,
  event_format_id: null,
  tags: ["ecstatic"],
  languages: ["en"],
  schedule_kind: "recurring" as const,
  event_timezone: "UTC",
  single_start_at: null,
  single_end_at: null,
  rrule: "FREQ=WEEKLY;COUNT=4",
  rrule_dtstart_local: "2026-01-01T10:00:00Z",
  duration_minutes: 90,
  status: "published" as const,
  visibility: "public" as const,
  published_at: null,
  created_by_user_id: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  series_id: "11111111-1111-1111-1111-111111111111",
};

describe("generateOccurrences", () => {
  it("generates single occurrence for single events in horizon", () => {
    const event = {
      ...baseEvent,
      schedule_kind: "single" as const,
      single_start_at: "2026-02-02T18:00:00Z",
      single_end_at: "2026-02-02T20:00:00Z",
      rrule: null,
      rrule_dtstart_local: null,
      duration_minutes: null,
    };

    const occurrences = generateOccurrences(event, null, {
      fromUtc: DateTime.fromISO("2026-02-01T00:00:00Z"),
      toUtc: DateTime.fromISO("2026-02-10T00:00:00Z"),
    });

    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].startsAtUtc).toBe("2026-02-02T18:00:00.000Z");
  });

  it("generates recurring occurrences in horizon window", () => {
    const occurrences = generateOccurrences(baseEvent, null, {
      fromUtc: DateTime.fromISO("2025-12-25T00:00:00Z"),
      toUtc: DateTime.fromISO("2026-02-15T00:00:00Z"),
    });

    expect(occurrences).toHaveLength(4);
    expect(occurrences[0].startsAtUtc).toContain("2026-01-01T10:00:00");
  });

  it("skips EXDATE entries when present", () => {
    const event = {
      ...baseEvent,
      rrule: "RRULE:FREQ=WEEKLY;COUNT=4\nEXDATE:20260108T100000Z,20260115T100000Z",
    };
    const occurrences = generateOccurrences(event, null, {
      fromUtc: DateTime.fromISO("2025-12-25T00:00:00Z"),
      toUtc: DateTime.fromISO("2026-02-15T00:00:00Z"),
    });

    expect(occurrences).toHaveLength(2);
    expect(occurrences[0].startsAtUtc).toContain("2026-01-01T10:00:00");
    expect(occurrences[1].startsAtUtc).toContain("2026-01-22T10:00:00");
  });

  it("generates monthly BYMONTHDAY occurrences", () => {
    const event = {
      ...baseEvent,
      rrule: "FREQ=MONTHLY;BYMONTHDAY=15;COUNT=3",
      rrule_dtstart_local: "2026-01-15T18:00:00Z",
    };
    const occurrences = generateOccurrences(event, null, {
      fromUtc: DateTime.fromISO("2026-01-01T00:00:00Z"),
      toUtc: DateTime.fromISO("2026-06-01T00:00:00Z"),
    });

    expect(occurrences).toHaveLength(3);
    expect(occurrences[0].startsAtUtc).toContain("2026-01-15T18:00:00");
    expect(occurrences[1].startsAtUtc).toContain("2026-02-15T18:00:00");
    expect(occurrences[2].startsAtUtc).toContain("2026-03-15T18:00:00");
  });

  it("generates monthly BYDAY with BYSETPOS occurrences (first Saturday)", () => {
    const event = {
      ...baseEvent,
      rrule: "FREQ=MONTHLY;BYDAY=SA;BYSETPOS=1;COUNT=3",
      rrule_dtstart_local: "2026-01-03T18:00:00Z",
    };
    const occurrences = generateOccurrences(event, null, {
      fromUtc: DateTime.fromISO("2026-01-01T00:00:00Z"),
      toUtc: DateTime.fromISO("2026-06-01T00:00:00Z"),
    });

    expect(occurrences).toHaveLength(3);
    // First Saturdays of Jan/Feb/Mar 2026: Jan 3, Feb 7, Mar 7
    expect(occurrences[0].startsAtUtc).toContain("2026-01-03");
    expect(occurrences[1].startsAtUtc).toContain("2026-02-07");
    expect(occurrences[2].startsAtUtc).toContain("2026-03-07");
  });

  it("generates daily occurrences", () => {
    const event = {
      ...baseEvent,
      rrule: "FREQ=DAILY;COUNT=5",
      rrule_dtstart_local: "2026-01-01T09:00:00Z",
    };
    const occurrences = generateOccurrences(event, null, {
      fromUtc: DateTime.fromISO("2025-12-30T00:00:00Z"),
      toUtc: DateTime.fromISO("2026-01-31T00:00:00Z"),
    });

    expect(occurrences).toHaveLength(5);
    expect(occurrences[4].startsAtUtc).toContain("2026-01-05T09:00:00");
  });

  it("generates yearly occurrences", () => {
    const event = {
      ...baseEvent,
      rrule: "FREQ=YEARLY;COUNT=3",
      rrule_dtstart_local: "2026-06-15T18:00:00Z",
    };
    // Horizon only covers ~4 months → only one occurrence (2026-06-15)
    const occurrences = generateOccurrences(event, null, {
      fromUtc: DateTime.fromISO("2026-05-01T00:00:00Z"),
      toUtc: DateTime.fromISO("2026-09-01T00:00:00Z"),
    });

    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].startsAtUtc).toContain("2026-06-15T18:00:00");
  });

  it("handles rrule_dtstart_local as a JS Date (pg driver output)", () => {
    const event = {
      ...baseEvent,
      rrule: "FREQ=WEEKLY;COUNT=3",
      // Mirrors what the pg driver returns for a timestamptz column
      rrule_dtstart_local: new Date("2026-01-01T10:00:00Z") as unknown as string,
    };
    const occurrences = generateOccurrences(event, null, {
      fromUtc: DateTime.fromISO("2025-12-25T00:00:00Z"),
      toUtc: DateTime.fromISO("2026-02-15T00:00:00Z"),
    });

    expect(occurrences).toHaveLength(3);
    expect(occurrences[0].startsAtUtc).toContain("2026-01-01T10:00:00");
  });

  it("handles legacy single-line rrule strings (backwards compat)", () => {
    const event = {
      ...baseEvent,
      // No RRULE: prefix, no EXDATE — the shape every existing row has
      rrule: "FREQ=WEEKLY;COUNT=3",
    };
    const occurrences = generateOccurrences(event, null, {
      fromUtc: DateTime.fromISO("2025-12-25T00:00:00Z"),
      toUtc: DateTime.fromISO("2026-02-15T00:00:00Z"),
    });

    expect(occurrences).toHaveLength(3);
  });
});

describe("horizonForEvent", () => {
  const base = {
    rrule: null as string | null,
    schedule_kind: "single" as "single" | "recurring",
  };

  it("single events get the 180d fallback", () => {
    const h = horizonForEvent({ ...base, schedule_kind: "single", rrule: null });
    const diff = h.toUtc.diff(h.fromUtc, "days").days;
    // 30d past + 180d forward = 210d window
    expect(Math.round(diff)).toBe(210);
  });

  it("recurring DAILY gets 90d forward horizon", () => {
    const h = horizonForEvent({ schedule_kind: "recurring", rrule: "FREQ=DAILY;COUNT=400" });
    const forward = h.toUtc.diff(DateTime.utc(), "days").days;
    expect(Math.round(forward)).toBe(90);
  });

  it("recurring WEEKLY gets 180d forward horizon", () => {
    const h = horizonForEvent({ schedule_kind: "recurring", rrule: "FREQ=WEEKLY;BYDAY=MO" });
    const forward = h.toUtc.diff(DateTime.utc(), "days").days;
    expect(Math.round(forward)).toBe(180);
  });

  it("recurring MONTHLY gets 365d forward horizon", () => {
    const h = horizonForEvent({ schedule_kind: "recurring", rrule: "FREQ=MONTHLY;BYMONTHDAY=15" });
    const forward = h.toUtc.diff(DateTime.utc(), "days").days;
    expect(Math.round(forward)).toBe(365);
  });

  it("recurring YEARLY gets 730d forward horizon (so 'this year + next year' are visible)", () => {
    const h = horizonForEvent({ schedule_kind: "recurring", rrule: "FREQ=YEARLY" });
    const forward = h.toUtc.diff(DateTime.utc(), "days").days;
    expect(Math.round(forward)).toBe(730);
  });

  it("RFC 5545 multi-line rrule still matches FREQ token", () => {
    const h = horizonForEvent({
      schedule_kind: "recurring",
      rrule: "RRULE:FREQ=WEEKLY;BYDAY=TU\nEXDATE:20260704T190000Z",
    });
    const forward = h.toUtc.diff(DateTime.utc(), "days").days;
    expect(Math.round(forward)).toBe(180);
  });

  it("recurring with no FREQ token falls back to 180d", () => {
    const h = horizonForEvent({ schedule_kind: "recurring", rrule: "garbage" });
    const forward = h.toUtc.diff(DateTime.utc(), "days").days;
    expect(Math.round(forward)).toBe(180);
  });

  it("past window is always 30d", () => {
    const h = horizonForEvent({ schedule_kind: "recurring", rrule: "FREQ=DAILY" });
    const past = DateTime.utc().diff(h.fromUtc, "days").days;
    expect(Math.round(past)).toBe(30);
  });
});

describe("generateOccurrences with frequency-aware default horizon", () => {
  it("DAILY event materializes only ~90 days forward (not 365)", () => {
    // No explicit horizon passed — exercises the FREQ-aware default.
    // dtstart 45 days in the past so the 30d-past window is fully covered.
    const event = {
      ...baseEvent,
      rrule: "FREQ=DAILY",
      rrule_dtstart_local: DateTime.utc().minus({ days: 45 }).toISO(),
    };
    const occurrences = generateOccurrences(event, null);
    // 30d past + 90d forward = ~120 rows (±DST slack).
    // Old 365d horizon would have produced ~395 rows.
    expect(occurrences.length).toBeGreaterThan(110);
    expect(occurrences.length).toBeLessThan(130);
  });
});
