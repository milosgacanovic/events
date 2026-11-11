import Fastify from "fastify";
import { describe, expect, it } from "vitest";

import { DEFAULT_TRUST_PROXY } from "./trustProxy";

async function ipFor(remoteAddress: string, xff?: string): Promise<string> {
  const app = Fastify({ trustProxy: DEFAULT_TRUST_PROXY });
  app.get("/ip", async (request) => ({ ip: request.ip }));
  const res = await app.inject({
    method: "GET",
    url: "/ip",
    remoteAddress,
    headers: xff ? { "x-forwarded-for": xff } : {},
  });
  await app.close();
  return (res.json() as { ip: string }).ip;
}

describe("DEFAULT_TRUST_PROXY", () => {
  it("uses the client IP Apache appended when the request comes via the Docker gateway", async () => {
    expect(await ipFor("172.19.0.1", "203.0.113.7")).toBe("203.0.113.7");
  });

  it("ignores a spoofed X-Forwarded-For entry left of the real client", async () => {
    expect(await ipFor("172.19.0.1", "198.51.100.1, 203.0.113.7")).toBe("203.0.113.7");
  });

  it("keeps the web container's own address for server-side fetches", async () => {
    expect(await ipFor("172.19.0.8")).toBe("172.19.0.8");
  });

  it("does not trust X-Forwarded-For from a public peer", async () => {
    expect(await ipFor("203.0.113.9", "198.51.100.1")).toBe("203.0.113.9");
  });
});
