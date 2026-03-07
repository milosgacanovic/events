"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchJson } from "../lib/api";
import { labelForLanguageCode } from "../lib/i18n/languageLabels";
import { scrollToTopFast } from "../lib/scroll";
import { useKeycloakAuth } from "./auth/KeycloakAuthProvider";
import { useI18n } from "./i18n/I18nProvider";

type OrganizerSearchResponse = {
  items: Array<{
    id: string;
    slug: string;
    name: string;
    status?: string;
    imageUrl?: string | null;
    avatar_path?: string | null;
    websiteUrl?: string | null;
    website_url?: string | null;
    tags: string[];
    languages: string[];
    roleKey?: string | null;
    roleKeys?: string[];
    practiceCategoryIds?: string[];
    city: string | null;
    country_code: string | null;
    countryCode?: string | null;
  }>;
  total: number;
  pagination?: {
    page: number;
    pageSize: number;
    totalPages: number;
  };
  facets?: {
    roleKey?: Record<string, number>;
    practiceCategoryId?: Record<string, number>;
    languages?: Record<string, number>;
    tags?: Record<string, number>;
    countryCode?: Record<string, number>;
    city?: Record<string, number>;
  };
};

export type OrganizerSearchInitialQuery = {
  q?: string;
  roleKeys?: string[];
  practiceCategoryIds?: string[];
  tags?: string[];
  languages?: string[];
  countryCodes?: string[];
  cities?: string[];
  view?: "list" | "map";
  page?: number;
};

type TaxonomyResponse = {
  uiLabels?: {
    categorySingular?: string;
    practiceCategory?: string;
  };
  practices: {
    categories: Array<{
      id: string;
      key: string;
      label: string;
    }>;
  };
};

