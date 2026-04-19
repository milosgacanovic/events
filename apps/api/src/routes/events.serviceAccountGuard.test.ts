import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/eventRepo", () => ({
  createEvent: vi.fn(),
  getEventById: vi.fn(),
  getEventByExternalRef: vi.fn().mockResolvedValue(null),
  getEventBySlug: vi.fn(),
  searchEventsFallback: vi.fn(),
  setEventOrganizers: vi.fn(),
  updateEvent: vi.fn(),
  eventHasOrganizers: vi.fn().mockResolvedValue(true),
}));

vi.mock("../db/locationRepo", () => ({
  getEventDefaultLocation: vi.fn(),
  setEventDefaultLocation: vi.fn(),
}));

vi.mock("../db/userRepo", () => ({
  findOrCreateUserBySub: vi.fn().mockResolvedValue("00000000-0000-0000-0000-000000000001"),
  isServiceAccount: vi.fn(),
}));

vi.mock("../services/eventLifecycleService", () => ({
  publishEvent: vi.fn(),
  unpublishEvent: vi.fn(),
  cancelEvent: vi.fn(),
  regenerateOccurrences: vi.fn(),
}));

vi.mock("../middleware/ownership", () => ({
  resolveUserId: vi.fn(),
  requireEventAccess: vi.fn(),
}));

import { createEvent } from "../db/eventRepo";
import { isServiceAccount } from "../db/userRepo";
import eventRoutes from "./events";

function payload(overrides: Record<string, unknown> = {}) {
  return {
    title: "Evt",
    descriptionJson: {},
    attendanceMode: "in_person",
    practiceCategoryId: "11111111-1111-1111-1111-111111111111",
    scheduleKind: "single",
    eventTimezone: "UTC",
    singleStartAt: "2026-03-20T19:00:00.000Z",
    singleEndAt: "2026-03-20T21:00:00.000Z",
    visibility: "public",
    tags: [],
    languages: [],
    organizerRoles: [],
    ...overrides,
  };
}

async function makeApp() {
  const app = Fastify();
  app.decorate("db", { query: vi.fn().mockResolvedValue({ rows: [] }) } as never);
  app.decorate("meiliService", {
    client: {
      index: () => ({
        search: async () => ({ hits: [], facetDistribution: {}, estimatedTotalHits: 0 }),
      }),
    },
  } as never);
  app.decorate("authenticate", async () => {});
  app.decorate("requireEditor", async (request) => {
    request.auth = {
      sub: "importer-service-account-sub",
      roles: ["editor"],
      isAdmin: false,
      isEditor: true,
    };
  });
  app.decorate("requireAdmin", async () => {});
  await app.register(eventRoutes);
  return app;
}

describe("POST /events — service-account guard", () => {
  afterEach(() => vi.clearAllMocks());

  it("rejects with 400 when service account omits externalSource+externalId", async () => {
    vi.mocked(isServiceAccount).mockResolvedValue(true);
    vi.mocked(createEvent).mockResolvedValue({ id: "x", slug: "x" } as never);

    const app = await makeApp();
    const res = await app.inject({ method: "POST", url: "/events", payload: payload() });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "service_account_missing_external_ref" });
    expect(createEvent).not.toHaveBeenCalled();
    await app.close();
  });

  it("rejects service account supplying only one half of the external ref (schema-level)", async () => {
    // The createEventSchema's refine rule rejects partial external refs before
    // the route runs, so the response is validation_failed rather than the
    // service-account guard error — either way the write is blocked.
    vi.mocked(isServiceAccount).mockResolvedValue(true);

    const app = await makeApp();
    const onlySource = await app.inject({
      method: "POST",
      url: "/events",
      payload: payload({ externalSource: "feed_a" }),
    });
    expect(onlySource.statusCode).toBe(400);
    expect(createEvent).not.toHaveBeenCalled();

    const onlyId = await app.inject({
      method: "POST",
      url: "/events",
      payload: payload({ externalId: "abc-123" }),
    });
    expect(onlyId.statusCode).toBe(400);
    expect(createEvent).not.toHaveBeenCalled();
    await app.close();
  });

  it("allows service-account POST when both externalSource+externalId are present", async () => {
    vi.mocked(isServiceAccount).mockResolvedValue(true);
    vi.mocked(createEvent).mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000099",
      slug: "ok",
    } as never);

    const app = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/events",
      payload: payload({ externalSource: "feed_a", externalId: "abc-123" }),
    });
    expect(res.statusCode).toBe(201);
    expect(createEvent).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("does NOT block regular users when externalSource+externalId are absent", async () => {
    vi.mocked(isServiceAccount).mockResolvedValue(false);
    vi.mocked(createEvent).mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000099",
      slug: "ok",
    } as never);

    const app = await makeApp();
    const res = await app.inject({ method: "POST", url: "/events", payload: payload() });
    expect(res.statusCode).toBe(201);
    expect(createEvent).toHaveBeenCalledTimes(1);
    await app.close();
  });
});
