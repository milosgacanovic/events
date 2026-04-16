"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { useKeycloakAuth } from "../../../../components/auth/KeycloakAuthProvider";
import { useI18n } from "../../../../components/i18n/I18nProvider";
import { ManageHostCard } from "../../../../components/manage/ManageHostCard";
import { ManageFilterSidebar } from "../../../../components/manage/ManageFilterSidebar";
import { StatusFilter, SourceFilter } from "../../../../components/manage/ManageFilterSections";
import { ManageResultsToolbar } from "../../../../components/manage/ManageResultsToolbar";
import { authorizedGet, authorizedPatch, authorizedPost } from "../../../../lib/manageApi";
import { apiBase } from "../../../../lib/api";
import { getRoleLabel, formatCityLabel } from "../../../../lib/filterHelpers";
import { labelForLanguageCode } from "../../../../lib/i18n/languageLabels";
import { getLocalizedRegionLabel, getLocalizedLanguageLabel } from "../../../../lib/i18n/icuFallback";

type TaxonomyResponse = {
  uiLabels?: { categorySingular?: string };
  practices: {
    categories: Array<{ id: string; key: string; label: string }>;
  };
  organizerRoles: Array<{ id: string; key: string; label: string }>;
};

type HostItem = {
  id: string;
  slug: string;
  name: string;
  status: string;
  updated_at: string;
  managed_by_names: string | null;
  city: string | null;
  country_code: string | null;
  image_url: string | null;
  avatar_path: string | null;
  practice_labels: string | null;
  role_labels: string | null;
  role_keys: string[] | null;
  event_count: string | null;
  languages: string[] | null;
  external_source: string | null;
  detached_from_import: boolean;
  created_by_name: string | null;
  follower_count: number;
  report_count: number;
};

type HostsResponse = {
  items: HostItem[];
  pagination: { page: number; pageSize: number; totalPages: number; totalItems: number };
};

