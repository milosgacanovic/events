import { z } from "zod";
import { organizerStatusSchema } from "./common";

export const createOrganizerSchema = z.object({
  name: z.string().min(1).max(200),
  descriptionJson: z.record(z.any()).default({}),
  websiteUrl: z.string().url().nullable().optional(),
  tags: z.array(z.string().min(1)).default([]),
  languages: z.array(z.string().min(2).max(16)).default([]),
  avatarPath: z.string().nullable().optional(),
  status: organizerStatusSchema.default("published"),
});

export const updateOrganizerSchema = createOrganizerSchema.partial();

export type CreateOrganizerInput = z.infer<typeof createOrganizerSchema>;
export type UpdateOrganizerInput = z.infer<typeof updateOrganizerSchema>;
