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

export function AdminConsole() {
  const { ready, authenticated, roles, userName, authError, login, logout, getToken } = useKeycloakAuth();

  const [taxonomy, setTaxonomy] = useState<TaxonomyResponse | null>(null);
  const [organizerOptions, setOrganizerOptions] = useState<OrganizerOption[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);

  const [status, setStatus] = useState<string>("");

  const [organizerName, setOrganizerName] = useState("");
  const [organizerWebsite, setOrganizerWebsite] = useState("");
  const [organizerLanguages, setOrganizerLanguages] = useState("en");
  const [organizerTags, setOrganizerTags] = useState("");

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

  const [practiceCategoryId, setPracticeCategoryId] = useState("");
  const [practiceSubcategoryId, setPracticeSubcategoryId] = useState("");
  const [selectedOrganizerId, setSelectedOrganizerId] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");

  const [createdEventId, setCreatedEventId] = useState<string | null>(null);

  const hasEditorRole = useMemo(
    () => roles.includes("dr_events_editor") || roles.includes("dr_events_admin"),
    [roles],
  );

  useEffect(() => {
    if (!authenticated) {
      return;
    }

    const run = async () => {
      setLoadingMeta(true);
      try {
        const [taxonomyResult, organizerResult] = await Promise.all([
          fetchJson<TaxonomyResponse>("/meta/taxonomies"),
          fetchJson<{ items: OrganizerOption[] }>("/organizers/search?page=1&pageSize=50"),
        ]);

        setTaxonomy(taxonomyResult);
        setOrganizerOptions(organizerResult.items);

        if (!practiceCategoryId && taxonomyResult.practices.categories[0]) {
          setPracticeCategoryId(taxonomyResult.practices.categories[0].id);
        }
        if (!selectedRoleId && taxonomyResult.organizerRoles[0]) {
          setSelectedRoleId(taxonomyResult.organizerRoles[0].id);
        }
      } catch (error) {
        setStatus(
          error instanceof Error ? `Failed to load metadata: ${error.message}` : "Failed to load metadata",
        );
      } finally {
        setLoadingMeta(false);
      }
    };

    void run();
  }, [authenticated]);

  const selectedCategory = taxonomy?.practices.categories.find((category) => category.id === practiceCategoryId);

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

      setOrganizerOptions((prev) => [organizer, ...prev]);
      setSelectedOrganizerId(organizer.id);
      setStatus(`Organizer created: ${organizer.name} (${organizer.slug})`);
      setOrganizerName("");
      setOrganizerWebsite("");
      setOrganizerTags("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Organizer creation failed");
    }
  }

  async function createEventSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("Creating event draft...");

    try {
      const organizerRoles =
        selectedOrganizerId && selectedRoleId
          ? [
              {
                organizerId: selectedOrganizerId,
                roleId: selectedRoleId,
                displayOrder: 0,
              },
            ]
          : [];

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
        organizerRoles,
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

      setCreatedEventId(created.id);
      setStatus(`Event draft created: ${created.title} (${created.slug})`);
      setEventTitle("");
      setEventTags("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Event creation failed");
    }
  }

  async function publishEvent() {
    if (!createdEventId) {
      return;
    }

    setStatus("Publishing event...");

    try {
      await authorizedRequest(`/events/${createdEventId}/publish`, "POST", {});
      setStatus(`Event published: ${createdEventId}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Event publish failed");
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

          <button className="primary-btn" type="submit" disabled={!hasEditorRole}>
            Create Event Draft
          </button>

          <button
            className="secondary-btn"
            type="button"
            disabled={!hasEditorRole || !createdEventId}
            onClick={() => void publishEvent()}
          >
            Publish Last Created Event
          </button>
        </form>
      </div>

      <div className="admin-status">{status || "No actions yet."}</div>
    </section>
  );
}
