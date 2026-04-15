import { describe, expect, it } from "vitest";

import { deriveSeriesCadence } from "./seriesCadenceService";

const baseEvent = {
  rrule: null as string | null,
  rrule_dtstart_local: null as string | null,
  duration_minutes: null as number | null,
  event_timezone: "Europe/Belgrade",
  schedule_kind: "single" as "single" | "recurring",
};

function wedUtc(dateStr: string, hh: number, mm: number): string {
  // Belgrade is UTC+1 in winter, UTC+2 in summer. We'll build UTC instants
  // that land at the given local (Belgrade) hour on the given date.
  // Caller picks consistent winter/summer to avoid DST surprises in the fixture.
  const d = new Date(`${dateStr}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00Z`);
  return d.toISOString();
}

describe("deriveSeriesCadence", () => {
  it("returns weekly cadence for a native FREQ=WEEKLY;BYDAY=WE rrule", () => {
    const event = {
      ...baseEvent,
      schedule_kind: "recurring" as const,
      rrule: "FREQ=WEEKLY;BYDAY=WE",
      rrule_dtstart_local: "2026-05-06T21:00:00",
      duration_minutes: 120,
      event_timezone: "Europe/Belgrade",
    };
    const cadence = deriveSeriesCadence(event, []);
    expect(cadence).toEqual({
      kind: "weekly",
      weekday: 3, // Luxon: 3=Wednesday
      startLocalHHMM: "21:00",
      endLocalHHMM: "23:00",
      timezone: "Europe/Belgrade",
    });
  });

  it("returns null for a native FREQ=DAILY rrule", () => {
    const event = {
      ...baseEvent,
      schedule_kind: "recurring" as const,
      rrule: "FREQ=DAILY",
      rrule_dtstart_local: "2026-05-06T09:00:00",
      duration_minutes: 60,
    };
    // Provide multiple upcoming on different weekdays so inferred-path also fails
    const upcoming = [
      { starts_at_utc: "2026-05-06T07:00:00.000Z", ends_at_utc: "2026-05-06T08:00:00.000Z" },
      { starts_at_utc: "2026-05-07T07:00:00.000Z", ends_at_utc: "2026-05-07T08:00:00.000Z" },
    ];
    expect(deriveSeriesCadence(event, upcoming)).toBeNull();
  });

  it("returns null for a native FREQ=WEEKLY rrule with multiple BYDAY", () => {
    const event = {
      ...baseEvent,
      schedule_kind: "recurring" as const,
      rrule: "FREQ=WEEKLY;BYDAY=MO,WE,FR",
      rrule_dtstart_local: "2026-05-04T18:00:00",
      duration_minutes: 60,
    };
    // Mixed weekdays in upcoming → inferred path also returns null
    const upcoming = [
      { starts_at_utc: "2026-05-04T16:00:00.000Z", ends_at_utc: "2026-05-04T17:00:00.000Z" },
      { starts_at_utc: "2026-05-06T16:00:00.000Z", ends_at_utc: "2026-05-06T17:00:00.000Z" },
    ];
    expect(deriveSeriesCadence(event, upcoming)).toBeNull();
  });

  it("infers weekly cadence from imported sibling occurrences (all same weekday+time)", () => {
    const event = {
      ...baseEvent,
      schedule_kind: "single" as const,
      event_timezone: "Europe/Belgrade",
    };
    // Belgrade summer is UTC+2, so 19:00Z → 21:00 local. Each row is a Wednesday 21:00–23:00.
    const upcoming = [
      { starts_at_utc: "2026-05-06T19:00:00.000Z", ends_at_utc: "2026-05-06T21:00:00.000Z" },
      { starts_at_utc: "2026-05-13T19:00:00.000Z", ends_at_utc: "2026-05-13T21:00:00.000Z" },
      { starts_at_utc: "2026-05-20T19:00:00.000Z", ends_at_utc: "2026-05-20T21:00:00.000Z" },
    ];
    expect(deriveSeriesCadence(event, upcoming)).toEqual({
      kind: "weekly",
      weekday: 3,
      startLocalHHMM: "21:00",
      endLocalHHMM: "23:00",
      timezone: "Europe/Belgrade",
    });
  });

  it("returns null when imported siblings span different weekdays", () => {
    const event = {
      ...baseEvent,
      schedule_kind: "single" as const,
      event_timezone: "Europe/Belgrade",
    };
    const upcoming = [
      { starts_at_utc: "2026-05-06T19:00:00.000Z", ends_at_utc: "2026-05-06T21:00:00.000Z" }, // Wed
      { starts_at_utc: "2026-05-14T19:00:00.000Z", ends_at_utc: "2026-05-14T21:00:00.000Z" }, // Thu
    ];
    expect(deriveSeriesCadence(event, upcoming)).toBeNull();
  });

  it("returns null when imported siblings share weekday but have different start times", () => {
    const event = {
      ...baseEvent,
      schedule_kind: "single" as const,
      event_timezone: "Europe/Belgrade",
    };
    const upcoming = [
      { starts_at_utc: "2026-05-06T19:00:00.000Z", ends_at_utc: "2026-05-06T21:00:00.000Z" }, // Wed 21:00
      { starts_at_utc: "2026-05-13T18:00:00.000Z", ends_at_utc: "2026-05-13T20:00:00.000Z" }, // Wed 20:00
    ];
    expect(deriveSeriesCadence(event, upcoming)).toBeNull();
  });

  it("returns null for a single occurrence (insufficient signal)", () => {
    const event = {
      ...baseEvent,
      schedule_kind: "single" as const,
    };
    const upcoming = [
      { starts_at_utc: "2026-05-06T19:00:00.000Z", ends_at_utc: "2026-05-06T21:00:00.000Z" },
    ];
    expect(deriveSeriesCadence(event, upcoming)).toBeNull();
  });

  it("returns null for empty upcoming when not a native rrule", () => {
    const event = {
      ...baseEvent,
      schedule_kind: "single" as const,
    };
    expect(deriveSeriesCadence(event, [])).toBeNull();
  });
});
