import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/savedSearchRepo", () => ({
  findNewMatchingEvents: vi.fn(),
  markSavedSearchSent: vi.fn().mockResolvedValue(0),
  touchSavedSearchEvaluatedAt: vi.fn().mockResolvedValue(undefined),
  touchSavedSearchNotifiedAt: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./emailService", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

import {
  findNewMatchingEvents,
  markSavedSearchSent,
  touchSavedSearchEvaluatedAt,
  touchSavedSearchNotifiedAt,
  type DueSavedSearchRow,
} from "../db/savedSearchRepo";
import { sendEmail } from "./emailService";
import {
  buildFilterUrl,
  computeSinceIso,
  DIGEST_CAP,
  processSavedSearch,
  FIRST_RUN_LOOKBACK_DAYS,
} from "./savedSearchDigestService";

function makeRow(overrides: Partial<DueSavedSearchRow> = {}): DueSavedSearchRow {
  return {
    id: "search-1",
    user_id: "user-1",
    label: null,
    filter_snapshot: {},
    frequency: "weekly",
    notify_new: true,
    notify_reminders: false,
    notify_updates: false,
    unsubscribe_token: "11111111-1111-1111-1111-111111111111",
    unsubscribed_at: null,
    last_notified_at: null,
    last_evaluated_at: null,
    created_at: new Date().toISOString(),
    user_email: "user@example.com",
    user_display_name: "User One",
    ...overrides,
  };
}

const noopLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  fatal: () => {},
  trace: () => {},
  child: () => noopLogger,
  level: "info",
  silent: () => {},
} as never;

type FakeMeili = { searchSeries: ReturnType<typeof vi.fn> };
function makeMeili(seriesIds: string[] = []): FakeMeili {
  return {
    searchSeries: vi
      .fn()
      .mockResolvedValue({ hits: seriesIds.map((id) => ({ series_id: id })) }),
  };
}

const fakePool = {} as never;

