import fs from "node:fs/promises";

import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { Pool } from "pg";

import { config } from "./config";
import adminRoutes from "./routes/admin";
import adminContentRoutes from "./routes/adminContent";
import eventRoutes from "./routes/events";
import geocodeRoutes from "./routes/geocode";
import healthRoute from "./routes/health";
import mapRoutes from "./routes/map";
import metaRoutes from "./routes/meta";
import metricsRoute from "./routes/metrics";
import organizerRoutes from "./routes/organizers";
import uploadRoutes from "./routes/uploads";
import { getEventsExternalRefSchemaStatus } from "./db/startupChecks";
import { AuthService } from "./services/authService";
import { MeilisearchService } from "./services/meiliService";
import { loggerConfig } from "./utils/logger";

async function buildServer() {
  const app = Fastify({
    logger: loggerConfig,
    requestIdHeader: "x-request-id",
    requestIdLogLabel: "requestId",
  });

  const pool = new Pool({ connectionString: config.DATABASE_URL });
  const meiliService = new MeilisearchService(config.MEILI_URL, config.MEILI_MASTER_KEY);
  const authService = new AuthService({
    issuer: config.KEYCLOAK_ISSUER,
    jwksUrl: config.KEYCLOAK_JWKS_URL,
    audience: config.KEYCLOAK_AUDIENCE,
    clientId: config.KEYCLOAK_CLIENT_ID,
  });

  app.decorate("db", pool);
  app.decorate("meiliService", meiliService);

  const externalRefSchemaStatus = await getEventsExternalRefSchemaStatus(pool);
  app.log.info(
    {
      nodeEnv: config.NODE_ENV,
      ...externalRefSchemaStatus,
    },
    "startup_external_ref_schema_status",
  );
  const schemaMissing = Object.values(externalRefSchemaStatus).some((value) => !value);
  if (schemaMissing) {
    const message = "startup_schema_check_failed: external ref schema objects are missing. " +
      "Run migrations with `npm run migrate -w @dr-events/api` and ensure migration `003_event_external_ref.sql` is applied.";
    if (config.NODE_ENV === "production") {
      throw new Error(message);
    }
    app.log.warn({ ...externalRefSchemaStatus }, message);
  }

  app.decorate("authenticate", async (request) => {
    request.auth = await authService.authenticate(request.headers.authorization);
  });

  app.decorate("requireEditor", async (request) => {
    await app.authenticate(request);
    if (!request.auth?.isEditor) {
      throw app.httpErrors.forbidden("editor role required");
    }
  });

  app.decorate("requireAdmin", async (request) => {
    await app.authenticate(request);
    if (!request.auth?.isAdmin) {
      throw app.httpErrors.forbidden("admin role required");
    }
  });

  await fs.mkdir(config.UPLOADS_DIR, { recursive: true });

  await app.register(sensible);
  await app.register(cors, {
    origin: true,
    credentials: true,
  });
  await app.register(rateLimit, {
    global: false,
  });
  await app.register(multipart, {
    limits: {
      fileSize: config.MAX_UPLOAD_MB * 1024 * 1024,
      files: 1,
    },
  });

  await app.register(fastifyStatic, {
    root: config.UPLOADS_DIR,
    prefix: "/uploads/",
    decorateReply: false,
  });

  await meiliService.ensureIndex().catch((error) => {
    app.log.warn({ error }, "Meilisearch index setup failed; API will use fallback search path");
  });

  app.setErrorHandler((error, request, reply) => {
    const err = error instanceof Error ? error : new Error("internal_error");

    if (err.message === "missing_bearer") {
      reply.code(401).send({ error: "missing_bearer_token" });
      return;
    }
    if (err.message === "auth_not_configured") {
      reply.code(500).send({ error: "auth_not_configured" });
      return;
    }
    if (err.message === "invalid_token" || err.message === "invalid_subject" || err.message === "invalid_audience") {
      reply.code(401).send({ error: err.message });
      return;
    }

    request.log.error({ err }, "Request failed");
    const code = (error as { statusCode?: number }).statusCode ?? 500;
    reply.code(code).send({ error: err.message || "internal_error" });
  });

  await app.register(async (api) => {
    await api.register(healthRoute);
    await api.register(metricsRoute);
    await api.register(metaRoutes);
    await api.register(adminContentRoutes);
    await api.register(eventRoutes);
    await api.register(organizerRoutes);
    await api.register(mapRoutes);
    await api.register(geocodeRoutes);
    await api.register(adminRoutes);
    await api.register(uploadRoutes);
  }, { prefix: "/api" });

  app.addHook("onClose", async () => {
    await pool.end();
  });

  return app;
}

async function start() {
  const app = await buildServer();
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
}

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
