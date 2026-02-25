import fs from "node:fs/promises";
import path from "node:path";

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { config } from "../config";

const bodySchema = z.object({
  kind: z.enum(["eventCover", "organizerAvatar"]),
  entityId: z.string().uuid(),
});

const mimeToExt = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function sniffMime(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

const uploadRoutes: FastifyPluginAsync = async (app) => {
  app.post("/uploads", async (request, reply) => {
    await app.requireEditor(request);

    const filePart = await request.file();
    if (!filePart) {
      reply.code(400);
      return { error: "missing_file" };
    }

    const kindRaw =
      filePart.fields.kind && typeof filePart.fields.kind === "object" && "value" in filePart.fields.kind
        ? String(filePart.fields.kind.value)
        : undefined;
    const entityIdRaw =
      filePart.fields.entityId &&
      typeof filePart.fields.entityId === "object" &&
      "value" in filePart.fields.entityId
        ? String(filePart.fields.entityId.value)
        : undefined;

    const body = bodySchema.safeParse({
      kind: kindRaw,
      entityId: entityIdRaw,
    });
    if (!body.success) {
      reply.code(400);
      return { error: body.error.flatten() };
    }

    const maxBytes = config.MAX_UPLOAD_MB * 1024 * 1024;
    const buffer = await filePart.toBuffer();
    if (buffer.length > maxBytes) {
      reply.code(400);
      return { error: `file exceeds ${config.MAX_UPLOAD_MB}MB` };
    }

    const mime = sniffMime(buffer);
    const ext = mime ? mimeToExt.get(mime) : undefined;

    if (!mime || !ext) {
      reply.code(400);
      return { error: "unsupported_mime" };
    }

    const baseDir =
      body.data.kind === "eventCover"
        ? path.join(config.UPLOADS_DIR, "events", body.data.entityId)
        : path.join(config.UPLOADS_DIR, "organizers", body.data.entityId);

    await fs.mkdir(baseDir, { recursive: true });

    const filename = body.data.kind === "eventCover" ? `cover.${ext}` : `avatar.${ext}`;
    const absolutePath = path.join(baseDir, filename);
    await fs.writeFile(absolutePath, buffer);

    const storedPath = body.data.kind === "eventCover"
      ? `/uploads/events/${body.data.entityId}/${filename}`
      : `/uploads/organizers/${body.data.entityId}/${filename}`;

    reply.header("Cache-Control", "public, max-age=86400");
    return {
      url: `${config.PUBLIC_BASE_URL}${storedPath}`,
      stored_path: storedPath,
    };
  });
};

export default uploadRoutes;
