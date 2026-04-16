"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useRef } from "react";

import { apiBase, fetchJson } from "../../lib/api";
import { labelForLanguageCode } from "../../lib/i18n/languageLabels";
import { useI18n } from "../i18n/I18nProvider";
import { useKeycloakAuth } from "../auth/KeycloakAuthProvider";
import { RichTextEditor } from "./RichTextEditor";

type TaxonomyResponse = {
  uiLabels: {
    categorySingular?: string;
    categoryPlural?: string;
    practiceCategory?: string;
  };
  practices: {
    categories: Array<{
      id: string;
      key: string;
      label: string;
      subcategories: Array<{
        id: string;
        key: string;
        label: string;
      }>;
    }>;
  };
  organizerRoles: Array<{
    id: string;
    key: string;
    label: string;
  }>;
  eventFormats?: Array<{
    id: string;
    key: string;
    label: string;
  }>;
};

type OrganizerOption = {
  id: string;
  slug: string;
  name: string;
};

type OrganizerFacetResponse = {
  facets?: {
    languages?: Record<string, number>;
    countryCode?: Record<string, number>;
  };
};

type AdminOrganizer = {
  id: string;
  slug: string;
  name: string;
  status: "draft" | "published" | "archived";
  updated_at: string;
};

type EventOrganizerRoleDraft = {
  organizerId: string;
  roleId: string;
  displayOrder: number;
};

type AdminEventDetailResponse = {
  id: string;
  slug: string;
  title: string;
  description_json?: Record<string, unknown>;
  attendance_mode: "in_person" | "online" | "hybrid";
  online_url: string | null;
  practice_category_id: string;
  practice_subcategory_id: string | null;
  event_format_id: string | null;
  tags: string[];
  languages: string[];
  schedule_kind: "single" | "recurring";
  event_timezone: string;
  single_start_at: string | null;
  single_end_at: string | null;
  rrule: string | null;
  rrule_dtstart_local: string | null;
  duration_minutes: number | null;
  visibility: "public" | "unlisted";
  status: "draft" | "published" | "cancelled" | "archived";
  cover_image_path: string | null;
  organizer_roles: Array<{
    organizer_id: string;
    role_id: string;
    display_order: number;
  }>;
  location_id: string | null;
  location: {
    id: string;
    formatted_address: string;
    city: string | null;
    country_code: string | null;
    lat: number;
    lng: number;
  } | null;
};

type AdminOrganizerDetailResponse = {
  id: string;
  slug: string;
  name: string;
  description_json: Record<string, unknown>;
  description_html?: string | null;
  website_url: string | null;
  external_url: string | null;
  image_url: string | null;
  tags: string[];
  languages: string[];
  city: string | null;
  country_code: string | null;
  profile_role_ids?: string[];
  practice_category_ids?: string[];
  derived_role_ids?: string[];
  derived_practice_category_ids?: string[];
  locations?: Array<{
    id: string;
    is_primary?: boolean;
    external_source?: string | null;
    external_id?: string | null;
    provider?: string | null;
    place_id?: string | null;
    label: string | null;
    formatted_address: string | null;
    city: string | null;
    country_code: string | null;
    lat: number | null;
    lng: number | null;
  }>;
  status: "draft" | "published" | "archived";
};

type EventEditorState = {
  id: string;
  slug: string;
  title: string;
  descriptionHtml: string;
  attendanceMode: "in_person" | "online" | "hybrid";
  onlineUrl: string;
  practiceCategoryId: string;
  practiceSubcategoryId: string;
  eventFormatId: string;
  tags: string;
  languages: string;
  scheduleKind: "single" | "recurring";
  eventTimezone: string;
  singleStartAt: string;
  singleEndAt: string;
  rrule: string;
  rruleDtstartLocal: string;
  durationMinutes: string;
  visibility: "public" | "unlisted";
  coverImageUrl: string;
  locationId: string | null;
  locationLabel: string;
};

type OrganizerEditorState = {
  id: string;
  slug: string;
  name: string;
  descriptionRaw: Record<string, unknown>;
  descriptionHtml: string;
  websiteUrl: string;
  externalUrl: string;
  imageUrl: string;
  tags: string;
  languages: string[];
  city: string;
  countryCodes: string[];
  locations: Array<{
    id: string;
    isPrimary: boolean;
    label: string;
    formattedAddress: string;
    city: string;
    countryCode: string;
    lat: string;
    lng: string;
    provider: string;
    placeId: string;
  }>;
  profileRoleIds: string[];
  practiceCategoryIds: string[];
  status: "draft" | "published" | "archived";
};

type AdminSection = "events" | "organizers" | "taxonomies" | "users";

type GeocodeResult = {
  formatted_address: string;
  lat: number;
  lng: number;
  country_code: string | null;
  city: string | null;
  raw?: unknown;
};

type LocationResponse = {
  id: string;
  formatted_address: string;
  city: string | null;
  country_code: string | null;
  lat: number;
  lng: number;
};

type MultiSelectOption = {
  value: string;
  label: string;
};

