import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { checkRateLimit, resetRateLimitBuckets, resolvePublicRateLimit } from "./rateLimit";

describe("public rate limiter", () => {
  afterEach(() => {
    resetRateLimitBuckets();
  });

  it("returns 429 after max requests for /api/events/search", async () => {
    const app = Fastify();
    const windowMs = 60_000;
    const maxRequests = 60;

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
    for (let i = 0; i < 70; i += 1) {
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
});
