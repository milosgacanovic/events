import { describe, expect, it } from "vitest";

import { filterSnapshotToSeriesInput } from "./filterSnapshotToSeriesInput";

const window = { fromUtc: "2026-05-04T00:00:00.000Z", toUtc: "2027-05-04T00:00:00.000Z" };

describe("filterSnapshotToSeriesInput", () => {
  it("threads fromUtc/toUtc through verbatim", () => {
    const { input } = filterSnapshotToSeriesInput({}, window);
    expect(input.fromUtc).toBe(window.fromUtc);
    expect(input.toUtc).toBe(window.toUtc);
  });

  it("expands CSV string fields into arrays", () => {
    const { input } = filterSnapshotToSeriesInput(
      { tags: "salsa,bachata", languages: "en,es", countryCode: "us,mx" },
      window,
    );
    expect(input.tags).toEqual(["salsa", "bachata"]);
    expect(input.languages).toEqual(["en", "es"]);
    expect(input.countryCodes).toEqual(["us", "mx"]);
  });

  it("accepts already-array fields without splitting", () => {
    const { input } = filterSnapshotToSeriesInput(
      { tags: ["a,b", "c"], languages: ["fr"] },
      window,
    );
    // Array members are NOT split on commas — they're passed through as-is.
    expect(input.tags).toEqual(["a,b", "c"]);
    expect(input.languages).toEqual(["fr"]);
  });

  it("falls back to legacy aliases (practice → practiceCategoryId, format → eventFormatId)", () => {
    const { input } = filterSnapshotToSeriesInput(
      { practice: "rest-of-saved-search-uuid", format: "fmt-uuid" },
      window,
    );
    expect(input.practiceCategoryIds).toEqual(["rest-of-saved-search-uuid"]);
    expect(input.eventFormatIds).toEqual(["fmt-uuid"]);
  });

  it("only includes geo when lat+lng+radiusKm are all present", () => {
    const partial = filterSnapshotToSeriesInput({ lat: 40.7, lng: -74.0 }, window);
    expect(partial.input.geoLat).toBeUndefined();

    const full = filterSnapshotToSeriesInput({ lat: 40.7, lng: -74.0, radiusKm: 25 }, window);
    expect(full.input.geoLat).toBe(40.7);
    expect(full.input.geoLng).toBe(-74.0);
    // radiusKm is converted to metres for Meili's _geoRadius.
    expect(full.input.geoRadius).toBe(25_000);
  });

  it("normalizes eventDate presets and drops unknown values", () => {
    const { input } = filterSnapshotToSeriesInput(
      { eventDate: "today,not-a-preset,this_weekend" },
      window,
    );
    expect(input.selectedEventDatePresets).toEqual(["today", "this_weekend"]);
  });

  it("returns query separately from the filter input", () => {
    const { input, query } = filterSnapshotToSeriesInput({ q: "ecstatic dance" }, window);
    expect(query).toBe("ecstatic dance");
    // Query is not on the SeriesFilterInput shape.
    expect((input as Record<string, unknown>).query).toBeUndefined();
  });

  it("prefers `q` over legacy `query` if both present", () => {
    const { query } = filterSnapshotToSeriesInput({ q: "modern", query: "legacy" }, window);
    expect(query).toBe("modern");
  });

  it("returns undefined for empty optional arrays so buildSeriesMeiliFilters can branch", () => {
    const { input } = filterSnapshotToSeriesInput({ tags: "", languages: [] }, window);
    expect(input.tags).toEqual([]);
    expect(input.languages).toEqual([]);
    // attendanceModes/countryCodes etc default to undefined, not [].
    expect(input.attendanceModes).toBeUndefined();
    expect(input.countryCodes).toBeUndefined();
  });
});
