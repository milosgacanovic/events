import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";

import { generateOccurrences } from "./occurrenceService";

const baseEvent = {
  id: "11111111-1111-1111-1111-111111111111",
  slug: "weekly-dance",
  title: "Weekly Dance",
  description_json: {},
  cover_image_path: null,
  external_url: null,
  attendance_mode: "in_person" as const,
  online_url: null,
  practice_category_id: "22222222-2222-2222-2222-222222222222",
  practice_subcategory_id: null,
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
});
