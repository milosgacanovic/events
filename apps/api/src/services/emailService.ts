import nodemailer from "nodemailer";
import type { FastifyBaseLogger } from "fastify";

import { config } from "../config";

const transporter = nodemailer.createTransport({
  host: config.SMTP_HOST,
  port: config.SMTP_PORT,
  secure: false,
  tls: { rejectUnauthorized: false },
});

export async function sendEmail(
  to: string,
  subject: string,
  body: string,
  logger: FastifyBaseLogger,
  plainText = false,
): Promise<void> {
  try {
    await transporter.sendMail({
      from: config.SMTP_FROM,
      to,
      subject,
      ...(plainText ? { text: body } : { html: body }),
    });
    logger.info({ to, subject }, "email sent");
  } catch (err) {
    logger.warn({ err, to, subject }, "email send failed");
  }
}
