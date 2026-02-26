import { describe, expect, it, vi } from "vitest";

import { getAdminEventById, listAdminEvents } from "./adminRepo";

describe("adminRepo external reference support", () => {
  it("applies externalSource+externalId filters in admin list query", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: "0" }] });
    const pool = { query } as never;

    await listAdminEvents(pool, {
      externalSource: "smoke_test",
      externalId: "evt-1",
      page: 1,
      pageSize: 20,
    });

    const firstSql = query.mock.calls[0][0] as string;
    const firstParams = query.mock.calls[0][1] as unknown[];

    expect(firstSql).toContain("e.external_source = $1");
    expect(firstSql).toContain("e.external_id = $2");
    expect(firstParams).toEqual(["smoke_test", "evt-1", 20, 0]);
  });

  it("returns externalSource/externalId in admin detail payload", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: "00000000-0000-0000-0000-000000000001",
            slug: "event-1",
            title: "Event 1",
            description_json: {},
            external_source: "smoke_test",
            external_id: "evt-1",
            externalSource: "smoke_test",
            externalId: "evt-1",
            cover_image_path: null,
            external_url: null,
            attendance_mode: "in_person",
            online_url: null,
            practice_category_id: "11111111-1111-1111-1111-111111111111",
            practice_subcategory_id: null,
            tags: [],
            languages: [],
            schedule_kind: "single",
            event_timezone: "UTC",
            single_start_at: "2026-03-20T19:00:00.000Z",
            single_end_at: "2026-03-20T21:00:00.000Z",
            rrule: null,
            rrule_dtstart_local: null,
            duration_minutes: null,
            status: "draft",
            visibility: "public",
            created_at: "2026-03-01T00:00:00.000Z",
            updated_at: "2026-03-01T00:00:00.000Z",
            published_at: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const pool = { query } as never;

    const item = await getAdminEventById(pool, "00000000-0000-0000-0000-000000000001");

    expect(item?.externalSource).toBe("smoke_test");
    expect(item?.externalId).toBe("evt-1");
    expect(item?.external_source).toBe("smoke_test");
    expect(item?.external_id).toBe("evt-1");
  });
});
