"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchJson } from "../lib/api";
import { labelForLanguageCode } from "../lib/i18n/languageLabels";
import { useI18n } from "./i18n/I18nProvider";

type OrganizerSearchResponse = {
  items: Array<{
    id: string;
    slug: string;
    name: string;
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
  page?: number;
};

type TaxonomyResponse = {
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
}: {
  initialQuery?: OrganizerSearchInitialQuery;
}) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(initialQuery?.q ?? "");
  const [roleKeys, setRoleKeys] = useState<string[]>(initialQuery?.roleKeys ?? []);
  const [practiceCategoryIds, setPracticeCategoryIds] = useState<string[]>(initialQuery?.practiceCategoryIds ?? []);
  const [tags, setTags] = useState<string[]>(initialQuery?.tags ?? []);
  const [tagQuery, setTagQuery] = useState("");
  const [tagSuggestions, setTagSuggestions] = useState<Array<{ tag: string; count: number }>>([]);
  const [languages, setLanguages] = useState<string[]>(initialQuery?.languages ?? []);
  const [countryCodes, setCountryCodes] = useState(
    (initialQuery?.countryCodes ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean),
  );
  const [cities, setCities] = useState<string[]>(initialQuery?.cities ?? []);
  const [cityQuery, setCityQuery] = useState("");
  const [citySuggestions, setCitySuggestions] = useState<Array<{ city: string; count: number }>>([]);
  const [page, setPage] = useState<number>(initialQuery?.page ?? 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OrganizerSearchResponse | null>(null);
  const [taxonomy, setTaxonomy] = useState<TaxonomyResponse | null>(null);
  const restoredKeyRef = useRef<string | null>(null);
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

  useEffect(() => {
    fetchJson<TaxonomyResponse>("/meta/taxonomies")
      .then(setTaxonomy)
      .catch(() => {
        // Keep organizer search usable even if taxonomy metadata fails.
      });
  }, []);

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
    if (page > 1) params.set("page", String(page));
    return params.toString();
  }, [q, roleKeys, practiceCategoryIds, tags, languages, countryCodes, cities, page, practiceKeyById]);

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
      const result = await fetchJson<OrganizerSearchResponse>(`/organizers/search?${buildQueryString(nextPage)}`);
      setData(result);
      setPage(nextPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("organizerSearch.error.searchFailed"));
    } finally {
      setLoading(false);
    }
  }, [buildQueryString, page, t]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void runSearch(page);
    }, 250);
    return () => clearTimeout(timer);
  }, [runSearch, page]);

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
  const visibleRoleFacets = useMemo(() => {
    const selectedSet = new Set(roleKeys);
    const merged = new Map<string, number>();
    for (const [key, value] of Object.entries(data?.facets?.roleKey ?? {})) {
      if (value > 0 || selectedSet.has(key)) {
        merged.set(key, value);
      }
    }
    for (const key of selectedSet) {
      if (!merged.has(key)) merged.set(key, 0);
    }
    return Array.from(merged.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [data?.facets?.roleKey, roleKeys]);
  const visibleLanguageFacets = useMemo(() => {
    const selectedSet = new Set(languages);
    const merged = new Map<string, number>();
    for (const [key, value] of Object.entries(data?.facets?.languages ?? {})) {
      if (value > 0 || selectedSet.has(key)) {
        merged.set(key, value);
      }
    }
    for (const key of selectedSet) {
      if (!merged.has(key)) merged.set(key, 0);
    }
    return Array.from(merged.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [data?.facets?.languages, languages]);
  const visibleCountryFacets = useMemo(() => {
    const selectedSet = new Set(countryCodes);
    const merged = new Map<string, number>();
    for (const [keyRaw, value] of Object.entries(data?.facets?.countryCode ?? {})) {
      const key = keyRaw.toLowerCase();
      if (value > 0 || selectedSet.has(key)) {
        merged.set(key, value);
      }
    }
    for (const key of selectedSet) {
      if (!merged.has(key)) merged.set(key, 0);
    }
    return Array.from(merged.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [data?.facets?.countryCode, countryCodes]);
  const practiceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const [practiceId, count] of Object.entries(data?.facets?.practiceCategoryId ?? {})) {
      counts.set(practiceId, count);
    }
    for (const selectedId of practiceCategoryIds) {
      if (!counts.has(selectedId)) {
        counts.set(selectedId, 0);
      }
    }
    return counts;
  }, [data?.facets?.practiceCategoryId, practiceCategoryIds]);
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
        label: `${t("common.category")}: ${practiceLabelById.get(practiceId) ?? practiceId}`,
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
        label: `${t("organizerSearch.placeholder.city")}: ${city}`,
        onRemove: () => {
          setCities((current) => current.filter((item) => item !== city));
          setPage(1);
        },
      });
    }
    return chips;
  }, [cities, countryCodes, getCountryLabel, getLanguageLabel, languages, practiceCategoryIds, practiceLabelById, roleKeys, t, tags]);

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
        <h2 className="title-xl">{t("organizerSearch.title")}</h2>
        <input
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
            setPage(1);
          }}
          placeholder={t("organizerSearch.placeholder.searchName")}
        />

        <details open>
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
          <details open>
            <summary>{t("common.category")}</summary>
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

        <details open>
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

        <details open>
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

        <input
          list="organizer-city-suggestions"
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
          placeholder={t("organizerSearch.placeholder.city")}
        />
        <datalist id="organizer-city-suggestions">
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
          list="organizer-tag-suggestions"
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
          placeholder={t("organizerSearch.tags")}
        />
        <datalist id="organizer-tag-suggestions">
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
      </aside>

      <div className="panel cards">
        <div className="meta">
          {data
            ? t("organizerSearch.totalCount", { count: data.total })
            : t("organizerSearch.promptRun")}
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

        {data?.items.map((item) => (
          <Link className="card" key={item.id} href={`/organizers/${item.slug}`} onClick={persistScroll}>
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
            <h3>{item.name}</h3>
            <div className="meta">
              {item.city ?? ""}
              {(item.countryCode ?? item.country_code)
                ? ` ${getCountryLabel((item.countryCode ?? item.country_code) as string)}`
                : ""}
            </div>
            {(item.practiceCategoryIds?.length ?? 0) > 0 && (
              <div className="meta">
                {t("common.category")}: {item.practiceCategoryIds
                  ?.map((id) => practiceLabelById.get(id) ?? id)
                  .join(", ")}
              </div>
            )}
            {item.roleKey && <div className="meta">{item.roleKey}</div>}
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
        {data && (
          <div className="admin-card-actions">
            <button
              className="secondary-btn"
              type="button"
              onClick={() => void runSearch(currentPage - 1)}
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
              onClick={() => void runSearch(currentPage + 1)}
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
