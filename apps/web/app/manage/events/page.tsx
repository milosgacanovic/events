"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { ROLE_ADMIN } from "@dr-events/shared";

import { useKeycloakAuth } from "../../../components/auth/KeycloakAuthProvider";
import { useI18n } from "../../../components/i18n/I18nProvider";
import { EventCard } from "../../../components/manage/EventCard";
import { authorizedGet, authorizedPost } from "../../../lib/manageApi";
import { apiBase } from "../../../lib/api";

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
  updated_at: string;
  practice_category_label: string | null;
  event_format_label: string | null;
  location_city: string | null;
  location_country: string | null;
  next_occurrence: string | null;
  host_names: string | null;
  created_by_name: string | null;
};

type EventsResponse = {
  items: EventItem[];
  pagination: { page: number; pageSize: number; totalPages: number; totalItems: number };
};

type TaxonomyResponse = {
  practices: {
    categories: Array<{ id: string; key: string; label: string }>;
  };
  eventFormats?: Array<{ id: string; key: string; label: string }>;
};

export default function MyEventsPage() {
  const { getToken, roles } = useKeycloakAuth();
  const { t } = useI18n();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [practiceFilter, setPracticeFilter] = useState("");
  const [formatFilter, setFormatFilter] = useState("");
  const [timeFilter, setTimeFilter] = useState("");
  const [sortBy, setSortBy] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [taxonomy, setTaxonomy] = useState<TaxonomyResponse | null>(null);

  const isAdmin = roles.includes(ROLE_ADMIN);
  const pageSize = 20;

  useEffect(() => {
    fetch(`${apiBase}/meta/taxonomies`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: TaxonomyResponse) => setTaxonomy(d))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ managedBy: "me", page: String(page), pageSize: String(pageSize) });
      if (search) params.set("q", search);
      if (statusFilter) params.set("status", statusFilter);
      if (practiceFilter) params.set("practiceCategoryId", practiceFilter);
      if (formatFilter) params.set("eventFormatId", formatFilter);
      if (timeFilter) params.set("time", timeFilter);
      if (sortBy) params.set("sort", sortBy);
      const data = await authorizedGet<EventsResponse>(getToken, `/admin/events?${params}`);
      setEvents(data.items);
      setTotalItems(data.pagination.totalItems);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load events");
    } finally {
      setLoading(false);
    }
  }, [getToken, page, search, statusFilter, practiceFilter, formatFilter, timeFilter, sortBy]);

  useEffect(() => { void load(); }, [load]);

  async function runAction(eventId: string, action: string) {
    try {
      await authorizedPost(getToken, `/events/${eventId}/${action}`, {});
      void load();
    } catch {
      // ignore
    }
  }

  const pageStart = (page - 1) * pageSize + 1;
  const pageEnd = (page - 1) * pageSize + events.length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 className="manage-page-title" style={{ marginBottom: 0 }}>{t("manage.events.title")}</h1>
        <Link href="/manage/events/new" className="primary-btn">{t("manage.events.createEvent")}</Link>
      </div>

      <div className="manage-filter-bar">
        <input
          placeholder="Search events..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="cancelled">Cancelled</option>
          <option value="archived">Archived</option>
        </select>
        {taxonomy?.practices.categories && taxonomy.practices.categories.length > 0 && (
          <select value={practiceFilter} onChange={(e) => { setPracticeFilter(e.target.value); setPage(1); }}>
            <option value="">All practices</option>
            {taxonomy.practices.categories.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        )}
        {taxonomy?.eventFormats && taxonomy.eventFormats.length > 0 && (
          <select value={formatFilter} onChange={(e) => { setFormatFilter(e.target.value); setPage(1); }}>
            <option value="">All formats</option>
            {taxonomy.eventFormats.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
        )}
        <select value={timeFilter} onChange={(e) => { setTimeFilter(e.target.value); setPage(1); }}>
          <option value="">All time</option>
          <option value="upcoming">Upcoming</option>
          <option value="past">Past</option>
        </select>
        <select value={sortBy} onChange={(e) => { setSortBy(e.target.value); setPage(1); }}>
          <option value="">Recently edited</option>
          <option value="upcoming">Next occurrence</option>
          <option value="created">Recently created</option>
          <option value="title">Title A-Z</option>
        </select>
        {totalItems > 0 && (
          <span className="meta">Showing {pageStart}–{pageEnd} of {totalItems}</span>
        )}
      </div>

      {error && (
        <div className="manage-empty">
          <p>{error}</p>
          <button type="button" className="secondary-btn" onClick={() => void load()} style={{ marginTop: 8 }}>Retry</button>
        </div>
      )}

      {!error && loading ? (
        <div className="manage-loading">Loading events...</div>
      ) : !error && events.length === 0 ? (
        <div className="manage-empty">
          {isAdmin ? (
            <>
              <h3>{t("manage.events.emptyAdmin")}</h3>
              <Link href="/manage/admin/events" className="secondary-btn" style={{ marginTop: 12, display: "inline-block" }}>
                All Events
              </Link>
            </>
          ) : (
            <>
              <h3>{t("manage.events.noEvents")}</h3>
              <p>{t("manage.events.noEventsDescription")}</p>
              <Link href="/manage/events/new" className="primary-btn" style={{ marginTop: 12, display: "inline-block" }}>
                {t("manage.events.createEvent")}
              </Link>
            </>
          )}
        </div>
      ) : !error ? (
        <>
          <div className={`manage-cards-grid${loading ? " manage-list-loading" : ""}`}>
            {events.map((event) => (
              <EventCard
                key={event.id}
                id={event.id}
                slug={event.slug}
                title={event.title}
                status={event.status}
                attendanceMode={event.attendance_mode}
                scheduleKind={event.schedule_kind}
                isImported={event.is_imported}
                importSource={event.import_source}
                detachedFromImport={event.detached_from_import}
                coverImagePath={event.cover_image_path}
                updatedAt={event.updated_at}
                practiceCategoryLabel={event.practice_category_label}
                eventFormatLabel={event.event_format_label}
                locationCity={event.location_city}
                locationCountry={event.location_country}
                nextOccurrence={event.next_occurrence}
                hostNames={event.host_names}
                onPublish={event.status === "draft" ? () => void runAction(event.id, "publish") : undefined}
                onUnpublish={event.status === "published" ? () => void runAction(event.id, "unpublish") : undefined}
                onCancel={event.status === "published" ? () => void runAction(event.id, "cancel") : undefined}
              />
            ))}
          </div>
          {(page > 1 || events.length === pageSize) && (
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              {page > 1 && (
                <button type="button" className="secondary-btn" onClick={() => setPage((p) => p - 1)}>
                  Previous
                </button>
              )}
              {events.length === pageSize && (
                <button type="button" className="secondary-btn" onClick={() => setPage((p) => p + 1)}>
                  Next
                </button>
              )}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
