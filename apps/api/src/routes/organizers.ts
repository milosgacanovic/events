import { createOrganizerSchema, updateOrganizerSchema } from "@dr-events/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import {
  createOrganizer,
  getOrganizerBySlug,
  searchOrganizers,
  updateOrganizer,
} from "../db/organizerRepo";

const querySchema = z.object({
  q: z.string().optional(),
  practice: z.string().optional(),
  practiceCategoryId: z.string().optional(),
  tags: z.string().optional(),
  languages: z.string().optional(),
  roleKey: z.string().optional(),
  countryCode: z.string().optional(),
  city: z.string().optional(),
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

function parseUuidCsv(value?: string): string[] | null {
  const items = csvToList(value);
  for (const item of items) {
    if (!uuidPattern.test(item)) {
      return null;
    }
  }
  return items;
}

function mapOrganizerSearchItem(item: Record<string, unknown>) {
  const roleKeys = Array.isArray(item.role_keys)
    ? item.role_keys.filter((value): value is string => typeof value === "string")
    : [];
  const imageUrl =
    (typeof item.image_url === "string" ? item.image_url : null)
    ?? (typeof item.avatar_path === "string" ? item.avatar_path : null);

  const organizerLanguages = Array.isArray(item.languages) ? item.languages.filter((value): value is string => typeof value === "string") : [];
  const derivedLanguages = Array.isArray(item.derived_languages)
    ? item.derived_languages.filter((value): value is string => typeof value === "string")
    : [];
  const effectiveLanguages = organizerLanguages.length > 0 ? organizerLanguages : derivedLanguages;

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
  const imageUrl =
    (typeof organizer.image_url === "string" ? organizer.image_url : null)
    ?? (typeof organizer.avatar_path === "string" ? organizer.avatar_path : null);

  const organizerLanguages = Array.isArray(organizer.languages)
    ? organizer.languages.filter((value): value is string => typeof value === "string")
    : [];
  const derivedLanguages = Array.isArray(result.derivedLanguages)
    ? result.derivedLanguages.filter((value): value is string => typeof value === "string")
    : [];
  const effectiveLanguages = organizerLanguages.length > 0 ? organizerLanguages : derivedLanguages;

  return {
    ...result,
    organizer: {
      ...organizer,
      imageUrl,
      descriptionJson: organizer.description_json ?? {},
      websiteUrl: typeof organizer.website_url === "string" ? organizer.website_url : null,
      externalUrl: typeof organizer.external_url === "string" ? organizer.external_url : null,
      city: typeof organizer.city === "string" ? organizer.city : null,
      countryCode: typeof organizer.country_code === "string" ? organizer.country_code : null,
      languages: effectiveLanguages,
      tags: Array.isArray(organizer.tags) ? organizer.tags : [],
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

    const response = await searchOrganizers(app.db, {
      q: parsed.data.q,
      practiceCategoryIds: Array.from(new Set([...(practiceCategoryIds ?? []), ...practiceRows.rows.map((row) => row.id)])),
      tags: csvToList(parsed.data.tags),
      languages: csvToList(parsed.data.languages),
      roleKeys: csvToList(parsed.data.roleKey),
      countryCodes: csvToList(parsed.data.countryCode),
      city: parsed.data.city,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
    });

    return {
      ...response,
      items: response.items.map((item) => mapOrganizerSearchItem(item as unknown as Record<string, unknown>)),
    };
  });

  app.get("/organizers/:slug", async (request, reply) => {
    const parsed = z.object({ slug: z.string().min(1) }).safeParse(request.params);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }

    const result = await getOrganizerBySlug(app.db, parsed.data.slug);
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

    return organizer;
  });
};

export default organizerRoutes;
