import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";

import { generateOccurrences } from "./occurrenceService";

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