export default function AdminAllHostsPage() {
  const { getToken } = useKeycloakAuth();
  const { locale, t } = useI18n();
  const searchParams = useSearchParams();
  const [hosts, setHosts] = useState<HostItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  /* manage-specific */
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState(() => searchParams.get("sourceFilter") ?? "");
  const [hasReports, setHasReports] = useState(false);
  /* public-matching filters */
  const [roleKeys, setRoleKeys] = useState<string[]>([]);
  const [practiceCategoryIds, setPracticeCategoryIds] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [countryCodes, setCountryCodes] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  /* UI state */
  const [sortBy, setSortBy] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [taxonomy, setTaxonomy] = useState<TaxonomyResponse | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [view, setView] = useState<"list" | "map">("list");
  /* section open state */
  const [hostTypeOpen, setHostTypeOpen] = useState(false);
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);
  /* autocomplete + distinct lists */
  const [languageSuggestions, setLanguageSuggestions] = useState<string[]>([]);
  const [countrySuggestions, setCountrySuggestions] = useState<string[]>([]);
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [cityQuery, setCityQuery] = useState("");
  const [citySuggestionsOpen, setCitySuggestionsOpen] = useState(false);
  const cityInputRef = useRef<HTMLInputElement>(null);

  const pageSize = 20;

  const languageNames = useMemo(() => {
    try { return new Intl.DisplayNames([locale], { type: "language" }); } catch { return null; }
  }, [locale]);
  const regionNames = useMemo(() => {
    try { return new Intl.DisplayNames([locale], { type: "region" }); } catch { return null; }
  }, [locale]);
  const getLanguageLabel = useCallback((v: string) => v === "mul" ? t("common.language.multiple") : getLocalizedLanguageLabel(v, locale, languageNames), [languageNames, locale, t]);
  const getCountryLabel = useCallback((v: string) => {
    return getLocalizedRegionLabel(v, locale, regionNames);
  }, [regionNames, locale]);

  const categorySingularLabel = t("admin.placeholder.categorySingular") || taxonomy?.uiLabels?.categorySingular || "Practice";

  useEffect(() => {
    fetch(`${apiBase}/meta/taxonomies`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: TaxonomyResponse) => setTaxonomy(d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const [langRes, countryRes, cityRes] = await Promise.all([
          fetch(`${apiBase}/admin/organizers/distinct-languages`, { headers }).then((r) => r.json()),
          fetch(`${apiBase}/admin/organizers/distinct-countries`, { headers }).then((r) => r.json()),
          fetch(`${apiBase}/admin/organizers/distinct-cities`, { headers }).then((r) => r.json()),
        ]);
        setLanguageSuggestions(langRes.items ?? []);
        setCountrySuggestions(countryRes.items ?? []);
        setCitySuggestions(cityRes.items ?? []);
      } catch { /* ignore */ }
    })();
  }, [getToken]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), showArchived: "true" });
      if (search) params.set("q", search);
      if (statusFilter) params.set("status", statusFilter);
      if (sourceFilter) params.set("sourceFilter", sourceFilter);
      if (practiceCategoryIds.length) params.set("practiceCategoryId", practiceCategoryIds.join(","));
      if (roleKeys.length) params.set("profileRoleId", roleKeys.join(","));
      if (countryCodes.length) params.set("countryCode", countryCodes.join(","));
      if (languages.length) params.set("languages", languages.join(","));
      if (cities.length) params.set("cities", cities.join(","));
      if (hasReports) params.set("hasReports", "true");
      if (sortBy) params.set("sort", sortBy);
      const data = await authorizedGet<HostsResponse>(getToken, `/admin/organizers?${params}`);
      setHosts(data.items);
      setTotalItems(data.pagination.totalItems);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("manage.error.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [getToken, page, search, statusFilter, sourceFilter, hasReports, practiceCategoryIds, roleKeys, countryCodes, languages, cities, sortBy]);

  useEffect(() => { void load(); }, [load]);

  async function setHostStatus(hostId: string, newStatus: string) {
    try {
      await authorizedPatch(getToken, `/organizers/${hostId}`, { status: newStatus });
      void load();
    } catch { /* ignore */ }
  }

  async function handleReattach(hostId: string) {
    try {
      await authorizedPost(getToken, `/admin/organizers/${hostId}/reattach`, {});
      void load();
    } catch { /* ignore */ }
  }

  const activeFilterCount = [
    statusFilter, sourceFilter,
    ...roleKeys, ...practiceCategoryIds, ...countryCodes, ...languages, ...cities,
  ].filter(Boolean).length + (hasReports ? 1 : 0);

  const statusOptions = useMemo(() => [
    { value: "draft", label: t("common.status.draft") },
    { value: "published", label: t("common.status.published") },
    { value: "archived", label: t("common.status.archived") },
  ], [t]);

  const sortOptions = useMemo(() => [
    { value: "", label: t("manage.hosts.sortRecent") },
    { value: "created", label: t("manage.hosts.sortCreated") },
    { value: "name", label: t("manage.hosts.sortName") },
    { value: "followers", label: t("manage.admin.hosts.sortFollowers") },
  ], [t]);

  function resetPage() { setPage(1); }

  const visibleCitySuggestions = useMemo(() => {
    const selectedSet = new Set(cities.map((c) => c.toLowerCase()));
    let list = citySuggestions.filter((c) => !selectedSet.has(c.toLowerCase()));
    if (cityQuery) list = list.filter((c) => c.toLowerCase().includes(cityQuery.toLowerCase()));
    return list.slice(0, 10);
  }, [citySuggestions, cities, cityQuery]);

  function addCityFromInput(rawValue: string) {
    const value = rawValue.trim();
    if (!value) return;
    const lower = value.toLowerCase();
    if (cities.some((c) => c.toLowerCase() === lower)) return;
    const match = citySuggestions.find((c) => c.toLowerCase() === lower);
    setCities((prev) => [...prev, match ?? value]);
    setCityQuery("");
    setPage(1);
  }

  return (
    <section className={`grid${sidebarOpen ? " sidebar-open" : ""}`} style={{ marginTop: 8 }}>
      <ManageFilterSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)}>
        <input
          placeholder={t("manage.hosts.searchPlaceholder")}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />

        {/* ── Manage-specific filters ── */}
        <StatusFilter options={statusOptions} value={statusFilter ? [statusFilter] : []} onChange={(v) => { setStatusFilter(v[0] || ""); resetPage(); }} />
        <SourceFilter value={sourceFilter} onChange={(v) => { setSourceFilter(v); resetPage(); }} />

        {/* ── Reports toggle ── */}
        <button
          type="button"
          className={"filter-row" + (hasReports ? " filter-row-selected" : "")}
          onClick={() => { setHasReports((v) => !v); resetPage(); }}
          style={{ marginTop: 8 }}
        >
          <span className="filter-row-icon">{hasReports ? "\u2212" : "+"}</span>
          <span className="filter-row-label">{t("manage.admin.hosts.hasReports")}</span>
          <span className="filter-row-count" />
        </button>

        {/* ── Host Type ── */}
        <details open={hostTypeOpen} onToggle={(e) => setHostTypeOpen((e.currentTarget as HTMLDetailsElement).open)}>
          <summary>{t("organizerSearch.hostType")}</summary>
          <div className="kv">
            {(taxonomy?.organizerRoles ?? []).map((role) => {
              const checked = roleKeys.includes(role.id);
              return (
                <button
                  type="button"
                  className={"filter-row" + (checked ? " filter-row-selected" : "")}
                  key={role.id}
                  onClick={() => {
                    setRoleKeys((cur) => cur.includes(role.id) ? cur.filter((id) => id !== role.id) : [...cur, role.id]);
                    resetPage();
                  }}
                >
                  <span className="filter-row-icon">{checked ? "\u2212" : "+"}</span>
                  <span className="filter-row-label">{getRoleLabel(role.key, t)}</span>
                  <span className="filter-row-count" />
                </button>
              );
            })}
          </div>
        </details>

        {/* ── Dance Practice ── */}
        {(taxonomy?.practices.categories.length ?? 0) > 0 && (
          <details open={practiceOpen} onToggle={(e) => setPracticeOpen((e.currentTarget as HTMLDetailsElement).open)}>
            <summary>{categorySingularLabel}</summary>
            <div className="filter-scroll">
              {taxonomy?.practices.categories.map((cat) => {
                const checked = practiceCategoryIds.includes(cat.id);
                return (
                  <button
                    type="button"
                    className={"filter-row" + (checked ? " filter-row-selected" : "")}
                    key={cat.id}
                    onClick={() => {
                      setPracticeCategoryIds((cur) => cur.includes(cat.id) ? cur.filter((id) => id !== cat.id) : [...cur, cat.id]);
                      resetPage();
                    }}
                  >
                    <span className="filter-row-icon">{checked ? "\u2212" : "+"}</span>
                    <span className="filter-row-label">{cat.label}</span>
                    <span className="filter-row-count" />
                  </button>
                );
              })}
            </div>
          </details>
        )}

        {/* ── Host Language ── */}
        {languageSuggestions.length > 0 && (
          <details open={langOpen} onToggle={(e) => setLangOpen((e.currentTarget as HTMLDetailsElement).open)}>
            <summary>{t("organizerSearch.hostLanguage")}</summary>
            <div className="filter-scroll">
              {[...languageSuggestions].sort((a, b) => getLanguageLabel(a).localeCompare(getLanguageLabel(b))).map((lang) => {
                const checked = languages.includes(lang);
                return (
                  <button
                    type="button"
                    className={"filter-row" + (checked ? " filter-row-selected" : "")}
                    key={lang}
                    onClick={() => {
                      setLanguages((cur) => cur.includes(lang) ? cur.filter((l) => l !== lang) : [...cur, lang]);
                      resetPage();
                    }}
                  >
                    <span className="filter-row-icon">{checked ? "\u2212" : "+"}</span>
                    <span className="filter-row-label">{getLanguageLabel(lang)}</span>
                    <span className="filter-row-count" />
                  </button>
                );
              })}
            </div>
          </details>
        )}

        {/* ── Country ── */}
        {countrySuggestions.length > 0 && (
          <details open={countryOpen} onToggle={(e) => setCountryOpen((e.currentTarget as HTMLDetailsElement).open)}>
            <summary>{t("organizerSearch.country")}</summary>
            <div className="filter-scroll">
              {[...countrySuggestions].sort((a, b) => getCountryLabel(a).localeCompare(getCountryLabel(b))).filter((code, i, arr) => i === 0 || getCountryLabel(code) !== getCountryLabel(arr[i - 1])).map((code) => {
                const checked = countryCodes.includes(code);
                return (
                  <button
                    type="button"
                    className={"filter-row" + (checked ? " filter-row-selected" : "")}
                    key={code}
                    onClick={() => {
                      setCountryCodes((cur) => cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code]);
                      resetPage();
                    }}
                  >
                    <span className="filter-row-icon">{checked ? "\u2212" : "+"}</span>
                    <span className="filter-row-label">{getCountryLabel(code)}</span>
                    <span className="filter-row-count" />
                  </button>
                );
              })}
            </div>
          </details>
        )}

        {/* ── City ── */}
        <div className="autocomplete-wrap">
          <input
            ref={cityInputRef}
            value={cityQuery}
            onFocus={() => setCitySuggestionsOpen(true)}
            onBlur={() => window.setTimeout(() => setCitySuggestionsOpen(false), 120)}
            onChange={(e) => setCityQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const q = cityQuery.trim();
                if (!q) return;
                const exact = visibleCitySuggestions.find((c) => c.toLowerCase() === q.toLowerCase());
                addCityFromInput(exact ?? q);
                setCitySuggestionsOpen(false);
                cityInputRef.current?.blur();
              }
            }}
            placeholder={t("organizerSearch.placeholder.city")}
          />
          {citySuggestionsOpen && visibleCitySuggestions.length > 0 && (
            <div className="autocomplete-menu">
              {visibleCitySuggestions.map((city) => (
                <button
                  type="button"
                  className="autocomplete-option"
                  key={city}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { addCityFromInput(city); setCitySuggestionsOpen(false); cityInputRef.current?.blur(); }}
                >
                  {formatCityLabel(city)}
                </button>
              ))}
            </div>
          )}
        </div>
        {cities.length > 0 && (
          <div className="kv">
            {cities.map((city) => (
              <button className="tag" key={city} type="button" onClick={() => { setCities((cur) => cur.filter((c) => c !== city)); resetPage(); }}>
                {formatCityLabel(city)} ×
              </button>
            ))}
          </div>
        )}
      </ManageFilterSidebar>

      <div className="panel cards">
        <ManageResultsToolbar
          createHref="/manage/hosts/new"
          createLabel={t("manage.hosts.createHost")}
          totalItems={totalItems}
          sortValue={sortBy}
          sortOptions={sortOptions}
          onSortChange={(v) => { setSortBy(v); resetPage(); }}
          onToggleFilters={() => setSidebarOpen((o) => !o)}
          activeFilterCount={activeFilterCount}
          view={view}
          onViewChange={setView}
        />

        {error && (
          <div className="manage-empty">
            <p>{error}</p>
            <button type="button" className="secondary-btn" onClick={() => void load()} style={{ marginTop: 8 }}>{t("manage.error.retry")}</button>
          </div>
        )}

        {!error && (
          <>
            <div className={`manage-card-list${loading ? " manage-list-loading" : ""}`}>
              {hosts.map((host) => (
                <ManageHostCard
                  key={host.id}
                  id={host.id}
                  slug={host.slug}
                  name={host.name}
                  status={host.status}
                  imageUrl={host.image_url}
                  avatarPath={host.avatar_path}
                  city={host.city}
                  countryCode={host.country_code}
                  practiceLabels={host.practice_labels}
                  roleLabels={host.role_labels}
                  roleKeys={host.role_keys}
                  eventCount={host.event_count}
                  managedByNames={host.managed_by_names}
                  languages={host.languages}
                  isImported={host.external_source !== null && host.external_source !== ""}
                  detachedFromImport={host.detached_from_import}
                  createdByName={host.created_by_name}
                  followerCount={host.follower_count}
                  reportCount={host.report_count}
                  onPublish={host.status === "draft" ? () => void setHostStatus(host.id, "published") : undefined}
                  onUnpublish={host.status === "published" ? () => void setHostStatus(host.id, "draft") : undefined}
                  onArchive={host.status === "published" ? () => void setHostStatus(host.id, "archived") : undefined}
                  onReattach={host.detached_from_import ? () => void handleReattach(host.id) : undefined}
                />
              ))}
            </div>
            {loading && hosts.length === 0 && <div className="manage-loading">{t("manage.common.loading")}</div>}
            {(page > 1 || hosts.length === pageSize) && (
              <div className="manage-pagination">
                {page > 1 && <button type="button" className="secondary-btn" onClick={() => setPage((p) => p - 1)}>{t("manage.common.previous")}</button>}
                {hosts.length === pageSize && <button type="button" className="secondary-btn" onClick={() => setPage((p) => p + 1)}>{t("manage.common.next")}</button>}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
