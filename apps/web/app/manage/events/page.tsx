"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const ManageMapView = dynamic(
  () => import("../../../components/manage/ManageMapView").then((m) => m.ManageMapView),
  { ssr: false },
);

import { ROLE_ADMIN } from "@dr-events/shared";

import { useKeycloakAuth } from "../../../components/auth/KeycloakAuthProvider";
import { useI18n } from "../../../components/i18n/I18nProvider";
import { ManageEventCard } from "../../../components/manage/ManageEventCard";
import { ManageFilterSidebar } from "../../../components/manage/ManageFilterSidebar";
import {
  StatusFilter,
  VisibilityFilter,
  AttendanceFacetFilter,
  PracticeFacetFilter,
  FormatFacetFilter,
  LanguageFacetFilter,
  CountryFacetFilter,
  CityFacetFilter,
  TagsFacetFilter,
} from "../../../components/manage/ManageFilterSections";
import { ManageResultsToolbar } from "../../../components/manage/ManageResultsToolbar";
import { ConfirmDialog } from "../../../components/manage/ConfirmDialog";
import { authorizedGet, authorizedPost, authorizedPatch, authorizedDelete } from "../../../lib/manageApi";
import { apiBase } from "../../../lib/api";
import { useDisjunctiveFacets, FacetGroupSpec } from "../../../lib/useDisjunctiveFacets";
import { getFormatLabel, formatCityLabel, toTitleCase } from "../../../lib/filterHelpers";
import { getLocalizedRegionLabel, getLocalizedLanguageLabel } from "../../../lib/i18n/icuFallback";

type TaxonomyResponse = {
  uiLabels?: { categorySingular?: string };
  practices: {
    categories: Array<{
      id: string;
      key: string;
      label: string;
      subcategories?: Array<{ id: string; label: string }>;
    }>;
  };
  eventFormats?: Array<{ id: string; key: string; label: string }>;
  organizerRoles?: Array<{ id: string; key: string; label: string }>;
};

type EventItem = {
  id: string;
  slug: string;
  title: string;
  status: string;
  visibility: "public" | "unlisted";
  attendance_mode: string;
  schedule_kind: string;
  is_imported: boolean;
  import_source: string | null;
  detached_from_import: boolean;
  cover_image_path: string | null;
  tags: string[] | null;
  updated_at: string;
  practice_category_label: string | null;
  event_format_label: string | null;
  event_format_key: string | null;
  location_city: string | null;
  location_country: string | null;
  next_occurrence: string | null;
  next_ends_at: string | null;
  event_timezone: string | null;
  host_names: string | null;
  created_by_name: string | null;
};

type EventsResponse = {
  items: EventItem[];
  pagination: { page: number; pageSize: number; totalPages: number; totalItems: number };
};

type Filters = {
  q: string;
  statuses: string[];
  visibilities: string[];
  timeFilter: string;
  dateFrom: string;
  dateTo: string;
  attendanceModes: string[];
  practiceCategoryIds: string[];
  eventFormatIds: string[];
  languages: string[];
  countryCodes: string[];
  cities: string[];
  tags: string[];
  sortBy: string;
  page: number;
};

const DATE_PRESETS = [
  "upcoming",
  "next_7_days",
  "next_30_days",
] as const;

const DEFAULT_FILTERS: Filters = {
  q: "",
  statuses: [],
  visibilities: [],
  timeFilter: "",
  dateFrom: "",
  dateTo: "",
  attendanceModes: [],
  practiceCategoryIds: [],
  eventFormatIds: [],
  languages: [],
  countryCodes: [],
  cities: [],
  tags: [],
  sortBy: "",
  page: 1,
};