describe("computeSinceIso", () => {
  it("uses last_notified_at when present", () => {
    const row = makeRow({ last_notified_at: "2026-04-01T00:00:00.000Z" });
    expect(computeSinceIso(row)).toBe("2026-04-01T00:00:00.000Z");
  });

  it("uses created_at on first run if newer than the 30d floor", () => {
    const recentCreate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const row = makeRow({ last_notified_at: null, created_at: recentCreate });
    expect(new Date(computeSinceIso(row)).toISOString()).toBe(new Date(recentCreate).toISOString());
  });

  it("caps first-run lookback at 30 days even for very old searches", () => {
    const ancient = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const row = makeRow({ last_notified_at: null, created_at: ancient });
    const since = new Date(computeSinceIso(row));
    const expectedFloor = new Date(Date.now() - FIRST_RUN_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    // Allow a few seconds of clock drift between assert and floor compute.
    expect(Math.abs(since.getTime() - expectedFloor.getTime())).toBeLessThan(5_000);
  });
});

describe("buildFilterUrl", () => {
  it("joins array values with commas (matches the search URL convention)", () => {
    const url = buildFilterUrl({ tags: ["salsa", "bachata"], country: "DE" });
    expect(url).toContain("tags=salsa%2Cbachata");
    expect(url).toContain("country=DE");
  });

  it("skips null/empty values to avoid `?key=` noise", () => {
    const url = buildFilterUrl({ tags: null, q: "" });
    expect(url).not.toContain("tags=");
    expect(url).not.toContain("q=");
  });
});

describe("processSavedSearch", () => {
  afterEach(() => vi.clearAllMocks());

  it("touches evaluated_at and skips email when Meili returns 0 series", async () => {
    const meili = makeMeili([]);
    const result = await processSavedSearch(fakePool, meili as never, makeRow(), noopLogger);
    expect(result).toEqual({ sent: false, eventsMarked: 0 });
    expect(touchSavedSearchEvaluatedAt).toHaveBeenCalledWith(fakePool, "search-1");
    expect(touchSavedSearchNotifiedAt).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("touches evaluated_at and skips email when SQL returns 0 events", async () => {
    const meili = makeMeili(["s1"]);
    vi.mocked(findNewMatchingEvents).mockResolvedValue([]);
    const result = await processSavedSearch(fakePool, meili as never, makeRow(), noopLogger);
    expect(result).toEqual({ sent: false, eventsMarked: 0 });
    expect(touchSavedSearchEvaluatedAt).toHaveBeenCalled();
    expect(touchSavedSearchNotifiedAt).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("renders + sends + marks when SQL returns matching events", async () => {
    const meili = makeMeili(["s1"]);
    vi.mocked(findNewMatchingEvents).mockResolvedValue([
      {
        event_id: "e1",
        event_slug: "evt-1",
        event_title: "Salsa Night",
        event_timezone: "Europe/Berlin",
        published_at: new Date("2026-05-01T00:00:00Z"),
        starts_at_utc: new Date("2026-05-15T18:00:00Z"),
        occ_city: "Berlin",
        occ_country_code: "de",
      },
    ]);
    vi.mocked(markSavedSearchSent).mockResolvedValue(1);

    const result = await processSavedSearch(fakePool, meili as never, makeRow(), noopLogger);
    expect(result.sent).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(markSavedSearchSent).toHaveBeenCalledWith(fakePool, "search-1", ["e1"]);
    expect(touchSavedSearchNotifiedAt).toHaveBeenCalledWith(fakePool, "search-1");
    expect(touchSavedSearchEvaluatedAt).not.toHaveBeenCalled();
  });

  it("does not mark or move last_notified_at when sendEmail throws", async () => {
    const meili = makeMeili(["s1"]);
    vi.mocked(findNewMatchingEvents).mockResolvedValue([
      {
        event_id: "e1",
        event_slug: "evt-1",
        event_title: "Salsa Night",
        event_timezone: null,
        published_at: new Date("2026-05-01T00:00:00Z"),
        starts_at_utc: new Date("2026-05-15T18:00:00Z"),
        occ_city: null,
        occ_country_code: null,
      },
    ]);
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error("smtp boom"));

    const result = await processSavedSearch(fakePool, meili as never, makeRow(), noopLogger);
    expect(result.sent).toBe(false);
    expect(markSavedSearchSent).not.toHaveBeenCalled();
    expect(touchSavedSearchNotifiedAt).not.toHaveBeenCalled();
    // Note: we also don't touch evaluated_at here — letting the next cycle
    // retry both the Meili search and the send. (Empty-result paths touch
    // evaluated_at; transient SMTP failures retry full pipeline.)
    expect(touchSavedSearchEvaluatedAt).not.toHaveBeenCalled();
  });

  it("caps the digest at DIGEST_CAP events even when SQL returned more", async () => {
    const meili = makeMeili(["s1"]);
    const rows = Array.from({ length: DIGEST_CAP + 5 }).map((_, i) => ({
      event_id: `e${i}`,
      event_slug: `evt-${i}`,
      event_title: `Event ${i}`,
      event_timezone: null,
      published_at: new Date("2026-05-01T00:00:00Z"),
      starts_at_utc: new Date("2026-05-15T18:00:00Z"),
      occ_city: null,
      occ_country_code: null,
    }));
    vi.mocked(findNewMatchingEvents).mockResolvedValue(rows);
    vi.mocked(markSavedSearchSent).mockResolvedValue(DIGEST_CAP);

    await processSavedSearch(fakePool, meili as never, makeRow(), noopLogger);

    // Only DIGEST_CAP event_ids should be persisted to dedup, even though
    // the SQL returned more rows (limit was DIGEST_CAP+1 to detect overflow).
    const markCall = vi.mocked(markSavedSearchSent).mock.calls[0];
    expect(markCall[2]).toHaveLength(DIGEST_CAP);
  });

  it("constrains the Meili filter to public-visibility events", async () => {
    const meili = makeMeili(["s1"]);
    vi.mocked(findNewMatchingEvents).mockResolvedValue([]);
    await processSavedSearch(fakePool, meili as never, makeRow(), noopLogger);
    const call = vi.mocked(meili.searchSeries).mock.calls[0][0] as { filter: string[] };
    expect(call.filter).toContain('visibility = "public"');
  });

  it("touches evaluated_at when user has no email (defensive guard)", async () => {
    const meili = makeMeili(["s1"]);
    vi.mocked(findNewMatchingEvents).mockResolvedValue([
      {
        event_id: "e1",
        event_slug: "evt-1",
        event_title: "Salsa Night",
        event_timezone: null,
        published_at: new Date(),
        starts_at_utc: new Date(),
        occ_city: null,
        occ_country_code: null,
      },
    ]);
    const result = await processSavedSearch(
      fakePool,
      meili as never,
      makeRow({ user_email: null }),
      noopLogger,
    );
    expect(result.sent).toBe(false);
    expect(touchSavedSearchEvaluatedAt).toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
