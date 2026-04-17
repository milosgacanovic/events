import { createOrganizerSchema, updateOrganizerSchema } from "@dr-events/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import {
  createOrganizer,
  deleteOrganizer,
  getOrganizerById,
  getOrganizerBySlug,
  markOrganizerDetached,
  searchOrganizers,
  updateOrganizer,
} from "../db/organizerRepo";
import { resolveUserId, requireOrganizerAccess } from "../middleware/ownership";
import { canUserEditOrganizer } from "../db/manageRepo";
import { isServiceAccount } from "../db/userRepo";
import { clearSearchCache, debouncedClearSearchCache, getSearchCache, setSearchCache } from "../services/searchCache";
import { syncSeriesForEvent } from "../services/eventLifecycleService";
import { recordActivity } from "../services/activityLogger";
import { logValidation } from "../utils/validationError";

const querySchema = z.object({
  q: z.string().optional(),
  practice: z.string().optional(),
  practiceCategoryId: z.string().optional(),
  tags: z.string().optional(),
  languages: z.string().optional(),
  roleKey: z.string().optional(),
  countryCode: z.string().optional(),
  city: z.string().optional(),
  showArchived: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20),
});

function csvToList(value?: string): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const languageTagPattern = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i;

function parseUuidCsv(value?: string): string[] | null {
  const items = csvToList(value);
  for (const item of items) {
    if (!uuidPattern.test(item)) {
      return null;
    }
  }
  return items;
}

function sanitizeLanguageCodes(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0)
    .filter((value) => !uuidPattern.test(value))
    .filter((value) => languageTagPattern.test(value));
}

function mapOrganizerSearchItem(item: Record<string, unknown>) {
  const roleKeys = Array.isArray(item.role_keys)
    ? item.role_keys.filter((value): value is string => typeof value === "string")
    : [];
  const imageUrl =
    (typeof item.image_url === "string" ? item.image_url : null)
    ?? (typeof item.avatar_path === "string" ? item.avatar_path : null);

  const effectiveLanguages = sanitizeLanguageCodes(item.languages);

  return {
    ...item,
    imageUrl,
    websiteUrl: typeof item.website_url === "string" ? item.website_url : null,
    externalUrl: typeof item.external_url === "string" ? item.external_url : null,
    city: typeof item.city === "string" ? item.city : null,
    countryCode: typeof item.country_code === "string" ? item.country_code : null,
    languages: effectiveLanguages,
    tags: Array.isArray(item.tags) ? item.tags : [],
    practiceCategoryIds: Array.isArray(item.practice_category_ids)
      ? item.practice_category_ids.filter((value): value is string => typeof value === "string")
      : [],
    roleKeys,
    roleKey: roleKeys[0] ?? null,
  };
}

function mapOrganizerDetail(result: Record<string, unknown>) {
  const organizer = (result.organizer ?? {}) as Record<string, unknown>;
  const roleKeys = Array.isArray(organizer.role_keys)
    ? organizer.role_keys.filter((value): value is string => typeof value === "string")
    : [];
  const imageUrl =
    (typeof organizer.image_url === "string" ? organizer.image_url : null)
    ?? (typeof organizer.avatar_path === "string" ? organizer.avatar_path : null);

  const effectiveLanguages = sanitizeLanguageCodes(organizer.languages);

  const upcomingOccurrences = Array.isArray(result.upcomingOccurrences)
    ? result.upcomingOccurrences.map((item) => {
      const row = item as Record<string, unknown>;
      return {
        ...row,
        coverImageUrl: typeof row.cover_image_url === "string" ? row.cover_image_url : null,
      };
    })
    : [];
  const pastOccurrences = Array.isArray(result.pastOccurrences)
    ? result.pastOccurrences.map((item) => {
      const row = item as Record<string, unknown>;
      return {
        ...row,
        coverImageUrl: typeof row.cover_image_url === "string" ? row.cover_image_url : null,
      };
    })
    : [];

  return {
    ...result,
    upcomingOccurrences,
    pastOccurrences,
    organizer: {
      ...organizer,
      imageUrl,
      descriptionHtml: typeof organizer.description_html === "string" ? organizer.description_html : null,
      descriptionJson: organizer.description_json ?? {},
      websiteUrl: typeof organizer.website_url === "string" ? organizer.website_url : null,
      externalUrl: typeof organizer.external_url === "string" ? organizer.external_url : null,
      city: typeof organizer.city === "string" ? organizer.city : null,
      countryCode: typeof organizer.country_code === "string" ? organizer.country_code : null,
      languages: effectiveLanguages,
      tags: Array.isArray(organizer.tags) ? organizer.tags : [],
      roleKeys,
      roleKey: roleKeys[0] ?? null,
    },
    practiceCategoryIds: Array.isArray(result.practiceCategoryIds)
      ? result.practiceCategoryIds.filter((value): value is string => typeof value === "string")
      : [],
  };
}

