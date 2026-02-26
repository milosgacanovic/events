"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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
      practiceCategoryId: string;
      practiceSubcategoryId: string | null;
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
};

function topFacetEntries(values: Record<string, number> | undefined, limit = 8): Array<[string, number]> {
  if (!values) {
    return [];
  }

  return Object.entries(values)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

const LeafletClusterMap = dynamic(
  () => import("./LeafletClusterMap").then((module) => module.LeafletClusterMap),
  { ssr: false },
);

export function EventSearchClient() {
  const { locale, t } = useI18n();
  const [view, setView] = useState<"list" | "map">("list");
  const [sort, setSort] = useState<"startsAtAsc" | "publishedAtDesc">("startsAtAsc");
  const [q, setQ] = useState("");
  const [practiceCategoryId, setPracticeCategoryId] = useState("");
  const [practiceSubcategoryId, setPracticeSubcategoryId] = useState("");
  const [tags, setTags] = useState("");
  const [language, setLanguage] = useState("");
  const [attendanceMode, setAttendanceMode] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [city, setCity] = useState("");
  const [hasGeo, setHasGeo] = useState<"" | "true" | "false">("");
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

  const subcategoryParentById = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of taxonomy?.practices.categories ?? []) {
      for (const subcategory of category.subcategories) {
        map.set(subcategory.id, category.id);
      }
    }
    return map;
  }, [taxonomy]);

  const selectedCategory = useMemo(
    () => (taxonomy?.practices.categories ?? []).find((category) => category.id === practiceCategoryId) ?? null,
    [taxonomy, practiceCategoryId],
  );

  function buildQueryString(nextPage: number) {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (practiceCategoryId) params.set("practiceCategoryId", practiceCategoryId);
    if (practiceSubcategoryId) params.set("practiceSubcategoryId", practiceSubcategoryId);
    if (tags.trim()) params.set("tags", tags.trim());
    if (language) params.set("languages", language);
    if (attendanceMode) params.set("attendanceMode", attendanceMode);
    if (countryCode.trim()) params.set("countryCode", countryCode.trim());
    if (city.trim()) params.set("city", city.trim());
    if (hasGeo) params.set("hasGeo", hasGeo);
    params.set("sort", sort);
    params.set("page", String(nextPage));
    params.set("pageSize", "20");
    return params.toString();
  }

  async function runSearch(nextPage = page) {
    const currentQuery = buildQueryString(nextPage);

    setLoading(true);
    setError(null);

    try {
      const result = await fetchJson<SearchResponse>(`/events/search?${currentQuery}`);
      setData(result);
      setActiveQueryString(currentQuery);
      setRefreshToken((value) => value + 1);
      setPage(nextPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("eventSearch.error.searchFailed"));
    } finally {
      setLoading(false);
    }
  }

  function clearFilters() {
    setQ("");
    setPracticeCategoryId("");
    setPracticeSubcategoryId("");
    setTags("");
    setLanguage("");
    setAttendanceMode("");
    setCountryCode("");
    setCity("");
    setHasGeo("");
    setPage(1);
    setSort("startsAtAsc");
  }

  const currentPage = data?.pagination?.page ?? page;
  const totalPages = data?.pagination?.totalPages ?? 1;

  return (
    <section className="grid">
      <aside className="panel filters">
        <h2 className="title-xl">{t("eventSearch.title")}</h2>
        <select
          value={view}
          onChange={(event) => setView(event.target.value as "list" | "map")}
        >
          <option value="list">{t("eventSearch.view.list")}</option>
          <option value="map">{t("eventSearch.view.map")}</option>
        </select>
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
        <select
          value={hasGeo}
          onChange={(event) => setHasGeo(event.target.value as "" | "true" | "false")}
        >
          <option value="">{t("eventSearch.hasGeo.any")}</option>
          <option value="true">{t("eventSearch.hasGeo.with")}</option>
          <option value="false">{t("eventSearch.hasGeo.without")}</option>
        </select>
        <label>
          {t("eventSearch.sort.label")}
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as "startsAtAsc" | "publishedAtDesc")}
          >
            <option value="startsAtAsc">{t("eventSearch.sort.soonestUpcoming")}</option>
            <option value="publishedAtDesc">{t("eventSearch.sort.newestPublished")}</option>
          </select>
        </label>

        <div className="kv">
          <button type="button" onClick={() => void runSearch(1)} disabled={loading}>
            {loading ? t("eventSearch.searching") : t("eventSearch.search")}
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={clearFilters}
            disabled={loading}
          >
            {t("eventSearch.clearFilters")}
          </button>
        </div>

        {data?.facets && (
          <div className="kv">
            {topFacetEntries(data.facets.practiceCategoryId).map(([categoryId, count]) => (
              <button
                className="tag"
                type="button"
                key={`category-${categoryId}`}
                onClick={() => {
                  setPracticeCategoryId(categoryId);
                  setPracticeSubcategoryId("");
                }}
              >
                {categoryLabelById.get(categoryId) ?? categoryId} ({count})
              </button>
            ))}
            {topFacetEntries(data.facets.practiceSubcategoryId).map(([subcategoryId, count]) => (
              <button
                className="tag"
                type="button"
                key={`subcategory-${subcategoryId}`}
                onClick={() => {
                  setPracticeSubcategoryId(subcategoryId);
                  const parentCategoryId = subcategoryParentById.get(subcategoryId);
                  if (parentCategoryId) {
                    setPracticeCategoryId(parentCategoryId);
                  }
                }}
              >
                {subcategoryLabelById.get(subcategoryId) ?? subcategoryId} ({count})
              </button>
            ))}
            {topFacetEntries(data.facets.languages).map(([value, count]) => (
              <button className="tag" type="button" key={`lang-${value}`} onClick={() => setLanguage(value)}>
                {value} ({count})
              </button>
            ))}
            {topFacetEntries(data.facets.attendanceMode).map(([value, count]) => (
              <button
                className="tag"
                type="button"
                key={`attendance-${value}`}
                onClick={() => setAttendanceMode(value)}
              >
                {t(`attendanceMode.${value}`)} ({count})
              </button>
            ))}
            {topFacetEntries(data.facets.countryCode).map(([value, count]) => (
              <button className="tag" type="button" key={`country-${value}`} onClick={() => setCountryCode(value)}>
                {value.toUpperCase()} ({count})
              </button>
            ))}
            {topFacetEntries(data.facets.tags).map(([value, count]) => (
              <button className="tag" type="button" key={`tag-${value}`} onClick={() => setTags(value)}>
                {value} ({count})
              </button>
            ))}
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

        {data && (
          <div className="admin-card-actions">
            <button
              className="secondary-btn"
              type="button"
              onClick={() => void runSearch(currentPage - 1)}
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
              onClick={() => void runSearch(currentPage + 1)}
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
            </article>
          ))
        )}
      </div>
    </section>
  );
}
