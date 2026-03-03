"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchJson } from "../lib/api";
import { formatDateTimeRange, type TimeDisplayMode } from "../lib/datetime";
import { labelForLanguageCode } from "../lib/i18n/languageLabels";
import { getUserTimeZone, readTimeDisplayMode, writeTimeDisplayMode } from "../lib/timeDisplay";
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
      eventTimezone?: string;
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
    organizers?: Array<{
      id: string;
      name: string;
      roles?: string[];
    }>;
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
      key?: string;
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

export type EventSearchInitialQuery = {
  q?: string;
  practiceCategoryIds?: string[];
  practiceSubcategoryId?: string;
  eventFormatIds?: string[];
  tags?: string[];
  languages?: string[];
  attendanceMode?: string;
  countryCodes?: string[];
  cities?: string[];
  sort?: "startsAtAsc" | "startsAtDesc";
  view?: "list" | "map";
  page?: number;
};

const LeafletClusterMap = dynamic(
  () => import("./LeafletClusterMap").then((module) => module.LeafletClusterMap),
  { ssr: false },
);

function mergeFacetRecord(
  current: Record<string, number> | undefined,
  incoming: Record<string, number> | undefined,
): Record<string, number> {
  const merged: Record<string, number> = { ...(current ?? {}) };
  for (const [key, count] of Object.entries(incoming ?? {})) {
    merged[key] = Math.max(merged[key] ?? 0, count);
  }
  return merged;
}

