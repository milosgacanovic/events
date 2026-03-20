import type { FastifyBaseLogger } from "fastify";

/**
 * No-op email service stub.
 * Logs instead of sending. Prepares call sites for future SMTP/SES integration.
 */
export async function sendEmail(
  to: string,
  subject: string,
  body: string,
  logger: FastifyBaseLogger,
): Promise<void> {
  logger.info({ to, subject }, "email_stub: would send email (not implemented)");
}
