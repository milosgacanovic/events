import { z } from "zod";

export const savedSearchFrequencySchema = z.enum(["daily", "weekly"]);

// Multi-value fields can arrive as either a CSV string (the URL param shape
// the search UI uses, e.g. "5rhythms,ecstatic-dance") or an array of strings
// (the older saved shape). Accept both — the snapshot is only used to recreate
// the search query string and to render a human-readable description.
const stringOrStringArray = z.union([z.string(), z.array(z.string())]);

export const savedSearchFilterSnapshotSchema = z.object({
  practiceCategoryId: stringOrStringArray.optional(),
  practiceSubcategoryIds: stringOrStringArray.optional(),
  practice: stringOrStringArray.optional(),
  format: stringOrStringArray.optional(),
  eventFormatId: stringOrStringArray.optional(),
  tags: stringOrStringArray.optional(),
  languages: stringOrStringArray.optional(),
  countryCode: stringOrStringArray.optional(),
  city: stringOrStringArray.optional(),
  attendanceMode: stringOrStringArray.optional(),
  eventDate: stringOrStringArray.optional(),
  dateRange: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  radiusKm: z.number().optional(),
  nearMe: z.union([z.string(), z.number()]).optional(),
  query: z.string().optional(),
  q: z.string().optional(),
}).passthrough();

export const createSavedSearchSchema = z.object({
  label: z.string().max(200).optional(),
  filterSnapshot: savedSearchFilterSnapshotSchema,
  frequency: savedSearchFrequencySchema.default("weekly"),
});

export const updateSavedSearchSchema = z.object({
  label: z.string().max(200).optional(),
  frequency: savedSearchFrequencySchema.optional(),
  paused: z.boolean().optional(),
});

export type CreateSavedSearch = z.infer<typeof createSavedSearchSchema>;
export type UpdateSavedSearch = z.infer<typeof updateSavedSearchSchema>;
export type SavedSearchFilterSnapshot = z.infer<typeof savedSearchFilterSnapshotSchema>;
