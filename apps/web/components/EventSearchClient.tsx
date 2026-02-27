"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

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
      coverImageUrl: string | null;
      attendanceMode: string;
      languages: string[];
      tags: string[];
      practiceCategoryId: string;
      practiceSubcategoryId: string | null;
      eventFormatId: string | null;
    };
    location: {
      city: string | null;
      country_code: string | null;
    } | null;
  }>;
  totalHits: number;
  pagination?: {
    page: number;
    pageSize: number;
    totalPages: number;
  };
  facets?: {
    practiceCategoryId?: Record<string, number>;
    practiceSubcategoryId?: Record<string, number>;
    eventFormatId?: Record<string, number>;
    tags?: Record<string, number>;
    languages?: Record<string, number>;
    attendanceMode?: Record<string, number>;
    countryCode?: Record<string, number>;
  };
};

type TaxonomyResponse = {
  uiLabels: {
    categorySingular?: string;
    practiceCategory?: string;
  };
  practices: {
    categories: Array<{
      id: string;
      label: string;
      subcategories: Array<{
        id: string;
        label: string;
      }>;
    }>;
  };
  eventFormats?: Array<{
    id: string;
    key: string;
    label: string;
    sort_order?: number;
  }>;
};

const LeafletClusterMap = dynamic(
  () => import("./LeafletClusterMap").then((module) => module.LeafletClusterMap),
  { ssr: false },
);

