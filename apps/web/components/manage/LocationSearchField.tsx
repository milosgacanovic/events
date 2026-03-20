"use client";

import { useCallback, useState } from "react";

import { authorizedGet, authorizedPost } from "../../lib/manageApi";

type GeocodeResult = {
  formatted_address: string;
  lat: number;
  lng: number;
  country_code: string | null;
  city: string | null;
};

type LocationResponse = {
  id: string;
  formatted_address: string;
  city: string | null;
  country_code: string | null;
  lat: number;
  lng: number;
};

export function LocationSearchField({
  getToken,
  onSelect,
  onClear,
  selectedLabel,
}: {
  getToken: () => Promise<string | null>;
  onSelect: (location: LocationResponse) => void;
  onClear: () => void;
  selectedLabel: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async () => {
    if (query.trim().length < 2) return;
    setLoading(true);
    try {
      const data = await authorizedGet<GeocodeResult[]>(
        getToken,
        `/admin/geocode/search?q=${encodeURIComponent(query)}&limit=8`,
      );
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [getToken, query]);

  const selectResult = useCallback(async (result: GeocodeResult) => {
    try {
      const location = await authorizedPost<LocationResponse>(
        getToken,
        "/admin/locations",
        {
          label: result.formatted_address,
          formattedAddress: result.formatted_address,
          city: result.city,
          countryCode: result.country_code,
          lat: result.lat,
          lng: result.lng,
        },
      );
      onSelect(location);
      setResults([]);
      setQuery("");
    } catch {
      // ignore
    }
  }, [getToken, onSelect]);

  if (selectedLabel) {
    return (
      <div className="kv">
        <span className="meta">{selectedLabel}</span>
        <button type="button" className="ghost-btn" onClick={onClear}>Clear</button>
      </div>
    );
  }

  return (
    <div>
      <div className="kv" style={{ gap: 8 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search location..."
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void search(); } }}
        />
        <button type="button" className="secondary-btn" onClick={() => void search()} disabled={loading}>
          {loading ? "..." : "Search"}
        </button>
      </div>
      {results.length > 0 && (
        <div className="panel" style={{ marginTop: 4 }}>
          {results.map((r, i) => (
            <button
              type="button"
              className="ghost-btn"
              key={i}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "4px 8px" }}
              onClick={() => void selectResult(r)}
            >
              {r.formatted_address}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
