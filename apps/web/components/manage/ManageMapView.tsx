"use client";

import "leaflet/dist/leaflet.css";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Map as LeafletMap } from "leaflet";
import {
  CircleMarker,
  MapContainer,
  TileLayer,
  Tooltip,
  useMapEvents,
} from "react-leaflet";

import { authorizedGet } from "../../lib/manageApi";

type ManageFeature = {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: {
    event_id?: string;
    event_slug?: string;
    event_title?: string;
    organizer_id?: string;
    organizer_slug?: string;
    organizer_name?: string;
    status: string;
    lat: number;
    lng: number;
  };
};

type ManageFeatureCollection = {
  type: "FeatureCollection";
  features: ManageFeature[];
};

function MapChangeWatcher({ onChange }: { onChange: () => void }) {
  useMapEvents({
    moveend: onChange,
    zoomend: onChange,
  });
  return null;
}

const STATUS_COLORS: Record<string, string> = {
  published: "#0f8a4a",
  draft: "#d97706",
  cancelled: "#888",
  archived: "#888",
};

export function ManageMapView({
  getToken,
  endpoint,
  queryString,
  entityType,
  refreshToken,
}: {
  getToken: () => Promise<string | null>;
  endpoint: string;
  queryString: string;
  entityType: "event" | "host";
  refreshToken: number;
}) {
  const router = useRouter();
  const mapRef = useRef<LeafletMap | null>(null);
  const requestRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [features, setFeatures] = useState<ManageFeature[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [mapReady, setMapReady] = useState(false);

  const tileUrl =
    process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

  const refresh = useCallback(async () => {
    if (!mapReady) return;

    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    setStatus("loading");

    try {
      const params = new URLSearchParams(queryString);
      const url = `${endpoint}${params.toString() ? `?${params.toString()}` : ""}`;
      const data = await authorizedGet<ManageFeatureCollection>(getToken, url);

      if (requestRef.current !== requestId) return;

      setFeatures(data.features ?? []);
      setStatus("idle");
    } catch {
      if (requestRef.current !== requestId) return;
      setStatus("error");
    }
  }, [mapReady, queryString, endpoint, getToken]);

  const scheduleRefresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void refresh();
    }, 250);
  }, [refresh]);

  useEffect(() => {
    if (!mapReady) return;
    void refresh();
  }, [mapReady, refresh, refreshToken]);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
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
            void refresh();
          }, 80);
        }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url={tileUrl}
        />
        <MapChangeWatcher onChange={() => scheduleRefresh()} />

        {features.map((feature, index) => {
          const lat = feature.geometry.coordinates[1];
          const lng = feature.geometry.coordinates[0];
          const props = feature.properties;
          const name =
            entityType === "event"
              ? props.event_title ?? props.event_slug ?? "?"
              : props.organizer_name ?? props.organizer_slug ?? "?";
          const color = STATUS_COLORS[props.status] ?? "#888";
          const id =
            entityType === "event" ? props.event_id : props.organizer_id;

          return (
            <CircleMarker
              key={`${id}-${index}`}
              center={[lat, lng]}
              radius={7}
              pathOptions={{
                color,
                fillColor: color,
                fillOpacity: 1,
                opacity: 1,
                weight: 1,
              }}
              eventHandlers={{
                click: () => {
                  if (entityType === "event" && props.event_id) {
                    router.push(`/manage/events/${props.event_id}`);
                  } else if (entityType === "host" && props.organizer_id) {
                    router.push(`/manage/hosts/${props.organizer_id}`);
                  }
                },
              }}
            >
              <Tooltip>
                {name} ({props.status})
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {status === "error" ? (
        <div className="map-status">Failed to load map data</div>
      ) : null}
    </div>
  );
}
