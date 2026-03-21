"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useKeycloakAuth } from "../auth/KeycloakAuthProvider";
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

type OrganizerOption = { id: string; name: string };

const COMMON_LANGUAGES: Array<{ code: string; label: string }> = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "nl", label: "Dutch" },
  { code: "pl", label: "Polish" },
  { code: "ru", label: "Russian" },
  { code: "tr", label: "Turkish" },
  { code: "sr-Latn", label: "Serbian" },
  { code: "hr", label: "Croatian" },
  { code: "ar", label: "Arabic" },
  { code: "zh", label: "Chinese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "uk", label: "Ukrainian" },
  { code: "sv", label: "Swedish" },
  { code: "da", label: "Danish" },
  { code: "fi", label: "Finnish" },
  { code: "nb", label: "Norwegian" },
  { code: "el", label: "Greek" },
  { code: "he", label: "Hebrew" },
  { code: "hi", label: "Hindi" },
  { code: "id", label: "Indonesian" },
  { code: "vi", label: "Vietnamese" },
  { code: "th", label: "Thai" },
];

export function EventForm({
  mode,
  initialState,
}: {
  mode: "create" | "edit";
  initialState?: EventFormState;
}) {
  const { getToken } = useKeycloakAuth();
  const router = useRouter();

  const [form, setForm] = useState<EventFormState>(initialState ?? newEventFormState());
  const [taxonomy, setTaxonomy] = useState<TaxonomyResponse | null>(null);
  const [organizerOptions, setOrganizerOptions] = useState<OrganizerOption[]>([]);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [detachConfirmed, setDetachConfirmed] = useState(form.detachedFromImport);
  const [tzSearch, setTzSearch] = useState("");
  const [tagInput, setTagInput] = useState("");

  const slugManuallyEdited = useRef(false);

  const update = useCallback(<K extends keyof EventFormState>(key: K, value: EventFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Auto-generate slug from title in create mode
  useEffect(() => {
    if (mode === "create" && !slugManuallyEdited.current) {
      const generated = form.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      update("slug", generated);
    }
  }, [form.title, mode, update]);

  // Load taxonomy metadata
  useEffect(() => {
    async function load() {
      try {
        const [tax, orgs] = await Promise.all([
          fetch(`${apiBase}/meta/taxonomies`, { cache: "no-store" }).then((r) => r.json()) as Promise<TaxonomyResponse>,
          authorizedGet<{ items: Array<{ id: string; name: string }> }>(getToken, "/admin/organizers?page=1&pageSize=100")
            .then((d) => d.items),
        ]);
        setTaxonomy(tax);
        setOrganizerOptions(orgs);
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

  const organizerNamesById = useMemo(
    () => new Map(organizerOptions.map((o) => [o.id, o.name])),
    [organizerOptions],
  );
  const roleLabelsById = useMemo(
    () => new Map((taxonomy?.organizerRoles ?? []).map((r) => [r.id, r.label])),
    [taxonomy],
  );
  const selectedCategory = useMemo(
    () => taxonomy?.practices.categories.find((c) => c.id === form.practiceCategoryId),
    [taxonomy, form.practiceCategoryId],
  );

  const tagList = useMemo(() => csvToArray(form.tags).filter(Boolean), [form.tags]);
  const languageList = useMemo(() => csvToArray(form.languages).filter(Boolean), [form.languages]);

  function addTag(tag: string) {
    const trimmed = tag.trim();
    if (!trimmed || tagList.includes(trimmed)) return;
    update("tags", [...tagList, trimmed].join(", "));
  }

  function removeTag(tag: string) {
    update("tags", tagList.filter((t) => t !== tag).join(", "));
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagInput);
      setTagInput("");
    }
  }

  function toggleLanguage(code: string) {
    if (languageList.includes(code)) {
      update("languages", languageList.filter((l) => l !== code).join(", "));
    } else {
      update("languages", [...languageList, code].join(", "));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus("");

    try {
      const tags = csvToArray(form.tags);
      const languages = csvToArray(form.languages);

      const payload: Record<string, unknown> = {
        title: form.title,
        descriptionJson: { html: form.descriptionHtml },
        attendanceMode: form.attendanceMode,
        onlineUrl: form.onlineUrl || null,
        externalUrl: form.externalUrl || null,
        practiceCategoryId: form.practiceCategoryId || null,
        practiceSubcategoryId: form.practiceSubcategoryId || null,
        eventFormatId: form.eventFormatId || null,
        tags,
        languages,
        scheduleKind: form.scheduleKind,
        eventTimezone: form.eventTimezone,
        visibility: form.visibility,
        organizerRoles: form.organizerRoles,
        locationId: form.locationId,
      };

      if (mode === "create" && form.slug) {
        payload.slug = form.slug;
      }

      if (detachConfirmed && !form.detachedFromImport) {
        payload.detachedFromImport = true;
      }

      if (form.coverImageUrl && !coverFile) {
        payload.coverImagePath = form.coverImageUrl;
      }

      if (form.scheduleKind === "single") {
        payload.singleStartAt = datetimeLocalToIso(form.singleStartAt);
        payload.singleEndAt = datetimeLocalToIso(form.singleEndAt);
      } else {
        payload.rrule = form.rrule;
        payload.rruleDtstartLocal = form.rruleDtstartLocal;
        payload.durationMinutes = Number.parseInt(form.durationMinutes, 10) || 90;
      }

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

      setStatus("Saved!");
      router.push(`/events/${resultSlug}`);
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (!form.id) return;
    setSaving(true);
    try {
      await authorizedPost(getToken, `/events/${form.id}/publish`, {});
      setStatus("Published!");
      router.push(`/events/${form.slug}`);
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
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
      <div>
        <label>Title</label>
        <input value={form.title} onChange={(e) => update("title", e.target.value)} required />
      </div>

      {/* Slug */}
      {mode === "create" ? (
        <div>
          <label>Slug</label>
          <input
            value={form.slug}
            onChange={(e) => { slugManuallyEdited.current = true; update("slug", e.target.value); }}
            placeholder="auto-generated from title"
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
            <label>Slug</label>
            <input value={form.slug} readOnly disabled style={{ color: "var(--muted)" }} />
          </div>
        )
      )}

      <div>
        <label>Attendance Mode</label>
        <select value={form.attendanceMode} onChange={(e) => update("attendanceMode", e.target.value as EventFormState["attendanceMode"])}>
          <option value="in_person">In Person</option>
          <option value="online">Online</option>
          <option value="hybrid">Hybrid</option>
        </select>
      </div>

      {(form.attendanceMode === "online" || form.attendanceMode === "hybrid") && (
        <div>
          <label>Online URL</label>
          <input value={form.onlineUrl} onChange={(e) => update("onlineUrl", e.target.value)} placeholder="https://..." />
        </div>
      )}

      {taxonomy && (
        <>
          <div>
            <label>{taxonomy.uiLabels.categorySingular ?? "Category"}</label>
            <select value={form.practiceCategoryId} onChange={(e) => { update("practiceCategoryId", e.target.value); update("practiceSubcategoryId", ""); }}>
              <option value="">Select...</option>
              {taxonomy.practices.categories.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>

          {selectedCategory && selectedCategory.subcategories.length > 0 && (
            <div>
              <label>Subcategory</label>
              <select value={form.practiceSubcategoryId} onChange={(e) => update("practiceSubcategoryId", e.target.value)}>
                <option value="">None</option>
                {selectedCategory.subcategories.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>
          )}

          {taxonomy.eventFormats && taxonomy.eventFormats.length > 0 && (
            <div>
              <label>Format</label>
              <select value={form.eventFormatId} onChange={(e) => update("eventFormatId", e.target.value)}>
                <option value="">None</option>
                {taxonomy.eventFormats.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
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
          <strong style={{ fontSize: "0.85rem" }}>Import Information</strong>
          <div className="meta" style={{ marginTop: 4 }}>
            Source: {form.importSource ?? "Unknown"}
            {form.externalId && <span> &middot; External ID: {form.externalId}</span>}
          </div>
          {form.detachedAt && (
            <div className="meta">Detached on {new Date(form.detachedAt).toLocaleDateString()}</div>
          )}
        </div>
      )}

      {/* Schedule */}
      <div className="manage-form-section">
        <h3>Schedule</h3>
        <div>
          <label>Schedule Type</label>
          <select value={form.scheduleKind} onChange={(e) => update("scheduleKind", e.target.value as "single" | "recurring")}>
            <option value="single">Single</option>
            <option value="recurring">Recurring</option>
          </select>
        </div>

        <div style={{ marginTop: 12 }}>
          <label>Timezone</label>
          <input
            placeholder="Search timezone..."
            value={tzSearch}
            onChange={(e) => setTzSearch(e.target.value)}
            style={{ marginBottom: 4 }}
          />
          <select
            value={form.eventTimezone}
            onChange={(e) => { update("eventTimezone", e.target.value); setTzSearch(""); }}
          >
            {!filteredTimezones.includes(form.eventTimezone) && (
              <option value={form.eventTimezone}>{form.eventTimezone}</option>
            )}
            {filteredTimezones.map((tz) => (
              <option key={tz} value={tz}>{tz} ({getTzOffset(tz)})</option>
            ))}
          </select>
        </div>

        {form.scheduleKind === "single" ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
            <div>
              <label>Start</label>
              <input type="datetime-local" value={form.singleStartAt} onChange={(e) => update("singleStartAt", e.target.value)} />
            </div>
            <div>
              <label>End</label>
              <input type="datetime-local" value={form.singleEndAt} onChange={(e) => update("singleEndAt", e.target.value)} />
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 12 }}>
            <RruleBuilder
              rrule={form.rrule}
              dtstartLocal={form.rruleDtstartLocal}
              durationMinutes={form.durationMinutes}
              onChange={(newRrule, newDtstart, newDuration) => {
                update("rrule", newRrule);
                update("rruleDtstartLocal", newDtstart);
                update("durationMinutes", newDuration);
              }}
            />
          </div>
        )}
      </div>

      {/* Location */}
      <div className="manage-form-section">
        <h3>Location</h3>
        <LocationSearchField
          getToken={getToken}
          selectedLabel={form.locationLabel}
          onSelect={(loc) => {
            update("locationId", loc.id);
            update("locationLabel", loc.formatted_address);
            update("locationCity", loc.city ?? "");
            update("locationCountry", loc.country_code ?? "");
            update("locationLat", loc.lat);
            update("locationLng", loc.lng);
            update("locationAddress", loc.formatted_address);
          }}
          onClear={() => {
            update("locationId", null);
            update("locationLabel", "");
            update("locationCity", "");
            update("locationCountry", "");
            update("locationLat", null);
            update("locationLng", null);
            update("locationAddress", "");
          }}
        />
        {form.locationId && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
              <div>
                <label>Venue / Label</label>
                <input value={form.locationLabel} onChange={(e) => update("locationLabel", e.target.value)} />
              </div>
              <div>
                <label>Address</label>
                <input value={form.locationAddress} onChange={(e) => update("locationAddress", e.target.value)} />
              </div>
              <div>
                <label>City</label>
                <input value={form.locationCity} onChange={(e) => update("locationCity", e.target.value)} />
              </div>
              <div>
                <label>Country Code</label>
                <input value={form.locationCountry} onChange={(e) => update("locationCountry", e.target.value)} placeholder="e.g. US, RS" />
              </div>
              <div>
                <label>Latitude</label>
                <input type="number" step="any" value={form.locationLat ?? ""} onChange={(e) => update("locationLat", e.target.value ? parseFloat(e.target.value) : null)} />
              </div>
              <div>
                <label>Longitude</label>
                <input type="number" step="any" value={form.locationLng ?? ""} onChange={(e) => update("locationLng", e.target.value ? parseFloat(e.target.value) : null)} />
              </div>
            </div>
            {form.locationLat != null && form.locationLng != null && (
              <div style={{ marginTop: 8, height: 220 }}>
                <AdminLocationPreviewMap
                  lat={form.locationLat}
                  lng={form.locationLng}
                  onMarkerChange={() => {}}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Description */}
      <div className="manage-form-section">
        <h3>Description</h3>
        <RichTextEditor value={form.descriptionHtml} onChange={(html) => update("descriptionHtml", html)} />
      </div>

      {/* Cover Image */}
      <div className="manage-form-section">
        <h3>Cover Image</h3>
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
          <label>Or paste an image URL</label>
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
        <h3>Details</h3>

        <div>
          <label>Languages</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
            {COMMON_LANGUAGES.map((lang) => (
              <label
                key={lang.code}
                style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontWeight: "normal", fontSize: "0.85rem" }}
              >
                <input
                  type="checkbox"
                  checked={languageList.includes(lang.code)}
                  onChange={() => toggleLanguage(lang.code)}
                  style={{ width: "auto" }}
                />
                {lang.label}
              </label>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <label>Tags</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
            {tagList.map((tag) => (
              <span
                key={tag}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  background: "var(--accent-bg, #e8f0fe)",
                  color: "var(--accent, #1a73e8)",
                  padding: "2px 8px",
                  borderRadius: 12,
                  fontSize: "0.82rem",
                }}
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: "0 0 0 2px", lineHeight: 1, fontSize: "1rem" }}
                  aria-label={`Remove ${tag}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            onBlur={() => { if (tagInput.trim()) { addTag(tagInput); setTagInput(""); } }}
            placeholder="Add tag (Enter or comma)"
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <label>External Link</label>
          <input
            value={form.externalUrl}
            onChange={(e) => update("externalUrl", e.target.value)}
            placeholder="https://..."
          />
          <span className="meta" style={{ fontSize: "0.75rem" }}>Link to the event on another platform</span>
        </div>

        <div style={{ marginTop: 12 }}>
          <label>Visibility</label>
          <select value={form.visibility} onChange={(e) => update("visibility", e.target.value as "public" | "unlisted")}>
            <option value="public">Public</option>
            <option value="unlisted">Unlisted</option>
          </select>
        </div>
      </div>

      {/* Hosts */}
      {taxonomy && (
        <div className="manage-form-section">
          <h3>Hosts</h3>
          <HostLinker
            organizerOptions={organizerOptions}
            roleOptions={taxonomy.organizerRoles}
            roles={form.organizerRoles}
            onChange={(roles) => update("organizerRoles", roles)}
            organizerNamesById={organizerNamesById}
            roleLabelsById={roleLabelsById}
          />
        </div>
      )}

      {/* Actions */}
      <div className="manage-form-actions">
        <button type="submit" className="primary-btn" disabled={saving}>
          {saving ? "Saving..." : mode === "create" ? "Save Draft" : "Update"}
        </button>
        {mode === "create" && (
          <button
            type="button"
            className="secondary-btn"
            disabled={saving}
            onClick={() => void handlePublish()}
            style={{ display: form.id ? undefined : "none" }}
          >
            Publish
          </button>
        )}
        {mode === "edit" && form.id && (
          <button
            type="button"
            className="secondary-btn"
            disabled={saving}
            onClick={() => void handlePublish()}
          >
            Publish
          </button>
        )}
        <button type="button" className="ghost-btn" onClick={() => router.back()} disabled={saving}>
          Cancel
        </button>
      </div>

      {status && <div className="meta" style={{ padding: "8px 0" }}>{status}</div>}
    </form>
  );
}
