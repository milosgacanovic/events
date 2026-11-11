import { htmlToPlainText } from "../text/htmlToPlainText";

/**
 * Single source of truth for "should this host page be indexed?"
 * (SEO round 3, Proposal C: thin-host policy, approved 2026-11-11).
 *
 * Used by BOTH the host detail endpoint (which drives the page's robots meta)
 * and the hosts sitemap endpoint, so the two can't disagree.
 *
 * A published host is NOT indexed when all three hold:
 *   1. it has no upcoming published + public event;
 *   2. none of its published + public events started in the past 12 months
 *      (cancelled events don't count: importer churn isn't activity);
 *   3. its visible bio is shorter than THIN_HOST_MIN_BIO_CHARS.
 * The page stays 200 (`noindex, follow`) and becomes indexable again by
 * itself when an event is added or a bio is written.
 */
export const THIN_HOST_MIN_BIO_CHARS = 300;
export const HOST_RECENT_ACTIVITY_DAYS = 365;

export type HostIndexabilityInput = {
  status: string | null | undefined;
  hasUpcomingEvent: boolean;
  /** Latest start (<= now) among the host's published + public events. */
  lastEventStartedAt: string | Date | null | undefined;
  /** Plain-text length of the bio the page shows (see hostBioPlainText). */
  bioLength: number;
};

function toMs(value: string | Date | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

export function isHostIndexable(input: HostIndexabilityInput, now: Date = new Date()): boolean {
  if (input.status && input.status !== "published") return false;
  if (input.hasUpcomingEvent) return true;
  const last = toMs(input.lastEventStartedAt);
  if (last !== null && last >= now.getTime() - HOST_RECENT_ACTIVITY_DAYS * 24 * 60 * 60 * 1000) return true;
  return input.bioLength >= THIN_HOST_MIN_BIO_CHARS;
}

function stringField(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  return typeof v === "string" ? v : "";
}

/**
 * The bio text the host page renders: `description_html`, else the
 * description JSON's html / bio + info + description / text — the same
 * fallbacks OrganizerDetailClient uses.
 */
export function hostBioPlainText(descriptionHtml: string | null | undefined, descriptionJson: unknown): string {
  if (descriptionHtml && descriptionHtml.trim()) return htmlToPlainText(descriptionHtml);
  const json = descriptionJson && typeof descriptionJson === "object" ? (descriptionJson as Record<string, unknown>) : {};
  const html = stringField(json, "html");
  if (html.trim()) return htmlToPlainText(html);
  const sections = ["bio", "info", "description"].map((k) => stringField(json, k).trim()).filter(Boolean);
  if (sections.length) return htmlToPlainText(sections.join(" "));
  return htmlToPlainText(stringField(json, "text"));
}
