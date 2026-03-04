"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchJson } from "../lib/api";
import { formatDateTimeRange, type TimeDisplayMode } from "../lib/datetime";
import { labelForLanguageCode } from "../lib/i18n/languageLabels";
import { scrollToTopFast } from "../lib/scroll";
import { getUserTimeZone, readTimeDisplayMode, writeTimeDisplayMode } from "../lib/timeDisplay";
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
  const canSeeDetailedErrors = auth.authenticated && auth.roles.some((role) =>
    role === "dr_events_editor" || role === "dr_events_admin" || role === "editor" || role === "admin"
  );
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
  const [cityQuery, setCityQuery] = useState("");
  const [citySuggestions, setCitySuggestions] = useState<Array<{ city: string; count: number }>>([]);
  const [citySuggestionsOpen, setCitySuggestionsOpen] = useState(false);
  const [page, setPage] = useState<number>(initialQuery?.page ?? 1);
  const [taxonomy, setTaxonomy] = useState<TaxonomyResponse | null>(initialTaxonomy ?? null);
  const [loading, setLoading] = useState(false);
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
  const [dateOpen, setDateOpen] = useState((initialQuery?.eventDates?.length ?? 0) > 0);
  const [practiceOpen, setPracticeOpen] = useState((initialQuery?.practiceCategoryIds?.length ?? 0) > 0);
  const [eventFormatOpen, setEventFormatOpen] = useState((initialQuery?.eventFormatIds?.length ?? 0) > 0);
  const [languageOpen, setLanguageOpen] = useState((initialQuery?.languages?.length ?? 0) > 0);
  const [attendanceOpen, setAttendanceOpen] = useState((initialQuery?.attendanceModes?.length ?? 0) > 0);
  const [countryOpen, setCountryOpen] = useState((initialQuery?.countryCodes?.length ?? 0) > 0);
  const restoredKeyRef = useRef<string | null>(null);
  const syncingFromUrlRef = useRef(false);
  const facetRequestRef = useRef(0);
  const pendingPaginationScrollRef = useRef(false);
  const skipNextScrollRestoreRef = useRef(false);
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
    params.set("tz", userTimeZone);
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
    attendanceModes,
    countryCodes,
    cities,
    eventDates,
    userTimeZone,
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
    if (attendanceModes.length) params.set("attendanceMode", attendanceModes.join(","));
    if (countryCodes.length) params.set("countryCode", countryCodes.join(","));
    if (cities.length) params.set("city", cities.join(","));
    if (eventDates.length) params.set("eventDate", eventDates.join(","));
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
    attendanceModes,
    countryCodes,
    cities,
    eventDates,
    sort,
    view,
    page,
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
    userTimeZone,
  ]);

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
    const nextPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

    syncingFromUrlRef.current = true;
    setQ(nextQ);
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
    }
  }, [buildQueryString, canSeeDetailedErrors, page, t]);

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

    if (skipNextScrollRestoreRef.current) {
      skipNextScrollRestoreRef.current = false;
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
      const count = disjunctiveFacets.practiceCategoryId[category.id] ?? 0;
      return count > 0 || selectedSet.has(category.id);
    });
    return filtered;
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
    for (const attendanceMode of attendanceModes) {
      chips.push({
        key: `attendance:${attendanceMode}`,
        label: `${t("eventSearch.attendance.anyEventType")}: ${t(`eventSearch.attendance.${attendanceMode}`)}`,
        onRemove: () => {
          setAttendanceModes((current) => current.filter((item) => item !== attendanceMode));
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
    for (const eventDate of eventDates) {
      chips.push({
        key: `date:${eventDate}`,
        label: `${t("eventSearch.eventDate")}: ${t(`eventSearch.eventDateOption.${eventDate}`)}`,
        onRemove: () => {
          setEventDates((current) => current.filter((item) => item !== eventDate));
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
    attendanceModes,
    languages,
    practiceCategoryIds,
    t,
    tags,
    cities,
    eventDates,
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

  const visibleTagSuggestions = useMemo(
    () => tagSuggestions.filter((item) => !tags.includes(item.tag)),
    [tagSuggestions, tags],
  );
  const visibleCitySuggestions = useMemo(
    () => citySuggestions.filter((item) => !cities.some((city) => city.toLowerCase() === item.city.toLowerCase())),
    [citySuggestions, cities],
  );

  return (
    <section className="grid">
      <aside className="panel filters">
        <h2 className="title-xl">{t("eventSearch.title")}</h2>
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder={t("eventSearch.placeholder.searchTitle")}
        />
        <details open={dateOpen} onToggle={(event) => setDateOpen((event.currentTarget as HTMLDetailsElement).open)}>
          <summary>{t("eventSearch.eventDate")}</summary>
          <div className="kv">
            {visibleEventDateFacets.map((item) => (
              <label className="meta" key={item.key}>
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={() => {
                    setEventDates((current) => (
                      current.includes(item.key)
                        ? current.filter((value) => value !== item.key)
                        : [...current, item.key]
                    ));
                    setPage(1);
                  }}
                />
                {t(`eventSearch.eventDateOption.${item.key}`)} ({item.count})
              </label>
            ))}
          </div>
        </details>
        <details
          open={practiceOpen}
          onToggle={(event) => setPracticeOpen((event.currentTarget as HTMLDetailsElement).open)}
        >
          <summary>{categorySingularLabel}</summary>
          <div className="kv">
            {visibleCategories.map((category) => {
              const checked = practiceCategoryIds.includes(category.id);
              const count = disjunctiveFacets.practiceCategoryId[category.id] ?? 0;
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
          </details>
        )}
        <details
          open={languageOpen}
          onToggle={(event) => setLanguageOpen((event.currentTarget as HTMLDetailsElement).open)}
        >
          <summary>{t("eventSearch.eventLanguage")}</summary>
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
                <label className="meta" key={mode}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      setAttendanceModes((current) => (
                        current.includes(mode)
                          ? current.filter((item) => item !== mode)
                          : [...current, mode]
                      ));
                      setPage(1);
                    }}
                  />
                  {t(`eventSearch.attendance.${mode}`)} ({count})
                </label>
              );
            })}
          </div>
        </details>
        <details
          open={countryOpen}
          onToggle={(event) => setCountryOpen((event.currentTarget as HTMLDetailsElement).open)}
        >
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
        <div className="autocomplete-wrap">
          <input
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
                  }}
                >
                  {item.city} ({item.count})
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
                {item} ×
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
        <div className="results-toolbar">
          <div className="meta">
            {data
              ? t("eventSearch.resultsCount", { count: data.totalHits })
              : t("eventSearch.promptRun")}
          </div>
          <div className="results-toolbar-actions">
            <button
              type="button"
              className={sort === "startsAtAsc" ? "secondary-btn icon-btn" : "ghost-btn icon-btn"}
              onClick={() => {
                setSort("startsAtAsc");
                setPage(1);
              }}
              aria-label={t("eventSearch.sort.dateAsc")}
              title={t("eventSearch.sort.dateAsc")}
            >
              <span aria-hidden>↑</span>
            </button>
            <button
              type="button"
              className={sort === "startsAtDesc" ? "secondary-btn icon-btn" : "ghost-btn icon-btn"}
              onClick={() => {
                setSort("startsAtDesc");
                setPage(1);
              }}
              aria-label={t("eventSearch.sort.dateDesc")}
              title={t("eventSearch.sort.dateDesc")}
            >
              <span aria-hidden>↓</span>
            </button>
            <button
              type="button"
              className={view === "list" ? "secondary-btn icon-btn" : "ghost-btn icon-btn"}
              onClick={() => setView("list")}
              aria-label={t("eventSearch.view.list")}
              title={t("eventSearch.view.list")}
            >
              <span aria-hidden>☰</span>
            </button>
            <button
              type="button"
              className={view === "map" ? "secondary-btn icon-btn" : "ghost-btn icon-btn"}
              onClick={() => setView("map")}
              aria-label={t("eventSearch.view.map")}
              title={t("eventSearch.view.map")}
            >
              <span aria-hidden>⌖</span>
            </button>
          </div>
        </div>
        {view === "map" ? (
          <LeafletClusterMap
            queryString={activeQueryString}
            refreshToken={refreshToken}
            timeDisplayMode={timeDisplayMode}
          />
        ) : null}
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

        {view === "list" ? (
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
                  {t("eventSearch.locationLabel", {
                    location: (() => {
                      if (hit.location?.city || hit.location?.country_code) {
                        const parts = [
                          hit.location?.city ?? "",
                          hit.location?.country_code ? getCountryLabel(hit.location.country_code) : "",
                        ].filter(Boolean);
                        return parts.join(", ");
                      }
                      if (hit.event.attendanceMode === "online") {
                        return t("eventSearch.locationOnline");
                      }
                      return t("eventSearch.locationTbd");
                    })(),
                  })}
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
        ) : null}
        {data && view === "list" && (
          <div className="admin-card-actions">
            <button
              className="secondary-btn"
              type="button"
              onClick={() => {
                pendingPaginationScrollRef.current = true;
                skipNextScrollRestoreRef.current = true;
                setPage((prev) => Math.max(prev - 1, 1));
              }}
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
              onClick={() => {
                pendingPaginationScrollRef.current = true;
                skipNextScrollRestoreRef.current = true;
                setPage((prev) => prev + 1);
              }}
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
