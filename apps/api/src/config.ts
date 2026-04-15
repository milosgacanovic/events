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
  PUBLIC_BASE_URL: z.string().default("https://events.danceresource.org"),
  KEYCLOAK_ISSUER: z.string().optional(),
  KEYCLOAK_JWKS_URL: z.string().optional(),
  KEYCLOAK_AUDIENCE: z.string().optional(),
  KEYCLOAK_CLIENT_ID: z.string().optional(),
  KEYCLOAK_ADMIN_URL: z.string().optional(),
  KEYCLOAK_ADMIN_CLIENT_ID: z.string().optional(),
  KEYCLOAK_ADMIN_CLIENT_SECRET: z.string().optional(),
  KEYCLOAK_REALM: z.string().optional(),
  KEYCLOAK_ROLES_CLIENT_ID: z.string().optional(),
  MAX_UPLOAD_MB: z.coerce.number().default(5),
  SMTP_HOST: z.string().default("brevo-relay"),
  SMTP_PORT: z.coerce.number().default(2525),
  SMTP_FROM: z.string().default("noreply@danceresource.org"),
  SMTP_ADMIN_TO: z.string().default("hello@danceresource.org"),
  RATE_LIMIT_ENABLED: z.coerce.boolean().default(true),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
  // Feature flag for the Follow/Notify worker. Default false so the worker no-ops
  // in environments that haven't been verified yet — flip to true after confirming
  // dry-run output looks correct.
  ENABLE_ALERT_NOTIFICATIONS: z.coerce.boolean().default(false),
  // Feature flag for series grouping in search/map results. Default false so
  // the schema + API changes (series_id column, seriesId input) can ship
  // unconditionally while the importer rolls out stable seriesId emission.
  // Flip to true after verifying imported siblings share expected series_id.
  EVENTS_SERIES_GROUPING_ENABLED: z.coerce.boolean().default(false),
});

export const config = configSchema.parse(process.env);
