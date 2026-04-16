import { z } from "zod";

import { uuidSchema } from "./common";

export const savedEventScopeSchema = z.enum(["all", "single"]);

export const saveEventRequestSchema = z.object({
  eventId: uuidSchema,
  occurrenceId: uuidSchema.optional(),
  scope: savedEventScopeSchema.default("all"),
});

export type SaveEventRequest = z.infer<typeof saveEventRequestSchema>;
