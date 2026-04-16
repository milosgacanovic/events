import type { FastifyPluginAsync } from "fastify";
import { DateTime } from "luxon";
import { z } from "zod";

import { listActivityLogs, listActivityActors, getActivityLogById, listErrorLogs, getErrorLogById } from "../db/activityLogRepo";
import { listModerationItems, getModerationStats, getModerationDetail, updateStatus as updateModerationStatus } from "../db/moderationRepo";
import { listRecommendations, getRecommendationStats } from "../db/recommendationRepo";
import { recordActivity } from "../services/activityLogger";
import { runAlertsDry } from "../db/alertRepo";
import { getSetting, updateSetting } from "../db/settingsRepo";
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
  getUserDetail,
  listUsersWithRoles,
  linkUserToHost,
  unlinkUserFromHost,
  linkUserToEvent,
  unlinkUserFromEvent,
  updateUserNote,
  suspendUser,
} from "../db/userManageRepo";
import { getUiLabels, updateUiLabels } from "../db/uiLabelRepo";
import { resolveUserId } from "../middleware/ownership";
import { fetchManagedEventMapPoints, fetchManagedOrganizerMapPoints } from "../db/manageRepo";
import { logValidation } from "../utils/validationError";

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
    if (!parsed.success) { reply.code(400); return logValidation(request, parsed.error); }
    await reorderPractices(app.db, parsed.data);
    return { ok: true };
  });

  app.patch("/admin/event-formats/reorder", async (request, reply) => {
    await app.requireAdmin(request);
    const parsed = reorderBodySchema.safeParse(request.body);
    if (!parsed.success) { reply.code(400); return logValidation(request, parsed.error); }
    await reorderEventFormats(app.db, parsed.data);
    return { ok: true };
  });

  app.patch("/admin/organizer-roles/reorder", async (request, reply) => {
    await app.requireAdmin(request);
    const parsed = reorderBodySchema.safeParse(request.body);
    if (!parsed.success) { reply.code(400); return logValidation(request, parsed.error); }
    await reorderOrganizerRoles(app.db, parsed.data);
    return { ok: true };
  });

  app.post("/admin/practices", async (request, reply) => {
    await app.requireAdmin(request);

    const parsed = createPracticeSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return logValidation(request, parsed.error);
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
      return logValidation(request, params.error);
    }

    const parsed = updatePracticeSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return logValidation(request, parsed.error);
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
      return logValidation(request, parsed.error);
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
      return logValidation(request, params.error);
    }

    const parsed = updateRoleSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return logValidation(request, parsed.error);
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
      return logValidation(request, parsed.error);
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
      return logValidation(request, params.error);
    }

    const parsed = updateEventFormatSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return logValidation(request, parsed.error);
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
      return logValidation(request, parsed.error);
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
    if (!params.success) { reply.code(400); return logValidation(request, params.error); }
    const result = await deletePractice(app.db, params.data.id);
    if (result.conflict) { reply.code(409); return { error: result.conflict }; }
    if (!result.deleted) { reply.code(404); return { error: "not_found" }; }
    reply.code(204);
  });

  app.delete("/admin/event-formats/:id", async (request, reply) => {
    await app.requireAdmin(request);
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) { reply.code(400); return logValidation(request, params.error); }
    const result = await deleteEventFormat(app.db, params.data.id);
    if (result.conflict) { reply.code(409); return { error: result.conflict }; }
    if (!result.deleted) { reply.code(404); return { error: "not_found" }; }
    reply.code(204);
  });

  app.delete("/admin/organizer-roles/:id", async (request, reply) => {
    await app.requireAdmin(request);
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) { reply.code(400); return logValidation(request, params.error); }
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
      sort: z.enum(["created", "name", "email", "hosts", "events"]).optional(),
      sortDir: z.enum(["asc", "desc"]).optional(),
      role: z.enum(["admin", "editor"]).optional(),
      hasNotes: z.coerce.boolean().optional(),
    }).safeParse(request.query);
    if (!parsed.success) { reply.code(400); return logValidation(request, parsed.error); }

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
    if (!params.success) { reply.code(400); return logValidation(request, params.error); }
    const body = z.object({
      add: z.array(z.string()).optional(),
      remove: z.array(z.string()).optional(),
    }).safeParse(request.body);
    if (!body.success) { reply.code(400); return logValidation(request, body.error); }

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

    recordActivity(app.db, request, {
      action: "user.role_change",
      targetType: "user",
      targetId: params.data.id,
      metadata: { added: body.data.add ?? [], removed: body.data.remove ?? [] },
    });

    return { ok: true };
  });

  app.patch("/admin/users/:id/service-account", async (request, reply) => {
    await app.requireAdmin(request);
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) { reply.code(400); return logValidation(request, params.error); }
    const body = z.object({ is_service_account: z.boolean() }).safeParse(request.body);
    if (!body.success) { reply.code(400); return logValidation(request, body.error); }

    await app.db.query(
      `UPDATE users SET is_service_account = $2 WHERE id = $1`,
      [params.data.id, body.data.is_service_account],
    );
    recordActivity(app.db, request, {
      action: "user.service_account_change",
      targetType: "user",
      targetId: params.data.id,
      metadata: { is_service_account: body.data.is_service_account },
    });
    return { ok: true };
  });

  app.patch("/admin/users/:id/notes", async (request, reply) => {
    await app.requireAdmin(request);
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) { reply.code(400); return logValidation(request, params.error); }
    const body = z.object({ notes: z.string().max(5000) }).safeParse(request.body);
    if (!body.success) { reply.code(400); return logValidation(request, body.error); }

    await updateUserNote(app.db, params.data.id, body.data.notes);
    return { ok: true };
  });

  // User detail — full engagement data
  app.get("/admin/users/:id", async (request, reply) => {
    await app.requireAdmin(request);
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) { reply.code(400); return logValidation(request, params.error); }

    const detail = await getUserDetail(app.db, params.data.id);
    if (!detail) {
      reply.code(404);
      return { error: "not_found" };
    }
    return detail;
  });

  // Suspend / unsuspend user
  app.patch("/admin/users/:id/suspend", async (request, reply) => {
    await app.requireAdmin(request);
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) { reply.code(400); return logValidation(request, params.error); }
    const body = z.object({ suspended: z.boolean() }).safeParse(request.body);
    if (!body.success) { reply.code(400); return logValidation(request, body.error); }

    const result = await suspendUser(app.db, params.data.id, body.data.suspended);
    if (!result) {
      reply.code(404);
      return { error: "not_found" };
    }

    recordActivity(app.db, request, {
      action: body.data.suspended ? "user.suspended" : "user.unsuspended",
      targetType: "user",
      targetId: params.data.id,
    });

    return { ok: true, suspendedAt: result.suspended_at };
  });

  app.get("/admin/users/:id/hosts", async (request, reply) => {
    await app.requireAdmin(request);
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) { reply.code(400); return logValidation(request, params.error); }
    return getUserLinkedHosts(app.db, params.data.id);
  });

  app.get("/admin/users/:id/events", async (request, reply) => {
    await app.requireAdmin(request);
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) { reply.code(400); return logValidation(request, params.error); }
    return getUserLinkedEvents(app.db, params.data.id);
  });

  app.post("/admin/users/:id/hosts", async (request, reply) => {
    await app.requireAdmin(request);
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) { reply.code(400); return logValidation(request, params.error); }
    const body = z.object({ organizerId: z.string().uuid() }).safeParse(request.body);
    if (!body.success) { reply.code(400); return logValidation(request, body.error); }

    const auth = request.auth!;
    const adminUserId = await resolveUserId(app.db, auth);
    await linkUserToHost(app.db, params.data.id, body.data.organizerId, adminUserId);
    reply.code(201);
    return { ok: true };
  });

  app.delete("/admin/users/:id/hosts/:hostId", async (request, reply) => {
    await app.requireAdmin(request);
    const params = z.object({ id: z.string().uuid(), hostId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) { reply.code(400); return logValidation(request, params.error); }
    await unlinkUserFromHost(app.db, params.data.id, params.data.hostId);
    reply.code(204);
  });

  app.post("/admin/users/:id/events", async (request, reply) => {
    await app.requireAdmin(request);
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) { reply.code(400); return logValidation(request, params.error); }
    const body = z.object({ eventId: z.string().uuid() }).safeParse(request.body);
    if (!body.success) { reply.code(400); return logValidation(request, body.error); }

    const auth = request.auth!;
    const adminUserId = await resolveUserId(app.db, auth);
    await linkUserToEvent(app.db, params.data.id, body.data.eventId, adminUserId);
    reply.code(201);
    return { ok: true };
  });

  app.delete("/admin/users/:id/events/:eventId", async (request, reply) => {
    await app.requireAdmin(request);
    const params = z.object({ id: z.string().uuid(), eventId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) { reply.code(400); return logValidation(request, params.error); }
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
    if (!params.success) { reply.code(400); return logValidation(request, params.error); }

    const result = await app.db.query(
      `update events set detached_from_import = false, detached_at = null, detached_by_user_id = null
       where id = $1 and detached_from_import = true
       returning id`,
      [params.data.id],
    );
    if (!result.rows[0]) { reply.code(404); return { error: "not_found_or_not_detached" }; }
    recordActivity(app.db, request, {
      action: "event.reattach",
      targetType: "event",
      targetId: params.data.id,
    });
    return { ok: true };
  });

  app.post("/admin/organizers/:id/reattach", async (request, reply) => {
    await app.requireAdmin(request);
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) { reply.code(400); return logValidation(request, params.error); }

    const result = await app.db.query(
      `update organizers set detached_from_import = false, detached_at = null, detached_by_user_id = null
       where id = $1 and detached_from_import = true
       returning id`,
      [params.data.id],
    );
    if (!result.rows[0]) { reply.code(404); return { error: "not_found_or_not_detached" }; }
    recordActivity(app.db, request, {
      action: "host.reattach",
      targetType: "host",
      targetId: params.data.id,
    });
    return { ok: true };
  });

  // --- Manage map endpoints ---
  app.get("/admin/events/map", async (request) => {
    await app.requireEditor(request);
    const auth = request.auth!;
    const userId = await resolveUserId(app.db, auth);
    const q = request.query as Record<string, string>;
    return fetchManagedEventMapPoints(app.db, userId, {
      q: q.q,
      status: q.status,
      practiceCategoryId: q.practiceCategoryId,
    });
  });

  app.get("/admin/organizers/map", async (request) => {
    await app.requireEditor(request);
    const auth = request.auth!;
    const userId = await resolveUserId(app.db, auth);
    const q = request.query as Record<string, string>;
    return fetchManagedOrganizerMapPoints(app.db, userId, {
      q: q.q,
      status: q.status,
      practiceCategoryId: q.practiceCategoryId,
    });
  });

  // --- Activity & Error Logs ---

  app.get("/admin/activity-logs/actors", async (request) => {
    await app.requireAdmin(request);
    return listActivityActors(app.db);
  });

  app.get("/admin/activity-logs", async (request) => {
    await app.requireAdmin(request);
    const q = z.object({
      q: z.string().optional(),
      action: z.string().optional(),
      targetType: z.string().optional(),
      actorId: z.string().uuid().optional(),
      excludeServiceAccounts: z.enum(["true", "false"]).optional().transform((v) => v === "true"),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
    }).parse(request.query);
    return listActivityLogs(app.db, q);
  });

  app.get("/admin/activity-logs/:id", async (request, reply) => {
    await app.requireAdmin(request);
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) { reply.code(400); return logValidation(request, params.error); }
    const log = await getActivityLogById(app.db, params.data.id);
    if (!log) { reply.code(404); return { error: "not_found" }; }
    return log;
  });

  app.get("/admin/error-logs", async (request) => {
    await app.requireAdmin(request);
    const q = z.object({
      q: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
    }).parse(request.query);
    return listErrorLogs(app.db, q);
  });

  app.get("/admin/error-logs/:id", async (request, reply) => {
    await app.requireAdmin(request);
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) { reply.code(400); return logValidation(request, params.error); }
    const log = await getErrorLogById(app.db, params.data.id);
    if (!log) { reply.code(404); return { error: "not_found" }; }
    return log;
  });

  // ── Admin Notifications ──────────────────────────────────────────────
  app.get("/admin/notifications/overview", async (request) => {
    await app.requireAdmin(request);
    const [totalRes, activeRes, pausedRes] = await Promise.all([
      app.db.query<{ count: string }>("select count(*)::text as count from user_alerts"),
      app.db.query<{ count: string }>("select count(*)::text as count from user_alerts where unsubscribed_at is null"),
      app.db.query<{ count: string }>("select count(*)::text as count from user_alerts where unsubscribed_at is not null"),
    ]);
    return {
      totalAlerts: Number(totalRes.rows[0]?.count ?? "0"),
      activeAlerts: Number(activeRes.rows[0]?.count ?? "0"),
      pausedAlerts: Number(pausedRes.rows[0]?.count ?? "0"),
    };
  });

  app.get("/admin/notifications/alerts", async (request) => {
    await app.requireAdmin(request);
    const query = request.query as { page?: string; pageSize?: string; status?: string; q?: string };
    const page = Math.max(Number(query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize) || 20, 1), 100);
    const offset = (page - 1) * pageSize;

    const whereParts: string[] = [];
    const values: unknown[] = [];

    if (query.status === "active") {
      whereParts.push("ua.unsubscribed_at is null");
    } else if (query.status === "paused") {
      whereParts.push("ua.unsubscribed_at is not null");
    }

    if (query.q) {
      values.push(`%${query.q}%`);
      const idx = values.length;
      whereParts.push(`(u.display_name ilike $${idx} or u.email ilike $${idx} or o.name ilike $${idx})`);
    }

    const whereClause = whereParts.length ? `where ${whereParts.join(" and ")}` : "";

    const [itemsResult, totalResult] = await Promise.all([
      app.db.query<{
        id: string;
        user_id: string;
        user_name: string | null;
        user_email: string | null;
        organizer_id: string;
        organizer_name: string;
        radius_km: number;
        location_label: string | null;
        unsubscribed_at: string | null;
        created_at: string;
      }>(
        `select ua.id, ua.user_id,
                u.display_name as user_name, u.email as user_email,
                ua.organizer_id, o.name as organizer_name,
                ua.radius_km, ua.location_label,
                ua.unsubscribed_at, ua.created_at
         from user_alerts ua
         join users u on u.id = ua.user_id
         join organizers o on o.id = ua.organizer_id
         ${whereClause}
         order by ua.created_at desc
         limit $${values.length + 1} offset $${values.length + 2}`,
        [...values, pageSize, offset],
      ),
      app.db.query<{ count: string }>(
        `select count(*)::text as count
         from user_alerts ua
         join users u on u.id = ua.user_id
         join organizers o on o.id = ua.organizer_id
         ${whereClause}`,
        values,
      ),
    ]);

    const total = Number(totalResult.rows[0]?.count ?? "0");
    return {
      items: itemsResult.rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        userName: r.user_name,
        userEmail: r.user_email,
        organizerId: r.organizer_id,
        organizerName: r.organizer_name,
        radiusKm: r.radius_km,
        locationLabel: r.location_label,
        unsubscribedAt: r.unsubscribed_at,
        createdAt: r.created_at,
      })),
      pagination: { page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1), totalItems: total },
    };
  });

  app.patch("/admin/notifications/alerts/:id", async (request, reply) => {
    await app.requireAdmin(request);
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) { reply.code(400); return logValidation(request, params.error); }

    const bodySchema = z.object({
      action: z.enum(["pause", "resume", "delete"]),
    });
    const body = bodySchema.safeParse(request.body);
    if (!body.success) { reply.code(400); return logValidation(request, body.error); }

    const { id } = params.data;
    const { action } = body.data;

    if (action === "delete") {
      const result = await app.db.query("delete from user_alerts where id = $1::uuid returning id", [id]);
      if ((result.rowCount ?? 0) === 0) { reply.code(404); return { error: "not_found" }; }
      recordActivity(app.db, request, { action: "alert.delete", targetType: "alert", targetId: id });
      return { deleted: true };
    }

    const paused = action === "pause";
    const result = await app.db.query<{ id: string }>(
      `update user_alerts set unsubscribed_at = $2 where id = $1::uuid returning id`,
      [id, paused ? new Date().toISOString() : null],
    );
    if ((result.rowCount ?? 0) === 0) { reply.code(404); return { error: "not_found" }; }
    recordActivity(app.db, request, { action: paused ? "alert.pause" : "alert.resume", targetType: "alert", targetId: id });
    return { ok: true, paused };
  });

  // ── Enhanced Moderation ──────────────────────────────────────────────
  app.get("/admin/moderation", async (request) => {
    await app.requireAdmin(request);
    const query = request.query as { type?: string; status?: string; search?: string; targetType?: string; reason?: string; dateFrom?: string; dateTo?: string; page?: string; pageSize?: string };
    const result = await listModerationItems(app.db, {
      type: query.type || undefined,
      status: query.status || undefined,
      search: query.search || undefined,
      targetType: query.targetType || undefined,
      reason: query.reason || undefined,
      dateFrom: query.dateFrom || undefined,
      dateTo: query.dateTo || undefined,
      page: Number(query.page) || 1,
      pageSize: Number(query.pageSize) || 20,
    });
    return result;
  });

  app.get("/admin/moderation/stats", async (request) => {
    await app.requireAdmin(request);
    return getModerationStats(app.db);
  });

  app.get("/admin/moderation/:id", async (request, reply) => {
    await app.requireAdmin(request);
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) { reply.code(400); return logValidation(request, params.error); }
    const detail = await getModerationDetail(app.db, params.data.id);
    if (!detail) { reply.code(404); return { error: "not_found" }; }
    return detail;
  });

  app.patch("/admin/moderation/:id", async (request, reply) => {
    await app.requireAdmin(request);
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) { reply.code(400); return logValidation(request, params.error); }

    const bodySchema = z.object({
      status: z.enum(["approved", "rejected", "dismissed"]),
      note: z.string().optional(),
    });
    const body = bodySchema.safeParse(request.body);
    if (!body.success) { reply.code(400); return logValidation(request, body.error); }

    const auth = request.auth;
    if (!auth?.sub) throw app.httpErrors.unauthorized();
    const userId = await resolveUserId(app.db, auth);

    const updated = await updateModerationStatus(app.db, params.data.id, body.data.status, userId, body.data.note);
    if (!updated) { reply.code(404); return { error: "not_found" }; }

    // Side-effect: update the underlying item status
    if (updated.item_type === "comment") {
      const commentStatus = body.data.status === "approved" ? "approved" : body.data.status === "rejected" ? "hidden" : "pending";
      await app.db.query("update comments set status = $2 where id = $1::uuid", [updated.item_id, commentStatus]);
    }

    recordActivity(app.db, request, {
      action: `moderation.${body.data.status}`,
      targetType: updated.item_type,
      targetId: updated.item_id,
    });

    return updated;
  });

  // ── Moderation Settings ──────────────────────────────────────────────
  app.get("/admin/settings/moderation", async (request) => {
    await app.requireAdmin(request);
    const settings = await getSetting(app.db, "moderation");
    return settings ?? { enabled: true, bannedWords: [], rateLimit: 5, aiThreshold: 0.85, emailNotifications: false };
  });

  app.patch("/admin/settings/moderation", async (request) => {
    await app.requireAdmin(request);
    const bodySchema = z.object({
      enabled: z.boolean().optional(),
      bannedWords: z.array(z.string()).optional(),
      rateLimit: z.number().int().min(1).optional(),
      aiThreshold: z.number().min(0).max(1).optional(),
      emailNotifications: z.boolean().optional(),
    });
    const body = bodySchema.safeParse(request.body);
    if (!body.success) return { error: "invalid_body" };

    const current = (await getSetting<Record<string, unknown>>(app.db, "moderation")) ?? {};
    const merged = { ...current, ...body.data };
    const updated = await updateSetting(app.db, "moderation", merged);

    recordActivity(app.db, request, { action: "settings.update", targetType: "settings", targetId: "moderation" });
    return updated;
  });

  // ── Admin Recommendations ────────────────────────────────────────────
  app.get("/admin/recommendations", async (request) => {
    await app.requireAdmin(request);
    const query = request.query as { page?: string; pageSize?: string; sender?: string; recipient?: string };
    return listRecommendations(app.db, {
      page: Number(query.page) || 1,
      pageSize: Number(query.pageSize) || 20,
      senderSearch: query.sender || undefined,
      recipientSearch: query.recipient || undefined,
    });
  });

  app.get("/admin/recommendations/stats", async (request) => {
    await app.requireAdmin(request);
    return getRecommendationStats(app.db);
  });

  // ── Event/Host Engagement Detail ────────────────────────────────────
  app.get("/admin/events/:id/engagement", async (request, reply) => {
    await app.requireAdmin(request);
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) { reply.code(400); return logValidation(request, params.error); }
    const eid = params.data.id;
    const [counts, rsvps, comments, reports] = await Promise.all([
      app.db.query<{ save_count: number; rsvp_count: number; comment_count: number; report_count: number }>(
        `select
          (select count(*)::int from saved_events where event_id = $1) as save_count,
          (select count(*)::int from event_rsvps where event_id = $1) as rsvp_count,
          (select count(*)::int from comments where event_id = $1) as comment_count,
          (select count(*)::int from reports where target_type = 'event' and target_id = $1::text) as report_count`,
        [eid],
      ),
      app.db.query<{ id: string; user_name: string; user_id: string; created_at: string }>(
        `select r.id, u.display_name as user_name, u.id as user_id, r.created_at
         from event_rsvps r join users u on u.id = r.user_id
         where r.event_id = $1 order by r.created_at desc limit 50`,
        [eid],
      ),
      app.db.query<{ id: string; user_name: string; body: string; status: string; created_at: string }>(
        `select c.id, u.display_name as user_name, c.body, c.status, c.created_at
         from comments c join users u on u.id = c.user_id
         where c.event_id = $1 order by c.created_at desc limit 50`,
        [eid],
      ),
      app.db.query<{ id: string; reporter_name: string; reason: string; detail: string | null; status: string; created_at: string }>(
        `select r.id, u.display_name as reporter_name, r.reason, r.detail,
           coalesce(mq.status, 'pending') as status, r.created_at
         from reports r
         join users u on u.id = r.reporter_user_id
         left join moderation_queue mq on mq.item_type = 'report' and mq.item_id = r.id::text
         where r.target_type = 'event' and r.target_id = $1::text
         order by r.created_at desc limit 50`,
        [eid],
      ),
    ]);
    return {
      counts: counts.rows[0] ?? { save_count: 0, rsvp_count: 0, comment_count: 0, report_count: 0 },
      rsvps: rsvps.rows,
      comments: comments.rows,
      reports: reports.rows,
    };
  });

  app.get("/admin/organizers/:id/engagement", async (request, reply) => {
    await app.requireAdmin(request);
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) { reply.code(400); return logValidation(request, params.error); }
    const oid = params.data.id;
    const [counts, followers, reports] = await Promise.all([
      app.db.query<{ follower_count: number; comment_count: number; report_count: number }>(
        `select
          (select count(*)::int from user_alerts where organizer_id = $1 and unsubscribed_at is null) as follower_count,
          (select count(*)::int from comments c
           join events e on e.id = c.event_id
           join event_organizers eo on eo.event_id = e.id
           where eo.organizer_id = $1) as comment_count,
          (select count(*)::int from reports where target_type = 'organizer' and target_id = $1::text) as report_count`,
        [oid],
      ),
      app.db.query<{ id: string; user_name: string; user_id: string; created_at: string }>(
        `select ua.id, u.display_name as user_name, u.id as user_id, ua.created_at
         from user_alerts ua join users u on u.id = ua.user_id
         where ua.organizer_id = $1 and ua.unsubscribed_at is null
         order by ua.created_at desc limit 50`,
        [oid],
      ),
      app.db.query<{ id: string; reporter_name: string; reason: string; detail: string | null; status: string; created_at: string }>(
        `select r.id, u.display_name as reporter_name, r.reason, r.detail,
           coalesce(mq.status, 'pending') as status, r.created_at
         from reports r
         join users u on u.id = r.reporter_user_id
         left join moderation_queue mq on mq.item_type = 'report' and mq.item_id = r.id::text
         where r.target_type = 'organizer' and r.target_id = $1::text
         order by r.created_at desc limit 50`,
        [oid],
      ),
    ]);
    return {
      counts: counts.rows[0] ?? { follower_count: 0, comment_count: 0, report_count: 0 },
      followers: followers.rows,
      reports: reports.rows,
    };
  });

};

export default adminRoutes;
