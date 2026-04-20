"use client";

import type { GeoJsonObject } from "geojson";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchJson } from "../lib/api";
import { formatDateTimeRange, type TimeDisplayMode } from "../lib/datetime";
import { isSeriesGroupingEnabled } from "../lib/features";
import { pushDataLayer } from "../lib/gtm";
import { labelForLanguageCode } from "../lib/i18n/languageLabels";
import { getLocalizedRegionLabel, getLocalizedLanguageLabel } from "../lib/i18n/icuFallback";
import { scrollToTopFast } from "../lib/scroll";
import { formatTimeZone, getUserTimeZone, readTimeDisplayMode, writeTimeDisplayMode } from "../lib/timeDisplay";
import { useGeolocation } from "../lib/useGeolocation";
import { alpha2ToAlpha3 } from "../lib/countryAlpha3";
import { useKeycloakAuth } from "./auth/KeycloakAuthProvider";
import type { ResolvedFilters } from "./discover/discoverTypes";
import { NotifyMeButton } from "./NotifyMeButton";
import { SaveEventButton } from "./SaveEventButton";
import { useI18n } from "./i18n/I18nProvider";
import type { MapCircleOverlay, MapCountryOverlay } from "./LeafletClusterMap";

const DiscoverWizard = dynamic(() => import("./discover/DiscoverWizard").then((m) => ({ default: m.DiscoverWizard })), { ssr: false });


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
      scheduleKind?: "single" | "recurring";
      siblingCount?: number;
      seriesId?: string;
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
  disjunctiveFacets?: {
    practiceCategoryId?: Record<string, number>;
    eventFormatId?: Record<string, number>;
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
  attendanceModes?: string[];
  countryCodes?: string[];
  cities?: string[];
  eventDates?: EventDatePreset[];
  sort?: "startsAtAsc" | "startsAtDesc" | "publishedAtDesc" | "relevance";
  view?: "list" | "map" | "discover";
  page?: number;
  includePast?: boolean;
  dateFrom?: string;
  dateTo?: string;
  geoRadius?: number;
};

type EventDatePreset =
  | "today"
  | "tomorrow"
  | "this_weekend"
  | "this_week"
  | "next_weekend"
  | "next_week"
  | "this_month"
  | "next_month";

