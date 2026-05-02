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
import {
  fetchOrganizerCard,
  getOrganizerCardCached,
  HOVER_CLOSE_DELAY_MS,
  HOVER_OPEN_DELAY_MS,
  MapHoverCard,
  type OrganizerCardData,
} from "./MapHoverCard";

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

function MapChangeWatcher({ onChange, onDismiss }: { onChange: () => void; onDismiss: () => void }) {
  useMapEvents({
    moveend: () => {
      onChange();
      onDismiss();
    },
    zoomend: () => {
      onChange();
      onDismiss();
    },
    click: (e) => {
      // On touch, the marker's click can bubble up here; if so, skip dismiss
      // so the just-opened card isn't immediately wiped. Only dismiss when the
      // tap is on the map background.
      const target = e.originalEvent.target as Element | null;
      if (target?.closest?.(".leaflet-interactive")) return;
      onDismiss();
    },
  });

  return null;
}

type HoveredHostMarker = {
  organizerId: string;
  organizerSlug: string;
  organizerName: string;
  practiceLabels: string[];
  lat: number;
  lng: number;
  markerRadius: number;
};

function isTouchPrimary(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
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
    const radiusMeters = 2000;
    for (let i = 0; i < markers.length; i += 1) {
      const angle = (2 * Math.PI * i) / markers.length;
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
  const shellRef = useRef<HTMLDivElement | null>(null);
  const requestRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRequestKeyRef = useRef<string>("");

  const [features, setFeatures] = useState<ClusterFeature[]>([]);
  const [leavingMarkers, setLeavingMarkers] = useState<MarkerDescriptor[]>([]);
  const prevMarkersRef = useRef<MarkerDescriptor[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [currentZoom, setCurrentZoom] = useState(2);
  const [mapReady, setMapReady] = useState(false);

  const [hovered, setHovered] = useState<HoveredHostMarker | null>(null);
  const [anchorPos, setAnchorPos] = useState<{ x: number; y: number } | null>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [cardData, setCardData] = useState<OrganizerCardData | null>(null);
  const [cardLoading, setCardLoading] = useState(false);
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    setIsTouch(isTouchPrimary());
  }, []);
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);

  const cancelOpenTimer = useCallback(() => {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  }, []);
  const cancelCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const dismissHoverCard = useCallback(() => {
    cancelOpenTimer();
    cancelCloseTimer();
    if (fetchAbortRef.current) {
      fetchAbortRef.current.abort();
      fetchAbortRef.current = null;
    }
    setHovered(null);
    setCardData(null);
    setCardLoading(false);
  }, [cancelCloseTimer, cancelOpenTimer]);

  const beginCloseCard = useCallback(() => {
    cancelOpenTimer();
    cancelCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      dismissHoverCard();
    }, HOVER_CLOSE_DELAY_MS);
  }, [cancelCloseTimer, cancelOpenTimer, dismissHoverCard]);

  const showCardImmediately = useCallback((marker: HoveredHostMarker) => {
    cancelOpenTimer();
    cancelCloseTimer();
    setHovered(marker);
    const cached = getOrganizerCardCached(marker.organizerId);
    if (cached) {
      setCardData(cached);
      setCardLoading(false);
      return;
    }
    setCardData(null);
    setCardLoading(true);
    if (fetchAbortRef.current) fetchAbortRef.current.abort();
    const ctrl = new AbortController();
    fetchAbortRef.current = ctrl;
    void fetchOrganizerCard(marker.organizerId, ctrl.signal)
      .then((data) => {
        if (ctrl.signal.aborted) return;
        setCardData(data);
        setCardLoading(false);
      })
      .catch(() => {
        if (ctrl.signal.aborted) return;
        setCardLoading(false);
      });
  }, [cancelCloseTimer, cancelOpenTimer]);

  const beginOpenCard = useCallback((marker: HoveredHostMarker) => {
    cancelCloseTimer();
    cancelOpenTimer();
    openTimerRef.current = window.setTimeout(() => {
      showCardImmediately(marker);
    }, HOVER_OPEN_DELAY_MS);
  }, [cancelCloseTimer, cancelOpenTimer, showCardImmediately]);

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

  useEffect(() => {
    if (!mapReady) return;
    const shell = shellRef.current;
    if (!shell || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      mapRef.current?.invalidateSize();
      setContainerSize({ width: shell.clientWidth, height: shell.clientHeight });
    });
    observer.observe(shell);
    setContainerSize({ width: shell.clientWidth, height: shell.clientHeight });
    return () => observer.disconnect();
  }, [mapReady]);

  useEffect(() => {
    if (!hovered || !mapRef.current) {
      setAnchorPos(null);
      return;
    }
    const point = mapRef.current.latLngToContainerPoint([hovered.lat, hovered.lng]);
    setAnchorPos({ x: point.x, y: point.y });
  }, [hovered]);

  useEffect(() => {
    dismissHoverCard();
  }, [queryString, dismissHoverCard]);

  useEffect(() => () => {
    cancelOpenTimer();
    cancelCloseTimer();
    if (fetchAbortRef.current) fetchAbortRef.current.abort();
  }, [cancelOpenTimer, cancelCloseTimer]);

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
              mouseover: (e) => {
                (e.target as any).setStyle({ fillOpacity: 1 });
                if (isCluster) return;
                if (!feature.properties.organizer_id || !feature.properties.organizer_slug || !feature.properties.organizer_name) return;
                beginOpenCard({
                  organizerId: feature.properties.organizer_id,
                  organizerSlug: feature.properties.organizer_slug,
                  organizerName: feature.properties.organizer_name,
                  practiceLabels: feature.properties.practice_labels ?? [],
                  lat,
                  lng,
                  markerRadius: 14,
                });
              },
              mouseout: (e) => {
                (e.target as any).setStyle({ fillOpacity: isCluster ? 0.5 : 0.8 });
                if (isCluster) return;
                beginCloseCard();
              },
              click: () => {
                if (isCluster) {
                  if (!mapRef.current) {
                    return;
                  }
                  const currentZm = mapRef.current.getZoom();
                  const expansion = feature.properties.expansion_zoom ?? currentZm + 3;
                  const targetZoom = expansion >= 13
                    ? Math.min(13, 15)
                    : Math.min(Math.max(expansion, currentZm + 3), currentZm + 5, 15);
                  mapRef.current.setView([lat, lng], targetZoom);
                  scheduleRefresh();
                  return;
                }
                if (!feature.properties.organizer_slug) return;

                if (isTouchPrimary()) {
                  // Touch: show card; the card is the link, user taps it to navigate.
                  if (feature.properties.organizer_id && feature.properties.organizer_name) {
                    showCardImmediately({
                      organizerId: feature.properties.organizer_id,
                      organizerSlug: feature.properties.organizer_slug,
                      organizerName: feature.properties.organizer_name,
                      practiceLabels: feature.properties.practice_labels ?? [],
                      lat,
                      lng,
                      markerRadius: 14,
                    });
                  }
                  return;
                }

                dismissHoverCard();
                router.push(`/hosts/${feature.properties.organizer_slug}`);
              },
            }}
            pathOptions={{
              color: isCluster ? "#408657" : "#0f8a4a",
              fillColor: isCluster ? "#408657" : "#0f8a4a",
              fillOpacity: isCluster ? 0.5 : 0.8,
              opacity: isCluster ? 0.45 : 1,
              weight: isCluster ? 2 : 1,
            }}
            radius={isCluster ? Math.max(15.4, Math.min(22, 9 + Math.log(pointCount) * 4.4)) : 14}
          >
            {isCluster && !isTouch ? (
              <Tooltip>{t("map.tooltip.hostCluster", { count: pointCount })}</Tooltip>
            ) : null}
          </CircleMarker>
        );
      }),
    [activeMarkers, beginCloseCard, beginOpenCard, dismissHoverCard, enteringKeys, isTouch, router, scheduleRefresh, showCardImmediately, t],
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
              fillOpacity: isCluster ? 0.5 : 0.8,
              opacity: isCluster ? 0.45 : 1,
              weight: isCluster ? 2 : 1,
            }}
            radius={isCluster ? Math.max(15.4, Math.min(22, 9 + Math.log(pointCount) * 4.4)) : 14}
          />
        );
      }),
    [leavingMarkers],
  );

  return (
    <div className="map-shell" ref={shellRef}>
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
          onDismiss={dismissHoverCard}
        />
        {markers}
        {leavingMarkerElements}
      </MapContainer>

      {hovered && anchorPos ? (
        <MapHoverCard
          kind="host"
          instant={{
            organizerName: hovered.organizerName,
            practiceLabels: hovered.practiceLabels,
          }}
          data={cardData}
          loading={cardLoading}
          anchor={{ x: anchorPos.x, y: anchorPos.y, markerRadius: hovered.markerRadius }}
          containerWidth={containerSize.width}
          containerHeight={containerSize.height}
          href={`/hosts/${hovered.organizerSlug}`}
          onMouseEnter={cancelCloseTimer}
          onMouseLeave={beginCloseCard}
        />
      ) : null}

      {status === "error" ? <div className="map-status">{t("map.status.error")}</div> : null}
    </div>
  );
}
