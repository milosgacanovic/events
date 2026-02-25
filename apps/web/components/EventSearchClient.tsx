"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { fetchJson } from "../lib/api";

type SearchResponse = {
  hits: Array<{
    occurrenceId: string;
    startsAtUtc: string;
    endsAtUtc: string;
    event: {
      id: string;
      slug: string;
      title: string;
      attendanceMode: string;
      languages: string[];
      tags: string[];
    };
    location: {
      city: string | null;
      country_code: string | null;
    } | null;
  }>;
  totalHits: number;
  facets?: {
    languages?: Record<string, number>;
    attendanceMode?: Record<string, number>;
  };
};

export function EventSearchClient() {
  const [view, setView] = useState<"list" | "map">("list");
  const [q, setQ] = useState("");
  const [language, setLanguage] = useState("");
  const [attendanceMode, setAttendanceMode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SearchResponse | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (language) params.set("languages", language);
    if (attendanceMode) params.set("attendanceMode", attendanceMode);
    params.set("page", "1");
    params.set("pageSize", "20");
    return params.toString();
  }, [q, language, attendanceMode]);

  const [clusterSummary, setClusterSummary] = useState<string>("");

  async function runSearch() {
    setLoading(true);
    setError(null);

    try {
      const result = await fetchJson<SearchResponse>(`/events/search?${queryString}`);
      setData(result);

      if (view === "map") {
        const clusters = await fetchJson<{
          type: "FeatureCollection";
          features: Array<{ properties?: { cluster?: boolean; point_count?: number } }>;
        }>(
          `/map/clusters?${queryString}&bbox=-180,-85,180,85&zoom=2`,
        );
        const clusterCount = clusters.features.filter((feature) => feature.properties?.cluster).length;
        const pointCount = clusters.features.reduce((sum, feature) => {
          if (feature.properties?.cluster) {
            return sum + (feature.properties.point_count ?? 0);
          }
          return sum + 1;
        }, 0);
        setClusterSummary(`Clusters: ${clusterCount}, represented points: ${pointCount}`);
      } else {
        setClusterSummary("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="grid">
      <aside className="panel filters">
        <h2 className="title-xl">Find Events</h2>
        <select value={view} onChange={(event) => setView(event.target.value as "list" | "map")}>
          <option value="list">List view</option>
          <option value="map">Map view</option>
        </select>
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search by title"
        />
        <input
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
          placeholder="Language code (e.g. en)"
        />
        <select value={attendanceMode} onChange={(event) => setAttendanceMode(event.target.value)}>
          <option value="">Any modality</option>
          <option value="in_person">In person</option>
          <option value="online">Online</option>
          <option value="hybrid">Hybrid</option>
        </select>
        <button type="button" onClick={runSearch} disabled={loading}>
          {loading ? "Searching..." : "Search"}
        </button>
        {data?.facets?.languages && (
          <div className="muted">Languages facet values: {Object.keys(data.facets.languages).join(", ")}</div>
        )}
      </aside>

      <div className="panel cards">
        <div className="meta">
          {data ? `${data.totalHits} results` : "Run a search to load events."}
        </div>
        {error && <div className="muted">{error}</div>}
        {view === "map" ? (
          <div className="mapbox">{clusterSummary || "Run search to load clustered map summary."}</div>
        ) : (
          data?.hits.map((hit) => (
            <article className="card" key={hit.occurrenceId}>
              <h3>
                <Link href={`/events/${hit.event.slug}`}>{hit.event.title}</Link>
              </h3>
              <div className="meta">
                {new Date(hit.startsAtUtc).toLocaleString()} | {hit.event.attendanceMode}
              </div>
              <div className="meta">
                {hit.location?.city ?? "Location TBD"}
                {hit.location?.country_code ? `, ${hit.location.country_code.toUpperCase()}` : ""}
              </div>
              <div className="kv">
                {hit.event.languages.map((item) => (
                  <span className="tag" key={item}>
                    {item}
                  </span>
                ))}
                {hit.event.tags.map((item) => (
                  <span className="tag" key={item}>
                    {item}
                  </span>
                ))}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