export function EventSearchClient() {
  const { locale, t } = useI18n();
  const [view, setView] = useState<"list" | "map">("list");
  const [sort, setSort] = useState<"startsAtAsc" | "startsAtDesc">("startsAtAsc");
  const [q, setQ] = useState("");
  const [practiceCategoryId, setPracticeCategoryId] = useState("");
  const [practiceSubcategoryId, setPracticeSubcategoryId] = useState("");
  const [eventFormatId, setEventFormatId] = useState("");
  const [tags, setTags] = useState("");
  const [language, setLanguage] = useState("");
  const [attendanceMode, setAttendanceMode] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [city, setCity] = useState("");
  const [page, setPage] = useState(1);
  const [taxonomy, setTaxonomy] = useState<TaxonomyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [activeQueryString, setActiveQueryString] = useState("page=1&pageSize=20");
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    fetchJson<TaxonomyResponse>("/meta/taxonomies")
      .then(setTaxonomy)
      .catch(() => {
        // Keep search usable even if taxonomy metadata fails.
      });
  }, []);

  const categorySingularLabel =
    taxonomy?.uiLabels.categorySingular ??
    taxonomy?.uiLabels.practiceCategory ??
    t("common.category");

  const categoryLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of taxonomy?.practices.categories ?? []) {
      map.set(category.id, category.label);
    }
    return map;
  }, [taxonomy]);

  const subcategoryLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of taxonomy?.practices.categories ?? []) {
      for (const subcategory of category.subcategories) {
        map.set(subcategory.id, subcategory.label);
      }
    }
    return map;
  }, [taxonomy]);

  const selectedCategory = useMemo(
    () => (taxonomy?.practices.categories ?? []).find((category) => category.id === practiceCategoryId) ?? null,
    [taxonomy, practiceCategoryId],
  );
  const hasAnySubcategories = useMemo(
    () => (taxonomy?.practices.categories ?? []).some((category) => category.subcategories.length > 0),
    [taxonomy],
  );

  const buildQueryString = useCallback((nextPage: number) => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (practiceCategoryId) params.set("practiceCategoryId", practiceCategoryId);
    if (practiceSubcategoryId) params.set("practiceSubcategoryId", practiceSubcategoryId);
    if (eventFormatId) params.set("eventFormatId", eventFormatId);
    if (tags.trim()) params.set("tags", tags.trim());
    if (language) params.set("languages", language);
    if (attendanceMode) params.set("attendanceMode", attendanceMode);
    if (countryCode.trim()) params.set("countryCode", countryCode.trim());
    if (city.trim()) params.set("city", city.trim());
    params.set("sort", sort);
    params.set("page", String(nextPage));
    params.set("pageSize", "20");
    return params.toString();
  }, [
    q,
    practiceCategoryId,
    practiceSubcategoryId,
    eventFormatId,
    tags,
    language,
    attendanceMode,
    countryCode,
    city,
    sort,
  ]);

  const runSearch = useCallback(async (nextPage = page) => {
    const currentQuery = buildQueryString(nextPage);

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
  }, [buildQueryString, page, t]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void runSearch(page);
    }, 250);

    return () => {
      clearTimeout(timer);
    };
  }, [runSearch, page]);

  function clearFilters() {
    setQ("");
    setPracticeCategoryId("");
    setPracticeSubcategoryId("");
    setEventFormatId("");
    setTags("");
    setLanguage("");
    setAttendanceMode("");
    setCountryCode("");
    setCity("");
    setPage(1);
    setSort("startsAtAsc");
  }

  const currentPage = data?.pagination?.page ?? page;
  const totalPages = data?.pagination?.totalPages ?? 1;

  return (
    <section className="grid">
      <aside className="panel filters">
        <h2 className="title-xl">{t("eventSearch.title")}</h2>
        <div className="kv">
          <button
            type="button"
            className={view === "list" ? "secondary-btn" : "ghost-btn"}
            onClick={() => setView("list")}
          >
            {t("eventSearch.view.list")}
          </button>
          <button
            type="button"
            className={view === "map" ? "secondary-btn" : "ghost-btn"}
            onClick={() => setView("map")}
          >
            {t("eventSearch.view.map")}
          </button>
        </div>
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder={t("eventSearch.placeholder.searchTitle")}
        />
        <label>
          {categorySingularLabel}
          <select
            value={practiceCategoryId}
            onChange={(event) => {
              setPracticeCategoryId(event.target.value);
              setPracticeSubcategoryId("");
            }}
          >
            <option value="">{t("common.option.selectCategory")}</option>
            {(taxonomy?.practices.categories ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </select>
        </label>
        {hasAnySubcategories && (
          <label>
            {t("common.subcategory")}
            <select
              value={practiceSubcategoryId}
              onChange={(event) => setPracticeSubcategoryId(event.target.value)}
              disabled={!selectedCategory}
            >
              <option value="">{t("eventSearch.option.selectSubcategory")}</option>
              {(selectedCategory?.subcategories ?? []).map((subcategory) => (
                <option key={subcategory.id} value={subcategory.id}>
                  {subcategory.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {(taxonomy?.eventFormats?.length ?? 0) > 0 && (
          <label>
            Event Format
            <div className="kv">
              {taxonomy?.eventFormats?.map((format) => {
                const count = data?.facets?.eventFormatId?.[format.id] ?? 0;
                const checked = eventFormatId === format.id;
                return (
                  <label className="meta" key={format.id}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setEventFormatId((current) => (current === format.id ? "" : format.id));
                        setPage(1);
                      }}
                    />
                    {format.label} ({count})
                  </label>
                );
              })}
            </div>
          </label>
        )}
        <input
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          placeholder={t("eventSearch.placeholder.tagsCsv")}
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
        <input
          value={countryCode}
          onChange={(event) => setCountryCode(event.target.value)}
          placeholder={t("eventSearch.placeholder.countryCode")}
        />
        <input
          value={city}
          onChange={(event) => setCity(event.target.value)}
          placeholder={t("eventSearch.placeholder.city")}
        />
        <div className="kv">
          <span className="meta">{t("eventSearch.sort.label")}</span>
          <button
            type="button"
            className={sort === "startsAtAsc" ? "secondary-btn" : "ghost-btn"}
            onClick={() => {
              setSort("startsAtAsc");
              setPage(1);
            }}
          >
            {t("eventSearch.sort.dateAsc")}
          </button>
          <button
            type="button"
            className={sort === "startsAtDesc" ? "secondary-btn" : "ghost-btn"}
            onClick={() => {
              setSort("startsAtDesc");
              setPage(1);
            }}
          >
            {t("eventSearch.sort.dateDesc")}
          </button>
        </div>

        <div className="kv">
          <button
            type="button"
            className="secondary-btn"
            onClick={clearFilters}
            disabled={loading}
          >
            {t("eventSearch.clearFilters")}
          </button>
        </div>
      </aside>

      <div className="panel cards">
        <div className="meta">
          {data
            ? t("eventSearch.resultsCount", { count: data.totalHits })
            : t("eventSearch.promptRun")}
        </div>
        {error && <div className="muted">{error}</div>}

        {data && (
          <div className="admin-card-actions">
            <button
              className="secondary-btn"
              type="button"
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
              disabled={loading || currentPage <= 1}
            >
              {t("common.pagination.previous")}
            </button>
            <div className="meta">
              {t("common.pagination.pageOf", { page: currentPage, totalPages })}
            </div>
            <button
              className="secondary-btn"
              type="button"
              onClick={() => setPage((prev) => prev + 1)}
              disabled={loading || currentPage >= totalPages}
            >
              {t("common.pagination.next")}
            </button>
          </div>
        )}

        {view === "map" ? (
          <LeafletClusterMap queryString={activeQueryString} refreshToken={refreshToken} />
        ) : (
          data?.hits.map((hit) => (
            <Link className="card" key={hit.occurrenceId} href={`/events/${hit.event.slug}`}>
              {hit.event.coverImageUrl && (
                <div className="event-card-thumb-shell">
                  <img
                    className="event-card-thumb"
                    src={hit.event.coverImageUrl}
                    alt={hit.event.title}
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              )}
              <h3>{hit.event.title}</h3>
              <div className="meta">
                {new Date(hit.startsAtUtc).toLocaleString(locale)} | {t(`attendanceMode.${hit.event.attendanceMode}`)}
              </div>
              <div className="meta">
                {hit.location?.city ?? t("eventSearch.locationTbd")}
                {hit.location?.country_code ? `, ${hit.location.country_code.toUpperCase()}` : ""}
              </div>
              <div className="meta">
                {categorySingularLabel}: {categoryLabelById.get(hit.event.practiceCategoryId) ?? hit.event.practiceCategoryId}
                {hit.event.practiceSubcategoryId
                  ? ` / ${subcategoryLabelById.get(hit.event.practiceSubcategoryId) ?? hit.event.practiceSubcategoryId}`
                  : ""}
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
            </Link>
          ))
        )}
      </div>
    </section>
  );
}