function csvToArray(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function datetimeLocalToIso(value: string): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function isoToDatetimeLocal(value: string | null): string {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function deriveTaxonomyKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function mergeLegacyOrganizerDescription(
  raw: Record<string, unknown> | null | undefined,
): string {
  const source = raw ?? {};
  const normalizeText = (value: unknown): string => {
    if (typeof value !== "string") {
      return "";
    }
    return value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]*>/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/\s+\n/g, "\n")
      .trim();
  };
  const bio = normalizeText(source.bio);
  const info = normalizeText(source.info);
  const description = normalizeText(source.description);
  const sections: Array<{ heading: string; value: string }> = [];
  if (bio) sections.push({ heading: "Bio", value: bio });
  if (info && info !== bio) sections.push({ heading: "Info", value: info });
  if (description && description !== bio && description !== info) {
    sections.push({ heading: "Description", value: description });
  }
  if (sections.length > 0) {
    return sections
      .map((section) => `<p>${escapeHtml(section.heading)}</p><p>${escapeHtml(section.value).replace(/\n/g, "<br>")}</p>`)
      .join("");
  }
  const fallbackCandidates = [source.html, source.text];
  for (const candidate of fallbackCandidates) {
    const normalized = normalizeText(candidate);
    if (normalized) {
      return `<p>${escapeHtml(normalized).replace(/\n/g, "<br>")}</p>`;
    }
  }
  return "";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function ensureHtml(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  // If it already contains HTML tags, use as-is
  if (/<[a-z][\s\S]*?>/i.test(trimmed)) return trimmed;
  // Plain text — convert double newlines to paragraphs, single newlines to <br>
  return trimmed
    .split(/\n\n+/)
    .map((para) => `<p>${escapeHtml(para.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function SearchableMultiSelectDropdown({
  label,
  options,
  selectedValues,
  onChange,
  placeholder,
}: {
  label: string;
  options: MultiSelectOption[];
  selectedValues: string[];
  onChange: (nextValues: string[]) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return options.filter((option) => {
      if (!normalized) {
        return true;
      }
      return option.label.toLowerCase().includes(normalized) || option.value.toLowerCase().includes(normalized);
    });
  }, [options, query]);

  const selectedOptions = useMemo(() => {
    const map = new Map(options.map((option) => [option.value, option]));
    return selectedValues
      .map((value) => map.get(value))
      .filter((item): item is MultiSelectOption => Boolean(item));
  }, [options, selectedValues]);

  return (
    <div className="searchable-multiselect">
      <label>{label}</label>
      <button
        type="button"
        className="ghost-btn"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {selectedOptions.length > 0 ? `${selectedOptions.length} selected` : placeholder}
      </button>
      {selectedOptions.length > 0 && (
        <div className="kv">
          {selectedOptions.map((option) => (
            <button
              className="tag"
              type="button"
              key={`${label}-chip-${option.value}`}
              onClick={() => onChange(selectedValues.filter((value) => value !== option.value))}
            >
              {option.label} ×
            </button>
          ))}
        </div>
      )}
      {open && (
        <div className="panel">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            onKeyDown={(event) => {
              if (event.key === "Backspace" && query.length === 0 && selectedValues.length > 0) {
                onChange(selectedValues.slice(0, selectedValues.length - 1));
              }
            }}
          />
          <div className="kv" style={{ maxHeight: 220, overflowY: "auto" }}>
            {filtered.map((option) => (
              <label className="meta" key={`${label}-${option.value}`}>
                <input
                  type="checkbox"
                  checked={selectedSet.has(option.value)}
                  onChange={() =>
                    onChange(
                      selectedSet.has(option.value)
                        ? selectedValues.filter((value) => value !== option.value)
                        : [...selectedValues, option.value],
                    )
                  }
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminConsole() {
  const { locale, t } = useI18n();
  const { ready, authenticated, roles, userName, authError, login, logout, getToken } = useKeycloakAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [taxonomy, setTaxonomy] = useState<TaxonomyResponse | null>(null);
  const [organizerOptions, setOrganizerOptions] = useState<OrganizerOption[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [loadingAdminContent, setLoadingAdminContent] = useState(false);
  const [adminOrganizers, setAdminOrganizers] = useState<AdminOrganizer[]>([]);

  const [status, setStatus] = useState<string>("");

  const [organizerName, setOrganizerName] = useState("");
  const [organizerWebsite, setOrganizerWebsite] = useState("");
  const [organizerLanguages, setOrganizerLanguages] = useState<string[]>(["en"]);
  const [organizerTags, setOrganizerTags] = useState("");
  const [organizerDescription, setOrganizerDescription] = useState("");
  const [organizerCity, setOrganizerCity] = useState("");
  const [organizerCountryCodes, setOrganizerCountryCodes] = useState<string[]>([]);
  const [organizerProfileRoleIds, setOrganizerProfileRoleIds] = useState<string[]>([]);
  const [organizerPracticeCategoryIds, setOrganizerPracticeCategoryIds] = useState<string[]>([]);
  const [organizerImageUrl, setOrganizerImageUrl] = useState("");
  const [organizerLocationLabel, setOrganizerLocationLabel] = useState("");
  const [organizerLocationAddress, setOrganizerLocationAddress] = useState("");
  const [organizerLocationLat, setOrganizerLocationLat] = useState("");
  const [organizerLocationLng, setOrganizerLocationLng] = useState("");
  const [organizerAvatarFile, setOrganizerAvatarFile] = useState<File | null>(null);
  const [organizerEditAvatarFile, setOrganizerEditAvatarFile] = useState<File | null>(null);

  const [eventTitle, setEventTitle] = useState("");
  const [attendanceMode, setAttendanceMode] = useState<"in_person" | "online" | "hybrid">("in_person");
  const [scheduleKind, setScheduleKind] = useState<"single" | "recurring">("single");
  const [eventTimezone, setEventTimezone] = useState("UTC");

  const [singleStartAt, setSingleStartAt] = useState("");
  const [singleEndAt, setSingleEndAt] = useState("");

  const [rrule, setRrule] = useState("FREQ=WEEKLY;INTERVAL=1");
  const [rruleStartLocal, setRruleStartLocal] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("90");

  const [eventLanguages, setEventLanguages] = useState("en");
  const [eventTags, setEventTags] = useState("");
  const [eventCoverFile, setEventCoverFile] = useState<File | null>(null);
  const [eventCoverUrl, setEventCoverUrl] = useState("");
  const [createLocationQuery, setCreateLocationQuery] = useState("");
  const [createLocationResults, setCreateLocationResults] = useState<GeocodeResult[]>([]);
  const [createLocationLoading, setCreateLocationLoading] = useState(false);
  const [selectedCreateLocationId, setSelectedCreateLocationId] = useState<string | null>(null);
  const [selectedCreateLocationLabel, setSelectedCreateLocationLabel] = useState("");

  const [practiceCategoryId, setPracticeCategoryId] = useState("");
  const [practiceSubcategoryId, setPracticeSubcategoryId] = useState("");
  const [eventFormatId, setEventFormatId] = useState("");
  const [selectedOrganizerId, setSelectedOrganizerId] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [eventOrganizerRoles, setEventOrganizerRoles] = useState<EventOrganizerRoleDraft[]>([]);

  const [createdEventId, setCreatedEventId] = useState<string | null>(null);
  const [practiceCreateLevel, setPracticeCreateLevel] = useState<"1" | "2">("1");
  const [practiceCreateParentId, setPracticeCreateParentId] = useState("");
  const [practiceCreateKey, setPracticeCreateKey] = useState("");
  const [practiceCreateKeyTouched, setPracticeCreateKeyTouched] = useState(false);
  const [practiceCreateLabel, setPracticeCreateLabel] = useState("");
  const [categoryLabelSingular, setCategoryLabelSingular] = useState("");
  const [categoryLabelPlural, setCategoryLabelPlural] = useState("");
  const [roleCreateKey, setRoleCreateKey] = useState("");
  const [roleCreateLabel, setRoleCreateLabel] = useState("");
  const [eventEditor, setEventEditor] = useState<EventEditorState | null>(null);
  const [organizerEditor, setOrganizerEditor] = useState<OrganizerEditorState | null>(null);
  const [adminLanguageOptions, setAdminLanguageOptions] = useState<string[]>([]);
  const [adminCountryOptions, setAdminCountryOptions] = useState<string[]>([]);
  const [loadingEventEditor, setLoadingEventEditor] = useState(false);
  const [loadingOrganizerEditor, setLoadingOrganizerEditor] = useState(false);
  const [editLocationQuery, setEditLocationQuery] = useState("");
  const [editLocationResults, setEditLocationResults] = useState<GeocodeResult[]>([]);
  const [editLocationLoading, setEditLocationLoading] = useState(false);
  const [showArchivedHosts, setShowArchivedHosts] = useState(false);
  const [showUnlistedEvents, setShowUnlistedEvents] = useState(false);
  const [activeSection, setActiveSection] = useState<AdminSection>("events");
  const loadedEditorTargetRef = useRef<string | null>(null);
  const AdminLocationPreviewMap = useMemo(
    () => dynamic(() => import("./AdminLocationPreviewMap").then((module) => module.AdminLocationPreviewMap), { ssr: false }),
    [],
  );

  const hasEditorRole = useMemo(
    () => roles.includes("editor") || roles.includes("admin"),
    [roles],
  );
  const hasAdminRole = useMemo(() => roles.includes("admin"), [roles]);
  const organizerNamesById = useMemo(
    () => new Map(organizerOptions.map((organizer) => [organizer.id, organizer.name])),
    [organizerOptions],
  );
  const roleLabelsById = useMemo(
    () => new Map((taxonomy?.organizerRoles ?? []).map((role) => [role.id, role.label])),
    [taxonomy],
  );
  const statusLabel = useMemo(
    () => (value: string) => t(`common.status.${value}`),
    [t],
  );
  const categorySingularLabel =
    taxonomy?.uiLabels.categorySingular ??
    taxonomy?.uiLabels.practiceCategory ??
    t("admin.field.category");
  const categoryPluralLabel =
    taxonomy?.uiLabels.categoryPlural ??
    taxonomy?.uiLabels.practiceCategory ??
    t("admin.field.categories");
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
  const allCountryOptions = useMemo<MultiSelectOption[]>(() => {
    const available = new Set<string>(adminCountryOptions);
    const intlWithSupportedValuesOf = Intl as unknown as {
      supportedValuesOf?: (key: string) => string[];
    };
    try {
      for (const code of intlWithSupportedValuesOf.supportedValuesOf?.("region") ?? []) {
        available.add(code.toLowerCase());
      }
    } catch {
      // Keep facet-derived options when full browser list is unavailable.
    }
    return Array.from(available)
      .sort((a, b) => {
        const labelA = regionNames?.of(a.toUpperCase()) ?? a.toUpperCase();
        const labelB = regionNames?.of(b.toUpperCase()) ?? b.toUpperCase();
        return labelA.localeCompare(labelB);
      })
      .map((code) => ({
        value: code,
        label: regionNames?.of(code.toUpperCase()) ?? code.toUpperCase(),
      }));
  }, [adminCountryOptions, regionNames]);
  const allLanguageOptions = useMemo<MultiSelectOption[]>(() => {
    const available = new Set<string>(adminLanguageOptions);
    const intlWithSupportedValuesOf = Intl as unknown as {
      supportedValuesOf?: (key: string) => string[];
    };
    try {
      for (const code of intlWithSupportedValuesOf.supportedValuesOf?.("language") ?? []) {
        available.add(code.toLowerCase());
      }
    } catch {
      // Keep facet-derived options when full browser list is unavailable.
    }
    return Array.from(available)
      .sort((a, b) => labelForLanguageCode(a, languageNames).localeCompare(labelForLanguageCode(b, languageNames)))
      .map((code) => ({
        value: code,
        label: labelForLanguageCode(code, languageNames),
      }));
  }, [adminLanguageOptions, languageNames]);

  useEffect(() => {
    const section = searchParams.get("section");
    if (
      section === "events" ||
      section === "organizers" ||
      section === "taxonomies" ||
      section === "users"
    ) {
      setActiveSection(section);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!authenticated || !hasEditorRole) {
      return;
    }

    const section = searchParams.get("section");
    const id = searchParams.get("id");
    if (!id || !section) {
      return;
    }

    const target = `${section}:${id}`;
    if (loadedEditorTargetRef.current === target) {
      return;
    }
    loadedEditorTargetRef.current = target;

    if (section === "events") {
      void loadEventForEdit(id);
    } else if (section === "organizers") {
      void loadOrganizerForEdit(id);
    }
  }, [authenticated, hasEditorRole, searchParams]);

  function selectSection(section: AdminSection) {
    setActiveSection(section);
    const params = new URLSearchParams(searchParams.toString());
    params.set("section", section);
    params.delete("id");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  async function loadMetadata() {
    setLoadingMeta(true);
    try {
      const [taxonomyResult, organizerResult, organizerFacetResult] = await Promise.all([
        fetchJson<TaxonomyResponse>("/meta/taxonomies"),
        fetchJson<{ items: OrganizerOption[] }>("/organizers/search?page=1&pageSize=50"),
        fetchJson<OrganizerFacetResponse>("/organizers/search?page=1&pageSize=1"),
      ]);

      setTaxonomy(taxonomyResult);
      setOrganizerOptions(organizerResult.items);
      setAdminLanguageOptions(
        Object.keys(organizerFacetResult.facets?.languages ?? {}).sort((a, b) => a.localeCompare(b)),
      );
      setAdminCountryOptions(
        Object.keys(organizerFacetResult.facets?.countryCode ?? {}).sort((a, b) => a.localeCompare(b)),
      );
      setCategoryLabelSingular(
        taxonomyResult.uiLabels.categorySingular ?? taxonomyResult.uiLabels.practiceCategory ?? "",
      );
      setCategoryLabelPlural(
        taxonomyResult.uiLabels.categoryPlural ?? taxonomyResult.uiLabels.practiceCategory ?? "",
      );

      setPracticeCategoryId((current) => current || taxonomyResult.practices.categories[0]?.id || "");
      setEventFormatId((current) => current || taxonomyResult.eventFormats?.[0]?.id || "");
      setSelectedRoleId((current) => current || taxonomyResult.organizerRoles[0]?.id || "");
      if (practiceCreateLevel === "2" && !practiceCreateParentId && taxonomyResult.practices.categories[0]) {
        setPracticeCreateParentId(taxonomyResult.practices.categories[0].id);
      }
    } catch (error) {
      setStatus(
        error instanceof Error
          ? t("admin.status.loadMetadataFailedWithReason", { message: error.message })
          : t("admin.status.loadMetadataFailed"),
      );
    } finally {
      setLoadingMeta(false);
    }
  }

  useEffect(() => {
    if (!authenticated) {
      return;
    }

    const run = async () => {
      await loadMetadata();
      await loadAdminContent();
    };

    void run();
  }, [authenticated, hasEditorRole, showArchivedHosts, showUnlistedEvents]);

  const selectedCategory = taxonomy?.practices.categories.find((category) => category.id === practiceCategoryId);
  const selectedEditCategory = taxonomy?.practices.categories.find(
    (category) => category.id === eventEditor?.practiceCategoryId,
  );

  async function authorizedRequest<T>(
    path: string,
    method: "POST" | "PATCH",
    body: Record<string, unknown>,
  ): Promise<T> {
    const token = await getToken();

    if (!token) {
      throw new Error(t("admin.error.noAuthToken"));
    }

    const response = await fetch(`${apiBase}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    return (await response.json()) as T;
  }

  async function authorizedGet<T>(path: string): Promise<T> {
    const token = await getToken();
    if (!token) {
      throw new Error(t("admin.error.noAuthToken"));
    }

    const response = await fetch(`${apiBase}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    return (await response.json()) as T;
  }

  async function authorizedUpload(
    kind: "eventCover" | "organizerAvatar",
    entityId: string,
    file: File,
  ): Promise<{ stored_path: string; url: string }> {
    const token = await getToken();
    if (!token) {
      throw new Error(t("admin.error.noAuthToken"));
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("kind", kind);
    formData.append("entityId", entityId);

    const response = await fetch(`${apiBase}/uploads`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Upload failed (${response.status}): ${text}`);
    }

    return (await response.json()) as { stored_path: string; url: string };
  }

  async function searchGeocode(query: string): Promise<GeocodeResult[]> {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      return [];
    }

    return fetchJson<GeocodeResult[]>(`/geocode/search?q=${encodeURIComponent(trimmed)}&limit=8`);
  }

  async function createLocationFromResult(result: GeocodeResult): Promise<LocationResponse> {
    return authorizedRequest<LocationResponse>("/admin/locations", "POST", {
      formattedAddress: result.formatted_address,
      countryCode: result.country_code ?? null,
      city: result.city ?? null,
      lat: result.lat,
      lng: result.lng,
    });
  }

  async function runCreateLocationSearch() {
    setCreateLocationLoading(true);
    try {
      const results = await searchGeocode(createLocationQuery);
      setCreateLocationResults(results);
      if (!results.length) {
        setStatus(t("admin.status.noGeocodeMatches"));
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("admin.status.locationSearchFailed"));
    } finally {
      setCreateLocationLoading(false);
    }
  }

  async function selectCreateLocation(result: GeocodeResult) {
    setStatus(t("admin.status.savingSelectedLocation"));
    try {
      const created = await createLocationFromResult(result);
      setSelectedCreateLocationId(created.id);
      setSelectedCreateLocationLabel(created.formatted_address);
      setCreateLocationResults([]);
      setCreateLocationQuery(created.formatted_address);
      setStatus(t("admin.status.locationAttachedDraft", { address: created.formatted_address }));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("admin.status.locationSaveFailed"));
    }
  }

  function clearCreateLocation() {
    setSelectedCreateLocationId(null);
    setSelectedCreateLocationLabel("");
    setCreateLocationResults([]);
    setCreateLocationQuery("");
  }

  async function runEditLocationSearch() {
    setEditLocationLoading(true);
    try {
      const results = await searchGeocode(editLocationQuery);
      setEditLocationResults(results);
      if (!results.length) {
        setStatus(t("admin.status.noGeocodeMatches"));
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("admin.status.locationSearchFailed"));
    } finally {
      setEditLocationLoading(false);
    }
  }

  async function selectEditLocation(result: GeocodeResult) {
    setStatus(t("admin.status.savingSelectedLocation"));
    try {
      const created = await createLocationFromResult(result);
      setEventEditor((current) =>
        current
          ? {
              ...current,
              locationId: created.id,
              locationLabel: created.formatted_address,
            }
          : current,
      );
      setEditLocationResults([]);
      setEditLocationQuery(created.formatted_address);
      setStatus(t("admin.status.locationAttachedEvent", { address: created.formatted_address }));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("admin.status.locationSaveFailed"));
    }
  }

  function clearEditLocation() {
    setEventEditor((current) =>
      current
        ? {
            ...current,
            locationId: null,
            locationLabel: "",
          }
        : current,
    );
    setEditLocationResults([]);
    setEditLocationQuery("");
  }

  async function loadAdminContent() {
    if (!hasEditorRole) {
      setAdminOrganizers([]);
      return;
    }

    setLoadingAdminContent(true);
    try {
      const organizersResult = await authorizedGet<{ items: AdminOrganizer[] }>(
        `/admin/organizers?page=1&pageSize=20${showArchivedHosts ? "&showArchived=true" : ""}`,
      );
      setAdminOrganizers(organizersResult.items);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("admin.status.loadAdminListsFailed"));
    } finally {
      setLoadingAdminContent(false);
    }
  }

  async function createOrganizerSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus(t("admin.status.creatingOrganizer"));

    try {
      const nextDescription = organizerDescription.trim();
      const plainText = nextDescription;
      const html = nextDescription ? `<p>${escapeHtml(nextDescription).replace(/\n/g, "<br>")}</p>` : "";
      const organizer = await authorizedRequest<{ id: string; slug: string; name: string }>(
        "/organizers",
        "POST",
        {
          name: organizerName,
          descriptionJson: {
            ...(plainText ? { text: plainText } : {}),
            ...(html ? { html } : {}),
          },
          descriptionHtml: html || null,
          websiteUrl: organizerWebsite || null,
          tags: csvToArray(organizerTags),
          languages: organizerLanguages,
          imageUrl: organizerImageUrl.trim() || null,
          city: organizerCity.trim() || null,
          countryCode: organizerCountryCodes[0]?.trim() || null,
          primaryLocation: {
            label: organizerLocationLabel.trim() || null,
            formattedAddress: organizerLocationAddress.trim() || null,
            city: organizerCity.trim() || null,
            countryCode: organizerCountryCodes[0]?.trim() || null,
            lat: organizerLocationLat.trim() ? Number(organizerLocationLat.trim()) : null,
            lng: organizerLocationLng.trim() ? Number(organizerLocationLng.trim()) : null,
          },
          profileRoleIds: organizerProfileRoleIds,
          practiceCategoryIds: organizerPracticeCategoryIds,
          status: "published",
        },
      );

      if (organizerAvatarFile) {
        const uploaded = await authorizedUpload("organizerAvatar", organizer.id, organizerAvatarFile);
        await authorizedRequest(`/organizers/${organizer.id}`, "PATCH", {
          avatarPath: uploaded.stored_path,
        });
      }

      setOrganizerOptions((prev) => [organizer, ...prev]);
      setSelectedOrganizerId(organizer.id);
      setStatus(t("admin.status.organizerCreated", { name: organizer.name, slug: organizer.slug }));
      setOrganizerName("");
      setOrganizerWebsite("");
      setOrganizerTags("");
      setOrganizerDescription("");
      setOrganizerCity("");
      setOrganizerCountryCodes([]);
      setOrganizerLanguages(["en"]);
      setOrganizerProfileRoleIds([]);
      setOrganizerPracticeCategoryIds([]);
      setOrganizerImageUrl("");
      setOrganizerLocationLabel("");
      setOrganizerLocationAddress("");
      setOrganizerLocationLat("");
      setOrganizerLocationLng("");
      setOrganizerAvatarFile(null);
      await loadAdminContent();
      router.push(`/hosts/${organizer.slug}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("admin.status.organizerCreateFailed"));
    }
  }

  async function createEventSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus(t("admin.status.creatingEventDraft"));

    try {
      const payload: Record<string, unknown> = {
        title: eventTitle,
        descriptionJson: { time: Date.now(), blocks: [] },
        attendanceMode,
        practiceCategoryId,
        practiceSubcategoryId: practiceSubcategoryId || null,
        eventFormatId: eventFormatId || null,
        tags: csvToArray(eventTags),
        languages: csvToArray(eventLanguages),
        coverImageUrl: eventCoverUrl.trim() || null,
        scheduleKind,
        eventTimezone,
        visibility: "public",
        organizerRoles: eventOrganizerRoles,
        locationId: selectedCreateLocationId,
      };

      if (scheduleKind === "single") {
        payload.singleStartAt = datetimeLocalToIso(singleStartAt);
        payload.singleEndAt = datetimeLocalToIso(singleEndAt);
      } else {
        payload.rrule = rrule;
        payload.rruleDtstartLocal = datetimeLocalToIso(rruleStartLocal);
        payload.durationMinutes = Number(durationMinutes || 90);
      }

      const created = await authorizedRequest<{ id: string; slug: string; title: string }>(
        "/events",
        "POST",
        payload,
      );

      if (eventCoverFile) {
        const uploaded = await authorizedUpload("eventCover", created.id, eventCoverFile);
        await authorizedRequest(`/events/${created.id}`, "PATCH", {
          coverImagePath: uploaded.stored_path,
        });
      }

      setCreatedEventId(created.id);
      setStatus(t("admin.status.eventDraftCreated", { title: created.title, slug: created.slug }));
      setEventTitle("");
      setEventTags("");
      setEventCoverUrl("");
      setEventCoverFile(null);
      setEventOrganizerRoles([]);
      clearCreateLocation();
      await loadAdminContent();
      router.push(`/events/${created.slug}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("admin.status.eventCreateFailed"));
    }
  }

  function addOrganizerRoleToDraft() {
    if (!selectedOrganizerId || !selectedRoleId) {
      setStatus(t("admin.status.selectOrganizerRoleFirst"));
      return;
    }

    setEventOrganizerRoles((previous) => {
      const exists = previous.some(
        (item) =>
          item.organizerId === selectedOrganizerId &&
          item.roleId === selectedRoleId,
      );

      if (exists) {
        setStatus(t("admin.status.organizerRoleDuplicate"));
        return previous;
      }

      return [
        ...previous,
        {
          organizerId: selectedOrganizerId,
          roleId: selectedRoleId,
          displayOrder: previous.length,
        },
      ];
    });
  }

  function removeOrganizerRoleFromDraft(index: number) {
    setEventOrganizerRoles((previous) =>
      previous
        .filter((_, itemIndex) => itemIndex !== index)
        .map((item, itemIndex) => ({ ...item, displayOrder: itemIndex })),
    );
  }

  async function runEventLifecycleAction(
    eventId: string,
    action: "publish" | "unpublish" | "cancel",
  ) {
    setStatus(t("admin.status.eventLifecycleProgress", { action: t(`common.action.${action}`) }));

    try {
      await authorizedRequest(`/events/${eventId}/${action}`, "POST", {});
      setStatus(t("admin.status.eventLifecycleComplete", { action: t(`common.action.${action}`), id: eventId }));
      await loadAdminContent();
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : t("admin.status.eventLifecycleFailed", { action: t(`common.action.${action}`) }),
      );
    }
  }

  async function updateOrganizerStatus(
    organizerId: string,
    nextStatus: "draft" | "published" | "archived",
  ) {
    setStatus(t("admin.status.organizerStatusUpdating", { status: statusLabel(nextStatus) }));

    try {
      await authorizedRequest(`/organizers/${organizerId}`, "PATCH", {
        status: nextStatus,
      });
      await Promise.all([loadAdminContent(), loadMetadata()]);
      setStatus(
        t("admin.status.organizerStatusUpdated", { id: organizerId, status: statusLabel(nextStatus) }),
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("admin.status.organizerStatusUpdateFailed"));
    }
  }

  async function loadEventForEdit(eventId: string) {
    setLoadingEventEditor(true);
    setStatus(t("admin.status.loadingEventEditor"));

    try {
      const detail = await authorizedGet<AdminEventDetailResponse>(`/admin/events/${eventId}`);
      setEventEditor({
        id: detail.id,
        slug: detail.slug,
        title: detail.title,
        descriptionHtml: ensureHtml(typeof detail.description_json?.html === "string" ? detail.description_json.html : ""),
        attendanceMode: detail.attendance_mode,
        onlineUrl: detail.online_url ?? "",
        practiceCategoryId: detail.practice_category_id,
        practiceSubcategoryId: detail.practice_subcategory_id ?? "",
        eventFormatId: detail.event_format_id ?? "",
        tags: detail.tags.join(", "),
        languages: detail.languages.join(", "),
        scheduleKind: detail.schedule_kind,
        eventTimezone: detail.event_timezone,
        singleStartAt: isoToDatetimeLocal(detail.single_start_at),
        singleEndAt: isoToDatetimeLocal(detail.single_end_at),
        rrule: detail.rrule ?? "",
        rruleDtstartLocal: isoToDatetimeLocal(detail.rrule_dtstart_local),
        durationMinutes: detail.duration_minutes ? String(detail.duration_minutes) : "",
        visibility: detail.visibility,
        coverImageUrl: detail.cover_image_path ?? "",
        locationId: detail.location_id,
        locationLabel: detail.location?.formatted_address ?? "",
      });
      setEditLocationQuery(detail.location?.formatted_address ?? "");
      setEditLocationResults([]);
      setStatus(t("admin.status.eventLoadedForEdit", { title: detail.title, slug: detail.slug }));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("admin.status.eventEditorLoadFailed"));
    } finally {
      setLoadingEventEditor(false);
    }
  }

  async function saveEventEdits(event: React.FormEvent) {
    event.preventDefault();
    if (!eventEditor) {
      return;
    }

    setStatus(t("admin.status.savingEventChanges"));

    try {
      const payload: Record<string, unknown> = {
        title: eventEditor.title,
        descriptionJson: { html: eventEditor.descriptionHtml || "" },
        attendanceMode: eventEditor.attendanceMode,
        onlineUrl: eventEditor.onlineUrl || null,
        practiceCategoryId: eventEditor.practiceCategoryId,
        practiceSubcategoryId: eventEditor.practiceSubcategoryId || null,
        eventFormatId: eventEditor.eventFormatId || null,
        tags: csvToArray(eventEditor.tags),
        languages: csvToArray(eventEditor.languages),
        scheduleKind: eventEditor.scheduleKind,
        eventTimezone: eventEditor.eventTimezone,
        visibility: eventEditor.visibility,
        coverImageUrl: eventEditor.coverImageUrl || null,
        locationId: eventEditor.locationId,
      };

      if (eventEditor.scheduleKind === "single") {
        payload.singleStartAt = datetimeLocalToIso(eventEditor.singleStartAt);
        payload.singleEndAt = datetimeLocalToIso(eventEditor.singleEndAt);
        payload.rrule = null;
        payload.rruleDtstartLocal = null;
        payload.durationMinutes = null;
      } else {
        payload.singleStartAt = null;
        payload.singleEndAt = null;
        payload.rrule = eventEditor.rrule || null;
        payload.rruleDtstartLocal = datetimeLocalToIso(eventEditor.rruleDtstartLocal);
        payload.durationMinutes = eventEditor.durationMinutes
          ? Number(eventEditor.durationMinutes)
          : null;
      }

      const updated = await authorizedRequest<{ id: string; slug: string }>(`/events/${eventEditor.id}`, "PATCH", payload);
      if (eventCoverFile) {
        const uploaded = await authorizedUpload("eventCover", eventEditor.id, eventCoverFile);
        await authorizedRequest(`/events/${eventEditor.id}`, "PATCH", {
          coverImagePath: uploaded.stored_path,
        });
      }
      await loadAdminContent();
      setStatus(t("admin.status.eventUpdated", { id: eventEditor.id }));
      setEventCoverFile(null);
      router.push(`/events/${updated.slug ?? eventEditor.slug}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("admin.status.eventSaveFailed"));
    }
  }

  async function loadOrganizerForEdit(organizerId: string) {
    setLoadingOrganizerEditor(true);

    try {
      const detail = await authorizedGet<AdminOrganizerDetailResponse>(`/admin/organizers/${organizerId}`);
      const mergedProfileRoleIds = Array.from(new Set([
        ...(detail.profile_role_ids ?? []),
        ...(detail.derived_role_ids ?? []),
      ]));
      const mergedPracticeCategoryIds = Array.from(new Set([
        ...(detail.practice_category_ids ?? []),
        ...(detail.derived_practice_category_ids ?? []),
      ]));
      const mergedDescriptionHtml =
        (detail.description_html && detail.description_html.trim())
          ? ensureHtml(detail.description_html)
          : mergeLegacyOrganizerDescription(detail.description_json ?? {});
      const mappedLocations = (detail.locations ?? []).map((location, index) => ({
        id: location.id,
        isPrimary: Boolean(location.is_primary) || index === 0,
        label: location.label ?? "",
        formattedAddress: location.formatted_address ?? "",
        city: location.city ?? "",
        countryCode: location.country_code ?? "",
        lat: location.lat != null ? String(location.lat) : "",
        lng: location.lng != null ? String(location.lng) : "",
        provider: location.provider ?? "",
        placeId: location.place_id ?? "",
      }));
      setOrganizerEditor({
        id: detail.id,
        slug: detail.slug,
        name: detail.name,
        descriptionRaw: detail.description_json ?? {},
        descriptionHtml: mergedDescriptionHtml,
        websiteUrl: detail.website_url ?? "",
        externalUrl: detail.external_url ?? "",
        imageUrl: detail.image_url ?? "",
        tags: detail.tags.join(", "),
        languages: detail.languages,
        city: detail.city ?? "",
        countryCodes: detail.country_code ? [detail.country_code] : [],
        locations: mappedLocations,
        profileRoleIds: mergedProfileRoleIds,
        practiceCategoryIds: mergedPracticeCategoryIds,
        status: detail.status,
      });
      setOrganizerEditAvatarFile(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("admin.status.organizerEditorLoadFailed"));
    } finally {
      setLoadingOrganizerEditor(false);
    }
  }

  async function saveOrganizerEdits(event: React.FormEvent) {
    event.preventDefault();
    if (!organizerEditor) {
      return;
    }

    setStatus(t("admin.status.savingOrganizerChanges"));

    try {
      const html = organizerEditor.descriptionHtml.trim();
      const plainText = html
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n\n")
        .replace(/<[^>]*>/g, " ")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      const parsedDescription: Record<string, unknown> = {
        ...organizerEditor.descriptionRaw,
      };
      delete parsedDescription.bio;
      delete parsedDescription.info;
      delete parsedDescription.description;
      if (plainText) parsedDescription.text = plainText; else delete parsedDescription.text;
      if (html) parsedDescription.html = html; else delete parsedDescription.html;

      const normalizedLocations = organizerEditor.locations
        .map((location) => ({
          id: location.id || undefined,
          isPrimary: location.isPrimary,
          label: location.label.trim() || null,
          formattedAddress: location.formattedAddress.trim() || null,
          city: location.city.trim() || null,
          countryCode: location.countryCode.trim().toLowerCase() || null,
          lat: location.lat.trim() ? Number(location.lat.trim()) : null,
          lng: location.lng.trim() ? Number(location.lng.trim()) : null,
          provider: location.provider.trim() || null,
          placeId: location.placeId.trim() || null,
        }))
        .filter((location) => Boolean(
          location.label || location.formattedAddress || location.city || location.countryCode || location.lat !== null,
        ));
      const primaryLocation = normalizedLocations.find((location) => location.isPrimary)
        ?? normalizedLocations[0]
        ?? null;

      const updated = await authorizedRequest<{ id: string; slug: string }>(`/organizers/${organizerEditor.id}`, "PATCH", {
        name: organizerEditor.name,
        descriptionJson: parsedDescription,
        descriptionHtml: html || null,
        websiteUrl: organizerEditor.websiteUrl || null,
        externalUrl: organizerEditor.externalUrl || null,
        imageUrl: organizerEditor.imageUrl || null,
        tags: csvToArray(organizerEditor.tags),
        languages: organizerEditor.languages,
        city: organizerEditor.city || null,
        countryCode: organizerEditor.countryCodes[0] || null,
        locations: normalizedLocations,
        primaryLocationId: primaryLocation?.id ?? null,
        profileRoleIds: organizerEditor.profileRoleIds,
        practiceCategoryIds: organizerEditor.practiceCategoryIds,
        status: organizerEditor.status,
      });
      if (organizerEditAvatarFile) {
        const uploaded = await authorizedUpload("organizerAvatar", organizerEditor.id, organizerEditAvatarFile);
        await authorizedRequest(`/organizers/${organizerEditor.id}`, "PATCH", {
          avatarPath: uploaded.stored_path,
          imageUrl: uploaded.stored_path,
        });
      }
      await Promise.all([loadAdminContent(), loadMetadata()]);
      setStatus(t("admin.status.organizerUpdated", { id: organizerEditor.id }));
      setOrganizerEditAvatarFile(null);
      router.push(`/hosts/${updated.slug ?? organizerEditor.slug}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("admin.status.organizerSaveFailed"));
    }
  }

  async function geocodeOrganizerLocation(locationIndex: number) {
    if (!organizerEditor) {
      return;
    }
    const target = organizerEditor.locations[locationIndex];
    const query = (target.formattedAddress || `${target.city} ${target.countryCode}`).trim();
    if (!query) {
      setStatus("Enter address or city/country before geocoding.");
      return;
    }
    try {
      const results = await authorizedGet<GeocodeResult[]>(
        `/admin/geocode/search?q=${encodeURIComponent(query)}&limit=1`,
      );
      const first = results[0];
      if (!first) {
        setStatus("No geocode result found for this location.");
        return;
      }
      setOrganizerEditor((current) => (
        current
          ? {
              ...current,
              locations: current.locations.map((item, idx) => (
                idx === locationIndex
                  ? {
                      ...item,
                      formattedAddress: first.formatted_address,
                      city: first.city ?? item.city,
                      countryCode: first.country_code ?? item.countryCode,
                      lat: String(first.lat),
                      lng: String(first.lng),
                      provider: "nominatim",
                    }
                  : item
              )),
            }
          : current
      ));
      setStatus("Location verified and coordinates updated.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Location geocoding failed");
    }
  }

  async function createPracticeSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus(t("admin.status.creatingPracticeItem"));

    try {
      const level = Number(practiceCreateLevel) as 1 | 2;
      await authorizedRequest("/admin/practices", "POST", {
        parentId: level === 2 ? practiceCreateParentId || null : null,
        level,
        key: practiceCreateKey || undefined,
        label: practiceCreateLabel,
        sortOrder: 0,
        isActive: true,
      });

      setPracticeCreateKey("");
      setPracticeCreateKeyTouched(false);
      setPracticeCreateLabel("");
      await loadMetadata();
      await loadAdminContent();
      setStatus(t("admin.status.practiceItemCreated"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("admin.status.practiceCreateFailed"));
    }
  }

  async function saveCategoryLabelsSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus(t("admin.status.savingCategoryLabels"));

    try {
      const saved = await authorizedRequest<{
        uiLabels: {
          categorySingular: string;
          categoryPlural: string;
          practiceCategory: string;
        };
      }>("/admin/ui-labels", "PATCH", {
        categorySingular: categoryLabelSingular,
        categoryPlural: categoryLabelPlural,
      });

      setTaxonomy((current) =>
        current
          ? {
              ...current,
              uiLabels: {
                ...current.uiLabels,
                categorySingular: saved.uiLabels.categorySingular,
                categoryPlural: saved.uiLabels.categoryPlural,
                practiceCategory: saved.uiLabels.practiceCategory,
              },
            }
          : current,
      );
      setStatus(t("admin.status.categoryLabelsSaved"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("admin.status.categoryLabelsSaveFailed"));
    }
  }

  async function createRoleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus(t("admin.status.creatingOrganizerRole"));

    try {
      await authorizedRequest("/admin/organizer-roles", "POST", {
        key: roleCreateKey,
        label: roleCreateLabel,
        sortOrder: 0,
        isActive: true,
      });

      setRoleCreateKey("");
      setRoleCreateLabel("");
      await loadMetadata();
      await loadAdminContent();
      setStatus(t("admin.status.organizerRoleCreated"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("admin.status.organizerRoleCreateFailed"));
    }
  }

  if (!ready) {
    return <section className="panel">{t("admin.auth.initializing")}</section>;
  }

  if (!authenticated) {
    return (
      <section className="panel cards">
        <h1 className="title-xl">{t("admin.auth.title")}</h1>
        <p className="muted">{t("admin.auth.prompt")}</p>
        {authError && <p className="muted">{authError}</p>}
        <button className="primary-btn" type="button" onClick={() => void login()}>
          {t("admin.auth.login")}
        </button>
      </section>
    );
  }

  return (
    <section className="panel cards">
      <div className="admin-header">
        <div>
          <h1 className="title-xl">{t("admin.console.title")}</h1>
          <div className="meta">{t("admin.console.user", { user: userName ?? t("common.unknown") })}</div>
          <div className="meta">{t("admin.console.roles", { roles: roles.join(", ") || t("common.none") })}</div>
        </div>
        <button className="ghost-btn" type="button" onClick={() => void logout()}>
          {t("admin.console.logout")}
        </button>
      </div>

      {!hasEditorRole && (
        <div className="admin-warning">
          {t("admin.warning.noEditorRole")}
        </div>
      )}
      {!hasAdminRole && (
        <div className="admin-warning">
          {t("admin.warning.adminRoleRequired")}
        </div>
      )}

      {loadingMeta && <div className="meta">{t("admin.loading.taxonomyMetadata")}</div>}

      <div className="admin-shell">
        <aside className="panel filters">
          <h3>{t("admin.sections.title")}</h3>
          <div className="kv">
            <button
              type="button"
              className={activeSection === "events" ? "secondary-btn" : "ghost-btn"}
              onClick={() => selectSection("events")}
            >
              {t("admin.sections.events")}
            </button>
            <button
              type="button"
              className={activeSection === "organizers" ? "secondary-btn" : "ghost-btn"}
              onClick={() => selectSection("organizers")}
            >
              {t("admin.sections.organizers")}
            </button>
            <button
              type="button"
              className={activeSection === "taxonomies" ? "secondary-btn" : "ghost-btn"}
              onClick={() => selectSection("taxonomies")}
            >
              {t("admin.sections.taxonomies")}
            </button>
            <button
              type="button"
              className={activeSection === "users" ? "secondary-btn" : "ghost-btn"}
              onClick={() => selectSection("users")}
            >
              {t("admin.sections.users")}
            </button>
            {activeSection === "organizers" && (
              <label className="meta">
                <input
                  type="checkbox"
                  checked={showArchivedHosts}
                  onChange={(event) => setShowArchivedHosts(event.target.checked)}
                />
                Show archived hosts
              </label>
            )}
            {activeSection === "events" && (
              <label className="meta">
                <input
                  type="checkbox"
                  checked={showUnlistedEvents}
                  onChange={(event) => setShowUnlistedEvents(event.target.checked)}
                />
                Show unlisted events
              </label>
            )}
          </div>
        </aside>

        <div className="cards">
      <div className="admin-grid">
        <form
          className="admin-form"
          onSubmit={createOrganizerSubmit}
          style={{ display: activeSection === "organizers" && !organizerEditor ? undefined : "none" }}
        >
          <h3>{t("admin.createOrganizer.heading")}</h3>
          <label>
            {t("common.field.name")}
            <input
              required
              value={organizerName}
              onChange={(e) => setOrganizerName(e.target.value)}
              placeholder={t("admin.placeholder.organizerName")}
            />
          </label>
          <label>
            {t("common.field.websiteUrl")}
            <input
              value={organizerWebsite}
              onChange={(e) => setOrganizerWebsite(e.target.value)}
              placeholder={t("admin.placeholder.websiteUrl")}
            />
          </label>
          <label>
            Description
            <textarea
              rows={4}
              value={organizerDescription}
              onChange={(e) => setOrganizerDescription(e.target.value)}
              placeholder="Host description"
            />
          </label>
          <label>
            {t("common.field.city")}
            <input value={organizerCity} onChange={(e) => setOrganizerCity(e.target.value)} />
          </label>
          <SearchableMultiSelectDropdown
            label={t("common.field.countryCode")}
            options={allCountryOptions}
            selectedValues={organizerCountryCodes}
            onChange={setOrganizerCountryCodes}
            placeholder={t("eventSearch.search")}
          />
          <SearchableMultiSelectDropdown
            label={t("common.field.languagesCsv")}
            options={allLanguageOptions}
            selectedValues={organizerLanguages}
            onChange={setOrganizerLanguages}
            placeholder={t("eventSearch.search")}
          />
          <label>
            Host location label
            <input value={organizerLocationLabel} onChange={(e) => setOrganizerLocationLabel(e.target.value)} />
          </label>
          <label>
            Host location address
            <input value={organizerLocationAddress} onChange={(e) => setOrganizerLocationAddress(e.target.value)} />
          </label>
          <div className="admin-inline-list">
            <label>
              Lat
              <input value={organizerLocationLat} onChange={(e) => setOrganizerLocationLat(e.target.value)} />
            </label>
            <label>
              Lng
              <input value={organizerLocationLng} onChange={(e) => setOrganizerLocationLng(e.target.value)} />
            </label>
          </div>
          <label>
            {t("common.field.tagsCsv")}
            <input value={organizerTags} onChange={(e) => setOrganizerTags(e.target.value)} />
          </label>
          <label>
            Image URL
            <input value={organizerImageUrl} onChange={(e) => setOrganizerImageUrl(e.target.value)} />
          </label>
          <label>
            {t("organizerSearch.hostType")}
            <div className="kv">
              {taxonomy?.organizerRoles.map((role) => (
                <label key={`create-role-${role.id}`} className="meta">
                  <input
                    type="checkbox"
                    checked={organizerProfileRoleIds.includes(role.id)}
                    onChange={() =>
                      setOrganizerProfileRoleIds((current) => (
                        current.includes(role.id)
                          ? current.filter((item) => item !== role.id)
                          : [...current, role.id]
                      ))
                    }
                  />
                  {role.label}
                </label>
              ))}
            </div>
          </label>
          <label>
            {categorySingularLabel}
            <div className="kv">
              {taxonomy?.practices.categories.map((category) => (
                <label key={`create-practice-${category.id}`} className="meta">
                  <input
                    type="checkbox"
                    checked={organizerPracticeCategoryIds.includes(category.id)}
                    onChange={() =>
                      setOrganizerPracticeCategoryIds((current) => (
                        current.includes(category.id)
                          ? current.filter((item) => item !== category.id)
                          : [...current, category.id]
                      ))
                    }
                  />
                  {category.label}
                </label>
              ))}
            </div>
          </label>
          <label>
            {t("admin.field.avatarImage")}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setOrganizerAvatarFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <button className="primary-btn" type="submit" disabled={!hasEditorRole}>
            {t("admin.createOrganizer.submit")}
          </button>
        </form>

        <form
          className="admin-form"
          onSubmit={createEventSubmit}
          style={{ display: activeSection === "events" && !eventEditor ? undefined : "none" }}
        >
          <h3>{t("admin.createEvent.heading")}</h3>
          <label>
            {t("common.field.title")}
            <input required value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} />
          </label>

          <label>
            {t("common.field.attendanceMode")}
            <select
              value={attendanceMode}
              onChange={(e) => setAttendanceMode(e.target.value as "in_person" | "online" | "hybrid")}
            >
              <option value="in_person">{t("attendanceMode.in_person")}</option>
              <option value="online">{t("attendanceMode.online")}</option>
              <option value="hybrid">{t("attendanceMode.hybrid")}</option>
            </select>
          </label>

          <label>
            {categorySingularLabel}
            <select
              required
              value={practiceCategoryId}
              onChange={(e) => {
                setPracticeCategoryId(e.target.value);
                setPracticeSubcategoryId("");
              }}
            >
              <option value="">{t("common.option.selectCategory")}</option>
              {taxonomy?.practices.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            {t("admin.field.subcategoryOptional")}
            <select value={practiceSubcategoryId} onChange={(e) => setPracticeSubcategoryId(e.target.value)}>
              <option value="">{t("common.none")}</option>
              {selectedCategory?.subcategories.map((subcategory) => (
                <option key={subcategory.id} value={subcategory.id}>
                  {subcategory.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Event format
            <select value={eventFormatId} onChange={(e) => setEventFormatId(e.target.value)}>
              <option value="">{t("common.none")}</option>
              {taxonomy?.eventFormats?.map((format) => (
                <option key={format.id} value={format.id}>
                  {format.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            {t("common.field.scheduleKind")}
            <select
              value={scheduleKind}
              onChange={(e) => setScheduleKind(e.target.value as "single" | "recurring")}
            >
              <option value="single">{t("common.scheduleKind.single")}</option>
              <option value="recurring">{t("common.scheduleKind.recurring")}</option>
            </select>
          </label>

          <label>
            {t("admin.field.eventTimezone")}
            <input value={eventTimezone} onChange={(e) => setEventTimezone(e.target.value)} />
          </label>

          {scheduleKind === "single" ? (
            <>
              <label>
                {t("common.field.start")}
                <input
                  required
                  type="datetime-local"
                  value={singleStartAt}
                  onChange={(e) => setSingleStartAt(e.target.value)}
                />
              </label>
              <label>
                {t("common.field.end")}
                <input
                  required
                  type="datetime-local"
                  value={singleEndAt}
                  onChange={(e) => setSingleEndAt(e.target.value)}
                />
              </label>
            </>
          ) : (
            <>
              <label>
                {t("admin.field.rrule")}
                <input value={rrule} onChange={(e) => setRrule(e.target.value)} placeholder="FREQ=WEEKLY;INTERVAL=1" />
              </label>
              <label>
                {t("admin.field.recurringStart")}
                <input
                  required
                  type="datetime-local"
                  value={rruleStartLocal}
                  onChange={(e) => setRruleStartLocal(e.target.value)}
                />
              </label>
              <label>
                {t("admin.field.durationMinutes")}
                <input
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  placeholder={t("admin.placeholder.durationMinutes")}
                />
              </label>
            </>
          )}

          <label>
            {t("admin.field.eventLocationSearch")}
            <input
              value={createLocationQuery}
              onChange={(e) => setCreateLocationQuery(e.target.value)}
              placeholder={t("admin.placeholder.locationSearch")}
            />
          </label>
          <div className="admin-card-actions">
            <button
              className="secondary-btn"
              type="button"
              disabled={createLocationLoading || createLocationQuery.trim().length < 2}
              onClick={() => void runCreateLocationSearch()}
            >
              {t("admin.button.searchLocation")}
            </button>
            {selectedCreateLocationId && (
              <button
                className="ghost-btn"
                type="button"
                onClick={clearCreateLocation}
              >
                {t("admin.button.clearLocation")}
              </button>
            )}
          </div>
          {createLocationLoading && <div className="meta">{t("admin.loading.geocodeSearch")}</div>}
          {selectedCreateLocationId && (
            <div className="meta">{t("admin.label.selectedLocation", { address: selectedCreateLocationLabel })}</div>
          )}
          {createLocationResults.length > 0 && (
            <div className="admin-inline-list">
              {createLocationResults.map((result, index) => (
                <div className="admin-inline-list-item" key={`${result.formatted_address}-${index}`}>
                  <span>{result.formatted_address}</span>
                  <button
                    className="secondary-btn"
                    type="button"
                    onClick={() => void selectCreateLocation(result)}
                  >
                    {t("common.use")}
                  </button>
                </div>
              ))}
            </div>
          )}

          <label>
            {t("common.field.languagesCsv")}
            <input value={eventLanguages} onChange={(e) => setEventLanguages(e.target.value)} />
          </label>
          <label>
            {t("common.field.tagsCsv")}
            <input value={eventTags} onChange={(e) => setEventTags(e.target.value)} />
          </label>
          <label>
            {t("admin.field.coverImage")}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setEventCoverFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <label>
            Cover image URL
            <input value={eventCoverUrl} onChange={(e) => setEventCoverUrl(e.target.value)} />
          </label>

          <label>
            {t("admin.field.linkOrganizerOptional")}
            <select value={selectedOrganizerId} onChange={(e) => setSelectedOrganizerId(e.target.value)}>
              <option value="">{t("common.none")}</option>
              {organizerOptions.map((organizer) => (
                <option key={organizer.id} value={organizer.id}>
                  {organizer.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            {t("admin.field.organizerRole")}
            <select value={selectedRoleId} onChange={(e) => setSelectedRoleId(e.target.value)}>
              <option value="">{t("common.none")}</option>
              {taxonomy?.organizerRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.label}
                </option>
              ))}
            </select>
          </label>

          <button
            className="secondary-btn"
            type="button"
            disabled={!hasEditorRole || !selectedOrganizerId || !selectedRoleId}
            onClick={addOrganizerRoleToDraft}
          >
            {t("admin.button.addOrganizerRole")}
          </button>

          {eventOrganizerRoles.length > 0 && (
            <div className="admin-inline-list">
              {eventOrganizerRoles.map((item, index) => (
                <div className="admin-inline-list-item" key={`${item.organizerId}-${item.roleId}-${index}`}>
                  <span>
                    #{index + 1} {organizerNamesById.get(item.organizerId) ?? item.organizerId} ·{" "}
                    {roleLabelsById.get(item.roleId) ?? item.roleId}
                  </span>
                  <button
                    className="ghost-btn"
                    type="button"
                    onClick={() => removeOrganizerRoleFromDraft(index)}
                  >
                    {t("common.remove")}
                  </button>
                </div>
              ))}
            </div>
          )}

          <button className="primary-btn" type="submit" disabled={!hasEditorRole}>
            {t("admin.createEvent.submit")}
          </button>

          <button
            className="secondary-btn"
            type="button"
            disabled={!hasEditorRole || !createdEventId}
            onClick={() => createdEventId && void runEventLifecycleAction(createdEventId, "publish")}
          >
            {t("admin.button.publishLastCreated")}
          </button>
        </form>

        <form className="admin-form" onSubmit={createPracticeSubmit} style={{ display: activeSection === "taxonomies" ? undefined : "none" }}>
          <h3>{t("admin.createPractice.heading")}</h3>
          <label>
            {t("admin.field.level")}
            <select
              value={practiceCreateLevel}
              onChange={(e) => setPracticeCreateLevel(e.target.value as "1" | "2")}
            >
              <option value="1">{t("common.category")}</option>
              <option value="2">{t("common.subcategory")}</option>
            </select>
          </label>

          {practiceCreateLevel === "2" && (
            <label>
              {t("admin.field.parentCategory")}
              <select
                value={practiceCreateParentId}
                onChange={(e) => setPracticeCreateParentId(e.target.value)}
              >
                <option value="">{t("admin.option.selectParentCategory")}</option>
                {taxonomy?.practices.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label>
            {t("admin.field.keyOptional")}
            <input
              value={practiceCreateKey}
              onChange={(e) => {
                setPracticeCreateKey(e.target.value);
                setPracticeCreateKeyTouched(true);
              }}
              placeholder={t("admin.placeholder.practiceKey")}
            />
          </label>
          <label>
            {t("common.field.label")}
            <input
              required
              value={practiceCreateLabel}
              onChange={(e) => {
                const nextLabel = e.target.value;
                setPracticeCreateLabel(nextLabel);
                if (!practiceCreateKeyTouched) {
                  setPracticeCreateKey(deriveTaxonomyKey(nextLabel));
                }
              }}
              placeholder={t("admin.placeholder.practiceLabel")}
            />
          </label>
          <button
            className="ghost-btn"
            type="button"
            onClick={() => {
              setPracticeCreateKey(deriveTaxonomyKey(practiceCreateLabel));
              setPracticeCreateKeyTouched(false);
            }}
          >
            {t("admin.button.generateKey")}
          </button>
          <button className="primary-btn" type="submit" disabled={!hasAdminRole}>
            {t("admin.createPractice.submit")}
          </button>
        </form>

        <form className="admin-form" onSubmit={saveCategoryLabelsSubmit} style={{ display: activeSection === "taxonomies" ? undefined : "none" }}>
          <h3>{t("admin.categoryLabels.heading")}</h3>
          <label>
            {t("admin.categoryLabels.categorySingular")}
            <input
              required
              value={categoryLabelSingular}
              onChange={(e) => setCategoryLabelSingular(e.target.value)}
              placeholder={t("admin.placeholder.categorySingular")}
            />
          </label>
          <label>
            {t("admin.categoryLabels.categoryPlural")}
            <input
              required
              value={categoryLabelPlural}
              onChange={(e) => setCategoryLabelPlural(e.target.value)}
              placeholder={t("admin.placeholder.categoryPlural")}
            />
          </label>
          <div className="meta">
            {t("admin.categoryLabels.current", {
              singular: categorySingularLabel,
              plural: categoryPluralLabel,
            })}
          </div>
          <button className="primary-btn" type="submit" disabled={!hasAdminRole}>
            {t("admin.categoryLabels.submit")}
          </button>
        </form>

        <form className="admin-form" onSubmit={createRoleSubmit} style={{ display: activeSection === "taxonomies" ? undefined : "none" }}>
          <h3>{t("admin.createRole.heading")}</h3>
          <label>
            {t("common.field.key")}
            <input
              required
              value={roleCreateKey}
              onChange={(e) => setRoleCreateKey(e.target.value)}
              placeholder={t("admin.placeholder.roleKey")}
            />
          </label>
          <label>
            {t("common.field.label")}
            <input
              required
              value={roleCreateLabel}
              onChange={(e) => setRoleCreateLabel(e.target.value)}
              placeholder={t("admin.placeholder.roleLabel")}
            />
          </label>
          <button className="primary-btn" type="submit" disabled={!hasAdminRole}>
            {t("admin.createRole.submit")}
          </button>
        </form>
      </div>

      <section>
        <form
          className="admin-form"
          onSubmit={(event) => void saveEventEdits(event)}
          style={{ display: activeSection === "events" && eventEditor ? undefined : "none" }}
        >
          <h3>{t("admin.editEvent.heading")}</h3>
          {loadingEventEditor && <div className="meta">{t("admin.loading.eventDetails")}</div>}
          {!loadingEventEditor && !eventEditor && (
            <div className="meta">{t("admin.editEvent.promptSelect")}</div>
          )}
          {eventEditor && (
            <>
              <div className="meta">{t("common.editingEntity", { title: eventEditor.title, slug: eventEditor.slug })}</div>
              <label>
                {t("common.field.title")}
                <input
                  required
                  value={eventEditor.title}
                  onChange={(e) =>
                    setEventEditor((current) => (current ? { ...current, title: e.target.value } : current))
                  }
                />
              </label>
              <div>
                <label>Description</label>
                <RichTextEditor
                  key={eventEditor.id}
                  value={eventEditor.descriptionHtml}
                  onChange={(html) =>
                    setEventEditor((current) => (current ? { ...current, descriptionHtml: html } : current))
                  }
                />
              </div>
              <label>
                {t("common.field.attendanceMode")}
                <select
                  value={eventEditor.attendanceMode}
                  onChange={(e) =>
                    setEventEditor((current) =>
                      current
                        ? { ...current, attendanceMode: e.target.value as "in_person" | "online" | "hybrid" }
                        : current,
                    )
                  }
                >
                  <option value="in_person">{t("attendanceMode.in_person")}</option>
                  <option value="online">{t("attendanceMode.online")}</option>
                  <option value="hybrid">{t("attendanceMode.hybrid")}</option>
                </select>
              </label>
              <label>
                {t("admin.field.onlineUrl")}
                <input
                  value={eventEditor.onlineUrl}
                  onChange={(e) =>
                    setEventEditor((current) => (current ? { ...current, onlineUrl: e.target.value } : current))
                  }
                />
              </label>
              <label>
                {categorySingularLabel}
                <select
                  value={eventEditor.practiceCategoryId}
                  onChange={(e) =>
                    setEventEditor((current) =>
                      current
                        ? {
                            ...current,
                            practiceCategoryId: e.target.value,
                            practiceSubcategoryId: "",
                          }
                        : current,
                    )
                  }
                >
                  <option value="">{t("common.option.selectCategory")}</option>
                  {taxonomy?.practices.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("admin.field.subcategoryOptional")}
                <select
                  value={eventEditor.practiceSubcategoryId}
                  onChange={(e) =>
                    setEventEditor((current) =>
                      current ? { ...current, practiceSubcategoryId: e.target.value } : current,
                    )
                  }
                >
                  <option value="">{t("common.none")}</option>
                  {selectedEditCategory?.subcategories.map((subcategory) => (
                    <option key={subcategory.id} value={subcategory.id}>
                      {subcategory.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Event format
                <select
                  value={eventEditor.eventFormatId}
                  onChange={(e) =>
                    setEventEditor((current) =>
                      current ? { ...current, eventFormatId: e.target.value } : current,
                    )
                  }
                >
                  <option value="">{t("common.none")}</option>
                  {taxonomy?.eventFormats?.map((format) => (
                    <option key={format.id} value={format.id}>
                      {format.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("common.field.scheduleKind")}
                <select
                  value={eventEditor.scheduleKind}
                  onChange={(e) =>
                    setEventEditor((current) =>
                      current
                        ? { ...current, scheduleKind: e.target.value as "single" | "recurring" }
                        : current,
                    )
                  }
                >
                  <option value="single">{t("common.scheduleKind.single")}</option>
                  <option value="recurring">{t("common.scheduleKind.recurring")}</option>
                </select>
              </label>
              <label>
                {t("admin.field.eventTimezone")}
                <input
                  value={eventEditor.eventTimezone}
                  onChange={(e) =>
                    setEventEditor((current) => (current ? { ...current, eventTimezone: e.target.value } : current))
                  }
                />
              </label>
              {eventEditor.scheduleKind === "single" ? (
                <>
                  <label>
                    {t("common.field.start")}
                    <input
                      required
                      type="datetime-local"
                      value={eventEditor.singleStartAt}
                      onChange={(e) =>
                        setEventEditor((current) =>
                          current ? { ...current, singleStartAt: e.target.value } : current,
                        )
                      }
                    />
                  </label>
                  <label>
                    {t("common.field.end")}
                    <input
                      required
                      type="datetime-local"
                      value={eventEditor.singleEndAt}
                      onChange={(e) =>
                        setEventEditor((current) =>
                          current ? { ...current, singleEndAt: e.target.value } : current,
                        )
                      }
                    />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    {t("admin.field.rrule")}
                    <input
                      value={eventEditor.rrule}
                      onChange={(e) =>
                        setEventEditor((current) => (current ? { ...current, rrule: e.target.value } : current))
                      }
                      placeholder="FREQ=WEEKLY;INTERVAL=1"
                    />
                  </label>
                  <label>
                    {t("admin.field.recurringStart")}
                    <input
                      required
                      type="datetime-local"
                      value={eventEditor.rruleDtstartLocal}
                      onChange={(e) =>
                        setEventEditor((current) =>
                          current ? { ...current, rruleDtstartLocal: e.target.value } : current,
                        )
                      }
                    />
                  </label>
                  <label>
                    {t("admin.field.durationMinutes")}
                    <input
                      value={eventEditor.durationMinutes}
                      onChange={(e) =>
                        setEventEditor((current) =>
                          current ? { ...current, durationMinutes: e.target.value } : current,
                        )
                      }
                      placeholder={t("admin.placeholder.durationMinutes")}
                    />
                  </label>
                </>
              )}
              <label>
                {t("admin.field.eventLocationSearch")}
                <input
                  value={editLocationQuery}
                  onChange={(e) => setEditLocationQuery(e.target.value)}
                  placeholder={t("admin.placeholder.locationSearch")}
                />
              </label>
              <div className="admin-card-actions">
                <button
                  className="secondary-btn"
                  type="button"
                  disabled={editLocationLoading || editLocationQuery.trim().length < 2}
                  onClick={() => void runEditLocationSearch()}
                >
                  {t("admin.button.searchLocation")}
                </button>
                {eventEditor.locationId && (
                  <button
                    className="ghost-btn"
                    type="button"
                    onClick={clearEditLocation}
                  >
                    {t("admin.button.removeLocation")}
                  </button>
                )}
              </div>
              {editLocationLoading && <div className="meta">{t("admin.loading.geocodeSearch")}</div>}
              {eventEditor.locationId && (
                <div className="meta">{t("admin.label.selectedLocation", { address: eventEditor.locationLabel })}</div>
              )}
              {editLocationResults.length > 0 && (
                <div className="admin-inline-list">
                  {editLocationResults.map((result, index) => (
                    <div className="admin-inline-list-item" key={`${result.formatted_address}-${index}`}>
                      <span>{result.formatted_address}</span>
                      <button
                        className="secondary-btn"
                        type="button"
                        onClick={() => void selectEditLocation(result)}
                      >
                        {t("common.use")}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <label>
                {t("common.field.languagesCsv")}
                <input
                  value={eventEditor.languages}
                  onChange={(e) =>
                    setEventEditor((current) => (current ? { ...current, languages: e.target.value } : current))
                  }
                />
              </label>
              <label>
                {t("common.field.tagsCsv")}
                <input
                  value={eventEditor.tags}
                  onChange={(e) =>
                    setEventEditor((current) => (current ? { ...current, tags: e.target.value } : current))
                  }
                />
              </label>
              <label>
                {t("admin.field.visibility")}
                <select
                  value={eventEditor.visibility}
                  onChange={(e) =>
                    setEventEditor((current) =>
                      current
                        ? { ...current, visibility: e.target.value as "public" | "unlisted" }
                        : current,
                    )
                  }
                >
                  <option value="public">{t("common.visibility.public")}</option>
                  <option value="unlisted">{t("common.visibility.unlisted")}</option>
                </select>
              </label>
              <label>
                Cover image URL
                <input
                  value={eventEditor.coverImageUrl}
                  onChange={(e) =>
                    setEventEditor((current) =>
                      current ? { ...current, coverImageUrl: e.target.value } : current,
                    )
                  }
                />
              </label>
              <label>
                {t("admin.field.coverImage")}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setEventCoverFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <div className="admin-card-actions">
                <button className="primary-btn" type="submit" disabled={!hasEditorRole}>
                  {t("admin.editEvent.submit")}
                </button>
                <button
                  className="ghost-btn"
                  type="button"
                  onClick={() => {
                    setEventEditor(null);
                    setEditLocationQuery("");
                    setEditLocationResults([]);
                  }}
                >
                  {t("common.clear")}
                </button>
              </div>
            </>
          )}
        </form>

        <form
          className="admin-form"
          onSubmit={(event) => void saveOrganizerEdits(event)}
          style={{ display: activeSection === "organizers" && organizerEditor ? undefined : "none" }}
        >
          <h3>{t("admin.editOrganizer.heading")}</h3>
          {!loadingOrganizerEditor && !organizerEditor && (
            <div className="meta">{t("admin.editOrganizer.promptSelect")}</div>
          )}
          {organizerEditor && (
            <>
              <label>
                {t("common.field.name")}
                <input
                  required
                  value={organizerEditor.name}
                  onChange={(e) =>
                    setOrganizerEditor((current) => (current ? { ...current, name: e.target.value } : current))
                  }
                />
              </label>
              <label>
                {t("common.field.websiteUrl")}
                <input
                  value={organizerEditor.websiteUrl}
                  onChange={(e) =>
                    setOrganizerEditor((current) =>
                      current ? { ...current, websiteUrl: e.target.value } : current,
                    )
                  }
                />
              </label>
              <label>
                External URL
                <input
                  value={organizerEditor.externalUrl}
                  onChange={(e) =>
                    setOrganizerEditor((current) =>
                      current ? { ...current, externalUrl: e.target.value } : current,
                    )
                  }
                />
              </label>
              <label>
                Image URL
                <input
                  value={organizerEditor.imageUrl}
                  onChange={(e) =>
                    setOrganizerEditor((current) =>
                      current ? { ...current, imageUrl: e.target.value } : current,
                    )
                  }
                />
              </label>
              <label>
                {t("admin.field.avatarImage")}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setOrganizerEditAvatarFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <label>
                {t("common.field.city")}
                <input
                  value={organizerEditor.city}
                  onChange={(e) =>
                    setOrganizerEditor((current) =>
                      current ? { ...current, city: e.target.value } : current,
                    )
                  }
                />
              </label>
              <SearchableMultiSelectDropdown
                label={t("common.field.countryCode")}
                options={allCountryOptions}
                selectedValues={organizerEditor.countryCodes}
                onChange={(nextCountryCodes) =>
                  setOrganizerEditor((current) => (
                    current ? { ...current, countryCodes: nextCountryCodes } : current
                  ))
                }
                placeholder={t("eventSearch.search")}
              />
              <SearchableMultiSelectDropdown
                label={t("common.field.languagesCsv")}
                options={allLanguageOptions}
                selectedValues={organizerEditor.languages}
                onChange={(nextLanguages) =>
                  setOrganizerEditor((current) => (
                    current ? { ...current, languages: nextLanguages } : current
                  ))
                }
                placeholder={t("eventSearch.search")}
              />
              <div className="admin-form-section">
                <h4>Host locations</h4>
                <div className="meta">Add one or more locations and mark one as primary.</div>
                {organizerEditor.locations.map((location, locationIndex) => (
                  <div className="card" key={`${location.id || "new"}-${locationIndex}`}>
                    <div className="admin-inline-list">
                      <label className="meta">
                        <input
                          type="radio"
                          checked={location.isPrimary}
                          onChange={() =>
                            setOrganizerEditor((current) => (
                              current
                                ? {
                                    ...current,
                                    locations: current.locations.map((item, idx) => ({
                                      ...item,
                                      isPrimary: idx === locationIndex,
                                    })),
                                  }
                                : current
                            ))
                          }
                        />
                        Primary
                      </label>
                      <button
                        className="ghost-btn"
                        type="button"
                        onClick={() =>
                          setOrganizerEditor((current) => (
                            current
                              ? {
                                  ...current,
                                  locations: current.locations.filter((_, idx) => idx !== locationIndex),
                                }
                              : current
                          ))
                        }
                      >
                        Remove location
                      </button>
                    </div>
                    <label>
                      Label
                      <input
                        value={location.label}
                        onChange={(e) =>
                          setOrganizerEditor((current) => (
                            current
                              ? {
                                  ...current,
                                  locations: current.locations.map((item, idx) => (
                                    idx === locationIndex ? { ...item, label: e.target.value } : item
                                  )),
                                }
                              : current
                          ))
                        }
                      />
                    </label>
                    <label>
                      Address
                      <input
                        value={location.formattedAddress}
                        onChange={(e) =>
                          setOrganizerEditor((current) => (
                            current
                              ? {
                                  ...current,
                                  locations: current.locations.map((item, idx) => (
                                    idx === locationIndex ? { ...item, formattedAddress: e.target.value } : item
                                  )),
                                }
                              : current
                          ))
                        }
                      />
                    </label>
                    <button
                      className="ghost-btn"
                      type="button"
                      onClick={() => void geocodeOrganizerLocation(locationIndex)}
                    >
                      Search and verify location
                    </button>
                    <div className="admin-inline-list">
                      <label>
                        City
                        <input
                          value={location.city}
                          onChange={(e) =>
                            setOrganizerEditor((current) => (
                              current
                                ? {
                                    ...current,
                                    locations: current.locations.map((item, idx) => (
                                      idx === locationIndex ? { ...item, city: e.target.value } : item
                                    )),
                                  }
                                : current
                            ))
                          }
                        />
                      </label>
                      <label>
                        Country
                        <input
                          value={location.countryCode}
                          onChange={(e) =>
                            setOrganizerEditor((current) => (
                              current
                                ? {
                                    ...current,
                                    locations: current.locations.map((item, idx) => (
                                      idx === locationIndex ? { ...item, countryCode: e.target.value } : item
                                    )),
                                  }
                                : current
                            ))
                          }
                        />
                      </label>
                    </div>
                    <div className="admin-inline-list">
                      <label>
                        Lat
                        <input
                          value={location.lat}
                          onChange={(e) =>
                            setOrganizerEditor((current) => (
                              current
                                ? {
                                    ...current,
                                    locations: current.locations.map((item, idx) => (
                                      idx === locationIndex ? { ...item, lat: e.target.value } : item
                                    )),
                                  }
                                : current
                            ))
                          }
                        />
                      </label>
                      <label>
                        Lng
                        <input
                          value={location.lng}
                          onChange={(e) =>
                            setOrganizerEditor((current) => (
                              current
                                ? {
                                    ...current,
                                    locations: current.locations.map((item, idx) => (
                                      idx === locationIndex ? { ...item, lng: e.target.value } : item
                                    )),
                                  }
                                : current
                            ))
                          }
                        />
                      </label>
                    </div>
                    {location.lat.trim() && location.lng.trim() && (
                      <AdminLocationPreviewMap
                        lat={Number(location.lat)}
                        lng={Number(location.lng)}
                        onMarkerChange={(nextLat, nextLng) =>
                          setOrganizerEditor((current) => (
                            current
                              ? {
                                  ...current,
                                  locations: current.locations.map((item, idx) => (
                                    idx === locationIndex
                                      ? { ...item, lat: nextLat.toFixed(6), lng: nextLng.toFixed(6) }
                                      : item
                                  )),
                                }
                              : current
                          ))
                        }
                      />
                    )}
                  </div>
                ))}
                <button
                  className="secondary-btn"
                  type="button"
                  onClick={() =>
                    setOrganizerEditor((current) => (
                      current
                        ? {
                            ...current,
                            locations: [
                              ...current.locations,
                              {
                                id: "",
                                isPrimary: current.locations.length === 0,
                                label: "",
                                formattedAddress: "",
                                city: "",
                                countryCode: "",
                                lat: "",
                                lng: "",
                                provider: "",
                                placeId: "",
                              },
                            ],
                          }
                        : current
                    ))
                  }
                >
                  Add location
                </button>
              </div>
              <label>
                {t("common.field.tagsCsv")}
                <input
                  value={organizerEditor.tags}
                  onChange={(e) =>
                    setOrganizerEditor((current) => (current ? { ...current, tags: e.target.value } : current))
                  }
                />
              </label>
              <label>
                {t("organizerSearch.hostType")}
                <div className="kv">
                  {taxonomy?.organizerRoles.map((role) => (
                    <label key={`edit-role-${role.id}`} className="meta">
                      <input
                        type="checkbox"
                        checked={organizerEditor.profileRoleIds.includes(role.id)}
                        onChange={() =>
                          setOrganizerEditor((current) => (
                            current
                              ? {
                                  ...current,
                                  profileRoleIds: current.profileRoleIds.includes(role.id)
                                    ? current.profileRoleIds.filter((item) => item !== role.id)
                                    : [...current.profileRoleIds, role.id],
                                }
                              : current
                          ))
                        }
                      />
                      {role.label}
                    </label>
                  ))}
                </div>
              </label>
              <label>
                {categorySingularLabel}
                <div className="kv">
                  {taxonomy?.practices.categories.map((category) => (
                    <label key={`edit-practice-${category.id}`} className="meta">
                      <input
                        type="checkbox"
                        checked={organizerEditor.practiceCategoryIds.includes(category.id)}
                        onChange={() =>
                          setOrganizerEditor((current) => (
                            current
                              ? {
                                  ...current,
                                  practiceCategoryIds: current.practiceCategoryIds.includes(category.id)
                                    ? current.practiceCategoryIds.filter((item) => item !== category.id)
                                    : [...current.practiceCategoryIds, category.id],
                                }
                              : current
                          ))
                        }
                      />
                      {category.label}
                    </label>
                  ))}
                </div>
              </label>
              <div>
                <label>Description</label>
                <RichTextEditor
                  key={organizerEditor.id}
                  value={organizerEditor.descriptionHtml}
                  onChange={(html) =>
                    setOrganizerEditor((current) => (
                      current ? { ...current, descriptionHtml: html } : current
                    ))
                  }
                />
              </div>
              <label>
                {t("common.field.status")}
                <select
                  value={organizerEditor.status}
                  onChange={(e) =>
                    setOrganizerEditor((current) =>
                      current
                        ? { ...current, status: e.target.value as "draft" | "published" | "archived" }
                        : current,
                    )
                  }
                >
                  <option value="draft">{t("common.status.draft")}</option>
                  <option value="published">{t("common.status.published")}</option>
                  <option value="archived">{t("common.status.archived")}</option>
                </select>
              </label>
              <div className="admin-card-actions">
                <button className="primary-btn" type="submit" disabled={!hasEditorRole}>
                  {t("admin.editOrganizer.submit")}
                </button>
                <button
                  className="ghost-btn"
                  type="button"
                  onClick={() => setOrganizerEditor(null)}
                >
                  {t("common.clear")}
                </button>
              </div>
            </>
          )}
        </form>
      </section>

      {activeSection === "users" && (
        <section className="admin-list-grid">
          <div className="admin-form">
            <h3>{t("admin.sections.users")}</h3>
            <div className="meta">{t("admin.console.user", { user: userName ?? t("common.unknown") })}</div>
            <div className="meta">{t("admin.console.roles", { roles: roles.join(", ") || t("common.none") })}</div>
          </div>
        </section>
      )}

      {status && <div className="admin-status">{status}</div>}
        </div>
      </div>
    </section>
  );
}
