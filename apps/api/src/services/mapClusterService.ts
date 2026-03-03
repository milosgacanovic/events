import Supercluster from "supercluster";
import type { Pool } from "pg";
import type { Feature, FeatureCollection, Point } from "geojson";

import { fetchMapPoints, type MapFilterInput } from "../db/mapRepo";

type PointProps = { occurrence_id: string; event_slug: string };

export async function buildClusters(
  pool: Pool,
  input: MapFilterInput & { zoom: number },
): Promise<{ collection: FeatureCollection; truncated: boolean }> {
  const { points, truncated } = await fetchMapPoints(pool, input);
  const features: Feature<Point, PointProps>[] = points.map((point) => ({
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [point.lng, point.lat],
    },
    properties: {
      occurrence_id: point.occurrence_id,
      event_slug: point.event_slug,
    },
  }));

  const supercluster = new Supercluster<PointProps, { cluster: true; point_count: number }>({
    radius: 50,
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
        return {
          type: "Feature",
          geometry: cluster.geometry,
          properties: {
            cluster: true,
            point_count: clusterProps.point_count,
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
        },
      };
    }),
  };

  return {
    collection,
    truncated,
  };
}