const FACET_GROUPS: FacetGroupSpec[] = [
  { responseKey: "statuses", filterParam: "status" },
  { responseKey: "visibilities", filterParam: "visibility" },
  { responseKey: "attendanceModes", filterParam: "attendanceMode" },
  { responseKey: "practiceCategoryIds", filterParam: "practiceCategoryId" },
  { responseKey: "eventFormatIds", filterParam: "eventFormatId" },
  { responseKey: "languages", filterParam: "languages" },
  { responseKey: "countryCodes", filterParam: "countryCode" },
  { responseKey: "cities", filterParam: "cities" },
  { responseKey: "tags", filterParam: "tags" },
];

const PAGE_SIZE = 20;

function filtersFromParams(sp: URLSearchParams): Filters {
  const csv = (key: string) => sp.get(key)?.split(",").filter(Boolean) ?? [];
  return {
    q: sp.get("q") ?? "",
    statuses: csv("status"),
    visibilities: csv("visibility"),
    timeFilter: sp.get("time") ?? "",
    dateFrom: sp.get("dateFrom") ?? "",
    dateTo: sp.get("dateTo") ?? "",
    attendanceModes: csv("attendanceMode"),
    practiceCategoryIds: csv("practiceCategoryId"),
    eventFormatIds: csv("eventFormatId"),
    languages: csv("languages"),
    countryCodes: csv("countryCode"),
    cities: csv("cities"),
    tags: csv("tags"),
    sortBy: sp.get("sort") ?? "",
    page: Number(sp.get("page")) || 1,
  };
}

function filtersToParams(f: Filters): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.statuses.length) p.set("status", f.statuses.join(","));
  if (f.visibilities.length) p.set("visibility", f.visibilities.join(","));
  if (f.timeFilter) p.set("time", f.timeFilter);
  if (f.dateFrom) p.set("dateFrom", f.dateFrom);
  if (f.dateTo) p.set("dateTo", f.dateTo);
  if (f.attendanceModes.length) p.set("attendanceMode", f.attendanceModes.join(","));
  if (f.practiceCategoryIds.length) p.set("practiceCategoryId", f.practiceCategoryIds.join(","));
  if (f.eventFormatIds.length) p.set("eventFormatId", f.eventFormatIds.join(","));
  if (f.languages.length) p.set("languages", f.languages.join(","));
  if (f.countryCodes.length) p.set("countryCode", f.countryCodes.join(","));
  if (f.cities.length) p.set("cities", f.cities.join(","));
  if (f.tags.length) p.set("tags", f.tags.join(","));
  if (f.sortBy) p.set("sort", f.sortBy);
  if (f.page > 1) p.set("page", String(f.page));
  return p.toString();
}

