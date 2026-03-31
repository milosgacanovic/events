"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useKeycloakAuth } from "../../../../components/auth/KeycloakAuthProvider";
import { useI18n } from "../../../../components/i18n/I18nProvider";
import { ManageEventCard } from "../../../../components/manage/ManageEventCard";
import { ManageFilterSidebar } from "../../../../components/manage/ManageFilterSidebar";
import { StatusFilter, SourceFilter, OwnershipFilter } from "../../../../components/manage/ManageFilterSections";
import { ManageResultsToolbar } from "../../../../components/manage/ManageResultsToolbar";
import { authorizedGet, authorizedPost } from "../../../../lib/manageApi";
import { apiBase } from "../../../../lib/api";
import { getFormatLabel, toTitleCase, formatCityLabel } from "../../../../lib/filterHelpers";
import { labelForLanguageCode } from "../../../../lib/i18n/languageLabels";
import { getLocalizedRegionLabel, getLocalizedLanguageLabel } from "../../../../lib/i18n/icuFallback";

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

const EVENT_DATE_PRESETS = ["today", "tomorrow", "this_weekend", "this_week", "next_week", "this_month", "next_month"] as const;

function presetToDateRange(preset: string): { dateFrom: string; dateTo: string } | null {
  const d = new Date();
  const fmt = (dt: Date) => dt.toISOString().slice(0, 10);
  const today = fmt(d);
  switch (preset) {
    case "today": return { dateFrom: today, dateTo: today };
    case "tomorrow": { const t = new Date(d); t.setDate(t.getDate() + 1); return { dateFrom: fmt(t), dateTo: fmt(t) }; }
    case "this_weekend": { const day = d.getDay(); const sat = new Date(d); sat.setDate(d.getDate() + (6 - day)); const sun = new Date(sat); sun.setDate(sat.getDate() + 1); return { dateFrom: fmt(sat), dateTo: fmt(sun) }; }
    case "this_week": { const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay() + 6) % 7)); const sun = new Date(mon); sun.setDate(mon.getDate() + 6); return { dateFrom: fmt(mon), dateTo: fmt(sun) }; }
    case "next_week": { const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 7); const sun = new Date(mon); sun.setDate(mon.getDate() + 6); return { dateFrom: fmt(mon), dateTo: fmt(sun) }; }
    case "this_month": { const start = new Date(d.getFullYear(), d.getMonth(), 1); const end = new Date(d.getFullYear(), d.getMonth() + 1, 0); return { dateFrom: fmt(start), dateTo: fmt(end) }; }
    case "next_month": { const start = new Date(d.getFullYear(), d.getMonth() + 1, 1); const end = new Date(d.getFullYear(), d.getMonth() + 2, 0); return { dateFrom: fmt(start), dateTo: fmt(end) }; }
    case "upcoming": return null;
    case "past": return null;
    default: return null;
  }
}

