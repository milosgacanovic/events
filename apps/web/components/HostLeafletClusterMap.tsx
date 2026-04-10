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
    expansion_zoom?: number;
    organizer_id?: string;
    organizer_slug?: string;
    organizer_name?: string;
    practice_labels?: string[];
  };
};

type ClusterResponse = {
  type: "FeatureCollection";
  features: ClusterFeature[];
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

  return `/api/map/organizer-clusters?${params.toString()}`;
}

type MarkerDescriptor = {
  feature: ClusterFeature;
  lat: number;
  lng: number;
};

function hostFeatureKey(f: ClusterFeature): string {
  const [lng, lat] = f.geometry.coordinates;
  if (f.properties.cluster) return `c:${lat.toFixed(4)}:${lng.toFixed(4)}`;
  return `h:${f.properties.organizer_id ?? `${lat}:${lng}`}`;
}

function spiderfyMarkers(features: ClusterFeature[], zoom: number): MarkerDescriptor[] {
  const base: MarkerDescriptor[] = features.map((feature) => ({
    feature,
    lat: feature.geometry.coordinates[1],
    lng: feature.geometry.coordinates[0],
  }));
  if (zoom < 13) {
    return base;
  }

  const grouped = new Map<string, MarkerDescriptor[]>();
  for (const marker of base) {
    if (marker.feature.properties.cluster) {
      continue;
    }
    const key = `${marker.lat.toFixed(6)}:${marker.lng.toFixed(6)}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(marker);
  }

  for (const markers of grouped.values()) {
    if (markers.length <= 1) {
      continue;
    }
    const centerLat = markers[0].lat;
    const cosLat = Math.max(Math.cos((centerLat * Math.PI) / 180), 0.2);
    for (let i = 0; i < markers.length; i += 1) {
      const ring = Math.floor(i / 8);
      const baseMeters = zoom <= 13 ? 840 : zoom === 14 ? 600 : 420;
      const radiusMeters = baseMeters + ring * 300;
      const angle = (2 * Math.PI * i) / Math.max(markers.length, 1);
      const latOffset = (radiusMeters / 111_320) * Math.sin(angle);
      const lngOffset = (radiusMeters / (111_320 * cosLat)) * Math.cos(angle);
      markers[i].lat += latOffset;
      markers[i].lng += lngOffset;
    }
  }

  return base;
}

export function HostLeafletClusterMap({
  queryString,
}: {
  queryString: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const mapRef = useRef<LeafletMap | null>(null);
  const requestRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRequestKeyRef = useRef<string>("");

  const [features, setFeatures] = useState<ClusterFeature[]>([]);
  const [leavingMarkers, setLeavingMarkers] = useState<MarkerDescriptor[]>([]);
  const prevMarkersRef = useRef<MarkerDescriptor[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [currentZoom, setCurrentZoom] = useState(2);
  const [mapReady, setMapReady] = useState(false);

  const tileUrl =
    process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

  const refreshClusters = useCallback(async () => {
    if (!mapRef.current || !mapReady) {
      return;
    }

    const bounds = mapRef.current.getBounds();
    if (!bounds.isValid()) {
      return;
    }
    const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(",");
    const zoom = Math.round(mapRef.current.getZoom());
    setCurrentZoom(zoom);
    const requestKey = `${queryString}|${bbox}|${zoom}`;
    if (lastRequestKeyRef.current === requestKey) {
      return;
    }
    lastRequestKeyRef.current = requestKey;

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
      setStatus("idle");
    } catch {
      if (requestRef.current !== requestId) {
        return;
      }
      lastRequestKeyRef.current = "";
      setStatus("error");
    }
  }, [mapReady, queryString]);

  const scheduleRefresh = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      void refreshClusters();
    }, 250);
  }, [refreshClusters]);

  useEffect(() => {
    if (!mapReady) {
      return;
    }
    void refreshClusters();
  }, [mapReady, refreshClusters]);

  useEffect(() => () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
  }, []);

  const activeMarkers = useMemo(
    () => spiderfyMarkers(features, currentZoom),
    [features, currentZoom],
  );

  const { enteringKeys, departingMarkers } = useMemo(() => {
    const prevKeys = new Set(prevMarkersRef.current.map((m) => hostFeatureKey(m.feature)));
    const curKeys = new Set(activeMarkers.map((m) => hostFeatureKey(m.feature)));
    return {
      enteringKeys: new Set(activeMarkers.filter((m) => !prevKeys.has(hostFeatureKey(m.feature))).map((m) => hostFeatureKey(m.feature))),
      departingMarkers: prevMarkersRef.current.filter((m) => !curKeys.has(hostFeatureKey(m.feature))),
    };
  }, [activeMarkers]);

  useEffect(() => {
    prevMarkersRef.current = activeMarkers;
    if (departingMarkers.length > 0) {
      setLeavingMarkers(departingMarkers);
    }
  }, [activeMarkers, departingMarkers]);

  useEffect(() => {
    if (leavingMarkers.length === 0) return;
    const timer = setTimeout(() => setLeavingMarkers([]), 550);
    return () => clearTimeout(timer);
  }, [leavingMarkers]);

  const markers = useMemo(
    () =>
      activeMarkers.map((marker, index) => {
        const { feature, lat, lng } = marker;
        const pointCount = feature.properties.point_count ?? 1;
        const isCluster = feature.properties.cluster;
        const isEntering = enteringKeys.has(hostFeatureKey(feature));

        return (
          <CircleMarker
            center={[lat, lng]}
            key={`${lat}-${lng}-${feature.properties.organizer_id ?? "cluster"}-${index}`}
            eventHandlers={{
              add: isEntering
                ? (e) => {
                    const path = (e.target as any)._path as SVGElement | undefined;
                    if (path) path.classList.add("marker-entering");
                  }
                : undefined,
              click: () => {
                if (isCluster) {
                  if (!mapRef.current) {
                    return;
                  }
                  const currentZm = mapRef.current.getZoom();
                  const expansion = feature.properties.expansion_zoom ?? currentZm + 3;
                  const targetZoom = Math.min(Math.max(expansion, currentZm + 3), currentZm + 5, 15);
                  mapRef.current.setView([lat, lng], targetZoom);
                  scheduleRefresh();
                  return;
                }
                if (feature.properties.organizer_slug) {
                  router.push(`/hosts/${feature.properties.organizer_slug}`);
                }
              },
            }}
            pathOptions={{
              color: isCluster ? "#408657" : "#0f8a4a",
              fillColor: isCluster ? "#408657" : "#0f8a4a",
              fillOpacity: isCluster ? 0.5 : 1,
              opacity: isCluster ? 0.45 : 1,
              weight: isCluster ? 2 : 1,
            }}
            radius={isCluster ? Math.min(20, 8 + Math.log(pointCount) * 4) : 7}
          >
            <Tooltip>
              {isCluster
                ? t("map.tooltip.hostCluster", { count: pointCount })
                : (() => {
                    const name = feature.properties.organizer_name?.trim() || t("common.unknown");
                    const practices = (feature.properties.practice_labels ?? []).filter(Boolean);
                    if (practices.length === 0) {
                      return name;
                    }
                    return `${name} (${practices.join(", ")})`;
                  })()}
            </Tooltip>
          </CircleMarker>
        );
      }),
    [activeMarkers, enteringKeys, router, scheduleRefresh, t],
  );

  const leavingMarkerElements = useMemo(
    () =>
      leavingMarkers.map((marker, index) => {
        const { feature, lat, lng } = marker;
        const pointCount = feature.properties.point_count ?? 1;
        const isCluster = feature.properties.cluster;
        return (
          <CircleMarker
            center={[lat, lng]}
            key={`leaving-${lat}-${lng}-${index}`}
            interactive={false}
            eventHandlers={{
              add: (e) => {
                const path = (e.target as any)._path as SVGElement | undefined;
                if (path) path.classList.add("marker-leaving");
              },
            }}
            pathOptions={{
              color: isCluster ? "#408657" : "#0f8a4a",
              fillColor: isCluster ? "#408657" : "#0f8a4a",
              fillOpacity: isCluster ? 0.5 : 1,
              opacity: isCluster ? 0.45 : 1,
              weight: isCluster ? 2 : 1,
            }}
            radius={isCluster ? Math.min(20, 8 + Math.log(pointCount) * 4) : 7}
          />
        );
      }),
    [leavingMarkers],
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
          setMapReady(true);
          window.setTimeout(() => {
            mapRef.current?.invalidateSize();
            scheduleRefresh();
          }, 80);
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
        {leavingMarkerElements}
      </MapContainer>

      {status === "error" ? <div className="map-status">{t("map.status.error")}</div> : null}
    </div>
  );
}
