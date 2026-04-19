import { describe, expect, it, vi } from "vitest";

import { buildClusters } from "./mapClusterService";

type SeriesHit = {
  series_id: string;
  slug: string;
  title: string;
  _geo: { lat: number; lng: number } | null;
  earliest_upcoming_ts?: number;
  event_timezone: string | null;
};

function makeMeili(hits: SeriesHit[]) {
  const searchSeries = vi.fn(async (_query: unknown) => ({ hits }));
  return { meili: { searchSeries } as never, searchSeries };
}

const baseInput = {
  fromUtc: "2026-04-01T00:00:00.000Z",
  toUtc: "2026-04-30T23:59:59.999Z",
  eventDatePresets: [],
  practiceCategoryIds: [],
  tags: [],
  languages: [],
  attendanceModes: [] as Array<"in_person" | "online" | "hybrid">,
  eventFormatIds: [],
  countryCodes: [],
  cities: [],
  bbox: { west: -10, south: -10, east: 10, north: 10 },
  limit: 100,
};

describe("buildClusters", () => {
  it("at high zoom (>=13) returns one non-cluster Feature per hit", async () => {
    const hits: SeriesHit[] = [
      { series_id: "s1", slug: "a", title: "A", _geo: { lat: 1, lng: 2 }, event_timezone: "UTC", earliest_upcoming_ts: 1700000000000 },
      { series_id: "s2", slug: "b", title: "B", _geo: { lat: 3, lng: 4 }, event_timezone: null, earliest_upcoming_ts: 1700000001000 },
    ];
    const { meili } = makeMeili(hits);

    const { collection, truncated } = await buildClusters(meili, { ...baseInput, zoom: 14 });
    expect(truncated).toBe(false);
    expect(collection.features).toHaveLength(2);
    for (const feat of collection.features) {
      expect((feat.properties as { cluster: boolean }).cluster).toBe(false);
    }
    const props0 = collection.features[0].properties as { occurrence_id: string; event_slug: string };
    expect(props0.occurrence_id).toBe("s1");
    expect(props0.event_slug).toBe("a");
  });

  it("drops hits that have null _geo", async () => {
    const hits: SeriesHit[] = [
      { series_id: "s1", slug: "a", title: "A", _geo: null, event_timezone: "UTC" },
      { series_id: "s2", slug: "b", title: "B", _geo: { lat: 0, lng: 0 }, event_timezone: "UTC" },
    ];
    const { meili } = makeMeili(hits);
    const { collection } = await buildClusters(meili, { ...baseInput, zoom: 14 });
    expect(collection.features).toHaveLength(1);
  });

  it("marks truncated=true when hits exceed limit, and trims to limit", async () => {
    const hits: SeriesHit[] = Array.from({ length: 5 }, (_, i) => ({
      series_id: `s${i}`,
      slug: `a-${i}`,
      title: `A ${i}`,
      _geo: { lat: i, lng: i },
      event_timezone: "UTC",
    }));
    const { meili } = makeMeili(hits);
    const { collection, truncated } = await buildClusters(meili, {
      ...baseInput,
      zoom: 14,
      limit: 3,
    });
    expect(truncated).toBe(true);
    expect(collection.features).toHaveLength(3);
  });

  it("forces visibility=public filter on the Meili query", async () => {
    const { meili, searchSeries } = makeMeili([]);
    await buildClusters(meili, { ...baseInput, zoom: 14 });
    const call = searchSeries.mock.calls[0][0] as { filter: string[] };
    expect(call.filter).toContain('visibility = "public"');
  });

  it("at low zoom (<13) runs supercluster and can emit cluster features", async () => {
    // Two tightly grouped points inside a wide bbox at zoom 2 will cluster.
    const hits: SeriesHit[] = [
      { series_id: "s1", slug: "a", title: "A", _geo: { lat: 0.01, lng: 0.01 }, event_timezone: "UTC" },
      { series_id: "s2", slug: "b", title: "B", _geo: { lat: 0.02, lng: 0.02 }, event_timezone: "UTC" },
      { series_id: "s3", slug: "c", title: "C", _geo: { lat: 0.015, lng: 0.015 }, event_timezone: "UTC" },
    ];
    const { meili } = makeMeili(hits);
    const { collection } = await buildClusters(meili, { ...baseInput, zoom: 2 });
    const hasCluster = collection.features.some(
      (f) => (f.properties as { cluster?: boolean }).cluster === true,
    );
    expect(hasCluster).toBe(true);
  });

  it("falls back to now() ISO when a hit has no earliest_upcoming_ts", async () => {
    const hits: SeriesHit[] = [
      { series_id: "s1", slug: "a", title: "A", _geo: { lat: 1, lng: 2 }, event_timezone: "UTC" },
    ];
    const { meili } = makeMeili(hits);
    const { collection } = await buildClusters(meili, { ...baseInput, zoom: 14 });
    const props = collection.features[0].properties as { starts_at_utc: string };
    expect(() => new Date(props.starts_at_utc).toISOString()).not.toThrow();
    expect(props.starts_at_utc).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
