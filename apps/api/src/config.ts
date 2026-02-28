import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z
    .string()
    .default("postgresql://dr_events:dr_events_password@localhost:15432/dr_events"),
  MEILI_URL: z.string().default("http://localhost:17700"),
  MEILI_MASTER_KEY: z.string().optional(),
  UPLOADS_DIR: z.string().default("/app/uploads"),
  PUBLIC_BASE_URL: z.string().default("https://beta.events.danceresource.org"),
  KEYCLOAK_ISSUER: z.string().optional(),
  KEYCLOAK_JWKS_URL: z.string().optional(),
  KEYCLOAK_AUDIENCE: z.string().optional(),
  KEYCLOAK_CLIENT_ID: z.string().optional(),
  MAX_UPLOAD_MB: z.coerce.number().default(5),
  RATE_LIMIT_ENABLED: z.coerce.boolean().default(true),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
});

export const config = configSchema.parse(process.env);
