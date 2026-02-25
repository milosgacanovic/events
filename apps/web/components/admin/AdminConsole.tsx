"use client";

import { useEffect, useMemo, useState } from "react";

import { apiBase, fetchJson } from "../../lib/api";
import { useKeycloakAuth } from "../auth/KeycloakAuthProvider";

type TaxonomyResponse = {
  uiLabels: {
    practiceCategory: string;
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
};

type OrganizerOption = {
  id: string;
  slug: string;
  name: string;
};

type AdminEvent = {
  id: string;
  slug: string;
  title: string;
  status: "draft" | "published" | "cancelled" | "archived";
  attendance_mode: string;
  schedule_kind: string;
  updated_at: string;
  published_at: string | null;
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
  attendance_mode: "in_person" | "online" | "hybrid";
  online_url: string | null;
  practice_category_id: string;
  practice_subcategory_id: string | null;
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
  organizer_roles: Array<{
    organizer_id: string;
    role_id: string;
    display_order: number;
  }>;
  location_id: string | null;
};

type AdminOrganizerDetailResponse = {
  id: string;
  slug: string;
  name: string;
  website_url: string | null;
  tags: string[];
  languages: string[];
  status: "draft" | "published" | "archived";
};

type EventEditorState = {
  id: string;
  slug: string;
  title: string;
  attendanceMode: "in_person" | "online" | "hybrid";
  onlineUrl: string;
  practiceCategoryId: string;
  practiceSubcategoryId: string;
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
};

type OrganizerEditorState = {
  id: string;
  slug: string;
  name: string;
  websiteUrl: string;
  tags: string;
  languages: string;
  status: "draft" | "published" | "archived";
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

export function AdminConsole() {
  const { ready, authenticated, roles, userName, authError, login, logout, getToken } = useKeycloakAuth();

  const [taxonomy, setTaxonomy] = useState<TaxonomyResponse | null>(null);
  const [organizerOptions, setOrganizerOptions] = useState<OrganizerOption[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [loadingAdminContent, setLoadingAdminContent] = useState(false);
  const [adminEvents, setAdminEvents] = useState<AdminEvent[]>([]);
  const [adminOrganizers, setAdminOrganizers] = useState<AdminOrganizer[]>([]);

  const [status, setStatus] = useState<string>("");

  const [organizerName, setOrganizerName] = useState("");
  const [organizerWebsite, setOrganizerWebsite] = useState("");
  const [organizerLanguages, setOrganizerLanguages] = useState("en");
  const [organizerTags, setOrganizerTags] = useState("");
  const [organizerAvatarFile, setOrganizerAvatarFile] = useState<File | null>(null);

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

  const [practiceCategoryId, setPracticeCategoryId] = useState("");
  const [practiceSubcategoryId, setPracticeSubcategoryId] = useState("");
  const [selectedOrganizerId, setSelectedOrganizerId] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [eventOrganizerRoles, setEventOrganizerRoles] = useState<EventOrganizerRoleDraft[]>([]);

  const [createdEventId, setCreatedEventId] = useState<string | null>(null);
  const [practiceCreateLevel, setPracticeCreateLevel] = useState<"1" | "2">("1");
  const [practiceCreateParentId, setPracticeCreateParentId] = useState("");
  const [practiceCreateKey, setPracticeCreateKey] = useState("");
  const [practiceCreateLabel, setPracticeCreateLabel] = useState("");
  const [roleCreateKey, setRoleCreateKey] = useState("");
  const [roleCreateLabel, setRoleCreateLabel] = useState("");
  const [eventEditor, setEventEditor] = useState<EventEditorState | null>(null);
  const [organizerEditor, setOrganizerEditor] = useState<OrganizerEditorState | null>(null);
  const [loadingEventEditor, setLoadingEventEditor] = useState(false);
  const [loadingOrganizerEditor, setLoadingOrganizerEditor] = useState(false);

  const hasEditorRole = useMemo(
    () => roles.includes("dr_events_editor") || roles.includes("dr_events_admin"),
    [roles],
  );
  const hasAdminRole = useMemo(() => roles.includes("dr_events_admin"), [roles]);
  const organizerNamesById = useMemo(
    () => new Map(organizerOptions.map((organizer) => [organizer.id, organizer.name])),
    [organizerOptions],
  );
  const roleLabelsById = useMemo(
    () => new Map((taxonomy?.organizerRoles ?? []).map((role) => [role.id, role.label])),
    [taxonomy],
  );

  async function loadMetadata() {
    setLoadingMeta(true);
    try {
      const [taxonomyResult, organizerResult] = await Promise.all([
        fetchJson<TaxonomyResponse>("/meta/taxonomies"),
        fetchJson<{ items: OrganizerOption[] }>("/organizers/search?page=1&pageSize=50"),
      ]);

      setTaxonomy(taxonomyResult);
      setOrganizerOptions(organizerResult.items);

      setPracticeCategoryId((current) => current || taxonomyResult.practices.categories[0]?.id || "");
      setSelectedRoleId((current) => current || taxonomyResult.organizerRoles[0]?.id || "");
      if (practiceCreateLevel === "2" && !practiceCreateParentId && taxonomyResult.practices.categories[0]) {
        setPracticeCreateParentId(taxonomyResult.practices.categories[0].id);
      }
    } catch (error) {
      setStatus(
        error instanceof Error ? `Failed to load metadata: ${error.message}` : "Failed to load metadata",
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
  }, [authenticated, hasEditorRole]);

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
      throw new Error("No auth token available. Log in again.");
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
      throw new Error("No auth token available. Log in again.");
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
      throw new Error("No auth token available. Log in again.");
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

  async function loadAdminContent() {
    if (!hasEditorRole) {
      setAdminEvents([]);
      setAdminOrganizers([]);
      return;
    }

    setLoadingAdminContent(true);
    try {
      const [eventsResult, organizersResult] = await Promise.all([
        authorizedGet<{ items: AdminEvent[] }>("/admin/events?page=1&pageSize=20"),
        authorizedGet<{ items: AdminOrganizer[] }>("/admin/organizers?page=1&pageSize=20"),
      ]);

      setAdminEvents(eventsResult.items);
      setAdminOrganizers(organizersResult.items);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to load admin lists");
    } finally {
      setLoadingAdminContent(false);
    }
  }

  async function createOrganizerSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("Creating organizer...");

    try {
      const organizer = await authorizedRequest<{ id: string; slug: string; name: string }>(
        "/organizers",
        "POST",
        {
          name: organizerName,
          descriptionJson: { time: Date.now(), blocks: [] },
          websiteUrl: organizerWebsite || null,
          tags: csvToArray(organizerTags),
          languages: csvToArray(organizerLanguages),
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
      setStatus(`Organizer created: ${organizer.name} (${organizer.slug})`);
      setOrganizerName("");
      setOrganizerWebsite("");
      setOrganizerTags("");
      setOrganizerAvatarFile(null);
      await loadAdminContent();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Organizer creation failed");
    }
  }

  async function createEventSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("Creating event draft...");

    try {
      const payload: Record<string, unknown> = {
        title: eventTitle,
        descriptionJson: { time: Date.now(), blocks: [] },
        attendanceMode,
        practiceCategoryId,
        practiceSubcategoryId: practiceSubcategoryId || null,
        tags: csvToArray(eventTags),
        languages: csvToArray(eventLanguages),
        scheduleKind,
        eventTimezone,
        visibility: "public",
        organizerRoles: eventOrganizerRoles,
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
      setStatus(`Event draft created: ${created.title} (${created.slug})`);
      setEventTitle("");
      setEventTags("");
      setEventCoverFile(null);
      setEventOrganizerRoles([]);
      await loadAdminContent();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Event creation failed");
    }
  }

  function addOrganizerRoleToDraft() {
    if (!selectedOrganizerId || !selectedRoleId) {
      setStatus("Select both organizer and role before adding.");
      return;
    }

    setEventOrganizerRoles((previous) => {
      const exists = previous.some(
        (item) =>
          item.organizerId === selectedOrganizerId &&
          item.roleId === selectedRoleId,
      );

      if (exists) {
        setStatus("That organizer + role pair is already attached.");
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
    const actionLabel =
      action === "publish" ? "Publishing" : action === "unpublish" ? "Unpublishing" : "Cancelling";
    setStatus(`${actionLabel} event...`);

    try {
      await authorizedRequest(`/events/${eventId}/${action}`, "POST", {});
      setStatus(`Event ${action} complete: ${eventId}`);
      await loadAdminContent();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : `Event ${action} failed`);
    }
  }

  async function updateOrganizerStatus(
    organizerId: string,
    nextStatus: "draft" | "published" | "archived",
  ) {
    setStatus(`Updating organizer status to ${nextStatus}...`);

    try {
      await authorizedRequest(`/organizers/${organizerId}`, "PATCH", {
        status: nextStatus,
      });
      await Promise.all([loadAdminContent(), loadMetadata()]);
      setStatus(`Organizer status updated: ${organizerId} -> ${nextStatus}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Organizer status update failed");
    }
  }

  async function loadEventForEdit(eventId: string) {
    setLoadingEventEditor(true);
    setStatus("Loading event for edit...");

    try {
      const detail = await authorizedGet<AdminEventDetailResponse>(`/admin/events/${eventId}`);
      setEventEditor({
        id: detail.id,
        slug: detail.slug,
        title: detail.title,
        attendanceMode: detail.attendance_mode,
        onlineUrl: detail.online_url ?? "",
        practiceCategoryId: detail.practice_category_id,
        practiceSubcategoryId: detail.practice_subcategory_id ?? "",
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
      });
      setStatus(`Loaded event for edit: ${detail.title} (${detail.slug})`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to load event editor");
    } finally {
      setLoadingEventEditor(false);
    }
  }

  async function saveEventEdits(event: React.FormEvent) {
    event.preventDefault();
    if (!eventEditor) {
      return;
    }

    setStatus("Saving event changes...");

    try {
      const payload: Record<string, unknown> = {
        title: eventEditor.title,
        attendanceMode: eventEditor.attendanceMode,
        onlineUrl: eventEditor.onlineUrl || null,
        practiceCategoryId: eventEditor.practiceCategoryId,
        practiceSubcategoryId: eventEditor.practiceSubcategoryId || null,
        tags: csvToArray(eventEditor.tags),
        languages: csvToArray(eventEditor.languages),
        scheduleKind: eventEditor.scheduleKind,
        eventTimezone: eventEditor.eventTimezone,
        visibility: eventEditor.visibility,
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

      await authorizedRequest(`/events/${eventEditor.id}`, "PATCH", payload);
      await loadAdminContent();
      setStatus(`Event updated: ${eventEditor.id}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to save event changes");
    }
  }

  async function loadOrganizerForEdit(organizerId: string) {
    setLoadingOrganizerEditor(true);
    setStatus("Loading organizer for edit...");

    try {
      const detail = await authorizedGet<AdminOrganizerDetailResponse>(`/admin/organizers/${organizerId}`);
      setOrganizerEditor({
        id: detail.id,
        slug: detail.slug,
        name: detail.name,
        websiteUrl: detail.website_url ?? "",
        tags: detail.tags.join(", "),
        languages: detail.languages.join(", "),
        status: detail.status,
      });
      setStatus(`Loaded organizer for edit: ${detail.name} (${detail.slug})`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to load organizer editor");
    } finally {
      setLoadingOrganizerEditor(false);
    }
  }

  async function saveOrganizerEdits(event: React.FormEvent) {
    event.preventDefault();
    if (!organizerEditor) {
      return;
    }

    setStatus("Saving organizer changes...");

    try {
      await authorizedRequest(`/organizers/${organizerEditor.id}`, "PATCH", {
        name: organizerEditor.name,
        websiteUrl: organizerEditor.websiteUrl || null,
        tags: csvToArray(organizerEditor.tags),
        languages: csvToArray(organizerEditor.languages),
        status: organizerEditor.status,
      });
      await Promise.all([loadAdminContent(), loadMetadata()]);
      setStatus(`Organizer updated: ${organizerEditor.id}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to save organizer changes");
    }
  }

  async function createPracticeSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("Creating practice taxonomy item...");

    try {
      const level = Number(practiceCreateLevel) as 1 | 2;
      await authorizedRequest("/admin/practices", "POST", {
        parentId: level === 2 ? practiceCreateParentId || null : null,
        level,
        key: practiceCreateKey,
        label: practiceCreateLabel,
        sortOrder: 0,
        isActive: true,
      });

      setPracticeCreateKey("");
      setPracticeCreateLabel("");
      await loadMetadata();
      await loadAdminContent();
      setStatus("Practice taxonomy item created.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Practice creation failed");
    }
  }

  async function createRoleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("Creating organizer role...");

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
      setStatus("Organizer role created.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Role creation failed");
    }
  }

  if (!ready) {
    return <section className="panel">Initializing auth...</section>;
  }

  if (!authenticated) {
    return (
      <section className="panel cards">
        <h1 className="title-xl">Admin</h1>
        <p className="muted">Log in with Keycloak to use editor/admin actions.</p>
        {authError && <p className="muted">{authError}</p>}
        <button className="primary-btn" type="button" onClick={() => void login()}>
          Log In
        </button>
      </section>
    );
  }

  return (
    <section className="panel cards">
      <div className="admin-header">
        <div>
          <h1 className="title-xl">Admin Console</h1>
          <div className="meta">User: {userName ?? "unknown"}</div>
          <div className="meta">Roles: {roles.join(", ") || "none"}</div>
        </div>
        <button className="ghost-btn" type="button" onClick={() => void logout()}>
          Log Out
        </button>
      </div>

      {!hasEditorRole && (
        <div className="admin-warning">
          Logged in, but this token has no `dr_events_editor` or `dr_events_admin` role.
        </div>
      )}
      {!hasAdminRole && (
        <div className="admin-warning">
          Taxonomy creation requires the `dr_events_admin` role.
        </div>
      )}

      {loadingMeta && <div className="meta">Loading taxonomy metadata...</div>}

      <div className="admin-grid">
        <form className="admin-form" onSubmit={createOrganizerSubmit}>
          <h3>Create Organizer</h3>
          <label>
            Name
            <input
              required
              value={organizerName}
              onChange={(e) => setOrganizerName(e.target.value)}
              placeholder="Organizer name"
            />
          </label>
          <label>
            Website URL
            <input
              value={organizerWebsite}
              onChange={(e) => setOrganizerWebsite(e.target.value)}
              placeholder="https://example.org"
            />
          </label>
          <label>
            Languages (csv)
            <input
              value={organizerLanguages}
              onChange={(e) => setOrganizerLanguages(e.target.value)}
              placeholder="en,es"
            />
          </label>
          <label>
            Tags (csv)
            <input value={organizerTags} onChange={(e) => setOrganizerTags(e.target.value)} />
          </label>
          <label>
            Avatar image (jpg/png/webp)
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setOrganizerAvatarFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <button className="primary-btn" type="submit" disabled={!hasEditorRole}>
            Create Organizer
          </button>
        </form>

        <form className="admin-form" onSubmit={createEventSubmit}>
          <h3>Create Event</h3>
          <label>
            Title
            <input required value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} />
          </label>

          <label>
            Attendance mode
            <select
              value={attendanceMode}
              onChange={(e) => setAttendanceMode(e.target.value as "in_person" | "online" | "hybrid")}
            >
              <option value="in_person">In person</option>
              <option value="online">Online</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </label>

          <label>
            {taxonomy?.uiLabels.practiceCategory ?? "Practice category"}
            <select
              required
              value={practiceCategoryId}
              onChange={(e) => {
                setPracticeCategoryId(e.target.value);
                setPracticeSubcategoryId("");
              }}
            >
              <option value="">Select category</option>
              {taxonomy?.practices.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Subcategory (optional)
            <select value={practiceSubcategoryId} onChange={(e) => setPracticeSubcategoryId(e.target.value)}>
              <option value="">None</option>
              {selectedCategory?.subcategories.map((subcategory) => (
                <option key={subcategory.id} value={subcategory.id}>
                  {subcategory.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Schedule kind
            <select
              value={scheduleKind}
              onChange={(e) => setScheduleKind(e.target.value as "single" | "recurring")}
            >
              <option value="single">Single</option>
              <option value="recurring">Recurring</option>
            </select>
          </label>

          <label>
            Event timezone
            <input value={eventTimezone} onChange={(e) => setEventTimezone(e.target.value)} />
          </label>

          {scheduleKind === "single" ? (
            <>
              <label>
                Start
                <input
                  required
                  type="datetime-local"
                  value={singleStartAt}
                  onChange={(e) => setSingleStartAt(e.target.value)}
                />
              </label>
              <label>
                End
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
                RRULE
                <input value={rrule} onChange={(e) => setRrule(e.target.value)} placeholder="FREQ=WEEKLY;INTERVAL=1" />
              </label>
              <label>
                Recurring start
                <input
                  required
                  type="datetime-local"
                  value={rruleStartLocal}
                  onChange={(e) => setRruleStartLocal(e.target.value)}
                />
              </label>
              <label>
                Duration minutes
                <input
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  placeholder="90"
                />
              </label>
            </>
          )}

          <label>
            Languages (csv)
            <input value={eventLanguages} onChange={(e) => setEventLanguages(e.target.value)} />
          </label>
          <label>
            Tags (csv)
            <input value={eventTags} onChange={(e) => setEventTags(e.target.value)} />
          </label>
          <label>
            Cover image (jpg/png/webp)
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setEventCoverFile(e.target.files?.[0] ?? null)}
            />
          </label>

          <label>
            Link organizer (optional)
            <select value={selectedOrganizerId} onChange={(e) => setSelectedOrganizerId(e.target.value)}>
              <option value="">None</option>
              {organizerOptions.map((organizer) => (
                <option key={organizer.id} value={organizer.id}>
                  {organizer.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Organizer role
            <select value={selectedRoleId} onChange={(e) => setSelectedRoleId(e.target.value)}>
              <option value="">None</option>
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
            Add Organizer Role
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
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <button className="primary-btn" type="submit" disabled={!hasEditorRole}>
            Create Event Draft
          </button>

          <button
            className="secondary-btn"
            type="button"
            disabled={!hasEditorRole || !createdEventId}
            onClick={() => createdEventId && void runEventLifecycleAction(createdEventId, "publish")}
          >
            Publish Last Created Event
          </button>
        </form>

        <form className="admin-form" onSubmit={createPracticeSubmit}>
          <h3>Create Practice Taxonomy</h3>
          <label>
            Level
            <select
              value={practiceCreateLevel}
              onChange={(e) => setPracticeCreateLevel(e.target.value as "1" | "2")}
            >
              <option value="1">Category</option>
              <option value="2">Subcategory</option>
            </select>
          </label>

          {practiceCreateLevel === "2" && (
            <label>
              Parent category
              <select
                value={practiceCreateParentId}
                onChange={(e) => setPracticeCreateParentId(e.target.value)}
              >
                <option value="">Select parent category</option>
                {taxonomy?.practices.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label>
            Key
            <input
              required
              value={practiceCreateKey}
              onChange={(e) => setPracticeCreateKey(e.target.value)}
              placeholder="contact-improv-jam"
            />
          </label>
          <label>
            Label
            <input
              required
              value={practiceCreateLabel}
              onChange={(e) => setPracticeCreateLabel(e.target.value)}
              placeholder="Contact Improv Jam"
            />
          </label>
          <button className="primary-btn" type="submit" disabled={!hasAdminRole}>
            Create Practice Item
          </button>
        </form>

        <form className="admin-form" onSubmit={createRoleSubmit}>
          <h3>Create Organizer Role</h3>
          <label>
            Key
            <input
              required
              value={roleCreateKey}
              onChange={(e) => setRoleCreateKey(e.target.value)}
              placeholder="facilitator"
            />
          </label>
          <label>
            Label
            <input
              required
              value={roleCreateLabel}
              onChange={(e) => setRoleCreateLabel(e.target.value)}
              placeholder="Facilitator"
            />
          </label>
          <button className="primary-btn" type="submit" disabled={!hasAdminRole}>
            Create Role
          </button>
        </form>
      </div>

      <section className="admin-list-grid">
        <div className="admin-form">
          <h3>Recent Events</h3>
          {loadingAdminContent && <div className="meta">Loading admin lists...</div>}
          {!loadingAdminContent && adminEvents.length === 0 && (
            <div className="meta">No events available.</div>
          )}
          {adminEvents.map((item) => (
            <div className="card" key={item.id}>
              <div><strong>{item.title}</strong></div>
              <div className="meta">
                {item.status} | {item.attendance_mode} | {item.schedule_kind}
              </div>
              <div className="meta">Updated: {new Date(item.updated_at).toLocaleString()}</div>
              {hasEditorRole && (
                <div className="admin-card-actions">
                  <button
                    className="secondary-btn"
                    type="button"
                    onClick={() => void loadEventForEdit(item.id)}
                  >
                    Edit
                  </button>
                  {item.status !== "published" && (
                    <button
                      className="secondary-btn"
                      type="button"
                      onClick={() => void runEventLifecycleAction(item.id, "publish")}
                    >
                      Publish
                    </button>
                  )}
                  {(item.status === "published" || item.status === "cancelled") && (
                    <button
                      className="secondary-btn"
                      type="button"
                      onClick={() => void runEventLifecycleAction(item.id, "unpublish")}
                    >
                      Unpublish
                    </button>
                  )}
                  {item.status === "published" && (
                    <button
                      className="secondary-btn"
                      type="button"
                      onClick={() => void runEventLifecycleAction(item.id, "cancel")}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="admin-form">
          <h3>Recent Organizers</h3>
          {loadingAdminContent && <div className="meta">Loading admin lists...</div>}
          {!loadingAdminContent && adminOrganizers.length === 0 && (
            <div className="meta">No organizers available.</div>
          )}
          {adminOrganizers.map((item) => (
            <div className="card" key={item.id}>
              <div><strong>{item.name}</strong></div>
              <div className="meta">{item.status}</div>
              <div className="meta">Updated: {new Date(item.updated_at).toLocaleString()}</div>
              {hasEditorRole && (
                <div className="admin-card-actions">
                  <button
                    className="secondary-btn"
                    type="button"
                    onClick={() => void loadOrganizerForEdit(item.id)}
                  >
                    Edit
                  </button>
                  {item.status !== "published" && (
                    <button
                      className="secondary-btn"
                      type="button"
                      onClick={() => void updateOrganizerStatus(item.id, "published")}
                    >
                      Publish
                    </button>
                  )}
                  {item.status !== "draft" && (
                    <button
                      className="secondary-btn"
                      type="button"
                      onClick={() => void updateOrganizerStatus(item.id, "draft")}
                    >
                      Unpublish
                    </button>
                  )}
                  {hasAdminRole && item.status !== "archived" && (
                    <button
                      className="secondary-btn"
                      type="button"
                      onClick={() => void updateOrganizerStatus(item.id, "archived")}
                    >
                      Archive
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="admin-list-grid">
        <form className="admin-form" onSubmit={(event) => void saveEventEdits(event)}>
          <h3>Edit Event</h3>
          {loadingEventEditor && <div className="meta">Loading event details...</div>}
          {!loadingEventEditor && !eventEditor && (
            <div className="meta">Select an event from Recent Events to edit.</div>
          )}
          {eventEditor && (
            <>
              <div className="meta">Editing: {eventEditor.title} ({eventEditor.slug})</div>
              <label>
                Title
                <input
                  required
                  value={eventEditor.title}
                  onChange={(e) =>
                    setEventEditor((current) => (current ? { ...current, title: e.target.value } : current))
                  }
                />
              </label>
              <label>
                Attendance mode
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
                  <option value="in_person">In person</option>
                  <option value="online">Online</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </label>
              <label>
                Online URL
                <input
                  value={eventEditor.onlineUrl}
                  onChange={(e) =>
                    setEventEditor((current) => (current ? { ...current, onlineUrl: e.target.value } : current))
                  }
                />
              </label>
              <label>
                {taxonomy?.uiLabels.practiceCategory ?? "Practice category"}
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
                  <option value="">Select category</option>
                  {taxonomy?.practices.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Subcategory (optional)
                <select
                  value={eventEditor.practiceSubcategoryId}
                  onChange={(e) =>
                    setEventEditor((current) =>
                      current ? { ...current, practiceSubcategoryId: e.target.value } : current,
                    )
                  }
                >
                  <option value="">None</option>
                  {selectedEditCategory?.subcategories.map((subcategory) => (
                    <option key={subcategory.id} value={subcategory.id}>
                      {subcategory.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Schedule kind
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
                  <option value="single">Single</option>
                  <option value="recurring">Recurring</option>
                </select>
              </label>
              <label>
                Event timezone
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
                    Start
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
                    End
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
                    RRULE
                    <input
                      value={eventEditor.rrule}
                      onChange={(e) =>
                        setEventEditor((current) => (current ? { ...current, rrule: e.target.value } : current))
                      }
                      placeholder="FREQ=WEEKLY;INTERVAL=1"
                    />
                  </label>
                  <label>
                    Recurring start
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
                    Duration minutes
                    <input
                      value={eventEditor.durationMinutes}
                      onChange={(e) =>
                        setEventEditor((current) =>
                          current ? { ...current, durationMinutes: e.target.value } : current,
                        )
                      }
                      placeholder="90"
                    />
                  </label>
                </>
              )}
              <label>
                Languages (csv)
                <input
                  value={eventEditor.languages}
                  onChange={(e) =>
                    setEventEditor((current) => (current ? { ...current, languages: e.target.value } : current))
                  }
                />
              </label>
              <label>
                Tags (csv)
                <input
                  value={eventEditor.tags}
                  onChange={(e) =>
                    setEventEditor((current) => (current ? { ...current, tags: e.target.value } : current))
                  }
                />
              </label>
              <label>
                Visibility
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
                  <option value="public">Public</option>
                  <option value="unlisted">Unlisted</option>
                </select>
              </label>
              <div className="admin-card-actions">
                <button className="primary-btn" type="submit" disabled={!hasEditorRole}>
                  Save Event Changes
                </button>
                <button
                  className="ghost-btn"
                  type="button"
                  onClick={() => setEventEditor(null)}
                >
                  Clear
                </button>
              </div>
            </>
          )}
        </form>

        <form className="admin-form" onSubmit={(event) => void saveOrganizerEdits(event)}>
          <h3>Edit Organizer</h3>
          {loadingOrganizerEditor && <div className="meta">Loading organizer details...</div>}
          {!loadingOrganizerEditor && !organizerEditor && (
            <div className="meta">Select an organizer from Recent Organizers to edit.</div>
          )}
          {organizerEditor && (
            <>
              <div className="meta">Editing: {organizerEditor.name} ({organizerEditor.slug})</div>
              <label>
                Name
                <input
                  required
                  value={organizerEditor.name}
                  onChange={(e) =>
                    setOrganizerEditor((current) => (current ? { ...current, name: e.target.value } : current))
                  }
                />
              </label>
              <label>
                Website URL
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
                Languages (csv)
                <input
                  value={organizerEditor.languages}
                  onChange={(e) =>
                    setOrganizerEditor((current) =>
                      current ? { ...current, languages: e.target.value } : current,
                    )
                  }
                />
              </label>
              <label>
                Tags (csv)
                <input
                  value={organizerEditor.tags}
                  onChange={(e) =>
                    setOrganizerEditor((current) => (current ? { ...current, tags: e.target.value } : current))
                  }
                />
              </label>
              <label>
                Status
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
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
              <div className="admin-card-actions">
                <button className="primary-btn" type="submit" disabled={!hasEditorRole}>
                  Save Organizer Changes
                </button>
                <button
                  className="ghost-btn"
                  type="button"
                  onClick={() => setOrganizerEditor(null)}
                >
                  Clear
                </button>
              </div>
            </>
          )}
        </form>
      </section>

      <div className="admin-status">{status || "No actions yet."}</div>
    </section>
  );
}
