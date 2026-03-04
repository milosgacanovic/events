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
  const [loading, setLoading] = useState(false);
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
  const roleFacetRequestRef = useRef(0);
  const languageFacetRequestRef = useRef(0);
  const practiceFacetRequestRef = useRef(0);
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

  const buildPracticeFacetQueryString = useCallback(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (roleKeys.length) params.set("roleKey", roleKeys.join(","));
    if (tags.length) params.set("tags", tags.join(","));
    if (languages.length) params.set("languages", languages.join(","));
    if (countryCodes.length) params.set("countryCode", countryCodes.join(","));
    if (cities.length) params.set("city", cities.join(","));
    params.set("page", "1");
    params.set("pageSize", "1");
    return params.toString();
  }, [q, roleKeys, tags, languages, countryCodes, cities]);
  const buildRoleFacetQueryString = useCallback(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (practiceCategoryIds.length) params.set("practiceCategoryId", practiceCategoryIds.join(","));
    if (tags.length) params.set("tags", tags.join(","));
    if (languages.length) params.set("languages", languages.join(","));
    if (countryCodes.length) params.set("countryCode", countryCodes.join(","));
    if (cities.length) params.set("city", cities.join(","));
    params.set("page", "1");
    params.set("pageSize", "1");
    return params.toString();
  }, [q, practiceCategoryIds, tags, languages, countryCodes, cities]);
  const buildLanguageFacetQueryString = useCallback(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (roleKeys.length) params.set("roleKey", roleKeys.join(","));
    if (practiceCategoryIds.length) params.set("practiceCategoryId", practiceCategoryIds.join(","));
    if (tags.length) params.set("tags", tags.join(","));
    if (countryCodes.length) params.set("countryCode", countryCodes.join(","));
    if (cities.length) params.set("city", cities.join(","));
    params.set("page", "1");
    params.set("pageSize", "1");
    return params.toString();
  }, [q, roleKeys, practiceCategoryIds, tags, countryCodes, cities]);
  const buildCountryFacetQueryString = useCallback(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (roleKeys.length) params.set("roleKey", roleKeys.join(","));
    if (practiceCategoryIds.length) params.set("practiceCategoryId", practiceCategoryIds.join(","));
    if (tags.length) params.set("tags", tags.join(","));
    if (languages.length) params.set("languages", languages.join(","));
    if (cities.length) params.set("city", cities.join(","));
    params.set("page", "1");
    params.set("pageSize", "1");
    return params.toString();
  }, [q, roleKeys, practiceCategoryIds, tags, languages, cities]);

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
    setQ(nextQ);
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
    setLoading(true);
    setError(null);

    try {
      const token = (showArchived && auth.authenticated) ? await auth.getToken() : null;
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      const result = await fetchJson<OrganizerSearchResponse>(
        `/organizers/search?${buildQueryString(nextPage)}`,
        headers ? { headers } : undefined,
      );
      setData(result);
      setPage(nextPage);
    } catch (err) {
      setError(canSeeDetailedErrors && err instanceof Error ? err.message : t("organizerSearch.error.searchFailed"));
    } finally {
      setLoading(false);
    }
  }, [buildQueryString, canSeeDetailedErrors, page, t, showArchived, auth]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void runSearch(page);
    }, 250);
    return () => clearTimeout(timer);
  }, [runSearch, page]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const requestId = practiceFacetRequestRef.current + 1;
      practiceFacetRequestRef.current = requestId;
      void fetchJson<OrganizerSearchResponse>(`/organizers/search?${buildPracticeFacetQueryString()}`)
        .then((response) => {
          if (requestId !== practiceFacetRequestRef.current) {
            return;
          }
          setPracticeFacetCounts(response.facets?.practiceCategoryId ?? {});
        })
        .catch(() => {
          if (requestId !== practiceFacetRequestRef.current) {
            return;
          }
          setPracticeFacetCounts({});
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [buildPracticeFacetQueryString]);
  useEffect(() => {
    const timer = setTimeout(() => {
      const requestId = roleFacetRequestRef.current + 1;
      roleFacetRequestRef.current = requestId;
      void fetchJson<OrganizerSearchResponse>(`/organizers/search?${buildRoleFacetQueryString()}`)
        .then((response) => {
          if (requestId !== roleFacetRequestRef.current) {
            return;
          }
          setRoleFacetCounts(response.facets?.roleKey ?? {});
        })
        .catch(() => {
          if (requestId !== roleFacetRequestRef.current) {
            return;
          }
          setRoleFacetCounts({});
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [buildRoleFacetQueryString]);
  useEffect(() => {
    const timer = setTimeout(() => {
      const requestId = languageFacetRequestRef.current + 1;
      languageFacetRequestRef.current = requestId;
      void fetchJson<OrganizerSearchResponse>(`/organizers/search?${buildLanguageFacetQueryString()}`)
        .then((response) => {
          if (requestId !== languageFacetRequestRef.current) {
            return;
          }
          setLanguageFacetCounts(response.facets?.languages ?? {});
        })
        .catch(() => {
          if (requestId !== languageFacetRequestRef.current) {
            return;
          }
          setLanguageFacetCounts({});
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [buildLanguageFacetQueryString]);
  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchJson<OrganizerSearchResponse>(`/organizers/search?${buildCountryFacetQueryString()}`)
        .then((response) => {
          setCountryFacetCounts(response.facets?.countryCode ?? {});
        })
        .catch(() => {
          setCountryFacetCounts({});
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [buildCountryFacetQueryString]);

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
        label: `${t("organizerSearch.hostType")}: ${role}`,
        onRemove: () => {
          setRoleKeys((current) => current.filter((item) => item !== role));
          setPage(1);
        },
      });
    }
    for (const practiceId of practiceCategoryIds) {
      chips.push({
        key: `practice:${practiceId}`,
        label: `${categorySingularLabel}: ${practiceLabelById.get(practiceId) ?? practiceId}`,
        onRemove: () => {
          setPracticeCategoryIds((current) => current.filter((item) => item !== practiceId));
          setPage(1);
        },
      });
    }
    for (const language of languages) {
      chips.push({
        key: `lang:${language}`,
        label: `${t("organizerSearch.hostLanguage")}: ${getLanguageLabel(language)}`,
        onRemove: () => {
          setLanguages((current) => current.filter((item) => item !== language));
          setPage(1);
        },
      });
    }
    for (const country of countryCodes) {
      chips.push({
        key: `country:${country}`,
        label: `${t("organizerSearch.country")}: ${getCountryLabel(country)}`,
        onRemove: () => {
          setCountryCodes((current) => current.filter((item) => item !== country));
          setPage(1);
        },
      });
    }
    for (const tag of tags) {
      chips.push({
        key: `tag:${tag}`,
        label: `${t("organizerSearch.tags")}: ${tag}`,
        onRemove: () => {
          setTags((current) => current.filter((item) => item !== tag));
          setPage(1);
        },
      });
    }
    for (const city of cities) {
      chips.push({
        key: `city:${city}`,
        label: `${t("organizerSearch.cityLabel")}: ${formatCityLabel(city)}`,
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
  }

  return (
    <section className="grid">
      <aside className="panel filters">
        <h2 className="title-xl">{t("organizerSearch.title")}</h2>
        <input
          value={q}
          onChange={(event) => {
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
            {visibleRoleFacets.map(([value, count]) => (
              <label className="meta" key={`role-${value}`}>
                <input
                  type="checkbox"
                  checked={roleKeys.includes(value)}
                  onChange={() => {
                    setRoleKeys((current) => (
                      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
                    ));
                    setPage(1);
                  }}
                />
                {value} ({count})
              </label>
            ))}
          </div>
        </details>

        {(taxonomy?.practices.categories.length ?? 0) > 0 && (
          <details
            open={practiceOpen}
            onToggle={(event) => setPracticeOpen((event.currentTarget as HTMLDetailsElement).open)}
          >
            <summary>{categorySingularLabel}</summary>
            <div className="kv">
              {taxonomy?.practices.categories
                .filter((category) => {
                  const count = practiceCounts.get(category.id) ?? 0;
                  return count > 0 || practiceCategoryIds.includes(category.id);
                })
                .map((category) => {
                  const count = practiceCounts.get(category.id) ?? 0;
                  return (
                    <label className="meta" key={`practice-${category.id}`}>
                      <input
                        type="checkbox"
                        checked={practiceCategoryIds.includes(category.id)}
                        onChange={() => {
                          setPracticeCategoryIds((current) => (
                            current.includes(category.id)
                              ? current.filter((item) => item !== category.id)
                              : [...current, category.id]
                          ));
                          setPage(1);
                        }}
                      />
                      {category.label} ({count})
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
          <summary>{t("organizerSearch.hostLanguage")}</summary>
          <div className="kv">
            {visibleLanguageFacets.map(([value, count]) => (
              <label className="meta" key={`lang-${value}`}>
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
          open={countryOpen}
          onToggle={(event) => setCountryOpen((event.currentTarget as HTMLDetailsElement).open)}
        >
          <summary>{t("organizerSearch.country")}</summary>
          <div className="kv">
            {visibleCountryFacets.map(([value, count]) => (
              <label className="meta" key={`country-${value}`}>
                <input
                  type="checkbox"
                  checked={countryCodes.includes(value)}
                  onChange={() => {
                    setCountryCodes((current) => (
                      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
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
        <div className="kv">
          <button type="button" className="secondary-btn" onClick={clearFilters} disabled={loading}>
            {t("eventSearch.clearFilters")}
          </button>
        </div>
      </aside>

      <div className="panel cards">
        <div className="results-toolbar">
          <div className="meta">
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
          <div className="kv">
            {selectedChips.map((chip) => (
              <button className="tag" key={chip.key} type="button" onClick={chip.onRemove}>
                {chip.label} ×
              </button>
            ))}
          </div>
        )}

        {view === "map" ? (
          <HostLeafletClusterMap queryString={activeQueryString} />
        ) : null}

        {view === "list" && data?.items.map((item) => (
          <Link className="card" key={item.id} href={`/hosts/${item.slug}`} onClick={persistScroll}>
            <div className="organizer-thumb-shell">
              {(item.imageUrl ?? item.avatar_path) ? (
                <img
                  className="organizer-thumb"
                  src={(item.imageUrl ?? item.avatar_path) as string}
                  alt={item.name}
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <span className="organizer-thumb-placeholder" aria-hidden>
                  {item.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <h3>
              {item.name}
              {item.status === "archived" && (
                <span className="tag" style={{ marginLeft: "0.5em", fontSize: "0.75em" }}>Archived</span>
              )}
            </h3>
            <div className="meta">
              {item.city ?? ""}
              {(item.countryCode ?? item.country_code)
                ? ` ${getCountryLabel((item.countryCode ?? item.country_code) as string)}`
                : ""}
            </div>
            {(item.practiceCategoryIds?.length ?? 0) > 0 && (
              <div className="meta">
                {categorySingularLabel}: {item.practiceCategoryIds
                  ?.map((id) => practiceLabelById.get(id) ?? id)
                  .join(", ")}
              </div>
            )}
            {(item.roleKeys?.length ?? 0) > 0 && (
              <div className="meta">{Array.from(new Set(item.roleKeys ?? [])).join(", ")}</div>
            )}
            {(item.websiteUrl ?? item.website_url) && (
              <div className="meta">
                {(item.websiteUrl ?? item.website_url) as string}
              </div>
            )}
            <div className="kv">
              {item.languages.map((language) => (
                <span className="tag" key={language}>
                  {getLanguageLabel(language)}
                </span>
              ))}
              {item.tags.map((tag) => (
                <span className="tag" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
          </Link>
        ))}
        {view === "list" && data && (
          <div className="admin-card-actions">
            <button
              className="secondary-btn"
              type="button"
              onClick={() => {
                void runSearch(currentPage - 1);
                scrollToTopFast(160);
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
                void runSearch(currentPage + 1);
                scrollToTopFast(160);
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
