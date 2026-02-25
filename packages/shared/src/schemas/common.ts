import { z } from "zod";

export const uuidSchema = z.string().uuid();

export const attendanceModeSchema = z.enum(["in_person", "online", "hybrid"]);

export const scheduleKindSchema = z.enum(["single", "recurring"]);

export const eventStatusSchema = z.enum(["draft", "published", "cancelled", "archived"]);

export const organizerStatusSchema = z.enum(["published", "draft", "archived"]);
