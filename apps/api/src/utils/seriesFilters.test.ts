import { describe, expect, it } from "vitest";

import { buildSeriesMeiliFilters, type SeriesFilterInput } from "./seriesFilters";

const base: SeriesFilterInput = {
  fromUtc: "2026-04-01T00:00:00.000Z",
  toUtc: "2026-04-30T23:59:59.999Z",
  tags: [],
  languages: [],
  selectedEventDatePresets: [],
};

describe("buildSeriesMeiliFilters", () => {
  it("always emits earliest_upcoming_ts bounds as epoch ms", () => {
    const filters = buildSeriesMeiliFilters(base);
    expect(filters[0]).toBe(`earliest_upcoming_ts >= ${Date.parse(base.fromUtc)}`);
    expect(filters[1]).toBe(`earliest_upcoming_ts <= ${Date.parse(base.toUtc)}`);
  });

  it("emits no extra filters when no inputs are set", () => {
    const filters = buildSeriesMeiliFilters(base);
    expect(filters).toHaveLength(2);
  });

  it("joins date-preset chips with OR", () => {
    const filters = buildSeriesMeiliFilters({
      ...base,
      selectedEventDatePresets: ["today", "tomorrow"],
    });
    expect(filters).toContain('(event_date_buckets = "today" OR event_date_buckets = "tomorrow")');
  });

  it("emits scalar equality for a single practiceCategoryId", () => {
    const filters = buildSeriesMeiliFilters({
      ...base,
      practiceCategoryIds: ["abc"],
    });
    expect(filters).toContain('practice_category_id = "abc"');
  });

  it("joins multi-value practiceCategoryIds with OR and parens", () => {
    const filters = buildSeriesMeiliFilters({
      ...base,
      practiceCategoryIds: ["a", "b"],
    });
    expect(filters).toContain('(practice_category_id = "a" OR practice_category_id = "b")');
  });

  it("lowercases and trims countryCodes", () => {
    const filters = buildSeriesMeiliFilters({ ...base, countryCodes: [" US "] });
    expect(filters).toContain('country_code = "us"');
  });

  it("drops empty countryCode entries", () => {
    const filters = buildSeriesMeiliFilters({ ...base, countryCodes: ["", "  "] });
    expect(filters.some((f) => f.includes("country_code"))).toBe(false);
  });

  it("emits _geoRadius only when all three geo fields are present", () => {
    const withAll = buildSeriesMeiliFilters({
      ...base,
      geoLat: 10,
      geoLng: 20,
      geoRadius: 5000,
    });
    expect(withAll).toContain("_geoRadius(10, 20, 5000)");

    const withPartial = buildSeriesMeiliFilters({ ...base, geoLat: 10 });
    expect(withPartial.some((f) => f.includes("_geoRadius"))).toBe(false);
  });

  it("emits _geoBoundingBox with top-right then bottom-left", () => {
    const filters = buildSeriesMeiliFilters({
      ...base,
      bbox: { south: 1, west: 2, north: 3, east: 4 },
    });
    expect(filters).toContain("_geoBoundingBox([3, 4], [1, 2])");
  });

  it("emits has_geo as a boolean literal (no quotes)", () => {
    const t = buildSeriesMeiliFilters({ ...base, hasGeo: true });
    const f = buildSeriesMeiliFilters({ ...base, hasGeo: false });
    expect(t).toContain("has_geo = true");
    expect(f).toContain("has_geo = false");
  });

  it("single tag and multiple tag filters render correctly", () => {
    const single = buildSeriesMeiliFilters({ ...base, tags: ["barefoot"] });
    expect(single).toContain('tags = "barefoot"');
    const multi = buildSeriesMeiliFilters({ ...base, tags: ["a", "b"] });
    expect(multi).toContain('(tags = "a" OR tags = "b")');
  });

  it("escapes values that contain quotes via JSON.stringify", () => {
    const filters = buildSeriesMeiliFilters({ ...base, tags: ['he said "hi"'] });
    expect(filters).toContain('tags = "he said \\"hi\\""');
  });

  it("includes organizerId when present, omits when absent", () => {
    expect(buildSeriesMeiliFilters({ ...base, organizerId: "org-1" }))
      .toContain('organizer_ids = "org-1"');
    expect(buildSeriesMeiliFilters(base).some((f) => f.includes("organizer_ids")))
      .toBe(false);
  });
});
