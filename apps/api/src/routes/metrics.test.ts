import Fastify from "fastify";
import { beforeEach, describe, expect, it } from "vitest";

import metricsRoute from "./metrics";
import { recordPublish, recordSearchDuration, resetMetricsForTests } from "../services/metricsStore";

describe("metrics route", () => {
  beforeEach(() => {
    resetMetricsForTests();
  });

  it("returns rolling in-memory counters", async () => {
    recordSearchDuration(100);
    recordSearchDuration(300);
    recordPublish();

    const app = Fastify();
    app.decorate("db", {} as never);
    app.decorate("meiliService", {} as never);
    app.decorate("authenticate", async () => {});
    app.decorate("requireEditor", async () => {});
    app.decorate("requireAdmin", async () => {});
    await app.register(metricsRoute);

    const response = await app.inject({
      method: "GET",
      url: "/metrics",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      search_count: 2,
      publish_count: 1,
      avg_search_duration_ms: 200,
    });

    await app.close();
  });
});
