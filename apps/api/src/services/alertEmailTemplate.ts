import { DateTime } from "luxon";

import { config } from "../config";

/**
 * One row per event occurrence included in a digest email. `startsAtUtc` is a
 * timestamptz string as returned by Postgres; the template formats it in the event's
 * own timezone so recipients see the local time the event actually happens.
 */
export type AlertDigestOccurrence = {
  eventId: string;
  eventSlug: string;
  eventTitle: string;
  startsAtUtc: string;
  eventTimezone: string | null;
  city: string | null;
  countryCode: string | null;
};

export type AlertDigestInput = {
  userDisplayName: string | null;
  organizerName: string;
  organizerSlug: string;
  locationLabel: string | null;
  radiusKm: number;
  unsubscribeToken: string;
  occurrences: AlertDigestOccurrence[];
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatOccurrenceDate(occ: AlertDigestOccurrence): string {
  const zone = occ.eventTimezone ?? "utc";
  const dt = DateTime.fromISO(occ.startsAtUtc, { zone: "utc" }).setZone(zone);
  if (!dt.isValid) return occ.startsAtUtc;
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

function formatLocation(occ: AlertDigestOccurrence): string {
  const parts: string[] = [];
  if (occ.city) parts.push(occ.city);
  if (occ.countryCode) parts.push(occ.countryCode.toUpperCase());
  return parts.join(", ");
}

/**
 * Build subject + HTML body for a single user's alert digest. One email covers all
 * newly-added occurrences for one (user, alert) pair since the last worker run.
 */
export function renderAlertDigestEmail(input: AlertDigestInput): { subject: string; html: string } {
  const where = input.locationLabel?.trim()
    ? ` near ${input.locationLabel.trim()}`
    : "";
  const subject =
    input.occurrences.length === 1
      ? `${input.organizerName} posted a new event${where}`
      : `${input.organizerName} posted ${input.occurrences.length} new events${where}`;

  const greeting = input.userDisplayName?.trim()
    ? `Hi ${escapeHtml(input.userDisplayName.trim())},`
    : `Hi,`;

  const rowsHtml = input.occurrences
    .map((occ) => {
      const url = `${config.PUBLIC_BASE_URL}/events/${encodeURIComponent(occ.eventSlug)}`;
      const title = escapeHtml(occ.eventTitle);
      const when = escapeHtml(formatOccurrenceDate(occ));
      const location = escapeHtml(formatLocation(occ));
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

  const hostUrl = `${config.PUBLIC_BASE_URL}/hosts/${encodeURIComponent(input.organizerSlug)}`;
  const unsubscribeUrl = `${config.PUBLIC_BASE_URL}/api/alerts/unsubscribe?token=${encodeURIComponent(input.unsubscribeToken)}`;

  const intro = input.locationLabel?.trim()
    ? `<a href="${hostUrl}" style="color:#0f8a4a;text-decoration:none;font-weight:600;">${escapeHtml(
        input.organizerName,
      )}</a> posted ${input.occurrences.length === 1 ? "a new event" : "new events"} within ${
        input.radiusKm
      } km of <strong>${escapeHtml(input.locationLabel.trim())}</strong>.`
    : `<a href="${hostUrl}" style="color:#0f8a4a;text-decoration:none;font-weight:600;">${escapeHtml(
        input.organizerName,
      )}</a> posted ${input.occurrences.length === 1 ? "a new event" : "new events"}.`;

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#111827;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
    <div style="background:#ffffff;border-radius:8px;padding:24px;border:1px solid #e5e7eb;">
      <p style="margin:0 0 12px;font-size:15px;">${greeting}</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">${intro}</p>
      <table role="presentation" style="width:100%;border-collapse:collapse;">
        ${rowsHtml}
      </table>
    </div>
    <p style="margin:24px 0 8px;text-align:center;color:#6b7280;font-size:12px;line-height:1.5;">
      You're receiving this because you follow ${escapeHtml(input.organizerName)} on
      <a href="${config.PUBLIC_BASE_URL}" style="color:#6b7280;">DanceResource Events</a>.
    </p>
    <p style="margin:0;text-align:center;font-size:12px;">
      <a href="${unsubscribeUrl}" style="color:#6b7280;">Unsubscribe from this alert</a>
    </p>
  </div>
</body></html>`;

  return { subject, html };
}
