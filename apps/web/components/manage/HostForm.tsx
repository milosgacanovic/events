"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useKeycloakAuth } from "../auth/KeycloakAuthProvider";
import { useI18n } from "../i18n/I18nProvider";
import { RichTextEditor } from "../admin/RichTextEditor";
import { ConfirmDialog } from "./ConfirmDialog";
import { type MultiSelectOption } from "./SearchableMultiSelect";
import { LocationSearchField } from "./LocationSearchField";
import { ensureHtml, mergeLegacyOrganizerDescription } from "../../lib/formUtils";
import { getRoleLabel } from "../../lib/filterHelpers";
import { authorizedGet, authorizedPatch, authorizedPost, authorizedUpload } from "../../lib/manageApi";
import { apiBase } from "../../lib/api";
import { countryOptions } from "../../lib/countries";

// Common language codes (Intl.supportedValuesOf("language") is not a valid key)
const COMMON_LANGUAGE_CODES = [
  "en","es","fr","de","it","pt","nl","pl","ru","tr","sr","sr-Latn","hr","ar",
  "zh","ja","ko","uk","sv","da","fi","nb","el","he","hi","id","vi","th",
  "cs","hu","ro","sk","sl","bg","ca","et","ga","is","ka","lt","lv","mk",
  "ms","mt","no","sq","sw","ta","te","ur","cy","zu",
];

const AdminLocationPreviewMap = dynamic(
  () => import("../admin/AdminLocationPreviewMap").then((m) => m.AdminLocationPreviewMap),
  { ssr: false },
);

type TaxonomyResponse = {
  practices: {
    categories: Array<{ id: string; key: string; label: string }>;
  };
  organizerRoles: Array<{ id: string; key: string; label: string }>;
};

export type HostFormState = {
  id: string;
  slug: string;
  name: string;
  descriptionHtml: string;
  websiteUrl: string;
  imageUrl: string;
  tags: string;
  languages: string[];
  city: string;
  countryCodes: string[];
  profileRoleIds: string[];
  practiceCategoryIds: string[];
  status: "draft" | "published" | "archived";
  locations: Array<{
    id: string;
    isPrimary: boolean;
    label: string;
    formattedAddress: string;
    city: string;
    countryCode: string;
    lat: string;
    lng: string;
  }>;
};

export type AdminOrganizerDetailResponse = {
  id: string;
  slug: string;
  name: string;
  description_json: Record<string, unknown>;
  description_html?: string | null;
  website_url: string | null;
  external_url: string | null;
  image_url: string | null;
  avatar_path: string | null;
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
    label: string | null;
    formatted_address: string | null;
    city: string | null;
    country_code: string | null;
    lat: number | null;
    lng: number | null;
  }>;
  status: "draft" | "published" | "archived";
};

export function hostFormStateFromApi(data: AdminOrganizerDetailResponse): HostFormState {
  const descHtml = data.description_html
    ? ensureHtml(data.description_html)
    : mergeLegacyOrganizerDescription(data.description_json);

  const allRoleIds = new Set([
    ...(data.profile_role_ids ?? []),
    ...(data.derived_role_ids ?? []),
  ]);
  const allPracticeIds = new Set([
    ...(data.practice_category_ids ?? []),
    ...(data.derived_practice_category_ids ?? []),
  ]);

  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    descriptionHtml: descHtml,
    websiteUrl: data.website_url ?? "",
    imageUrl: data.avatar_path ?? data.image_url ?? "",
    tags: (data.tags ?? []).join(", "),
    languages: data.languages ?? [],
    city: data.city ?? "",
    countryCodes: data.country_code ? [data.country_code.toUpperCase()] : [],
    profileRoleIds: Array.from(allRoleIds),
    practiceCategoryIds: Array.from(allPracticeIds),
    status: data.status,
    locations: (data.locations ?? []).map((loc) => ({
      id: loc.id,
      isPrimary: loc.is_primary ?? false,
      label: loc.label ?? "",
      formattedAddress: loc.formatted_address ?? "",
      city: loc.city ?? "",
      countryCode: (loc.country_code ?? "").toUpperCase(),
      lat: loc.lat?.toString() ?? "",
      lng: loc.lng?.toString() ?? "",
    })),
  };
}

