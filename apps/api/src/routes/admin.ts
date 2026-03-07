import type { FastifyPluginAsync } from "fastify";
import { DateTime } from "luxon";
import { z } from "zod";

import { runAlertsDry } from "../db/alertRepo";
import { OCCURRENCES_INDEX } from "../services/meiliService";
import {
  createEventFormat,
  createOrganizerRole,
  createPractice,
  listEventFormats,
  updateEventFormat,
  updateOrganizerRole,
  updatePractice,
} from "../db/taxonomyRepo";
import { getUiLabels, updateUiLabels } from "../db/uiLabelRepo";

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

const adminRoutes: FastifyPluginAsync = async (app) => {
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
};

export default adminRoutes;
