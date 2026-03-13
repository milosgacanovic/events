"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchJson } from "../lib/api";
import { formatDateTimeRange, type TimeDisplayMode } from "../lib/datetime";
import { labelForLanguageCode } from "../lib/i18n/languageLabels";
import { scrollToTopFast } from "../lib/scroll";
import { formatTimeZone, getUserTimeZone, readTimeDisplayMode, writeTimeDisplayMode } from "../lib/timeDisplay";
import { useGeolocation } from "../lib/useGeolocation";
import { useKeycloakAuth } from "./auth/KeycloakAuthProvider";
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
      visibility?: string;
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
    eventDate?: Record<string, number>;
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
  attendanceModes?: string[];
  countryCodes?: string[];
  cities?: string[];
  eventDates?: EventDatePreset[];
  sort?: "startsAtAsc" | "startsAtDesc";
  view?: "list" | "map";
  page?: number;
  includePast?: boolean;
  dateFrom?: string;
  dateTo?: string;
};

type EventDatePreset =
  | "today"
  | "tomorrow"
  | "this_weekend"
  | "this_week"
  | "next_week"
  | "this_month"
  | "next_month";

const EVENT_DATE_PRESETS: EventDatePreset[] = [
  "today",
  "tomorrow",
  "this_weekend",
  "this_week",
  "next_week",
  "this_month",
  "next_month",
];

const LeafletClusterMap = dynamic(
  () => import("./LeafletClusterMap").then((module) => module.LeafletClusterMap),
  { ssr: false },
);

type DisjunctiveFacetState = {
  practiceCategoryId: Record<string, number>;
  eventFormatId: Record<string, number>;
  languages: Record<string, number>;
  attendanceMode: Record<string, number>;
  countryCode: Record<string, number>;
  eventDate: Record<string, number>;
};

