"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";

import { fetchJson } from "../lib/api";
import { useI18n } from "./i18n/I18nProvider";

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

const LeafletClusterMap = dynamic(
  () => import("./LeafletClusterMap").then((module) => module.LeafletClusterMap),
  { ssr: false },
);

export function EventSearchClient() {
  const { locale, t } = useI18n();
  const [view, setView] = useState<"list" | "map">("list");
  const [q, setQ] = useState("");
  const [language, setLanguage] = useState("");
  const [attendanceMode, setAttendanceMode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [activeQueryString, setActiveQueryString] = useState("page=1&pageSize=20");
  const [refreshToken, setRefreshToken] = useState(0);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (language) params.set("languages", language);
    if (attendanceMode) params.set("attendanceMode", attendanceMode);
    params.set("page", "1");
    params.set("pageSize", "20");
    return params.toString();
  }, [q, language, attendanceMode]);

  async function runSearch() {
    const currentQuery = queryString;

    setLoading(true);
    setError(null);

    try {
      const result = await fetchJson<SearchResponse>(`/events/search?${currentQuery}`);
      setData(result);
      setActiveQueryString(currentQuery);
      setRefreshToken((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("eventSearch.error.searchFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="grid">
      <aside className="panel filters">
        <h2 className="title-xl">{t("eventSearch.title")}</h2>
        <select value={view} onChange={(event) => setView(event.target.value as "list" | "map")}
        >
          <option value="list">{t("eventSearch.view.list")}</option>
          <option value="map">{t("eventSearch.view.map")}</option>
        </select>
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder={t("eventSearch.placeholder.searchTitle")}
        />
        <input
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
          placeholder={t("eventSearch.placeholder.languageCode")}
        />
        <select value={attendanceMode} onChange={(event) => setAttendanceMode(event.target.value)}>
          <option value="">{t("eventSearch.attendance.any")}</option>
          <option value="in_person">{t("eventSearch.attendance.in_person")}</option>
          <option value="online">{t("eventSearch.attendance.online")}</option>
          <option value="hybrid">{t("eventSearch.attendance.hybrid")}</option>
        </select>
        <button type="button" onClick={runSearch} disabled={loading}>
          {loading ? t("eventSearch.searching") : t("eventSearch.search")}
        </button>
        {data?.facets?.languages && (
          <div className="muted">
            {t("eventSearch.languagesFacet", {
              values: Object.keys(data.facets.languages).join(", "),
            })}
          </div>
        )}
      </aside>

      <div className="panel cards">
        <div className="meta">
          {data
            ? t("eventSearch.resultsCount", { count: data.totalHits })
            : t("eventSearch.promptRun")}
        </div>
        {error && <div className="muted">{error}</div>}

        {view === "map" ? (
          <LeafletClusterMap queryString={activeQueryString} refreshToken={refreshToken} />
        ) : (
          data?.hits.map((hit) => (
            <article className="card" key={hit.occurrenceId}>
              <h3>
                <Link href={`/events/${hit.event.slug}`}>{hit.event.title}</Link>
              </h3>
              <div className="meta">
                {new Date(hit.startsAtUtc).toLocaleString(locale)} | {t(`attendanceMode.${hit.event.attendanceMode}`)}
              </div>
              <div className="meta">
                {hit.location?.city ?? t("eventSearch.locationTbd")}
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
