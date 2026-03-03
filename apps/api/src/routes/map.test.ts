import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/mapClusterService", () => ({
  buildClusters: vi.fn(),
  buildOrganizerClusters: vi.fn(),
}));

import { buildClusters } from "../services/mapClusterService";
import mapRoutes from "./map";

describe("map clusters route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for invalid bbox", async () => {
    const app = Fastify();
    app.decorate("db", {} as never);
    await app.register(mapRoutes);

    const response = await app.inject({
      method: "GET",
      url: "/map/clusters?bbox=1,2,3&zoom=2",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "bbox must be west,south,east,north" });
    await app.close();
  });

  it("returns FeatureCollection with additive truncated flag", async () => {
    vi.mocked(buildClusters).mockResolvedValue({
      collection: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [10, 20] },
            properties: {
              cluster: false,
              occurrence_id: "occ_1",
              event_slug: "sample-event",
            },
          },
        ],
      },
      truncated: true,
    } as never);

    const app = Fastify();
    app.decorate("db", {} as never);
    await app.register(mapRoutes);

    const response = await app.inject({
      method: "GET",
      url: "/map/clusters?bbox=-20,-20,20,20&zoom=3",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      type: "FeatureCollection",
      truncated: true,
      features: [
        {
          properties: {
            cluster: false,
            occurrence_id: "occ_1",
            event_slug: "sample-event",
          },
        },
      ],
    });
    await app.close();
  });

  it("passes q and filters through to cluster builder", async () => {
    vi.mocked(buildClusters).mockResolvedValue({
      collection: { type: "FeatureCollection", features: [] },
      truncated: false,
    } as never);

    const app = Fastify();
    app.decorate("db", {} as never);
    await app.register(mapRoutes);

    const response = await app.inject({
      method: "GET",
      url: "/map/clusters?bbox=-180,-85,180,85&zoom=2&q=Berlin&countryCode=de&languages=en,sr",
    });

    expect(response.statusCode).toBe(200);
    expect(buildClusters).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        q: "Berlin",
        countryCode: "de",
        languages: ["en", "sr"],
        limit: 5000,
      }),
    );
    await app.close();
  });
});
