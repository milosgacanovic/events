"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchJson } from "../lib/api";
import { useI18n } from "./i18n/I18nProvider";

export type SearchResponse = {
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

export type TaxonomyResponse = {
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

export function EventSearchClient({
  initialResults,
  initialTaxonomy,
}: {
  initialResults?: SearchResponse | null;
  initialTaxonomy?: TaxonomyResponse | null;
}) {
  const { locale, t } = useI18n();
  const [view, setView] = useState<"list" | "map">("list");
  const [sort, setSort] = useState<"startsAtAsc" | "startsAtDesc">("startsAtAsc");
  const [q, setQ] = useState("");
  const [practiceCategoryId, setPracticeCategoryId] = useState("");
  const [practiceSubcategoryId, setPracticeSubcategoryId] = useState("");
  const [eventFormatId, setEventFormatId] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagQuery, setTagQuery] = useState("");
  const [tagSuggestions, setTagSuggestions] = useState<Array<{ tag: string; count: number }>>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [attendanceMode, setAttendanceMode] = useState("");
  const [countryCodes, setCountryCodes] = useState<string[]>([]);
  const [city, setCity] = useState("");
  const [citySuggestions, setCitySuggestions] = useState<Array<{ city: string; count: number }>>([]);
  const [showMoreCategories, setShowMoreCategories] = useState(false);
  const [page, setPage] = useState(1);
  const [taxonomy, setTaxonomy] = useState<TaxonomyResponse | null>(initialTaxonomy ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SearchResponse | null>(initialResults ?? null);
  const [activeQueryString, setActiveQueryString] = useState("page=1&pageSize=20");
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (initialTaxonomy) {
      return;
    }

    fetchJson<TaxonomyResponse>("/meta/taxonomies")
      .then(setTaxonomy)
      .catch(() => {
        // Keep search usable even if taxonomy metadata fails.
      });
  }, [initialTaxonomy]);

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
    if (tags.length) params.set("tags", tags.join(","));
    if (languages.length) params.set("languages", languages.join(","));
    if (attendanceMode) params.set("attendanceMode", attendanceMode);
    if (countryCodes.length) params.set("countryCode", countryCodes[0]);
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
    languages,
    attendanceMode,
    countryCodes,
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
    setTags([]);
    setTagQuery("");
    setLanguages([]);
    setAttendanceMode("");
    setCountryCodes([]);
    setCity("");
    setPage(1);
    setSort("startsAtAsc");
  }

  const currentPage = data?.pagination?.page ?? page;
  const totalPages = data?.pagination?.totalPages ?? 1;

  useEffect(() => {
    const params = new URLSearchParams();
    if (countryCodes[0]) {
      params.set("countryCode", countryCodes[0]);
    }
    if (city.trim()) {
      params.set("q", city.trim());
    }
    params.set("limit", "20");
    void fetchJson<{ items: Array<{ city: string; count: number }> }>(`/meta/cities?${params.toString()}`)
      .then((payload) => setCitySuggestions(payload.items ?? []))
      .catch(() => setCitySuggestions([]));
  }, [city, countryCodes]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (tagQuery.trim()) {
      params.set("q", tagQuery.trim());
    }
    params.set("limit", "20");
    void fetchJson<{ items: Array<{ tag: string; count: number }> }>(`/meta/tags?${params.toString()}`)
      .then((payload) => setTagSuggestions(payload.items ?? []))
      .catch(() => setTagSuggestions([]));
  }, [tagQuery]);

  const visibleCategories = useMemo(() => {
    const categories = taxonomy?.practices.categories ?? [];
    return showMoreCategories ? categories : categories.slice(0, 8);
  }, [showMoreCategories, taxonomy]);

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
        <div>
          <div className="meta">{categorySingularLabel}</div>
          <div className="kv">
            {visibleCategories.map((category) => {
              const checked = practiceCategoryId === category.id;
              const count = data?.facets?.practiceCategoryId?.[category.id] ?? 0;
              return (
                <label className="meta" key={category.id}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      setPracticeCategoryId((current) => (current === category.id ? "" : category.id));
                      setPracticeSubcategoryId("");
                      setPage(1);
                    }}
                  />
                  {category.label} ({count})
                </label>
              );
            })}
          </div>
          {(taxonomy?.practices.categories.length ?? 0) > 8 && (
            <button
              type="button"
              className="ghost-btn"
              onClick={() => setShowMoreCategories((current) => !current)}
            >
              {showMoreCategories ? t("eventSearch.showLess") : t("eventSearch.showMore")}
            </button>
          )}
        </div>
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
            {t("eventSearch.eventFormat")}
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
        <label>
          {t("eventSearch.eventLanguage")}
          <div className="kv">
            {Object.entries(data?.facets?.languages ?? {}).map(([value, count]) => (
              <label className="meta" key={value}>
                <input
                  type="checkbox"
                  checked={languages.includes(value)}
                  onChange={() => {
                    setLanguages((current) => (
                      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
                    ));
                    setPage(1);
                  }}
                />
                {value} ({count})
              </label>
            ))}
          </div>
        </label>
        <select value={attendanceMode} onChange={(event) => setAttendanceMode(event.target.value)}>
          <option value="">{t("eventSearch.attendance.anyEventType")}</option>
          <option value="in_person">{t("eventSearch.attendance.in_person")}</option>
          <option value="online">{t("eventSearch.attendance.online")}</option>
          <option value="hybrid">{t("eventSearch.attendance.hybrid")}</option>
        </select>
        <label>
          {t("eventSearch.country")}
          <div className="kv">
            {Object.entries(data?.facets?.countryCode ?? {}).map(([value, count]) => (
              <label className="meta" key={value}>
                <input
                  type="checkbox"
                  checked={countryCodes.includes(value)}
                  onChange={() => {
                    setCountryCodes((current) => (
                      current.includes(value) ? current.filter((item) => item !== value) : [value]
                    ));
                    setPage(1);
                  }}
                />
                {value.toUpperCase()} ({count})
              </label>
            ))}
          </div>
        </label>
        <input
          list="event-city-suggestions"
          value={city}
          onChange={(event) => setCity(event.target.value)}
          placeholder={t("eventSearch.placeholder.city")}
        />
        <datalist id="event-city-suggestions">
          {citySuggestions.map((item) => (
            <option key={item.city} value={item.city}>
              {item.city} ({item.count})
            </option>
          ))}
        </datalist>
        <input
          list="event-tag-suggestions"
          value={tagQuery}
          onFocus={() => setTagQuery("")}
          onChange={(event) => setTagQuery(event.target.value)}
          placeholder={t("eventSearch.tags")}
        />
        <datalist id="event-tag-suggestions">
          {tagSuggestions.map((item) => (
            <option key={item.tag} value={item.tag}>
              {item.tag} ({item.count})
            </option>
          ))}
        </datalist>
        {tagQuery.trim() && (
          <button
            type="button"
            className="secondary-btn"
            onClick={() => {
              const value = tagQuery.trim().toLowerCase();
              if (value && !tags.includes(value)) {
                setTags((current) => [...current, value]);
              }
              setTagQuery("");
              setPage(1);
            }}
          >
            {t("common.action.addTag")}
          </button>
        )}
        {tags.length > 0 && (
          <div className="kv">
            {tags.map((item) => (
              <button
                className="tag"
                key={item}
                type="button"
                onClick={() => {
                  setTags((current) => current.filter((tag) => tag !== item));
                  setPage(1);
                }}
              >
                {item} ×
              </button>
            ))}
          </div>
        )}
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
