import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/eventRepo", () => ({
  createEvent: vi.fn(),
  getEventByExternalRef: vi.fn(),
  getEventBySlug: vi.fn(),
  searchEventsFallback: vi.fn(),
  setEventOrganizers: vi.fn(),
  updateEvent: vi.fn(),
}));

vi.mock("../db/locationRepo", () => ({
  setEventDefaultLocation: vi.fn(),
}));

vi.mock("../db/userRepo", () => ({
  findOrCreateUserBySub: vi.fn(),
}));

vi.mock("../services/eventLifecycleService", () => ({
  publishEvent: vi.fn(),
  unpublishEvent: vi.fn(),
  cancelEvent: vi.fn(),
}));

import { findOrCreateUserBySub } from "../db/userRepo";
import { createEvent, getEventByExternalRef, searchEventsFallback, updateEvent } from "../db/eventRepo";
import { publishEvent } from "../services/eventLifecycleService";
import eventRoutes from "./events";

function singleEventPayload() {
  return {
    title: "Importer Event",
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
    externalSource: "feed_a",
    externalId: "event_1001",
  };
}

describe("events idempotency conflict handling", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 409 when creating the same externalSource+externalId twice", async () => {
    vi.mocked(findOrCreateUserBySub).mockResolvedValue("00000000-0000-0000-0000-000000000001");
    vi.mocked(createEvent).mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000010",
      slug: "importer-event",
    } as never);

    vi.mocked(getEventByExternalRef)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "00000000-0000-0000-0000-000000000010",
        slug: "importer-event",
      } as never);

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
    app.decorate("requireEditor", async (request) => {
      request.auth = {
        sub: "importer-test-user",
        roles: ["dr_events_editor"],
        isAdmin: false,
        isEditor: true,
      };
    });
    app.decorate("requireAdmin", async () => {});
    await app.register(eventRoutes);

    const first = await app.inject({
      method: "POST",
      url: "/events",
      payload: singleEventPayload(),
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: "POST",
      url: "/events",
      payload: singleEventPayload(),
    });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({
      error: "external_ref_conflict",
      externalSource: "feed_a",
      externalId: "event_1001",
    });

    await app.close();
  });

  it("allows reusing externalSource+externalId after patch clear to null", async () => {
    vi.mocked(findOrCreateUserBySub).mockResolvedValue("00000000-0000-0000-0000-000000000001");

    let externalRefInUse = false;
    let createdCount = 0;
    vi.mocked(createEvent).mockImplementation(async () => {
      createdCount += 1;
      externalRefInUse = true;
      return {
        id: `00000000-0000-0000-0000-00000000001${createdCount}`,
        slug: `importer-event-${createdCount}`,
      } as never;
    });

    vi.mocked(getEventByExternalRef).mockImplementation(async () => (
      externalRefInUse
        ? ({
            id: "00000000-0000-0000-0000-000000000010",
            slug: "importer-event-1",
          } as never)
        : null
    ));

    vi.mocked(updateEvent).mockImplementation(async (_db, eventId, input) => {
      if (input.externalSource === null && input.externalId === null) {
        externalRefInUse = false;
      }
      return {
        id: eventId,
        slug: "importer-event-1",
      } as never;
    });

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
    app.decorate("requireEditor", async (request) => {
      request.auth = {
        sub: "importer-test-user",
        roles: ["dr_events_editor"],
        isAdmin: false,
        isEditor: true,
      };
    });
    app.decorate("requireAdmin", async () => {});
    await app.register(eventRoutes);

    const firstCreate = await app.inject({
      method: "POST",
      url: "/events",
      payload: singleEventPayload(),
    });
    expect(firstCreate.statusCode).toBe(201);

    const duplicateCreate = await app.inject({
      method: "POST",
      url: "/events",
      payload: singleEventPayload(),
    });
    expect(duplicateCreate.statusCode).toBe(409);

    const clear = await app.inject({
      method: "PATCH",
      url: "/events/00000000-0000-0000-0000-000000000010",
      payload: {
        externalSource: null,
        externalId: null,
      },
    });
    expect(clear.statusCode).toBe(200);

    const createAfterClear = await app.inject({
      method: "POST",
      url: "/events",
      payload: singleEventPayload(),
    });
    expect(createAfterClear.statusCode).toBe(201);

    await app.close();
  });

  it("returns 400 when publishing an expired single event", async () => {
    vi.mocked(publishEvent).mockRejectedValue(new Error("event_expired_for_publish"));

    const app = Fastify();
    app.decorate("db", {} as never);
    app.decorate("meiliService", { client: { index: vi.fn() } } as never);
    app.decorate("authenticate", async () => {});
    app.decorate("requireEditor", async (request) => {
      request.auth = {
        sub: "importer-test-user",
        roles: ["dr_events_editor"],
        isAdmin: false,
        isEditor: true,
      };
    });
    app.decorate("requireAdmin", async () => {});
    await app.register(eventRoutes);

    const response = await app.inject({
      method: "POST",
      url: "/events/00000000-0000-0000-0000-000000000010/publish",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "event_expired_for_publish" });
    await app.close();
  });

  it("publishes future event successfully", async () => {
    vi.mocked(publishEvent).mockResolvedValue();

    const app = Fastify();
    app.decorate("db", {} as never);
    app.decorate("meiliService", { client: { index: vi.fn() } } as never);
    app.decorate("authenticate", async () => {});
    app.decorate("requireEditor", async (request) => {
      request.auth = {
        sub: "importer-test-user",
        roles: ["dr_events_editor"],
        isAdmin: false,
        isEditor: true,
      };
    });
    app.decorate("requireAdmin", async () => {});
    await app.register(eventRoutes);

    const response = await app.inject({
      method: "POST",
      url: "/events/00000000-0000-0000-0000-000000000010/publish",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    await app.close();
  });

  it("includePast=true widens search lower bound", async () => {
    const searchSpy = vi.fn().mockResolvedValue({
      hits: [],
      facetDistribution: {},
      estimatedTotalHits: 0,
    });
    vi.mocked(searchEventsFallback).mockResolvedValue({
      hits: [],
      totalHits: 0,
      facets: {},
      pagination: { page: 1, pageSize: 20, totalPages: 1 },
    } as never);

    const app = Fastify();
    app.decorate("db", {} as never);
    app.decorate("meiliService", {
      client: {
        index: () => ({
          search: searchSpy,
        }),
      },
    } as never);
    app.decorate("authenticate", async () => {});
    app.decorate("requireEditor", async () => {});
    app.decorate("requireAdmin", async () => {});
    await app.register(eventRoutes);

    const response = await app.inject({
      method: "GET",
      url: "/events/search?includePast=true&page=1&pageSize=20",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("public, max-age=30");
    expect(response.headers.vary).toContain("Authorization");
    const options = searchSpy.mock.calls[0]?.[1] as { filter?: string[] } | undefined;
    expect(options?.filter?.some((item) => item.includes("starts_at_utc >= \"1970-01-01T00:00:00.000Z\""))).toBe(true);
    await app.close();
  });

  it("logs events.search.timing with includePast/page/pageSize", async () => {
    const searchSpy = vi.fn().mockResolvedValue({
      hits: [],
      facetDistribution: {},
      estimatedTotalHits: 0,
    });
    const logInfo = vi.fn();

    const app = Fastify({
      logger: {
        level: "silent",
      },
    });
    app.decorate("db", {} as never);
    app.decorate("meiliService", {
      client: {
        index: () => ({
          search: searchSpy,
        }),
      },
    } as never);
    app.decorate("authenticate", async () => {});
    app.decorate("requireEditor", async () => {});
    app.decorate("requireAdmin", async () => {});
    await app.register(async (instance) => {
      instance.addHook("onRequest", async (request) => {
        (request as unknown as { log: { info: typeof logInfo } }).log = { info: logInfo } as never;
      });
      await instance.register(eventRoutes);
    });

    const response = await app.inject({
      method: "GET",
      url: "/events/search?includePast=true&page=2&pageSize=10",
    });

    expect(response.statusCode).toBe(200);
    expect(logInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        duration_ms: expect.any(Number),
        includePast: true,
        page: 2,
        pageSize: 10,
      }),
      "events.search.timing",
    );
    await app.close();
  });
});
