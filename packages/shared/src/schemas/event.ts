import { z } from "zod";
import {
  attendanceModeSchema,
  eventStatusSchema,
  scheduleKindSchema,
  uuidSchema,
} from "./common";

const coverImageUrlSchema = z
  .string()
  .max(2048)
  .url()
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }, "coverImageUrl must use http or https");

const createEventBaseSchema = z.object({
    title: z.string().min(1).max(250),
    descriptionJson: z.record(z.any()).default({}),
    coverImagePath: z.string().max(500).nullable().optional(),
    coverImageUrl: coverImageUrlSchema.nullable().optional(),
    externalUrl: z.string().url().nullable().optional(),
    attendanceMode: attendanceModeSchema,
    onlineUrl: z.string().url().nullable().optional(),
    practiceCategoryId: uuidSchema,
    practiceSubcategoryId: uuidSchema.nullable().optional(),
    eventFormatId: uuidSchema.nullable().optional(),
    tags: z.array(z.string().min(1)).default([]),
    languages: z.array(z.string().min(2).max(16)).default([]),
    scheduleKind: scheduleKindSchema,
    eventTimezone: z.string().min(1),
    singleStartAt: z.string().datetime().nullable().optional(),
    singleEndAt: z.string().datetime().nullable().optional(),
    rrule: z.string().nullable().optional(),
    rruleDtstartLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?/, "Invalid datetime").nullable().optional(),
    durationMinutes: z.number().int().positive().nullable().optional(),
    visibility: z.enum(["public", "unlisted"]).default("public"),
    locationId: uuidSchema.nullable().optional(),
    organizerRoles: z
      .array(
        z.object({
          organizerId: uuidSchema,
          roleId: uuidSchema,
          displayOrder: z.number().int().default(0),
        }),
      )
      .default([]),
    externalSource: z.string().max(255).nullable().optional(),
    externalId: z.string().max(255).nullable().optional(),
    isImported: z.boolean().optional(),
    importSource: z.string().max(255).nullable().optional(),
  });

function hasDefinedExternalPair(value: { externalSource?: string | null; externalId?: string | null }) {
  return value.externalSource !== undefined || value.externalId !== undefined;
}

function isExternalPairValid(value: { externalSource?: string | null; externalId?: string | null }) {
  if (!hasDefinedExternalPair(value)) {
    return true;
  }

  if (value.externalSource === null || value.externalId === null) {
    return value.externalSource === null && value.externalId === null;
  }

  return Boolean(value.externalSource && value.externalId);
}

function isCoverImageAliasValid(value: { coverImagePath?: string | null; coverImageUrl?: string | null }) {
  if (
    value.coverImagePath !== undefined &&
    value.coverImagePath !== null &&
    value.coverImageUrl !== undefined &&
    value.coverImageUrl !== null
  ) {
    return value.coverImagePath === value.coverImageUrl;
  }

  return true;
}

export const createEventSchema = createEventBaseSchema
  .refine(
    (value) => {
      if (value.scheduleKind === "single") {
        return Boolean(value.singleStartAt && value.singleEndAt);
      }

      return Boolean(value.rrule && value.rruleDtstartLocal && value.durationMinutes);
    },
    {
      message:
        "single schedules require singleStartAt/singleEndAt, recurring schedules require rrule/rruleDtstartLocal/durationMinutes",
      path: ["scheduleKind"],
    },
  )
  .refine(
    (value) => {
      if (value.scheduleKind === "single" && value.singleStartAt && value.singleEndAt) {
        return new Date(value.singleEndAt) >= new Date(value.singleStartAt);
      }
      return true;
    },
    {
      message: "End date must not be before start date",
      path: ["singleEndAt"],
    },
  )
  .refine(
    (value) => isExternalPairValid(value),
    {
      message: "externalSource and externalId must be provided together",
      path: ["externalSource"],
    },
  )
  .refine(
    (value) => isCoverImageAliasValid(value),
    {
      message: "coverImagePath and coverImageUrl must match when both are provided",
      path: ["coverImageUrl"],
    },
  );

export const updateEventSchema = createEventBaseSchema
  .partial()
  .extend({
    status: eventStatusSchema.optional(),
  })
  .refine(
    (value) => isExternalPairValid(value),
    {
      message: "externalSource and externalId must be provided together",
      path: ["externalSource"],
    },
  )
  .refine(
    (value) => isCoverImageAliasValid(value),
    {
      message: "coverImagePath and coverImageUrl must match when both are provided",
      path: ["coverImageUrl"],
    },
  );

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
