import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/adminRepo", () => ({
  listAdminEvents: vi.fn(),
  listAdminOrganizers: vi.fn(),
  getAdminEventById: vi.fn(),
  getAdminOrganizerById: vi.fn(),
}));

vi.mock("../db/locationRepo", () => ({
  createLocation: vi.fn(),
}));

import { getAdminEventById, listAdminEvents } from "../db/adminRepo";
import adminContentRoutes from "./adminContent";

function buildApp() {
  const app = Fastify();
  app.decorate("db", {} as never);
  app.decorate("authenticate", async () => {});
  app.decorate("requireEditor", async () => {});
  app.decorate("requireAdmin", async () => {});
  return app;
}

describe("admin content external ref filters", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 if only one external ref query param is provided", async () => {
    const app = buildApp();
    await app.register(adminContentRoutes);

    const response = await app.inject({
      method: "GET",
      url: "/admin/events?externalSource=smoke_test&page=1&pageSize=20",
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns filtered admin list including external refs", async () => {
    vi.mocked(listAdminEvents).mockResolvedValue({
      items: [
        {
          id: "00000000-0000-0000-0000-000000000010",
          slug: "event-a",
          title: "Event A",
          external_source: "smoke_test",
          external_id: "evt-1",
          externalSource: "smoke_test",
          externalId: "evt-1",
          status: "draft",
          attendance_mode: "in_person",
          schedule_kind: "single",
          updated_at: "2026-03-01T00:00:00.000Z",
          published_at: null,
        },
      ],
      pagination: {
        page: 1,
        pageSize: 20,
        totalPages: 1,
        totalItems: 1,
      },
    });

    const app = buildApp();
    await app.register(adminContentRoutes);

    const response = await app.inject({
      method: "GET",
      url: "/admin/events?externalSource=smoke_test&externalId=evt-1&page=1&pageSize=20",
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({
      externalSource: "smoke_test",
      externalId: "evt-1",
    });
    expect(vi.mocked(listAdminEvents)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        externalSource: "smoke_test",
        externalId: "evt-1",
      }),
    );

    await app.close();
  });

  it("returns admin detail including external refs", async () => {
    vi.mocked(getAdminEventById).mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000010",
      slug: "event-a",
      title: "Event A",
      external_source: "smoke_test",
      external_id: "evt-1",
      externalSource: "smoke_test",
      externalId: "evt-1",
    } as never);

    const app = buildApp();
    await app.register(adminContentRoutes);

    const response = await app.inject({
      method: "GET",
      url: "/admin/events/00000000-0000-0000-0000-000000000010",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      externalSource: "smoke_test",
      externalId: "evt-1",
    });

    await app.close();
  });
});