const organizerRoutes: FastifyPluginAsync = async (app) => {
  app.get("/organizers/search", async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return logValidation(request, parsed.error);
    }

    if (request.headers.authorization) {
      try {
        await app.authenticate(request);
      } catch {
        // Ignore auth failures — showArchived simply won't be respected.
      }
    }
    const isEditor = Boolean(request.auth?.isEditor);
    const showArchived = isEditor && parsed.data.showArchived === "true";

    const practiceCategoryIds = parseUuidCsv(parsed.data.practiceCategoryId);
    if (!practiceCategoryIds) {
      reply.code(400);
      return { error: "invalid_uuid_list" };
    }
    const practiceKeys = csvToList(parsed.data.practice);
    const practiceRows = practiceKeys.length
      ? await app.db.query<{ id: string }>(
        `
          select id
          from practices
          where key = any($1::text[])
            and is_active = true
        `,
        [practiceKeys],
      )
      : { rows: [] as Array<{ id: string }> };

    const searchInput = {
      q: parsed.data.q,
      practiceCategoryIds: Array.from(new Set([...(practiceCategoryIds ?? []), ...practiceRows.rows.map((row) => row.id)])),
      tags: csvToList(parsed.data.tags),
      languages: csvToList(parsed.data.languages),
      roleKeys: csvToList(parsed.data.roleKey),
      countryCodes: csvToList(parsed.data.countryCode),
      city: parsed.data.city,
      showArchived,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
    };

    const cached = getSearchCache<Record<string, unknown>>("organizers_search", searchInput);
    if (cached) {
      request.log.info({ msg: "search_cache_hit", scope: "organizers_search" });
      return cached;
    }
    request.log.info({ msg: "search_cache_miss", scope: "organizers_search" });

    const response = await searchOrganizers(app.db, searchInput);

    const payload = {
      ...response,
      items: response.items.map((item) => mapOrganizerSearchItem(item as unknown as Record<string, unknown>)),
    };
    setSearchCache("organizers_search", searchInput, payload);
    return payload;
  });

  app.get("/organizers/:slug", async (request, reply) => {
    const parsed = z.object({ slug: z.string().min(1) }).safeParse(request.params);
    if (!parsed.success) {
      reply.code(400);
      return logValidation(request, parsed.error);
    }

    if (request.headers.authorization) {
      try {
        await app.authenticate(request);
      } catch {
        // Ignore optional auth failures to keep public detail accessible.
      }
    }

    const result = await getOrganizerBySlug(app.db, parsed.data.slug, {
      includeNonPublic: Boolean(request.auth?.isEditor),
    });
    if (!result) {
      reply.code(404);
      return { error: "not_found" };
    }

    // Compute canEdit for authenticated users
    let canEdit = false;
    if (request.auth) {
      if (request.auth.isAdmin) {
        canEdit = true;
      } else if (request.auth.isEditor) {
        const userId = await resolveUserId(app.db, request.auth);
        canEdit = await canUserEditOrganizer(app.db, userId, (result as { organizer: { id: string } }).organizer.id);
      }
    }

    return { ...mapOrganizerDetail(result as unknown as Record<string, unknown>), canEdit };
  });

  app.post("/organizers", async (request, reply) => {
    await app.requireEditor(request);

    const parsed = createOrganizerSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return logValidation(request, parsed.error);
    }

    const auth = request.auth!;
    const userId = await resolveUserId(app.db, auth);

    const organizer = await createOrganizer(app.db, parsed.data);

    // Set creator and create host_users link
    await app.db.query(
      `update organizers set created_by_user_id = $2 where id = $1`,
      [organizer.id, userId],
    );
    await app.db.query(
      `insert into host_users (user_id, organizer_id, created_by) values ($1, $2, $1) on conflict do nothing`,
      [userId, organizer.id],
    );

    debouncedClearSearchCache();
    recordActivity(app.db, request, {
      action: "host.create",
      targetType: "host",
      targetId: organizer.id,
      targetLabel: organizer.name,
      snapshot: organizer as unknown as Record<string, unknown>,
    });
    reply.code(201);
    return organizer;
  });

  app.patch("/organizers/:id", async (request, reply) => {
    await app.requireEditor(request);

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      reply.code(400);
      return logValidation(request, params.error);
    }

    const auth = request.auth!;
    if (!auth.isAdmin) {
      const userId = await resolveUserId(app.db, auth);
      await requireOrganizerAccess(app.db, userId, params.data.id, false);
    }

    const parsed = updateOrganizerSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return logValidation(request, parsed.error);
    }

    // Warn when unpublishing/archiving hosts linked to published events (allow with force flag)
    if ((parsed.data.status === "draft" || parsed.data.status === "archived") && !(request.body as Record<string, unknown>)?.force) {
      const currentOrg = await app.db.query<{ status: string }>(
        `SELECT status FROM organizers WHERE id = $1`,
        [params.data.id],
      );
      if (currentOrg.rows[0] && currentOrg.rows[0].status === "published") {
        const activeEvents = await app.db.query(
          `SELECT 1 FROM events e
           JOIN event_organizers eo ON eo.event_id = e.id
           WHERE eo.organizer_id = $1 AND e.status = 'published'
           LIMIT 1`,
          [params.data.id],
        );
        if (activeEvents.rowCount && activeEvents.rowCount > 0) {
          reply.code(409);
          return { error: "host_has_active_events" };
        }
      }
    }

    // Pre-fetch for detach-on-edit decision (mirrors events.ts flow).
    const previousOrganizer = await getOrganizerById(app.db, params.data.id);

    const organizer = await updateOrganizer(app.db, params.data.id, parsed.data);
    if (!organizer) {
      reply.code(404);
      return { error: "not_found" };
    }

    // Detachment logic: if imported + not yet detached + content fields actually changed → detach
    // so the importer's /admin/organizers/upsert-external skips this row on subsequent syncs.
    // Skip detachment for service accounts (the importer itself).
    const serviceAccount = await isServiceAccount(app.db, auth.sub);
    if (
      !serviceAccount
      && previousOrganizer
      && previousOrganizer.external_source !== null
      && !previousOrganizer.detached_from_import
    ) {
      const prev = previousOrganizer as Record<string, unknown>;
      const input = parsed.data as Record<string, unknown>;
      const norm = (v: unknown) =>
        v === null || v === undefined || v === "" ? null : typeof v === "object" ? JSON.stringify(v) : String(v);
      const differs = (prevKey: string, inputKey: string) => {
        if (!(inputKey in input) || input[inputKey] === undefined) return false;
        return norm(input[inputKey]) !== norm(prev[prevKey]);
      };
      const contentChanged =
        differs("name", "name")
        || differs("description_json", "descriptionJson")
        || differs("description_html", "descriptionHtml")
        || differs("website_url", "websiteUrl")
        || differs("external_url", "externalUrl")
        || differs("tags", "tags")
        || differs("languages", "languages")
        || differs("city", "city")
        || differs("country_code", "countryCode")
        || differs("image_url", "imageUrl")
        || differs("avatar_path", "avatarPath")
        || input.profileRoleIds !== undefined
        || input.practiceCategoryIds !== undefined
        || input.locations !== undefined
        || input.primaryLocation !== undefined
        || input.primaryLocationId !== undefined;

      if (contentChanged) {
        const detachUserId = await resolveUserId(app.db, auth);
        await markOrganizerDetached(app.db, params.data.id, detachUserId);
      }
    }

    // Reindex affected events in Meilisearch when organizer status changes
    if (parsed.data.status) {
      const linkedEvents = await app.db.query<{ event_id: string }>(
        `SELECT event_id FROM event_organizers WHERE organizer_id = $1`,
        [params.data.id],
      );
      if (linkedEvents.rows.length > 0) {
        await Promise.all(
          linkedEvents.rows.map((row) =>
            app.meiliService.upsertOccurrencesForEvent(app.db, row.event_id).catch(() => {}),
          ),
        );
      }
    }

    // Organizer display fields (name, slug) are denormalized into the series
    // doc's `organizers` array. When they change, every series carrying this
    // organizer needs a refresh — otherwise listing cards render stale names.
    const displayChanged =
      (parsed.data.name !== undefined && parsed.data.name !== previousOrganizer?.name) ||
      (parsed.data.slug !== undefined && parsed.data.slug !== previousOrganizer?.slug) ||
      parsed.data.status !== undefined;
    if (displayChanged) {
      const linkedEventIds = await app.db.query<{ event_id: string }>(
        `SELECT DISTINCT event_id FROM event_organizers WHERE organizer_id = $1`,
        [params.data.id],
      );
      for (const row of linkedEventIds.rows) {
        await syncSeriesForEvent(app.db, app.meiliService, row.event_id, "organizer.update").catch(() => {});
      }
    }

    debouncedClearSearchCache();

    recordActivity(app.db, request, {
      action: "host.edit",
      targetType: "host",
      targetId: organizer.id,
      targetLabel: organizer.name,
      metadata: parsed.data as unknown as Record<string, unknown>,
    });

    return organizer;
  });

  app.delete("/organizers/:id", async (request, reply) => {
    await app.requireEditor(request);

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      reply.code(400);
      return logValidation(request, params.error);
    }

    const auth = request.auth!;
    if (!auth.isAdmin) {
      const userId = await resolveUserId(app.db, auth);
      await requireOrganizerAccess(app.db, userId, params.data.id, false);
    }

    // Only allow deletion of draft or archived hosts
    const org = await app.db.query<{ status: string; name: string }>(
      `SELECT status, name FROM organizers WHERE id = $1`,
      [params.data.id],
    );
    if (!org.rowCount) {
      reply.code(404);
      return { error: "not_found" };
    }
    if (org.rows[0].status !== "draft" && org.rows[0].status !== "archived") {
      reply.code(400);
      return { error: "delete_only_draft_or_archived" };
    }

    // Prevent deletion if host is linked to published events
    const activeEvents = await app.db.query(
      `SELECT 1 FROM events e
       JOIN event_organizers eo ON eo.event_id = e.id
       WHERE eo.organizer_id = $1 AND e.status = 'published'
       LIMIT 1`,
      [params.data.id],
    );
    if (activeEvents.rowCount && activeEvents.rowCount > 0) {
      reply.code(400);
      return { error: "host_has_active_events" };
    }

    const { found, affectedEventIds } = await deleteOrganizer(app.db, params.data.id);
    if (!found) {
      reply.code(404);
      return { error: "not_found" };
    }

    if (affectedEventIds.length > 0) {
      await Promise.all(
        affectedEventIds.map((eventId) =>
          app.meiliService.upsertOccurrencesForEvent(app.db, eventId).catch(() => {}),
        ),
      );
    }
    clearSearchCache();

    recordActivity(app.db, request, {
      action: "host.delete",
      targetType: "host",
      targetId: params.data.id,
      targetLabel: org.rows[0].name,
      metadata: { affectedEventIds },
    });

    return reply.code(204).send();
  });
};

export default organizerRoutes;
