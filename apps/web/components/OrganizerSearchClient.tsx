"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { fetchJson } from "../lib/api";
import { useI18n } from "./i18n/I18nProvider";

type OrganizerSearchResponse = {
  items: Array<{
    id: string;
    slug: string;
    name: string;
    tags: string[];
    languages: string[];
    city: string | null;
    country_code: string | null;
  }>;
  total: number;
  pagination?: {
    page: number;
    pageSize: number;
    totalPages: number;
  };
  facets?: {
    roleKey?: Record<string, number>;
    languages?: Record<string, number>;
    tags?: Record<string, number>;
    countryCode?: Record<string, number>;
    city?: Record<string, number>;
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

export function OrganizerSearchClient() {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [roleKey, setRoleKey] = useState("");
  const [tags, setTags] = useState("");
  const [languages, setLanguages] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [city, setCity] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OrganizerSearchResponse | null>(null);

  function buildQueryString(nextPage: number) {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (roleKey.trim()) params.set("roleKey", roleKey.trim());
    if (tags.trim()) params.set("tags", tags.trim());
    if (languages.trim()) params.set("languages", languages.trim());
    if (countryCode.trim()) params.set("countryCode", countryCode.trim());
    if (city.trim()) params.set("city", city.trim());
    params.set("page", String(nextPage));
    params.set("pageSize", "20");
    return params.toString();
  }

  async function runSearch(nextPage = page) {
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
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void runSearch(page);
    }, 250);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, roleKey, tags, languages, countryCode, city, page]);

  const currentPage = data?.pagination?.page ?? page;
  const totalPages = data?.pagination?.totalPages ?? 1;

  return (
    <section className="grid">
      <aside className="panel filters">
        <h2 className="title-xl">{t("organizerSearch.title")}</h2>
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder={t("organizerSearch.placeholder.searchName")}
        />
        <input
          value={roleKey}
          onChange={(event) => setRoleKey(event.target.value)}
          placeholder={t("organizerSearch.hostType")}
        />
        <input
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          placeholder={t("organizerSearch.placeholder.tags")}
        />
        <input
          value={languages}
          onChange={(event) => setLanguages(event.target.value)}
          placeholder={t("organizerSearch.hostLanguage")}
        />
        <input
          value={countryCode}
          onChange={(event) => setCountryCode(event.target.value)}
          placeholder={t("organizerSearch.placeholder.country")}
        />
        <input
          value={city}
          onChange={(event) => setCity(event.target.value)}
          placeholder={t("organizerSearch.placeholder.city")}
        />
        {data?.facets && (
          <div className="kv">
            {topFacetEntries(data.facets.roleKey).map(([value, count]) => (
              <button className="tag" type="button" key={`role-${value}`} onClick={() => setRoleKey(value)}>
                {value} ({count})
              </button>
            ))}
            {topFacetEntries(data.facets.languages).map(([value, count]) => (
              <button className="tag" type="button" key={`lang-${value}`} onClick={() => setLanguages(value)}>
                {value} ({count})
              </button>
            ))}
            {topFacetEntries(data.facets.tags).map(([value, count]) => (
              <button className="tag" type="button" key={`tag-${value}`} onClick={() => setTags(value)}>
                {value} ({count})
              </button>
            ))}
            {topFacetEntries(data.facets.countryCode).map(([value, count]) => (
              <button className="tag" type="button" key={`country-${value}`} onClick={() => setCountryCode(value)}>
                {value.toUpperCase()} ({count})
              </button>
            ))}
            {topFacetEntries(data.facets.city).map(([value, count]) => (
              <button className="tag" type="button" key={`city-${value}`} onClick={() => setCity(value)}>
                {value} ({count})
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

        {data?.items.map((item) => (
          <article className="card" key={item.id}>
            <h3>
              <Link href={`/organizers/${item.slug}`}>{item.name}</Link>
            </h3>
            <div className="meta">
              {item.city ?? ""}
              {item.country_code ? ` ${item.country_code.toUpperCase()}` : ""}
            </div>
            <div className="kv">
              {item.languages.map((language) => (
                <span className="tag" key={language}>
                  {language}
                </span>
              ))}
              {item.tags.map((tag) => (
                <span className="tag" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