export default function MyEventsPage() {
  const { getToken, roles } = useKeycloakAuth();
  const { locale, t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  /* ── filter state ── */
  const [filters, setFiltersRaw] = useState<Filters>(() => filtersFromParams(searchParams));
  const syncingFromUrl = useRef(false);

  const setFilter = useCallback(<K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFiltersRaw((prev) => ({ ...prev, [key]: value }));
  }, []);
  const setFilters = useCallback((patch: Partial<Filters>) => {
    setFiltersRaw((prev) => ({ ...prev, ...patch }));
  }, []);

  /* ── sync filters → URL ── */
  useEffect(() => {
    if (syncingFromUrl.current) return;
    const qs = filtersToParams(filters);
    const url = qs ? `${pathname}?${qs}` : pathname;
    window.history.replaceState(window.history.state, "", url);
    try { sessionStorage.setItem("manageEventsUrl", url); } catch {}
  }, [filters, pathname]);

  /* ── sync URL → filters (browser back/forward) ── */
  useEffect(() => {
    const fromUrl = filtersFromParams(searchParams);
    if (JSON.stringify(fromUrl) !== JSON.stringify(filters)) {
      syncingFromUrl.current = true;
      setFiltersRaw(fromUrl);
      setTimeout(() => { syncingFromUrl.current = false; }, 0);
    }
  }, [searchParams]);

  const {
    q,
    statuses,
    visibilities,
    timeFilter,
    dateFrom,
    dateTo,
    attendanceModes,
    practiceCategoryIds,
    eventFormatIds,
    languages,
    countryCodes,
    cities,
    tags,
    sortBy,
    page,
  } = filters;

  /* ── data state ── */
  const [events, setEvents] = useState<EventItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [taxonomy, setTaxonomy] = useState<TaxonomyResponse | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [publishHostDialog, setPublishHostDialog] = useState<string | null>(null);
  const [noHostDontShow, setNoHostDontShow] = useState(false);
  const [alertMsg, setAlertMsg] = useState("");
  const [view, setView] = useState<"list" | "map">("list");
  const [dateRangeOpen, setDateRangeOpen] = useState(!!(filters.dateFrom) || !!(filters.dateTo));
  const [practiceSubcategoryId, setPracticeSubcategoryId] = useState("");
  const [userHostCount, setUserHostCount] = useState<number | null>(null);
  const [facetRefreshKey, setFacetRefreshKey] = useState(0);

  const isAdmin = roles.includes(ROLE_ADMIN);
  const isPast = timeFilter === "past";

  const dateFormatHint = useMemo(() => {
    try {
      const parts = new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(2013, 10, 25));
      return parts.map((p) => p.type === "year" ? "yyyy" : p.type === "month" ? "mm" : p.type === "day" ? "dd" : p.value).join("");
    } catch {
      return "dd/mm/yyyy";
    }
  }, [locale]);

  /* ── taxonomy ── */
  useEffect(() => {
    fetch(`${apiBase}/meta/taxonomies`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: TaxonomyResponse) => setTaxonomy(d))
      .catch(() => {});
  }, []);

  /* ── disjunctive facets ── */
  const activeFilters = useMemo(() => {
    const f: Record<string, string> = {};
    if (statuses.length) f.status = statuses.join(",");
    if (visibilities.length) f.visibility = visibilities.join(",");
    if (attendanceModes.length) f.attendanceMode = attendanceModes.join(",");
    if (practiceCategoryIds.length) f.practiceCategoryId = practiceCategoryIds.join(",");
    if (eventFormatIds.length) f.eventFormatId = eventFormatIds.join(",");
    if (languages.length) f.languages = languages.join(",");
    if (countryCodes.length) f.countryCode = countryCodes.join(",");
    if (cities.length) f.cities = cities.join(",");
    if (tags.length) f.tags = tags.join(",");
    return f;
  }, [statuses, visibilities, attendanceModes, practiceCategoryIds, eventFormatIds, languages, countryCodes, cities, tags]);

  const facets = useDisjunctiveFacets<Record<string, Record<string, number>>>(
    "/admin/events/facets",
    FACET_GROUPS,
    activeFilters,
    getToken,
    true,
    facetRefreshKey,
  );

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

  /* ── load events ── */
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        managedBy: "me",
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (q) params.set("q", q);
      if (statuses.length) params.set("status", statuses.join(","));
      if (visibilities.length === 1) params.set("visibility", visibilities[0]);
      if (practiceCategoryIds.length) params.set("practiceCategoryId", practiceCategoryIds.join(","));
      if (eventFormatIds.length) params.set("eventFormatId", eventFormatIds.join(","));
      if (countryCodes.length) params.set("countryCode", countryCodes.join(","));
      if (attendanceModes.length) params.set("attendanceMode", attendanceModes.join(","));
      if (languages.length) params.set("languages", languages.join(","));
      if (cities.length) params.set("cities", cities.join(","));
      if (tags.length) params.set("tags", tags.join(","));
      if (timeFilter) params.set("time", timeFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (sortBy) params.set("sort", sortBy);

      const data = await authorizedGet<EventsResponse>(getToken, `/admin/events?${params}`);
      setEvents(data.items);
      setTotalItems(data.pagination.totalItems);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("manage.error.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [getToken, page, q, statuses, visibilities, practiceCategoryIds, eventFormatIds, countryCodes, attendanceModes, languages, cities, tags, timeFilter, dateFrom, dateTo, sortBy, t]);

  useEffect(() => {
    void load();
  }, [load]);

  /* ── actions ── */
  async function runAction(eventId: string, action: string) {
    try {
      await authorizedPost(getToken, `/events/${eventId}/${action}`, {});
      setFacetRefreshKey((k) => k + 1);
      load();
    } catch (err) {
      if (err instanceof Error && err.message === "publish_requires_host") {
        // Card already showed no-host warning, so force-publish directly
        try {
          await authorizedPost(getToken, `/events/${eventId}/publish`, { force: true });
          setFacetRefreshKey((k) => k + 1);
          load();
        } catch (retryErr) {
          setAlertMsg(retryErr instanceof Error ? retryErr.message : t("manage.form.unknownError"));
        }
      }
    }
  }

  async function deleteEvent(eventId: string) {
    try {
      await authorizedDelete(getToken, `/events/${eventId}`);
      setFacetRefreshKey((k) => k + 1);
      load();
    } catch (err) {
      setAlertMsg(err instanceof Error ? err.message : t("manage.form.unknownError"));
    }
  }

  async function setEventVisibility(eventId: string, visibility: "public" | "unlisted") {
    try {
      await authorizedPatch(getToken, `/events/${eventId}`, { visibility });
      setFacetRefreshKey((k) => k + 1);
      load();
    } catch (err) {
      setAlertMsg(err instanceof Error ? err.message : t("manage.form.unknownError"));
    }
  }

  const mapQueryString = useMemo(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (practiceCategoryIds.length) params.set("practiceCategoryId", practiceCategoryIds.join(","));
    if (eventFormatIds.length) params.set("eventFormatId", eventFormatIds.join(","));
    if (languages.length) params.set("languages", languages.join(","));
    if (attendanceModes.length) params.set("attendanceMode", attendanceModes.join(","));
    if (countryCodes.length) params.set("countryCode", countryCodes.join(","));
    if (cities.length) params.set("city", cities.join(","));
    if (tags.length) params.set("tags", tags.join(","));
    return params.toString();
  }, [q, practiceCategoryIds, eventFormatIds, languages, attendanceModes, countryCodes, cities, tags]);

  const statusOptions = useMemo(
    () => [
      { value: "draft", label: t("common.status.draft") },
      { value: "published", label: t("common.status.published") },
      { value: "cancelled", label: t("common.status.cancelled") },
      { value: "archived", label: t("common.status.archived") },
    ],
    [t],
  );

  const sortOptions = useMemo(
    () => [
      { value: "", label: t("manage.events.sortCreated") },
      { value: "edited", label: t("manage.events.sortRecent") },
      { value: "upcoming", label: t("manage.events.sortNextOccurrence") },
      { value: "title", label: t("manage.events.sortTitle") },
    ],
    [t],
  );

  const hasSubcategories =
    taxonomy?.practices.categories.some((c) => (c.subcategories?.length ?? 0) > 0) ?? false;

  /* ── filter chips ── */
  const selectedFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];
    if (q.trim()) {
      chips.push({ key: "q", label: `"${q.trim()}"`, onRemove: () => { setFilters({ q: "", page: 1 }); } });
    }
    for (const s of statuses) {
      const opt = statusOptions.find((o) => o.value === s);
      chips.push({ key: `status:${s}`, label: opt?.label ?? s, onRemove: () => { setFilters({ statuses: statuses.filter((x) => x !== s), page: 1 }); } });
    }
    for (const v of visibilities) {
      chips.push({ key: `vis:${v}`, label: v === "unlisted" ? t("common.visibility.unlisted") : t("common.visibility.public"), onRemove: () => { setFilters({ visibilities: visibilities.filter((x) => x !== v), page: 1 }); } });
    }
    if (timeFilter) {
      chips.push({ key: `time:${timeFilter}`, label: t(`eventSearch.eventDateOption.${timeFilter}`), onRemove: () => { setFilters({ timeFilter: "", page: 1 }); } });
    }
    if (dateFrom || dateTo) {
      const fromLabel = dateFrom ? new Date(`${dateFrom}T12:00:00Z`).toLocaleDateString(locale, { month: "short", day: "numeric" }) : "";
      const toLabel = dateTo ? new Date(`${dateTo}T12:00:00Z`).toLocaleDateString(locale, { month: "short", day: "numeric" }) : "";
      const label = dateFrom && dateTo ? `${fromLabel} – ${toLabel}` : dateFrom ? `${t("eventSearch.dateFrom")} ${fromLabel}` : `${t("eventSearch.dateTo")} ${toLabel}`;
      chips.push({ key: "dateRange", label, onRemove: () => { setFilters({ dateFrom: "", dateTo: "", page: 1 }); setDateRangeOpen(false); } });
    }
    for (const mode of attendanceModes) {
      chips.push({ key: `att:${mode}`, label: t(`eventSearch.attendance.${mode}`), onRemove: () => { setFilters({ attendanceModes: attendanceModes.filter((x) => x !== mode), page: 1 }); } });
    }
    for (const catId of practiceCategoryIds) {
      const cat = taxonomy?.practices.categories.find((c) => c.id === catId);
      chips.push({ key: `cat:${catId}`, label: cat?.label ?? catId, onRemove: () => { setFilters({ practiceCategoryIds: practiceCategoryIds.filter((x) => x !== catId), page: 1 }); } });
    }
    for (const fmtId of eventFormatIds) {
      const fmt = taxonomy?.eventFormats?.find((f) => f.id === fmtId);
      chips.push({ key: `fmt:${fmtId}`, label: fmt ? getFormatLabel(fmt.key, fmt.label, t) : fmtId, onRemove: () => { setFilters({ eventFormatIds: eventFormatIds.filter((x) => x !== fmtId), page: 1 }); } });
    }
    for (const lang of languages) {
      chips.push({ key: `lang:${lang}`, label: getLanguageLabel(lang), onRemove: () => { setFilters({ languages: languages.filter((x) => x !== lang), page: 1 }); } });
    }
    for (const cc of countryCodes) {
      chips.push({ key: `country:${cc}`, label: getCountryLabel(cc), onRemove: () => { setFilters({ countryCodes: countryCodes.filter((x) => x !== cc), page: 1 }); } });
    }
    for (const city of cities) {
      chips.push({ key: `city:${city}`, label: toTitleCase(city), onRemove: () => { setFilters({ cities: cities.filter((x) => x !== city), page: 1 }); } });
    }
    for (const tag of tags) {
      const key = `tag.${tag.replace(/ /g, "-")}`;
      const translated = t(key);
      chips.push({ key: `tag:${tag}`, label: translated !== key ? translated : toTitleCase(tag), onRemove: () => { setFilters({ tags: tags.filter((x) => x !== tag), page: 1 }); } });
    }
    return chips;
  }, [q, statuses, statusOptions, visibilities, timeFilter, dateFrom, dateTo, attendanceModes, practiceCategoryIds, eventFormatIds, languages, countryCodes, cities, tags, taxonomy, t, locale, getLanguageLabel, getCountryLabel, setFilters]);

  const clearFilters = useCallback(() => {
    setFiltersRaw((prev) => ({ ...DEFAULT_FILTERS, sortBy: prev.sortBy }));
    setDateRangeOpen(false);
  }, []);

  const activeFilterCount = selectedFilterChips.length;

  const selectedCategory =
    practiceCategoryIds.length === 1
      ? taxonomy?.practices.categories.find((c) => c.id === practiceCategoryIds[0])
      : undefined;

  return (
    <section className={`grid${sidebarOpen ? " sidebar-open" : ""}`} style={{ marginTop: 8 }}>
      {/* ── Sidebar filters ── */}
      <ManageFilterSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)}>
        <input
          placeholder={t("eventSearch.placeholder.searchTitle")}
          value={q}
          onChange={(e) => { setFilters({ q: e.target.value, page: 1 }); }}
        />

        <StatusFilter
          options={statusOptions}
          value={statuses}
          counts={facets?.statuses}
          onChange={(v) => { setFilters({ statuses: v, page: 1 }); }}
        />

        <VisibilityFilter
          counts={facets?.visibilities}
          value={visibilities}
          onChange={(v) => { setFilters({ visibilities: v, page: 1 }); }}
        />

        {/* Date presets */}
        <details open>
          <summary>{t("eventSearch.eventDate")}</summary>
          <div className="kv">
            {DATE_PRESETS.map((preset) => {
              const selected = timeFilter === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  className={`filter-row${selected ? " filter-row-selected" : ""}`}
                  onClick={() => { setFilters({ timeFilter: selected ? "" : preset, page: 1 }); }}
                >
                  <span className="filter-row-icon">{selected ? "\u2212" : "+"}</span>
                  <span className="filter-row-label">{t(`eventSearch.eventDateOption.${preset}`)}</span>
                  {facets?.timeCounts?.[preset] != null && <span className="filter-row-count">{facets.timeCounts[preset]}</span>}
                </button>
              );
            })}
            <button
              type="button"
              className={`filter-row${dateRangeOpen ? " filter-row-selected" : ""}`}
              onClick={() => {
                if (dateRangeOpen) {
                  setDateRangeOpen(false);
                  setFilters({ dateFrom: "", dateTo: "", page: 1 });
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
                      value={dateFrom}
                      max={dateTo || undefined}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v && dateTo && v > dateTo) {
                          setFilters({ dateFrom: dateTo, dateTo: v, timeFilter: "", page: 1 });
                        } else {
                          setFilters({ dateFrom: v, timeFilter: v ? "" : timeFilter, page: 1 });
                        }
                      }}
                    />
                    {!dateFrom && <span className="date-input-placeholder">{dateFormatHint}</span>}
                  </div>
                </label>
                <label className="date-range-label">
                  <span>{t("eventSearch.dateTo")}</span>
                  <div className="date-input-wrap">
                    <input
                      type="date"
                      className="date-range-input"
                      value={dateTo}
                      min={dateFrom || undefined}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v && dateFrom && v < dateFrom) {
                          setFilters({ dateTo: dateFrom, dateFrom: v, timeFilter: "", page: 1 });
                        } else {
                          setFilters({ dateTo: v, timeFilter: v ? "" : timeFilter, page: 1 });
                        }
                      }}
                    />
                    {!dateTo && <span className="date-input-placeholder">{dateFormatHint}</span>}
                  </div>
                </label>
              </div>
            )}
            <button
              type="button"
              className={`filter-row${isPast ? " filter-row-selected" : ""}`}
              onClick={() => { setFilters({ timeFilter: isPast ? "" : "past", page: 1 }); }}
            >
              <span className="filter-row-icon">{isPast ? "\u2212" : "+"}</span>
              <span className="filter-row-label">{t("eventSearch.eventDateOption.past")}</span>
              {facets?.timeCounts?.past != null && <span className="filter-row-count">{facets.timeCounts.past}</span>}
            </button>
          </div>
        </details>

        <AttendanceFacetFilter
          counts={facets?.attendanceModes ?? {}}
          value={attendanceModes}
          onChange={(v) => { setFilters({ attendanceModes: v, page: 1 }); }}
        />

        <PracticeFacetFilter
          categories={taxonomy?.practices.categories ?? []}
          counts={facets?.practiceCategoryIds ?? {}}
          value={practiceCategoryIds}
          sectionLabel={categorySingularLabel}
          onChange={(v) => {
            setFilters({ practiceCategoryIds: v, page: 1 });
            if (
              practiceSubcategoryId &&
              !taxonomy?.practices.categories
                .find((c) => v.includes(c.id))
                ?.subcategories?.some((s) => s.id === practiceSubcategoryId)
            ) {
              setPracticeSubcategoryId("");
            }
          }}
        />

        {hasSubcategories && (
          <label>
            {t("common.subcategory")}
            <select
              value={practiceSubcategoryId}
              onChange={(e) => { setPracticeSubcategoryId(e.target.value); setFilter("page", 1); }}
              disabled={!selectedCategory}
            >
              <option value="">{t("eventSearch.option.selectSubcategory")}</option>
              {(selectedCategory?.subcategories ?? []).map((sub) => (
                <option key={sub.id} value={sub.id}>{sub.label}</option>
              ))}
            </select>
          </label>
        )}

        <FormatFacetFilter
          formats={taxonomy?.eventFormats ?? []}
          counts={facets?.eventFormatIds ?? {}}
          value={eventFormatIds}
          getLabel={(key, label) => getFormatLabel(key, label, t)}
          onChange={(v) => { setFilters({ eventFormatIds: v, page: 1 }); }}
        />

        <LanguageFacetFilter
          counts={facets?.languages ?? {}}
          value={languages}
          getLabel={getLanguageLabel}
          sectionLabel={t("eventSearch.eventLanguage")}
          onChange={(v) => { setFilters({ languages: v, page: 1 }); }}
        />

        <CountryFacetFilter
          counts={facets?.countryCodes ?? {}}
          value={countryCodes}
          getLabel={getCountryLabel}
          sectionLabel={t("eventSearch.country")}
          onChange={(v) => { setFilters({ countryCodes: v, page: 1 }); }}
        />

        <CityFacetFilter
          counts={facets?.cities ?? {}}
          value={cities}
          getLabel={formatCityLabel}
          sectionLabel={t("eventSearch.placeholder.city")}
          onChange={(v) => { setFilters({ cities: v, page: 1 }); }}
        />

        <TagsFacetFilter
          counts={facets?.tags ?? {}}
          value={tags}
          getLabel={function (tag: string) {
            const key = `tag.${tag.replace(/ /g, "-")}`;
            const translated = t(key);
            return translated !== key ? translated : toTitleCase(tag);
          }}
          sectionLabel={t("eventSearch.placeholder.tags")}
          onChange={(v) => { setFilters({ tags: v, page: 1 }); }}
        />
      </ManageFilterSidebar>

      {/* ── Main content ── */}
      <div className="panel cards">
        <ManageResultsToolbar
          createHref="/manage/events/new"
          createLabel={t("manage.events.createEvent")}
          totalItems={totalItems}
          sortValue={sortBy}
          sortOptions={sortOptions}
          onSortChange={(v) => { setFilters({ sortBy: v, page: 1 }); }}
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
            <ManageMapView getToken={getToken} endpoint="/admin/events/map" queryString={mapQueryString} entityType="event" refreshToken={facetRefreshKey} />
          </div>
        )}

        {/* Loading state */}
        {view === "list" && !error && loading && events.length === 0 ? (
          <div className="cards-loading-overlay" style={{ position: "relative", padding: 48 }}>
            <div className="filter-spinner" />
          </div>
        ) : view === "list" && !error && events.length === 0 ? (
          /* Empty state */
          <div className="manage-empty">
            {activeFilterCount > 0 || q ? (
              <h3>{t("manage.events.noResults")}</h3>
            ) : isAdmin ? (
              <>
                <h3>{t("manage.events.emptyAdmin")}</h3>
                <Link
                  href="/manage/admin/events"
                  className="secondary-btn"
                  style={{ marginTop: 12, display: "inline-block" }}
                >
                  {t("manage.events.allEventsLink")}
                </Link>
              </>
            ) : (
              <>
                <h3>{t("manage.events.noEvents")}</h3>
                <p>{t("manage.events.noEventsDescription")}</p>
                {userHostCount === 0 && (
                  <p className="meta" style={{ marginTop: 8 }}>
                    {t("manage.events.needHostFirst")}{" "}
                    <Link href="/manage/hosts/new">{t("manage.events.createHostLink")}</Link>
                  </p>
                )}
                <Link
                  href="/manage/events/new"
                  className="primary-btn"
                  style={{ marginTop: 12, display: "inline-block" }}
                >
                  {t("manage.events.createEvent")}
                </Link>
              </>
            )}
          </div>
        ) : view === "list" && !error ? (
          /* Results */
          <div className="cards-content">
            {loading && events.length > 0 && (
              <div className="cards-loading-overlay">
                <div className="filter-spinner" />
              </div>
            )}
            <div className="manage-card-list">
              {events.map((event) => (
                <ManageEventCard
                  key={event.id}
                  id={event.id}
                  slug={event.slug}
                  title={event.title}
                  status={event.status}
                  visibility={event.visibility}
                  attendanceMode={event.attendance_mode}
                  coverImagePath={event.cover_image_path}
                  isImported={event.is_imported}
                  importSource={event.import_source}
                  detachedFromImport={event.detached_from_import}
                  practiceCategoryLabel={event.practice_category_label}
                  eventFormatLabel={event.event_format_label}
                  eventFormatKey={event.event_format_key}
                  tags={event.tags}
                  locationCity={event.location_city}
                  locationCountry={event.location_country}
                  nextOccurrence={event.next_occurrence}
                  nextEndsAt={event.next_ends_at}
                  eventTimezone={event.event_timezone}
                  hostNames={event.host_names}
                  onPublish={event.status === "draft" ? () => void runAction(event.id, "publish") : undefined}
                  onUnpublish={event.status === "published" ? () => void runAction(event.id, "unpublish") : undefined}
                  onCancel={event.status === "published" ? () => void runAction(event.id, "cancel") : undefined}
                  onArchive={
                    event.status === "draft" || event.status === "cancelled"
                      ? () => void runAction(event.id, "archive")
                      : undefined
                  }
                  onUnarchive={event.status === "archived" ? () => void runAction(event.id, "unpublish") : undefined}
                  onDelete={event.status === "archived" ? () => void deleteEvent(event.id) : undefined}
                  onMakePublic={event.visibility === "unlisted" ? () => void setEventVisibility(event.id, "public") : undefined}
                />
              ))}
            </div>

            {/* Pagination */}
            {(page > 1 || events.length === PAGE_SIZE) && (
              <div className="manage-pagination">
                {page > 1 && (
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => setFilter("page", page - 1)}
                  >
                    {t("manage.common.previous")}
                  </button>
                )}
                {events.length === PAGE_SIZE && (
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => setFilter("page", page + 1)}
                  >
                    {t("manage.common.next")}
                  </button>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Publish requires host warning */}
      <ConfirmDialog
        open={!!publishHostDialog}
        title={t("manage.eventForm.noHostWarningTitle")}
        message={t("manage.eventForm.noHostWarningMessage")}
        confirmLabel={t("manage.eventForm.noHostIgnore")}
        cancelLabel={t("manage.eventForm.noHostAddHost")}
        variant="warning"
        showDontShowAgain
        dontShowAgainChecked={noHostDontShow}
        onDontShowAgainChange={setNoHostDontShow}
        onConfirm={() => {
          const eventId = publishHostDialog;
          setPublishHostDialog(null);
          if (noHostDontShow) localStorage.setItem("hideNoHostWarning", "true");
          if (eventId) void authorizedPost(getToken, `/events/${eventId}/publish`, { force: true }).then(() => { setFacetRefreshKey((k) => k + 1); load(); });
        }}
        onCancel={() => {
          const eventId = publishHostDialog;
          setPublishHostDialog(null);
          if (eventId) router.push(`/manage/events/${eventId}#hosts`);
        }}
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
