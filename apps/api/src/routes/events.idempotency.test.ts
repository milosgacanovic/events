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
import { createEvent, getEventByExternalRef } from "../db/eventRepo";
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
});
