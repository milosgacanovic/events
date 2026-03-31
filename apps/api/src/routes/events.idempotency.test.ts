import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/eventRepo", () => ({
  createEvent: vi.fn(),
  getEventById: vi.fn(),
  getEventByExternalRef: vi.fn(),
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
  findOrCreateUserBySub: vi.fn(),
  isServiceAccount: vi.fn().mockResolvedValue(false),
}));

vi.mock("../services/eventLifecycleService", () => ({
  publishEvent: vi.fn(),
  unpublishEvent: vi.fn(),
  cancelEvent: vi.fn(),
  regenerateOccurrences: vi.fn(),
}));

vi.mock("../middleware/ownership", () => ({
  resolveUserId: vi.fn().mockResolvedValue("00000000-0000-0000-0000-000000000001"),
  requireEventAccess: vi.fn().mockResolvedValue(undefined),
}));

import { findOrCreateUserBySub } from "../db/userRepo";
import {
  createEvent,
  getEventById,
  getEventByExternalRef,
  getEventBySlug,
  searchEventsFallback,
  updateEvent,
} from "../db/eventRepo";
import { publishEvent, regenerateOccurrences } from "../services/eventLifecycleService";
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
    app.decorate("db", {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    } as never);
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
        roles: ["editor"],
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
        roles: ["editor"],
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
        roles: ["editor"],
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
        roles: ["editor"],
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

  it("regenerates occurrences when a published event schedule changes via patch", async () => {
    vi.mocked(getEventById).mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000020",
      status: "published",
      schedule_kind: "recurring",
      single_start_at: null,
      single_end_at: null,
      rrule: "FREQ=WEEKLY;COUNT=3",
      rrule_dtstart_local: "2026-03-01T10:00:00.000Z",
      duration_minutes: 90,
      event_timezone: "UTC",
    } as never);
    vi.mocked(updateEvent).mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000020",
      status: "published",
      schedule_kind: "recurring",
      single_start_at: null,
      single_end_at: null,
      rrule: "FREQ=WEEKLY;COUNT=6",
      rrule_dtstart_local: "2026-03-01T10:00:00.000Z",
      duration_minutes: 90,
      event_timezone: "UTC",
    } as never);
    vi.mocked(regenerateOccurrences).mockResolvedValue();

    const app = Fastify();
    app.decorate("db", {} as never);
    app.decorate("meiliService", { client: { index: vi.fn() } } as never);
    app.decorate("authenticate", async () => {});
    app.decorate("requireEditor", async (request) => {
      request.auth = {
        sub: "importer-test-user",
        roles: ["editor"],
        isAdmin: false,
        isEditor: true,
      };
    });
    app.decorate("requireAdmin", async () => {});
    await app.register(eventRoutes);

    const response = await app.inject({
      method: "PATCH",
      url: "/events/00000000-0000-0000-0000-000000000020",
      payload: {
        rrule: "FREQ=WEEKLY;COUNT=6",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(vi.mocked(regenerateOccurrences)).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "00000000-0000-0000-0000-000000000020",
    );
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
    expect(options?.filter?.some((item) => item === "starts_at_ts >= 0")).toBe(true);
    await app.close();
  });

  it("uses now+365 days as default upper bound when to is not provided", async () => {
    const searchSpy = vi.fn().mockResolvedValue({
      hits: [],
      facetDistribution: {},
      estimatedTotalHits: 0,
    });

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
      url: "/events/search?page=1&pageSize=20",
    });

    expect(response.statusCode).toBe(200);
    const options = searchSpy.mock.calls[0]?.[1] as { filter?: string[] } | undefined;
    const upperBound = options?.filter?.find((item) => item.startsWith("starts_at_ts <= "));
    expect(upperBound).toBeDefined();

    const raw = upperBound?.replace("starts_at_ts <= ", "");
    const toTs = raw ? Number(raw) : null;
    expect(Number.isFinite(toTs)).toBe(true);

    const diffMs = toTs! - Date.now();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(364);
    expect(diffDays).toBeLessThan(366.5);

    await app.close();
  });

  it("maps sort=date_desc to starts_at_ts:desc", async () => {
    const searchSpy = vi.fn().mockResolvedValue({
      hits: [],
      facetDistribution: {},
      estimatedTotalHits: 0,
    });

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
      url: "/events/search?sort=date_desc&page=1&pageSize=20",
    });

    expect(response.statusCode).toBe(200);
    const options = searchSpy.mock.calls[0]?.[1] as { sort?: string[] } | undefined;
    expect(options?.sort).toEqual(["starts_at_ts:desc"]);
    await app.close();
  });

  it("supports countryCode CSV filtering with OR semantics", async () => {
    const searchSpy = vi.fn().mockResolvedValue({
      hits: [],
      facetDistribution: {},
      estimatedTotalHits: 0,
    });

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
      url: "/events/search?countryCode=rs,de&page=1&pageSize=20",
    });

    expect(response.statusCode).toBe(200);
    const options = searchSpy.mock.calls[0]?.[1] as { filter?: string[] } | undefined;
    expect(options?.filter).toContain("(country_code = \"rs\" OR country_code = \"de\")");
    await app.close();
  });

  it("supports languages CSV filtering with OR semantics", async () => {
    const searchSpy = vi.fn().mockResolvedValue({
      hits: [],
      facetDistribution: {},
      estimatedTotalHits: 0,
    });

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
      url: "/events/search?languages=en,fr&page=1&pageSize=20",
    });

    expect(response.statusCode).toBe(200);
    const options = searchSpy.mock.calls[0]?.[1] as { filter?: string[] } | undefined;
    expect(options?.filter).toContain("(languages = \"en\" OR languages = \"fr\")");
    await app.close();
  });

  it("supports attendanceMode CSV filtering with OR semantics", async () => {
    const searchSpy = vi.fn().mockResolvedValue({
      hits: [],
      facetDistribution: {},
      estimatedTotalHits: 0,
    });

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
      url: "/events/search?attendanceMode=in_person,online&page=1&pageSize=20",
    });

    expect(response.statusCode).toBe(200);
    const options = searchSpy.mock.calls[0]?.[1] as { filter?: string[] } | undefined;
    expect(options?.filter).toContain("(attendance_mode = \"in_person\" OR attendance_mode = \"online\")");
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

  it("accepts create with valid coverImageUrl and maps it to coverImagePath", async () => {
    vi.mocked(findOrCreateUserBySub).mockResolvedValue("00000000-0000-0000-0000-000000000001");
    vi.mocked(getEventByExternalRef).mockResolvedValue(null);
    vi.mocked(createEvent).mockResolvedValue({
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
        roles: ["editor"],
        isAdmin: false,
        isEditor: true,
      };
    });
    app.decorate("requireAdmin", async () => {});
    await app.register(eventRoutes);

    const response = await app.inject({
      method: "POST",
      url: "/events",
      payload: {
        ...singleEventPayload(),
        coverImageUrl: "https://cdn.example.org/events/e1.jpg",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(createEvent).toHaveBeenCalledWith(
      expect.anything(),
      "00000000-0000-0000-0000-000000000001",
      expect.objectContaining({
        coverImagePath: "https://cdn.example.org/events/e1.jpg",
        coverImageUrl: "https://cdn.example.org/events/e1.jpg",
      }),
    );
    await app.close();
  });

  it("rejects create with invalid coverImageUrl scheme", async () => {
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
        roles: ["editor"],
        isAdmin: false,
        isEditor: true,
      };
    });
    app.decorate("requireAdmin", async () => {});
    await app.register(eventRoutes);

    const response = await app.inject({
      method: "POST",
      url: "/events",
      payload: {
        ...singleEventPayload(),
        coverImageUrl: "javascript:alert(1)",
      },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns coverImageUrl in search hits from Meili documents", async () => {
    const searchSpy = vi.fn().mockResolvedValue({
      hits: [
        {
          occurrence_id: "00000000-0000-0000-0000-000000000101",
          starts_at_utc: "2026-03-20T19:00:00.000Z",
          ends_at_utc: "2026-03-20T21:00:00.000Z",
          event_id: "00000000-0000-0000-0000-000000000010",
          event_slug: "event-one",
          title: "Event One",
          cover_image_path: "https://cdn.example.org/events/e1.jpg",
          attendance_mode: "in_person",
          languages: ["en"],
          tags: [],
          practice_category_id: "11111111-1111-1111-1111-111111111111",
          practice_subcategory_id: null,
          organizer_ids: [],
          organizer_names: [],
          geo: null,
        },
      ],
      facetDistribution: {},
      estimatedTotalHits: 1,
    });
    vi.mocked(searchEventsFallback).mockResolvedValue({
      hits: [
        {
          occurrenceId: "00000000-0000-0000-0000-000000000101",
          startsAtUtc: "2026-03-20T19:00:00.000Z",
          endsAtUtc: "2026-03-20T21:00:00.000Z",
          event: {
            id: "00000000-0000-0000-0000-000000000010",
            slug: "event-one",
            title: "Event One",
            coverImageUrl: "https://cdn.example.org/events/e1.jpg",
            attendanceMode: "in_person",
            eventTimezone: "UTC",
            languages: ["en"],
            tags: [],
            practiceCategoryId: "11111111-1111-1111-1111-111111111111",
            practiceSubcategoryId: null,
            eventFormatId: null,
            isImported: false,
            importSource: null,
            externalUrl: null,
            lastSyncedAt: null,
          },
          location: null,
          organizers: [],
        },
      ],
      totalHits: 1,
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
      url: "/events/search?page=1&pageSize=20",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().hits[0].event.coverImageUrl).toBe("https://cdn.example.org/events/e1.jpg");
    await app.close();
  });

  it("returns coverImageUrl in event detail", async () => {
    vi.mocked(getEventBySlug).mockResolvedValue({
      event: {
        title: "Event One",
        cover_image_path: "https://cdn.example.org/events/e1.jpg",
      },
      organizers: [],
      defaultLocation: null,
      occurrences: {
        upcoming: [],
        past: [],
      },
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
    app.decorate("requireEditor", async () => {});
    app.decorate("requireAdmin", async () => {});
    await app.register(eventRoutes);

    const response = await app.inject({
      method: "GET",
      url: "/events/event-one",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().event.coverImageUrl).toBe("https://cdn.example.org/events/e1.jpg");
    await app.close();
  });
});
