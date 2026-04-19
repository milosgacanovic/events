import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";

import {
  buildEventDateRangeMap,
  parseEventDatePresets,
  resolveSafeTimeZone,
} from "./eventDatePresets";

describe("parseEventDatePresets", () => {
  it("returns [] for empty/undefined input", () => {
    expect(parseEventDatePresets(undefined)).toEqual([]);
    expect(parseEventDatePresets("")).toEqual([]);
  });

  it("parses a single valid preset", () => {
    expect(parseEventDatePresets("today")).toEqual(["today"]);
  });

  it("parses multiple comma-separated presets", () => {
    const result = parseEventDatePresets("today,tomorrow,this_week");
    expect(result.sort()).toEqual(["this_week", "today", "tomorrow"]);
  });

  it("lowercases, trims, and dedupes entries", () => {
    const result = parseEventDatePresets(" TODAY , tomorrow , Today ");
    expect(result.sort()).toEqual(["today", "tomorrow"]);
  });

  it("drops unknown tokens silently", () => {
    const result = parseEventDatePresets("today,bogus,next_month");
    expect(result.sort()).toEqual(["next_month", "today"]);
  });
});

describe("resolveSafeTimeZone", () => {
  it("returns UTC for empty/undefined/whitespace", () => {
    expect(resolveSafeTimeZone(undefined)).toBe("UTC");
    expect(resolveSafeTimeZone("")).toBe("UTC");
    expect(resolveSafeTimeZone("   ")).toBe("UTC");
  });

  it("returns valid IANA zones as-is", () => {
    expect(resolveSafeTimeZone("Europe/Belgrade")).toBe("Europe/Belgrade");
    expect(resolveSafeTimeZone("America/New_York")).toBe("America/New_York");
  });

  it("falls back to UTC for invalid zones", () => {
    expect(resolveSafeTimeZone("Not/AZone")).toBe("UTC");
    expect(resolveSafeTimeZone("garbage")).toBe("UTC");
  });
});

describe("buildEventDateRangeMap", () => {
  // Thursday 2026-04-16 12:00 UTC — weekday = 4 (Mon=1..Sun=7)
  const now = DateTime.fromISO("2026-04-16T12:00:00Z", { zone: "utc" });

  it("produces today/tomorrow spanning exactly one day in the given zone", () => {
    const map = buildEventDateRangeMap("UTC", now);
    expect(map.today.fromUtc).toBe("2026-04-16T00:00:00.000Z");
    expect(map.today.toUtc).toBe("2026-04-17T00:00:00.000Z");
    expect(map.tomorrow.fromUtc).toBe("2026-04-17T00:00:00.000Z");
    expect(map.tomorrow.toUtc).toBe("2026-04-18T00:00:00.000Z");
  });

  it("this_weekend starts on Saturday and lasts 2 days from a Thursday", () => {
    const map = buildEventDateRangeMap("UTC", now);
    expect(map.this_weekend.fromUtc).toBe("2026-04-18T00:00:00.000Z"); // Sat
    expect(map.this_weekend.toUtc).toBe("2026-04-20T00:00:00.000Z");
  });

  it("next_weekend is exactly one week after this_weekend", () => {
    const map = buildEventDateRangeMap("UTC", now);
    const thisStart = DateTime.fromISO(map.this_weekend.fromUtc).toMillis();
    const nextStart = DateTime.fromISO(map.next_weekend.fromUtc).toMillis();
    expect(nextStart - thisStart).toBe(7 * 24 * 3600 * 1000);
  });

  it("this_week/next_week cover 7 days each and next_week follows this_week", () => {
    const map = buildEventDateRangeMap("UTC", now);
    const thisStart = DateTime.fromISO(map.this_week.fromUtc);
    const thisEnd = DateTime.fromISO(map.this_week.toUtc);
    expect(thisEnd.diff(thisStart, "days").days).toBe(7);
    expect(map.this_week.toUtc).toBe(map.next_week.fromUtc);
  });

  it("this_month ends where next_month begins", () => {
    const map = buildEventDateRangeMap("UTC", now);
    expect(map.this_month.toUtc).toBe(map.next_month.fromUtc);
  });

  it("when called on a Saturday, this_weekend starts today", () => {
    const sat = DateTime.fromISO("2026-04-18T10:00:00Z", { zone: "utc" });
    const map = buildEventDateRangeMap("UTC", sat);
    expect(map.this_weekend.fromUtc).toBe("2026-04-18T00:00:00.000Z");
  });

  it("when called on a Sunday, this_weekend started yesterday", () => {
    const sun = DateTime.fromISO("2026-04-19T10:00:00Z", { zone: "utc" });
    const map = buildEventDateRangeMap("UTC", sun);
    expect(map.this_weekend.fromUtc).toBe("2026-04-18T00:00:00.000Z");
    expect(map.this_weekend.toUtc).toBe("2026-04-20T00:00:00.000Z");
  });

  it("respects the timezone for day boundaries", () => {
    // 23:30 UTC is already the next day in Belgrade (UTC+2 in April)
    const lateUtc = DateTime.fromISO("2026-04-16T23:30:00Z", { zone: "utc" });
    const map = buildEventDateRangeMap("Europe/Belgrade", lateUtc);
    // In Belgrade it's 2026-04-17 01:30 — today should start at 2026-04-16T22:00Z
    expect(map.today.fromUtc).toBe("2026-04-16T22:00:00.000Z");
  });
});
