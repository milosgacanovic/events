"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useKeycloakAuth } from "../auth/KeycloakAuthProvider";
import { RichTextEditor } from "../admin/RichTextEditor";
import { HostLinker, type EventOrganizerRoleDraft } from "./HostLinker";
import { ImportWarningBanner } from "./ImportWarningBanner";
import { LocationSearchField } from "./LocationSearchField";
import { SearchableMultiSelect, type MultiSelectOption } from "./SearchableMultiSelect";
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

  const update = useCallback(<K extends keyof EventFormState>(key: K, value: EventFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Load taxonomy metadata
  useEffect(() => {
    async function load() {
      try {
        const [tax, orgs] = await Promise.all([
          fetch(`${apiBase}/meta/taxonomies`, { cache: "no-store" }).then((r) => r.json()) as Promise<TaxonomyResponse>,
          fetch(`${apiBase}/organizers/search?page=1&pageSize=200`, { cache: "no-store" })
            .then((r) => r.json())
            .then((d: { items: Array<{ id: string; name: string }> }) => d.items),
        ]);
        setTaxonomy(tax);
        setOrganizerOptions(orgs);

        // Auto-select first category/format if creating
        if (mode === "create" && !form.practiceCategoryId && tax.practices.categories.length > 0) {
          update("practiceCategoryId", tax.practices.categories[0].id);
        }
        if (mode === "create" && !form.eventFormatId && tax.eventFormats?.length) {
          update("eventFormatId", tax.eventFormats[0].id);
        }
      } catch {
        // ignore
      }
    }
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Show import warning for imported events that haven't been detached yet
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

      {mode === "edit" && form.slug && (
        <div>
          <label>Slug</label>
          <input value={form.slug} readOnly disabled style={{ color: "var(--muted)" }} />
          <span className="meta" style={{ fontSize: "0.75rem" }}>Auto-generated from title</span>
        </div>
      )}

      <div>
        <label>Description</label>
        <RichTextEditor value={form.descriptionHtml} onChange={(html) => update("descriptionHtml", html)} />
      </div>

      <div>
        <label>External Link</label>
        <input
          value={form.externalUrl}
          onChange={(e) => update("externalUrl", e.target.value)}
          placeholder="https://..."
        />
        <span className="meta" style={{ fontSize: "0.75rem" }}>Link to the event on another platform</span>
      </div>

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
          <input value={form.eventTimezone} onChange={(e) => update("eventTimezone", e.target.value)} />
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
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label>RRULE</label>
              <input value={form.rrule} onChange={(e) => update("rrule", e.target.value)} placeholder="FREQ=WEEKLY;INTERVAL=1" />
            </div>
            <div>
              <label>Start (local)</label>
              <input type="datetime-local" value={form.rruleDtstartLocal} onChange={(e) => update("rruleDtstartLocal", e.target.value)} />
            </div>
            <div>
              <label>Duration (minutes)</label>
              <input type="number" value={form.durationMinutes} onChange={(e) => update("durationMinutes", e.target.value)} />
            </div>
          </div>
        )}
      </div>

      {/* Location */}
      <div className="manage-form-section">
        <h3>Location</h3>
        <LocationSearchField
          getToken={getToken}
          selectedLabel={form.locationLabel}
          onSelect={(loc) => { update("locationId", loc.id); update("locationLabel", loc.formatted_address); }}
          onClear={() => { update("locationId", null); update("locationLabel", ""); }}
        />
        {form.locationId && form.locationLabel && (
          <div style={{ marginTop: 8, height: 220 }}>
            <AdminLocationPreviewMap
              lat={0}
              lng={0}
              onMarkerChange={() => {}}
            />
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="manage-form-section">
        <h3>Details</h3>
        <div>
          <label>Languages (CSV)</label>
          <input value={form.languages} onChange={(e) => update("languages", e.target.value)} placeholder="en, sr-Latn" />
        </div>
        <div style={{ marginTop: 12 }}>
          <label>Tags (CSV)</label>
          <input value={form.tags} onChange={(e) => update("tags", e.target.value)} placeholder="bachata, kizomba" />
        </div>
        <div style={{ marginTop: 12 }}>
          <label>Visibility</label>
          <select value={form.visibility} onChange={(e) => update("visibility", e.target.value as "public" | "unlisted")}>
            <option value="public">Public</option>
            <option value="unlisted">Unlisted</option>
          </select>
        </div>
      </div>

      {/* Cover Image */}
      <div className="manage-form-section">
        <h3>Cover Image</h3>
        {form.coverImageUrl && (
          <div style={{ marginBottom: 8 }}>
            <img
              src={form.coverImageUrl.startsWith("http") ? form.coverImageUrl : `${apiBase.replace("/api", "")}${form.coverImageUrl}`}
              alt="Cover"
              style={{ maxWidth: 300, maxHeight: 180, objectFit: "cover", borderRadius: 6 }}
            />
          </div>
        )}
        <input type="file" accept="image/*" onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)} />
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
