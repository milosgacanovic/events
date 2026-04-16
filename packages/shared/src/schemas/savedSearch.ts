import { z } from "zod";

import { uuidSchema } from "./common";

export const savedSearchFrequencySchema = z.enum(["daily", "weekly"]);

export const savedSearchFilterSnapshotSchema = z.object({
  practiceCategoryId: z.string().optional(),
  practiceSubcategoryIds: z.array(z.string()).optional(),
  format: z.string().optional(),
  tags: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  countryCode: z.string().optional(),
  city: z.string().optional(),
  attendanceMode: z.string().optional(),
  dateRange: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  radiusKm: z.number().optional(),
  query: z.string().optional(),
}).passthrough();

export const createSavedSearchSchema = z.object({
  label: z.string().max(200).optional(),
  filterSnapshot: savedSearchFilterSnapshotSchema,
  frequency: savedSearchFrequencySchema.default("weekly"),
  notifyNew: z.boolean().default(true),
  notifyReminders: z.boolean().default(true),
  notifyUpdates: z.boolean().default(true),
});

export const updateSavedSearchSchema = z.object({
  label: z.string().max(200).optional(),
  frequency: savedSearchFrequencySchema.optional(),
  notifyNew: z.boolean().optional(),
  notifyReminders: z.boolean().optional(),
  notifyUpdates: z.boolean().optional(),
  paused: z.boolean().optional(),
});

export type CreateSavedSearch = z.infer<typeof createSavedSearchSchema>;
export type UpdateSavedSearch = z.infer<typeof updateSavedSearchSchema>;
export type SavedSearchFilterSnapshot = z.infer<typeof savedSearchFilterSnapshotSchema>;
