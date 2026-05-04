import { describe, expect, it, vi } from "vitest";

import {
  createSavedSearch,
  updateSavedSearch,
  listDueSavedSearches,
  findNewMatchingEvents,
  markSavedSearchSent,
  touchSavedSearchEvaluatedAt,
  touchSavedSearchNotifiedAt,
  unsubscribeSavedSearchByToken,
} from "./savedSearchRepo";

function mockPool(rows: unknown[] = []) {
  const query = vi.fn().mockResolvedValue({ rows, rowCount: rows.length });
  return { pool: { query } as never, query };
}

describe("createSavedSearch", () => {
  it("hardcodes notify_new=true, notify_reminders=false, notify_updates=false", async () => {
    const { pool, query } = mockPool([{ id: "x" }]);
    await createSavedSearch(pool, "user-1", {
      label: null as never,
      filterSnapshot: { tags: ["salsa"] },
      frequency: "weekly",
    });
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain("VALUES ($1, $2, $3, $4, true, false, false)");
    // Only 4 params bound; the three booleans are baked into the VALUES.
    const params = query.mock.calls[0][1] as unknown[];
    expect(params).toHaveLength(4);
  });
});

describe("updateSavedSearch", () => {
  it("does not surface notify_* columns in the SET list (server-controlled)", async () => {
    const { pool, query } = mockPool([{ id: "x" }]);
    await updateSavedSearch(pool, "user-1", "search-1", {
      // None of these are valid update fields anymore — only label, frequency, paused.
      label: "renamed",
      frequency: "daily",
    });
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain("label = $3");
    expect(sql).toContain("frequency = $4");
    // Assert against the SET portion specifically — RETURNING legitimately
    // names every column in the row, so a global `not.toContain("notify_new")`
    // would false-positive.
    const setClause = sql.slice(sql.indexOf("SET"), sql.indexOf("WHERE"));
    expect(setClause).not.toContain("notify_new");
    expect(setClause).not.toContain("notify_reminders");
    expect(setClause).not.toContain("notify_updates");
  });

  it("returns null without calling SQL when no fields are provided", async () => {
    const { pool, query } = mockPool([]);
    const result = await updateSavedSearch(pool, "user-1", "search-1", {});
    expect(result).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });
});

describe("listDueSavedSearches", () => {
  it("filters out unsubscribed searches and ones with notify_new=false", async () => {
    const { pool, query } = mockPool([]);
    await listDueSavedSearches(pool);
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain("ss.unsubscribed_at IS NULL");
    expect(sql).toContain("ss.notify_new = true");
    expect(sql).toContain("u.email IS NOT NULL");
  });

  it("respects per-frequency intervals (23h grace for daily, 6d23h for weekly)", async () => {
    const { pool, query } = mockPool([]);
    await listDueSavedSearches(pool);
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain("ss.frequency = 'daily'");
    expect(sql).toContain("interval '23 hours'");
    expect(sql).toContain("ss.frequency = 'weekly'");
    expect(sql).toContain("interval '6 days 23 hours'");
  });

  it("treats last_evaluated_at IS NULL as due", async () => {
    const { pool, query } = mockPool([]);
    await listDueSavedSearches(pool);
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain("ss.last_evaluated_at IS NULL");
  });
});

describe("findNewMatchingEvents", () => {
  it("returns empty array immediately when seriesIds is empty (no SQL roundtrip)", async () => {
    const { pool, query } = mockPool([]);
    const result = await findNewMatchingEvents(pool, "search-1", "2026-05-01T00:00:00Z", [], 21);
    expect(result).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it("dedups against saved_search_sends and only returns published+upcoming events", async () => {
    const { pool, query } = mockPool([]);
    await findNewMatchingEvents(pool, "search-1", "2026-05-01T00:00:00Z", ["uuid-1"], 21);
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain("LEFT JOIN saved_search_sends sss");
    expect(sql).toContain("sss.event_id IS NULL");
    expect(sql).toContain("e.status = 'published'");
    expect(sql).toContain("e.published_at >= $2::timestamptz");
    expect(sql).toContain("e.series_id = ANY($3::uuid[])");
    expect(sql).toContain("eo.starts_at_utc > now()");
  });

  it("orders newest published first so the digest leads with the most recent", async () => {
    const { pool, query } = mockPool([]);
    await findNewMatchingEvents(pool, "search-1", "2026-05-01T00:00:00Z", ["uuid-1"], 21);
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain("ORDER BY e.published_at DESC");
  });
});

describe("markSavedSearchSent", () => {
  it("returns 0 without calling SQL when eventIds is empty", async () => {
    const { pool, query } = mockPool([]);
    const result = await markSavedSearchSent(pool, "search-1", []);
    expect(result).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });

  it("uses ON CONFLICT DO NOTHING for idempotent inserts", async () => {
    const { pool, query } = mockPool([]);
    await markSavedSearchSent(pool, "search-1", ["evt-1", "evt-2"]);
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain("INSERT INTO saved_search_sends");
    expect(sql).toContain("ON CONFLICT (search_id, event_id) DO NOTHING");
  });
});

describe("touch helpers", () => {
  it("touchSavedSearchEvaluatedAt only moves last_evaluated_at, not last_notified_at", async () => {
    const { pool, query } = mockPool([]);
    await touchSavedSearchEvaluatedAt(pool, "search-1");
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain("last_evaluated_at = now()");
    expect(sql).not.toContain("last_notified_at");
  });

  it("touchSavedSearchNotifiedAt moves both fields atomically", async () => {
    const { pool, query } = mockPool([]);
    await touchSavedSearchNotifiedAt(pool, "search-1");
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain("last_notified_at = now()");
    expect(sql).toContain("last_evaluated_at = now()");
  });
});

describe("unsubscribeSavedSearchByToken", () => {
  it("only updates rows where unsubscribed_at IS NULL (idempotent)", async () => {
    const { pool, query } = mockPool([]);
    await unsubscribeSavedSearchByToken(pool, "11111111-1111-1111-1111-111111111111");
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain("WHERE unsubscribe_token = $1::uuid AND unsubscribed_at IS NULL");
    expect(sql).toContain("SET unsubscribed_at = now()");
  });
});
