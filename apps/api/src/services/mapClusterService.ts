import Supercluster from "supercluster";
import type { Pool } from "pg";
import type { Feature, FeatureCollection, Point } from "geojson";

import { fetchOrganizerMapPoints, type OrganizerMapFilterInput } from "../db/mapRepo";
import { buildSeriesMeiliFilters } from "../utils/seriesFilters";
import type { EventDatePreset } from "../utils/eventDatePresets";
import type { MeilisearchService } from "./meiliService";

/**
 * Map cluster inputs. Sourced from the Meili series index so map totals and
 * /events/search totals stay identical for the same filter state — one hit
 * per series regardless of occurrence count.
 */
export type MapFilterInput = {
  q?: string;
  fromUtc: string;
  toUtc: string;
  eventDatePresets: EventDatePreset[];
  practiceCategoryIds: string[];
  practiceSubcategoryId?: string;
  tags: string[];
  languages: string[];
  attendanceModes: Array<"in_person" | "online" | "hybrid">;
  eventFormatIds: string[];
  organizerId?: string;
  countryCodes: string[];
  cities: string[];
  geoLat?: number;
  geoLng?: number;
  geoRadius?: number;
  bbox: {
    west: number;
    south: number;
    east: number;
    north: number;
  };
  limit: number;
};

type PointProps = {
  occurrence_id: string;
  event_slug: string;
  event_title: string;
  starts_at_utc: string;
  event_timezone: string | null;
};
type OrganizerPointProps = {
  organizer_id: string;
  organizer_slug: string;
  organizer_name: string;
  practice_labels: string[];
};

export async function buildClusters(
  meiliService: MeilisearchService,
  input: MapFilterInput & { zoom: number },
): Promise<{ collection: FeatureCollection; truncated: boolean }> {
  const filters = buildSeriesMeiliFilters({
    fromUtc: input.fromUtc,
    toUtc: input.toUtc,
    practiceCategoryIds: input.practiceCategoryIds,
    practiceSubcategoryId: input.practiceSubcategoryId,
    eventFormatIds: input.eventFormatIds,
    tags: input.tags,
    languages: input.languages,
    attendanceModes: input.attendanceModes,
    organizerId: input.organizerId,
    countryCodes: input.countryCodes,
    cities: input.cities,
    hasGeo: true,
    geoLat: input.geoLat,
    geoLng: input.geoLng,
    geoRadius: input.geoRadius,
    bbox: input.bbox,
    selectedEventDatePresets: input.eventDatePresets,
  });
  // Map is a public surface; don't leak unlisted series.
  filters.push('visibility = "public"');

  const { hits } = await meiliService.searchSeries({
    q: input.q,
    filter: filters,
    limit: input.limit + 1,
    attributesToRetrieve: [
      "series_id",
      "slug",
      "title",
      "_geo",
      "earliest_upcoming_ts",
      "event_timezone",
    ],
  });

  const truncated = hits.length > input.limit;
  const points = hits.slice(0, input.limit);

  const features: Feature<Point, PointProps>[] = [];
  for (const doc of points) {
    if (!doc._geo) continue;
    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [doc._geo.lng, doc._geo.lat],
      },
      properties: {
        // occurrence_id kept as the property name for frontend compat; the
        // value is now the series_id (one pin per series).
        occurrence_id: doc.series_id,
        event_slug: doc.slug,
        event_title: doc.title,
        starts_at_utc: doc.earliest_upcoming_ts
          ? new Date(doc.earliest_upcoming_ts).toISOString()
          : new Date().toISOString(),
        event_timezone: doc.event_timezone,
      },
    });
  }

  if (input.zoom >= 13) {
    return {
      collection: {
        type: "FeatureCollection",
        features: features.map((feature) => ({
          type: "Feature",
          geometry: feature.geometry,
          properties: {
            cluster: false,
            occurrence_id: feature.properties.occurrence_id,
            event_slug: feature.properties.event_slug,
            event_title: feature.properties.event_title,
            starts_at_utc: feature.properties.starts_at_utc,
            event_timezone: feature.properties.event_timezone,
          },
        })),
      },
      truncated,
    };
  }

  const supercluster = new Supercluster<PointProps, { cluster: true; point_count: number }>({
    radius: 80,
    maxZoom: 20,
  });
  supercluster.load(features);

  const clusters = supercluster.getClusters(
    [input.bbox.west, input.bbox.south, input.bbox.east, input.bbox.north],
    input.zoom,
  );

  const collection: FeatureCollection = {
    type: "FeatureCollection",
    features: clusters.map((cluster) => {
      if ((cluster.properties as { cluster?: boolean }).cluster) {
        const clusterProps = cluster.properties as { cluster: true; point_count: number };
        const clusterId = cluster.id as number;
        let expansionZoom = input.zoom + 2;
        try {
          expansionZoom = supercluster.getClusterExpansionZoom(clusterId);
        } catch { /* fallback to zoom + 2 */ }
        return {
          type: "Feature",
          geometry: cluster.geometry,
          properties: {
            cluster: true,
            point_count: clusterProps.point_count,
            expansion_zoom: Math.min(expansionZoom, 20),
          },
        };
      }

      const props = cluster.properties as PointProps;
      return {
        type: "Feature",
        geometry: cluster.geometry,
        properties: {
          cluster: false,
          occurrence_id: props.occurrence_id,
          event_slug: props.event_slug,
          event_title: props.event_title,
          starts_at_utc: props.starts_at_utc,
          event_timezone: props.event_timezone,
        },
      };
    }),
  };

  return {
    collection,
    truncated,
  };
}

