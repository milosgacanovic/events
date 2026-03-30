"use client";

import { useCallback, useState } from "react";

import { useI18n } from "../i18n/I18nProvider";
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
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    try {
      const location = await authorizedPost<LocationResponse>(
        getToken,
        "/admin/locations",
        {
          label: result.formatted_address,
          formattedAddress: result.formatted_address,
          city: result.city ?? "",
          countryCode: result.country_code,
          lat: result.lat,
          lng: result.lng,
        },
      );
      onSelect(location);
      setResults([]);
      setQuery("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("manage.locationSearch.failedToCreate"));
    }
  }, [getToken, onSelect]);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("manage.locationSearch.placeholder")}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void search(); } }}
            style={{ width: "100%", paddingRight: query ? 32 : undefined }}
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(""); setResults([]); setError(null); }}
              aria-label="Clear search"
              style={{
                position: "absolute",
                right: 6,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--muted, #888)",
                fontSize: "1.1rem",
                lineHeight: 1,
                padding: "2px 4px",
              }}
            >
              &times;
            </button>
          )}
        </div>
        <button type="button" className="secondary-btn" onClick={() => void search()} disabled={loading}>
          {loading ? "..." : t("manage.locationSearch.search")}
        </button>
      </div>
      {error && (
        <p style={{ color: "var(--color-danger, #c00)", marginTop: 4, fontSize: "0.9em" }}>{error}</p>
      )}
      {results.length > 0 && (
        <div className="panel" style={{ marginTop: 4 }}>
          <div className="meta" style={{ padding: "6px 8px", fontSize: "0.8rem", borderBottom: "1px solid var(--border, #e0e0e0)" }}>
            {t("manage.locationSearch.resultsHint")}
          </div>
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
