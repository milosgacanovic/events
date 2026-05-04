import { DateTime } from "luxon";

import { config } from "../config";

export type SavedSearchDigestEvent = {
  eventId: string;
  eventSlug: string;
  eventTitle: string;
  // pg driver returns timestamptz as Date, but allow ISO strings for tests.
  startsAtUtc: string | Date;
  eventTimezone: string | null;
  city: string | null;
  countryCode: string | null;
};

export type SavedSearchDigestInput = {
  userDisplayName: string | null;
  searchLabel: string | null;
  filterSummary: string;
  filterUrl: string;
  unsubscribeToken: string;
  events: SavedSearchDigestEvent[];
  /** Total matches in this run, including events past the digest cap. When
   * `totalMatches > events.length`, the email shows a "see N more" link. */
  totalMatches: number;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatEventDate(ev: SavedSearchDigestEvent): string {
  const zone = ev.eventTimezone ?? "utc";
  const dt =
    ev.startsAtUtc instanceof Date
      ? DateTime.fromJSDate(ev.startsAtUtc, { zone: "utc" }).setZone(zone)
      : DateTime.fromISO(ev.startsAtUtc, { zone: "utc" }).setZone(zone);
  if (!dt.isValid) {
    return ev.startsAtUtc instanceof Date ? ev.startsAtUtc.toISOString() : ev.startsAtUtc;
  }
  return dt.toLocaleString({
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function formatLocation(ev: SavedSearchDigestEvent): string {
  const parts: string[] = [];
  if (ev.city) parts.push(ev.city);
  if (ev.countryCode) parts.push(ev.countryCode.toUpperCase());
  return parts.join(", ");
}

/**
 * Build subject + HTML body for a saved-search digest email. One email covers
 * the new events that match a single saved search since the last successful
 * delivery (or since the search was created, on first run).
 */
export function renderSavedSearchDigestEmail(
  input: SavedSearchDigestInput,
): { subject: string; html: string } {
  const count = input.events.length;
  const subjectQualifier = input.searchLabel?.trim()
    ? ` for "${input.searchLabel.trim()}"`
    : "";
  const subject =
    count === 1
      ? `1 new event matches your saved search${subjectQualifier}`
      : `${count} new events match your saved search${subjectQualifier}`;

  const greeting = input.userDisplayName?.trim()
    ? `Hi ${escapeHtml(input.userDisplayName.trim())},`
    : `Hi,`;

  const intro =
    count === 1
      ? `A new event matches your saved search.`
      : `${count} new events match your saved search.`;

  const summaryLine = input.filterSummary?.trim()
    ? `<div style="color:#6b7280;font-size:13px;margin:4px 0 16px;">${escapeHtml(input.filterSummary.trim())}</div>`
    : "";

  const rowsHtml = input.events
    .map((ev) => {
      const url = `${config.PUBLIC_BASE_URL}/events/${encodeURIComponent(ev.eventSlug)}`;
      const title = escapeHtml(ev.eventTitle);
      const when = escapeHtml(formatEventDate(ev));
      const location = escapeHtml(formatLocation(ev));
      const locationLine = location
        ? `<div style="color:#4b5563;font-size:13px;margin-top:2px;">${location}</div>`
        : "";
      return `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;">
            <a href="${url}" style="color:#0f8a4a;font-weight:600;text-decoration:none;font-size:15px;">${title}</a>
            <div style="color:#374151;font-size:13px;margin-top:2px;">${when}</div>
            ${locationLine}
          </td>
        </tr>`;
    })
    .join("");

  const moreCount = Math.max(0, input.totalMatches - input.events.length);
  const seeMoreBlock =
    moreCount > 0
      ? `
      <p style="margin:16px 0 0;text-align:center;font-size:14px;">
        <a href="${escapeHtml(input.filterUrl)}" style="color:#0f8a4a;text-decoration:none;font-weight:600;">
          See ${moreCount} more →
        </a>
      </p>`
      : "";

  const unsubscribeUrl = `${config.PUBLIC_BASE_URL}/api/saved-searches/unsubscribe?token=${encodeURIComponent(input.unsubscribeToken)}`;

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#111827;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
    <div style="background:#ffffff;border-radius:8px;padding:24px;border:1px solid #e5e7eb;">
      <p style="margin:0 0 12px;font-size:15px;">${greeting}</p>
      <p style="margin:0 0 4px;font-size:15px;line-height:1.5;">${intro}</p>
      ${summaryLine}
      <table role="presentation" style="width:100%;border-collapse:collapse;">
        ${rowsHtml}
      </table>
      ${seeMoreBlock}
    </div>
    <p style="margin:24px 0 8px;text-align:center;color:#6b7280;font-size:12px;line-height:1.5;">
      You're receiving this because you saved a search on
      <a href="${config.PUBLIC_BASE_URL}" style="color:#6b7280;">DanceResource Events</a>.
    </p>
    <p style="margin:0;text-align:center;font-size:12px;">
      <a href="${unsubscribeUrl}" style="color:#6b7280;">Unsubscribe from this saved search</a>
    </p>
  </div>
</body></html>`;

  return { subject, html };
}
