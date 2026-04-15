import { describe, expect, it, vi } from "vitest";

import { listPendingNotifications, runAlertsDry } from "./alertRepo";

describe("alertRepo series_id suppression", () => {
  it("listPendingNotifications SQL suppresses sibling events in the same series for the alerted host", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as never;

    await listPendingNotifications(pool);

    const sql = query.mock.calls[0][0] as string;
    // Only the first-created published event in a series counts as "new".
    expect(sql).toContain("e.series_id is null");
    expect(sql).toContain("not exists");
    expect(sql).toContain("e2.series_id = e.series_id");
    expect(sql).toContain("rel2.organizer_id = ua.organizer_id");
    expect(sql).toContain("e2.status = 'published'");
    expect(sql).toContain("e2.created_at < e.created_at");
  });

  it("runAlertsDry SQL applies the same series_id suppression so admin preview matches worker", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as never;

    await runAlertsDry(pool, "2026-01-01T00:00:00Z", "2026-01-31T23:59:59Z");

    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain("e.series_id is null");
    expect(sql).toContain("not exists");
    expect(sql).toContain("e2.series_id = e.series_id");
    expect(sql).toContain("rel2.organizer_id = ua.organizer_id");
    expect(sql).toContain("e2.created_at < e.created_at");
  });
});
