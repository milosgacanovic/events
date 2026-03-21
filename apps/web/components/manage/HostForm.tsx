"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useKeycloakAuth } from "../auth/KeycloakAuthProvider";
import { RichTextEditor } from "../admin/RichTextEditor";
import { SearchableMultiSelect, type MultiSelectOption } from "./SearchableMultiSelect";
import { LocationSearchField } from "./LocationSearchField";
import { ensureHtml, mergeLegacyOrganizerDescription } from "../../lib/formUtils";
import { authorizedGet, authorizedPatch, authorizedPost, authorizedUpload } from "../../lib/manageApi";
import { apiBase } from "../../lib/api";

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
    countryCodes: data.country_code ? [data.country_code] : [],
    profileRoleIds: Array.from(allRoleIds),
    practiceCategoryIds: Array.from(allPracticeIds),
    status: data.status,
    locations: (data.locations ?? []).map((loc) => ({
      id: loc.id,
      isPrimary: loc.is_primary ?? false,
      label: loc.label ?? "",
      formattedAddress: loc.formatted_address ?? "",
      city: loc.city ?? "",
      countryCode: loc.country_code ?? "",
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
    languages: ["en"],
    city: "",
    countryCodes: [],
    profileRoleIds: [],
    practiceCategoryIds: [],
    status: "draft",
    locations: [],
  };
}

export function HostForm({
  mode,
  initialState,
}: {
  mode: "create" | "edit";
  initialState?: HostFormState;
}) {
  const { getToken } = useKeycloakAuth();
  const router = useRouter();

  const [form, setForm] = useState<HostFormState>(initialState ?? newHostFormState());
  const [taxonomy, setTaxonomy] = useState<TaxonomyResponse | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const update = useCallback(<K extends keyof HostFormState>(key: K, value: HostFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  useEffect(() => {
    fetch(`${apiBase}/meta/taxonomies`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: TaxonomyResponse) => setTaxonomy(d))
      .catch(() => {});
  }, []);

  const languageOptions: MultiSelectOption[] = useMemo(() => {
    try {
      const names = new Intl.DisplayNames(["en"], { type: "language" });
      return (Intl.supportedValuesOf as (key: string) => string[])("language")
        .slice(0, 200)
        .map((code) => ({ value: code, label: names.of(code) ?? code }));
    } catch {
      return [];
    }
  }, []);

  const countryOptions: MultiSelectOption[] = useMemo(() => {
    try {
      const names = new Intl.DisplayNames(["en"], { type: "region" });
      return (Intl.supportedValuesOf as (key: string) => string[])("region")
        .map((code) => ({ value: code, label: names.of(code) ?? code }));
    } catch {
      return [];
    }
  }, []);

  const roleOptions: MultiSelectOption[] = useMemo(
    () => (taxonomy?.organizerRoles ?? []).map((r) => ({ value: r.id, label: r.label })),
    [taxonomy],
  );

  const practiceOptions: MultiSelectOption[] = useMemo(
    () => (taxonomy?.practices.categories ?? []).map((c) => ({ value: c.id, label: c.label })),
    [taxonomy],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus("");

    try {
      const tags = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
      const descText = form.descriptionHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

      const payload: Record<string, unknown> = {
        name: form.name,
        descriptionJson: { html: form.descriptionHtml, text: descText },
        descriptionHtml: form.descriptionHtml,
        websiteUrl: form.websiteUrl || null,
        tags,
        languages: form.languages,
        city: form.city || null,
        countryCode: form.countryCodes[0] ?? null,
        profileRoleIds: form.profileRoleIds,
        practiceCategoryIds: form.practiceCategoryIds,
        status: mode === "create" ? "published" : form.status,
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

      setStatus("Saved!");
      router.push(`/hosts/${resultSlug}`);
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="manage-form" onSubmit={(e) => void handleSubmit(e)}>
      <div>
        <label>Name</label>
        <input value={form.name} onChange={(e) => update("name", e.target.value)} required />
      </div>

      <div>
        <label>Description</label>
        <RichTextEditor value={form.descriptionHtml} onChange={(html) => update("descriptionHtml", html)} />
      </div>

      <div>
        <label>Website URL</label>
        <input value={form.websiteUrl} onChange={(e) => update("websiteUrl", e.target.value)} placeholder="https://..." />
      </div>

      {/* Location */}
      <div className="manage-form-section">
        <h3>Location</h3>
        <div style={{ marginBottom: 8 }}>
          <label>City</label>
          <input value={form.city} onChange={(e) => update("city", e.target.value)} />
        </div>
        <SearchableMultiSelect
          label="Country"
          options={countryOptions}
          selectedValues={form.countryCodes}
          onChange={(v) => update("countryCodes", v)}
          placeholder="Select country..."
        />
        {form.locations.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <label>Locations</label>
            {form.locations.map((loc, i) => (
              <div key={loc.id || i} className="kv" style={{ gap: 8, marginBottom: 4 }}>
                <span className="meta">{loc.formattedAddress || loc.label || "(No address)"}</span>
                {loc.isPrimary && <span className="tag">Primary</span>}
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => update("locations", form.locations.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 8 }}>
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
                  countryCode: loc.country_code ?? "",
                  lat: loc.lat.toString(),
                  lng: loc.lng.toString(),
                },
              ]);
            }}
            onClear={() => {}}
          />
        </div>
      </div>

      {/* Taxonomy */}
      <div className="manage-form-section">
        <h3>Profile</h3>
        <SearchableMultiSelect
          label="Languages"
          options={languageOptions}
          selectedValues={form.languages}
          onChange={(v) => update("languages", v)}
          placeholder="Select languages..."
        />
        <div style={{ marginTop: 12 }}>
          <label>Tags (CSV)</label>
          <input value={form.tags} onChange={(e) => update("tags", e.target.value)} placeholder="bachata, kizomba" />
        </div>
        <div style={{ marginTop: 12 }}>
          <SearchableMultiSelect
            label="Roles"
            options={roleOptions}
            selectedValues={form.profileRoleIds}
            onChange={(v) => update("profileRoleIds", v)}
            placeholder="Select roles..."
          />
        </div>
        <div style={{ marginTop: 12 }}>
          <SearchableMultiSelect
            label="Practice Categories"
            options={practiceOptions}
            selectedValues={form.practiceCategoryIds}
            onChange={(v) => update("practiceCategoryIds", v)}
            placeholder="Select categories..."
          />
        </div>
      </div>

      {/* This Host's Events (edit mode) */}
      {mode === "edit" && form.id && (
        <HostEventsSection hostId={form.id} getToken={getToken} />
      )}

      {/* Avatar */}
      <div className="manage-form-section">
        <h3>Avatar Image</h3>
        {form.imageUrl && (
          <div style={{ marginBottom: 8 }}>
            <img
              src={form.imageUrl.startsWith("http") ? form.imageUrl : `${apiBase.replace("/api", "")}${form.imageUrl}`}
              alt="Avatar"
              style={{ maxWidth: 120, maxHeight: 120, objectFit: "cover", borderRadius: "50%" }}
            />
          </div>
        )}
        <input type="file" accept="image/*" onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)} />
        <div style={{ marginTop: 8 }}>
          <label>Or paste an image URL</label>
          <input
            type="url"
            placeholder="https://..."
            value={form.imageUrl}
            onChange={(e) => update("imageUrl", e.target.value)}
          />
        </div>
      </div>

      {/* Status (edit only) */}
      {mode === "edit" && (
        <div className="manage-form-section">
          <h3>Status</h3>
          <select value={form.status} onChange={(e) => update("status", e.target.value as HostFormState["status"])}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      )}

      {/* Actions */}
      <div className="manage-form-actions">
        <button type="submit" className="primary-btn" disabled={saving}>
          {saving ? "Saving..." : mode === "create" ? "Create Host" : "Update Host"}
        </button>
        <button type="button" className="ghost-btn" onClick={() => router.back()} disabled={saving}>
          Cancel
        </button>
      </div>

      {status && <div className="meta" style={{ padding: "8px 0" }}>{status}</div>}
    </form>
  );
}

function HostEventsSection({ hostId, getToken }: { hostId: string; getToken: () => Promise<string | null> }) {
  const [events, setEvents] = useState<Array<{ id: string; title: string; status: string }>>([]);
  const [loading, setLoading] = useState(true);

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
      <h3>This Host&apos;s Events</h3>
      {loading ? (
        <div className="meta">Loading events...</div>
      ) : events.length === 0 ? (
        <div className="meta">No events linked to this host yet.</div>
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
        <Link href="/manage/events/new" className="secondary-btn" style={{ fontSize: "0.85rem" }}>
          + Create event
        </Link>
      </div>
    </div>
  );
}
