"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchJson } from "../lib/api";
import { labelForLanguageCode } from "../lib/i18n/languageLabels";
import { getLocalizedRegionLabel, getLocalizedLanguageLabel } from "../lib/i18n/icuFallback";
import { scrollToTopFast } from "../lib/scroll";
import { useGeolocation } from "../lib/useGeolocation";
import { useKeycloakAuth } from "./auth/KeycloakAuthProvider";
import { useI18n } from "./i18n/I18nProvider";

export type OrganizerSearchResponse = {
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

import { getRoleLabel, formatCityLabel as formatCityLabelHelper } from "../lib/filterHelpers";

export function OrganizerSearchClient({
  initialQuery,
  initialTaxonomy,
  initialResults,
}: {
  initialQuery?: OrganizerSearchInitialQuery;
  initialTaxonomy?: TaxonomyResponse | null;
  initialResults?: OrganizerSearchResponse | null;
}) {
  const { locale, t } = useI18n();
  const auth = useKeycloakAuth();
  const authRef = useRef(auth);
  authRef.current = auth;
  const isEditor = auth.authenticated && auth.roles.some((role) =>
    role === "editor" || role === "admin"
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarSkipTransition, setSidebarSkipTransition] = useState(false);
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("dr-filters-sidebar-open");
      if (stored !== null && window.innerWidth > 900) {
        if (stored === "true") {
          setSidebarSkipTransition(true);
          setSidebarOpen(true);
        } else {
          setSidebarOpen(false);
        }
      }
    } catch { /* sessionStorage unavailable */ }
  }, []);

  useEffect(() => {
    if (!sidebarSkipTransition) return;
    const raf = requestAnimationFrame(() => setSidebarSkipTransition(false));
    return () => cancelAnimationFrame(raf);
  }, [sidebarSkipTransition]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isMobile = window.innerWidth <= 900;
    if (isMobile && sidebarOpen) {
      const scrollY = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = "0";
      document.body.style.right = "0";
      return () => {
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.left = "";
        document.body.style.right = "";
        window.scrollTo(0, scrollY);
      };
    }
  }, [sidebarOpen]);
  const [accumulatedItems, setAccumulatedItems] = useState<OrganizerSearchResponse["items"]>(initialResults?.items ?? []);
  const [loadingMore, setLoadingMore] = useState(false);
  const isLoadMoreRef = useRef(false);
  const isFirstSearchRef = useRef(true);
  const isLoadMorePageRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OrganizerSearchResponse | null>(initialResults ?? null);
  const [roleFacetCounts, setRoleFacetCounts] = useState<Record<string, number>>(initialResults?.facets?.roleKey ?? {});
  const [languageFacetCounts, setLanguageFacetCounts] = useState<Record<string, number>>(initialResults?.facets?.languages ?? {});
  const [practiceFacetCounts, setPracticeFacetCounts] = useState<Record<string, number>>(initialResults?.facets?.practiceCategoryId ?? {});
  const [countryFacetCounts, setCountryFacetCounts] = useState<Record<string, number>>(initialResults?.facets?.countryCode ?? {});
  const [taxonomy, setTaxonomy] = useState<TaxonomyResponse | null>(initialTaxonomy ?? null);
  const [hostTypeOpen, setHostTypeOpen] = useState((initialQuery?.roleKeys?.length ?? 0) > 0);
  const [practiceOpen, setPracticeOpen] = useState(true);
  const [languageOpen, setLanguageOpen] = useState((initialQuery?.languages?.length ?? 0) > 0);
  const [countryOpen, setCountryOpen] = useState((initialQuery?.countryCodes?.length ?? 0) > 0);
  const restoredKeyRef = useRef<string | null>(null);
  const skipSearchAfterRestoreRef = useRef(false);
  const cacheRestoreInProgressRef = useRef(false);
  const cachedScrollYRef = useRef<number | null>(null);
  const lastRestoredKeyRef = useRef<string | null>(null);
  const cacheRestoredPageRef = useRef<number | null>(null);
  const syncingFromUrlRef = useRef(false);
  const facetRequestRef = useRef(0);
  const isTypingQRef = useRef(false);
  const typingQClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cityInputRef = useRef<HTMLInputElement | null>(null);
  const geo = useGeolocation();
  const geoAutoApplyRef = useRef(false);
  const [geoHostInfo, setGeoHostInfo] = useState<{ filterMode: "city" | "country"; count: number } | null>(null);
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

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev;
      try { sessionStorage.setItem("dr-filters-sidebar-open", String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && window.history.scrollRestoration !== "manual") {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isMobile = window.innerWidth <= 900;
    if (isMobile && sidebarOpen) {
      const scrollY = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = "0";
      document.body.style.right = "0";
      return () => {
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.left = "";
        document.body.style.right = "";
        window.scrollTo(0, scrollY);
      };
    }
  }, [sidebarOpen]);

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
    params.set("page", String(nextPage));
    params.set("pageSize", "20");
    return params.toString();
  }, [q, roleKeys, practiceCategoryIds, tags, languages, countryCodes, cities]);

  const buildFacetQueryString = useCallback((exclude: "roleKey" | "practiceCategoryId" | "languages" | "countryCode") => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (exclude !== "roleKey" && roleKeys.length) params.set("roleKey", roleKeys.join(","));
    if (exclude !== "practiceCategoryId" && practiceCategoryIds.length) params.set("practiceCategoryId", practiceCategoryIds.join(","));
    if (tags.length) params.set("tags", tags.join(","));
    if (exclude !== "languages" && languages.length) params.set("languages", languages.join(","));
    if (exclude !== "countryCode" && countryCodes.length) params.set("countryCode", countryCodes.join(","));
    if (cities.length) params.set("city", cities.join(","));
    params.set("page", "1");
    params.set("pageSize", "1");
    return params.toString();
  }, [q, roleKeys, practiceCategoryIds, tags, languages, countryCodes, cities]);

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

  // Resolve host counts for geo pill (city-first, fallback to country)
  useEffect(() => {
    if (geo.status !== "ready" || !geo.countryCode) {
      setGeoHostInfo(null);
      return;
    }
    let cancelled = false;
    async function resolveHostGeo() {
      if (geo.city) {
        try {
          const qs = new URLSearchParams({ city: geo.city, countryCode: geo.countryCode!.toLowerCase(), pageSize: "1", page: "1" });
          const result = await fetchJson<OrganizerSearchResponse>(`/organizers/search?${qs}`);
          if (!cancelled && (result.total ?? 0) > 0) {
            setGeoHostInfo({ filterMode: "city", count: result.total });
            return;
          }
        } catch { /* ignore */ }
      }
      if (cancelled) return;
      try {
        const qs = new URLSearchParams({ countryCode: geo.countryCode!.toLowerCase(), pageSize: "1", page: "1" });
        const result = await fetchJson<OrganizerSearchResponse>(`/organizers/search?${qs}`);
        if (!cancelled) setGeoHostInfo({ filterMode: "country", count: result.total ?? 0 });
      } catch { /* ignore */ }
    }
    void resolveHostGeo();
    return () => { cancelled = true; };
  }, [geo.status, geo.city, geo.countryCode]);

  // Auto-apply geo filter when user clicked "Near you" — waits for geoHostInfo
  useEffect(() => {
    if (geo.status === "ready" && geoAutoApplyRef.current && geoHostInfo && geoHostInfo.count > 0) {
      geoAutoApplyRef.current = false;
      if (geoHostInfo.filterMode === "city" && geo.city) {
        setCities([geo.city]);
        setCountryCodes(geo.countryCode ? [geo.countryCode.toLowerCase()] : []);
      } else if (geoHostInfo.filterMode === "country" && geo.countryCode) {
        setCountryCodes([geo.countryCode.toLowerCase()]);
        setCities([]);
      }
      setPage(1);
    }
  }, [geo.status, geoHostInfo, geo.city, geo.countryCode]);

  useEffect(() => {
    if (!loading && !loadingMore) setPendingKey(null);
  }, [loading, loadingMore]);

  const scrollStorageKey = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    params.sort();
    const query = params.toString();
    return `search-scroll:${pathname}${query ? `?${query}` : ""}`;
  }, [searchParams, pathname]);

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

  const clearSearchCache = useCallback(() => {
    try { sessionStorage.removeItem("search-cache-snapshot"); } catch { /* ignore */ }
  }, []);

  const onNavigateAway = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      const params = new URLSearchParams(url.search);
      params.delete("page");
      params.sort();
      const query = params.toString();
      const key = `search-scroll:${url.pathname}${query ? `?${query}` : ""}`;
      const snapshot = {
        key,
        y: window.scrollY,
        ts: Date.now(),
        accumulatedItems,
        page,
        total: data?.total ?? 0,
        facets: {
          roleKey: roleFacetCounts,
          practiceCategoryId: practiceFacetCounts,
          languages: languageFacetCounts,
          countryCode: countryFacetCounts,
        },
      };
      sessionStorage.setItem("search-cache-snapshot", JSON.stringify(snapshot));
    } catch { /* ignore */ }
  }, [accumulatedItems, page, data?.total, roleFacetCounts, practiceFacetCounts, languageFacetCounts, countryFacetCounts]);

  const runSearch = useCallback(async (nextPage = page) => {
    const appendMode = isLoadMoreRef.current;
    isLoadMoreRef.current = false;

    if (appendMode) {
      setLoadingMore(true);
    } else if (isFirstSearchRef.current) {
      isFirstSearchRef.current = false;
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const result = await fetchJson<OrganizerSearchResponse>(
        `/organizers/search?${buildQueryString(nextPage)}`,
      );
      setData(result);
      if (appendMode) {
        setAccumulatedItems((prev) => [...prev, ...result.items]);
      } else {
        setAccumulatedItems(result.items);
      }
      setPage(nextPage);
    } catch (err) {
      setError(canSeeDetailedErrors && err instanceof Error ? err.message : t("organizerSearch.error.searchFailed"));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [buildQueryString, canSeeDetailedErrors, page, t]);

  useEffect(() => {
    // Try restoring from snapshot saved by onNavigateAway (host card click)
    if (lastRestoredKeyRef.current !== scrollStorageKey) {
      try {
        const raw = sessionStorage.getItem("search-cache-snapshot");
        if (raw) {
          const cached = JSON.parse(raw) as {
            key?: string;
            y?: number;
            ts?: number;
            accumulatedItems?: OrganizerSearchResponse["items"];
            page?: number;
            total?: number;
          };
          const age = Date.now() - (cached.ts ?? 0);
          if (
            cached.key === scrollStorageKey &&
            cached.accumulatedItems?.length &&
            typeof cached.ts === "number" &&
            age < 30 * 60 * 1000
          ) {
            sessionStorage.removeItem("search-cache-snapshot");
            lastRestoredKeyRef.current = scrollStorageKey;
            cacheRestoredPageRef.current = cached.page ?? 1;
            cacheRestoreInProgressRef.current = true;
            cachedScrollYRef.current = cached.y ?? null;
            setAccumulatedItems(cached.accumulatedItems);
            setPage(cached.page ?? 1);
            isLoadMorePageRef.current = true;
            skipSearchAfterRestoreRef.current = true;
            setData({
              items: cached.accumulatedItems.slice(-20),
              total: cached.total ?? 0,
              pagination: {
                page: cached.page ?? 1,
                pageSize: 20,
                totalPages: Math.ceil((cached.total ?? 0) / 20),
              },
            });
            return;
          }
        }
      } catch { /* ignore */ }
    }

    if (skipSearchAfterRestoreRef.current) {
      skipSearchAfterRestoreRef.current = false;
      return;
    }

    if (!isFirstSearchRef.current && !isLoadMoreRef.current) setLoading(true);
    const timer = setTimeout(() => {
      void runSearch(page);
    }, 250);
    return () => clearTimeout(timer);
  }, [runSearch, page, scrollStorageKey]);

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
      const url = queryString ? `${pathname}?${queryString}` : pathname;
      window.history.replaceState(window.history.state, "", url);
    }, 250);
    return () => clearTimeout(timer);
  }, [buildUiQueryString, pathname]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!data) {
      return;
    }

    if (restoredKeyRef.current === scrollStorageKey) {
      return;
    }
    restoredKeyRef.current = scrollStorageKey;

    if (cachedScrollYRef.current !== null) {
      const scrollY = cachedScrollYRef.current;
      cachedScrollYRef.current = null;
      cacheRestoreInProgressRef.current = false;
      if (scrollY > 0) {
        setTimeout(() => window.scrollTo(0, scrollY), 50);
      }
      return;
    }

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
      window.setTimeout(() => window.scrollTo(0, parsed.y as number), 0);
    } catch {
      // ignore invalid persisted scroll data
    }
  }, [scrollStorageKey, data]);

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
    const requestId = facetRequestRef.current + 1;
    facetRequestRef.current = requestId;
    const timer = setTimeout(() => {
      void Promise.all([
        fetchJson<OrganizerSearchResponse>(`/organizers/search?${buildFacetQueryString("roleKey")}`),
        fetchJson<OrganizerSearchResponse>(`/organizers/search?${buildFacetQueryString("practiceCategoryId")}`),
        fetchJson<OrganizerSearchResponse>(`/organizers/search?${buildFacetQueryString("languages")}`),
        fetchJson<OrganizerSearchResponse>(`/organizers/search?${buildFacetQueryString("countryCode")}`),
      ]).then(([roleResult, practiceResult, languageResult, countryResult]) => {
        if (requestId !== facetRequestRef.current) return;
        setRoleFacetCounts(roleResult?.facets?.roleKey ?? {});
        setPracticeFacetCounts(practiceResult?.facets?.practiceCategoryId ?? {});
        setLanguageFacetCounts(languageResult?.facets?.languages ?? {});
        setCountryFacetCounts(countryResult?.facets?.countryCode ?? {});
      }).catch(() => { /* keep existing counts on error */ });
    }, 350);
    return () => clearTimeout(timer);
  }, [buildFacetQueryString]);

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
    return getLocalizedLanguageLabel(value, locale, languageNames);
  }, [languageNames, locale]);
  const getCountryLabel = useCallback((value: string) => {
    return getLocalizedRegionLabel(value, locale, regionNames);
  }, [regionNames, locale]);
  const formatCityLabel = formatCityLabelHelper;
  const categorySingularLabel = t("admin.placeholder.categorySingular");
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
        label: getRoleLabel(role, t),
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
  }, [cities, countryCodes, formatCityLabel, getCountryLabel, getLanguageLabel, languages, practiceCategoryIds, practiceLabelById, roleKeys, t, tags]);

  const visibleTagSuggestions = useMemo(
    () => tagSuggestions.filter((item) => !tags.includes(item.tag)),
    [tagSuggestions, tags],
  );
  const visibleCitySuggestions = useMemo(
    () => citySuggestions.filter((item) => !cities.some((city) => city.toLowerCase() === item.city.toLowerCase())),
    [citySuggestions, cities],
  );

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
    clearSearchCache();
  }

  const activeFilterCount = selectedChips.length;

  const heroCollapsed = !!(q || practiceCategoryIds.length || roleKeys.length ||
    tags.length || languages.length || countryCodes.length || cities.length);

  const topPracticePills = useMemo(() => {
    if (!taxonomy) return [];
    return [...taxonomy.practices.categories]
      .map((cat) => ({ id: cat.id, label: cat.label, count: practiceFacetCounts[cat.id] ?? 0 }))
      .filter((cat) => cat.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
  }, [taxonomy, practiceFacetCounts]);

  return (
    <>
    <div className={heroCollapsed ? "hero hero-collapsed" : "hero"}>
      <h1 className="hero-heading">{t("organizerSearch.hero.heading")}</h1>
      <form className="hero-search-form" onSubmit={(e) => e.preventDefault()}>
        <input
          className="hero-search-input"
          value={q}
          onChange={(e) => {
            isTypingQRef.current = true;
            if (typingQClearRef.current) clearTimeout(typingQClearRef.current);
            typingQClearRef.current = setTimeout(() => { isTypingQRef.current = false; }, 800);
            setQ(e.target.value);
            setPage(1);
            clearSearchCache();
          }}
          placeholder={t("organizerSearch.hero.placeholder")}
          autoComplete="off"
        />
        <button type="submit" className="primary-btn">{t("organizerSearch.search")}</button>
      </form>
      <div className="hero-collapsible">
        <div className="hero-pills">
          {geo.status === "idle" && (
            <button type="button" className="hero-pill hero-pill-geo"
              onClick={() => { geoAutoApplyRef.current = true; geo.detect(); }}>
              {t("organizerSearch.hero.nearYou")}
            </button>
          )}
          {(geo.status === "detecting" || (geo.status === "ready" && geoHostInfo === null)) && (
            <button type="button" className="hero-pill hero-pill-geo" disabled>
              {t("organizerSearch.hero.detecting")}
            </button>
          )}
          {(geo.status === "no_events" || (geo.status === "ready" && geoHostInfo !== null && geoHostInfo.count === 0)) && (
            <span className="hero-pill hero-pill-geo" style={{ opacity: 0.6, cursor: "default" }}>
              {t("organizerSearch.hero.noHostsNearby")}
            </span>
          )}
          {geo.status === "ready" && geoHostInfo !== null && geoHostInfo.count > 0 && geo.countryCode && (
            <button
              type="button"
              className={
                (geoHostInfo.filterMode === "city" && geo.city && cities.includes(geo.city)) ||
                (geoHostInfo.filterMode === "country" && countryCodes.includes(geo.countryCode.toLowerCase()))
                  ? "hero-pill hero-pill-geo hero-pill-active"
                  : "hero-pill hero-pill-geo"
              }
              onClick={() => {
                if (geoHostInfo.filterMode === "city" && geo.city) {
                  setCities([geo.city]);
                  setCountryCodes(geo.countryCode ? [geo.countryCode.toLowerCase()] : []);
                } else if (geo.countryCode) {
                  setCountryCodes([geo.countryCode.toLowerCase()]);
                  setCities([]);
                }
                setPage(1);
              }}
            >
              {t("organizerSearch.hero.hostsIn", {
                city: geoHostInfo.filterMode === "city" ? (geo.city ?? geo.countryCode) : getCountryLabel(geo.countryCode),
              })}
              {" "}<span className="hero-pill-count">({geoHostInfo.count.toLocaleString()})</span>
            </button>
          )}
          {topPracticePills.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={practiceCategoryIds.includes(cat.id) ? "hero-pill hero-pill-active" : "hero-pill"}
              onClick={() => {
                setPracticeCategoryIds((current) =>
                  current.includes(cat.id) ? current.filter((id) => id !== cat.id) : [...current, cat.id]
                );
                setPage(1);
              }}
            >
              {cat.label} <span className="hero-pill-count">({cat.count.toLocaleString()})</span>
            </button>
          ))}
        </div>
      </div>
    </div>
    <section className={["grid", sidebarOpen && "sidebar-open", sidebarSkipTransition && "sidebar-no-transition"].filter(Boolean).join(" ")}>
      {sidebarOpen && (
        <div className="filters-overlay" onClick={() => setSidebarOpen(false)} aria-hidden />
      )}
      <aside className="panel filters">

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
                  <span className="filter-row-label">{getRoleLabel(value, t)}</span>
                  <span className="filter-row-count">{count}</span>
                </button>
              );
            })}
          </div>
        </details>

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
            className={activeFilterCount > 0 ? "filters-toggle-btn filters-toggle-btn--active" : sidebarOpen ? "filters-toggle-btn filters-toggle-btn--open" : "filters-toggle-btn filters-toggle-btn--default"}
            onClick={toggleSidebar}
            aria-expanded={sidebarOpen}
          >
            {activeFilterCount > 0 ? `${t("eventSearch.filtersButton")} (${activeFilterCount})` : t("eventSearch.filtersButton")}
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

        <div className="cards-content">
          {loading && !loadingMore && accumulatedItems.length > 0 && (
            <div className="cards-loading-overlay">
              <div className="filter-spinner" />
            </div>
          )}
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
            <Link className="card host-card-h" key={item.id} href={`/hosts/${item.slug}`} onClick={onNavigateAway}>
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
                </h3>
                {locationParts && <div className="meta">{locationParts}</div>}
                {(primaryPractice || primaryRole) && (
                  <div className="meta">
                    {[primaryPractice, primaryRole ? getRoleLabel(primaryRole, t) : null].filter(Boolean).join(" · ")}
                  </div>
                )}
                {pills.length > 0 && (
                  <div className="host-card-lang-pills">
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
    </>
  );
}
