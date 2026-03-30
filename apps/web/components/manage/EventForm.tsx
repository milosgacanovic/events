"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ROLE_ADMIN } from "@dr-events/shared";
import { useKeycloakAuth } from "../auth/KeycloakAuthProvider";
import { useI18n } from "../i18n/I18nProvider";
import { RichTextEditor } from "../admin/RichTextEditor";
import { HostLinker } from "./HostLinker";
import { ImportWarningBanner } from "./ImportWarningBanner";
import { LocationSearchField } from "./LocationSearchField";
import { RruleBuilder } from "./RruleBuilder";
import type { EventFormState } from "./EventFormTypes";
import { newEventFormState } from "./EventFormTypes";
import { csvToArray, datetimeLocalToIso } from "../../lib/formUtils";
import { authorizedGet, authorizedPatch, authorizedPost, authorizedUpload } from "../../lib/manageApi";
import { apiBase } from "../../lib/api";
import { getFormatLabel, getRoleLabel } from "../../lib/filterHelpers";

const AdminLocationPreviewMap = dynamic(
  () => import("../admin/AdminLocationPreviewMap").then((m) => m.AdminLocationPreviewMap),
  { ssr: false },
);

type TaxonomyResponse = {
  uiLabels: { categorySingular?: string; categoryPlural?: string };
  practices: {
    categories: Array<{
      id: string;
      key: string;
      label: string;
      subcategories: Array<{ id: string; key: string; label: string }>;
    }>;
  };
  organizerRoles: Array<{ id: string; key: string; label: string }>;
  eventFormats?: Array<{ id: string; key: string; label: string }>;
};


const COMMON_LANGUAGE_CODES = [
  "ar", "zh", "hr", "da", "nl", "en", "fi", "fr", "de", "el",
  "he", "hi", "id", "it", "ja", "ko", "nb", "pl", "pt", "ru",
  "sr-Latn", "es", "sv", "th", "tr", "uk", "vi",
];

const regionNames = typeof Intl !== "undefined" && Intl.DisplayNames
  ? new Intl.DisplayNames(["en"], { type: "region" })
  : null;

const ISO_COUNTRY_CODES = [
  "AD","AE","AF","AG","AI","AL","AM","AO","AR","AS","AT","AU","AW","AX","AZ",
  "BA","BB","BD","BE","BF","BG","BH","BI","BJ","BL","BM","BN","BO","BQ","BR",
  "BS","BT","BW","BY","BZ","CA","CC","CD","CF","CG","CH","CI","CK","CL","CM",
  "CN","CO","CR","CU","CV","CW","CX","CY","CZ","DE","DJ","DK","DM","DO","DZ",
  "EC","EE","EG","EH","ER","ES","ET","FI","FJ","FK","FM","FO","FR","GA","GB",
  "GD","GE","GF","GG","GH","GI","GL","GM","GN","GP","GQ","GR","GT","GU","GW",
  "GY","HK","HN","HR","HT","HU","ID","IE","IL","IM","IN","IO","IQ","IR","IS",
  "IT","JE","JM","JO","JP","KE","KG","KH","KI","KM","KN","KP","KR","KW","KY",
  "KZ","LA","LB","LC","LI","LK","LR","LS","LT","LU","LV","LY","MA","MC","MD",
  "ME","MF","MG","MH","MK","ML","MM","MN","MO","MP","MQ","MR","MS","MT","MU",
  "MV","MW","MX","MY","MZ","NA","NC","NE","NF","NG","NI","NL","NO","NP","NR",
  "NU","NZ","OM","PA","PE","PF","PG","PH","PK","PL","PM","PN","PR","PS","PT",
  "PW","PY","QA","RE","RO","RS","RU","RW","SA","SB","SC","SD","SE","SG","SH",
  "SI","SJ","SK","SL","SM","SN","SO","SR","SS","ST","SV","SX","SY","SZ","TC",
  "TD","TF","TG","TH","TJ","TK","TL","TM","TN","TO","TR","TT","TV","TW","TZ",
  "UA","UG","US","UY","UZ","VA","VC","VE","VG","VI","VN","VU","WF","WS","YE",
  "YT","ZA","ZM","ZW",
];

const countryOptions = ISO_COUNTRY_CODES.map((code) => ({
  code,
  label: regionNames?.of(code) ?? code,
})).sort((a, b) => a.label.localeCompare(b.label));

