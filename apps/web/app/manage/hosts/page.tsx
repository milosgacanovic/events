"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const ManageMapView = dynamic(
  () => import("../../../components/manage/ManageMapView").then((m) => m.ManageMapView),
  { ssr: false },
);

import { ROLE_ADMIN } from "@dr-events/shared";

import { useKeycloakAuth } from "../../../components/auth/KeycloakAuthProvider";
import { useI18n } from "../../../components/i18n/I18nProvider";
import { ManageHostCard } from "../../../components/manage/ManageHostCard";
import { ManageFilterSidebar } from "../../../components/manage/ManageFilterSidebar";
import {
  StatusFilter,
  RoleFacetFilter,
  PracticeFacetFilter,
  LanguageFacetFilter,
  CountryFacetFilter,
  CityFacetFilter,
} from "../../../components/manage/ManageFilterSections";
import { ManageResultsToolbar } from "../../../components/manage/ManageResultsToolbar";
import { ConfirmDialog } from "../../../components/manage/ConfirmDialog";
import { authorizedGet, authorizedPatch, authorizedDelete } from "../../../lib/manageApi";
import { apiBase } from "../../../lib/api";
import { getRoleLabel, formatCityLabel, toTitleCase } from "../../../lib/filterHelpers";
import { getLocalizedRegionLabel, getLocalizedLanguageLabel } from "../../../lib/i18n/icuFallback";
import { toDisplayNamesLocale } from "../../../lib/i18n/languageLabels";

type TaxonomyResponse = {
  uiLabels?: { categorySingular?: string };
  practices: {
    categories: Array<{ id: string; key: string; label: string }>;
  };
  organizerRoles?: Array<{ id: string; key: string; label: string }>;
};

type HostItem = {
  id: string;
  slug: string;
  name: string;
  status: string;
  updated_at: string;
  city: string | null;
  country_code: string | null;
  image_url: string | null;
  avatar_path: string | null;
  practice_labels: string | null;
  role_labels: string | null;
  role_keys: string[] | null;
  event_count: string | null;
  languages: string[] | null;
  follower_count: number;
};

type HostsResponse = {
  items: HostItem[];
  pagination: { page: number; pageSize: number; totalPages: number; totalItems: number };
};

type FacetsResponse = {
  statuses?: Record<string, number>;
  roleIds?: Record<string, number>;
  practiceCategoryIds?: Record<string, number>;
  languages?: Record<string, number>;
  countryCodes?: Record<string, number>;
  cities?: Record<string, number>;
};

const PAGE_SIZE = 20;

function hostFiltersToParams(f: { search: string; statusFilter: string; profileRoleIds: string[]; practiceCategoryIds: string[]; languages: string[]; countryCodes: string[]; cities: string[]; sortBy: string; page: number }): string {
  const p = new URLSearchParams();
  if (f.search) p.set("q", f.search);
  if (f.statusFilter) p.set("status", f.statusFilter);
  if (f.profileRoleIds.length) p.set("roleId", f.profileRoleIds.join(","));
  if (f.practiceCategoryIds.length) p.set("practiceCategoryId", f.practiceCategoryIds.join(","));
  if (f.languages.length) p.set("languages", f.languages.join(","));
  if (f.countryCodes.length) p.set("countryCode", f.countryCodes.join(","));
  if (f.cities.length) p.set("cities", f.cities.join(","));
  if (f.sortBy) p.set("sort", f.sortBy);
  if (f.page > 1) p.set("page", String(f.page));
  return p.toString();
}

