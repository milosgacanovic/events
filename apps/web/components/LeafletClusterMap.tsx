"use client";

import "leaflet/dist/leaflet.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Map as LeafletMap } from "leaflet";
import {
  CircleMarker,
  MapContainer,
  TileLayer,
  Tooltip,
  useMapEvents,
} from "react-leaflet";

import { useI18n } from "./i18n/I18nProvider";

type ClusterFeature = {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: {
    cluster: boolean;
    point_count?: number;
    occurrence_id?: string;
    event_slug?: string;
  };
};

type ClusterResponse = {
  type: "FeatureCollection";
  features: ClusterFeature[];
  truncated?: boolean;
};

function MapChangeWatcher({ onChange }: { onChange: () => void }) {
  useMapEvents({
    moveend: onChange,
    zoomend: onChange,
  });

  return null;
}

function buildClusterUrl(queryString: string, bbox: string, zoom: number): string {
  const params = new URLSearchParams(queryString);
  params.set("bbox", bbox);
  params.set("zoom", String(zoom));

  return `/api/map/clusters?${params.toString()}`;
}

export function LeafletClusterMap({
  queryString,
  refreshToken,
}: {
  queryString: string;
  refreshToken: number;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const mapRef = useRef<LeafletMap | null>(null);
  const requestRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [features, setFeatures] = useState<ClusterFeature[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  const tileUrl =
    process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

  const refreshClusters = useCallback(async () => {
    if (!mapRef.current) {
      return;
    }

    const bounds = mapRef.current.getBounds();
    const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(",");
    const zoom = Math.round(mapRef.current.getZoom());

    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    setStatus("loading");

    try {
      const response = await fetch(buildClusterUrl(queryString, bbox, zoom), {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Map request failed with ${response.status}`);
      }

      const data = (await response.json()) as ClusterResponse;
      if (requestRef.current !== requestId) {
        return;
      }

      setFeatures(data.features ?? []);
      setTruncated(Boolean(data.truncated));
      setStatus("idle");
    } catch {
      if (requestRef.current !== requestId) {
        return;
      }
      setTruncated(false);
      setStatus("error");
    }
  }, [queryString]);

  const scheduleRefresh = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      void refreshClusters();
    }, 250);
  }, [refreshClusters]);

  useEffect(() => {
    void refreshClusters();
  }, [refreshClusters, refreshToken]);

  useEffect(() => () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
  }, []);

  const markers = useMemo(
    () =>
      features.map((feature, index) => {
        const [lng, lat] = feature.geometry.coordinates;
        const pointCount = feature.properties.point_count ?? 1;
        const isCluster = feature.properties.cluster;

        return (
          <CircleMarker
            center={[lat, lng]}
            key={`${lat}-${lng}-${feature.properties.occurrence_id ?? "cluster"}-${index}`}
            eventHandlers={{
              click: () => {
                if (isCluster) {
                  if (!mapRef.current) {
                    return;
                  }
                  mapRef.current.setView([lat, lng], Math.min(mapRef.current.getZoom() + 2, 20));
                  scheduleRefresh();
                  return;
                }
                if (feature.properties.event_slug) {
                  router.push(`/events/${feature.properties.event_slug}`);
                }
              },
            }}
            pathOptions={{
              color: isCluster ? "#0f7a6a" : "#e07a2f",
              fillColor: isCluster ? "#0f7a6a" : "#e07a2f",
              fillOpacity: 0.8,
              weight: 1,
            }}
            radius={isCluster ? Math.min(28, 10 + Math.log(pointCount) * 6) : 7}
          >
            <Tooltip>
              {isCluster
                ? t("map.tooltip.cluster", { count: pointCount })
                : t("map.tooltip.occurrence", {
                    id: feature.properties.occurrence_id ?? t("map.tooltip.unknownOccurrence"),
                  })}
            </Tooltip>
          </CircleMarker>
        );
      }),
    [features],
  );

  return (
    <div className="map-shell">
      <MapContainer
        center={[20, 0]}
        zoom={2}
        scrollWheelZoom
        className="leaflet-map"
        ref={(instance) => {
          mapRef.current = instance;
        }}
        whenReady={() => {
          void refreshClusters();
        }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url={tileUrl}
        />
        <MapChangeWatcher
          onChange={() => {
            scheduleRefresh();
          }}
        />
        {markers}
      </MapContainer>

      <div className="map-status">
        <div>{t("map.note.geoOnly")}</div>
        {status === "loading" ? t("map.status.loading") : null}
        {status === "error" ? t("map.status.error") : null}
        {status === "idle" ? t("map.status.idle", { count: features.length }) : null}
        {status === "idle" && features.length === 0 ? <div>{t("map.status.empty")}</div> : null}
        {status === "idle" && truncated ? <div>{t("map.status.truncated")}</div> : null}
      </div>
    </div>
  );
}
