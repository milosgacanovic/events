import { IntlMessageFormat } from "intl-messageformat";

import { defaultLocale, isSupportedLocale, type AppLocale } from "./i18n/config";
import { toDisplayNamesLocale } from "./i18n/languageLabels";
import { getMessages } from "./i18n/messages";

import { truncateOnWord } from "./textTruncate";

export { formatSeoDate } from "./seoDate";
export { truncateOnWord };

/**
 * Server-side builders for event <title> / meta description (SEO round 3,
 * Task 3). Pure functions over known fields — nothing invented.
 */

// Handoff target "≤ ~65"; its own example ("Emerging Waves with Ina-Maria
// Freitas · Den Haag · Thu 12 Nov 2026") is 67, so allow a little slack
// rather than dropping the host, which is what tells same-city events apart.
export const SEO_TITLE_MAX = 70;
export const SEO_DESCRIPTION_MAX = 158;
const SITE_SUFFIX = " | DanceResource";
const SEP = " · ";

export function seoT(locale: string, key: string, values: Record<string, string> = {}): string {
  const loc: AppLocale = isSupportedLocale(locale) ? locale : defaultLocale;
  const template = getMessages(loc)[key] ?? getMessages(defaultLocale)[key] ?? key;
  try {
    return String(new IntlMessageFormat(template, toDisplayNamesLocale(loc)).format(values))
      // Dates that end in "." (ru "2026 г.", sr "2026.") + a template "." → "..".
      .replace(/\.\.(?=\s|$)/g, ".");
  } catch {
    return template;
  }
}

export type EventSeoTitleInput = {
  locale: string;
  title: string;
  host: string | null;
  place: string | null;
  dateWithWeekday: string;
  dateWithoutWeekday: string;
};

/**
 * `{title} with {host} · {place} · {date} | DanceResource`, shortened to
 * ≤ SEO_TITLE_MAX by dropping, in order: the site suffix, the host, the
 * weekday. Place and date are never dropped — they make titles unique.
 */
export function buildEventSeoTitle(input: EventSeoTitleInput): string {
  const head = (withHost: boolean) =>
    withHost && input.host ? seoT(input.locale, "eventDetail.seo.titleWith", { title: input.title, host: input.host }) : input.title;
  const compose = (withHost: boolean, date: string) =>
    [head(withHost), input.place, date].filter((part): part is string => Boolean(part)).join(SEP);

  const candidates = [
    compose(true, input.dateWithWeekday) + SITE_SUFFIX,
    compose(true, input.dateWithWeekday),
    compose(false, input.dateWithWeekday),
    compose(false, input.dateWithoutWeekday),
  ];
  return candidates.find((c) => c.length <= SEO_TITLE_MAX) ?? candidates[candidates.length - 1];
}

export type EventLeadInput = {
  locale: string;
  kind: string | null;
  host: string | null;
  place: string | null;
  online: boolean;
  date: string | null;
};

/** Factual lead sentence built only from known fields. Empty if no date. */
export function buildEventLead(input: EventLeadInput): string {
  if (!input.date) return "";
  const kind = input.kind || seoT(input.locale, "eventDetail.seo.kindFallback");
  const values: Record<string, string> = { kind, date: input.date };
  if (input.host) values.host = input.host;
  if (input.online) {
    return seoT(input.locale, input.host ? "eventDetail.seo.leadOnlineHost" : "eventDetail.seo.leadOnlineNoHost", values);
  }
  if (!input.place) return "";
  values.place = input.place;
  return seoT(input.locale, input.host ? "eventDetail.seo.leadHost" : "eventDetail.seo.leadNoHost", values);
}

/** Lead sentence + start of the cleaned description, ≤ SEO_DESCRIPTION_MAX. */
export function buildEventMetaDescription(lead: string, text: string, max = SEO_DESCRIPTION_MAX): string {
  const body = text.trim();
  if (!lead) return truncateOnWord(body, max);
  if (!body) return truncateOnWord(lead, max);
  return truncateOnWord(`${lead} ${body}`, max);
}

/** Below this, a cleaned description counts as thin (handoff Task 5). */
export const THIN_DESCRIPTION_CHARS = 80;

const WEEKDAY_KEYS: Record<number, string> = {
  1: "monday", 2: "tuesday", 3: "wednesday", 4: "thursday", 5: "friday", 6: "saturday", 7: "sunday",
};

function formatHHMM(hhmm: string, locale: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  try {
    return new Intl.DateTimeFormat(toDisplayNamesLocale(locale), { hour: "numeric", minute: "2-digit" })
      .format(new Date(2000, 0, 1, h, m));
  } catch {
    return hhmm;
  }
}

export type ThinSummaryInput = {
  locale: string;
  lead: string;
  cadence: { weekday: number; startLocalHHMM: string; endLocalHHMM: string } | null;
  address: string | null;
};

/**
 * Factual summary for thin descriptions, built only from known fields and
 * existing translated labels: lead sentence + "When: Fridays 19:15 – 21:30."
 * + "Where: <address>." Rendered visibly on the page AND used for JSON-LD.
 */
export function buildThinDescriptionSummary(input: ThinSummaryInput): string {
  const parts: string[] = [];
  if (input.lead) parts.push(input.lead);
  const weekdayKey = input.cadence ? WEEKDAY_KEYS[input.cadence.weekday] : undefined;
  if (input.cadence && weekdayKey) {
    const line = seoT(input.locale, "eventDetail.cadenceLine", {
      weekdayPlural: seoT(input.locale, `eventDetail.weekdayPlural.${weekdayKey}`),
      startTime: formatHHMM(input.cadence.startLocalHHMM, input.locale),
      endTime: formatHHMM(input.cadence.endLocalHHMM, input.locale),
    });
    parts.push(`${seoT(input.locale, "eventDetail.when")}: ${line}.`);
  }
  if (input.address) {
    parts.push(`${seoT(input.locale, "eventDetail.where")}: ${input.address.replace(/[.\s]+$/u, "")}.`);
  }
  return parts.join(" ");
}

export const SITE_DEFAULT_IMAGE = "https://wiki.danceresource.org/images/9/99/Danceresource.org_logo.png";

/** Absolute, crawlable URL for a stored image path (http(s) or /uploads/…). */
export function absoluteImageUrl(path: string | null | undefined, siteOrigin: string): string | null {
  if (!path) return null;
  const trimmed = path.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("/")) return `${siteOrigin}${trimmed}`;
  return null;
}

/**
 * JSON-LD / og:image fallback chain: event cover → primary host's avatar →
 * site default. (No per-practice/format default images exist in the DB yet.)
 */
export function resolveEventImage(
  cover: string | null | undefined,
  hostAvatars: Array<string | null | undefined>,
  siteOrigin: string,
): { url: string; source: "cover" | "host" | "site" } {
  const coverUrl = absoluteImageUrl(cover, siteOrigin);
  if (coverUrl) return { url: coverUrl, source: "cover" };
  for (const avatar of hostAvatars) {
    const url = absoluteImageUrl(avatar, siteOrigin);
    if (url) return { url, source: "host" };
  }
  return { url: SITE_DEFAULT_IMAGE, source: "site" };
}
