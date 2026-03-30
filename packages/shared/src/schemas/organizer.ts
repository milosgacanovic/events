import { z } from "zod";
import { organizerStatusSchema } from "./common";

const organizerSchemaBase = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(200).optional(),
  descriptionJson: z.record(z.any()).default({}),
  descriptionHtml: z.string().max(100000).nullable().optional(),
  websiteUrl: z.string().url().nullable().optional(),
  externalUrl: z.string().url().nullable().optional(),
  tags: z.array(z.string().min(1)).default([]),
  languages: z.array(z.string().min(2).max(16)).default([]),
  avatarPath: z.string().nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  city: z.string().min(1).max(120).nullable().optional(),
  countryCode: z.string().min(2).max(8).nullable().optional(),
  profileRoleIds: z.array(z.string().uuid()).optional(),
  practiceCategoryIds: z.array(z.string().uuid()).optional(),
  primaryLocation: z.object({
    label: z.string().max(255).nullable().optional(),
    formattedAddress: z.string().max(500).nullable().optional(),
    city: z.string().max(120).nullable().optional(),
    countryCode: z.string().min(2).max(8).nullable().optional(),
    lat: z.number().min(-90).max(90).nullable().optional(),
    lng: z.number().min(-180).max(180).nullable().optional(),
  }).nullable().optional(),
  locations: z.array(z.object({
    id: z.string().uuid().optional(),
    externalSource: z.string().max(255).nullable().optional(),
    externalId: z.string().max(255).nullable().optional(),
    isPrimary: z.boolean().optional(),
    label: z.string().max(255).nullable().optional(),
    formattedAddress: z.string().max(500).nullable().optional(),
    city: z.string().max(120).nullable().optional(),
    countryCode: z.string().min(2).max(8).nullable().optional(),
    lat: z.number().min(-90).max(90).nullable().optional(),
    lng: z.number().min(-180).max(180).nullable().optional(),
    provider: z.string().max(64).nullable().optional(),
    placeId: z.string().max(255).nullable().optional(),
  })).optional(),
  primaryLocationId: z.string().uuid().nullable().optional(),
  status: organizerStatusSchema.default("published"),
  externalSource: z.string().max(255).nullable().optional(),
  externalId: z.string().max(255).nullable().optional(),
});

function withExternalPairValidation<T extends z.ZodTypeAny>(schema: T) {
  return schema.refine((value) => {
    const item = value as { externalSource?: string | null; externalId?: string | null };
    const hasEither = item.externalSource !== undefined || item.externalId !== undefined;
    if (!hasEither) {
      return true;
    }

    if (item.externalSource === null || item.externalId === null) {
      return item.externalSource === null && item.externalId === null;
    }

    return Boolean(item.externalSource && item.externalId);
  }, {
    message: "externalSource and externalId must be provided together",
    path: ["externalSource"],
  }).refine((value) => {
    const item = value as {
      primaryLocation?: { lat?: number | null; lng?: number | null } | null;
    };
    if (item.primaryLocation === undefined || item.primaryLocation === null) {
      return true;
    }
    const hasLat = item.primaryLocation.lat !== undefined && item.primaryLocation.lat !== null;
    const hasLng = item.primaryLocation.lng !== undefined && item.primaryLocation.lng !== null;
    return (hasLat && hasLng) || (!hasLat && !hasLng);
  }, {
    message: "primaryLocation.lat and primaryLocation.lng must be provided together",
    path: ["primaryLocation"],
  }).refine((value) => {
    const item = value as {
      locations?: Array<{ lat?: number | null; lng?: number | null }>;
    };
    if (!Array.isArray(item.locations)) {
      return true;
    }
    return item.locations.every((location) => {
      const hasLat = location.lat !== undefined && location.lat !== null;
      const hasLng = location.lng !== undefined && location.lng !== null;
      return (hasLat && hasLng) || (!hasLat && !hasLng);
    });
  }, {
    message: "locations[].lat and locations[].lng must be provided together",
    path: ["locations"],
  }).refine((value) => {
    const item = value as {
      locations?: Array<{ id?: string; isPrimary?: boolean }>;
      primaryLocationId?: string | null;
    };
    if (!item.locations || item.locations.length === 0) {
      return item.primaryLocationId === undefined || item.primaryLocationId === null;
    }
    const primaryCount = item.locations.filter((location) => location.isPrimary).length;
    if (primaryCount > 1) {
      return false;
    }
    if (item.primaryLocationId === undefined || item.primaryLocationId === null) {
      return true;
    }
    return item.locations.some((location) => location.id === item.primaryLocationId);
  }, {
    message: "primaryLocationId must match an item in locations[] and only one primary is allowed",
    path: ["primaryLocationId"],
  });
}

export const createOrganizerSchema = withExternalPairValidation(organizerSchemaBase);

export const updateOrganizerSchema = withExternalPairValidation(organizerSchemaBase.partial());

export type CreateOrganizerInput = z.infer<typeof createOrganizerSchema>;
export type UpdateOrganizerInput = z.infer<typeof updateOrganizerSchema>;