const EVENT_DATE_PRESETS: EventDatePreset[] = [
  "today",
  "tomorrow",
  "this_weekend",
  "this_week",
  "next_weekend",
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

import { getFormatLabel, toTitleCase as toTitleCaseHelper } from "../lib/filterHelpers";

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
    role === "editor" || role === "admin"
  );
  const canSeeDetailedErrors = isEditor;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [view, setView] = useState<"list" | "map" | "discover">(initialQuery?.view ?? "list");
  const [sort, setSort] = useState<"startsAtAsc" | "startsAtDesc" | "publishedAtDesc" | "relevance">(initialQuery?.sort ?? "startsAtAsc");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const [q, setQ] = useState(initialQuery?.q ?? "");
  const [practiceCategoryIds, setPracticeCategoryIds] = useState(initialQuery?.practiceCategoryIds ?? []);
  const [practiceSubcategoryId, setPracticeSubcategoryId] = useState(initialQuery?.practiceSubcategoryId ?? "");
  const [eventFormatIds, setEventFormatIds] = useState(initialQuery?.eventFormatIds ?? []);
  const [tags, setTags] = useState<string[]>(initialQuery?.tags ?? []);
  const [tagSuggestions, setTagSuggestions] = useState<Array<{ tag: string; display: string; count: number }>>([]);
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
  const [tagQuery, setTagQuery] = useState("");
  const [tagSuggestionsOpen, setTagSuggestionsOpen] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const [citySuggestions, setCitySuggestions] = useState<Array<{ city: string; count: number }>>([]);
  const [citySuggestionsOpen, setCitySuggestionsOpen] = useState(false);
  const [page, setPage] = useState<number>(initialQuery?.page ?? 1);
  const [includePast, setIncludePast] = useState(initialQuery?.includePast ?? false);
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
  const [timeDisplayMode, setTimeDisplayMode] = useState<TimeDisplayMode>("event");
  const [dateOpen, setDateOpen] = useState(true);
  const [dateRangeOpen, setDateRangeOpen] = useState(!!(initialQuery?.dateFrom) || !!(initialQuery?.dateTo));
  const [practiceOpen, setPracticeOpen] = useState((initialQuery?.practiceCategoryIds?.length ?? 0) > 0);
  const [eventFormatOpen, setEventFormatOpen] = useState((initialQuery?.eventFormatIds?.length ?? 0) > 0);
  const [languageOpen, setLanguageOpen] = useState((initialQuery?.languages?.length ?? 0) > 0);
  const [attendanceOpen, setAttendanceOpen] = useState((initialQuery?.attendanceModes?.length ?? 0) > 0);
  const [countryOpen, setCountryOpen] = useState((initialQuery?.countryCodes?.length ?? 0) > 0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarSkipTransition, setSidebarSkipTransition] = useState(false);
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
  const filterTrackMountedRef = useRef(false);
  const pendingPaginationScrollRef = useRef(false);
  const skipNextScrollRestoreRef = useRef(false);
  const isTypingQRef = useRef(false);
  const cityInputRef = useRef<HTMLInputElement>(null);
  const typingQClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userTimeZone = useMemo(() => getUserTimeZone(), []);
  const geo = useGeolocation();
  const [geoRadius, setGeoRadius] = useState<number | null>(initialQuery?.geoRadius ?? null);
  const geoAutoApplyRef = useRef(false);
  const geoRadiusPendingRef = useRef<number | null>(initialQuery?.geoRadius ?? null);

  // Auto-apply geo filter when detection completes
  useEffect(() => {
    if (geo.status === "ready" && geoAutoApplyRef.current) {
      geoAutoApplyRef.current = false;
      if (geoRadiusPendingRef.current) {
        // Geo radius mode — apply radius and clear country/city
        setGeoRadius(geoRadiusPendingRef.current);
        setCountryCodes([]);
        setCities([]);
        setCityQuery("");
        geoRadiusPendingRef.current = null;
      } else if (geo.filterMode === "city" && geo.city) {
        setCities([geo.city]);
        setCountryCodes(geo.countryCode ? [geo.countryCode.toLowerCase()] : []);
      } else if (geo.filterMode === "country" && geo.countryCode) {
        setCountryCodes([geo.countryCode.toLowerCase()]);
        setCities([]);
      }
      setPage(1);
    }
  }, [geo.status, geo.filterMode, geo.city, geo.countryCode]);

  // Auto-trigger geo detection on mount if geoRadius was set from URL
  useEffect(() => {
    if (geoRadius && geo.status === "idle") {
      geoAutoApplyRef.current = true;
      geoRadiusPendingRef.current = geoRadius;
      geo.detect();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && window.history.scrollRestoration !== "manual") {
      window.history.scrollRestoration = "manual";
    }
  }, []);

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

  const handleDiscoverComplete = useCallback((filters: ResolvedFilters) => {
    setPracticeCategoryIds(filters.practiceCategoryIds);
    setEventFormatIds(filters.eventFormatIds);
    setTags(filters.tags);
    setEventDates(filters.eventDates);
    setAttendanceModes(filters.attendanceModes);
    if (filters.geoRadius) {
      setGeoRadius(filters.geoRadius);
      setCountryCodes([]);
      setCities([]);
    } else {
      setGeoRadius(null);
      setCountryCodes(filters.countryCodes);
      setCities(filters.cities);
    }
    setView("list");
    setPage(1);
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
    (value: string) => getLocalizedLanguageLabel(value, locale, languageNames),
    [languageNames, locale],
  );
  const getCountryLabel = useCallback((value: string) => {
    return getLocalizedRegionLabel(value, locale, regionNames);
  }, [regionNames, locale]);
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
    if (geoRadius && geo.lat != null && geo.lng != null) {
      params.set("geoLat", String(geo.lat));
      params.set("geoLng", String(geo.lng));
      params.set("geoRadius", String(geoRadius));
    } else {
      if (countryCodes.length) params.set("countryCode", countryCodes.join(","));
      if (cities.length) params.set("city", cities.join(","));
    }
    if (eventDates.length) params.set("eventDate", eventDates.join(","));
    if (customFrom) params.set("from", `${customFrom}T00:00:00.000Z`);
    if (customTo) params.set("to", `${customTo}T23:59:59.999Z`);
    params.set("tz", userTimeZone);
    params.set("sort", sort);
    if (includePast) {
      params.set("includePast", "true");
      params.set("to", new Date().toISOString());
    }
    params.set("page", String(nextPage));
    params.set("pageSize", "20");
    params.set("disjunctiveFacets", "practice,eventFormat,languages,attendance,country");
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
    geoRadius,
    geo.lat,
    geo.lng,
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
    if (geoRadius) {
      params.set("nearMe", String(geoRadius / 1000));
    } else {
      if (countryCodes.length) params.set("countryCode", countryCodes.join(","));
      if (cities.length) params.set("city", cities.join(","));
    }
    if (eventDates.length) params.set("eventDate", eventDates.join(","));
    if (customFrom) params.set("dateFrom", customFrom);
    if (customTo) params.set("dateTo", customTo);
    {
      const sortParam =
        sort === "startsAtDesc" ? "latest"
          : sort === "publishedAtDesc" ? "recent"
            : sort === "relevance" ? "relevance"
              : null;
      if (sortParam) params.set("sort", sortParam);
    }
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
    geoRadius,
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
    const sortRaw = (searchParams.get("sort") ?? "").toLowerCase();
    const nextSort: "startsAtAsc" | "startsAtDesc" | "publishedAtDesc" | "relevance" =
      sortRaw === "latest" || sortRaw === "startsatdesc" ? "startsAtDesc"
        : sortRaw === "recent" || sortRaw === "publishedatdesc" ? "publishedAtDesc"
          : sortRaw === "relevance" ? "relevance"
            : "startsAtAsc";
    const nextView = searchParams.get("view") === "map" ? "map" : searchParams.get("view") === "discover" ? "discover" : "list";
    const parsedPage = Number(searchParams.get("page") ?? "1");
    let nextPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const nextIncludePast = searchParams.get("includePast") === "true";
    const nearMeKm = Number(searchParams.get("nearMe"));
    const nextGeoRadius = Number.isFinite(nearMeKm) && nearMeKm > 0 ? nearMeKm * 1000 : null;

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
    setGeoRadius(nextGeoRadius);
    window.setTimeout(() => {
      syncingFromUrlRef.current = false;
    }, 0);
  }, [searchParams, taxonomy]);

  useEffect(() => {
    if (sort === "relevance" && !q.trim()) setSort("startsAtAsc");
  }, [q, sort]);

  useEffect(() => {
    if (!sortMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setSortMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSortMenuOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [sortMenuOpen]);

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
      const result = await fetchJson<SearchResponse>(`/events/search?${currentQuery}`);
      setData(result);
      pushDataLayer({ event: "event_listing_view", page_type: "event_listing", total_results: result.totalHits, current_page: page });
      if (appendMode) {
        setAccumulatedHits((prev) => [...prev, ...result.hits]);
      } else {
        setAccumulatedHits(result.hits);
      }
      setDisjunctiveFacets((current) => ({
        practiceCategoryId:
          result.disjunctiveFacets?.practiceCategoryId ??
          result.facets?.practiceCategoryId ??
          current.practiceCategoryId,
        eventFormatId:
          result.disjunctiveFacets?.eventFormatId ??
          result.facets?.eventFormatId ??
          current.eventFormatId,
        languages:
          result.disjunctiveFacets?.languages ??
          result.facets?.languages ??
          current.languages,
        attendanceMode:
          result.disjunctiveFacets?.attendanceMode ??
          result.facets?.attendanceMode ??
          current.attendanceMode,
        countryCode:
          result.disjunctiveFacets?.countryCode ??
          result.facets?.countryCode ??
          current.countryCode,
        eventDate: result.facets?.eventDate ?? current.eventDate,
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
  }, [buildQueryString, canSeeDetailedErrors, page, t]);

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
            isFirstSearchRef.current = false;
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
      // Track filter changes — fires after 400ms debounce, skipping initial render
      if (filterTrackMountedRef.current) {
        pushDataLayer({
          event: "event_filter",
          filter_q: q || null,
          filter_categories: practiceCategoryIds.join(",") || null,
          filter_formats: eventFormatIds.join(",") || null,
          filter_attendance: attendanceModes.join(",") || null,
          filter_countries: countryCodes.join(",") || null,
          filter_dates: eventDates.join(",") || null,
        });
      } else {
        filterTrackMountedRef.current = true;
      }
    }, 400);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // --- Map overlay data ---
  const [cityCoords, setCityCoords] = useState<Array<{ city: string; lat: number; lng: number }>>([]);
  const [countryGeoJsonCache, setCountryGeoJsonCache] = useState<Record<string, GeoJsonObject>>({});

  // Fetch city coordinates when cities change and map is visible
  useEffect(() => {
    if (view !== "map" || cities.length === 0) {
      setCityCoords([]);
      return;
    }
    let cancelled = false;
    void fetchJson<{ items: Array<{ city: string; lat: number; lng: number }> }>(
      `/meta/city-coords?cities=${encodeURIComponent(cities.join(","))}`,
    ).then((data) => {
      if (!cancelled) setCityCoords(data.items);
    }).catch(() => {
      if (!cancelled) setCityCoords([]);
    });
    return () => { cancelled = true; };
  }, [view, cities]);

  // Fetch country GeoJSON when countries change and map is visible
  useEffect(() => {
    if (view !== "map" || countryCodes.length === 0) return;
    const missing = countryCodes.filter((c) => !countryGeoJsonCache[c]);
    if (missing.length === 0) return;
    let cancelled = false;
    void Promise.all(
      missing.map(async (code) => {
        const alpha3 = alpha2ToAlpha3(code);
        if (!alpha3) return null;
        try {
          const resp = await fetch(
            `https://raw.githubusercontent.com/johan/world.geo.json/master/countries/${alpha3}.geo.json`,
          );
          if (!resp.ok) throw new Error("not found");
          const geoJson = await resp.json() as GeoJsonObject;
          return { code, geoJson };
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      const newEntries: Record<string, GeoJsonObject> = {};
      for (const r of results) {
        if (r) newEntries[r.code] = r.geoJson;
      }
      if (Object.keys(newEntries).length > 0) {
        setCountryGeoJsonCache((prev) => ({ ...prev, ...newEntries }));
      }
    });
    return () => { cancelled = true; };
  }, [view, countryCodes, countryGeoJsonCache]);

  // Build map overlays
  const mapCircleOverlays = useMemo((): MapCircleOverlay[] => {
    const circles: MapCircleOverlay[] = [];
    // Near-me circle
    if (geoRadius && geo.lat != null && geo.lng != null) {
      circles.push({ lat: geo.lat, lng: geo.lng, radiusMeters: geoRadius });
    }
    // City circles (50km each)
    for (const cc of cityCoords) {
      circles.push({ lat: cc.lat, lng: cc.lng, radiusMeters: 50000 });
    }
    return circles;
  }, [geoRadius, geo.lat, geo.lng, cityCoords]);

  const mapCountryOverlays = useMemo((): MapCountryOverlay[] => {
    return countryCodes
      .filter((c) => countryGeoJsonCache[c])
      .map((c) => ({ code: c, geoJson: countryGeoJsonCache[c] }));
  }, [countryCodes, countryGeoJsonCache]);

  const clearSearchCache = useCallback(() => {
    try { sessionStorage.removeItem("search-cache-snapshot"); } catch { /* ignore */ }
  }, []);

  function clearFilters() {
    setQ("");
    setPracticeCategoryIds([]);
    setPracticeSubcategoryId("");
    setEventFormatIds([]);
    setTags([]);
    setLanguages([]);
    setAttendanceModes([]);
    setCountryCodes([]);
    setCities([]);
    setCityQuery("");
    setTagQuery("");
    setEventDates([]);
    setCustomFrom("");
    setCustomTo("");
    setDateRangeOpen(false);
    setIncludePast(false);
    setGeoRadius(null);
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
    void fetchJson<{ items: Array<{ tag: string; display: string; count: number }> }>(`/meta/tags?limit=30`)
      .then((payload) => setTagSuggestions(payload.items ?? []))
      .catch(() => setTagSuggestions([]));
  }, []);

  const visibleTagSuggestions = useMemo(() => {
    const q = tagQuery.trim().toLowerCase();
    return tagSuggestions
      .filter((item) => !tags.includes(item.tag))
      .filter((item) => !q || item.tag.includes(q) || (item.display ?? "").toLowerCase().includes(q));
  }, [tagSuggestions, tags, tagQuery]);

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
  const toTitleCase = toTitleCaseHelper;

  function tagDisplay(tag: string): string {
    const i18nKey = `tag.${tag.replace(/ /g, "-")}`;
    const translated = t(i18nKey);
    if (translated !== i18nKey) return translated;
    return tagSuggestions.find((s) => s.tag === tag)?.display ?? toTitleCase(tag);
  }

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
        label: tagDisplay(tag),
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
    if (geoRadius) {
      const km = geoRadius / 1000;
      const locationHint = geo.city ? ` (${geo.city})` : "";
      chips.push({
        key: "nearMe",
        label: `${t("eventSearch.nearMe")} ${km} km${locationHint}`,
        onRemove: () => { setGeoRadius(null); setPage(1); },
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
    geoRadius,
    geo.city,
  ]);

  function addCityFromInput(rawValue: string) {
    const value = rawValue.trim();
    if (!value) {
      return;
    }
    setCities((current) => (current.includes(value) ? current : [...current, value]));
    setCityQuery("");
    setGeoRadius(null);
    setPage(1);
  }

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
    includePast ||
    geoRadius
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
              {geo.status === "idle" && !geoRadius && (
                <button
                  type="button"
                  className="hero-pill hero-pill-geo"
                  onClick={() => {
                    geoAutoApplyRef.current = true;
                    geoRadiusPendingRef.current = 100000;
                    geo.detect();
                  }}
                >
                  <svg className="hero-pill-pin" viewBox="0 0 90 90" fill="currentColor" width="14" height="14" fillRule="evenodd"><path d="M45 90c-1.415 0-2.725-.748-3.444-1.966l-4.385-7.417C28.167 65.396 19.664 51.02 16.759 45.189c-2.112-4.331-3.175-8.955-3.175-13.773C13.584 14.093 27.677 0 45 0c17.323 0 31.416 14.093 31.416 31.416c0 4.815-1.063 9.438-3.157 13.741a3.97 3.97 0 01-.08.155c-2.961 5.909-11.41 20.193-20.353 35.309l-4.382 7.413C47.725 89.252 46.415 90 45 90zM45 14.941c-8.474 0-15.369 6.895-15.369 15.369S36.526 45.678 45 45.678c8.474 0 15.368-6.894 15.368-15.368S53.474 14.941 45 14.941z"/></svg>
                  {" "}{t("eventSearch.hero.nearYou")}
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
              {geo.status === "ready" && geo.lat != null && !geoRadius && (
                <button
                  type="button"
                  className="hero-pill hero-pill-geo"
                  onClick={() => {
                    setGeoRadius(100000);
                    setCountryCodes([]);
                    setCities([]);
                    setCityQuery("");
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
        </div>
      </div>
      <section className={["grid", sidebarOpen && "sidebar-open", sidebarSkipTransition && "sidebar-no-transition"].filter(Boolean).join(" ")}>
      {sidebarOpen && (
        <div
          className="filters-overlay"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}
      <aside className="panel filters">
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
          open={countryOpen && !geoRadius}
          onToggle={(event) => !geoRadius && setCountryOpen((event.currentTarget as HTMLDetailsElement).open)}
          className={geoRadius ? "filter-details--disabled" : ""}
        >
          <summary>{t("eventSearch.country")}</summary>
          {!geoRadius && (
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
          )}
        </details>
        <div className={`autocomplete-wrap${geoRadius ? " autocomplete-wrap--disabled" : ""}`}>
          <input
            ref={cityInputRef}
            value={cityQuery}
            onFocus={() => !geoRadius && setCitySuggestionsOpen(true)}
            onBlur={() => window.setTimeout(() => setCitySuggestionsOpen(false), 120)}
            onChange={(event) => !geoRadius && setCityQuery(event.target.value)}
            onKeyDown={(event) => {
              if (geoRadius) return;
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
            disabled={!!geoRadius}
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
        {/* Near me — geo radius filter */}
        <button
          type="button"
          className={`filter-row near-me-filter${geoRadius ? " filter-row-selected" : ""}`}
          onClick={() => {
            if (geoRadius) {
              setGeoRadius(null);
              setPage(1);
            } else if (geo.status === "idle") {
              geoAutoApplyRef.current = true;
              geoRadiusPendingRef.current = 100000;
              geo.detect();
            } else if (geo.status === "ready" && geo.lat != null) {
              setGeoRadius(100000);
              setCountryCodes([]);
              setCities([]);
              setCityQuery("");
              setPage(1);
            }
          }}
        >
          <span className="filter-row-icon near-me-icon">
            <svg viewBox="0 0 90 90" fill="currentColor" width="14" height="14" fillRule="evenodd">
              <path d="M45 90c-1.415 0-2.725-.748-3.444-1.966l-4.385-7.417C28.167 65.396 19.664 51.02 16.759 45.189c-2.112-4.331-3.175-8.955-3.175-13.773C13.584 14.093 27.677 0 45 0c17.323 0 31.416 14.093 31.416 31.416c0 4.815-1.063 9.438-3.157 13.741a3.97 3.97 0 01-.08.155c-2.961 5.909-11.41 20.193-20.353 35.309l-4.382 7.413C47.725 89.252 46.415 90 45 90zM45 14.941c-8.474 0-15.369 6.895-15.369 15.369S36.526 45.678 45 45.678c8.474 0 15.368-6.894 15.368-15.368S53.474 14.941 45 14.941z"/>
            </svg>
          </span>
          <span className="filter-row-label">
            {geoRadius && geo.status === "detecting"
              ? `${t("eventSearch.nearMe")} (${t("eventSearch.nearMeDetecting")})`
              : geoRadius && (geo.status === "denied" || geo.status === "unavailable")
              ? `${t("eventSearch.nearMe")} (${t("eventSearch.nearMeFailed")})`
              : geoRadius && geo.status === "ready" && geo.city
              ? `${t("eventSearch.nearMe")}: ${geo.city}`
              : t("eventSearch.nearMe")}
          </span>
        </button>
        {geoRadius && (
          <div className="near-me-radii">
            {[50000, 100000, 300000, 500000, 1000000].map((r) => (
              <button
                key={r}
                type="button"
                className={`near-me-radius${geoRadius === r ? " near-me-radius--active" : ""}`}
                onClick={() => { setGeoRadius(r); setPage(1); }}
              >
                {r / 1000} km
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
                const match = visibleTagSuggestions[0];
                if (match) {
                  setTags((current) => [...current, match.tag]);
                  setTagQuery("");
                  setPage(1);
                  setTagSuggestionsOpen(false);
                  tagInputRef.current?.blur();
                }
              }
            }}
            placeholder={t("eventSearch.placeholder.tags")}
          />
          {tagSuggestionsOpen && visibleTagSuggestions.length > 0 && (
            <div className="autocomplete-menu">
              {visibleTagSuggestions.map((item) => (
                <button
                  type="button"
                  className="autocomplete-option"
                  key={item.tag}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setTags((current) => [...current, item.tag]);
                    setTagQuery("");
                    setPage(1);
                    setTagSuggestionsOpen(false);
                    tagInputRef.current?.blur();
                  }}
                >
                  {tagDisplay(item.tag)}{item.count > 0 ? ` (${item.count})` : ""}
                </button>
              ))}
            </div>
          )}
        </div>
        {tags.length > 0 && (
          <div className="kv">
            {tags.map((tag) => (
              <button
                className="tag"
                key={tag}
                type="button"
                onClick={() => {
                  setTags((current) => current.filter((t) => t !== tag));
                  setPage(1);
                }}
              >
                {tagDisplay(tag)} ×
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
        <div className="filters-notify-row">
          <NotifyMeButton
            filterSnapshot={Object.fromEntries(
              Array.from(searchParams.entries()).filter(([k]) => k !== "page" && k !== "view" && k !== "sort"),
            )}
            filterSummary={selectedFilterChips.map((c) => c.label).join(", ")}
          />
        </div>
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
            <svg aria-hidden width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1.5 3h11M3 7h8M5 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <span>{activeFilterCount > 0 ? `${t("eventSearch.filtersButton")} (${activeFilterCount})` : t("eventSearch.filtersButton")}</span>
          </button>
          <div className="meta results-count">
            {data
              ? t("eventSearch.resultsCount", { count: data.totalHits })
              : t("eventSearch.promptRun")}
          </div>
          <div className="results-toolbar-actions">
            <div className="icon-group sort-dropdown-wrap" ref={sortMenuRef}>
              {(() => {
                const hasQuery = q.trim().length > 0;
                const options: Array<{ key: typeof sort; label: string }> = [];
                if (hasQuery) options.push({ key: "relevance", label: t("eventSearch.sort.relevance") });
                options.push({ key: "startsAtAsc", label: t("eventSearch.sort.soonest") });
                options.push({ key: "startsAtDesc", label: t("eventSearch.sort.latest") });
                options.push({ key: "publishedAtDesc", label: t("eventSearch.sort.recent") });
                const currentKey: typeof sort = sort === "relevance" && !hasQuery ? "startsAtAsc" : sort;
                const currentLabel = options.find((o) => o.key === currentKey)?.label ?? options[0].label;
                return (
                  <>
                    <button
                      type="button"
                      className="ghost-btn icon-btn sort-trigger"
                      onClick={() => setSortMenuOpen((v) => !v)}
                      aria-haspopup="listbox"
                      aria-expanded={sortMenuOpen}
                    >
                      <span className="icon-label">{t("eventSearch.sort.label")}: {currentLabel}</span>
                      <span aria-hidden className="icon-glyph" style={{ marginLeft: 2 }}>▾</span>
                    </button>
                    {sortMenuOpen && (
                      <div className="cal-dropdown sort-menu" role="listbox">
                        {options.map((opt) => (
                          <button
                            key={opt.key}
                            type="button"
                            role="option"
                            aria-selected={currentKey === opt.key}
                            onClick={() => {
                              setSort(opt.key);
                              setPage(1);
                              setSortMenuOpen(false);
                            }}
                          >
                            <span style={{ display: "inline-block", width: 16 }}>{currentKey === opt.key ? "✓" : ""}</span>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
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
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M2 12h20"/>
                  <path d="M12 2a15 15 0 0 1 0 20"/>
                  <path d="M12 2a15 15 0 0 0 0 20"/>
                </svg>
              </span>
              <span className="icon-label">{t("eventSearch.view.map")}</span>
            </button>
            {auth.authenticated && auth.roles.includes("admin") && (
            <button
              type="button"
              className={view === "discover" ? "secondary-btn icon-btn" : "ghost-btn icon-btn"}
              onClick={() => setView("discover")}
              aria-label="Discover"
              title="Discover"
            >
              <span aria-hidden className="icon-glyph">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z" />
                </svg>
              </span>
              <span className="icon-label">Discover</span>
            </button>
            )}
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
            <NotifyMeButton
              filterSnapshot={Object.fromEntries(
                Array.from(searchParams.entries()).filter(([k]) => k !== "page" && k !== "view" && k !== "sort"),
              )}
              filterSummary={selectedFilterChips.map((c) => c.label).join(", ")}
            />
          </div>
        )}
        {view === "discover" ? (
          <DiscoverWizard
            taxonomy={taxonomy}
            geo={geo}
            onComplete={handleDiscoverComplete}
            onCancel={() => setView("list")}
          />
        ) : view === "map" ? (
          <LeafletClusterMap
            queryString={activeQueryString}
            refreshToken={refreshToken}
            timeDisplayMode={timeDisplayMode}
            circleOverlays={mapCircleOverlays}
            countryOverlays={mapCountryOverlays}
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
              ...hit.event.tags.map((t) => tagDisplay(t)),
            ];
            const visiblePills = extraPills;
            const overflowCount = 0;

            // Pass the occurrence's date as a ?date= hint so the detail
            // page can scroll to and highlight this specific date. Otherwise
            // users clicking a July result in April see "Next: tomorrow" and
            // wonder if they clicked the wrong thing.
            //
            // When series grouping is ON, each hit represents the whole
            // series (Meili returned one distinct-by-series_id row), so the
            // card links to the bare event page and the user picks a date
            // from the full upcoming list.
            const occurrenceDate = isSeriesGroupingEnabled()
              ? null
              : hit.startsAtUtc?.slice(0, 10) ?? null;

            // "Recurring" chip: native recurring events, or grouped-series
            // cards backed by multiple sibling events. sibling_count is set by
            // the API from a SQL subquery — fall back to 1 if stale Meili docs
            // are missing the field.
            const isRecurring =
              hit.event.scheduleKind === "recurring" || (hit.event.siblingCount ?? 1) > 1;

            return (
              <Link
                className="card event-card-h"
                key={hit.occurrenceId}
                href={occurrenceDate && !isRecurring ? `/events/${hit.event.slug}?date=${occurrenceDate}` : `/events/${hit.event.slug}`}
                onClick={() => {
                  const idx = accumulatedHits.findIndex((h) => h.event.slug === hit.event.slug);
                  pushDataLayer({ event: "event_card_click", event_title: hit.event.title, position: idx + 1 });
                  onNavigateAway();
                }}
              >
                <div className="event-card-main">
                  <div
                    className="event-card-thumb-h"
                    style={{ background: hit.event.coverImageUrl ? undefined : `var(--category-${catKey}, var(--surface-skeleton))` }}
                  >
                    <SaveEventButton eventId={hit.event.id} compact />
                    {hit.event.coverImageUrl ? (
                      <img
                        className="event-card-thumb"
                        src={hit.event.coverImageUrl}
                        alt={hit.event.title}
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                          const img = e.currentTarget;
                          img.onerror = null;
                          img.src = "/logo.jpg";
                          img.className = "event-card-fallback-logo";
                        }}
                      />
                    ) : (
                      <img className="event-card-fallback-logo" src="/logo.jpg" alt="" aria-hidden />
                    )}
                  </div>
                  <div className="event-card-body">
                    <h3>{hit.event.title}</h3>
                    <div
                      className="meta"
                      title={formatted.suffixLabel === "event" ? t("common.eventTimezone") : t("common.yourTimezone")}
                      suppressHydrationWarning
                    >
                      {formatted.primary}
                      {isRecurring && ` · ${t("eventDetail.recurringChip")}`}
                      {" · "}
                      {t(`attendanceMode.${hit.event.attendanceMode}`)}
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
