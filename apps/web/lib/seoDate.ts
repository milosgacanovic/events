import { toDisplayNamesLocale } from "./i18n/languageLabels";

// Client-safe (no message catalogs imported): used by the server-built
// <title> and by the visible subtitle under the event H1, so they match.

function intlLocale(locale: string): string {
  // "Thu 12 Nov 2026" (day-month order) reads better internationally than en-US.
  return locale === "en" ? "en-GB" : toDisplayNamesLocale(locale);
}

const MULTI_DAY_MIN_MS = 20 * 60 * 60 * 1000;

/**
 * Locale-aware date in the event's own timezone. Multi-day events (different
 * local dates and ≥ 20h long, so a late class ending after midnight stays a
 * single day) render as a range, e.g. "12–14 Nov 2026".
 */
export function formatSeoDate(
  startIso: string,
  endIso: string | null | undefined,
  timeZone: string,
  locale: string,
  options: { weekday: boolean },
): string {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return "";
  const end = endIso ? new Date(endIso) : null;
  const loc = intlLocale(locale);
  const safeTz = (() => {
    try {
      new Intl.DateTimeFormat("en", { timeZone }).format(start);
      return timeZone;
    } catch {
      return "UTC";
    }
  })();
  const dayKey = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: safeTz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const isMultiDay =
    end !== null &&
    !Number.isNaN(end.getTime()) &&
    end.getTime() - start.getTime() >= MULTI_DAY_MIN_MS &&
    dayKey(start) !== dayKey(end);
  if (isMultiDay && end) {
    const fmt = new Intl.DateTimeFormat(loc, { timeZone: safeTz, day: "numeric", month: "short", year: "numeric" });
    return fmt.formatRange(start, end);
  }
  return new Intl.DateTimeFormat(loc, {
    timeZone: safeTz,
    ...(options.weekday ? { weekday: "short" as const } : {}),
    day: "numeric",
    month: "short",
    year: "numeric",
  })
    .format(start)
    // en-GB inserts a comma after the weekday ("Thu, 12 Nov 2026"); the
    // middle-dot separators already delimit, so drop it for English only.
    .replace(/^(\p{L}+),\s/u, locale === "en" ? "$1 " : "$&");
}
