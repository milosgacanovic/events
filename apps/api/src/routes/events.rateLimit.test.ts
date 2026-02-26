import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";

import eventRoutes from "./events";

describe("events search rate limit", () => {
  it("returns 429 when limit is exceeded", async () => {
    const app = Fastify();
    app.decorate("db", {} as never);
    app.decorate("meiliService", {
      client: {
        index: () => ({
          search: async () => ({
            hits: [],
            facetDistribution: {},
            estimatedTotalHits: 0,
          }),
        }),
      },
    } as never);
    app.decorate("authenticate", async () => {});
    app.decorate("requireEditor", async () => {});
    app.decorate("requireAdmin", async () => {});

    await app.register(rateLimit, { global: false });
    await app.register(eventRoutes);

    let lastStatus = 200;
    for (let i = 0; i < 61; i += 1) {
      const response = await app.inject({
        method: "GET",
        url: "/events/search?page=1&pageSize=20",
      });
      lastStatus = response.statusCode;
      if (lastStatus === 429) {
        break;
      }
    }

    expect(lastStatus).toBe(429);
    await app.close();
  });
});