export function EventForm({
  mode,
  initialState,
  extraActions,
  onDelete,
  initialStatusMessage,
}: {
  mode: "create" | "edit";
  initialState?: EventFormState;
  extraActions?: React.ReactNode;
  onDelete?: () => void;
  initialStatusMessage?: string;
}) {
  const { getToken, roles: authRoles } = useKeycloakAuth();
  const isAdmin = authRoles.includes(ROLE_ADMIN);
  const { t, locale } = useI18n();
  const router = useRouter();

  const [form, setForm] = useState<EventFormState>(initialState ?? newEventFormState());
  const [taxonomy, setTaxonomy] = useState<TaxonomyResponse | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(initialStatusMessage ?? "");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [detachConfirmed, setDetachConfirmed] = useState(form.detachedFromImport);
  const [tzSearch, setTzSearch] = useState("");
  const [tzOpen, setTzOpen] = useState(false);
  const tzBlurTimer = useRef<ReturnType<typeof setTimeout>>();
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestTag, setSuggestTag] = useState("");
  const [suggestReason, setSuggestReason] = useState("");
  const [suggestSubmitting, setSuggestSubmitting] = useState(false);
  const [suggestDone, setSuggestDone] = useState(false);
  const [publishHostDialog, setPublishHostDialog] = useState(false);

  const slugManuallyEdited = useRef(false);
  const savedStatusRef = useRef<string>(initialState?.status ?? "draft");

  function saveMessage(newStatus: string): string {
    const prev = savedStatusRef.current;
    savedStatusRef.current = newStatus;
    if (prev !== newStatus) {
      if (newStatus === "draft") return t("manage.form.savedAsDraft");
      if (newStatus === "published") return t("manage.form.savedAndPublished");
      if (newStatus === "cancelled") return t("manage.form.savedAndCancelled");
      if (newStatus === "archived") return t("manage.form.savedAndArchived");
    }
    return t("manage.form.saved");
  }

  const savedMessages = [t("manage.form.saved"), t("manage.form.savedAsDraft"), t("manage.form.savedAndPublished"), t("manage.form.savedAndCancelled"), t("manage.form.savedAndArchived")];

  const update = useCallback(<K extends keyof EventFormState>(key: K, value: EventFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setStatus((prev) => savedMessages.includes(prev) ? t("manage.form.edited") : prev);
  }, [t]);

  // Auto-generate slug from title in create mode
  useEffect(() => {
    if (mode === "create" && !slugManuallyEdited.current) {
      const generated = form.title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      update("slug", generated);
    }
  }, [form.title, mode, update]);

  // Load taxonomy metadata
  useEffect(() => {
    async function load() {
      try {
        const tax = await fetch(`${apiBase}/meta/taxonomies`, { cache: "no-store" }).then((r) => r.json()) as TaxonomyResponse;
        setTaxonomy(tax);
        // No auto-select defaults (UX-2/3)
      } catch (err) {
        console.error("Failed to load form metadata:", err);
      }
    }
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const timezones = useMemo(() => {
    try {
      return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone");
    } catch {
      return ["UTC", "America/New_York", "America/Chicago", "America/Los_Angeles", "America/Sao_Paulo",
        "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Belgrade", "Europe/Istanbul",
        "Asia/Dubai", "Asia/Tokyo", "Asia/Seoul", "Asia/Kolkata", "Australia/Sydney"];
    }
  }, []);

  const filteredTimezones = useMemo(() => {
    if (!tzSearch) return timezones;
    return timezones.filter((tz) => tz.toLowerCase().includes(tzSearch.toLowerCase()));
  }, [timezones, tzSearch]);

  function getTzOffset(tz: string): string {
    try {
      const parts = Intl.DateTimeFormat(undefined, { timeZone: tz, timeZoneName: "short" }).formatToParts(new Date());
      return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    } catch {
      return "";
    }
  }

  const organizerNamesById = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of form.organizerRoles) {
      if (r.organizerName) {
        map.set(r.organizerId, r.organizerName);
      }
    }
    return map;
  }, [form.organizerRoles]);
  const organizerAvatarsById = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const r of form.organizerRoles) {
      map.set(r.organizerId, r.organizerImageUrl ?? r.organizerAvatarPath ?? null);
    }
    return map;
  }, [form.organizerRoles]);
  const organizerStatusesById = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of form.organizerRoles) {
      if (r.organizerStatus) map.set(r.organizerId, r.organizerStatus);
    }
    return map;
  }, [form.organizerRoles]);
  const roleLabelsById = useMemo(
    () => new Map((taxonomy?.organizerRoles ?? []).map((r) => [r.id, r.label])),
    [taxonomy],
  );
  const translatedRoleOptions = useMemo(
    () => (taxonomy?.organizerRoles ?? []).map((r) => ({ ...r, label: getRoleLabel(r.key, t) })),
    [taxonomy, t],
  );
  const selectedCategory = useMemo(
    () => taxonomy?.practices.categories.find((c) => c.id === form.practiceCategoryId),
    [taxonomy, form.practiceCategoryId],
  );

  const tagList = useMemo(() => csvToArray(form.tags).filter(Boolean), [form.tags]);
  const languageList = useMemo(() => csvToArray(form.languages).filter(Boolean), [form.languages]);

  const commonLanguages = useMemo(() => {
    try {
      const names = new Intl.DisplayNames([locale], { type: "language" });
      return COMMON_LANGUAGE_CODES.map((code) => {
        let label: string;
        try { label = names.of(code) ?? code; } catch { label = code; }
        return { code, label };
      }).sort((a, b) => a.label.localeCompare(b.label));
    } catch {
      return COMMON_LANGUAGE_CODES.map((code) => ({ code, label: code }));
    }
  }, [locale]);

  const [availableTags, setAvailableTags] = useState<Array<{ tag: string; display: string }>>([]);

  useEffect(() => {
    fetch(`${apiBase}/meta/tags?q=&limit=30`)
      .then((r) => r.json())
      .then((data: { items: Array<{ tag: string; display: string }> }) => setAvailableTags(data.items))
      .catch(() => {});
  }, []);

  function toggleTag(tag: string) {
    if (tagList.includes(tag)) {
      update("tags", tagList.filter((t) => t !== tag).join(", "));
    } else {
      if (tagList.length >= 5) {
        alert(t("manage.eventForm.maxTagsAllowed"));
        return;
      }
      update("tags", [...tagList, tag].join(", "));
    }
  }

  function toggleLanguage(code: string) {
    if (languageList.includes(code)) {
      update("languages", languageList.filter((l) => l !== code).join(", "));
    } else {
      update("languages", [...languageList, code].join(", "));
    }
  }

  function validateForm(): Record<string, string> {
    const errors: Record<string, string> = {};
    if (!form.title.trim()) errors.title = t("manage.form.required");
    if (!form.practiceCategoryId) errors.practiceCategoryId = t("manage.form.required");
    if (form.scheduleKind === "single") {
      if (!form.singleStartAt) errors.singleStartAt = t("manage.form.required");
      if (!form.singleEndAt) errors.singleEndAt = t("manage.form.required");
    } else {
      if (!form.rruleDtstartLocal) errors.rruleDtstartLocal = t("manage.form.required");
    }
    return errors;
  }

  function buildEventPayload(f: EventFormState, m: "create" | "edit", cover: File | null, detached: boolean): Record<string, unknown> {
    const tags = csvToArray(f.tags);
    const languages = csvToArray(f.languages);
    const payload: Record<string, unknown> = {
      title: f.title || (m === "create" ? undefined : f.title),
      descriptionJson: { html: f.descriptionHtml },
      attendanceMode: f.attendanceMode,
      onlineUrl: f.onlineUrl || null,
      externalUrl: f.externalUrl || null,
      practiceCategoryId: f.practiceCategoryId || null,
      practiceSubcategoryId: f.practiceSubcategoryId || null,
      eventFormatId: f.eventFormatId || null,
      tags,
      languages,
      scheduleKind: f.scheduleKind,
      eventTimezone: f.eventTimezone,
      visibility: f.visibility,
      organizerRoles: f.organizerRoles,
      locationId: f.locationId,
      locationLat: f.locationLat ?? null,
      locationLng: f.locationLng ?? null,
      locationCity: f.locationCity || null,
      locationCountry: f.locationCountry || null,
      locationAddress: f.locationAddress || null,
      locationLabel: f.locationLabel || null,
    };
    if (m === "edit") payload.status = f.status;
    if (m === "create" && f.slug) payload.slug = f.slug;
    if (detached && !f.detachedFromImport) payload.detachedFromImport = true;
    if (f.coverImageUrl && !cover) payload.coverImagePath = f.coverImageUrl;
    if (f.scheduleKind === "single") {
      payload.singleStartAt = datetimeLocalToIso(f.singleStartAt);
      payload.singleEndAt = datetimeLocalToIso(f.singleEndAt);
    } else {
      payload.rrule = f.rrule;
      payload.rruleDtstartLocal = f.rruleDtstartLocal;
      payload.durationMinutes = Number.parseInt(f.durationMinutes, 10) || 90;
    }
    return payload;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus(t("manage.form.saving"));

    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setSaving(false);
      setStatus("");
      requestAnimationFrame(() => {
        const firstKey = Object.keys(errors)[0];
        document.getElementById(`field-${firstKey}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return;
    }
    setFieldErrors({});

    try {
      const payload = buildEventPayload(form, mode, coverFile, detachConfirmed);

      let resultId: string;
      let resultSlug: string;

      if (mode === "create") {
        const result = await authorizedPost<{ id: string; slug: string }>(getToken, "/events", payload);
        resultId = result.id;
        resultSlug = result.slug;
      } else {
        const result = await authorizedPatch<{ id: string; slug: string }>(getToken, `/events/${form.id}`, payload);
        resultId = result.id;
        resultSlug = result.slug;
      }

      if (coverFile) {
        await authorizedUpload(getToken, "eventCover", resultId, coverFile);
      }

      if (mode === "create") {
        router.replace(`/manage/events/${resultId}?saved=draft`);
      } else {
        setStatus(saveMessage(form.status));
      }
    } catch (err) {
      if (err instanceof Error && err.message === "publish_requires_host") {
        setPublishHostDialog(true);
      } else {
        setStatus(t("manage.form.errorPrefix", { message: err instanceof Error ? err.message : t("manage.form.unknownError") }));
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAndPublish() {
    if (form.organizerRoles.length === 0) {
      setPublishHostDialog(true);
      return;
    }
    setSaving(true);
    setStatus("");
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setSaving(false);
      requestAnimationFrame(() => {
        const firstKey = Object.keys(errors)[0];
        document.getElementById(`field-${firstKey}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return;
    }
    setFieldErrors({});
    try {
      const payload = buildEventPayload(form, mode, coverFile, detachConfirmed);
      let resultId: string;
      let resultSlug: string;
      if (mode === "create") {
        const result = await authorizedPost<{ id: string; slug: string }>(getToken, "/events", payload);
        resultId = result.id;
        resultSlug = result.slug;
      } else {
        const result = await authorizedPatch<{ id: string; slug: string }>(getToken, `/events/${form.id}`, payload);
        resultId = result.id;
        resultSlug = result.slug;
      }
      if (coverFile) await authorizedUpload(getToken, "eventCover", resultId, coverFile);
      // Now publish
      await authorizedPost(getToken, `/events/${resultId}/publish`, {});
      savedStatusRef.current = "published";
      setStatus(t("manage.form.savedAndPublished"));
      router.push(`/events/${resultSlug}`);
    } catch (err) {
      if (err instanceof Error && err.message === "publish_requires_host") {
        setPublishHostDialog(true);
      } else {
        setStatus(t("manage.form.errorPrefix", { message: err instanceof Error ? err.message : t("manage.form.unknownError") }));
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveThenCreateHost() {
    // Trigger a form save (same as handleSubmit but redirect to create host)
    setSaving(true);
    setStatus("");
    setFieldErrors({});
    try {
      const payload = buildEventPayload(form, mode, coverFile, detachConfirmed);
      if (!payload.title) payload.title = "(Untitled)";

      if (mode === "create") {
        await authorizedPost<{ id: string; slug: string }>(getToken, "/events", payload);
      } else {
        await authorizedPatch<{ id: string; slug: string }>(getToken, `/events/${form.id}`, payload);
      }
      if (coverFile && form.id) {
        await authorizedUpload(getToken, "eventCover", form.id, coverFile);
      }
      router.push("/manage/hosts/new");
    } catch (err) {
      setStatus(t("manage.form.errorPrefix", { message: err instanceof Error ? err.message : t("manage.form.unknownError") }));
    } finally {
      setSaving(false);
    }
  }

  const showImportWarning = mode === "edit" && form.isImported && !detachConfirmed;

  return (
    <form className="manage-form" onSubmit={(e) => void handleSubmit(e)}>
      {showImportWarning && (
        <ImportWarningBanner
          isDetached={form.detachedFromImport}
          importSource={form.importSource}
          onDetach={form.detachedFromImport ? undefined : () => setDetachConfirmed(true)}
        />
      )}

      {/* Basic Details */}
      <div className="manage-form-section">
        <h3>{t("manage.form.basicDetails")}</h3>
        <div id="field-title">
          <label>{t("manage.form.title")} <span className="field-required-mark">*</span></label>
          <input
            value={form.title}
            onChange={(e) => { update("title", e.target.value); if (fieldErrors.title) setFieldErrors((p) => ({ ...p, title: "" })); }}
            className={fieldErrors.title ? "field-invalid" : undefined}
          />
          {fieldErrors.title && <span className="field-error">{fieldErrors.title}</span>}
        </div>

        {/* Slug */}
        {mode === "create" ? (
          <div>
            <label>{t("manage.form.urlSlug")}</label>
            <input
              value={form.slug}
              onChange={(e) => { slugManuallyEdited.current = true; update("slug", e.target.value); }}
              placeholder={t("manage.form.slugAutoGenerated")}
            />
            {form.slug && (
              <span className="meta" style={{ fontSize: "0.75rem" }}>
                URL preview: events.danceresource.org/events/{form.slug}
              </span>
            )}
          </div>
        ) : (
          form.slug && (
            <div>
              <label>{t("manage.form.urlSlug")}</label>
              <input value={form.slug} readOnly disabled style={{ color: "var(--muted)" }} />
            </div>
          )
        )}

        <div>
          <label>{t("manage.eventForm.attendanceMode")}</label>
          <select value={form.attendanceMode} onChange={(e) => update("attendanceMode", e.target.value as EventFormState["attendanceMode"])}>
            <option value="in_person">{t("manage.eventForm.attendanceInPerson")}</option>
            <option value="online">{t("manage.eventForm.attendanceOnline")}</option>
            <option value="hybrid">{t("manage.eventForm.attendanceHybrid")}</option>
          </select>
        </div>

        {(form.attendanceMode === "online" || form.attendanceMode === "hybrid") && (
          <div>
            <label>{t("manage.eventForm.onlineUrl")}</label>
            <input value={form.onlineUrl} onChange={(e) => update("onlineUrl", e.target.value)} placeholder="https://..." />
          </div>
        )}

        {taxonomy && (
          <>
            <div id="field-practiceCategoryId">
              <label>{t("admin.placeholder.categorySingular") || taxonomy.uiLabels.categorySingular} <span className="field-required-mark">*</span></label>
              <select
                value={form.practiceCategoryId}
                onChange={(e) => { update("practiceCategoryId", e.target.value); update("practiceSubcategoryId", ""); if (fieldErrors.practiceCategoryId) setFieldErrors((p) => ({ ...p, practiceCategoryId: "" })); }}
                className={fieldErrors.practiceCategoryId ? "field-invalid" : undefined}
              >
                <option value="">{t("manage.eventForm.selectCategory")}</option>
                {taxonomy.practices.categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
              {fieldErrors.practiceCategoryId && <span className="field-error">{fieldErrors.practiceCategoryId}</span>}
            </div>

            {selectedCategory && selectedCategory.subcategories.length > 0 && (
              <div>
                <label>{t("manage.eventForm.subcategory")}</label>
                <select value={form.practiceSubcategoryId} onChange={(e) => update("practiceSubcategoryId", e.target.value)}>
                  <option value="">{t("manage.eventForm.none")}</option>
                  {selectedCategory.subcategories.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
            )}

            {taxonomy.eventFormats && taxonomy.eventFormats.length > 0 && (
              <div>
                <label>{t("manage.eventForm.format")}</label>
                <select value={form.eventFormatId} onChange={(e) => update("eventFormatId", e.target.value)}>
                  <option value="">{t("manage.eventForm.none")}</option>
                  {taxonomy.eventFormats.map((f) => (
                    <option key={f.id} value={f.id}>{getFormatLabel(f.key, f.label, t)}</option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}

        {/* Import Info (edit mode, imported events only) */}
        {mode === "edit" && form.isImported && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: 6,
              backgroundColor: "var(--surface, #f8f8f8)",
              border: "1px solid var(--border)",
              marginBottom: 8,
            }}
          >
            <strong style={{ fontSize: "0.85rem" }}>{t("manage.eventForm.importInformation")}</strong>
            <div className="meta" style={{ marginTop: 4 }}>
              {t("manage.eventForm.importSource", { source: form.importSource ?? t("common.unknown") })}
              {form.externalId && <span> &middot; {t("manage.eventForm.externalId", { id: form.externalId })}</span>}
            </div>
            {form.detachedAt && (
              <div className="meta">{t("manage.eventForm.detachedOn", { date: new Date(form.detachedAt).toLocaleDateString() })}</div>
            )}
          </div>
        )}
      </div>

      {/* Schedule */}
      <div className="manage-form-section">
        <h3>{t("manage.form.schedule")}</h3>
        <div>
          <label>{t("manage.eventForm.scheduleType")}</label>
          <select value={form.scheduleKind} onChange={(e) => update("scheduleKind", e.target.value as "single" | "recurring")}>
            <option value="single">{t("manage.eventForm.scheduleSingle")}</option>
            <option value="recurring">{t("manage.eventForm.scheduleRecurring")}</option>
          </select>
        </div>

        <div style={{ marginTop: 12, position: "relative" }}>
          <label>{t("manage.eventForm.timezone")}</label>
          <input
            placeholder={t("manage.eventForm.searchTimezone")}
            value={tzOpen ? tzSearch : (form.eventTimezone ? `${form.eventTimezone} (${getTzOffset(form.eventTimezone)})` : "")}
            onChange={(e) => { setTzSearch(e.target.value); setTzOpen(true); }}
            onFocus={() => { setTzSearch(""); setTzOpen(true); }}
            onBlur={() => { tzBlurTimer.current = setTimeout(() => setTzOpen(false), 200); }}
            autoComplete="off"
          />
          {tzOpen && (
            <div className="tz-dropdown">
              {filteredTimezones.length === 0 ? (
                <div className="tz-dropdown-empty">{t("manage.eventForm.noMatchingTimezones")}</div>
              ) : (
                filteredTimezones.slice(0, 50).map((tz) => (
                  <button
                    key={tz}
                    type="button"
                    className={`tz-dropdown-item${tz === form.eventTimezone ? " tz-dropdown-item-active" : ""}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      clearTimeout(tzBlurTimer.current);
                      update("eventTimezone", tz);
                      setTzSearch("");
                      setTzOpen(false);
                    }}
                  >
                    {tz} <span className="tz-dropdown-offset">({getTzOffset(tz)})</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {form.scheduleKind === "single" ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
            <div id="field-singleStartAt">
              <label>{t("manage.eventForm.start")} <span className="field-required-mark">*</span></label>
              <input
                type="datetime-local"
                value={form.singleStartAt}
                onChange={(e) => {
                  const val = e.target.value;
                  update("singleStartAt", val);
                  if (!form.singleEndAt && val) update("singleEndAt", val);
                  if (fieldErrors.singleStartAt) setFieldErrors((p) => ({ ...p, singleStartAt: "" }));
                }}
                className={fieldErrors.singleStartAt ? "field-invalid" : undefined}
              />
              {fieldErrors.singleStartAt && <span className="field-error">{fieldErrors.singleStartAt}</span>}
            </div>
            <div id="field-singleEndAt">
              <label>{t("manage.eventForm.end")} <span className="field-required-mark">*</span></label>
              <input
                type="datetime-local"
                value={form.singleEndAt}
                onChange={(e) => { update("singleEndAt", e.target.value); if (fieldErrors.singleEndAt) setFieldErrors((p) => ({ ...p, singleEndAt: "" })); }}
                className={fieldErrors.singleEndAt ? "field-invalid" : undefined}
              />
              {fieldErrors.singleEndAt && <span className="field-error">{fieldErrors.singleEndAt}</span>}
            </div>
          </div>
        ) : (
          <div id="field-rruleDtstartLocal" style={{ marginTop: 12 }}>
            <RruleBuilder
              rrule={form.rrule}
              dtstartLocal={form.rruleDtstartLocal}
              durationMinutes={form.durationMinutes}
              onChange={(newRrule, newDtstart, newDuration) => {
                update("rrule", newRrule);
                update("rruleDtstartLocal", newDtstart);
                update("durationMinutes", newDuration);
                if (newDtstart && fieldErrors.rruleDtstartLocal) setFieldErrors((p) => ({ ...p, rruleDtstartLocal: "" }));
              }}
            />
            {fieldErrors.rruleDtstartLocal && <span className="field-error">{fieldErrors.rruleDtstartLocal}</span>}
          </div>
        )}
      </div>

      {/* Location */}
      <div className="manage-form-section">
        <h3>{t("manage.form.location")}</h3>
        {!form.locationId && (
          <LocationSearchField
            getToken={getToken}
            selectedLabel=""
            onSelect={(loc) => {
              update("locationId", loc.id);
              update("locationLabel", loc.formatted_address);
              update("locationCity", loc.city ?? "");
              update("locationCountry", (loc.country_code ?? "").toUpperCase());
              update("locationLat", loc.lat);
              update("locationLng", loc.lng);
              update("locationAddress", loc.formatted_address);
            }}
            onClear={() => {}}
          />
        )}
        {form.locationId && (
          <div style={{ marginTop: 12, border: "1px solid var(--border, #e0e0e0)", borderRadius: 8, padding: 12, background: "var(--surface, #f8f8f8)", position: "relative" }}>
            <button
              type="button"
              onClick={() => {
                update("locationId", null);
                update("locationLabel", "");
                update("locationCity", "");
                update("locationCountry", "");
                update("locationLat", null);
                update("locationLng", null);
                update("locationAddress", "");
              }}
              style={{ position: "absolute", top: 8, right: 8, background: "none", border: "none", cursor: "pointer", fontSize: "1.1rem", color: "var(--muted, #888)", lineHeight: 1, padding: "2px 6px" }}
              aria-label={t("manage.hostForm.removeLocation")}
            >
              &times;
            </button>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, paddingRight: 24 }}>
              <div className="kv" style={{ gridColumn: "1 / -1" }}>
                <label>{t("manage.eventForm.address")}</label>
                <input value={form.locationAddress} onChange={(e) => update("locationAddress", e.target.value)} />
              </div>
              <div className="kv">
                <label>{t("manage.eventForm.city")}</label>
                <input value={form.locationCity} onChange={(e) => update("locationCity", e.target.value)} />
              </div>
              <div className="kv">
                <label>{t("manage.eventForm.country")}</label>
                <select value={form.locationCountry} onChange={(e) => update("locationCountry", e.target.value)}>
                  <option value="">{t("manage.eventForm.selectCountry")}</option>
                  {countryOptions.map((c) => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className="kv">
                <label>{t("manage.eventForm.latitude")}</label>
                <input type="number" step="any" value={form.locationLat ?? ""} onChange={(e) => update("locationLat", e.target.value ? parseFloat(e.target.value) : null)} />
              </div>
              <div className="kv">
                <label>{t("manage.eventForm.longitude")}</label>
                <input type="number" step="any" value={form.locationLng ?? ""} onChange={(e) => update("locationLng", e.target.value ? parseFloat(e.target.value) : null)} />
              </div>
            </div>
            {form.locationLat != null && form.locationLng != null && (
              <div style={{ marginTop: 8, height: 220 }}>
                <AdminLocationPreviewMap
                  lat={form.locationLat}
                  lng={form.locationLng}
                  onMarkerChange={(lat, lng) => { update("locationLat", lat); update("locationLng", lng); }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Description */}
      <div className="manage-form-section">
        <h3>{t("manage.form.description")}</h3>
        <RichTextEditor value={form.descriptionHtml} onChange={(html) => update("descriptionHtml", html)} />
      </div>

      {/* Cover Image */}
      <div className="manage-form-section">
        <h3>{t("manage.form.coverImage")}</h3>
        {form.coverImageUrl && !coverFile && (
          <div style={{ marginBottom: 8 }}>
            <img
              src={form.coverImageUrl.startsWith("http") ? form.coverImageUrl : `${apiBase.replace("/api", "")}${form.coverImageUrl}`}
              alt="Cover"
              style={{ maxWidth: 300, maxHeight: 180, objectFit: "cover", borderRadius: 6 }}
            />
          </div>
        )}
        <input type="file" accept="image/*" onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)} />
        <div style={{ marginTop: 8 }}>
          <label>{t("manage.form.orPasteImageUrl")}</label>
          <input
            type="url"
            value={coverFile ? "" : form.coverImageUrl}
            onChange={(e) => { setCoverFile(null); update("coverImageUrl", e.target.value); }}
            placeholder="https://..."
            disabled={!!coverFile}
          />
        </div>
      </div>

      {/* Details */}
      <div className="manage-form-section">
        <h3>{t("manage.form.languages")}</h3>
        <div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
            {commonLanguages.map((lang) => {
              const selected = languageList.includes(lang.code);
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => toggleLanguage(lang.code)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 999,
                    border: `1.5px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                    background: selected ? "var(--accent-bg, #e8f0fe)" : "transparent",
                    color: selected ? "var(--accent)" : "var(--ink)",
                    fontWeight: 400,
                    fontSize: "0.85rem",
                    cursor: "pointer",
                  }}
                >
                  {lang.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="manage-form-section">
        <h3>{t("manage.form.tags")}</h3>
        <div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
            {availableTags.map((tag) => {
              const selected = tagList.includes(tag.tag);
              return (
                <button
                  key={tag.tag}
                  type="button"
                  onClick={() => toggleTag(tag.tag)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 999,
                    border: `1.5px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                    background: selected ? "var(--accent-bg, #e8f0fe)" : "transparent",
                    color: selected ? "var(--accent)" : "var(--ink)",
                    fontWeight: 400,
                    fontSize: "0.85rem",
                    cursor: "pointer",
                  }}
                >
                  {(() => { const k = `tag.${tag.tag.replace(/ /g, "-")}`; const v = t(k); return v !== k ? v : tag.display; })()}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
            <span className="meta" style={{ fontSize: "0.75rem" }}>{t("manage.eventForm.selectUpTo5Tags")}</span>
            <button type="button" onClick={() => setSuggestOpen(true)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: "0.75rem", textDecoration: "underline", padding: 0 }}>
              {t("manage.eventForm.suggestTag")}
            </button>
          </div>
        </div>
      </div>

      <div className="manage-form-section">
        <h3>{t("manage.eventForm.externalLink")}</h3>
        <div>
          <input
            value={form.externalUrl}
            onChange={(e) => update("externalUrl", e.target.value)}
            placeholder="https://..."
          />
          <span className="meta" style={{ fontSize: "0.75rem" }}>{t("manage.eventForm.externalLinkHint")}</span>
        </div>
      </div>

      <div className="manage-form-section">
        <h3>{t("manage.form.visibility")}</h3>
        <div>
          <select value={form.visibility} onChange={(e) => update("visibility", e.target.value as "public" | "unlisted")}>
            <option value="public">{t("manage.eventForm.visibilityPublic")}</option>
            <option value="unlisted">{t("manage.eventForm.visibilityUnlisted")}</option>
          </select>
          <span className="meta" style={{ fontSize: "0.75rem" }}>
            {form.visibility === "public" && t("manage.form.visibilityHint.public")}
            {form.visibility === "unlisted" && t("manage.form.visibilityHint.unlisted")}
          </span>
        </div>
      </div>

      {/* Hosts */}
      {taxonomy && (
        <div className="manage-form-section" id="hosts">
          <h3>{t("manage.form.hosts")}</h3>
          <HostLinker
            getToken={getToken}
            roleOptions={translatedRoleOptions}
            roles={form.organizerRoles}
            onChange={(roles) => update("organizerRoles", roles)}
            organizerNamesById={organizerNamesById}
            organizerAvatarsById={organizerAvatarsById}
            organizerStatusesById={organizerStatusesById}
            roleLabelsById={roleLabelsById}
            isAdmin={isAdmin}
            onSaveThenCreateHost={() => void handleSaveThenCreateHost()}
          />
        </div>
      )}

      {/* Status (edit only) */}
      {mode === "edit" && (
        <div className="manage-form-section">
          <h3>{t("manage.form.status")}</h3>
          <select value={form.status} onChange={(e) => update("status", e.target.value as EventFormState["status"])}>
            <option value="draft">{t("common.status.draft")}</option>
            <option value="published">{t("common.status.published")}</option>
            <option value="cancelled">{t("common.status.cancelled")}</option>
            <option value="archived">{t("common.status.archived")}</option>
          </select>
          <span className="meta" style={{ fontSize: "0.75rem" }}>
            {form.status === "draft" && t("manage.form.statusHint.draft")}
            {form.status === "published" && t("manage.form.statusHint.published")}
            {form.status === "cancelled" && t("manage.form.statusHint.cancelled")}
            {form.status === "archived" && t("manage.form.statusHint.archived")}
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="manage-form-actions">
        <button type="submit" className="primary-btn" disabled={saving}>
          {mode === "create" ? t("manage.form.saveDraft") : t("manage.form.save")}
        </button>
        {mode === "create" && (
          <button
            type="button"
            className="secondary-btn"
            disabled={saving || form.organizerRoles.length === 0}
            title={form.organizerRoles.length === 0 ? t("manage.eventForm.publishRequiresHost") : undefined}
            onClick={() => void handleSaveAndPublish()}
          >
            {t("manage.eventForm.saveAndPublish")}
          </button>
        )}
        <button type="button" className="ghost-btn" onClick={() => router.back()} disabled={saving}>
          {t("manage.form.discardChanges")}
        </button>
        {extraActions}
        {onDelete && (
          <button type="button" className="manage-btn-delete" style={{ marginLeft: "auto", padding: "8px 18px", borderRadius: 4, cursor: "pointer", fontWeight: 500, fontSize: "0.9rem" }} onClick={() => { if (confirm(t("manage.eventCard.confirmDelete"))) onDelete(); }} disabled={saving}>
            {t("manage.eventForm.delete")}
          </button>
        )}
      </div>

      {status && (
        <div className="manage-save-banner">
          <span>{status}</span>
          {(status === t("manage.form.saved") || status === t("manage.form.savedAndPublished")) && form.slug && form.status === "published" && (
            <>
              <span>{t("manage.form.viewEvent")}</span>
              <a href={`/events/${form.slug}`} className="manage-save-banner-link">{form.title || form.slug}</a>
            </>
          )}
        </div>
      )}

      {publishHostDialog && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => setPublishHostDialog(false)}>
          <div style={{ background: "var(--surface, #fff)", borderRadius: 12, padding: 24, maxWidth: 420, width: "90%", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}
            onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 12px", fontSize: "1.1rem" }}>{t("manage.eventForm.publishRequiresHostTitle")}</h3>
            <p style={{ margin: "0 0 20px", color: "var(--ink-muted)", lineHeight: 1.5 }}>{t("manage.eventForm.publishRequiresHost")}</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="ghost-btn" onClick={() => setPublishHostDialog(false)}>{t("manage.form.cancel")}</button>
              <button type="button" className="primary-btn" onClick={() => {
                setPublishHostDialog(false);
                document.getElementById("hosts")?.scrollIntoView({ behavior: "smooth" });
              }}>{t("manage.eventForm.goToHosts")}</button>
            </div>
          </div>
        </div>
      )}

      {suggestOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => { if (!suggestSubmitting) { setSuggestOpen(false); setSuggestDone(false); } }}>
          <div style={{ background: "var(--surface, #fff)", borderRadius: 12, padding: 24, maxWidth: 420, width: "90%", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}
            onClick={(e) => e.stopPropagation()}>
            {suggestDone ? (
              <div style={{ textAlign: "center", padding: "16px 0" }}>
                <p style={{ fontSize: "1rem", fontWeight: 500, color: "var(--ink)" }}>{t("manage.eventForm.suggestSuccess")}</p>
                <button type="button" className="secondary-btn" style={{ marginTop: 16 }}
                  onClick={() => { setSuggestOpen(false); setSuggestDone(false); }}>
                  {t("manage.eventForm.close")}
                </button>
              </div>
            ) : (
              <>
                <h3 style={{ margin: "0 0 8px", fontSize: "1.1rem" }}>{t("manage.eventForm.suggestNewTag")}</h3>
                <p className="meta" style={{ margin: "0 0 16px", fontSize: "0.85rem" }}>
                  {t("manage.eventForm.suggestTagDescription")}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: "0.85rem", fontWeight: 500 }}>{t("manage.eventForm.tagName")}</label>
                    <input value={suggestTag} onChange={(e) => setSuggestTag(e.target.value)}
                      placeholder={t("manage.eventForm.tagNamePlaceholder")} maxLength={60} style={{ marginTop: 4 }} />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.85rem", fontWeight: 500 }}>{t("manage.eventForm.whyTagNeeded")} <span className="meta">({t("manage.eventForm.optional")})</span></label>
                    <textarea value={suggestReason} onChange={(e) => setSuggestReason(e.target.value)}
                      placeholder={t("manage.eventForm.tagReasonPlaceholder")} maxLength={500} rows={3} style={{ marginTop: 4, width: "100%", resize: "vertical" }} />
                  </div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                    <button type="button" className="secondary-btn" onClick={() => { setSuggestOpen(false); setSuggestTag(""); setSuggestReason(""); }}
                      disabled={suggestSubmitting}>
                      {t("manage.form.cancel")}
                    </button>
                    <button type="button" className="primary-btn" disabled={!suggestTag.trim() || suggestSubmitting}
                      onClick={async () => {
                        setSuggestSubmitting(true);
                        try {
                          const { authorizedPost } = await import("../../lib/manageApi");
                          await authorizedPost(getToken, "/admin/tag-suggestions", {
                            tag: suggestTag.trim(),
                            reason: suggestReason.trim() || undefined,
                          });
                          setSuggestTag("");
                          setSuggestReason("");
                          setSuggestDone(true);
                        } catch {
                          alert(t("manage.eventForm.suggestFailed"));
                        } finally {
                          setSuggestSubmitting(false);
                        }
                      }}>
                      {suggestSubmitting ? t("manage.eventForm.submitting") : t("manage.eventForm.submit")}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </form>
  );
}
