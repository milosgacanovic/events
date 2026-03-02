"use client";

import "leaflet/dist/leaflet.css";

import { icon } from "leaflet";
import { MapContainer, Marker, TileLayer } from "react-leaflet";

export function EventDetailMap({
  lat,
  lng,
}: {
  lat: number;
  lng: number;
}) {
  const markerIcon = icon({
    iconRetinaUrl: "/leaflet/marker-icon-2x.png",
    iconUrl: "/leaflet/marker-icon.png",
    shadowUrl: "/leaflet/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    tooltipAnchor: [16, -28],
    shadowSize: [41, 41],
  });

  const tileUrl =
    process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

  return (
    <div className="map-shell">
      <MapContainer
        center={[lat, lng]}
        zoom={13}
        scrollWheelZoom
        className="leaflet-map"
        style={{ height: 320 }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url={tileUrl}
        />
        <Marker position={[lat, lng]} icon={markerIcon} />
      </MapContainer>
    </div>
  );
}
