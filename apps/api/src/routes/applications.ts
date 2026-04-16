import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { ROLE_EDITOR } from "@dr-events/shared";

import {
  createApplication,
  getApplicationById,
  listApplications,
  updateApplicationStatus,
} from "../db/applicationRepo";
import { resolveUserId } from "../middleware/ownership";
import { sendEmail } from "../services/emailService";
import { config } from "../config";
import { logValidation } from "../utils/validationError";

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().email().max(320),
  intent: z.string().trim().min(1).max(100),
  intentOther: z.string().max(500).optional(),
  description: z.string().max(5000).optional(),
  practiceCategoryIds: z.array(z.string().uuid()).optional(),
  proofUrl: z.string().url().max(2000).optional(),
  claimHostId: z.string().uuid().optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(["approved", "rejected", "more_info_requested"]),
  adminNotes: z.string().max(5000).optional(),
  rejectionReason: z.string().max(2000).optional(),
});

const applicationRoutes: FastifyPluginAsync = async (app) => {
  // Intentionally open to any authenticated user (not editor/admin): the whole
  // point of POST /admin/applications is to let a logged-in visitor *request*
  // editor/admin privileges. Gating this on ROLE_EDITOR would break the signup
  // flow. Admin-side list/approve/reject handlers below are role-gated.
  app.post("/admin/applications", async (request, reply) => {
    await app.authenticate(request);

    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return logValidation(request, parsed.error);
    }

    const auth = request.auth!;
    const userId = await resolveUserId(app.db, auth);

    const application = await createApplication(app.db, {
      userId,
      ...parsed.data,
    });

    // Email wrapper with logo
    const emailWrap = (body: string) => `
<div style="max-width:560px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#333;">
  <div style="text-align:center;padding:24px 0 16px;">
    <img src="${config.PUBLIC_BASE_URL}/logo.jpg" alt="DanceResource" style="height:48px;" />
  </div>
  <div style="background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:24px;">
    ${body}
  </div>
  <div style="text-align:center;padding:16px 0;font-size:12px;color:#999;">
    DanceResource Events · <a href="${config.PUBLIC_BASE_URL}" style="color:#0f8a4a;">events.danceresource.org</a>
  </div>
</div>`;

    // Send confirmation to applicant
    void sendEmail(
      parsed.data.email,
      "We received your application — DanceResource Events",
      emailWrap(`
        <h2 style="margin:0 0 16px;font-size:18px;">Thanks for applying, ${parsed.data.name}!</h2>
        <p style="margin:0 0 12px;line-height:1.5;">We've received your application to publish events on DanceResource. Our team will review it and get back to you soon.</p>
        <p style="margin:0;line-height:1.5;color:#666;">— The DanceResource Team</p>
      `),
      request.log,
    );

    // Notify admin with form data — lightweight HTML
    const intentLabels: Record<string, string> = {
      organize_events: "I organize dance events",
      teach_classes: "I facilitate dance classes",
      manage_venue: "I manage a dance venue",
      community: "I run a dance community",
      other: parsed.data.intentOther ?? "Other",
    };

    // Resolve host name + slug
    let hostRow$ = "";
    if (parsed.data.claimHostId) {
      const hostRow = await app.db.query<{ name: string; slug: string }>(
        `select name, slug from organizers where id = $1`,
        [parsed.data.claimHostId],
      ).catch(() => ({ rows: [] }));
      const host = hostRow.rows[0];
      if (host) {
        hostRow$ = `<tr><td style="padding:4px 12px 4px 0;font-weight:600;">Claimed Host</td><td style="padding:4px 0;"><a href="${config.PUBLIC_BASE_URL}/hosts/${host.slug}">${host.name}</a></td></tr>`;
      }
    }

    // Resolve practice names
    let practicesRow$ = "";
    if (parsed.data.practiceCategoryIds?.length) {
      const practiceRows = await app.db.query<{ label: string }>(
        `select label from practices where id = any($1) order by label`,
        [parsed.data.practiceCategoryIds],
      ).catch(() => ({ rows: [] }));
      const names = practiceRows.rows.map((r) => r.label);
      if (names.length) {
        practicesRow$ = `<tr><td style="padding:4px 12px 4px 0;font-weight:600;">Practices</td><td style="padding:4px 0;">${names.join(", ")}</td></tr>`;
      }
    }

    const adminHtml = `<h2 style="margin:0 0 12px;font-size:16px;">New Editor Application</h2>
<table style="border-collapse:collapse;font-size:14px;line-height:1.5;">
<tr><td style="padding:4px 12px 4px 0;font-weight:600;">Name</td><td style="padding:4px 0;">${parsed.data.name}</td></tr>
<tr><td style="padding:4px 12px 4px 0;font-weight:600;">Email</td><td style="padding:4px 0;"><a href="mailto:${parsed.data.email}">${parsed.data.email}</a></td></tr>
<tr><td style="padding:4px 12px 4px 0;font-weight:600;">Intent</td><td style="padding:4px 0;">${intentLabels[parsed.data.intent] ?? parsed.data.intent}</td></tr>
<tr><td style="padding:4px 12px 4px 0;font-weight:600;">Description</td><td style="padding:4px 0;">${parsed.data.description || "<em>not provided</em>"}</td></tr>
${parsed.data.proofUrl ? `<tr><td style="padding:4px 12px 4px 0;font-weight:600;">Website</td><td style="padding:4px 0;"><a href="${parsed.data.proofUrl}">${parsed.data.proofUrl}</a></td></tr>` : ""}
${hostRow$}
${practicesRow$}
</table>
<p style="margin:16px 0 0;"><a href="${config.PUBLIC_BASE_URL}/manage/admin/applications" style="display:inline-block;padding:8px 16px;background:#0f8a4a;color:#fff;text-decoration:none;border-radius:4px;font-weight:600;">Review Application</a></p>`;

    void sendEmail(
      config.SMTP_ADMIN_TO,
      `New editor application from ${parsed.data.name}`,
      adminHtml,
      request.log,
    );

    reply.code(201);
    return application;
  });

  // Admin: list applications
  app.get("/admin/applications", async (request, reply) => {
    await app.requireAdmin(request);

    const parsed = z.object({
      status: z.enum(["pending", "approved", "rejected", "more_info_requested"]).optional(),
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().positive().max(100).default(20),
    }).safeParse(request.query);

    if (!parsed.success) {
      reply.code(400);
      return logValidation(request, parsed.error);
    }

    return listApplications(app.db, parsed.data);
  });

  // Admin: update application status
  app.patch("/admin/applications/:id", async (request, reply) => {
    await app.requireAdmin(request);

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      reply.code(400);
      return logValidation(request, params.error);
    }

    const parsed = updateStatusSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return logValidation(request, parsed.error);
    }

    const auth = request.auth!;
    const adminUserId = await resolveUserId(app.db, auth);

    const updated = await updateApplicationStatus(app.db, params.data.id, {
      ...parsed.data,
      reviewedBy: adminUserId,
    });

    if (!updated) {
      reply.code(404);
      return { error: "not_found" };
    }

    // Send email notification to applicant
    {
      const applicantEmail = updated.email;
      const applicantName = updated.name;
      if (applicantEmail) {
        const emailWrap = (body: string) => `
<div style="max-width:560px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#333;">
  <div style="text-align:center;padding:24px 0 16px;">
    <img src="${config.PUBLIC_BASE_URL}/logo.jpg" alt="DanceResource" style="height:48px;" />
  </div>
  <div style="background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:24px;">
    ${body}
  </div>
  <div style="text-align:center;padding:16px 0;font-size:12px;color:#999;">
    DanceResource Events &middot; <a href="${config.PUBLIC_BASE_URL}" style="color:#0f8a4a;">events.danceresource.org</a>
  </div>
</div>`;

        const name = applicantName || "there";
        const subjectMap: Record<string, string> = {
          approved: "Your DanceResource Application Has Been Approved",
          rejected: "Update on Your DanceResource Application",
          more_info_requested: "Additional Information Needed - DanceResource Application",
        };
        const message = parsed.data.status === "rejected"
          ? (parsed.data.rejectionReason || "")
          : (parsed.data.adminNotes || "");

        const subject = subjectMap[parsed.data.status];
        if (subject) {
          const htmlBody = emailWrap(`
    <h2 style="margin:0 0 16px;font-size:18px;">${subject}</h2>
    <p style="margin:0 0 12px;line-height:1.5;">Hi ${name},</p>
    <div style="white-space:pre-line;margin:0 0 12px;line-height:1.5;">${message}</div>
    <p style="margin-top:20px;color:#888;font-size:12px;">&mdash; DanceResource Team</p>
          `);
          void sendEmail(applicantEmail, subject, htmlBody, request.log);
        }
      }
    }

    // Side-effects on approval: grant Keycloak editor role + claim host
    if (parsed.data.status === "approved") {
      try {
        // Look up user's keycloak_sub
        const userRow = await app.db.query<{ keycloak_sub: string }>(
          `select keycloak_sub from users where id = $1`,
          [updated.user_id],
        );
        const sub = userRow.rows[0]?.keycloak_sub;

        if (sub && app.keycloakAdmin) {
          await app.keycloakAdmin.grantRole(sub, ROLE_EDITOR).catch((err) => {
            request.log.warn({ err, userId: updated.user_id }, "Failed to grant Keycloak editor role");
          });
        }

        // If user claimed a host, link them
        if (updated.claim_host_id) {
          await app.db.query(
            `insert into host_users (user_id, organizer_id, created_by) values ($1, $2, $3) on conflict do nothing`,
            [updated.user_id, updated.claim_host_id, adminUserId],
          );
        }
      } catch (err) {
        request.log.warn({ err }, "Application approval side-effects failed");
      }
    }

    return updated;
  });

  // ── Tag Suggestions ──────────────────────────────────────────────

  const tagSuggestSchema = z.object({
    tag: z.string().trim().min(1).max(60),
    reason: z.string().trim().max(500).optional(),
  });

  const tagSuggestStatusSchema = z.object({
    status: z.enum(["approved", "dismissed"]),
    adminNotes: z.string().max(2000).optional(),
  });

  // Any authenticated user can suggest a tag
  app.post("/admin/tag-suggestions", async (request, reply) => {
    await app.authenticate(request);

    const parsed = tagSuggestSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return logValidation(request, parsed.error);
    }

    const auth = request.auth!;
    const userId = await resolveUserId(app.db, auth);

    const { createTagSuggestion } = await import("../db/tagSuggestionRepo.js");
    const suggestion = await createTagSuggestion(app.db, {
      tag: parsed.data.tag,
      reason: parsed.data.reason,
      userId,
    });

    reply.code(201);
    return suggestion;
  });

  // Admin: list tag suggestions
  app.get("/admin/tag-suggestions", async (request, reply) => {
    await app.requireAdmin(request);

    const parsed = z.object({
      status: z.enum(["pending", "approved", "dismissed"]).optional(),
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().positive().max(100).default(20),
    }).safeParse(request.query);

    if (!parsed.success) {
      reply.code(400);
      return logValidation(request, parsed.error);
    }

    const { listTagSuggestions } = await import("../db/tagSuggestionRepo.js");
    return listTagSuggestions(app.db, parsed.data);
  });

  // Admin: approve or dismiss a tag suggestion
  app.patch("/admin/tag-suggestions/:id", async (request, reply) => {
    await app.requireAdmin(request);

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      reply.code(400);
      return logValidation(request, params.error);
    }

    const parsed = tagSuggestStatusSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return logValidation(request, parsed.error);
    }

    const { updateTagSuggestionStatus } = await import("../db/tagSuggestionRepo.js");
    const updated = await updateTagSuggestionStatus(app.db, {
      id: params.data.id,
      ...parsed.data,
    });

    if (!updated) {
      reply.code(404);
      return { error: "not_found" };
    }

    return updated;
  });
};

export default applicationRoutes;
