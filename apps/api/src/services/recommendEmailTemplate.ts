import { config } from "../config";

export type RecommendEmailInput = {
  senderName: string;
  eventTitle: string;
  eventSlug: string;
  note: string | null;
};

export function buildRecommendEmailHtml(input: RecommendEmailInput): string {
  const eventUrl = `${config.PUBLIC_BASE_URL}/events/${input.eventSlug}`;
  const escapedNote = input.note
    ? input.note.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    : null;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 20px;">
    <strong>DanceResource Events</strong>
  </div>

  <p>${input.senderName} thinks you'd enjoy this event:</p>

  <div style="padding: 16px; border: 1px solid #ddd; border-radius: 8px; margin: 16px 0;">
    <h2 style="margin: 0 0 8px; font-size: 1.1rem;">
      <a href="${eventUrl}" style="color: #0d6efd; text-decoration: none;">${input.eventTitle}</a>
    </h2>
    ${escapedNote ? `<p style="margin: 8px 0 0; color: #555; font-style: italic;">"${escapedNote}"</p>` : ""}
  </div>

  <p><a href="${eventUrl}" style="color: #0d6efd;">View event details</a></p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
  <p style="font-size: 0.82rem; color: #999;">
    This email was sent by a DanceResource user. We won't email you again unless you sign up.
  </p>
</body>
</html>`;
}
