import type { FastifyPluginAsync } from "fastify";
import { DateTime } from "luxon";
import { z } from "zod";

import { runAlertsDry } from "../db/alertRepo";
import { OCCURRENCES_INDEX } from "../services/meiliService";
import {
  createEventFormat,
  createOrganizerRole,
  createPractice,
  deleteEventFormat,
  deleteOrganizerRole,
  deletePractice,
  listEventFormats,
  reorderEventFormats,
  reorderOrganizerRoles,
  reorderPractices,
  updateEventFormat,
  updateOrganizerRole,
  updatePractice,
} from "../db/taxonomyRepo";
import {
  getUserLinkedEvents,
  getUserLinkedHosts,
  listUsersWithRoles,
  linkUserToHost,
  unlinkUserFromHost,
  linkUserToEvent,
  unlinkUserFromEvent,
} from "../db/userManageRepo";
import { getUiLabels, updateUiLabels } from "../db/uiLabelRepo";
import { resolveUserId } from "../middleware/ownership";

const createPracticeSchema = z.object({
  parentId: z.string().uuid().nullable().optional(),
  level: z.union([z.literal(1), z.literal(2)]),
  key: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  label: z.string().min(1),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const updatePracticeSchema = createPracticeSchema.partial();

const createRoleSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const updateRoleSchema = createRoleSchema.partial();
const eventFormatSchema = z.object({
  key: z.string().trim().regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/).min(1),
  label: z.string().min(1),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
const updateEventFormatSchema = eventFormatSchema.partial();
const updateUiLabelsSchema = z.object({
  categorySingular: z.string().min(1).optional(),
  categoryPlural: z.string().min(1).optional(),
});

const reorderBodySchema = z.array(z.object({
  id: z.string().uuid(),
  sortOrder: z.number().int(),
})).min(1);

const adminRoutes: FastifyPluginAsync = async (app) => {
  // --- Taxonomy reorder endpoints (before /:id to avoid param collision) ---
  app.patch("/admin/practices/reorder", async (request, reply) => {
    await app.requireAdmin(request);
    const parsed = reorderBodySchema.safeParse(request.body);
    if (!parsed.success) { reply.code(400); return { error: parsed.error.flatten() }; }
    await reorderPractices(app.db, parsed.data);
    return { ok: true };
  });

  app.patch("/admin/event-formats/reorder", async (request, reply) => {
    await app.requireAdmin(request);
    const parsed = reorderBodySchema.safeParse(request.body);
    if (!parsed.success) { reply.code(400); return { error: parsed.error.flatten() }; }
    await reorderEventFormats(app.db, parsed.data);
    return { ok: true };
  });

  app.patch("/admin/organizer-roles/reorder", async (request, reply) => {
    await app.requireAdmin(request);
    const parsed = reorderBodySchema.safeParse(request.body);
    if (!parsed.success) { reply.code(400); return { error: parsed.error.flatten() }; }
    await reorderOrganizerRoles(app.db, parsed.data);
    return { ok: true };
  });

  app.post("/admin/practices", async (request, reply) => {
    await app.requireAdmin(request);

    const parsed = createPracticeSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }

    const practice = await createPractice(app.db, parsed.data);
    reply.code(201);
    return practice;
  });

  app.patch("/admin/practices/:id", async (request, reply) => {
    await app.requireAdmin(request);

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      reply.code(400);
      return { error: params.error.flatten() };
    }

    const parsed = updatePracticeSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }

    const practice = await updatePractice(app.db, params.data.id, parsed.data);
    if (!practice) {
      reply.code(404);
      return { error: "not_found" };
    }

    return practice;
  });

  app.post("/admin/organizer-roles", async (request, reply) => {
    await app.requireAdmin(request);

    const parsed = createRoleSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }

    const role = await createOrganizerRole(app.db, parsed.data);
    reply.code(201);
    return role;
  });

  app.patch("/admin/organizer-roles/:id", async (request, reply) => {
    await app.requireAdmin(request);

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      reply.code(400);
      return { error: params.error.flatten() };
    }

    const parsed = updateRoleSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }

    const role = await updateOrganizerRole(app.db, params.data.id, parsed.data);
    if (!role) {
      reply.code(404);
      return { error: "not_found" };
    }

    return role;
  });

  app.get("/admin/event-formats", async (request) => {
    await app.requireAdmin(request);
    return listEventFormats(app.db);
  });

  app.post("/admin/event-formats", async (request, reply) => {
    await app.requireAdmin(request);

    const parsed = eventFormatSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }

    const created = await createEventFormat(app.db, parsed.data);
    reply.code(201);
    return created;
  });

  app.patch("/admin/event-formats/:id", async (request, reply) => {
    await app.requireAdmin(request);

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      reply.code(400);
      return { error: params.error.flatten() };
    }

    const parsed = updateEventFormatSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }

    const updated = await updateEventFormat(app.db, params.data.id, parsed.data);
    if (!updated) {
      reply.code(404);
      return { error: "not_found" };
    }

    return updated;
  });

  app.patch("/admin/ui-labels", async (request, reply) => {
    await app.requireAdmin(request);

    const parsed = updateUiLabelsSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }

    if (
      parsed.data.categorySingular === undefined &&
      parsed.data.categoryPlural === undefined
    ) {
      reply.code(400);
      return { error: "No label fields provided" };
    }

    const uiLabels = await updateUiLabels(app.db, parsed.data);
    return {
      uiLabels: {
        categorySingular: uiLabels.categorySingular,
        categoryPlural: uiLabels.categoryPlural,
        practiceCategory: uiLabels.categoryPlural,
      },
    };
  });

  app.get("/admin/ui-labels", async (request) => {
    await app.requireAdmin(request);
    const uiLabels = await getUiLabels(app.db);
    return {
      uiLabels: {
        categorySingular: uiLabels.categorySingular,
        categoryPlural: uiLabels.categoryPlural,
        practiceCategory: uiLabels.categoryPlural,
      },
    };
  });

  // --- Taxonomy DELETE endpoints ---
  app.delete("/admin/practices/:id", async (request, reply) => {
    await app.requireAdmin(request);
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) { reply.code(400); return { error: params.error.flatten() }; }
    const result = await deletePractice(app.db, params.data.id);
    if (result.conflict) { reply.code(409); return { error: result.conflict }; }
    if (!result.deleted) { reply.code(404); return { error: "not_found" }; }
    reply.code(204);
  });

  app.delete("/admin/event-formats/:id", async (request, reply) => {
    await app.requireAdmin(request);
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) { reply.code(400); return { error: params.error.flatten() }; }
    const result = await deleteEventFormat(app.db, params.data.id);
    if (result.conflict) { reply.code(409); return { error: result.conflict }; }
    if (!result.deleted) { reply.code(404); return { error: "not_found" }; }
    reply.code(204);
  });

  app.delete("/admin/organizer-roles/:id", async (request, reply) => {
    await app.requireAdmin(request);
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) { reply.code(400); return { error: params.error.flatten() }; }
    const result = await deleteOrganizerRole(app.db, params.data.id);
    if (result.conflict) { reply.code(409); return { error: result.conflict }; }
    if (!result.deleted) { reply.code(404); return { error: "not_found" }; }
    reply.code(204);
  });

  // --- User management endpoints ---
  app.get("/admin/users", async (request, reply) => {
    await app.requireAdmin(request);
    const parsed = z.object({
      search: z.string().optional(),
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().positive().max(100).default(20),
    }).safeParse(request.query);
    if (!parsed.success) { reply.code(400); return { error: parsed.error.flatten() }; }

    const result = await listUsersWithRoles(app.db, parsed.data);

    // Set roles from DB (updated on each auth via JWT claims)
    for (const user of result.items) {
      (user as Record<string, unknown>).keycloak_roles = user.roles ?? [];
    }

    // Optionally enrich display_name/email from Keycloak Admin API
    if (app.keycloakAdmin) {
      for (const user of result.items) {
        const u = user as Record<string, unknown>;
        try {
          const kcUser = await app.keycloakAdmin.getUser(user.keycloak_sub);
          if (kcUser) {
            u.display_name = u.display_name
              || [kcUser.firstName, kcUser.lastName].filter(Boolean).join(" ")
              || kcUser.username;
            u.email = u.email || kcUser.email;
          }
        } catch (err) { app.log.warn({ err, sub: user.keycloak_sub }, "Keycloak user enrichment failed"); }
      }
    }

    return result;
  });

  app.patch("/admin/users/:id/roles", async (request, reply) => {
    await app.requireAdmin(request);
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) { reply.code(400); return { error: params.error.flatten() }; }
    const body = z.object({
      add: z.array(z.string()).optional(),
      remove: z.array(z.string()).optional(),
    }).safeParse(request.body);
    if (!body.success) { reply.code(400); return { error: body.error.flatten() }; }

    if (!app.keycloakAdmin) {
      reply.code(501);
      return { error: "Keycloak admin not configured" };
    }

    const userRow = await app.db.query<{ keycloak_sub: string }>(
      `select keycloak_sub from users where id = $1`, [params.data.id],
    );
    if (!userRow.rows[0]) { reply.code(404); return { error: "not_found" }; }
    const sub = userRow.rows[0].keycloak_sub;

    for (const role of body.data.add ?? []) {
      await app.keycloakAdmin.grantRole(sub, role);
    }
    for (const role of body.data.remove ?? []) {
      await app.keycloakAdmin.revokeRole(sub, role);
    }

    // Sync DB roles column to reflect the Keycloak change immediately
    for (const role of body.data.add ?? []) {
      await app.db.query(
        `update users set roles = array_append(roles, $2) where id = $1 and not ($2 = any(roles))`,
        [params.data.id, role],
      );
    }
    for (const role of body.data.remove ?? []) {
      await app.db.query(
        `update users set roles = array_remove(roles, $2) where id = $1`,
        [params.data.id, role],
      );
    }

    return { ok: true };
  });

  app.get("/admin/users/:id/hosts", async (request, reply) => {
    await app.requireAdmin(request);
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) { reply.code(400); return { error: params.error.flatten() }; }
    return getUserLinkedHosts(app.db, params.data.id);
  });

  app.get("/admin/users/:id/events", async (request, reply) => {
    await app.requireAdmin(request);
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) { reply.code(400); return { error: params.error.flatten() }; }
    return getUserLinkedEvents(app.db, params.data.id);
  });

  app.post("/admin/users/:id/hosts", async (request, reply) => {
    await app.requireAdmin(request);
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) { reply.code(400); return { error: params.error.flatten() }; }
    const body = z.object({ organizerId: z.string().uuid() }).safeParse(request.body);
    if (!body.success) { reply.code(400); return { error: body.error.flatten() }; }

    const auth = request.auth!;
    const adminUserId = await resolveUserId(app.db, auth);
    await linkUserToHost(app.db, params.data.id, body.data.organizerId, adminUserId);
    reply.code(201);
    return { ok: true };
  });

  app.delete("/admin/users/:id/hosts/:hostId", async (request, reply) => {
    await app.requireAdmin(request);
    const params = z.object({ id: z.string().uuid(), hostId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) { reply.code(400); return { error: params.error.flatten() }; }
    await unlinkUserFromHost(app.db, params.data.id, params.data.hostId);
    reply.code(204);
  });

  app.post("/admin/users/:id/events", async (request, reply) => {
    await app.requireAdmin(request);
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) { reply.code(400); return { error: params.error.flatten() }; }
    const body = z.object({ eventId: z.string().uuid() }).safeParse(request.body);
    if (!body.success) { reply.code(400); return { error: body.error.flatten() }; }

    const auth = request.auth!;
    const adminUserId = await resolveUserId(app.db, auth);
    await linkUserToEvent(app.db, params.data.id, body.data.eventId, adminUserId);
    reply.code(201);
    return { ok: true };
  });

  app.delete("/admin/users/:id/events/:eventId", async (request, reply) => {
    await app.requireAdmin(request);
    const params = z.object({ id: z.string().uuid(), eventId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) { reply.code(400); return { error: params.error.flatten() }; }
    await unlinkUserFromEvent(app.db, params.data.id, params.data.eventId);
    reply.code(204);
  });

  app.post("/admin/events/reindex", async (request) => {
    await app.requireAdmin(request);
    // Fire-and-forget — returns immediately; reindex runs in background
    setImmediate(async () => {
      try {
        const docs = await app.meiliService.fetchOccurrenceDocs(app.db);
        const index = app.meiliService.client.index(OCCURRENCES_INDEX);
        const deleteTask = await index.deleteAllDocuments();
        await app.meiliService.client.waitForTask(deleteTask.taskUid, { timeOutMs: 120000 });
        const BATCH = 500;
        for (let i = 0; i < docs.length; i += BATCH) {
          await index.addDocuments(docs.slice(i, i + BATCH));
        }
      } catch { /* logged by Fastify */ }
    });
    return { ok: true, message: "Reindex started in background" };
  });

  app.get("/admin/alerts/run-dry", async (request) => {
    await app.requireAdmin(request);
    const from = DateTime.utc();
    const to = from.plus({ days: 30 });
    const rows = await runAlertsDry(app.db, from.toISO()!, to.toISO()!);

    const summaryByAlert = new Map<string, {
      organizerId: string;
      organizerName: string;
      matches: number;
    }>();

    for (const row of rows) {
      const existing = summaryByAlert.get(row.alert_id);
      if (existing) {
        existing.matches += 1;
      } else {
        summaryByAlert.set(row.alert_id, {
          organizerId: row.organizer_id,
          organizerName: row.organizer_name,
          matches: 1,
        });
      }
    }

    return {
      dryRun: true,
      from: from.toISO(),
      to: to.toISO(),
      totalMatches: rows.length,
      alertsMatched: summaryByAlert.size,
      alerts: Array.from(summaryByAlert.entries()).map(([alertId, value]) => ({
        alertId,
        ...value,
      })),
      sample: rows.slice(0, 100).map((row) => ({
        alertId: row.alert_id,
        organizerId: row.organizer_id,
        organizerName: row.organizer_name,
        eventId: row.event_id,
        eventSlug: row.event_slug,
        eventTitle: row.event_title,
        occurrenceId: row.occurrence_id,
        startsAtUtc: row.starts_at_utc,
        city: row.city,
        countryCode: row.country_code,
      })),
    };
  });
  // --- Re-attach detached events/hosts to import ---
  app.post("/admin/events/:id/reattach", async (request, reply) => {
    await app.requireAdmin(request);
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) { reply.code(400); return { error: params.error.flatten() }; }

    const result = await app.db.query(
      `update events set detached_from_import = false, detached_at = null, detached_by_user_id = null
       where id = $1 and detached_from_import = true
       returning id`,
      [params.data.id],
    );
    if (!result.rows[0]) { reply.code(404); return { error: "not_found_or_not_detached" }; }
    return { ok: true };
  });

};

export default adminRoutes;