function getFormatLabel(key: string, label: string, t: (k: string) => string): string {
  const translated = t(`eventFormat.${key}`);
  return translated === `eventFormat.${key}` ? label : translated;
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
  const auth = useKeycloakAuth();
  const authRef = useRef(auth);
  authRef.current = auth;
  const isEditor = auth.authenticated && auth.roles.some((role) =>
    role === "dr_events_editor" || role === "dr_events_admin" || role === "editor" || role === "admin"
  );
  const canSeeDetailedErrors = isEditor;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [view, setView] = useState<"list" | "map">(initialQuery?.view ?? "list");
  const [sort, setSort] = useState<"startsAtAsc" | "startsAtDesc">(initialQuery?.sort ?? "startsAtAsc");
  const [q, setQ] = useState(initialQuery?.q ?? "");
  const [practiceCategoryIds, setPracticeCategoryIds] = useState(initialQuery?.practiceCategoryIds ?? []);
  const [practiceSubcategoryId, setPracticeSubcategoryId] = useState(initialQuery?.practiceSubcategoryId ?? "");
  const [eventFormatIds, setEventFormatIds] = useState(initialQuery?.eventFormatIds ?? []);
  const [tags, setTags] = useState<string[]>(initialQuery?.tags ?? []);
  const [tagQuery, setTagQuery] = useState("");
  const [tagSuggestions, setTagSuggestions] = useState<Array<{ tag: string; count: number }>>([]);
  const [tagSuggestionsOpen, setTagSuggestionsOpen] = useState(false);
  const [languages, setLanguages] = useState<string[]>(initialQuery?.languages ?? []);
  const [attendanceModes, setAttendanceModes] = useState<string[]>(initialQuery?.attendanceModes ?? []);
  const [countryCodes, setCountryCodes] = useState<string[]>(
    (initialQuery?.countryCodes ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean),
  );
  const [cities, setCities] = useState<string[]>(initialQuery?.cities ?? []);
  const [eventDates, setEventDates] = useState<EventDatePreset[]>(initialQuery?.eventDates ?? []);
  const [customFrom, setCustomFrom] = useState<string>(initialQuery?.dateFrom ?? "");
  const [customTo, setCustomTo] = useState<string>(initialQuery?.dateTo ?? "");
  const [cityQuery, setCityQuery] = useState("");
  const [citySuggestions, setCitySuggestions] = useState<Array<{ city: string; count: number }>>([]);
  const [citySuggestionsOpen, setCitySuggestionsOpen] = useState(false);
  const [page, setPage] = useState<number>(initialQuery?.page ?? 1);
  const [includePast, setIncludePast] = useState(initialQuery?.includePast ?? false);
  const [showUnlisted, setShowUnlisted] = useState(false);
  const [taxonomy, setTaxonomy] = useState<TaxonomyResponse | null>(initialTaxonomy ?? null);
  const [loading, setLoading] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SearchResponse | null>(initialResults ?? null);
  const [disjunctiveFacets, setDisjunctiveFacets] = useState<DisjunctiveFacetState>({
    practiceCategoryId: initialResults?.facets?.practiceCategoryId ?? {},
    eventFormatId: initialResults?.facets?.eventFormatId ?? {},
    languages: initialResults?.facets?.languages ?? {},
    attendanceMode: initialResults?.facets?.attendanceMode ?? {},
    countryCode: initialResults?.facets?.countryCode ?? {},
    eventDate: initialResults?.facets?.eventDate ?? {},
  });
  const [activeQueryString, setActiveQueryString] = useState("page=1&pageSize=20");
  const [refreshToken, setRefreshToken] = useState(0);
  const [timeDisplayMode, setTimeDisplayMode] = useState<TimeDisplayMode>("user");
  const [dateOpen, setDateOpen] = useState((initialQuery?.eventDates?.length ?? 0) > 0 || !!(initialQuery?.dateFrom) || !!(initialQuery?.dateTo));
  const [dateRangeOpen, setDateRangeOpen] = useState(!!(initialQuery?.dateFrom) || !!(initialQuery?.dateTo));
  const [practiceOpen, setPracticeOpen] = useState((initialQuery?.practiceCategoryIds?.length ?? 0) > 0);
  const [eventFormatOpen, setEventFormatOpen] = useState((initialQuery?.eventFormatIds?.length ?? 0) > 0);
  const [languageOpen, setLanguageOpen] = useState((initialQuery?.languages?.length ?? 0) > 0);
  const [attendanceOpen, setAttendanceOpen] = useState((initialQuery?.attendanceModes?.length ?? 0) > 0);
  const [countryOpen, setCountryOpen] = useState((initialQuery?.countryCodes?.length ?? 0) > 0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accumulatedHits, setAccumulatedHits] = useState<SearchResponse["hits"]>(initialResults?.hits ?? []);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const isLoadMoreRef = useRef(false);
  const isFirstSearchRef = useRef(true);
  const isLoadMorePageRef = useRef(false);
  const skipSearchAfterRestoreRef = useRef(false);
  const cacheRestoreInProgressRef = useRef(false);
  const cachedScrollYRef = useRef<number | null>(null);
  const lastRestoredKeyRef = useRef<string | null>(null);
  const cacheRestoredPageRef = useRef<number | null>(null);
  const restoredKeyRef = useRef<string | null>(null);
  const syncingFromUrlRef = useRef(false);
  const facetRequestRef = useRef(0);
  const pendingPaginationScrollRef = useRef(false);
  const skipNextScrollRestoreRef = useRef(false);
  const isTypingQRef = useRef(false);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const cityInputRef = useRef<HTMLInputElement>(null);
  const typingQClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userTimeZone = useMemo(() => getUserTimeZone(), []);
  const geo = useGeolocation();
  const geoAutoApplyRef = useRef(false);

  // Auto-apply geo filter when detection completes
  useEffect(() => {
    if (geo.status === "ready" && geoAutoApplyRef.current) {
      geoAutoApplyRef.current = false;
      if (geo.filterMode === "city" && geo.city) {
        setCities([geo.city]);
        setCountryCodes(geo.countryCode ? [geo.countryCode.toLowerCase()] : []);
      } else if (geo.filterMode === "country" && geo.countryCode) {
        setCountryCodes([geo.countryCode.toLowerCase()]);
        setCities([]);
      }
      setPage(1);
    }
  }, [geo.status, geo.filterMode, geo.city, geo.countryCode]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.history.scrollRestoration !== "manual") {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("dr-filters-sidebar-open");
      if (stored !== null && window.innerWidth > 900) setSidebarOpen(stored === "true");
    } catch { /* sessionStorage unavailable */ }
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev;
      try { sessionStorage.setItem("dr-filters-sidebar-open", String(next)); } catch { /* ignore */ }
      return next;
    });
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
    if (initialTaxonomy) {
      return;
    }

    fetchJson<TaxonomyResponse>("/meta/taxonomies")
      .then(setTaxonomy)
      .catch(() => {
        // Keep search usable even if taxonomy metadata fails.
      });
  }, [initialTaxonomy]);

  const categorySingularLabel = t("admin.placeholder.categorySingular");

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
    for (const [key, value] of Object.entries(disjunctiveFacets.countryCode ?? {})) {
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
  }, [countryCodes, disjunctiveFacets.countryCode]);

  const buildQueryString = useCallback((nextPage: number) => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (practiceCategoryIds.length) params.set("practiceCategoryId", practiceCategoryIds.join(","));
    if (practiceSubcategoryId) params.set("practiceSubcategoryId", practiceSubcategoryId);
    if (eventFormatIds.length) params.set("eventFormatId", eventFormatIds.join(","));
    if (tags.length) params.set("tags", tags.join(","));
    if (languages.length) params.set("languages", languages.join(","));
    if (attendanceModes.length) params.set("attendanceMode", attendanceModes.join(","));
    if (countryCodes.length) params.set("countryCode", countryCodes.join(","));
    if (cities.length) params.set("city", cities.join(","));
    if (eventDates.length) params.set("eventDate", eventDates.join(","));
    if (customFrom) params.set("from", `${customFrom}T00:00:00.000Z`);
    if (customTo) params.set("to", `${customTo}T23:59:59.999Z`);
    params.set("tz", userTimeZone);
    params.set("sort", sort);
    if (includePast) {
      params.set("includePast", "true");
      params.set("to", new Date().toISOString());
    }
    if (showUnlisted) params.set("showUnlisted", "true");
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
    attendanceModes,
    countryCodes,
    cities,
    eventDates,
    customFrom,
    customTo,
    userTimeZone,
    sort,
    includePast,
    showUnlisted,
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
    if (attendanceModes.length) params.set("attendanceMode", attendanceModes.join(","));
    if (countryCodes.length) params.set("countryCode", countryCodes.join(","));
    if (cities.length) params.set("city", cities.join(","));
    if (eventDates.length) params.set("eventDate", eventDates.join(","));
    if (customFrom) params.set("dateFrom", customFrom);
    if (customTo) params.set("dateTo", customTo);
    if (sort !== "startsAtAsc") params.set("sort", sort);
    if (view !== "list") params.set("view", view);
    if (page > 1) params.set("page", String(page));
    if (includePast) params.set("includePast", "true");
    return params.toString();
  }, [
    q,
    practiceCategoryIds,
    practiceSubcategoryId,
    eventFormatIds,
    tags,
    languages,
    attendanceModes,
    countryCodes,
    cities,
    eventDates,
    customFrom,
    customTo,
    sort,
    view,
    page,
    includePast,
    categoryKeyById,
    eventFormatKeyById,
  ]);

  const buildFacetQueryString = useCallback((exclude: "practice" | "eventFormat" | "languages" | "attendance" | "country") => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (exclude !== "practice") {
      if (practiceCategoryIds.length) params.set("practiceCategoryId", practiceCategoryIds.join(","));
      if (practiceSubcategoryId) params.set("practiceSubcategoryId", practiceSubcategoryId);
    }
    if (exclude !== "eventFormat" && eventFormatIds.length) params.set("eventFormatId", eventFormatIds.join(","));
    if (tags.length) params.set("tags", tags.join(","));
    if (exclude !== "languages" && languages.length) params.set("languages", languages.join(","));
    if (exclude !== "attendance" && attendanceModes.length) params.set("attendanceMode", attendanceModes.join(","));
    if (exclude !== "country" && countryCodes.length) params.set("countryCode", countryCodes.join(","));
    if (cities.length) params.set("city", cities.join(","));
    if (eventDates.length) params.set("eventDate", eventDates.join(","));
    if (includePast) {
      params.set("includePast", "true");
      params.set("to", new Date().toISOString());
    }
    params.set("tz", userTimeZone);
    params.set("skipEventDateFacet", "true");
    params.set("page", "1");
    params.set("pageSize", "1");
    return params.toString();
  }, [
    q,
    practiceCategoryIds,
    practiceSubcategoryId,
    eventFormatIds,
    tags,
    languages,
    attendanceModes,
    countryCodes,
    cities,
    eventDates,
    includePast,
    userTimeZone,
  ]);

  const handleCustomFrom = useCallback((value: string) => {
    if (value && customTo && value > customTo) {
      setCustomFrom(customTo);
      setCustomTo(value);
    } else {
      setCustomFrom(value);
    }
    if (value) setEventDates([]);
    setPage(1);
  }, [customTo]);

  const handleCustomTo = useCallback((value: string) => {
    if (value && customFrom && value < customFrom) {
      setCustomTo(customFrom);
      setCustomFrom(value);
    } else {
      setCustomTo(value);
    }
    if (value) setEventDates([]);
    setPage(1);
  }, [customFrom]);

  useEffect(() => {
    const readCsv = (key: string) =>
      (searchParams.get(key) ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

    const nextQ = searchParams.get("q") ?? "";
    const practiceIdsFromUrl = [
      ...readCsv("practiceCategoryId"),
      ...readCsv("practice").map((key) => (
        taxonomy?.practices.categories.find((category) => category.key === key)?.id ?? ""
      )).filter(Boolean),
    ];
    const nextPracticeCategoryIds = Array.from(new Set(practiceIdsFromUrl));
    const nextPracticeSubcategoryId = searchParams.get("practiceSubcategoryId") ?? "";
    const eventFormatIdsFromUrl = [
      ...readCsv("eventFormatId"),
      ...readCsv("format").map((key) => taxonomy?.eventFormats?.find((format) => format.key === key)?.id ?? "")
        .filter(Boolean) as string[],
    ];
    const nextEventFormatIds = Array.from(new Set(eventFormatIdsFromUrl));
    const nextTags = readCsv("tags").map((item) => item.toLowerCase());
    const nextLanguages = readCsv("languages").map((item) => item.toLowerCase());
    const nextAttendanceModes = readCsv("attendanceMode")
      .map((item) => item.toLowerCase())
      .filter((item) => item === "in_person" || item === "online" || item === "hybrid");
    const nextCountryCodes = readCsv("countryCode").map((item) => item.toLowerCase());
    const nextCities = readCsv("city");
    const nextEventDates = readCsv("eventDate")
      .map((item) => item.toLowerCase())
      .filter((item): item is EventDatePreset => EVENT_DATE_PRESETS.includes(item as EventDatePreset));
    const nextSort = searchParams.get("sort") === "startsAtDesc" ? "startsAtDesc" : "startsAtAsc";
    const nextView = searchParams.get("view") === "map" ? "map" : "list";
    const parsedPage = Number(searchParams.get("page") ?? "1");
    let nextPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const nextIncludePast = searchParams.get("includePast") === "true";

    // If cache restored a page beyond what the URL has, preserve it
    if (cacheRestoredPageRef.current !== null) {
      nextPage = cacheRestoredPageRef.current;
      cacheRestoredPageRef.current = null;
    }

    syncingFromUrlRef.current = true;
    if (!isTypingQRef.current) setQ(nextQ);
    setPracticeCategoryIds(nextPracticeCategoryIds);
    setPracticeSubcategoryId(nextPracticeSubcategoryId);
    setEventFormatIds(nextEventFormatIds);
    setTags(nextTags);
    setLanguages(nextLanguages);
    setAttendanceModes(nextAttendanceModes);
    setCountryCodes(nextCountryCodes);
    setCities(nextCities);
    setEventDates(nextEventDates);
    setSort(nextSort);
    setView(nextView);
    setPage(nextPage);
    setIncludePast(nextIncludePast);
    window.setTimeout(() => {
      syncingFromUrlRef.current = false;
    }, 0);
  }, [searchParams, taxonomy]);

  useEffect(() => {
    if (eventDates.length > 0) setDateOpen(true);
  }, [eventDates.length]);
  useEffect(() => {
    if (practiceCategoryIds.length > 0) setPracticeOpen(true);
  }, [practiceCategoryIds.length]);
  useEffect(() => {
    if (eventFormatIds.length > 0) setEventFormatOpen(true);
  }, [eventFormatIds.length]);
  useEffect(() => {
    if (languages.length > 0) setLanguageOpen(true);
  }, [languages.length]);
  useEffect(() => {
    if (attendanceModes.length > 0) setAttendanceOpen(true);
  }, [attendanceModes.length]);
  useEffect(() => {
    if (countryCodes.length > 0) setCountryOpen(true);
  }, [countryCodes.length]);

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

    try {
      sessionStorage.setItem(
        scrollStorageKey,
        JSON.stringify({ y: window.scrollY, ts: Date.now() }),
      );
    } catch { /* sessionStorage unavailable (e.g. Safari ITP) */ }
  }, [scrollStorageKey]);

  const onNavigateAway = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      // Compute key from current URL (not stale searchParams) to match what back-nav will see
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
        accumulatedHits,
        page,
        totalHits: data?.totalHits ?? 0,
        disjunctiveFacets,
      };
      sessionStorage.setItem("search-cache-snapshot", JSON.stringify(snapshot));
    } catch { /* ignore */ }
  }, [accumulatedHits, page, data?.totalHits, disjunctiveFacets]);

  const runSearch = useCallback(async (nextPage = page) => {
    const currentQuery = buildQueryString(nextPage);
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
      const token = (showUnlisted && authRef.current.authenticated) ? await authRef.current.getToken() : null;
      const fetchInit = token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;
      const result = await fetchJson<SearchResponse>(`/events/search?${currentQuery}`, fetchInit);
      setData(result);
      if (appendMode) {
        setAccumulatedHits((prev) => [...prev, ...result.hits]);
      } else {
        setAccumulatedHits(result.hits);
      }
      setDisjunctiveFacets((current) => ({
        ...current,
        eventDate: result.facets?.eventDate ?? {},
      }));
      setActiveQueryString(currentQuery);
      setRefreshToken((value) => value + 1);
      if (pendingPaginationScrollRef.current && typeof window !== "undefined") {
        pendingPaginationScrollRef.current = false;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            scrollToTopFast(160);
          });
        });
      }
    } catch (err) {
      pendingPaginationScrollRef.current = false;
      setError(canSeeDetailedErrors && err instanceof Error ? err.message : t("eventSearch.error.searchFailed"));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [buildQueryString, canSeeDetailedErrors, page, t, showUnlisted]);

  useEffect(() => {
    // Try restoring from snapshot saved by onNavigateAway (event card click)
    if (lastRestoredKeyRef.current !== scrollStorageKey) {
      try {
        const raw = sessionStorage.getItem("search-cache-snapshot");
        if (raw) {
          const cached = JSON.parse(raw) as {
            key?: string;
            y?: number;
            ts?: number;
            accumulatedHits?: SearchResponse["hits"];
            page?: number;
            totalHits?: number;
            disjunctiveFacets?: DisjunctiveFacetState;
          };
          const age = Date.now() - (cached.ts ?? 0);
          if (
            cached.key === scrollStorageKey &&
            cached.accumulatedHits?.length &&
            typeof cached.ts === "number" &&
            age < 30 * 60 * 1000
          ) {
            sessionStorage.removeItem("search-cache-snapshot");
            lastRestoredKeyRef.current = scrollStorageKey;
            cacheRestoredPageRef.current = cached.page ?? 1;
            cacheRestoreInProgressRef.current = true;
            cachedScrollYRef.current = cached.y ?? null;
            setAccumulatedHits(cached.accumulatedHits);
            setPage(cached.page ?? 1);
            isLoadMorePageRef.current = true;
            skipSearchAfterRestoreRef.current = true;
            setData({
              hits: cached.accumulatedHits.slice(-20),
              totalHits: cached.totalHits ?? 0,
              pagination: {
                page: cached.page ?? 1,
                pageSize: 20,
                totalPages: Math.ceil((cached.totalHits ?? 0) / 20),
              },
            });
            if (cached.disjunctiveFacets) {
              setDisjunctiveFacets(cached.disjunctiveFacets);
            }
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
    }, 400);

    return () => {
      clearTimeout(timer);
    };
  }, [runSearch, page, scrollStorageKey]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const requestId = facetRequestRef.current + 1;
      facetRequestRef.current = requestId;

      void Promise.all([
        fetchJson<SearchResponse>(`/events/search?${buildFacetQueryString("practice")}`),
        fetchJson<SearchResponse>(`/events/search?${buildFacetQueryString("eventFormat")}`),
        fetchJson<SearchResponse>(`/events/search?${buildFacetQueryString("languages")}`),
        fetchJson<SearchResponse>(`/events/search?${buildFacetQueryString("attendance")}`),
        fetchJson<SearchResponse>(`/events/search?${buildFacetQueryString("country")}`),
      ]).then(([practiceResult, eventFormatResult, languageResult, attendanceResult, countryResult]) => {
        if (requestId !== facetRequestRef.current) {
          return;
        }
        setDisjunctiveFacets((current) => ({
          practiceCategoryId: practiceResult?.facets?.practiceCategoryId ?? {},
          eventFormatId: eventFormatResult?.facets?.eventFormatId ?? {},
          languages: languageResult?.facets?.languages ?? {},
          attendanceMode: attendanceResult?.facets?.attendanceMode ?? {},
          countryCode: countryResult?.facets?.countryCode ?? {},
          eventDate: current.eventDate,
        }));
      }).catch(() => {
        if (requestId !== facetRequestRef.current) {
          return;
        }
        setDisjunctiveFacets((current) => ({
          practiceCategoryId: {},
          eventFormatId: {},
          languages: {},
          attendanceMode: {},
          countryCode: {},
          eventDate: current.eventDate,
        }));
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [buildFacetQueryString]);

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
    }, 400);
    return () => clearTimeout(timer);
  }, [buildUiQueryString, pathname]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (skipNextScrollRestoreRef.current) {
      skipNextScrollRestoreRef.current = false;
      return;
    }

    // Wait until search results are loaded before restoring scroll
    if (!data) {
      return;
    }

    if (restoredKeyRef.current === scrollStorageKey) {
      return;
    }
    restoredKeyRef.current = scrollStorageKey;

    // Only restore scroll from cache restore ref (set during cache restore flow)
    let scrollY: number | null = null;
    if (cachedScrollYRef.current !== null) {
      scrollY = cachedScrollYRef.current;
      cachedScrollYRef.current = null;
      cacheRestoreInProgressRef.current = false;
      // scroll position from cache restore
    }

    if (scrollY != null && scrollY > 0) {
      // Delay scroll restore to let hero collapse and layout settle after state updates
      setTimeout(() => {
        window.scrollTo(0, scrollY);
      }, 50);
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
    setTimeDisplayMode(readTimeDisplayMode());
  }, []);

  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 800);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!loading && !loadingMore) setPendingKey(null);
  }, [loading, loadingMore]);

  useEffect(() => {
    writeTimeDisplayMode(timeDisplayMode);
  }, [timeDisplayMode]);

  const clearSearchCache = useCallback(() => {
    try { sessionStorage.removeItem("search-cache-snapshot"); } catch { /* ignore */ }
  }, []);

  function clearFilters() {
    setQ("");
    setPracticeCategoryIds([]);
    setPracticeSubcategoryId("");
    setEventFormatIds([]);
    setTags([]);
    setTagQuery("");
    setLanguages([]);
    setAttendanceModes([]);
    setCountryCodes([]);
    setCities([]);
    setCityQuery("");
    setEventDates([]);
    setCustomFrom("");
    setCustomTo("");
    setDateRangeOpen(false);
    setIncludePast(false);
    setPage(1);
    setSort("startsAtAsc");
    clearSearchCache();
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
      const count = disjunctiveFacets.practiceCategoryId[category.id] ?? 0;
      return count > 0 || selectedSet.has(category.id);
    });
    return filtered.sort((a, b) => a.label.localeCompare(b.label));
  }, [disjunctiveFacets.practiceCategoryId, practiceCategoryIds, taxonomy]);
  const visibleEventLanguageFacets = useMemo(() => {
    const selectedSet = new Set(languages);
    const merged = new Map<string, number>();
    for (const [key, value] of Object.entries(disjunctiveFacets.languages ?? {})) {
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
  }, [disjunctiveFacets.languages, languages]);
  const visibleEventDateFacets = useMemo(() => {
    const counts = disjunctiveFacets.eventDate ?? {};
    return EVENT_DATE_PRESETS.map((preset) => ({
      key: preset,
      count: counts[preset] ?? 0,
      checked: eventDates.includes(preset),
    }));
  }, [disjunctiveFacets.eventDate, eventDates]);
  const selectedFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];

    if (q.trim()) {
      chips.push({
        key: "q",
        label: `"${q.trim()}"`,
        onRemove: () => { setQ(""); setPage(1); },
      });
    }

    for (const categoryId of practiceCategoryIds) {
      chips.push({
        key: `cat:${categoryId}`,
        label: categoryLabelById.get(categoryId) ?? categoryId,
        onRemove: () => {
          setPracticeCategoryIds((current) => current.filter((item) => item !== categoryId));
          setPage(1);
        },
      });
    }
    for (const formatId of eventFormatIds) {
      const fmt = taxonomy?.eventFormats?.find((format) => format.id === formatId);
      const label = fmt ? getFormatLabel(fmt.key, fmt.label, t) : formatId;
      chips.push({
        key: `format:${formatId}`,
        label: label,
        onRemove: () => {
          setEventFormatIds((current) => current.filter((item) => item !== formatId));
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
    for (const attendanceMode of attendanceModes) {
      chips.push({
        key: `attendance:${attendanceMode}`,
        label: t(`eventSearch.attendance.${attendanceMode}`),
        onRemove: () => {
          setAttendanceModes((current) => current.filter((item) => item !== attendanceMode));
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
        label: toTitleCase(tag),
        onRemove: () => {
          setTags((current) => current.filter((item) => item !== tag));
          setPage(1);
        },
      });
    }
    for (const city of cities) {
      chips.push({
        key: `city:${city}`,
        label: toTitleCase(city),
        onRemove: () => {
          setCities((current) => current.filter((item) => item !== city));
          setPage(1);
        },
      });
    }
    for (const eventDate of eventDates) {
      chips.push({
        key: `date:${eventDate}`,
        label: t(`eventSearch.eventDateOption.${eventDate}`),
        onRemove: () => {
          setEventDates((current) => current.filter((item) => item !== eventDate));
          setPage(1);
        },
      });
    }
    if (customFrom || customTo) {
      const fromLabel = customFrom ? new Date(`${customFrom}T12:00:00Z`).toLocaleDateString(locale, { month: "short", day: "numeric" }) : "";
      const toLabel = customTo ? new Date(`${customTo}T12:00:00Z`).toLocaleDateString(locale, { month: "short", day: "numeric" }) : "";
      const label = customFrom && customTo
        ? `${fromLabel} – ${toLabel}`
        : customFrom ? `${t("eventSearch.dateFrom")} ${fromLabel}`
        : `${t("eventSearch.dateTo")} ${toLabel}`;
      chips.push({
        key: "customRange",
        label,
        onRemove: () => { setCustomFrom(""); setCustomTo(""); setPage(1); },
      });
    }
    if (includePast) {
      chips.push({
        key: "includePast",
        label: t("eventSearch.includePast"),
        onRemove: () => { setIncludePast(false); setPage(1); },
      });
    }
    return chips;
  }, [
    q,
    categoryLabelById,
    countryCodes,
    eventFormatIds,
    getCountryLabel,
    getLanguageLabel,
    attendanceModes,
    languages,
    practiceCategoryIds,
    t,
    tags,
    cities,
    eventDates,
    includePast,
    customFrom,
    customTo,
    locale,
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

  function toTitleCase(str: string): string {
    return str.replace(/\S+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
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

  const visibleTagSuggestions = useMemo(
    () => tagSuggestions.filter((item) => !tags.includes(item.tag)),
    [tagSuggestions, tags],
  );
  const dateFormatHint = useMemo(() => {
    try {
      const parts = new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(2013, 10, 25));
      return parts.map((p) => p.type === "year" ? "yyyy" : p.type === "month" ? "mm" : p.type === "day" ? "dd" : p.value).join("");
    } catch {
      return "dd/mm/yyyy";
    }
  }, [locale]);

  const visibleCitySuggestions = useMemo(
    () => citySuggestions.filter((item) => !cities.some((city) => city.toLowerCase() === item.city.toLowerCase())),
    [citySuggestions, cities],
  );

  const activeFilterCount = selectedFilterChips.length;

  const heroCollapsed = !!(
    q ||
    practiceCategoryIds.length ||
    practiceSubcategoryId ||
    eventFormatIds.length ||
    tags.length ||
    languages.length ||
    attendanceModes.length ||
    countryCodes.length ||
    cities.length ||
    eventDates.length ||
    customFrom ||
    customTo ||
    includePast
  );

  const topPracticePills = useMemo(() => {
    if (!taxonomy) return [];
    return [...taxonomy.practices.categories]
      .map((cat) => ({
        id: cat.id,
        label: cat.label,
        key: cat.key ?? cat.id,
        count: disjunctiveFacets.practiceCategoryId[cat.id] ?? 0,
      }))
      .filter((cat) => cat.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
  }, [taxonomy, disjunctiveFacets.practiceCategoryId]);

  const thisWeekendCount = disjunctiveFacets.eventDate["this_weekend"] ?? 0;

  return (
    <>
      <div className={heroCollapsed ? "hero hero-collapsed" : "hero"}>
        <h1 className="hero-heading">{t("eventSearch.hero.heading")}</h1>
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
            placeholder={t("eventSearch.hero.placeholder")}
            autoComplete="off"
          />
          <button type="submit" className="primary-btn">
            {t("eventSearch.search")}
          </button>
        </form>
        <div className="hero-collapsible">
            <div className="hero-pills">
              {/* Geo pill */}
              {geo.status === "idle" && (
                <button
                  type="button"
                  className="hero-pill hero-pill-geo"
                  onClick={() => { geoAutoApplyRef.current = true; geo.detect(); }}
                >
                  {t("eventSearch.hero.nearYou")}
                </button>
              )}
              {geo.status === "detecting" && (
                <button type="button" className="hero-pill hero-pill-geo" disabled>
                  {t("eventSearch.hero.detecting")}
                </button>
              )}
              {geo.status === "no_events" && (
                <span className="hero-pill hero-pill-geo" style={{ opacity: 0.6, cursor: "default" }}>
                  {t("eventSearch.hero.noEventsNearby")}
                </span>
              )}
              {geo.status === "ready" && geo.countryCode && (
                <button
                  type="button"
                  className={
                    countryCodes.includes(geo.countryCode.toLowerCase())
                      ? "hero-pill hero-pill-geo hero-pill-active"
                      : "hero-pill hero-pill-geo"
                  }
                  onClick={() => {
                    if (geo.filterMode === "city" && geo.city) {
                      setCities([geo.city]);
                      setCountryCodes(geo.countryCode ? [geo.countryCode.toLowerCase()] : []);
                    } else if (geo.countryCode) {
                      setCountryCodes([geo.countryCode.toLowerCase()]);
                      setCities([]);
                    }
                    setPage(1);
                  }}
                >
                  {t("eventSearch.hero.eventsIn", { city: geo.city ?? geo.countryCode })} <span className="hero-pill-count">({geo.eventCount.toLocaleString()})</span>
                </button>
              )}
              {/* This weekend — right after geo */}
              {thisWeekendCount > 0 && (
                <button
                  type="button"
                  className={eventDates.includes("this_weekend") ? "hero-pill hero-pill-active" : "hero-pill"}
                  onClick={() => {
                    setEventDates((current) =>
                      current.includes("this_weekend")
                        ? current.filter((d) => d !== "this_weekend")
                        : [...current, "this_weekend" as EventDatePreset]
                    );
                    setCustomFrom("");
                    setCustomTo("");
                    setPage(1);
                  }}
                >
                  {t("eventSearch.hero.thisWeekend")} <span className="hero-pill-count">({thisWeekendCount.toLocaleString()})</span>
                </button>
              )}
              {/* Practice category pills */}
              {topPracticePills.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className={practiceCategoryIds.includes(cat.id) ? "hero-pill hero-pill-active" : "hero-pill"}
                  onClick={() => {
                    setPracticeCategoryIds((current) =>
                      current.includes(cat.id)
                        ? current.filter((id) => id !== cat.id)
                        : [...current, cat.id]
                    );
                    setPage(1);
                  }}
                >
                  {cat.label} <span className="hero-pill-count">({cat.count.toLocaleString()})</span>
                </button>
              ))}
            </div>
            {data && data.totalHits > 0 && (
              <div className="hero-stats">
                {t("eventSearch.hero.statsCount", { count: data.totalHits })}
              </div>
            )}
        </div>
      </div>
      <section className={sidebarOpen ? "grid sidebar-open" : "grid"}>
      {sidebarOpen && (
        <div
          className="filters-overlay"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}
      <aside className="panel filters">
        <h2 className="title-xl">
          {t("eventSearch.title")}
          {data && (
            <span className="filters-panel-count">{t("eventSearch.resultsCount", { count: data.totalHits })}</span>
          )}
        </h2>
        <input
          value={q}
          onChange={(event) => {
            isTypingQRef.current = true;
            if (typingQClearRef.current) clearTimeout(typingQClearRef.current);
            typingQClearRef.current = setTimeout(() => { isTypingQRef.current = false; }, 800);
            setQ(event.target.value);
            setPage(1);
            clearSearchCache();
          }}
          placeholder={t("eventSearch.placeholder.searchTitle")}
        />
        <details open={dateOpen} onToggle={(event) => setDateOpen((event.currentTarget as HTMLDetailsElement).open)}>
          <summary>{t("eventSearch.eventDate")}</summary>
          <div className="kv">
            {visibleEventDateFacets.map((item) => (
              <button
                type="button"
                className={"filter-row" + (item.checked ? " filter-row-selected" : "")}
                key={item.key}
                onClick={() => {
                  setPendingKey(`eventDate:${item.key}`);
                  setEventDates((current) => (
                    current.includes(item.key)
                      ? current.filter((value) => value !== item.key)
                      : [...current, item.key]
                  ));
                  setCustomFrom("");
                  setCustomTo("");
                  setPage(1);
                }}
              >
                <span className="filter-row-icon">{pendingKey === `eventDate:${item.key}` ? <span className="filter-spinner" /> : (item.checked ? "\u2212" : "+")}</span>
                <span className="filter-row-label">{t(`eventSearch.eventDateOption.${item.key}`)}</span>
                <span className="filter-row-count">{item.count}</span>
              </button>
            ))}
            <button
              type="button"
              className={"filter-row" + ((customFrom || customTo) ? " filter-row-selected" : "")}
              onClick={() => {
                if (dateRangeOpen) {
                  setDateRangeOpen(false);
                  setCustomFrom("");
                  setCustomTo("");
                  setPage(1);
                } else {
                  setDateRangeOpen(true);
                }
              }}
            >
              <span className="filter-row-icon">{dateRangeOpen ? "\u2212" : "+"}</span>
              <span className="filter-row-label">{t("eventSearch.dateRange")}</span>
              <span className="filter-row-count" />
            </button>
            {dateRangeOpen && (
              <div className="date-range-inputs">
                <label className="date-range-label">
                  <span>{t("eventSearch.dateFrom")}</span>
                  <div className="date-input-wrap">
                    <input
                      type="date"
                      className="date-range-input"
                      value={customFrom}
                      max={customTo || undefined}
                      onChange={(e) => handleCustomFrom(e.target.value)}
                    />
                    {!customFrom && <span className="date-input-placeholder">{dateFormatHint}</span>}
                  </div>
                </label>
                <label className="date-range-label">
                  <span>{t("eventSearch.dateTo")}</span>
                  <div className="date-input-wrap">
                    <input
                      type="date"
                      className="date-range-input"
                      value={customTo}
                      min={customFrom || undefined}
                      onChange={(e) => handleCustomTo(e.target.value)}
                    />
                    {!customTo && <span className="date-input-placeholder">{dateFormatHint}</span>}
                  </div>
                </label>
              </div>
            )}
            <button
              type="button"
              className={"filter-row" + (includePast ? " filter-row-selected" : "")}
              onClick={() => {
                const next = !includePast;
                setIncludePast(next);
                setSort(next ? "startsAtDesc" : "startsAtAsc");
                setCustomFrom("");
                setCustomTo("");
                setPage(1);
              }}
            >
              <span className="filter-row-icon">{includePast ? "\u2212" : "+"}</span>
              <span className="filter-row-label">{t("eventSearch.includePast")}</span>
              <span className="filter-row-count" />
            </button>
          </div>
        </details>
        <details
          open={attendanceOpen}
          onToggle={(event) => setAttendanceOpen((event.currentTarget as HTMLDetailsElement).open)}
        >
          <summary>{t("eventSearch.attendance.anyEventType")}</summary>
          <div className="kv">
            {(["in_person", "online", "hybrid"] as const).map((mode) => {
              const count = disjunctiveFacets.attendanceMode?.[mode] ?? 0;
              const checked = attendanceModes.includes(mode);
              if (count <= 0 && !checked) {
                return null;
              }
              return (
                <button
                  type="button"
                  className={"filter-row" + (checked ? " filter-row-selected" : "")}
                  key={mode}
                  onClick={() => {
                    setPendingKey(`attendance:${mode}`);
                    setAttendanceModes((current) => (
                      current.includes(mode)
                        ? current.filter((item) => item !== mode)
                        : [...current, mode]
                    ));
                    setPage(1);
                  }}
                >
                  <span className="filter-row-icon">{pendingKey === `attendance:${mode}` ? <span className="filter-spinner" /> : (checked ? "\u2212" : "+")}</span>
                  <span className="filter-row-label">{t(`eventSearch.attendance.${mode}`)}</span>
                  <span className="filter-row-count">{count}</span>
                </button>
              );
            })}
          </div>
        </details>
        <details
          open={practiceOpen}
          onToggle={(event) => setPracticeOpen((event.currentTarget as HTMLDetailsElement).open)}
        >
          <summary>{categorySingularLabel}</summary>
          <div className="filter-scroll">
            {visibleCategories.map((category) => {
              const checked = practiceCategoryIds.includes(category.id);
              const count = disjunctiveFacets.practiceCategoryId[category.id] ?? 0;
              return (
                <button
                  type="button"
                  className={"filter-row" + (checked ? " filter-row-selected" : "")}
                  key={category.id}
                  onClick={() => {
                    setPendingKey(`practice:${category.id}`);
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
                >
                  <span className="filter-row-icon">{pendingKey === `practice:${category.id}` ? <span className="filter-spinner" /> : (checked ? "\u2212" : "+")}</span>
                  <span className="filter-row-label">{category.label}</span>
                  <span className="filter-row-count">{count}</span>
                </button>
              );
            })}
          </div>
        </details>
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
          <details
            open={eventFormatOpen}
            onToggle={(event) => setEventFormatOpen((event.currentTarget as HTMLDetailsElement).open)}
          >
            <summary>{t("eventSearch.eventFormat")}</summary>
            <div className="kv">
              {taxonomy?.eventFormats?.map((format) => {
                const checked = eventFormatIds.includes(format.id);
                const count = disjunctiveFacets.eventFormatId[format.id] ?? 0;
                if (count <= 0 && !checked) {
                  return null;
                }
                return (
                  <button
                    type="button"
                    className={"filter-row" + (checked ? " filter-row-selected" : "")}
                    key={format.id}
                    onClick={() => {
                      setPendingKey(`format:${format.id}`);
                      setEventFormatIds((current) => (
                        current.includes(format.id)
                          ? current.filter((item) => item !== format.id)
                          : [...current, format.id]
                      ));
                      setPage(1);
                    }}
                  >
                    <span className="filter-row-icon">{pendingKey === `format:${format.id}` ? <span className="filter-spinner" /> : (checked ? "\u2212" : "+")}</span>
                    <span className="filter-row-label">{getFormatLabel(format.key, format.label, t)}</span>
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
          <summary>{t("eventSearch.eventLanguage")}</summary>
          <div className="filter-scroll">
            {[...visibleEventLanguageFacets].sort((a, b) => getLanguageLabel(a[0]).localeCompare(getLanguageLabel(b[0]))).map(([value, count]) => {
              const checked = languages.includes(value);
              return (
                <button
                  type="button"
                  className={"filter-row" + (checked ? " filter-row-selected" : "")}
                  key={value}
                  onClick={() => {
                    setPendingKey(`language:${value}`);
                    setLanguages((current) => (
                      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
                    ));
                    setPage(1);
                  }}
                >
                  <span className="filter-row-icon">{pendingKey === `language:${value}` ? <span className="filter-spinner" /> : (checked ? "\u2212" : "+")}</span>
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
          <summary>{t("eventSearch.country")}</summary>
          <div className="filter-scroll">
            {[...visibleCountryFacets].sort((a, b) => getCountryLabel(a.value).localeCompare(getCountryLabel(b.value))).map(({ value, count }) => {
              const checked = countryCodes.includes(value);
              return (
                <button
                  type="button"
                  className={"filter-row" + (checked ? " filter-row-selected" : "")}
                  key={value}
                  onClick={() => {
                    setPendingKey(`country:${value}`);
                    setCountryCodes((current) => (
                      current.includes(value)
                        ? current.filter((item) => item !== value)
                        : [...current, value]
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
                cityInputRef.current?.blur();
              }
            }}
            placeholder={t("eventSearch.placeholder.city")}
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
                    cityInputRef.current?.blur();
                  }}
                >
                  {toTitleCase(item.city)} ({item.count})
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
                {toTitleCase(item)} ×
              </button>
            ))}
          </div>
        )}
        <div className="autocomplete-wrap">
          <input
            ref={tagInputRef}
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
                tagInputRef.current?.blur();
              }
            }}
            placeholder={t("eventSearch.tags")}
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
                    tagInputRef.current?.blur();
                  }}
                >
                  {toTitleCase(item.tag)} ({item.count})
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
                {toTitleCase(item)} ×
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
            <span className="meta" suppressHydrationWarning>
              <span>{timeDisplayMode === "event" ? t("eventSearch.timeMode.event") : t("eventSearch.timeMode.user")}</span>
              <span className="toggle-tz-secondary">
                ({timeDisplayMode === "event" ? t("common.eventTimezone") : formatTimeZone(userTimeZone)})
              </span>
            </span>
          </label>
        </div>
        {isEditor && (
          <label className="meta">
            <input
              type="checkbox"
              checked={showUnlisted}
              onChange={(e) => {
                setShowUnlisted(e.target.checked);
                setPage(1);
              }}
            />
            {" Show unlisted"}
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
              ? t("eventSearch.resultsCount", { count: data.totalHits })
              : t("eventSearch.promptRun")}
          </div>
          <div className="results-toolbar-actions">
            <div className="icon-group">
            <button
              type="button"
              className={sort === "startsAtAsc" ? "secondary-btn icon-btn" : "ghost-btn icon-btn"}
              onClick={() => {
                setSort("startsAtAsc");
                setPage(1);
              }}
              aria-label={t("eventSearch.sort.soonestUpcoming")}
            >
              <svg aria-hidden width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 11V3M3.5 6.5L7 3l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <button
              type="button"
              className={sort === "startsAtDesc" ? "secondary-btn icon-btn" : "ghost-btn icon-btn"}
              onClick={() => {
                setSort("startsAtDesc");
                setPage(1);
              }}
              aria-label={t("eventSearch.sort.newestPublished")}
            >
              <svg aria-hidden width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 3v8M3.5 7.5L7 11l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            </div>
            <div className="icon-group with-separator">
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
        {selectedFilterChips.length > 0 && (
          <div className="filter-chips">
            {selectedFilterChips.map((chip) => (
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
          <LeafletClusterMap
            queryString={activeQueryString}
            refreshToken={refreshToken}
            timeDisplayMode={timeDisplayMode}
          />
        ) : null}

        <div className="cards-content">
          {loading && !loadingMore && accumulatedHits.length > 0 && (
            <div className="cards-loading-overlay">
              <div className="filter-spinner" />
            </div>
          )}
        <div className="card-list">
        {view === "list" ? (
          accumulatedHits.map((hit) => {
            const formatted = formatDateTimeRange(
              hit.startsAtUtc,
              hit.endsAtUtc,
              hit.event.eventTimezone ?? "UTC",
              timeDisplayMode,
            );

            const catKey = categoryKeyById.get(hit.event.practiceCategoryId) ?? "other";
            const catLabel = categoryLabelById.get(hit.event.practiceCategoryId);
            const locationParts = (() => {
              if (hit.location?.city || hit.location?.country_code) {
                return [
                  hit.location?.city ?? "",
                  hit.location?.country_code ? getCountryLabel(hit.location.country_code) : "",
                ].filter(Boolean).join(", ");
              }
              if (hit.event.attendanceMode === "online") return t("eventSearch.locationOnline");
              return t("eventSearch.locationTbd");
            })();
            const organizerNames = hit.organizers?.map((o) => o.name).join(", ");
            const extraPills = [
              ...hit.event.languages.map((l) => getLanguageLabel(l)),
              ...hit.event.tags,
            ];
            const visiblePills = extraPills;
            const overflowCount = 0;

            return (
              <Link
                className="card event-card-h"
                key={hit.occurrenceId}
                href={`/events/${hit.event.slug}`}
                onClick={onNavigateAway}
              >
                <div className="event-card-main">
                  <div
                    className="event-card-thumb-h"
                    style={{ background: hit.event.coverImageUrl ? undefined : `var(--category-${catKey}, var(--surface-skeleton))` }}
                  >
                    {hit.event.coverImageUrl ? (
                      <img
                        className="event-card-thumb"
                        src={hit.event.coverImageUrl}
                        alt={hit.event.title}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <img className="event-card-fallback-logo" src="/logo.jpg" alt="" aria-hidden />
                    )}
                  </div>
                  <div className="event-card-body">
                    <h3>
                      {hit.event.title}
                      {hit.event.visibility === "unlisted" && (
                        <span className="tag" style={{ marginLeft: "0.5em", fontSize: "0.75em" }}>Unlisted</span>
                      )}
                    </h3>
                    <div
                      className="meta"
                      title={formatted.suffixLabel === "event" ? t("common.eventTimezone") : t("common.yourTimezone")}
                      suppressHydrationWarning
                    >
                      {formatted.primary} · {t(`attendanceMode.${hit.event.attendanceMode}`)}
                    </div>
                    {locationParts && (
                      <div className="meta">{locationParts}</div>
                    )}
                    {organizerNames && (
                      <div className="meta">{organizerNames}</div>
                    )}
                  </div>
                </div>
                {(catLabel || visiblePills.length > 0) && (
                  <div className="kv event-card-pills">
                    {catLabel && (
                      <span
                        className="tag tag-practice"
                      >
                        {catLabel}
                      </span>
                    )}
                    {visiblePills.map((pill, i) => (
                      <span className="tag" key={i}>{pill}</span>
                    ))}
                    {overflowCount > 0 && (
                      <span className="tag muted">+{overflowCount}</span>
                    )}
                  </div>
                )}
              </Link>
            );
          })
        ) : null}
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
              {t("common.pagination.showingOf", { shown: accumulatedHits.length, total: data.totalHits })}
            </div>
          </div>
        )}
      </div>
      <button
        className={showBackToTop ? "back-to-top visible" : "back-to-top"}
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        aria-label="Back to top"
      >
        <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 12V4M4 8l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
    </section>
    </>
  );
}
