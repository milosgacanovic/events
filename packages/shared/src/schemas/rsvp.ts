import { z } from "zod";

import { uuidSchema } from "./common";

export const rsvpRequestSchema = z.object({
  eventId: uuidSchema,
  occurrenceId: uuidSchema.optional(),
});

export type RsvpRequest = z.infer<typeof rsvpRequestSchema>;
