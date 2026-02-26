import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

import healthRoute from "./health";

describe("health route", () => {
  it("returns db/meili status with event counts", async () => {
    const dbQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
      .mockResolvedValueOnce({
        rows: [{ current_event_count: 12, published_event_count: 7 }],
      });

    const app = Fastify();
    app.decorate("db", { query: dbQuery } as never);
    app.decorate("meiliService", {
      healthcheck: vi.fn().mockResolvedValue(true),
    } as never);
    app.decorate("authenticate", async () => {});
    app.decorate("requireEditor", async () => {});
    app.decorate("requireAdmin", async () => {});
    await app.register(healthRoute);

    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      db: "ok",
      meili: "ok",
      db_connection_ok: true,
      current_event_count: 12,
      published_event_count: 7,
    });

    await app.close();
  });

  it("returns null counts when db check fails", async () => {
    const dbQuery = vi.fn().mockRejectedValue(new Error("db down"));

    const app = Fastify();
    app.decorate("db", { query: dbQuery } as never);
    app.decorate("meiliService", {
      healthcheck: vi.fn().mockResolvedValue(true),
    } as never);
    app.decorate("authenticate", async () => {});
    app.decorate("requireEditor", async () => {});
    app.decorate("requireAdmin", async () => {});
    await app.register(healthRoute);

    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: false,
      db: "error",
      meili: "ok",
      db_connection_ok: false,
      current_event_count: null,
      published_event_count: null,
    });

    await app.close();
  });
});
