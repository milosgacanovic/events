import { describe, expect, it } from "vitest";
import { isEventIndexable } from "@dr-events/shared";

const now = new Date("2026-11-10T12:00:00Z");
const base = {
  status: "published",
  visibility: "public",
  nextOccurrenceStartsAt: "2026-11-12T18:00:00Z",
  siblingCount: 1,
  seriesNextOccurrenceStartsAt: "2026-11-12T18:00:00Z",
};

describe("isEventIndexable", () => {
  it("indexes a published public event with an own upcoming occurrence", () => {
    expect(isEventIndexable(base, now)).toBe(true);
  });
  it("archives an event whose own occurrences have all ended (even if siblings are upcoming)", () => {
    expect(isEventIndexable({ ...base, nextOccurrenceStartsAt: null, siblingCount: 5 }, now)).toBe(false);
  });
  it("rejects non-published and non-public events", () => {
    expect(isEventIndexable({ ...base, status: "cancelled" }, now)).toBe(false);
    expect(isEventIndexable({ ...base, visibility: "unlisted" }, now)).toBe(false);
  });
  it("indexes a far-future standalone event (no sibling window)", () => {
    expect(isEventIndexable({ ...base, nextOccurrenceStartsAt: "2027-06-01T10:00:00Z" }, now)).toBe(true);
  });
  it("limits multi-sibling series to the 60-day window", () => {
    const series = { ...base, siblingCount: 40, seriesNextOccurrenceStartsAt: "2026-11-12T18:00:00Z" };
    expect(isEventIndexable({ ...series, nextOccurrenceStartsAt: "2026-12-30T18:00:00Z" }, now)).toBe(true);
    expect(isEventIndexable({ ...series, nextOccurrenceStartsAt: "2027-02-01T18:00:00Z" }, now)).toBe(false);
  });
  it("always indexes the earliest upcoming sibling, even outside the window", () => {
    expect(
      isEventIndexable(
        { ...base, siblingCount: 8, nextOccurrenceStartsAt: "2027-04-01T18:00:00Z", seriesNextOccurrenceStartsAt: "2027-04-01T18:00:00Z" },
        now,
      ),
    ).toBe(true);
  });
});
