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

vi.mock("../db/organizerRepo", () => ({
  createOrganizer: vi.fn(),
  getOrganizerByExternalRef: vi.fn(),
  updateOrganizer: vi.fn(),
}));

vi.mock("../db/eventRepo", () => ({
  getEventById: vi.fn(),
  setEventOrganizersByRoleKey: vi.fn(),
}));

vi.mock("../db/manageRepo", () => ({
  listManagedEvents: vi.fn(),
  listManagedOrganizers: vi.fn(),
}));

vi.mock("../middleware/ownership", () => ({
  resolveUserId: vi.fn().mockResolvedValue("00000000-0000-0000-0000-000000000001"),
  requireEventAccess: vi.fn().mockResolvedValue(undefined),
  requireOrganizerAccess: vi.fn().mockResolvedValue(undefined),
}));

import { getAdminEventById, listAdminEvents } from "../db/adminRepo";
import { getEventById, setEventOrganizersByRoleKey } from "../db/eventRepo";
import { createLocation } from "../db/locationRepo";
import {
  createOrganizer,
  getOrganizerByExternalRef,
  updateOrganizer,
} from "../db/organizerRepo";
import adminContentRoutes from "./adminContent";

function buildApp() {
  const app = Fastify();
  app.decorate("db", {} as never);
  app.decorate("authenticate", async () => {});
  app.decorate("requireEditor", async (request) => {
    request.auth = { sub: "test-user", roles: ["admin"], isAdmin: true, isEditor: true };
  });
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
          is_imported: true,
          import_source: "smoke_test",
          isImported: true,
          importSource: "smoke_test",
          detached_from_import: false,
          series_id: "00000000-0000-0000-0000-000000000010",
          seriesId: "00000000-0000-0000-0000-000000000010",
          status: "draft",
          attendance_mode: "in_person",
          schedule_kind: "single",
          event_format_id: null,
          updated_at: "2026-03-01T00:00:00.000Z",
          published_at: null,
          practice_category_label: null,
          event_format_label: null,
          event_format_key: null,
          tags: null,
          location_city: null,
          location_country: null,
          next_occurrence: null,
          next_ends_at: null,
          event_timezone: null,
          host_names: null,
          created_by_name: null,
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

  it("accepts online location without coords and country", async () => {
    vi.mocked(createLocation).mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000111",
      label: "Zoom Room",
      formatted_address: "Zoom Room",
      city: null,
      country_code: null,
      type: "online",
      fingerprint: "zoom:room-1",
      lat: null,
      lng: null,
    } as never);

    const app = buildApp();
    await app.register(adminContentRoutes);

    const response = await app.inject({
      method: "POST",
      url: "/admin/locations",
      payload: {
        type: "online",
        name: "Zoom Room",
        fingerprint: "zoom:room-1",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(vi.mocked(createLocation)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: "online",
        name: "Zoom Room",
        fingerprint: "zoom:room-1",
      }),
    );

    await app.close();
  });

  it("accepts physical location without coords when text fields are present", async () => {
    vi.mocked(createLocation).mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000112",
      label: "Studio Hall",
      formatted_address: "Studio Hall",
      city: "Berlin",
      country_code: "de",
      type: "physical",
      fingerprint: null,
      lat: null,
      lng: null,
    } as never);

    const app = buildApp();
    await app.register(adminContentRoutes);

    const response = await app.inject({
      method: "POST",
      url: "/admin/locations",
      payload: {
        type: "physical",
        label: "Studio Hall",
        city: "Berlin",
      },
    });

    expect(response.statusCode).toBe(201);
    await app.close();
  });

  it("rejects online location without name", async () => {
    const app = buildApp();
    await app.register(adminContentRoutes);

    const response = await app.inject({
      method: "POST",
      url: "/admin/locations",
      payload: {
        type: "online",
      },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("rejects physical location without any structured fields", async () => {
    const app = buildApp();
    await app.register(adminContentRoutes);

    const response = await app.inject({
      method: "POST",
      url: "/admin/locations",
      payload: {
        type: "physical",
      },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("upserts organizer by external ref (create path)", async () => {
    vi.mocked(getOrganizerByExternalRef).mockResolvedValue(null as never);
    vi.mocked(createOrganizer).mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000211",
      slug: "host-a",
    } as never);

    const app = buildApp();
    await app.register(adminContentRoutes);

    const response = await app.inject({
      method: "POST",
      url: "/admin/organizers/upsert-external",
      payload: {
        externalSource: "dr-importer:source",
        externalId: "host-1",
        name: "Host A",
        status: "published",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      id: "00000000-0000-0000-0000-000000000211",
      slug: "host-a",
      created: true,
    });

    await app.close();
  });

  it("upserts organizer by external ref (update path)", async () => {
    vi.mocked(getOrganizerByExternalRef).mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000212",
      slug: "host-b",
    } as never);
    vi.mocked(updateOrganizer).mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000212",
      slug: "host-b-2",
    } as never);

    const app = buildApp();
    await app.register(adminContentRoutes);

    const response = await app.inject({
      method: "POST",
      url: "/admin/organizers/upsert-external",
      payload: {
        externalSource: "dr-importer:source",
        externalId: "host-2",
        name: "Host B",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: "00000000-0000-0000-0000-000000000212",
      slug: "host-b-2",
      created: false,
    });

    await app.close();
  });

  it("replaces event organizers by role key", async () => {
    vi.mocked(getEventById).mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000213",
    } as never);
    vi.mocked(setEventOrganizersByRoleKey).mockResolvedValue({ ok: true });

    const app = buildApp();
    await app.register(adminContentRoutes);

    const response = await app.inject({
      method: "POST",
      url: "/admin/events/00000000-0000-0000-0000-000000000213/organizers/replace",
      payload: [
        {
          organizerId: "00000000-0000-0000-0000-000000000214",
          roleKey: "host",
          displayOrder: 0,
        },
      ],
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });

    await app.close();
  });
});
