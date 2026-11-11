import { cookies, headers } from "next/headers";

import { apiBase } from "./api";
import { seoT } from "./eventSeo";
import { localeCookieName } from "./i18n/config";
import { toDisplayNamesLocale } from "./i18n/languageLabels";
import { resolveRequestLocale } from "./i18n/locale";

/**
 * Server helpers for the SEO landing pages (city pages, series hubs; SEO
 * round 3 Proposals B and A1). Everything renders on the server, so the HTML
 * Google fetches first has the full list of links.
 */

export const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://events.danceresource.org";

export type Cadence = {
  kind: "weekly";
  weekday: number;
  startLocalHHMM: string;
  endLocalHHMM: string;
  timezone: string;
} | null;

export async function fetchApiJson<T>(path: string): Promise<{ status: number; data: T | null }> {
  const base = process.env.INTERNAL_API_BASE_URL ?? apiBase;
  const response = await fetch(`${base}${path}`, { next: { revalidate: 600 } }).catch(() => null);
  if (!response) return { status: 503, data: null };
  if (!response.ok) return { status: response.status, data: null };
  return { status: response.status, data: (await response.json()) as T };
}

export function requestLocale(): string {
  return resolveRequestLocale(cookies().get(localeCookieName)?.value, headers().get("accept-language"));
}

export function translator(locale: string) {
  return (key: string, values: Record<string, string> = {}) => seoT(locale, key, values);
}

function safeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return "UTC";
  }
}

function intlLocale(locale: string): string {
  return locale === "en" ? "en-GB" : toDisplayNamesLocale(locale);
}

/** "Thu 12 Nov, 19:15" in the event's own timezone and the page locale. */
export function formatDateTime(iso: string, timeZone: string | null | undefined, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: safeZone(timeZone),
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** "Thu 12 Nov 2026" in the event's own timezone. */
export function formatDay(iso: string, timeZone: string | null | undefined, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: safeZone(timeZone),
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

const WEEKDAY_KEYS: Record<number, string> = {
  1: "monday", 2: "tuesday", 3: "wednesday", 4: "thursday", 5: "friday", 6: "saturday", 7: "sunday",
};

function formatHHMM(hhmm: string, locale: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  try {
    // Same locale rule as formatDateTime (en → en-GB), so "Next: …, 18:30"
    // and "Wednesdays 18:30 – 21:00" agree on the clock.
    return new Intl.DateTimeFormat(intlLocale(locale), { hour: "numeric", minute: "2-digit" })
      .format(new Date(2000, 0, 1, h, m));
  } catch {
    return hhmm;
  }
}

/** "Fridays 19:15 – 21:30" (existing eventDetail.cadenceLine label). */
export function cadenceLine(cadence: Cadence, locale: string): string | null {
  if (!cadence) return null;
  const weekdayKey = WEEKDAY_KEYS[cadence.weekday];
  if (!weekdayKey) return null;
  const t = translator(locale);
  return t("eventDetail.cadenceLine", {
    weekdayPlural: t(`eventDetail.weekdayPlural.${weekdayKey}`),
    startTime: formatHHMM(cadence.startLocalHHMM, locale),
    endTime: formatHHMM(cadence.endLocalHHMM, locale),
  });
}

export function regionName(code: string | null | undefined, locale: string): string | null {
  if (!code) return null;
  try {
    return new Intl.DisplayNames([toDisplayNamesLocale(locale)], { type: "region" }).of(code.toUpperCase()) ?? null;
  } catch {
    return null;
  }
}