export function newHostFormState(): HostFormState {
  return {
    id: "",
    slug: "",
    name: "",
    descriptionHtml: "",
    websiteUrl: "",
    imageUrl: "",
    tags: "",
    languages: [],
    city: "",
    countryCodes: [],
    profileRoleIds: [],
    practiceCategoryIds: [],
    status: "draft",
    locations: [],
  };
}

function csvToArray(csv: string): string[] {
  return csv.split(",").map((s) => s.trim()).filter(Boolean);
}

export function HostForm({
  mode,
  initialState,
  extraActions,
  onDelete,
  onStatusChange,
  initialStatusMessage,
}: {
  mode: "create" | "edit";
  initialState?: HostFormState;
  extraActions?: React.ReactNode;
  onDelete?: () => void;
  onStatusChange?: (status: string) => void;
  initialStatusMessage?: string;
}) {
  const { getToken } = useKeycloakAuth();
  const { t, locale } = useI18n();
  const router = useRouter();

  const [form, setForm] = useState<HostFormState>(initialState ?? newHostFormState());
  const [taxonomy, setTaxonomy] = useState<TaxonomyResponse | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(initialStatusMessage ?? "");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [unpublishActiveConfirm, setUnpublishActiveConfirm] = useState(false);
  const [unsavedConfirmOpen, setUnsavedConfirmOpen] = useState(false);
  const pendingForcePayload = useRef<Record<string, unknown> | null>(null);
  const slugManuallyEdited = useRef(false);

  // Tag chip state
  const [tagInput, setTagInput] = useState("");
  const tagList = csvToArray(form.tags);

  function addTag(tag: string) {
    const t = tag.trim().toLowerCase();
    if (!t || tagList.includes(t) || tagList.length >= 5) return;
    update("tags", [...tagList, t].join(", "));
  }

  function removeTag(tag: string) {
    update("tags", tagList.filter((t) => t !== tag).join(", "));
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (tagInput.trim()) {
        addTag(tagInput);
        setTagInput("");
      }
    }
  }

  const savedStatusRef = useRef<string>(initialState?.status ?? "draft");

  function saveMessage(newStatus: string): string {
    const prev = savedStatusRef.current;
    savedStatusRef.current = newStatus;
    if (prev !== newStatus) {
      if (newStatus === "draft") return t("manage.form.savedAsDraft");
      if (newStatus === "published") return t("manage.form.savedAndPublished");
      if (newStatus === "archived") return t("manage.form.savedAndArchived");
    }
    return t("manage.form.saved");
  }

  const savedMessages = [t("manage.form.saved"), t("manage.form.savedAsDraft"), t("manage.form.savedAndPublished"), t("manage.form.savedAndArchived")];
  const isStatusError = status.startsWith(t("manage.form.errorPrefix", { message: "" }).split("{")[0] || "⚠");
  const isStatusSuccess = !!status && !isStatusError && status !== t("manage.form.saving") && status !== t("manage.form.edited");

  const [toastLeaving, setToastLeaving] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(toastTimer.current);
    setToastLeaving(false);
    if (isStatusSuccess) {
      toastTimer.current = setTimeout(() => {
        setToastLeaving(true);
        setTimeout(() => { setStatus(""); setToastLeaving(false); }, 500);
      }, 3000);
    }
    return () => clearTimeout(toastTimer.current);
  }, [status, isStatusSuccess]);

  const update = useCallback(<K extends keyof HostFormState>(key: K, value: HostFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setStatus((prev) => savedMessages.includes(prev) ? "" : prev);
  }, [t]);

  useEffect(() => {
    fetch(`${apiBase}/meta/taxonomies`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: TaxonomyResponse) => setTaxonomy(d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (mode === "create" && !slugManuallyEdited.current) {
      const slug = form.name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      setForm((prev) => ({ ...prev, slug }));
    }
  }, [form.name, mode]);

  const languageOptions: MultiSelectOption[] = useMemo(() => {
    try {
      const names = new Intl.DisplayNames([locale], { type: "language" });
      const codeSet = new Set(COMMON_LANGUAGE_CODES);
      for (const code of form.languages) {
        codeSet.add(code);
      }
      return Array.from(codeSet).map((code) => {
        let label: string;
        try { label = names.of(code) ?? code; } catch { label = code; }
        return { value: code, label };
      }).sort((a, b) => a.label.localeCompare(b.label));
    } catch {
      return COMMON_LANGUAGE_CODES.map((code) => ({ value: code, label: code }));
    }
  }, [form.languages]);

  const roleOptions: MultiSelectOption[] = useMemo(
    () => (taxonomy?.organizerRoles ?? []).map((r) => ({ value: r.id, label: getRoleLabel(r.key, t) })),
    [taxonomy, t],
  );

  const practiceOptions: MultiSelectOption[] = useMemo(
    () => (taxonomy?.practices.categories ?? []).map((c) => ({ value: c.id, label: c.label })),
    [taxonomy],
  );

  function validateForm(): Record<string, string> {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = t("manage.form.required");
    return errors;
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

    const tags = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
    const descText = form.descriptionHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

    const payload: Record<string, unknown> = {
      name: form.name,
      slug: form.slug || undefined,
      descriptionJson: { html: form.descriptionHtml, text: descText },
      descriptionHtml: form.descriptionHtml,
      websiteUrl: form.websiteUrl || null,
      imageUrl: form.imageUrl || null,
      tags,
      languages: form.languages,
      city: form.locations[0]?.city || form.city || null,
      countryCode: form.locations[0]?.countryCode || (form.countryCodes[0] ?? null),
      profileRoleIds: form.profileRoleIds,
      practiceCategoryIds: form.practiceCategoryIds,
      status: mode === "create" ? "draft" : form.status,
      locations: form.locations.map((loc) => ({
        id: loc.id || undefined,
        isPrimary: loc.isPrimary,
        label: loc.label || loc.formattedAddress,
        formattedAddress: loc.formattedAddress,
        city: loc.city || null,
        countryCode: loc.countryCode || null,
        lat: loc.lat ? Number.parseFloat(loc.lat) : null,
        lng: loc.lng ? Number.parseFloat(loc.lng) : null,
      })),
      primaryLocationId: form.locations.find((l) => l.isPrimary)?.id ?? form.locations[0]?.id ?? null,
    };

    try {
      let resultId: string;
      let resultSlug: string;

      if (mode === "create") {
        const result = await authorizedPost<{ id: string; slug: string }>(getToken, "/organizers", payload);
        resultId = result.id;
        resultSlug = result.slug;
      } else {
        const result = await authorizedPatch<{ id: string; slug: string }>(getToken, `/organizers/${form.id}`, payload);
        resultId = result.id;
        resultSlug = result.slug;
      }

      if (avatarFile) {
        await authorizedUpload(getToken, "organizerAvatar", resultId, avatarFile);
      }

      if (mode === "create") {
        router.replace(`/manage/hosts/${resultId}?saved=draft`);
      } else {
        setStatus(saveMessage(form.status));
        onStatusChange?.(form.status);
      }
    } catch (err) {
      if (err instanceof Error && err.message === "host_has_active_events") {
        pendingForcePayload.current = payload;
        setUnpublishActiveConfirm(true);
      } else {
        setStatus(t("manage.form.errorPrefix", { message: err instanceof Error ? err.message : t("manage.form.unknownError") }));
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleForceUnpublishRetry() {
    const payload = pendingForcePayload.current;
    if (!payload) return;
    pendingForcePayload.current = null;
    setSaving(true);
    try {
      const result = await authorizedPatch<{ id: string; slug: string }>(getToken, `/organizers/${form.id}`, { ...payload, force: true });
      if (avatarFile) await authorizedUpload(getToken, "organizerAvatar", result.id, avatarFile);
      setStatus(saveMessage(form.status));
      onStatusChange?.(form.status);
    } catch (retryErr) {
      setStatus(t("manage.form.errorPrefix", { message: retryErr instanceof Error ? retryErr.message : t("manage.form.unknownError") }));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAndPublish() {
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
      const tags = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
      const descText = form.descriptionHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

      const payload: Record<string, unknown> = {
        name: form.name,
        slug: form.slug || undefined,
        descriptionJson: { html: form.descriptionHtml, text: descText },
        descriptionHtml: form.descriptionHtml,
        websiteUrl: form.websiteUrl || null,
        imageUrl: form.imageUrl || null,
        tags,
        languages: form.languages,
        city: form.locations[0]?.city || form.city || null,
        countryCode: form.locations[0]?.countryCode || (form.countryCodes[0] ?? null),
        profileRoleIds: form.profileRoleIds,
        practiceCategoryIds: form.practiceCategoryIds,
        status: "published",
        locations: form.locations.map((loc) => ({
          id: loc.id || undefined,
          isPrimary: loc.isPrimary,
          label: loc.label || loc.formattedAddress,
          formattedAddress: loc.formattedAddress,
          city: loc.city || null,
          countryCode: loc.countryCode || null,
          lat: loc.lat ? Number.parseFloat(loc.lat) : null,
          lng: loc.lng ? Number.parseFloat(loc.lng) : null,
        })),
        primaryLocationId: form.locations.find((l) => l.isPrimary)?.id ?? form.locations[0]?.id ?? null,
      };

      const result = await authorizedPost<{ id: string; slug: string }>(getToken, "/organizers", payload);
      if (avatarFile) {
        await authorizedUpload(getToken, "organizerAvatar", result.id, avatarFile);
      }
      savedStatusRef.current = "published";
      setStatus(t("manage.form.savedAndPublished"));
      router.push(`/hosts/${result.slug}`);
    } catch (err) {
      setStatus(t("manage.form.errorPrefix", { message: err instanceof Error ? err.message : t("manage.form.unknownError") }));
    } finally {
      setSaving(false);
    }
  }

  function setLocationPrimary(index: number) {
    update("locations", form.locations.map((loc, i) => ({ ...loc, isPrimary: i === index })));
  }

  function updateLocationField(index: number, field: string, value: string) {
    setForm((prev) => ({
      ...prev,
      locations: prev.locations.map((loc, i) => i === index ? { ...loc, [field]: value } : loc),
    }));
    setStatus((prev) => savedMessages.includes(prev) ? "" : prev);
  }

  function removeLocation(index: number) {
    const updated = form.locations.filter((_, i) => i !== index);
    // If we removed the primary, make the first remaining one primary
    if (updated.length > 0 && !updated.some((l) => l.isPrimary)) {
      updated[0].isPrimary = true;
    }
    update("locations", updated);
  }

  return (
    <form className="manage-form" onSubmit={(e) => void handleSubmit(e)}>
      <div className="manage-form-section">
        <h3>{t("manage.form.basicDetails")}</h3>
        <div id="field-name">
          <label>{t("manage.hostForm.name")} <span className="field-required-mark">*</span></label>
          <input
            value={form.name}
            onChange={(e) => { update("name", e.target.value); if (fieldErrors.name) setFieldErrors((p) => ({ ...p, name: "" })); }}
            className={fieldErrors.name ? "field-invalid" : undefined}
          />
          {fieldErrors.name && <span className="field-error">{fieldErrors.name}</span>}
        </div>

        <div>
          <label>{t("manage.form.urlSlug")}</label>
          <input
            value={form.slug}
            onChange={(e) => { slugManuallyEdited.current = true; update("slug", e.target.value); }}
            disabled={mode === "edit"}
            placeholder="auto-generated-from-name"
          />
        </div>

        <div>
          <label>{t("manage.form.description")}</label>
          <RichTextEditor value={form.descriptionHtml} onChange={(html) => update("descriptionHtml", html)} />
        </div>

        <div>
          <label>{t("manage.hostForm.websiteUrl")}</label>
          <input value={form.websiteUrl} onChange={(e) => update("websiteUrl", e.target.value)} placeholder="https://..." />
        </div>
      </div>

      {/* Avatar */}
      <div className="manage-form-section">
        <h3>{t("manage.hostForm.avatarImage")}</h3>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          {form.imageUrl && (
            <img
              src={form.imageUrl.startsWith("http") ? form.imageUrl : `${apiBase.replace("/api", "")}${form.imageUrl}`}
              alt="Avatar"
              style={{ width: 100, height: 100, objectFit: "cover", borderRadius: "50%", flexShrink: 0 }}
            />
          )}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            <input type="file" accept="image/*" onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)} />
            <div>
              <label>{t("manage.form.orPasteImageUrl")}</label>
              <input
                type="url"
                placeholder="https://..."
                value={form.imageUrl}
                onChange={(e) => update("imageUrl", e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Location */}
      <div className="manage-form-section">
        <h3>{t("manage.hostForm.locations")}</h3>
        {form.locations.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
            {form.locations.map((loc, i) => (
              <div
                key={loc.id || i}
                style={{
                  border: `1px solid ${loc.isPrimary ? "var(--accent, #1a73e8)" : "var(--border, #e0e0e0)"}`,
                  borderRadius: 8,
                  padding: 12,
                  background: loc.isPrimary ? "var(--accent-bg, #e8f0fe)" : "var(--surface, #f8f8f8)",
                  position: "relative",
                }}
              >
                <button
                  type="button"
                  onClick={() => removeLocation(i)}
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "1.1rem",
                    color: "var(--muted, #888)",
                    lineHeight: 1,
                    padding: "2px 6px",
                  }}
                  aria-label={t("manage.hostForm.removeLocation")}
                >
                  &times;
                </button>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4, paddingRight: 24 }}>
                  <div className="kv" style={{ gridColumn: "1 / -1" }}>
                    <label>{t("manage.eventForm.address")}</label>
                    <input value={loc.formattedAddress} onChange={(e) => updateLocationField(i, "formattedAddress", e.target.value)} />
                  </div>
                  <div className="kv">
                    <label>{t("manage.eventForm.city")}</label>
                    <input value={loc.city} onChange={(e) => updateLocationField(i, "city", e.target.value)} />
                  </div>
                  <div className="kv">
                    <label>{t("manage.eventForm.country")}</label>
                    <select value={loc.countryCode} onChange={(e) => updateLocationField(i, "countryCode", e.target.value)}>
                      <option value="">{t("manage.eventForm.selectCountry")}</option>
                      {countryOptions.map((c) => (
                        <option key={c.code} value={c.code}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="kv">
                    <label>{t("manage.eventForm.latitude")}</label>
                    <input type="number" step="any" value={loc.lat} onChange={(e) => updateLocationField(i, "lat", e.target.value)} />
                  </div>
                  <div className="kv">
                    <label>{t("manage.eventForm.longitude")}</label>
                    <input type="number" step="any" value={loc.lng} onChange={(e) => updateLocationField(i, "lng", e.target.value)} />
                  </div>
                </div>
                {loc.lat && loc.lng && parseFloat(loc.lat) && parseFloat(loc.lng) && (
                  <div style={{ marginTop: 8, height: 220 }}>
                    <AdminLocationPreviewMap
                      lat={parseFloat(loc.lat)}
                      lng={parseFloat(loc.lng)}
                      onMarkerChange={(lat, lng) => { updateLocationField(i, "lat", lat.toString()); updateLocationField(i, "lng", lng.toString()); }}
                    />
                  </div>
                )}
                <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center" }}>
                  {loc.isPrimary ? (
                    <span className="tag" style={{ fontSize: "0.75rem" }}>{t("manage.hostForm.primary")}</span>
                  ) : (
                    <button
                      type="button"
                      className="ghost-btn"
                      style={{ fontSize: "0.75rem", padding: "2px 8px" }}
                      onClick={() => setLocationPrimary(i)}
                    >
                      {t("manage.hostForm.setAsPrimary")}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <LocationSearchField
          getToken={getToken}
          selectedLabel=""
          onSelect={(loc) => {
            update("locations", [
              ...form.locations,
              {
                id: loc.id,
                isPrimary: form.locations.length === 0,
                label: loc.formatted_address,
                formattedAddress: loc.formatted_address,
                city: loc.city ?? "",
                countryCode: (loc.country_code ?? "").toUpperCase(),
                lat: loc.lat.toString(),
                lng: loc.lng.toString(),
              },
            ]);
          }}
          onClear={() => {}}
        />
      </div>

      {/* Taxonomy */}
      <div className="manage-form-section">
        <h3>{t("manage.form.languages")}</h3>
        <div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
            {languageOptions.map((opt) => {
              const selected = form.languages.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    if (selected) {
                      update("languages", form.languages.filter((v) => v !== opt.value));
                    } else {
                      update("languages", [...form.languages, opt.value]);
                    }
                  }}
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
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tags section hidden for now
      <div className="manage-form-section">
        <h3>Tags</h3>
        <div>
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            onBlur={() => { if (tagInput.trim()) { addTag(tagInput); setTagInput(""); } }}
            placeholder="e.g. salsa, bachata, kizomba (Enter or comma to add)"
          />
          {tagList.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              {tagList.map((tag) => (
                <span
                  key={tag}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    background: "var(--accent-bg, #e8f0fe)",
                    color: "var(--accent, #1a73e8)",
                    padding: "5px 12px",
                    borderRadius: 999,
                    fontSize: "0.88rem",
                    fontWeight: 500,
                  }}
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: "0 0 0 2px", lineHeight: 1, fontSize: "1rem" }}
                    aria-label={`Remove ${tag}`}
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      */}

      <div className="manage-form-section">
        <h3>{t("manage.hostForm.roles")}</h3>
        <div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {roleOptions.map((opt) => {
              const selected = form.profileRoleIds.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    if (selected) {
                      update("profileRoleIds", form.profileRoleIds.filter((v) => v !== opt.value));
                    } else {
                      update("profileRoleIds", [...form.profileRoleIds, opt.value]);
                    }
                  }}
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
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="manage-form-section">
        <h3>{t("manage.hostForm.practiceCategories")}</h3>
        <div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {practiceOptions.map((opt) => {
              const selected = form.practiceCategoryIds.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    if (selected) {
                      update("practiceCategoryIds", form.practiceCategoryIds.filter((v) => v !== opt.value));
                    } else {
                      update("practiceCategoryIds", [...form.practiceCategoryIds, opt.value]);
                    }
                  }}
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
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* This Host's Events (edit mode) */}
      {mode === "edit" && form.id && (
        <HostEventsSection hostId={form.id} getToken={getToken} />
      )}

      {/* Status (edit only) */}
      {mode === "edit" && (
        <div className="manage-form-section">
          <h3>{t("manage.form.status")}</h3>
          <select value={form.status} onChange={(e) => update("status", e.target.value as HostFormState["status"])}>
            <option value="draft">{t("common.status.draft")}</option>
            <option value="published">{t("common.status.published")}</option>
            <option value="archived">{t("common.status.archived")}</option>
          </select>
          <span className="meta" style={{ fontSize: "0.75rem" }}>
            {form.status === "draft" && t("manage.form.statusHint.draft")}
            {form.status === "published" && t("manage.form.statusHint.published")}
            {form.status === "archived" && t("manage.form.statusHint.archived")}
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="manage-form-actions-wrap">
        {status && (
          <div className={`manage-save-toast ${isStatusError ? "manage-save-toast--error" : "manage-save-toast--success"} ${toastLeaving ? "manage-save-toast--leaving" : ""}`}>
            {status}
          </div>
        )}
        <div className="manage-form-actions">
          <button type="submit" className="primary-btn" disabled={saving}>
            {mode === "create" ? t("manage.form.saveDraft") : t("manage.form.save")}
          </button>
          {mode === "create" && (
            <button type="button" className="secondary-btn" disabled={saving} onClick={() => void handleSaveAndPublish()}>
              {t("manage.eventForm.saveAndPublish")}
            </button>
          )}
          <button type="button" className="ghost-btn" onClick={() => router.back()} disabled={saving}>
            {t("manage.form.discardChanges")}
          </button>
          {extraActions}
          {onDelete && (
            <button type="button" className="manage-btn-delete" style={{ padding: "8px 18px", borderRadius: 4, cursor: "pointer", fontWeight: 500, fontSize: "0.9rem" }} onClick={() => setDeleteConfirmOpen(true)} disabled={saving}>
              {t("manage.common.delete")}
            </button>
          )}
          {mode === "edit" && form.slug && (
            <a href={`/hosts/${form.slug}`} target="_blank" rel="noopener noreferrer" className="manage-view-entity-btn">
              {t("manage.form.viewHost")} ↗
            </a>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={deleteConfirmOpen}
        title={t("manage.confirm.title")}
        message={t("manage.hostCard.confirmDelete")}
        confirmLabel={t("common.action.ok")}
        cancelLabel={t("manage.common.cancel")}
        variant="danger"
        onConfirm={() => { setDeleteConfirmOpen(false); onDelete?.(); }}
        onCancel={() => setDeleteConfirmOpen(false)}
      />

      <ConfirmDialog
        open={unpublishActiveConfirm}
        title={t("manage.confirm.title")}
        message={t("manage.hostForm.unpublishHasActiveEventsConfirm")}
        confirmLabel={t("common.action.ok")}
        cancelLabel={t("manage.common.cancel")}
        variant="warning"
        onConfirm={() => { setUnpublishActiveConfirm(false); void handleForceUnpublishRetry(); }}
        onCancel={() => { setUnpublishActiveConfirm(false); setStatus(""); }}
      />
    </form>
  );
}

function HostEventsSection({ hostId, getToken }: { hostId: string; getToken: () => Promise<string | null> }) {
  const { t } = useI18n();
  const [events, setEvents] = useState<Array<{ id: string; title: string; status: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const data = await authorizedGet<{
          items: Array<{ id: string; title: string; status: string }>;
        }>(getToken, `/admin/events?organizerId=${hostId}&pageSize=10`);
        setEvents(data.items);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [hostId, getToken]);

  return (
    <div className="manage-form-section">
      <h3>{t("manage.hostForm.thisHostsEvents")}</h3>
      {loading ? (
        <div className="meta">{t("manage.hostForm.loadingEvents")}</div>
      ) : events.length === 0 ? (
        <div className="meta">{t("manage.hostForm.noEventsLinked")}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {events.map((ev) => (
            <div key={ev.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
              <Link href={`/manage/events/${ev.id}`} style={{ textDecoration: "none", fontSize: "0.9rem" }}>
                {ev.title || "(Untitled)"}
              </Link>
              <span className="meta" style={{ fontSize: "0.75rem" }}>{ev.status}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
        <button
          type="button"
          className="secondary-btn"
          style={{ fontSize: "0.85rem" }}
          onClick={() => setShowUnsavedConfirm(true)}
        >
          {t("manage.hostForm.createEvent")}
        </button>
      </div>
      <ConfirmDialog
        open={showUnsavedConfirm}
        title={t("manage.confirm.title")}
        message={t("manage.hostForm.unsavedWarning")}
        confirmLabel={t("common.action.ok")}
        cancelLabel={t("manage.common.cancel")}
        variant="warning"
        onConfirm={() => { setShowUnsavedConfirm(false); window.location.href = "/manage/events/new"; }}
        onCancel={() => setShowUnsavedConfirm(false)}
      />
    </div>
  );
}