export function EventSearchClient({
  initialResults,
  initialTaxonomy,
  initialQuery,
}: {
  initialResults?: SearchResponse | null;
  initialTaxonomy?: TaxonomyResponse | null;
  initialQuery?: EventSearchInitialQuery;
}) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [view, setView] = useState<"list" | "map">(initialQuery?.view ?? "list");
  const [sort, setSort] = useState<"startsAtAsc" | "startsAtDesc">(initialQuery?.sort ?? "startsAtAsc");
  const [q, setQ] = useState(initialQuery?.q ?? "");
  const [practiceCategoryIds, setPracticeCategoryIds] = useState(initialQuery?.practiceCategoryIds ?? []);
  const [practiceSubcategoryId, setPracticeSubcategoryId] = useState(initialQuery?.practiceSubcategoryId ?? "");
  const [eventFormatIds, setEventFormatIds] = useState(initialQuery?.eventFormatIds ?? []);
  const [tags, setTags] = useState<string[]>(initialQuery?.tags ?? []);
  const [tagQuery, setTagQuery] = useState("");
  const [tagSuggestions, setTagSuggestions] = useState<Array<{ tag: string; count: number }>>([]);
  const [languages, setLanguages] = useState<string[]>(initialQuery?.languages ?? []);
  const [attendanceMode, setAttendanceMode] = useState(initialQuery?.attendanceMode ?? "");
  const [countryCodes, setCountryCodes] = useState<string[]>(
    (initialQuery?.countryCodes ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean),
  );
  const [cities, setCities] = useState<string[]>(initialQuery?.cities ?? []);
  const [cityQuery, setCityQuery] = useState("");
  const [citySuggestions, setCitySuggestions] = useState<Array<{ city: string; count: number }>>([]);
  const [showMoreCategories, setShowMoreCategories] = useState(false);
  const [page, setPage] = useState<number>(initialQuery?.page ?? 1);
  const [taxonomy, setTaxonomy] = useState<TaxonomyResponse | null>(initialTaxonomy ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SearchResponse | null>(initialResults ?? null);
  const [practiceFacetCounts, setPracticeFacetCounts] = useState<Record<string, number>>(
    initialResults?.facets?.practiceCategoryId ?? {},
  );
  const [facetBaseline, setFacetBaseline] = useState<NonNullable<SearchResponse["facets"]>>(initialResults?.facets ?? {});
  const [activeQueryString, setActiveQueryString] = useState("page=1&pageSize=20");
  const [refreshToken, setRefreshToken] = useState(0);
  const [timeDisplayMode, setTimeDisplayMode] = useState<TimeDisplayMode>("user");
  const restoredKeyRef = useRef<string | null>(null);
  const userTimeZone = useMemo(() => getUserTimeZone(), []);

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
  const categoryKeyById = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of taxonomy?.practices.categories ?? []) {
      map.set(category.id, category.key ?? category.id);
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
  const eventFormatKeyById = useMemo(() => {
    const map = new Map<string, string>();
    for (const format of taxonomy?.eventFormats ?? []) {
      map.set(format.id, format.key);
    }
    return map;
  }, [taxonomy]);

  const selectedCategory = useMemo(
    () =>
      practiceCategoryIds.length === 1
        ? (taxonomy?.practices.categories ?? []).find((category) => category.id === practiceCategoryIds[0]) ?? null
        : null,
    [taxonomy, practiceCategoryIds],
  );
  const hasAnySubcategories = useMemo(
    () => (taxonomy?.practices.categories ?? []).some((category) => category.subcategories.length > 0),
    [taxonomy],
  );
  const languageNames = useMemo(() => {
    try {
      return new Intl.DisplayNames([locale], { type: "language" });
    } catch {
      return null;
    }
  }, [locale]);
  const regionNames = useMemo(() => {
    try {
      return new Intl.DisplayNames([locale], { type: "region" });
    } catch {
      return null;
    }
  }, [locale]);
  const getLanguageLabel = useCallback(
    (value: string) => labelForLanguageCode(value, languageNames),
    [languageNames],
  );
  const getCountryLabel = useCallback((value: string) => {
    const normalized = value.trim().toUpperCase();
    const localized = regionNames?.of(normalized);
    return localized && localized !== normalized ? localized : normalized;
  }, [regionNames]);
  const visibleCountryFacets = useMemo(() => {
    const selectedSet = new Set(countryCodes.map((value) => value.trim().toLowerCase()));
    const merged = new Map<string, number>();

    for (const [key, value] of Object.entries(facetBaseline.countryCode ?? {})) {
      const normalized = key.trim().toLowerCase();
      if (!normalized) {
        continue;
      }
      if (value > 0 || selectedSet.has(normalized)) {
        merged.set(normalized, value);
      }
    }

    for (const [key, value] of Object.entries(data?.facets?.countryCode ?? {})) {
      const normalized = key.trim().toLowerCase();
      if (!normalized) {
        continue;
      }
      if (value > 0 || selectedSet.has(normalized)) {
        merged.set(normalized, value);
      }
    }

    for (const selected of selectedSet) {
      if (!merged.has(selected)) {
        merged.set(selected, 0);
      }
    }

    return Array.from(merged.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, count }));
  }, [countryCodes, data?.facets?.countryCode, facetBaseline.countryCode]);

  const buildQueryString = useCallback((nextPage: number) => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (practiceCategoryIds.length) params.set("practiceCategoryId", practiceCategoryIds.join(","));
    if (practiceSubcategoryId) params.set("practiceSubcategoryId", practiceSubcategoryId);
    if (eventFormatIds.length) params.set("eventFormatId", eventFormatIds.join(","));
    if (tags.length) params.set("tags", tags.join(","));
    if (languages.length) params.set("languages", languages.join(","));
    if (attendanceMode) params.set("attendanceMode", attendanceMode);
    if (countryCodes.length) params.set("countryCode", countryCodes.join(","));
    if (cities.length) params.set("city", cities.join(","));
    params.set("sort", sort);
    params.set("page", String(nextPage));
    params.set("pageSize", "20");
    return params.toString();
  }, [
    q,
    practiceCategoryIds,
    practiceSubcategoryId,
    eventFormatIds,
    tags,
    languages,
    attendanceMode,
    countryCodes,
    cities,
    sort,
  ]);

  const buildUiQueryString = useCallback(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (practiceCategoryIds.length) {
      const practiceKeys = practiceCategoryIds.map((id) => categoryKeyById.get(id) ?? id);
      params.set("practice", practiceKeys.join(","));
    }
    if (practiceSubcategoryId) params.set("practiceSubcategoryId", practiceSubcategoryId);
    if (eventFormatIds.length) {
      const formatKeys = eventFormatIds.map((id) => eventFormatKeyById.get(id) ?? id);
      params.set("format", formatKeys.join(","));
    }
    if (tags.length) params.set("tags", tags.join(","));
    if (languages.length) params.set("languages", languages.join(","));
    if (attendanceMode) params.set("attendanceMode", attendanceMode);
    if (countryCodes.length) params.set("countryCode", countryCodes.join(","));
    if (cities.length) params.set("city", cities.join(","));
    if (sort !== "startsAtAsc") params.set("sort", sort);
    if (view !== "list") params.set("view", view);
    if (page > 1) params.set("page", String(page));
    return params.toString();
  }, [
    q,
    practiceCategoryIds,
    practiceSubcategoryId,
    eventFormatIds,
    tags,
    languages,
    attendanceMode,
    countryCodes,
    cities,
    sort,
    view,
    page,
    categoryKeyById,
    eventFormatKeyById,
  ]);

  const buildPracticeFacetQueryString = useCallback(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (eventFormatIds.length) params.set("eventFormatId", eventFormatIds.join(","));
    if (tags.length) params.set("tags", tags.join(","));
    if (languages.length) params.set("languages", languages.join(","));
    if (attendanceMode) params.set("attendanceMode", attendanceMode);
    if (countryCodes.length) params.set("countryCode", countryCodes.join(","));
    if (cities.length) params.set("city", cities.join(","));
    params.set("sort", sort);
    params.set("page", "1");
    params.set("pageSize", "1");
    return params.toString();
  }, [
    q,
    eventFormatIds,
    tags,
    languages,
    attendanceMode,
    countryCodes,
    cities,
    sort,
  ]);

  const scrollStorageKey = useMemo(() => {
    const query = buildUiQueryString();
    return `search-scroll:${pathname}${query ? `?${query}` : ""}`;
  }, [buildUiQueryString, pathname]);

  const persistScroll = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    sessionStorage.setItem(
      scrollStorageKey,
      JSON.stringify({
        y: window.scrollY,
        ts: Date.now(),
      }),
    );
  }, [scrollStorageKey]);

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

  useEffect(() => {
    const timer = setTimeout(() => {
      const query = buildPracticeFacetQueryString();
      void fetchJson<SearchResponse>(`/events/search?${query}`)
        .then((result) => setPracticeFacetCounts(result.facets?.practiceCategoryId ?? {}))
        .catch(() => setPracticeFacetCounts({}));
    }, 250);
    return () => clearTimeout(timer);
  }, [buildPracticeFacetQueryString]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const queryString = buildUiQueryString();
      router.push(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
    }, 250);
    return () => clearTimeout(timer);
  }, [buildUiQueryString, pathname, router]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (restoredKeyRef.current === scrollStorageKey) {
      return;
    }
    restoredKeyRef.current = scrollStorageKey;

    const raw = sessionStorage.getItem(scrollStorageKey);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as { y?: number; ts?: number };
      if (typeof parsed.y !== "number" || typeof parsed.ts !== "number") {
        return;
      }
      if (Date.now() - parsed.ts > 30 * 60 * 1000) {
        return;
      }
      const { y } = parsed;
      window.setTimeout(() => window.scrollTo(0, y), 0);
    } catch {
      // ignore invalid persisted scroll data
    }
  }, [scrollStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const onBeforeUnload = () => persistScroll();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      persistScroll();
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [persistScroll]);

  useEffect(() => {
    setTimeDisplayMode(readTimeDisplayMode());
  }, []);

  useEffect(() => {
    writeTimeDisplayMode(timeDisplayMode);
  }, [timeDisplayMode]);

  useEffect(() => {
    if (!data?.facets) {
      return;
    }
    setFacetBaseline((current) => ({
      practiceCategoryId: mergeFacetRecord(current.practiceCategoryId, data.facets?.practiceCategoryId),
      practiceSubcategoryId: mergeFacetRecord(current.practiceSubcategoryId, data.facets?.practiceSubcategoryId),
      eventFormatId: mergeFacetRecord(current.eventFormatId, data.facets?.eventFormatId),
      tags: mergeFacetRecord(current.tags, data.facets?.tags),
      languages: mergeFacetRecord(current.languages, data.facets?.languages),
      attendanceMode: mergeFacetRecord(current.attendanceMode, data.facets?.attendanceMode),
      countryCode: mergeFacetRecord(current.countryCode, data.facets?.countryCode),
    }));
  }, [data?.facets]);

  function clearFilters() {
    setQ("");
    setPracticeCategoryIds([]);
    setPracticeSubcategoryId("");
    setEventFormatIds([]);
    setTags([]);
    setTagQuery("");
    setLanguages([]);
    setAttendanceMode("");
    setCountryCodes([]);
    setCities([]);
    setCityQuery("");
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
    if (cityQuery.trim()) {
      params.set("q", cityQuery.trim());
    }
    if (cities.length) {
      params.set("exclude", cities.join(","));
    }
    params.set("limit", "20");
    void fetchJson<{ items: Array<{ city: string; count: number }> }>(`/meta/cities?${params.toString()}`)
      .then((payload) => setCitySuggestions(payload.items ?? []))
      .catch(() => setCitySuggestions([]));
  }, [cityQuery, countryCodes, cities]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (tagQuery.trim()) {
      params.set("q", tagQuery.trim());
      params.set("limit", "20");
    } else {
      params.set("limit", "5");
    }
    void fetchJson<{ items: Array<{ tag: string; count: number }> }>(`/meta/tags?${params.toString()}`)
      .then((payload) => setTagSuggestions(payload.items ?? []))
      .catch(() => setTagSuggestions([]));
  }, [tagQuery]);

  const visibleCategories = useMemo(() => {
    const categories = taxonomy?.practices.categories ?? [];
    const selectedSet = new Set(practiceCategoryIds);
    const filtered = categories.filter((category) => {
      const count = practiceFacetCounts[category.id] ?? 0;
      return count > 0 || selectedSet.has(category.id);
    });
    return showMoreCategories ? filtered : filtered.slice(0, 8);
  }, [practiceFacetCounts, practiceCategoryIds, showMoreCategories, taxonomy]);
  const visibleEventLanguageFacets = useMemo(() => {
    const selectedSet = new Set(languages);
    const merged = new Map<string, number>();
    for (const [key, value] of Object.entries(facetBaseline.languages ?? {})) {
      if (value > 0 || selectedSet.has(key)) {
        merged.set(key, value);
      }
    }
    for (const [key, value] of Object.entries(data?.facets?.languages ?? {})) {
      if (value > 0 || selectedSet.has(key)) {
        merged.set(key, value);
      }
    }
    for (const key of selectedSet) {
      if (!merged.has(key)) {
        merged.set(key, 0);
      }
    }
    return Array.from(merged.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [data?.facets?.languages, facetBaseline.languages, languages]);
  const selectedFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];

    for (const categoryId of practiceCategoryIds) {
      chips.push({
        key: `cat:${categoryId}`,
        label: `${categorySingularLabel}: ${categoryLabelById.get(categoryId) ?? categoryId}`,
        onRemove: () => {
          setPracticeCategoryIds((current) => current.filter((item) => item !== categoryId));
          setPage(1);
        },
      });
    }
    for (const formatId of eventFormatIds) {
      const label = taxonomy?.eventFormats?.find((format) => format.id === formatId)?.label ?? formatId;
      chips.push({
        key: `format:${formatId}`,
        label: `${t("eventSearch.eventFormat")}: ${label}`,
        onRemove: () => {
          setEventFormatIds((current) => current.filter((item) => item !== formatId));
          setPage(1);
        },
      });
    }
    for (const language of languages) {
      chips.push({
        key: `lang:${language}`,
        label: `${t("eventSearch.eventLanguage")}: ${getLanguageLabel(language)}`,
        onRemove: () => {
          setLanguages((current) => current.filter((item) => item !== language));
          setPage(1);
        },
      });
    }
    for (const country of countryCodes) {
      chips.push({
        key: `country:${country}`,
        label: `${t("eventSearch.country")}: ${getCountryLabel(country)}`,
        onRemove: () => {
          setCountryCodes((current) => current.filter((item) => item !== country));
          setPage(1);
        },
      });
    }
    for (const tag of tags) {
      chips.push({
        key: `tag:${tag}`,
        label: `${t("eventSearch.tags")}: ${tag}`,
        onRemove: () => {
          setTags((current) => current.filter((item) => item !== tag));
          setPage(1);
        },
      });
    }
    for (const city of cities) {
      chips.push({
        key: `city:${city}`,
        label: `${t("eventSearch.placeholder.city")}: ${city}`,
        onRemove: () => {
          setCities((current) => current.filter((item) => item !== city));
          setPage(1);
        },
      });
    }
    return chips;
  }, [
    categoryLabelById,
    categorySingularLabel,
    countryCodes,
    eventFormatIds,
    getCountryLabel,
    getLanguageLabel,
    languages,
    practiceCategoryIds,
    t,
    tags,
    cities,
    taxonomy?.eventFormats,
  ]);

  function addTagFromInput(rawValue: string) {
    const value = rawValue.trim().toLowerCase();
    if (!value) {
      return;
    }
    setTags((current) => (current.includes(value) ? current : [...current, value]));
    setTagQuery("");
    setPage(1);
  }

  function addCityFromInput(rawValue: string) {
    const value = rawValue.trim();
    if (!value) {
      return;
    }
    setCities((current) => (current.includes(value) ? current : [...current, value]));
    setCityQuery("");
    setPage(1);
  }

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
              const checked = practiceCategoryIds.includes(category.id);
              const count = practiceFacetCounts[category.id] ?? 0;
              return (
                <label className="meta" key={category.id}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      setPracticeCategoryIds((current) => (
                        current.includes(category.id)
                          ? current.filter((item) => item !== category.id)
                          : [...current, category.id]
                      ));
                      setPracticeSubcategoryId((current) =>
                        current && !category.subcategories.some((subcategory) => subcategory.id === current)
                          ? ""
                          : current
                      );
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
                const count = data?.facets?.eventFormatId?.[format.id] ??
                  facetBaseline.eventFormatId?.[format.id] ??
                  0;
                const checked = eventFormatIds.includes(format.id);
                return (
                  <label className="meta" key={format.id}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setEventFormatIds((current) => (
                          current.includes(format.id)
                            ? current.filter((item) => item !== format.id)
                            : [...current, format.id]
                        ));
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
            {visibleEventLanguageFacets.map(([value, count]) => (
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
                {getLanguageLabel(value)} ({count})
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
        <details open>
          <summary>{t("eventSearch.country")}</summary>
          <div className="kv">
            {visibleCountryFacets.map(({ value, count }) => (
              <label className="meta" key={value}>
                <input
                  type="checkbox"
                  checked={countryCodes.includes(value)}
                  onChange={() => {
                    setCountryCodes((current) => (
                      current.includes(value)
                        ? current.filter((item) => item !== value)
                        : [...current, value]
                    ));
                    setPage(1);
                  }}
                />
                {getCountryLabel(value)} ({count})
              </label>
            ))}
          </div>
        </details>
        <input
          list="event-city-suggestions"
          value={cityQuery}
          onChange={(event) => {
            const nextValue = event.target.value;
            const match = citySuggestions.find((item) => item.city.toLowerCase() === nextValue.trim().toLowerCase());
            if (match) {
              addCityFromInput(match.city);
              return;
            }
            setCityQuery(nextValue);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addCityFromInput(cityQuery);
            }
          }}
          placeholder={t("eventSearch.placeholder.city")}
        />
        <datalist id="event-city-suggestions">
          {citySuggestions.map((item) => (
            <option key={item.city} value={item.city}>
              {item.city} ({item.count})
            </option>
          ))}
        </datalist>
        {cities.length > 0 && (
          <div className="kv">
            {cities.map((item) => (
              <button
                className="tag"
                key={item}
                type="button"
                onClick={() => {
                  setCities((current) => current.filter((cityItem) => cityItem !== item));
                  setPage(1);
                }}
              >
                {item} ×
              </button>
            ))}
          </div>
        )}
        <input
          list="event-tag-suggestions"
          value={tagQuery}
          onFocus={() => setTagQuery("")}
          onChange={(event) => {
            const nextValue = event.target.value;
            const match = tagSuggestions.find((item) => item.tag.toLowerCase() === nextValue.trim().toLowerCase());
            if (match) {
              addTagFromInput(match.tag);
              return;
            }
            setTagQuery(nextValue);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addTagFromInput(tagQuery);
            }
          }}
          placeholder={t("eventSearch.tags")}
        />
        <datalist id="event-tag-suggestions">
          {tagSuggestions.map((item) => (
            <option key={item.tag} value={item.tag}>
              {item.count}
            </option>
          ))}
        </datalist>
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
          <label className="toggle-control">
            <input
              className="toggle-control-input"
              type="checkbox"
              checked={timeDisplayMode === "event"}
              onChange={(event) => setTimeDisplayMode(event.target.checked ? "event" : "user")}
            />
            <span className="toggle-control-track" aria-hidden />
            <span className="meta">
              {timeDisplayMode === "event"
                ? t("eventSearch.timeMode.eventWithZone", { zone: t("common.eventTimezone") })
                : t("eventSearch.timeMode.userWithZone", { zone: userTimeZone })}
            </span>
          </label>
        </div>
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
        {selectedFilterChips.length > 0 && (
          <div className="kv">
            {selectedFilterChips.map((chip) => (
              <button className="tag" key={chip.key} type="button" onClick={chip.onRemove}>
                {chip.label} ×
              </button>
            ))}
          </div>
        )}

        {view === "map" ? (
          <LeafletClusterMap queryString={activeQueryString} refreshToken={refreshToken} />
        ) : (
          data?.hits.map((hit) => {
            const formatted = formatDateTimeRange(
              hit.startsAtUtc,
              hit.endsAtUtc,
              hit.event.eventTimezone ?? "UTC",
              timeDisplayMode,
            );

            return (
              <Link
                className="card"
                key={hit.occurrenceId}
                href={`/events/${hit.event.slug}`}
                onClick={persistScroll}
              >
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
                  {formatted.primary} ({formatted.suffixLabel === "event"
                    ? t("common.eventTimezone")
                    : t("common.yourTimezone")}) | {t(`attendanceMode.${hit.event.attendanceMode}`)}
                </div>
                <div className="meta">
                  {hit.location?.city ?? t("eventSearch.locationTbd")}
                  {hit.location?.country_code ? `, ${getCountryLabel(hit.location.country_code)}` : ""}
                </div>
                <div className="meta">
                  {categorySingularLabel}: {categoryLabelById.get(hit.event.practiceCategoryId) ?? hit.event.practiceCategoryId}
                  {hit.event.practiceSubcategoryId
                    ? ` / ${subcategoryLabelById.get(hit.event.practiceSubcategoryId) ?? hit.event.practiceSubcategoryId}`
                    : ""}
                </div>
                {(hit.organizers?.length ?? 0) > 0 && (
                  <div className="meta">
                    {(() => {
                      const roleBuckets = new Map<string, string[]>();
                      for (const organizer of hit.organizers ?? []) {
                        const roles = organizer.roles?.filter(Boolean) ?? [];
                        if (roles.length === 0) {
                          const bucket = roleBuckets.get("host") ?? [];
                          bucket.push(organizer.name);
                          roleBuckets.set("host", bucket);
                          continue;
                        }
                        for (const role of roles) {
                          const bucket = roleBuckets.get(role) ?? [];
                          bucket.push(organizer.name);
                          roleBuckets.set(role, bucket);
                        }
                      }
                      const parts: string[] = [];

                      for (const [role, names] of roleBuckets.entries()) {
                        const uniqueNames = Array.from(new Set(names));
                        if (uniqueNames.length === 0) {
                          continue;
                        }
                        let prefix = `${role}:`;
                        if (role === "teacher") {
                          prefix = t("eventSearch.teacherPrefix");
                        } else if (role === "organizer") {
                          prefix = t("eventSearch.organizerPrefix");
                        } else if (role === "host") {
                          prefix = t("eventSearch.hostPrefix");
                        }
                        parts.push(`${prefix} ${uniqueNames.join(", ")}`);
                      }
                      return parts.join(" | ");
                    })()}
                  </div>
                )}
                <div className="kv">
                  {hit.event.languages.map((item) => (
                    <span className="tag" key={item}>
                      {getLanguageLabel(item)}
                    </span>
                  ))}
                  {hit.event.tags.map((item) => (
                    <span className="tag" key={item}>
                      {item}
                    </span>
                  ))}
                </div>
              </Link>
            );
          })
        )}
        {data && (
          <div className="admin-card-actions">
            <button
              className="secondary-btn"
              type="button"
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
              disabled={loading || currentPage <= 1}
              style={currentPage <= 1 ? { visibility: "hidden" } : undefined}
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
              style={currentPage >= totalPages ? { visibility: "hidden" } : undefined}
            >
              {t("common.pagination.next")}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
