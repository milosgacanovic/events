import { describe, expect, it, vi } from "vitest";

import { createEvent, replaceOccurrencesInWindow, updateEvent } from "./eventRepo";

describe("eventRepo external reference persistence", () => {
  it("persists externalSource/externalId on create", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ id: "00000000-0000-0000-0000-000000000010", slug: "event-1" }],
    });
    const pool = { query } as never;

    await createEvent(pool, "00000000-0000-0000-0000-000000000001", {
      title: "Event 1",
      descriptionJson: {},
      attendanceMode: "in_person",
      onlineUrl: null,
      practiceCategoryId: "11111111-1111-1111-1111-111111111111",
      practiceSubcategoryId: null,
      tags: [],
      languages: [],
      scheduleKind: "single",
      eventTimezone: "UTC",
      singleStartAt: "2026-03-20T19:00:00.000Z",
      singleEndAt: "2026-03-20T21:00:00.000Z",
      rrule: null,
      rruleDtstartLocal: null,
      durationMinutes: null,
      visibility: "public",
      locationId: null,
      organizerRoles: [],
      externalSource: "smoke_test",
      externalId: "evt-1",
      coverImagePath: null,
      externalUrl: null,
    });

    const insertCall = query.mock.calls.find((call) => typeof call[0] === "string" && call[0].includes("insert into events"));
    const sql = insertCall?.[0] as string;
    const params = insertCall?.[1] as unknown[];
    expect(sql).toContain("external_source");
    expect(sql).toContain("external_id");
    expect(params).toContain("smoke_test");
    expect(params).toContain("evt-1");
  });

  it("persists null externalSource/externalId on patch clear", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ id: "00000000-0000-0000-0000-000000000010", slug: "event-1" }],
    });
    const pool = { query } as never;

    await updateEvent(pool, "00000000-0000-0000-0000-000000000010", {
      externalSource: null,
      externalId: null,
    });

    const sql = query.mock.calls[0][0] as string;
    const params = query.mock.calls[0][1] as unknown[];
    expect(sql).toContain("external_source = $2");
    expect(sql).toContain("external_id = $3");
    expect(params).toEqual([
      "00000000-0000-0000-0000-000000000010",
      null,
      null,
    ]);
  });

  it("replaces single-event occurrences with full wipe and one insert", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ schedule_kind: "single" }],
      })
      .mockResolvedValue({ rows: [] });
    const pool = { query } as never;

    await replaceOccurrencesInWindow(
      pool,
      "00000000-0000-0000-0000-000000000010",
      "2026-01-01T00:00:00.000Z",
      "2026-12-31T23:59:59.000Z",
      [
        {
          eventId: "00000000-0000-0000-0000-000000000010",
          startsAtUtc: "2026-03-20T19:00:00.000Z",
          endsAtUtc: "2026-03-20T21:00:00.000Z",
          status: "published",
          locationId: null,
          countryCode: null,
          city: null,
          lat: null,
          lng: null,
        },
      ],
    );

    const sqlCalls = query.mock.calls.map((call) => String(call[0]));
    expect(sqlCalls.some((sql) => sql.includes("delete from event_occurrences where event_id = $1"))).toBe(true);
    expect(sqlCalls.some((sql) => sql.includes("and starts_at_utc >= $2::timestamptz"))).toBe(false);
    expect(sqlCalls.some((sql) => sql.includes("insert into event_occurrences"))).toBe(true);
    expect(sqlCalls.some((sql) => sql.includes("row_number() over"))).toBe(true);
  });

  it("keeps single-event replacement idempotent across repeated writes", async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes("select schedule_kind")) {
        return { rows: [{ schedule_kind: "single" }] };
      }
      return { rows: [] };
    });
    const pool = { query } as never;

    const occurrence = {
      eventId: "00000000-0000-0000-0000-000000000011",
      startsAtUtc: "2026-05-01T12:00:00.000Z",
      endsAtUtc: "2026-05-01T14:00:00.000Z",
      status: "published" as const,
      locationId: null,
      countryCode: null,
      city: null,
      lat: null,
      lng: null,
    };

    await replaceOccurrencesInWindow(
      pool,
      occurrence.eventId,
      "2026-01-01T00:00:00.000Z",
      "2026-12-31T23:59:59.000Z",
      [occurrence],
    );
    await replaceOccurrencesInWindow(
      pool,
      occurrence.eventId,
      "2026-01-01T00:00:00.000Z",
      "2026-12-31T23:59:59.000Z",
      [occurrence],
    );

    const sqlCalls = query.mock.calls.map((call) => String(call[0]));
    const fullDeletes = sqlCalls.filter((sql) => sql.includes("delete from event_occurrences where event_id = $1"));
    const windowDeletes = sqlCalls.filter((sql) => sql.includes("and starts_at_utc >= $2::timestamptz"));
    expect(fullDeletes.length).toBe(2);
    expect(windowDeletes.length).toBe(0);
  });
});
