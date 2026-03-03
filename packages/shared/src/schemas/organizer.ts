import { z } from "zod";
import { organizerStatusSchema } from "./common";

const organizerSchemaBase = z.object({
  name: z.string().min(1).max(200),
  descriptionJson: z.record(z.any()).default({}),
  websiteUrl: z.string().url().nullable().optional(),
  externalUrl: z.string().url().nullable().optional(),
  tags: z.array(z.string().min(1)).default([]),
  languages: z.array(z.string().min(2).max(16)).default([]),
  avatarPath: z.string().nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  city: z.string().min(1).max(120).nullable().optional(),
  countryCode: z.string().min(2).max(8).nullable().optional(),
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
  });
}

export const createOrganizerSchema = withExternalPairValidation(organizerSchemaBase);

export const updateOrganizerSchema = withExternalPairValidation(organizerSchemaBase.partial());

export type CreateOrganizerInput = z.infer<typeof createOrganizerSchema>;
export type UpdateOrganizerInput = z.infer<typeof updateOrganizerSchema>;
