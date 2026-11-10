import { IntlMessageFormat } from "intl-messageformat";

import { defaultLocale, isSupportedLocale, type AppLocale } from "./i18n/config";
import { toDisplayNamesLocale } from "./i18n/languageLabels";
import { getMessages } from "./i18n/messages";

export { formatSeoDate } from "./seoDate";

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

/** Truncate on a word boundary, appending "…" when cut. */
export function truncateOnWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.replace(/[\s,.;:–—-]+$/u, "")}…`;
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
