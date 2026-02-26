import { describe, expect, it, vi } from "vitest";

import { createEvent, updateEvent } from "./eventRepo";

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
});