export function OrganizerSearchClient({
  initialQuery,
  initialTaxonomy,
}: {
  initialQuery?: OrganizerSearchInitialQuery;
  initialTaxonomy?: TaxonomyResponse | null;
}) {
  const { locale, t } = useI18n();
  const auth = useKeycloakAuth();
  const isEditor = auth.authenticated && auth.roles.some((role) =>
    role === "dr_events_editor" || role === "dr_events_admin" || role === "editor" || role === "admin"
  );
  const canSeeDetailedErrors = isEditor;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [view, setView] = useState<"list" | "map">(initialQuery?.view ?? "list");
  const [q, setQ] = useState(initialQuery?.q ?? "");
  const [roleKeys, setRoleKeys] = useState<string[]>(initialQuery?.roleKeys ?? []);
  const [practiceCategoryIds, setPracticeCategoryIds] = useState<string[]>(initialQuery?.practiceCategoryIds ?? []);
  const [tags, setTags] = useState<string[]>(initialQuery?.tags ?? []);
  const [tagQuery, setTagQuery] = useState("");
  const [tagSuggestions, setTagSuggestions] = useState<Array<{ tag: string; count: number }>>([]);
  const [tagSuggestionsOpen, setTagSuggestionsOpen] = useState(false);
  const [languages, setLanguages] = useState<string[]>(initialQuery?.languages ?? []);
  const [countryCodes, setCountryCodes] = useState(
    (initialQuery?.countryCodes ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean),
  );
  const [cities, setCities] = useState<string[]>(initialQuery?.cities ?? []);
  const [cityQuery, setCityQuery] = useState("");
  const [citySuggestions, setCitySuggestions] = useState<Array<{ city: string; count: number }>>([]);
  const [citySuggestionsOpen, setCitySuggestionsOpen] = useState(false);
  const [page, setPage] = useState<number>(initialQuery?.page ?? 1);
  const [showArchived, setShowArchived] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [accumulatedItems, setAccumulatedItems] = useState<OrganizerSearchResponse["items"]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const isLoadMoreRef = useRef(false);
  const isLoadMorePageRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OrganizerSearchResponse | null>(null);
  const [roleFacetCounts, setRoleFacetCounts] = useState<Record<string, number>>({});
  const [languageFacetCounts, setLanguageFacetCounts] = useState<Record<string, number>>({});
  const [practiceFacetCounts, setPracticeFacetCounts] = useState<Record<string, number>>({});
  const [countryFacetCounts, setCountryFacetCounts] = useState<Record<string, number>>({});
  const [taxonomy, setTaxonomy] = useState<TaxonomyResponse | null>(initialTaxonomy ?? null);
  const [hostTypeOpen, setHostTypeOpen] = useState((initialQuery?.roleKeys?.length ?? 0) > 0);
  const [practiceOpen, setPracticeOpen] = useState((initialQuery?.practiceCategoryIds?.length ?? 0) > 0);
  const [languageOpen, setLanguageOpen] = useState((initialQuery?.languages?.length ?? 0) > 0);
  const [countryOpen, setCountryOpen] = useState((initialQuery?.countryCodes?.length ?? 0) > 0);
  const restoredKeyRef = useRef<string | null>(null);
  const syncingFromUrlRef = useRef(false);
  const isTypingQRef = useRef(false);
  const typingQClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cityInputRef = useRef<HTMLInputElement | null>(null);
  const practiceLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of taxonomy?.practices.categories ?? []) {
      map.set(category.id, category.label);
    }
    return map;
  }, [taxonomy]);
  const practiceKeyById = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of taxonomy?.practices.categories ?? []) {
      map.set(category.id, category.key);
    }
    return map;
  }, [taxonomy]);
  const HostLeafletClusterMap = useMemo(
    () =>
      dynamic(
        () => import("./HostLeafletClusterMap").then((module) => module.HostLeafletClusterMap),
        { ssr: false },
      ),
    [],
  );

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("dr-host-filters-sidebar-open");
      if (stored !== null) setSidebarOpen(stored === "true");
    } catch { /* ignore */ }
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev;
      try { sessionStorage.setItem("dr-host-filters-sidebar-open", String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  useEffect(() => {
    if (initialTaxonomy) return;
    fetchJson<TaxonomyResponse>("/meta/taxonomies")
      .then(setTaxonomy)
      .catch(() => {
        // Keep organizer search usable even if taxonomy metadata fails.
      });
  }, [initialTaxonomy]);

  const buildQueryString = useCallback((nextPage: number) => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (roleKeys.length) params.set("roleKey", roleKeys.join(","));
    if (practiceCategoryIds.length) params.set("practiceCategoryId", practiceCategoryIds.join(","));
    if (tags.length) params.set("tags", tags.join(","));
    if (languages.length) params.set("languages", languages.join(","));
    if (countryCodes.length) params.set("countryCode", countryCodes.join(","));
    if (cities.length) params.set("city", cities.join(","));
    if (showArchived) params.set("showArchived", "true");
    params.set("page", String(nextPage));
    params.set("pageSize", "20");
    return params.toString();
  }, [q, roleKeys, practiceCategoryIds, tags, languages, countryCodes, cities, showArchived]);

  const buildUiQueryString = useCallback(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (roleKeys.length) params.set("roleKey", roleKeys.join(","));
    if (practiceCategoryIds.length) {
      const keys = practiceCategoryIds.map((id) => practiceKeyById.get(id) ?? id);
      params.set("practice", keys.join(","));
    }
    if (tags.length) params.set("tags", tags.join(","));
    if (languages.length) params.set("languages", languages.join(","));
    if (countryCodes.length) params.set("countryCode", countryCodes.join(","));
    if (cities.length) params.set("city", cities.join(","));
    if (view !== "list") params.set("view", view);
    if (page > 1) params.set("page", String(page));
    return params.toString();
  }, [q, roleKeys, practiceCategoryIds, tags, languages, countryCodes, cities, view, page, practiceKeyById]);

  const buildMapQueryString = useCallback(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (roleKeys.length) params.set("roleKey", roleKeys.join(","));
    if (practiceCategoryIds.length) params.set("practiceCategoryId", practiceCategoryIds.join(","));
    if (tags.length) params.set("tags", tags.join(","));
    if (languages.length) params.set("languages", languages.join(","));
    if (countryCodes.length) params.set("countryCode", countryCodes.join(","));
    if (cities.length) params.set("city", cities.join(","));
    return params.toString();
  }, [q, roleKeys, practiceCategoryIds, tags, languages, countryCodes, cities]);
  const activeQueryString = useMemo(() => buildMapQueryString(), [buildMapQueryString]);

  useEffect(() => {
    const readCsv = (key: string) =>
      (searchParams.get(key) ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

    const nextQ = searchParams.get("q") ?? "";
    const practiceIdsFromUrl = [
      ...readCsv("practiceCategoryId"),
      ...readCsv("practice").map((key) => taxonomy?.practices.categories.find((item) => item.key === key)?.id ?? "")
        .filter(Boolean),
    ];
    const nextPracticeCategoryIds = Array.from(new Set(practiceIdsFromUrl));
    const nextRoleKeys = readCsv("roleKey");
    const nextTags = readCsv("tags").map((item) => item.toLowerCase());
    const nextLanguages = readCsv("languages").map((item) => item.toLowerCase());
    const nextCountryCodes = readCsv("countryCode").map((item) => item.toLowerCase());
    const nextCities = readCsv("city");
    const nextView = searchParams.get("view") === "map" ? "map" : "list";
    const parsedPage = Number(searchParams.get("page") ?? "1");
    const nextPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

    syncingFromUrlRef.current = true;
    if (!isTypingQRef.current) setQ(nextQ);
    setRoleKeys(nextRoleKeys);
    setPracticeCategoryIds(nextPracticeCategoryIds);
    setTags(nextTags);
    setLanguages(nextLanguages);
    setCountryCodes(nextCountryCodes);
    setCities(nextCities);
    setView(nextView);
    setPage(nextPage);
    window.setTimeout(() => {
      syncingFromUrlRef.current = false;
    }, 0);
  }, [searchParams, taxonomy]);

  useEffect(() => {
    if (roleKeys.length > 0) setHostTypeOpen(true);
  }, [roleKeys.length]);
  useEffect(() => {
    if (practiceCategoryIds.length > 0) setPracticeOpen(true);
  }, [practiceCategoryIds.length]);
  useEffect(() => {
    if (languages.length > 0) setLanguageOpen(true);
  }, [languages.length]);
  useEffect(() => {
    if (countryCodes.length > 0) setCountryOpen(true);
  }, [countryCodes.length]);

  useEffect(() => {
    if (!loading && !loadingMore) setPendingKey(null);
  }, [loading, loadingMore]);

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
    const appendMode = isLoadMoreRef.current;
    isLoadMoreRef.current = false;

    if (appendMode) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const token = (showArchived && auth.authenticated) ? await auth.getToken() : null;
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      const result = await fetchJson<OrganizerSearchResponse>(
        `/organizers/search?${buildQueryString(nextPage)}`,
        headers ? { headers } : undefined,
      );
      setData(result);
      if (appendMode) {
        setAccumulatedItems((prev) => [...prev, ...result.items]);
      } else {
        setAccumulatedItems(result.items);
      }
      setPage(nextPage);
      setPracticeFacetCounts(result.facets?.practiceCategoryId ?? {});
      setRoleFacetCounts(result.facets?.roleKey ?? {});
      setLanguageFacetCounts(result.facets?.languages ?? {});
      setCountryFacetCounts(result.facets?.countryCode ?? {});
    } catch (err) {
      setError(canSeeDetailedErrors && err instanceof Error ? err.message : t("organizerSearch.error.searchFailed"));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [buildQueryString, canSeeDetailedErrors, page, t, showArchived, auth]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void runSearch(page);
    }, 250);
    return () => clearTimeout(timer);
  }, [runSearch, page]);

  useEffect(() => {
    if (syncingFromUrlRef.current) {
      return;
    }
    if (isLoadMorePageRef.current) {
      isLoadMorePageRef.current = false;
      return;
    }
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
    void fetchJson<{ items: Array<{ city: string; count: number }> }>(
      `/meta/organizer-cities?${params.toString()}`,
    )
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

    void fetchJson<{ items: Array<{ tag: string; count: number }> }>(
      `/meta/organizer-tags?${params.toString()}`,
    )
      .then((payload) => setTagSuggestions(payload.items ?? []))
      .catch(() => setTagSuggestions([]));
  }, [tagQuery]);

  const currentPage = data?.pagination?.page ?? page;
  const totalPages = data?.pagination?.totalPages ?? 1;
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
  const getLanguageLabel = useCallback((value: string) => {
    return labelForLanguageCode(value, languageNames);
  }, [languageNames]);
  const getCountryLabel = useCallback((value: string) => {
    const normalized = value.trim().toUpperCase();
    const localized = regionNames?.of(normalized);
    return localized && localized !== normalized ? localized : normalized;
  }, [regionNames]);
  const formatCityLabel = useCallback((value: string) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return normalized;
    }
    return normalized.replace(/(^|[\s-])([a-z])/g, (_match, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`);
  }, []);
  const categorySingularLabel =
    taxonomy?.uiLabels?.categorySingular ??
    taxonomy?.uiLabels?.practiceCategory ??
    "";
  const visibleRoleFacets = useMemo(() => {
    const selectedSet = new Set(roleKeys);
    const merged = new Map<string, number>();
    for (const [key, value] of Object.entries(roleFacetCounts ?? {})) {
      if (value > 0 || selectedSet.has(key)) {
        merged.set(key, value);
      }
    }
    for (const key of selectedSet) {
      if (!merged.has(key)) merged.set(key, 0);
    }
    return Array.from(merged.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [roleFacetCounts, roleKeys]);
  const visibleLanguageFacets = useMemo(() => {
    const selectedSet = new Set(languages);
    const merged = new Map<string, number>();
    for (const [key, value] of Object.entries(languageFacetCounts ?? {})) {
      if (value > 0 || selectedSet.has(key)) {
        merged.set(key, value);
      }
    }
    for (const key of selectedSet) {
      if (!merged.has(key)) merged.set(key, 0);
    }
    return Array.from(merged.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [languageFacetCounts, languages]);
  const visibleCountryFacets = useMemo(() => {
    const selectedSet = new Set(countryCodes);
    const merged = new Map<string, number>();
    for (const [keyRaw, value] of Object.entries(countryFacetCounts ?? {})) {
      const key = keyRaw.toLowerCase();
      if (value > 0 || selectedSet.has(key)) {
        merged.set(key, value);
      }
    }
    for (const key of selectedSet) {
      if (!merged.has(key)) merged.set(key, 0);
    }
    return Array.from(merged.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [countryFacetCounts, countryCodes]);
  const practiceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const [practiceId, count] of Object.entries(practiceFacetCounts ?? {})) {
      counts.set(practiceId, count);
    }
    for (const selectedId of practiceCategoryIds) {
      if (!counts.has(selectedId)) {
        counts.set(selectedId, 0);
      }
    }
    return counts;
  }, [practiceFacetCounts, practiceCategoryIds]);
  const selectedChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];
    for (const role of roleKeys) {
      chips.push({
        key: `role:${role}`,
        label: role,
        onRemove: () => {
          setRoleKeys((current) => current.filter((item) => item !== role));
          setPage(1);
        },
      });
    }
    for (const practiceId of practiceCategoryIds) {
      chips.push({
        key: `practice:${practiceId}`,
        label: practiceLabelById.get(practiceId) ?? practiceId,
        onRemove: () => {
          setPracticeCategoryIds((current) => current.filter((item) => item !== practiceId));
          setPage(1);
        },
      });
    }
    for (const language of languages) {
      chips.push({
        key: `lang:${language}`,
        label: getLanguageLabel(language),
        onRemove: () => {
          setLanguages((current) => current.filter((item) => item !== language));
          setPage(1);
        },
      });
    }
    for (const country of countryCodes) {
      chips.push({
        key: `country:${country}`,
        label: getCountryLabel(country),
        onRemove: () => {
          setCountryCodes((current) => current.filter((item) => item !== country));
          setPage(1);
        },
      });
    }
    for (const tag of tags) {
      chips.push({
        key: `tag:${tag}`,
        label: tag,
        onRemove: () => {
          setTags((current) => current.filter((item) => item !== tag));
          setPage(1);
        },
      });
    }
    for (const city of cities) {
      chips.push({
        key: `city:${city}`,
        label: formatCityLabel(city),
        onRemove: () => {
          setCities((current) => current.filter((item) => item !== city));
          setPage(1);
        },
      });
    }
    return chips;
  }, [categorySingularLabel, cities, countryCodes, formatCityLabel, getCountryLabel, getLanguageLabel, languages, practiceCategoryIds, practiceLabelById, roleKeys, t, tags]);

  const visibleTagSuggestions = useMemo(
    () => tagSuggestions.filter((item) => !tags.includes(item.tag)),
    [tagSuggestions, tags],
  );
  const visibleCitySuggestions = useMemo(
    () => citySuggestions.filter((item) => !cities.some((city) => city.toLowerCase() === item.city.toLowerCase())),
    [citySuggestions, cities],
  );

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
    cityInputRef.current?.blur();
    setPage(1);
  }

  function clearFilters() {
    setQ("");
    setRoleKeys([]);
    setPracticeCategoryIds([]);
    setTags([]);
    setTagQuery("");
    setLanguages([]);
    setCountryCodes([]);
    setCities([]);
    setCityQuery("");
    setPage(1);
    setAccumulatedItems([]);
  }

  const activeFilterCount = selectedChips.length;

  return (
    <section className={sidebarOpen ? "grid sidebar-open" : "grid"}>
      {sidebarOpen && (
        <div className="filters-overlay" onClick={() => setSidebarOpen(false)} aria-hidden />
      )}
      <aside className="panel filters">
        <h2 className="title-xl">{t("organizerSearch.title")}</h2>
        <input
          value={q}
          onChange={(event) => {
            isTypingQRef.current = true;
            if (typingQClearRef.current) clearTimeout(typingQClearRef.current);
            typingQClearRef.current = setTimeout(() => { isTypingQRef.current = false; }, 400);
            setQ(event.target.value);
            setPage(1);
          }}
          placeholder={t("organizerSearch.placeholder.searchName")}
        />

        <details
          open={hostTypeOpen}
          onToggle={(event) => setHostTypeOpen((event.currentTarget as HTMLDetailsElement).open)}
        >
          <summary>{t("organizerSearch.hostType")}</summary>
          <div className="kv">
            {visibleRoleFacets.map(([value, count]) => {
              const checked = roleKeys.includes(value);
              return (
                <button
                  type="button"
                  className={"filter-row" + (checked ? " filter-row-selected" : "")}
                  key={`role-${value}`}
                  onClick={() => {
                    setPendingKey(`role:${value}`);
                    setRoleKeys((current) => (
                      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
                    ));
                    setPage(1);
                  }}
                >
                  <span className="filter-row-icon">{pendingKey === `role:${value}` ? <span className="filter-spinner" /> : (checked ? "\u2212" : "+")}</span>
                  <span className="filter-row-label">{value}</span>
                  <span className="filter-row-count">{count}</span>
                </button>
              );
            })}
          </div>
        </details>

        {(taxonomy?.practices.categories.length ?? 0) > 0 && (
          <details
            open={practiceOpen}
            onToggle={(event) => setPracticeOpen((event.currentTarget as HTMLDetailsElement).open)}
          >
            <summary>{categorySingularLabel}</summary>
            <div className="filter-scroll">
              {taxonomy?.practices.categories
                .filter((category) => {
                  const count = practiceCounts.get(category.id) ?? 0;
                  return count > 0 || practiceCategoryIds.includes(category.id);
                })
                .sort((a, b) => a.label.localeCompare(b.label))
                .map((category) => {
                  const count = practiceCounts.get(category.id) ?? 0;
                  const checked = practiceCategoryIds.includes(category.id);
                  return (
                    <button
                      type="button"
                      className={"filter-row" + (checked ? " filter-row-selected" : "")}
                      key={`practice-${category.id}`}
                      onClick={() => {
                        setPendingKey(`practice:${category.id}`);
                        setPracticeCategoryIds((current) => (
                          current.includes(category.id)
                            ? current.filter((item) => item !== category.id)
                            : [...current, category.id]
                        ));
                        setPage(1);
                      }}
                    >
                      <span className="filter-row-icon">{pendingKey === `practice:${category.id}` ? <span className="filter-spinner" /> : (checked ? "\u2212" : "+")}</span>
                      <span className="filter-row-label">{category.label}</span>
                      <span className="filter-row-count">{count}</span>
                    </button>
                  );
                })}
            </div>
          </details>
        )}

        <details
          open={languageOpen}
          onToggle={(event) => setLanguageOpen((event.currentTarget as HTMLDetailsElement).open)}
        >
          <summary>{t("organizerSearch.hostLanguage")}</summary>
          <div className="filter-scroll">
            {[...visibleLanguageFacets].sort((a, b) => getLanguageLabel(a[0]).localeCompare(getLanguageLabel(b[0]))).map(([value, count]) => {
              const checked = languages.includes(value);
              return (
                <button
                  type="button"
                  className={"filter-row" + (checked ? " filter-row-selected" : "")}
                  key={`lang-${value}`}
                  onClick={() => {
                    setPendingKey(`lang:${value}`);
                    setLanguages((current) => (
                      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
                    ));
                    setPage(1);
                  }}
                >
                  <span className="filter-row-icon">{pendingKey === `lang:${value}` ? <span className="filter-spinner" /> : (checked ? "\u2212" : "+")}</span>
                  <span className="filter-row-label">{getLanguageLabel(value)}</span>
                  <span className="filter-row-count">{count}</span>
                </button>
              );
            })}
          </div>
        </details>

        <details
          open={countryOpen}
          onToggle={(event) => setCountryOpen((event.currentTarget as HTMLDetailsElement).open)}
        >
          <summary>{t("organizerSearch.country")}</summary>
          <div className="filter-scroll">
            {[...visibleCountryFacets].sort((a, b) => getCountryLabel(a[0]).localeCompare(getCountryLabel(b[0]))).map(([value, count]) => {
              const checked = countryCodes.includes(value);
              return (
                <button
                  type="button"
                  className={"filter-row" + (checked ? " filter-row-selected" : "")}
                  key={`country-${value}`}
                  onClick={() => {
                    setPendingKey(`country:${value}`);
                    setCountryCodes((current) => (
                      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
                    ));
                    setPage(1);
                  }}
                >
                  <span className="filter-row-icon">{pendingKey === `country:${value}` ? <span className="filter-spinner" /> : (checked ? "\u2212" : "+")}</span>
                  <span className="filter-row-label">{getCountryLabel(value)}</span>
                  <span className="filter-row-count">{count}</span>
                </button>
              );
            })}
          </div>
        </details>

        <div className="autocomplete-wrap">
          <input
            ref={cityInputRef}
            value={cityQuery}
            onFocus={() => setCitySuggestionsOpen(true)}
            onBlur={() => window.setTimeout(() => setCitySuggestionsOpen(false), 120)}
            onChange={(event) => setCityQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                const query = cityQuery.trim();
                if (!query) {
                  return;
                }
                const exact = visibleCitySuggestions.find((item) => item.city.toLowerCase() === query.toLowerCase());
                addCityFromInput(exact?.city ?? query);
                setCitySuggestionsOpen(false);
              }
            }}
            placeholder={t("organizerSearch.placeholder.city")}
          />
          {citySuggestionsOpen && visibleCitySuggestions.length > 0 && (
            <div className="autocomplete-menu">
              {visibleCitySuggestions.slice(0, 10).map((item) => (
                <button
                  type="button"
                  className="autocomplete-option"
                  key={item.city}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    addCityFromInput(item.city);
                    setCitySuggestionsOpen(false);
                  }}
                >
                  {formatCityLabel(item.city)} ({item.count})
                </button>
              ))}
            </div>
          )}
        </div>
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
                {formatCityLabel(item)} ×
              </button>
            ))}
          </div>
        )}

        <div className="autocomplete-wrap">
          <input
            value={tagQuery}
            onFocus={() => setTagSuggestionsOpen(true)}
            onBlur={() => window.setTimeout(() => setTagSuggestionsOpen(false), 120)}
            onChange={(event) => setTagQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                const query = tagQuery.trim().toLowerCase();
                if (!query) {
                  return;
                }
                const exact = visibleTagSuggestions.find((item) => item.tag.toLowerCase() === query);
                addTagFromInput(exact?.tag ?? query);
                setTagSuggestionsOpen(false);
              }
            }}
            placeholder={t("organizerSearch.tags")}
          />
          {tagSuggestionsOpen && visibleTagSuggestions.length > 0 && (
            <div className="autocomplete-menu">
              {visibleTagSuggestions.slice(0, 10).map((item) => (
                <button
                  type="button"
                  className="autocomplete-option"
                  key={item.tag}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    addTagFromInput(item.tag);
                    setTagSuggestionsOpen(false);
                  }}
                >
                  {item.tag} ({item.count})
                </button>
              ))}
            </div>
          )}
        </div>
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
        {isEditor && (
          <label className="meta">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => {
                setShowArchived(e.target.checked);
                setPage(1);
              }}
            />
            {" Show archived"}
          </label>
        )}
        <div className="filters-mobile-footer">
          <button
            type="button"
            className="primary-btn"
            onClick={() => setSidebarOpen(false)}
          >
            {t("eventSearch.applyFilters")}
          </button>
        </div>
      </aside>

      <div className="panel cards">
        <div className="results-toolbar">
          <button
            type="button"
            className="secondary-btn filters-toggle-btn"
            onClick={toggleSidebar}
            aria-expanded={sidebarOpen}
          >
            {t("eventSearch.filtersButton")}
            {activeFilterCount > 0 && (
              <span className="filters-badge">{activeFilterCount}</span>
            )}
          </button>
          <div className="meta results-count">
            {data
              ? t("organizerSearch.totalCount", { count: data.total })
              : t("organizerSearch.promptRun")}
          </div>
          <div className="results-toolbar-actions">
            <div className="icon-group">
            <button
              type="button"
              className={view === "list" ? "secondary-btn icon-btn" : "ghost-btn icon-btn"}
              onClick={() => setView("list")}
              aria-label={t("eventSearch.view.list")}
              title={t("eventSearch.view.list")}
            >
              <span aria-hidden className="icon-glyph">☰</span>
              <span className="icon-label">{t("eventSearch.view.list")}</span>
            </button>
            <button
              type="button"
              className={view === "map" ? "secondary-btn icon-btn" : "ghost-btn icon-btn"}
              onClick={() => setView("map")}
              aria-label={t("eventSearch.view.map")}
              title={t("eventSearch.view.map")}
            >
              <span aria-hidden className="icon-glyph">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="10" r="3" />
                  <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z" />
                </svg>
              </span>
              <span className="icon-label">{t("eventSearch.view.map")}</span>
            </button>
            </div>
          </div>
        </div>
        {error && <div className="muted">{error}</div>}

        {selectedChips.length > 0 && (
          <div className="filter-chips">
            {selectedChips.map((chip) => (
              <button className="tag filter-chip" key={chip.key} type="button" onClick={chip.onRemove}>
                {chip.label} ×
              </button>
            ))}
            <button className="tag filter-chip-clear" type="button" onClick={clearFilters}>
              {t("eventSearch.clearFilters")}
            </button>
          </div>
        )}

        {view === "map" ? (
          <HostLeafletClusterMap queryString={activeQueryString} />
        ) : null}

        <div className="card-list">
        {view === "list" && accumulatedItems.map((item) => {
          const primaryCatId = item.practiceCategoryIds?.[0];
          const primaryCatKey = primaryCatId ? (practiceKeyById.get(primaryCatId) ?? "other") : "other";
          const locationParts = [
            item.city ?? "",
            (item.countryCode ?? item.country_code) ? getCountryLabel((item.countryCode ?? item.country_code) as string) : "",
          ].filter(Boolean).join(", ");
          const primaryRole = item.roleKeys?.[0] ?? item.roleKey ?? null;
          const primaryPractice = primaryCatId ? practiceLabelById.get(primaryCatId) : null;
          const pills = item.languages.map((l) => getLanguageLabel(l));
          const imageUrl = item.imageUrl || item.avatar_path || null;
          return (
            <Link className="card host-card-h" key={item.id} href={`/hosts/${item.slug}`} onClick={persistScroll}>
              <div
                className="host-card-avatar"
                style={{ background: imageUrl ? undefined : `var(--category-${primaryCatKey}, var(--surface-skeleton))` }}
              >
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={item.name}
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <span className="host-card-avatar-initials" aria-hidden>
                    {item.name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("")}
                  </span>
                )}
              </div>
              <div className="host-card-body">
                <h3 style={{ margin: "0 0 4px" }}>
                  {item.name}
                  {item.status === "archived" && (
                    <span className="tag" style={{ marginLeft: "0.5em", fontSize: "0.75em" }}>Archived</span>
                  )}
                </h3>
                {locationParts && <div className="meta">{locationParts}</div>}
                {(primaryPractice || primaryRole) && (
                  <div className="meta">
                    {[primaryPractice, primaryRole].filter(Boolean).join(" · ")}
                  </div>
                )}
                {pills.length > 0 && (
                  <div className="kv event-card-pills" style={{ marginTop: "auto" }}>
                    {pills.map((pill, i) => (
                      <span className="tag" key={i}>{pill}</span>
                    ))}
                  </div>
                )}
              </div>
            </Link>
          );
        })}
        </div>
        {data && view === "list" && currentPage < totalPages && (
          <div className="load-more-section">
            <button
              className="secondary-btn load-more-btn"
              type="button"
              onClick={() => {
                isLoadMoreRef.current = true;
                isLoadMorePageRef.current = true;
                setPage((prev) => prev + 1);
              }}
              disabled={loadingMore}
            >
              {loadingMore ? t("eventSearch.searching") : t("common.pagination.loadMore")}
            </button>
            <div className="meta">
              {t("common.pagination.showingOf", { shown: accumulatedItems.length, total: data.total })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
