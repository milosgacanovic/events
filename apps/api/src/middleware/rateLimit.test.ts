import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import {
  checkRateLimit,
  resetRateLimitBuckets,
  resolveAdminRateLimit,
  resolvePublicRateLimit,
} from "./rateLimit";

describe("public rate limiter", () => {
  afterEach(() => {
    resetRateLimitBuckets();
  });

  it("returns 429 after max requests for /api/events/search", async () => {
    const app = Fastify();
    const windowMs = 60_000;
    const maxRequests = 120;

    app.addHook("onRequest", async (request, reply) => {
      const path = request.url.split("?")[0] ?? request.url;
      const limit = resolvePublicRateLimit(path, maxRequests);
      if (!limit) {
        return;
      }

      const result = checkRateLimit({
        key: `${request.ip}:${path}`,
        now: Date.now(),
        windowMs,
        maxRequests: limit,
      });
      if (!result.allowed) {
        reply.code(429).send({ error: "rate_limit_exceeded" });
      }
    });

    app.get("/api/events/search", async () => ({ ok: true }));

    let status = 200;
    for (let i = 0; i < 130; i += 1) {
      const response = await app.inject({
        method: "GET",
        url: "/api/events/search",
      });
      status = response.statusCode;
      if (status === 429) {
        break;
      }
    }

    expect(status).toBe(429);
    await app.close();
  });

  it("applies a separate higher bucket for /api/admin/*", async () => {
    const windowMs = 60_000;
    const adminPath = "/api/admin/events";
    const adminLimit = resolveAdminRateLimit(adminPath);

    expect(adminLimit).toBe(300);

    let lastStatus = 200;
    for (let i = 0; i < 310; i += 1) {
      const result = checkRateLimit({
        key: `admin:127.0.0.1:${adminPath}`,
        now: Date.now(),
        windowMs,
        maxRequests: adminLimit!,
      });
      if (!result.allowed) {
        lastStatus = 429;
        break;
      }
    }

    expect(lastStatus).toBe(429);
  });

  it("allows higher public rate limit for /api/map/clusters", () => {
    expect(resolvePublicRateLimit("/api/map/clusters", 60)).toBe(120);
  });
});
