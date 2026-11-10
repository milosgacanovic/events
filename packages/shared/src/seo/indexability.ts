/**
 * Single source of truth for "should this event page be indexed?".
 *
 * Used by BOTH the event detail endpoint (which drives the page's robots
 * meta + Event JSON-LD) and the sitemap endpoint, so the two can never
 * disagree again (round-3 SEO handoff, Task 1).
 *
 * Rules:
 *   - must be published + public;
 *   - the event must have at least one OWN occurrence that hasn't ended
 *     (series-wide upcoming dates don't count — a past sibling page is
 *     archived even if later siblings exist);
 *   - for multi-sibling series (imported weekly classes, one page per date),
 *     only siblings starting within INDEXABLE_SIBLING_WINDOW_DAYS are
 *     indexed, plus always the series' earliest upcoming sibling so seasonal
 *     series with a gap still have one indexable page. Later dates are
 *     `noindex, follow` until they come into range.
 */
export const INDEXABLE_SIBLING_WINDOW_DAYS = 60;

export type EventIndexabilityInput = {
  status: string | null | undefined;
  visibility: string | null | undefined;
  /** Start of this event's own earliest occurrence that has not yet ended. */
  nextOccurrenceStartsAt: string | Date | null | undefined;
  /** Published + public events sharing this event's series (including itself). */
  siblingCount: number;
  /** Earliest not-yet-ended occurrence start across the whole series. */
  seriesNextOccurrenceStartsAt: string | Date | null | undefined;
};

function toMs(value: string | Date | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

export function isEventIndexable(input: EventIndexabilityInput, now: Date = new Date()): boolean {
  if (input.status !== "published") return false;
  if (input.visibility !== "public") return false;
  const next = toMs(input.nextOccurrenceStartsAt);
  if (next === null) return false;
  if (input.siblingCount <= 1) return true;
  const seriesNext = toMs(input.seriesNextOccurrenceStartsAt);
  if (seriesNext !== null && next <= seriesNext) return true;
  return next <= now.getTime() + INDEXABLE_SIBLING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}
