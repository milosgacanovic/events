"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

const HostLeafletClusterMap = dynamic(
  () => import("../../../components/HostLeafletClusterMap").then((m) => m.HostLeafletClusterMap),
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
import { authorizedGet, authorizedPatch, authorizedDelete } from "../../../lib/manageApi";
import { apiBase } from "../../../lib/api";
import { getRoleLabel, formatCityLabel } from "../../../lib/filterHelpers";
import { getLocalizedRegionLabel, getLocalizedLanguageLabel } from "../../../lib/i18n/icuFallback";

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

export default function MyHostsPage() {
  const { getToken, roles } = useKeycloakAuth();
  const { locale, t } = useI18n();

  /* ── data state ── */
  const [hosts, setHosts] = useState<HostItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [profileRoleIds, setProfileRoleIds] = useState<string[]>([]);
  const [practiceCategoryIds, setPracticeCategoryIds] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [countryCodes, setCountryCodes] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [taxonomy, setTaxonomy] = useState<TaxonomyResponse | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [view, setView] = useState<"list" | "map">("list");
  const [facets, setFacets] = useState<FacetsResponse | null>(null);

  const isAdmin = roles.includes(ROLE_ADMIN);

  /* ── Intl display names ── */
  const languageNames = useMemo(() => {
    try { return new Intl.DisplayNames([locale], { type: "language" }); } catch { return null; }
  }, [locale]);

  const regionNames = useMemo(() => {
    try { return new Intl.DisplayNames([locale], { type: "region" }); } catch { return null; }
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
        if (confirm(t("manage.hostForm.unpublishHasActiveEventsConfirm"))) {
          await authorizedPatch(getToken, `/organizers/${hostId}`, { status, force: true });
          load();
          loadFacets();
        }
      }
    }
  }

  async function deleteHost(hostId: string) {
    try {
      await authorizedDelete(getToken, `/organizers/${hostId}`);
      load();
      loadFacets();
    } catch (err) {
      if (err instanceof Error && err.message === "host_has_active_events") {
        alert(t("manage.hostCard.deleteHasActiveEvents"));
      } else {
        alert(err instanceof Error ? err.message : t("manage.form.unknownError"));
      }
    }
  }

  /* ── derived ── */
  const activeFilterCount = [
    statusFilter,
    ...profileRoleIds,
    ...practiceCategoryIds,
    ...countryCodes,
    ...languages,
    ...cities,
  ].filter(Boolean).length;

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

  const statusOptions = useMemo(
    () => [
      { value: "draft", label: t("common.status.draft") },
      { value: "published", label: t("common.status.published") },
      { value: "archived", label: t("common.status.archived") },
    ],
    [t],
  );

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
          view={view}
          onViewChange={setView}
        />

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
            <HostLeafletClusterMap queryString={mapQueryString} />
          </div>
        )}

        {/* Loading state */}
        {view === "list" && !error && loading && hosts.length === 0 ? (
          <div className="manage-loading">{t("manage.common.loading")}</div>
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
                  languages={host.languages}
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
          </>
        ) : null}
      </div>
    </section>
  );
}