export default function AdminAllEventsPage() {
  const { getToken } = useKeycloakAuth();
  const { locale, t } = useI18n();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  /* manage-specific */
  const [statusFilter, setStatusFilter] = useState("");
  const [importFilter, setImportFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  /* public-matching filters */
  const [timeFilter, setTimeFilter] = useState("");
  const [includePast, setIncludePast] = useState(false);
  const [attendanceModes, setAttendanceModes] = useState<string[]>([]);
  const [practiceCategoryIds, setPracticeCategoryIds] = useState<string[]>([]);
  const [practiceSubcategoryId, setPracticeSubcategoryId] = useState("");
  const [eventFormatIds, setEventFormatIds] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [countryCodes, setCountryCodes] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  /* UI state */
  const [sortBy, setSortBy] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [taxonomy, setTaxonomy] = useState<TaxonomyResponse | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [view, setView] = useState<"list" | "map">("list");
  /* section open state */
  const [dateOpen, setDateOpen] = useState(false);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [formatOpen, setFormatOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);
  /* autocomplete + distinct lists */
  const [languageSuggestions, setLanguageSuggestions] = useState<string[]>([]);
  const [countrySuggestions, setCountrySuggestions] = useState<string[]>([]);
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [cityQuery, setCityQuery] = useState("");
  const [tagQuery, setTagQuery] = useState("");
  const [citySuggestionsOpen, setCitySuggestionsOpen] = useState(false);
  const [tagSuggestionsOpen, setTagSuggestionsOpen] = useState(false);
  const cityInputRef = useRef<HTMLInputElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);

  const pageSize = 20;

  /* Intl display names */
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

  /* load distinct lists for filter options */
  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const [langRes, countryRes, cityRes, tagRes] = await Promise.all([
          fetch(`${apiBase}/admin/events/distinct-languages`, { headers }).then((r) => r.json()),
          fetch(`${apiBase}/admin/events/distinct-countries`, { headers }).then((r) => r.json()),
          fetch(`${apiBase}/admin/events/distinct-cities`, { headers }).then((r) => r.json()),
          fetch(`${apiBase}/admin/events/distinct-tags`, { headers }).then((r) => r.json()),
        ]);
        setLanguageSuggestions(langRes.items ?? []);
        setCountrySuggestions(countryRes.items ?? []);
        setCitySuggestions(cityRes.items ?? []);
        setTagSuggestions(tagRes.items ?? []);
      } catch { /* ignore */ }
    })();
  }, [getToken]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (search) params.set("q", search);
      if (statusFilter) params.set("status", statusFilter);
      params.set("showUnlisted", "true");
      if (ownerFilter) params.set("ownerFilter", ownerFilter);
      if (importFilter) params.set("sourceFilter", importFilter);
      if (practiceCategoryIds.length) params.set("practiceCategoryId", practiceCategoryIds.join(","));
      if (eventFormatIds.length) params.set("eventFormatId", eventFormatIds.join(","));
      if (countryCodes.length) params.set("countryCode", countryCodes.join(","));
      if (attendanceModes.length) params.set("attendanceMode", attendanceModes.join(","));
      if (languages.length) params.set("languages", languages.join(","));
      if (cities.length) params.set("cities", cities.join(","));
      if (tags.length) params.set("tags", tags.join(","));
      if (timeFilter) {
        if (timeFilter === "upcoming" || timeFilter === "past") {
          params.set("time", timeFilter);
        } else {
          const range = presetToDateRange(timeFilter);
          if (range) { params.set("dateFrom", range.dateFrom); params.set("dateTo", range.dateTo); }
        }
      }
      if (sortBy) params.set("sort", sortBy);
      const data = await authorizedGet<EventsResponse>(getToken, `/admin/events?${params}`);
      setEvents(data.items);
      setTotalItems(data.pagination.totalItems);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("manage.error.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [getToken, page, search, statusFilter, importFilter, ownerFilter, practiceCategoryIds, eventFormatIds, countryCodes, attendanceModes, languages, cities, tags, timeFilter, sortBy, t]);

  useEffect(() => { void load(); }, [load]);

  async function runAction(eventId: string, action: string) {
    try {
      await authorizedPost(getToken, `/events/${eventId}/${action}`, {});
      void load();
    } catch { /* ignore */ }
  }

  async function handleReattach(eventId: string) {
    try {
      await authorizedPost(getToken, `/admin/events/${eventId}/reattach`, {});
      void load();
    } catch { /* ignore */ }
  }

  const activeFilterCount = [
    statusFilter, importFilter, ownerFilter, timeFilter,
    ...practiceCategoryIds, ...eventFormatIds, ...countryCodes,
    ...attendanceModes, ...languages, ...cities, ...tags,
  ].filter(Boolean).length + (includePast ? 1 : 0);

  const statusOptions = useMemo(() => [
    { value: "draft", label: t("common.status.draft") },
    { value: "published", label: t("common.status.published") },
    { value: "cancelled", label: t("common.status.cancelled") },
    { value: "archived", label: t("common.status.archived") },
  ], [t]);

  const sortOptions = useMemo(() => [
    { value: "", label: t("manage.events.sortRecent") },
    { value: "upcoming", label: t("manage.events.sortNextOccurrence") },
    { value: "created", label: t("manage.events.sortCreated") },
    { value: "title", label: t("manage.events.sortTitle") },
  ], [t]);

  function resetPage() { setPage(1); }

  /* computed */
  const hasAnySubcategories = taxonomy?.practices.categories.some((c) => (c.subcategories?.length ?? 0) > 0) ?? false;
  const selectedCategory = practiceCategoryIds.length === 1
    ? taxonomy?.practices.categories.find((c) => c.id === practiceCategoryIds[0])
    : undefined;

  /* city autocomplete filter */
  const visibleCitySuggestions = useMemo(() => {
    const selectedSet = new Set(cities.map((c) => c.toLowerCase()));
    let list = citySuggestions.filter((c) => !selectedSet.has(c.toLowerCase()));
    if (cityQuery) list = list.filter((c) => c.toLowerCase().includes(cityQuery.toLowerCase()));
    return list.slice(0, 10);
  }, [citySuggestions, cities, cityQuery]);

  const visibleTagSuggestions = useMemo(() => {
    const selectedSet = new Set(tags);
    let list = tagSuggestions.filter((t) => !selectedSet.has(t));
    if (tagQuery) list = list.filter((t) => t.toLowerCase().includes(tagQuery.toLowerCase()));
    return list;
  }, [tagSuggestions, tags, tagQuery]);

  function tagDisplay(tag: string): string {
    const key = `tag.${tag.replace(/ /g, "-")}`;
    const translated = t(key);
    return translated !== key ? translated : toTitleCase(tag);
  }

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
          placeholder={t("eventSearch.placeholder.searchTitle")}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />

        {/* ── Manage-specific filters ── */}
        <StatusFilter options={statusOptions} value={statusFilter ? [statusFilter] : []} onChange={(v) => { setStatusFilter(v[0] || ""); resetPage(); }} />
        <SourceFilter value={importFilter} onChange={(v) => { setImportFilter(v); resetPage(); }} />
        <OwnershipFilter value={ownerFilter} onChange={(v) => { setOwnerFilter(v); resetPage(); }} />

        {/* ── Event Date ── */}
        <details open={dateOpen} onToggle={(e) => setDateOpen((e.currentTarget as HTMLDetailsElement).open)}>
          <summary>{t("eventSearch.eventDate")}</summary>
          <div className="kv">
            {EVENT_DATE_PRESETS.map((preset) => {
              const checked = timeFilter === preset;
              return (
                <button
                  type="button"
                  className={"filter-row" + (checked ? " filter-row-selected" : "")}
                  key={preset}
                  onClick={() => { setTimeFilter(checked ? "" : preset); resetPage(); }}
                >
                  <span className="filter-row-icon">{checked ? "\u2212" : "+"}</span>
                  <span className="filter-row-label">{t(`eventSearch.eventDateOption.${preset}`)}</span>
                  <span className="filter-row-count" />
                </button>
              );
            })}
            <button
              type="button"
              className={"filter-row" + (includePast ? " filter-row-selected" : "")}
              onClick={() => {
                const next = !includePast;
                setIncludePast(next);
                if (next) setTimeFilter("past"); else setTimeFilter("");
                resetPage();
              }}
            >
              <span className="filter-row-icon">{includePast ? "\u2212" : "+"}</span>
              <span className="filter-row-label">{t("eventSearch.includePast")}</span>
              <span className="filter-row-count" />
            </button>
          </div>
        </details>

        {/* ── Attendance ── */}
        <details open={attendanceOpen} onToggle={(e) => setAttendanceOpen((e.currentTarget as HTMLDetailsElement).open)}>
          <summary>{t("eventSearch.attendance.anyEventType")}</summary>
          <div className="kv">
            {(["in_person", "online", "hybrid"] as const).map((mode) => {
              const checked = attendanceModes.includes(mode);
              return (
                <button
                  type="button"
                  className={"filter-row" + (checked ? " filter-row-selected" : "")}
                  key={mode}
                  onClick={() => {
                    setAttendanceModes((cur) => cur.includes(mode) ? cur.filter((m) => m !== mode) : [...cur, mode]);
                    resetPage();
                  }}
                >
                  <span className="filter-row-icon">{checked ? "\u2212" : "+"}</span>
                  <span className="filter-row-label">{t(`eventSearch.attendance.${mode}`)}</span>
                  <span className="filter-row-count" />
                </button>
              );
            })}
          </div>
        </details>

        {/* ── Dance Practice ── */}
        <details open={practiceOpen} onToggle={(e) => setPracticeOpen((e.currentTarget as HTMLDetailsElement).open)}>
          <summary>{categorySingularLabel}</summary>
          <div className="filter-scroll">
            {(taxonomy?.practices.categories ?? []).map((cat) => {
              const checked = practiceCategoryIds.includes(cat.id);
              return (
                <button
                  type="button"
                  className={"filter-row" + (checked ? " filter-row-selected" : "")}
                  key={cat.id}
                  onClick={() => {
                    setPracticeCategoryIds((cur) => cur.includes(cat.id) ? cur.filter((id) => id !== cat.id) : [...cur, cat.id]);
                    if (practiceSubcategoryId && !cat.subcategories?.some((s) => s.id === practiceSubcategoryId)) {
                      setPracticeSubcategoryId("");
                    }
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
        {hasAnySubcategories && (
          <label>
            {t("common.subcategory")}
            <select
              value={practiceSubcategoryId}
              onChange={(e) => { setPracticeSubcategoryId(e.target.value); resetPage(); }}
              disabled={!selectedCategory}
            >
              <option value="">{t("eventSearch.option.selectSubcategory")}</option>
              {(selectedCategory?.subcategories ?? []).map((sub) => (
                <option key={sub.id} value={sub.id}>{sub.label}</option>
              ))}
            </select>
          </label>
        )}

        {/* ── Event Format ── */}
        {(taxonomy?.eventFormats?.length ?? 0) > 0 && (
          <details open={formatOpen} onToggle={(e) => setFormatOpen((e.currentTarget as HTMLDetailsElement).open)}>
            <summary>{t("eventSearch.eventFormat")}</summary>
            <div className="kv">
              {taxonomy?.eventFormats?.map((fmt) => {
                const checked = eventFormatIds.includes(fmt.id);
                return (
                  <button
                    type="button"
                    className={"filter-row" + (checked ? " filter-row-selected" : "")}
                    key={fmt.id}
                    onClick={() => {
                      setEventFormatIds((cur) => cur.includes(fmt.id) ? cur.filter((id) => id !== fmt.id) : [...cur, fmt.id]);
                      resetPage();
                    }}
                  >
                    <span className="filter-row-icon">{checked ? "\u2212" : "+"}</span>
                    <span className="filter-row-label">{getFormatLabel(fmt.key, fmt.label, t)}</span>
                    <span className="filter-row-count" />
                  </button>
                );
              })}
            </div>
          </details>
        )}

        {/* ── Event Language ── */}
        {languageSuggestions.length > 0 && (
          <details open={langOpen} onToggle={(e) => setLangOpen((e.currentTarget as HTMLDetailsElement).open)}>
            <summary>{t("eventSearch.eventLanguage")}</summary>
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
            <summary>{t("eventSearch.country")}</summary>
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
            placeholder={t("eventSearch.placeholder.city")}
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

        {/* ── Tags ── */}
        <div className="autocomplete-wrap">
          <input
            ref={tagInputRef}
            value={tagQuery}
            onFocus={() => setTagSuggestionsOpen(true)}
            onBlur={() => window.setTimeout(() => setTagSuggestionsOpen(false), 120)}
            onChange={(e) => setTagQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const match = visibleTagSuggestions[0];
                if (match) {
                  setTags((cur) => [...cur, match]);
                  setTagQuery("");
                  resetPage();
                  setTagSuggestionsOpen(false);
                  tagInputRef.current?.blur();
                }
              }
            }}
            placeholder={t("eventSearch.placeholder.tags")}
          />
          {tagSuggestionsOpen && visibleTagSuggestions.length > 0 && (
            <div className="autocomplete-menu">
              {visibleTagSuggestions.map((tag) => (
                <button
                  type="button"
                  className="autocomplete-option"
                  key={tag}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setTags((cur) => [...cur, tag]);
                    setTagQuery("");
                    resetPage();
                    setTagSuggestionsOpen(false);
                    tagInputRef.current?.blur();
                  }}
                >
                  {tagDisplay(tag)}
                </button>
              ))}
            </div>
          )}
        </div>
        {tags.length > 0 && (
          <div className="kv">
            {tags.map((tag) => (
              <button className="tag" key={tag} type="button" onClick={() => { setTags((cur) => cur.filter((t) => t !== tag)); resetPage(); }}>
                {tagDisplay(tag)} ×
              </button>
            ))}
          </div>
        )}
      </ManageFilterSidebar>

      <div className="panel cards">
        <ManageResultsToolbar
          createHref="/manage/events/new"
          createLabel={t("manage.events.createEvent")}
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
              {events.map((event) => (
                <ManageEventCard
                  key={event.id}
                  id={event.id}
                  slug={event.slug}
                  title={event.title}
                  status={event.status}
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
                  onReattach={event.detached_from_import ? () => void handleReattach(event.id) : undefined}
                />
              ))}
            </div>
            {loading && events.length === 0 && <div className="manage-loading">{t("manage.common.loading")}</div>}
            {(page > 1 || events.length === pageSize) && (
              <div className="manage-pagination">
                {page > 1 && <button type="button" className="secondary-btn" onClick={() => setPage((p) => p - 1)}>{t("manage.common.previous")}</button>}
                {events.length === pageSize && <button type="button" className="secondary-btn" onClick={() => setPage((p) => p + 1)}>{t("manage.common.next")}</button>}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