export async function buildOrganizerClusters(
  pool: Pool,
  input: OrganizerMapFilterInput & { zoom: number },
): Promise<{ collection: FeatureCollection; truncated: boolean }> {
  const { points, truncated } = await fetchOrganizerMapPoints(pool, input);
  const features: Feature<Point, OrganizerPointProps>[] = points.map((point) => ({
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [point.lng, point.lat],
    },
    properties: {
      organizer_id: point.organizer_id,
      organizer_slug: point.organizer_slug,
      organizer_name: point.organizer_name,
      practice_labels: point.practice_labels ?? [],
    },
  }));

  if (input.zoom >= 13) {
    return {
      collection: {
        type: "FeatureCollection",
        features: features.map((feature) => ({
          type: "Feature",
          geometry: feature.geometry,
          properties: {
            cluster: false,
            organizer_id: feature.properties.organizer_id,
            organizer_slug: feature.properties.organizer_slug,
            organizer_name: feature.properties.organizer_name,
            practice_labels: feature.properties.practice_labels,
          },
        })),
      },
      truncated,
    };
  }

  const supercluster = new Supercluster<OrganizerPointProps, { cluster: true; point_count: number }>({
    radius: 80,
    maxZoom: 20,
  });
  supercluster.load(features);

  const clusters = supercluster.getClusters(
    [input.bbox.west, input.bbox.south, input.bbox.east, input.bbox.north],
    input.zoom,
  );

  const collection: FeatureCollection = {
    type: "FeatureCollection",
    features: clusters.map((cluster) => {
      if ((cluster.properties as { cluster?: boolean }).cluster) {
        const clusterProps = cluster.properties as { cluster: true; point_count: number };
        const clusterId = cluster.id as number;
        let expansionZoom = input.zoom + 2;
        try {
          expansionZoom = supercluster.getClusterExpansionZoom(clusterId);
        } catch { /* fallback to zoom + 2 */ }
        return {
          type: "Feature",
          geometry: cluster.geometry,
          properties: {
            cluster: true,
            point_count: clusterProps.point_count,
            expansion_zoom: Math.min(expansionZoom, 20),
          },
        };
      }

      const props = cluster.properties as OrganizerPointProps;
      return {
        type: "Feature",
        geometry: cluster.geometry,
        properties: {
          cluster: false,
          organizer_id: props.organizer_id,
          organizer_slug: props.organizer_slug,
          organizer_name: props.organizer_name,
          practice_labels: props.practice_labels,
        },
      };
    }),
  };

  return {
    collection,
    truncated,
  };
}