export default function MyHostsPage() {
  const { getToken, roles } = useKeycloakAuth();
  const { locale, t } = useI18n();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const syncingFromUrl = useRef(false);

  /* ── data state (initialized from URL) ── */
  const csv = (key: string) => searchParams.get(key)?.split(",").filter(Boolean) ?? [];
  const [hosts, setHosts] = useState<HostItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(Number(searchParams.get("page")) || 1);
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "");
  const [profileRoleIds, setProfileRoleIds] = useState<string[]>(csv("roleId"));
  const [practiceCategoryIds, setPracticeCategoryIds] = useState<string[]>(csv("practiceCategoryId"));
  const [languages, setLanguages] = useState<string[]>(csv("languages"));
  const [countryCodes, setCountryCodes] = useState<string[]>(csv("countryCode"));
  const [cities, setCities] = useState<string[]>(csv("cities"));
  const [sortBy, setSortBy] = useState(searchParams.get("sort") ?? "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [taxonomy, setTaxonomy] = useState<TaxonomyResponse | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [view, setView] = useState<"list" | "map">("list");
  const [facets, setFacets] = useState<FacetsResponse | null>(null);
  const [alertMsg, setAlertMsg] = useState("");
  const [unpublishConfirmHostId, setUnpublishConfirmHostId] = useState<string | null>(null);

  const isAdmin = roles.includes(ROLE_ADMIN);

  /* ── sync filters → URL ── */
  useEffect(() => {
    if (syncingFromUrl.current) return;
    const qs = hostFiltersToParams({ search, statusFilter, profileRoleIds, practiceCategoryIds, languages, countryCodes, cities, sortBy, page });
    const url = qs ? `${pathname}?${qs}` : pathname;
    window.history.replaceState(window.history.state, "", url);
    try { sessionStorage.setItem("manageHostsUrl", url); } catch {}
  }, [search, statusFilter, profileRoleIds, practiceCategoryIds, languages, countryCodes, cities, sortBy, page, pathname]);

  /* ── sync URL → filters (browser back/forward) ── */
  useEffect(() => {
    syncingFromUrl.current = true;
    const sp = searchParams;
    const csvParse = (key: string) => sp.get(key)?.split(",").filter(Boolean) ?? [];
    setSearch(sp.get("q") ?? "");
    setStatusFilter(sp.get("status") ?? "");
    setProfileRoleIds(csvParse("roleId"));
    setPracticeCategoryIds(csvParse("practiceCategoryId"));
    setLanguages(csvParse("languages"));
    setCountryCodes(csvParse("countryCode"));
    setCities(csvParse("cities"));
    setSortBy(sp.get("sort") ?? "");
    setPage(Number(sp.get("page")) || 1);
    setTimeout(() => { syncingFromUrl.current = false; }, 0);
  }, [searchParams]);

  /* ── Intl display names ── */
  const languageNames = useMemo(() => {
    try { return new Intl.DisplayNames([toDisplayNamesLocale(locale)], { type: "language" }); } catch { return null; }
  }, [locale]);

  const regionNames = useMemo(() => {
    try { return new Intl.DisplayNames([toDisplayNamesLocale(locale)], { type: "region" }); } catch { return null; }
  }, [locale]);

  const getLanguageLabel = useCallback(
    (code: string) =>
      code === "mul" ? t("common.language.multiple") : getLocalizedLanguageLabel(code, locale, languageNames),
    [languageNames, locale, t],
  );

  const getCountryLabel = useCallback(
    (code: string) => getLocalizedRegionLabel(code, locale, regionNames),
    [regionNames, locale],
  );

  const categorySingularLabel =
    t("admin.placeholder.categorySingular") || taxonomy?.uiLabels?.categorySingular || "Practice";

  /* ── taxonomy ── */
  useEffect(() => {
    fetch(`${apiBase}/meta/taxonomies`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: TaxonomyResponse) => setTaxonomy(d))
      .catch(() => {});
  }, []);

  /* ── facets ── */
  const loadFacets = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (practiceCategoryIds.length) params.set("practiceCategoryId", practiceCategoryIds.join(","));
      if (profileRoleIds.length) params.set("profileRoleId", profileRoleIds.join(","));
      if (languages.length) params.set("languages", languages.join(","));
      if (countryCodes.length) params.set("countryCode", countryCodes.join(","));
      if (cities.length) params.set("cities", cities.join(","));
      const data = await authorizedGet<FacetsResponse>(getToken, `/admin/organizers/facets?${params}`);
      setFacets(data);
    } catch { /* ignore */ }
  }, [getToken, statusFilter, practiceCategoryIds, profileRoleIds, languages, countryCodes, cities]);

  /* ── load hosts ── */
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        managedBy: "me",
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (search) params.set("q", search);
      if (statusFilter) params.set("status", statusFilter);
      if (practiceCategoryIds.length) params.set("practiceCategoryId", practiceCategoryIds.join(","));
      if (profileRoleIds.length) params.set("profileRoleId", profileRoleIds.join(","));
      if (countryCodes.length) params.set("countryCode", countryCodes.join(","));
      if (languages.length) params.set("languages", languages.join(","));
      if (cities.length) params.set("cities", cities.join(","));
      if (sortBy) params.set("sort", sortBy);

      const data = await authorizedGet<HostsResponse>(getToken, `/admin/organizers?${params}`);
      setHosts(data.items);
      setTotalItems(data.pagination.totalItems);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("manage.error.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [getToken, page, search, statusFilter, practiceCategoryIds, profileRoleIds, countryCodes, languages, cities, sortBy]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadFacets();
  }, [loadFacets]);

  /* ── actions ── */
  async function setHostStatus(hostId: string, status: string) {
    try {
      await authorizedPatch(getToken, `/organizers/${hostId}`, { status });
      load();
      loadFacets();
    } catch (err) {
      if (err instanceof Error && err.message === "host_has_active_events") {
        setUnpublishConfirmHostId(hostId);
      }
    }
  }

  async function forceUnpublishHost(hostId: string) {
    try {
      await authorizedPatch(getToken, `/organizers/${hostId}`, { status: "draft", force: true });
      load();
      loadFacets();
    } catch (err) {
      setAlertMsg(err instanceof Error ? err.message : t("manage.form.unknownError"));
    }
  }

  async function deleteHost(hostId: string) {
    try {
      await authorizedDelete(getToken, `/organizers/${hostId}`);
      load();
      loadFacets();
    } catch (err) {
      if (err instanceof Error && err.message === "host_has_active_events") {
        setAlertMsg(t("manage.hostCard.deleteHasActiveEvents"));
      } else {
        setAlertMsg(err instanceof Error ? err.message : t("manage.form.unknownError"));
      }
    }
  }

  const statusOptions = useMemo(
    () => [
      { value: "draft", label: t("common.status.draft") },
      { value: "published", label: t("common.status.published") },
      { value: "archived", label: t("common.status.archived") },
    ],
    [t],
  );

  /* ── filter chips ── */
  const selectedFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];
    if (search.trim()) {
      chips.push({ key: "q", label: `"${search.trim()}"`, onRemove: () => { setSearch(""); setPage(1); } });
    }
    if (statusFilter) {
      const opt = statusOptions.find((o) => o.value === statusFilter);
      chips.push({ key: `status:${statusFilter}`, label: opt?.label ?? statusFilter, onRemove: () => { setStatusFilter(""); setPage(1); } });
    }
    for (const roleId of profileRoleIds) {
      const role = taxonomy?.organizerRoles?.find((r) => r.id === roleId);
      chips.push({ key: `role:${roleId}`, label: role ? getRoleLabel(role.key, t) : roleId, onRemove: () => { setProfileRoleIds((cur) => cur.filter((x) => x !== roleId)); setPage(1); } });
    }
    for (const catId of practiceCategoryIds) {
      const cat = taxonomy?.practices.categories.find((c) => c.id === catId);
      chips.push({ key: `cat:${catId}`, label: cat?.label ?? catId, onRemove: () => { setPracticeCategoryIds((cur) => cur.filter((x) => x !== catId)); setPage(1); } });
    }
    for (const lang of languages) {
      chips.push({ key: `lang:${lang}`, label: getLanguageLabel(lang), onRemove: () => { setLanguages((cur) => cur.filter((x) => x !== lang)); setPage(1); } });
    }
    for (const cc of countryCodes) {
      chips.push({ key: `country:${cc}`, label: getCountryLabel(cc), onRemove: () => { setCountryCodes((cur) => cur.filter((x) => x !== cc)); setPage(1); } });
    }
    for (const city of cities) {
      chips.push({ key: `city:${city}`, label: toTitleCase(city), onRemove: () => { setCities((cur) => cur.filter((x) => x !== city)); setPage(1); } });
    }
    return chips;
  }, [search, statusFilter, statusOptions, profileRoleIds, practiceCategoryIds, languages, countryCodes, cities, taxonomy, t, getLanguageLabel, getCountryLabel]);

  const clearFilters = useCallback(() => {
    setSearch(""); setStatusFilter(""); setProfileRoleIds([]); setPracticeCategoryIds([]);
    setLanguages([]); setCountryCodes([]); setCities([]); setPage(1);
  }, []);

  /* ── derived ── */
  const activeFilterCount = selectedFilterChips.length;

  const mapQueryString = useMemo(() => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (practiceCategoryIds.length) params.set("practiceCategoryId", practiceCategoryIds.join(","));
    if (profileRoleIds.length) params.set("roleKey", profileRoleIds.join(","));
    if (languages.length) params.set("languages", languages.join(","));
    if (countryCodes.length) params.set("countryCode", countryCodes.join(","));
    if (cities.length) params.set("city", cities.join(","));
    return params.toString();
  }, [search, practiceCategoryIds, profileRoleIds, languages, countryCodes, cities]);

  const sortOptions = useMemo(
    () => [
      { value: "", label: t("manage.hosts.sortRecent") },
      { value: "created", label: t("manage.hosts.sortCreated") },
      { value: "name", label: t("manage.hosts.sortName") },
    ],
    [t],
  );

  return (
    <section className={`grid${sidebarOpen ? " sidebar-open" : ""}`} style={{ marginTop: 8 }}>
      {/* ── Sidebar filters ── */}
      <ManageFilterSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)}>
        <input
          placeholder={t("manage.hosts.searchPlaceholder")}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />

        <StatusFilter
          options={statusOptions}
          value={statusFilter ? [statusFilter] : []}
          counts={facets?.statuses}
          onChange={(v) => { setStatusFilter(v[0] || ""); setPage(1); }}
        />

        <RoleFacetFilter
          roles={taxonomy?.organizerRoles ?? []}
          counts={facets?.roleIds ?? {}}
          value={profileRoleIds}
          getLabel={(key) => getRoleLabel(key, t)}
          onChange={(v) => { setProfileRoleIds(v); setPage(1); }}
        />

        <PracticeFacetFilter
          categories={taxonomy?.practices.categories ?? []}
          counts={facets?.practiceCategoryIds ?? {}}
          value={practiceCategoryIds}
          sectionLabel={categorySingularLabel}
          onChange={(v) => { setPracticeCategoryIds(v); setPage(1); }}
        />

        <LanguageFacetFilter
          counts={facets?.languages ?? {}}
          value={languages}
          getLabel={getLanguageLabel}
          sectionLabel={t("organizerSearch.hostLanguage")}
          onChange={(v) => { setLanguages(v); setPage(1); }}
        />

        <CountryFacetFilter
          counts={facets?.countryCodes ?? {}}
          value={countryCodes}
          getLabel={getCountryLabel}
          sectionLabel={t("organizerSearch.country")}
          onChange={(v) => { setCountryCodes(v); setPage(1); }}
        />

        <CityFacetFilter
          counts={facets?.cities ?? {}}
          value={cities}
          getLabel={formatCityLabel}
          sectionLabel={t("organizerSearch.placeholder.city")}
          onChange={(v) => { setCities(v); setPage(1); }}
        />
      </ManageFilterSidebar>

      {/* ── Main content ── */}
      <div className="panel cards">
        <ManageResultsToolbar
          createHref="/manage/hosts/new"
          createLabel={t("manage.hosts.createHost")}
          totalItems={totalItems}
          sortValue={sortBy}
          sortOptions={sortOptions}
          onSortChange={(v) => { setSortBy(v); setPage(1); }}
          onToggleFilters={() => setSidebarOpen((o) => !o)}
          activeFilterCount={activeFilterCount}
          filtersOpen={sidebarOpen}
          view={view}
          onViewChange={setView}
        />

        {/* Filter chips */}
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

        {/* Error state */}
        {error && (
          <div className="manage-empty">
            <p>{error}</p>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => void load()}
              style={{ marginTop: 8 }}
            >
              {t("manage.error.retry")}
            </button>
          </div>
        )}

        {/* Map view */}
        {view === "map" && !error && (
          <div style={{ height: 500, borderRadius: 8, overflow: "hidden" }}>
            <ManageMapView getToken={getToken} endpoint="/admin/organizers/map" queryString={mapQueryString} entityType="host" refreshToken={0} />
          </div>
        )}

        {/* Loading state */}
        {view === "list" && !error && loading && hosts.length === 0 ? (
          <div className="cards-loading-overlay" style={{ position: "relative", padding: 48 }}>
            <div className="filter-spinner" />
          </div>
        ) : view === "list" && !error && hosts.length === 0 ? (
          /* Empty state */
          <div className="manage-empty">
            {activeFilterCount > 0 || search ? (
              <h3>{t("manage.hosts.noResults")}</h3>
            ) : isAdmin ? (
              <>
                <h3>{t("manage.hosts.emptyAdmin")}</h3>
                <Link
                  href="/manage/admin/hosts"
                  className="secondary-btn"
                  style={{ marginTop: 12, display: "inline-block" }}
                >
                  {t("manage.hosts.allHostsLink")}
                </Link>
              </>
            ) : (
              <>
                <h3>{t("manage.hosts.noHosts")}</h3>
                <p>{t("manage.hosts.createFirstDescription")}</p>
                <Link
                  href="/manage/hosts/new"
                  className="primary-btn"
                  style={{ marginTop: 12, display: "inline-block" }}
                >
                  {t("manage.hosts.createHost")}
                </Link>
              </>
            )}
          </div>
        ) : view === "list" && !error ? (
          /* Results */
          <div className="cards-content">
            {loading && hosts.length > 0 && (
              <div className="cards-loading-overlay">
                <div className="filter-spinner" />
              </div>
            )}
            <div className="manage-card-list">
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
                  languages={host.languages}
                  followerCount={host.follower_count}
                  onPublish={host.status === "draft" ? () => void setHostStatus(host.id, "published") : undefined}
                  onUnpublish={host.status === "published" ? () => void setHostStatus(host.id, "draft") : undefined}
                  onArchive={host.status === "draft" ? () => void setHostStatus(host.id, "archived") : undefined}
                  onUnarchive={host.status === "archived" ? () => void setHostStatus(host.id, "draft") : undefined}
                  onDelete={host.status === "archived" ? () => void deleteHost(host.id) : undefined}
                />
              ))}
            </div>

            {/* Pagination */}
            {(page > 1 || hosts.length === PAGE_SIZE) && (
              <div className="manage-pagination">
                {page > 1 && (
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => setPage((p) => p - 1)}
                  >
                    {t("manage.common.previous")}
                  </button>
                )}
                {hosts.length === PAGE_SIZE && (
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {t("manage.common.next")}
                  </button>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={!!unpublishConfirmHostId}
        title={t("manage.confirm.title")}
        message={t("manage.hostForm.unpublishHasActiveEventsConfirm")}
        confirmLabel={t("common.action.ok")}
        cancelLabel={t("manage.common.cancel")}
        variant="warning"
        onConfirm={() => { const hid = unpublishConfirmHostId; setUnpublishConfirmHostId(null); if (hid) void forceUnpublishHost(hid); }}
        onCancel={() => setUnpublishConfirmHostId(null)}
      />

      <ConfirmDialog
        open={!!alertMsg}
        title={t("manage.confirm.title")}
        message={alertMsg}
        confirmLabel={t("common.action.ok")}
        onConfirm={() => setAlertMsg("")}
        onCancel={() => setAlertMsg("")}
      />
    </section>
  );
}
