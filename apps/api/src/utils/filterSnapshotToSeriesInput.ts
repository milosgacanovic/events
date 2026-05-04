import {
  EVENT_DATE_PRESETS,
  type EventDatePreset,
} from "./eventDatePresets";
import type { SeriesFilterInput } from "./seriesFilters";

/**
 * Adapter: jsonb `filter_snapshot` (as stored on `saved_searches`) →
 * `SeriesFilterInput` shape consumed by `buildSeriesMeiliFilters`.
 *
 * The snapshot is what the search UI saved — keys are the URL params
 * (`practiceCategoryId`, `eventFormatId`, …) and values are either a CSV
 * string or a string array. The cron worker passes its own UTC date window
 * (we want "any upcoming series") so the snapshot's `eventDate` preset
 * filters still apply on top.
 */
export function filterSnapshotToSeriesInput(
  snap: Record<string, unknown>,
  window: { fromUtc: string; toUtc: string },
): { input: SeriesFilterInput; query: string | undefined } {
  const presetSet = new Set<EventDatePreset>(EVENT_DATE_PRESETS);
  const presets = toStringArray(snap.eventDate)
    .map((v) => v.trim().toLowerCase() as EventDatePreset)
    .filter((v) => presetSet.has(v));

  const tags = toStringArray(snap.tags);
  const languages = toStringArray(snap.languages);

  const input: SeriesFilterInput = {
    fromUtc: window.fromUtc,
    toUtc: window.toUtc,
    practiceCategoryIds: orUndefined(toStringArray(snap.practiceCategoryId ?? snap.practice)),
    practiceSubcategoryId: firstString(snap.practiceSubcategoryIds),
    eventFormatIds: orUndefined(toStringArray(snap.eventFormatId ?? snap.format)),
    tags,
    languages,
    attendanceModes: orUndefined(toStringArray(snap.attendanceMode)),
    countryCodes: orUndefined(toStringArray(snap.countryCode)),
    cities: orUndefined(toStringArray(snap.city)),
    selectedEventDatePresets: presets,
  };

  const lat = numberOrUndefined(snap.lat);
  const lng = numberOrUndefined(snap.lng);
  const radiusKm = numberOrUndefined(snap.radiusKm);
  if (lat !== undefined && lng !== undefined && radiusKm !== undefined) {
    input.geoLat = lat;
    input.geoLng = lng;
    input.geoRadius = radiusKm * 1000;
  }

  // `query` / `q` go to Meili's search-term field, not the filter array.
  const query = firstString(snap.q ?? snap.query);

  return { input, query };
}

function toStringArray(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

function firstString(value: unknown): string | undefined {
  const arr = toStringArray(value);
  return arr.length > 0 ? arr[0] : undefined;
}

function orUndefined<T>(arr: T[]): T[] | undefined {
  return arr.length > 0 ? arr : undefined;
}

function numberOrUndefined(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}
