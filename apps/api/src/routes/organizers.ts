import { createOrganizerSchema, updateOrganizerSchema } from "@dr-events/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import {
  createOrganizer,
  getOrganizerBySlug,
  searchOrganizers,
  updateOrganizer,
} from "../db/organizerRepo";
import { clearSearchCache, debouncedClearSearchCache, getSearchCache, setSearchCache } from "../services/searchCache";

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

  const organizerLanguages = sanitizeLanguageCodes(organizer.languages);
  const derivedLanguages = sanitizeLanguageCodes(result.derivedLanguages);
  const effectiveLanguages = organizerLanguages.length > 0 ? organizerLanguages : derivedLanguages;

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
      return { error: parsed.error.flatten() };
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
      return { error: parsed.error.flatten() };
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

    const derivedLanguages = result.upcomingOccurrences.length > 0
      ? await app.db.query<{ language: string }>(
        `
          select distinct lower(ev.language) as language
          from event_organizers rel
          join events e on e.id = rel.event_id
          left join lateral unnest(e.languages) as ev(language) on true
          where rel.organizer_id = $1
            and e.status = 'published'
            and ev.language is not null
        `,
        [result.organizer.id],
      ).then((queryResult) => queryResult.rows.map((row) => row.language))
      : [];

    return mapOrganizerDetail({
      ...(result as unknown as Record<string, unknown>),
      derivedLanguages,
    });
  });

  app.post("/organizers", async (request, reply) => {
    await app.requireEditor(request);

    const parsed = createOrganizerSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }

    const organizer = await createOrganizer(app.db, parsed.data);
    debouncedClearSearchCache();
    reply.code(201);
    return organizer;
  });

  app.patch("/organizers/:id", async (request, reply) => {
    await app.requireEditor(request);

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      reply.code(400);
      return { error: params.error.flatten() };
    }

    const parsed = updateOrganizerSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }

    const organizer = await updateOrganizer(app.db, params.data.id, parsed.data);
    if (!organizer) {
      reply.code(404);
      return { error: "not_found" };
    }

    debouncedClearSearchCache();

    return organizer;
  });
};

export default organizerRoutes;
