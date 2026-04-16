import fs from "node:fs/promises";

import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
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
import profileRoutes from "./routes/profile";
import alertRoutes from "./routes/alerts";
import applicationRoutes from "./routes/applications";
import manageRoutes from "./routes/manage";
import uploadRoutes from "./routes/uploads";
import { logError } from "./db/activityLogRepo";
import { getEventsExternalRefSchemaStatus } from "./db/startupChecks";
import { sanitizeBody } from "./services/activityLogger";
import { checkRateLimit, resolveAdminRateLimit, resolvePublicRateLimit } from "./middleware/rateLimit";
import { AuthService } from "./services/authService";
import { KeycloakAdminService } from "./services/keycloakAdminService";
import { MeilisearchService } from "./services/meiliService";
import { findOrCreateUserBySub } from "./db/userRepo";
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

  const keycloakAdminService =
    config.KEYCLOAK_ADMIN_URL && config.KEYCLOAK_ADMIN_CLIENT_ID &&
    config.KEYCLOAK_ADMIN_CLIENT_SECRET && config.KEYCLOAK_REALM
      ? new KeycloakAdminService({
          adminUrl: config.KEYCLOAK_ADMIN_URL,
          clientId: config.KEYCLOAK_ADMIN_CLIENT_ID,
          clientSecret: config.KEYCLOAK_ADMIN_CLIENT_SECRET,
          realm: config.KEYCLOAK_REALM,
          rolesClientId: config.KEYCLOAK_ROLES_CLIENT_ID ?? config.KEYCLOAK_CLIENT_ID,
        })
      : null;

  app.decorate("db", pool);
  app.decorate("meiliService", meiliService);
  app.decorate("keycloakAdmin", keycloakAdminService);

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
    // Fire-and-forget: upsert display_name + email from JWT claims on every auth
    if (request.auth.sub) {
      findOrCreateUserBySub(pool, request.auth.sub, request.auth.preferredUsername, request.auth.email, request.auth.roles)
        .catch(() => {});
    }
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

  // CORS allow-list: only first-party origins may issue credentialed requests.
  // Requests with no Origin header (same-origin, curl, server-to-server) pass.
  const corsAllowList = [
    config.PUBLIC_BASE_URL,
    "http://localhost:13000",
    "http://localhost:13100",
  ].filter((origin): origin is string => Boolean(origin));

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) {
        cb(null, true);
        return;
      }
      cb(null, corsAllowList.includes(origin));
    },
    credentials: true,
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
    // Force inline rendering + strict content-type handling so a crafted
    // upload can't be served as executable HTML/JS by the browser.
    setHeaders: (res) => {
      res.setHeader("Content-Disposition", "inline");
      res.setHeader("X-Content-Type-Options", "nosniff");
    },
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

    if (code >= 500) {
      logError(pool, {
        errorMessage: err.message,
        stackTrace: err.stack ?? null,
        requestMethod: request.method,
        requestUrl: request.url,
        requestBody: sanitizeBody(request.body),
        actorId: null,
        actorName: (request as { auth?: { preferredUsername?: string } }).auth?.preferredUsername ?? null,
        statusCode: code,
        ipAddress: request.ip ?? null,
        userAgent: request.headers["user-agent"] ?? null,
      }).catch(() => {});
    }

    reply.code(code).send({ error: err.message || "internal_error" });
  });

  app.addHook("onRequest", async (request, reply) => {
    if (!config.RATE_LIMIT_ENABLED) {
      return;
    }

    const path = request.url.split("?")[0] ?? request.url;
    const adminLimit = resolveAdminRateLimit(path);
    const publicLimit = resolvePublicRateLimit(path, config.RATE_LIMIT_MAX);
    const scope = adminLimit ? "admin" : publicLimit ? "public" : null;
    const limit = adminLimit ?? publicLimit;
    if (!scope || !limit) {
      return;
    }

    const clientIp = request.ip || request.headers["x-forwarded-for"] || "unknown";
    const result = checkRateLimit({
      key: `${scope}:${clientIp}:${path}`,
      now: Date.now(),
      windowMs: config.RATE_LIMIT_WINDOW_MS,
      maxRequests: limit,
    });
    if (!result.allowed) {
      reply.header("Retry-After", String(result.retryAfterSeconds));
      reply.code(429).send({ error: "rate_limit_exceeded" });
    }
  });

  // API responses are JSON (or occasional static/HTML from /uploads + /alerts).
  // A conservative CSP here serves as defense-in-depth if something ever renders
  // an API response inline; the web (Next.js) layer ships a richer CSP.
  const apiContentSecurityPolicy = [
    "default-src 'none'",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
  ].join("; ");

  app.addHook("onSend", async (_request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    reply.header("Content-Security-Policy", apiContentSecurityPolicy);
    reply.header(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(self), interest-cohort=()",
    );
  });

  await app.register(async (api) => {
    await api.register(healthRoute);
    await api.register(metricsRoute);
    await api.register(metaRoutes);
    await api.register(adminContentRoutes);
    await api.register(eventRoutes);
    await api.register(organizerRoutes);
    await api.register(profileRoutes);
    await api.register(alertRoutes);
    await api.register(mapRoutes);
    await api.register(geocodeRoutes);
    await api.register(adminRoutes);
    await api.register(applicationRoutes);
    await api.register(manageRoutes);
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
