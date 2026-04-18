import type { EventDatePreset } from "./eventDatePresets";

export type SeriesFilterInput = {
  fromUtc: string;
  toUtc: string;
  practiceCategoryIds?: string[];
  practiceSubcategoryId?: string;
  eventFormatIds?: string[];
  tags: string[];
  languages: string[];
  attendanceModes?: string[];
  organizerId?: string;
  countryCodes?: string[];
  cities?: string[];
  hasGeo?: boolean;
  geoLat?: number;
  geoLng?: number;
  geoRadius?: number;
  bbox?: { south: number; west: number; north: number; east: number };
  selectedEventDatePresets: EventDatePreset[];
};

/**
 * Meili filter set for the series index. Shared by /events/search (list)
 * and /map/clusters so both paths produce identical totals for the same
 * user-facing filter state.
 *
 *   - Inequalities and sort use `earliest_upcoming_ts`.
 *   - Date-range presets filter on the precomputed `event_date_buckets`
 *     attribute — the exact same attribute whose facet distribution drives
 *     the preset-chip counts, so chip count === filter count by construction.
 *   - Optional `bbox` adds a `_geoBoundingBox` clause for the map viewport.
 */
export function buildSeriesMeiliFilters(input: SeriesFilterInput): string[] {
  const filters: string[] = [];

  filters.push(`earliest_upcoming_ts >= ${Date.parse(input.fromUtc)}`);
  filters.push(`earliest_upcoming_ts <= ${Date.parse(input.toUtc)}`);

  if (input.selectedEventDatePresets.length > 0) {
    const presetClauses = input.selectedEventDatePresets
      .map((p) => `event_date_buckets = ${JSON.stringify(p)}`)
      .join(" OR ");
    filters.push(`(${presetClauses})`);
  }

  if (input.practiceCategoryIds?.length === 1) {
    filters.push(`practice_category_id = ${JSON.stringify(input.practiceCategoryIds[0])}`);
  } else if (input.practiceCategoryIds && input.practiceCategoryIds.length > 1) {
    filters.push(
      `(${input.practiceCategoryIds.map((v) => `practice_category_id = ${JSON.stringify(v)}`).join(" OR ")})`,
    );
  }
  if (input.practiceSubcategoryId) {
    filters.push(`practice_subcategory_id = ${JSON.stringify(input.practiceSubcategoryId)}`);
  }
  if (input.eventFormatIds?.length === 1) {
    filters.push(`event_format_id = ${JSON.stringify(input.eventFormatIds[0])}`);
  } else if (input.eventFormatIds && input.eventFormatIds.length > 1) {
    filters.push(
      `(${input.eventFormatIds.map((v) => `event_format_id = ${JSON.stringify(v)}`).join(" OR ")})`,
    );
  }
  if (input.tags.length === 1) {
    filters.push(`tags = ${JSON.stringify(input.tags[0])}`);
  } else if (input.tags.length > 1) {
    filters.push(`(${input.tags.map((t) => `tags = ${JSON.stringify(t)}`).join(" OR ")})`);
  }
  if (input.languages.length === 1) {
    filters.push(`languages = ${JSON.stringify(input.languages[0])}`);
  } else if (input.languages.length > 1) {
    filters.push(`(${input.languages.map((l) => `languages = ${JSON.stringify(l)}`).join(" OR ")})`);
  }
  if (input.attendanceModes?.length === 1) {
    filters.push(`attendance_mode = ${JSON.stringify(input.attendanceModes[0])}`);
  } else if (input.attendanceModes && input.attendanceModes.length > 1) {
    filters.push(
      `(${input.attendanceModes.map((m) => `attendance_mode = ${JSON.stringify(m)}`).join(" OR ")})`,
    );
  }
  if (input.organizerId) {
    filters.push(`organizer_ids = ${JSON.stringify(input.organizerId)}`);
  }
  if (input.countryCodes?.length) {
    const normalized = input.countryCodes.map((v) => v.trim().toLowerCase()).filter(Boolean);
    if (normalized.length === 1) {
      filters.push(`country_code = ${JSON.stringify(normalized[0])}`);
    } else if (normalized.length > 1) {
      filters.push(
        `(${normalized.map((v) => `country_code = ${JSON.stringify(v)}`).join(" OR ")})`,
      );
    }
  }
  if (input.cities?.length === 1) {
    filters.push(`city = ${JSON.stringify(input.cities[0])}`);
  } else if (input.cities && input.cities.length > 1) {
    filters.push(`(${input.cities.map((v) => `city = ${JSON.stringify(v)}`).join(" OR ")})`);
  }
  if (typeof input.hasGeo === "boolean") {
    filters.push(`has_geo = ${input.hasGeo}`);
  }
  if (input.geoLat !== undefined && input.geoLng !== undefined && input.geoRadius !== undefined) {
    filters.push(`_geoRadius(${input.geoLat}, ${input.geoLng}, ${input.geoRadius})`);
  }
  if (input.bbox) {
    // Meili: _geoBoundingBox([topRightLat, topRightLng], [bottomLeftLat, bottomLeftLng]).
    filters.push(
      `_geoBoundingBox([${input.bbox.north}, ${input.bbox.east}], [${input.bbox.south}, ${input.bbox.west}])`,
    );
  }

  return filters;
}
