"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchJson } from "./api";

const GEO_CACHE_KEY = "dr-geolocation";
const GEO_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

type GeoStatus = "idle" | "detecting" | "ready" | "denied" | "unavailable" | "no_events";

export type GeoState = {
  status: GeoStatus;
  city: string | null;
  countryCode: string | null;
  filterMode: "city" | "country" | null;
  lat: number | null;
  lng: number | null;
  eventCount: number;
};

type CachedGeo = {
  city: string;
  countryCode: string;
  filterMode: "city" | "country";
  lat: number;
  lng: number;
  ts: number;
  eventCount: number;
};

async function reverseGeocode(lat: number, lon: number): Promise<{ city: string | null; countryCode: string } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=jsonv2&zoom=10`;
    console.log("[geo] reverse geocoding", { lat, lon, url });
    const response = await fetch(url, { headers: { "Accept-Language": "en" } });
    if (!response.ok) {
      console.warn("[geo] Nominatim error", response.status);
      return null;
    }
    const data = await response.json() as {
      address?: { city?: string; town?: string; village?: string; county?: string; state?: string; country_code?: string };
    };
    console.log("[geo] Nominatim response address", data.address);
    let city = data.address?.city ?? data.address?.town ?? data.address?.village ?? null;
    if (!city || city.includes("Municipality") || city.includes("District")) {
      const county = data.address?.county;
      if (county) {
        city = county.replace(/^City of\s+/i, "").replace(/\s+(District|Municipality)$/i, "");
        console.log("[geo] using county as city fallback:", city);
      }
    }
    if (!city) {
      city = data.address?.state ?? null;
    }
    const countryCode = data.address?.country_code?.toUpperCase() ?? null;
    if (!countryCode) {
      console.warn("[geo] could not extract countryCode from", data.address);
      return null;
    }
    return { city, countryCode };
  } catch (err) {
    console.error("[geo] reverseGeocode failed", err);
    return null;
  }
}

async function checkEventCount(params: { city?: string; countryCode: string }): Promise<number> {
  try {
    const qs = new URLSearchParams({
      countryCode: params.countryCode.toLowerCase(),
      pageSize: "1",
      page: "1",
    });
    if (params.city) qs.set("city", params.city);
    const result = await fetchJson<{ totalHits: number }>(`/events/search?${qs.toString()}`);
    return result.totalHits;
  } catch {
    return 0;
  }
}

export function useGeolocation(): GeoState & { detect: () => void } {
  const [state, setState] = useState<GeoState>({
    status: "idle",
    city: null,
    countryCode: null,
    filterMode: null,
    lat: null,
    lng: null,
    eventCount: 0,
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(GEO_CACHE_KEY);
      if (!raw) return;
      const cached = JSON.parse(raw) as CachedGeo;
      if (Date.now() - cached.ts > GEO_CACHE_TTL) {
        localStorage.removeItem(GEO_CACHE_KEY);
        return;
      }
      if (cached.eventCount > 0) {
        setState({
          status: "ready",
          city: cached.city,
          countryCode: cached.countryCode,
          filterMode: cached.filterMode,
          lat: cached.lat,
          lng: cached.lng,
          eventCount: cached.eventCount,
        });
      }
    } catch { /* ignore */ }
  }, []);

  const detect = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setState((s) => ({ ...s, status: "unavailable" }));
      return;
    }
    setState((s) => ({ ...s, status: "detecting" }));
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        console.log("[geo] position obtained", { latitude, longitude });
        const geo = await reverseGeocode(latitude, longitude);
        if (!geo) {
          console.warn("[geo] reverse geocode returned null");
          setState((s) => ({ ...s, status: "no_events" }));
          return;
        }
        // Try city-level search first
        let filterMode: "city" | "country" = "country";
        let eventCount = 0;
        if (geo.city) {
          eventCount = await checkEventCount({ city: geo.city, countryCode: geo.countryCode });
          console.log("[geo] city search:", geo.city, "→", eventCount, "events");
          if (eventCount > 0) {
            filterMode = "city";
          }
        }
        // Fallback to country
        if (eventCount === 0) {
          eventCount = await checkEventCount({ countryCode: geo.countryCode });
          console.log("[geo] country search:", geo.countryCode, "→", eventCount, "events");
          filterMode = "country";
        }
        if (eventCount === 0) {
          setState((s) => ({ ...s, status: "no_events", city: geo.city, countryCode: geo.countryCode, lat: latitude, lng: longitude }));
          return;
        }
        const newState: GeoState = {
          status: "ready",
          city: geo.city,
          countryCode: geo.countryCode,
          filterMode,
          lat: latitude,
          lng: longitude,
          eventCount,
        };
        setState(newState);
        try {
          localStorage.setItem(GEO_CACHE_KEY, JSON.stringify({
            ...geo, filterMode, lat: latitude, lng: longitude, ts: Date.now(), eventCount,
          }));
        } catch { /* ignore */ }
      },
      (err) => {
        console.warn("[geo] geolocation error", err.code, err.message);
        setState((s) => ({ ...s, status: err.code === err.PERMISSION_DENIED ? "denied" : "idle" }));
      },
      { timeout: 10000 },
    );
  }, []);

  return { ...state, detect };
}
