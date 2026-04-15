import { describe, expect, it, vi } from "vitest";

import { refreshEventSeries } from "./seriesRepo";

describe("seriesRepo.refreshEventSeries", () => {
  it("returns true when at least one sibling exists and upsert writes a row", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ series_id: "s1" }] });
    const pool = { query } as never;

    const result = await refreshEventSeries(pool, "s1");

    expect(result).toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain("insert into event_series");
    expect(sql).toContain("on conflict (series_id) do update");
    expect(sql).toContain("where series_id = $1");
  });

  it("deletes and returns false when no published/cancelled siblings remain", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const pool = { query } as never;

    const result = await refreshEventSeries(pool, "s2");

    expect(result).toBe(false);
    expect(query).toHaveBeenCalledTimes(2);
    const deleteSql = String(query.mock.calls[1][0]);
    expect(deleteSql).toContain("delete from event_series where series_id = $1");
    expect(query.mock.calls[1][1]).toEqual(["s2"]);
  });

  it("prefers public visibility then earliest upcoming when picking the canonical sibling", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ series_id: "s3" }] });
    const pool = { query } as never;

    await refreshEventSeries(pool, "s3");

    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain("(s.visibility = 'public') desc");
    expect(sql).toContain("u.earliest_upcoming asc nulls last");
    expect(sql).toContain("s.created_at asc");
  });

  it("aggregates UTC date buckets from upcoming event_occurrences", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ series_id: "s4" }] });
    const pool = { query } as never;

    await refreshEventSeries(pool, "s4");

    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain("(starts_at_utc at time zone 'UTC')::date");
    expect(sql).toContain("starts_at_utc >= now()");
  });

  it("unions tags, languages, and organizer ids across all siblings", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ series_id: "s5" }] });
    const pool = { query } as never;

    await refreshEventSeries(pool, "s5");

    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain("tag_union");
    expect(sql).toContain("language_union");
    expect(sql).toContain("organizer_union");
  });
});
