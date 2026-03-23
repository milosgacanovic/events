"use client";

import { useCallback, useEffect, useState } from "react";

import { useKeycloakAuth } from "../../../../components/auth/KeycloakAuthProvider";
import { useI18n } from "../../../../components/i18n/I18nProvider";
import { AssignToUserModal } from "../../../../components/manage/AssignToUserModal";
import { EventCard } from "../../../../components/manage/EventCard";
import { authorizedDelete, authorizedGet, authorizedPost } from "../../../../lib/manageApi";

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

export default function AdminAllEventsPage() {
  const { getToken } = useKeycloakAuth();
  const { t } = useI18n();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("published");
  const [importFilter, setImportFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [assignEventId, setAssignEventId] = useState<string | null>(null);

  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (search) params.set("q", search);
      if (statusFilter) params.set("status", statusFilter);
      params.set("showUnlisted", "true");
      if (ownerFilter) params.set("ownerFilter", ownerFilter);
      const data = await authorizedGet<EventsResponse>(getToken, `/admin/events?${params}`);
      let items = data.items;
      if (importFilter === "imported") {
        items = items.filter((e) => e.is_imported);
      } else if (importFilter === "manual") {
        items = items.filter((e) => !e.is_imported);
      }
      setEvents(items);
      setTotalItems(data.pagination.totalItems);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("manage.error.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [getToken, page, search, statusFilter, importFilter, ownerFilter, t]);

  useEffect(() => { void load(); }, [load]);

  async function runAction(eventId: string, action: string) {
    try {
      await authorizedPost(getToken, `/events/${eventId}/${action}`, {});
      void load();
    } catch {
      // ignore
    }
  }

  async function handleDelete(eventId: string) {
    if (!confirm(t("manage.admin.events.confirmDelete"))) return;
    try {
      await authorizedDelete(getToken, `/admin/events/${eventId}`);
      void load();
    } catch {
      // ignore
    }
  }

  const pageStart = (page - 1) * pageSize + 1;
  const pageEnd = (page - 1) * pageSize + events.length;

  return (
    <div>
      <h1 className="manage-page-title">{t("manage.admin.events.title")}</h1>

      <div className="manage-filter-bar">
        <input
          placeholder={t("manage.admin.events.searchPlaceholder")}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
          <option value="">{t("manage.admin.events.allStatuses")}</option>
          <option value="draft">{t("common.status.draft")}</option>
          <option value="published">{t("common.status.published")}</option>
          <option value="cancelled">{t("common.status.cancelled")}</option>
          <option value="archived">{t("common.status.archived")}</option>
        </select>
        <select value={importFilter} onChange={(e) => { setImportFilter(e.target.value); setPage(1); }}>
          <option value="">{t("manage.admin.events.allSources")}</option>
          <option value="imported">{t("manage.admin.events.importedOnly")}</option>
          <option value="manual">{t("manage.admin.events.manualOnly")}</option>
        </select>
        <select value={ownerFilter} onChange={(e) => { setOwnerFilter(e.target.value); setPage(1); }}>
          <option value="">{t("manage.admin.events.allOwners")}</option>
          <option value="has_owner">{t("manage.admin.events.hasOwner")}</option>
          <option value="unassigned">{t("manage.admin.events.unassigned")}</option>
        </select>
        {totalItems > 0 && (
          <span className="meta">{t("manage.pagination.showing", { start: pageStart, end: pageEnd, total: totalItems })}</span>
        )}
      </div>

      {error && (
        <div className="manage-empty">
          <p>{error}</p>
          <button type="button" className="secondary-btn" onClick={() => void load()} style={{ marginTop: 8 }}>{t("manage.error.retry")}</button>
        </div>
      )}

      {!error && (
        <>
          <div className={`manage-cards-grid${loading ? " manage-list-loading" : ""}`}>
            {events.map((event) => (
              <EventCard
                key={event.id}
                id={event.id}
                slug={event.slug}
                title={event.title}
                status={event.status}
                isImported={event.is_imported}
                importSource={event.import_source}
                detachedFromImport={event.detached_from_import}
                updatedAt={event.updated_at}
                practiceCategoryLabel={event.practice_category_label}
                eventFormatLabel={event.event_format_label}
                locationCity={event.location_city}
                locationCountry={event.location_country}
                nextOccurrence={event.next_occurrence}
                hostNames={event.host_names}
                createdByName={event.created_by_name}
                onPublish={event.status === "draft" ? () => void runAction(event.id, "publish") : undefined}
                onUnpublish={event.status === "published" ? () => void runAction(event.id, "unpublish") : undefined}
                onCancel={event.status === "published" ? () => void runAction(event.id, "cancel") : undefined}
                onAssign={() => setAssignEventId(event.id)}
                onDelete={() => void handleDelete(event.id)}
              />
            ))}
          </div>
          {loading && events.length === 0 && <div className="manage-loading">{t("manage.common.loading")}</div>}
          {(page > 1 || events.length === pageSize) && (
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              {page > 1 && <button type="button" className="secondary-btn" onClick={() => setPage((p) => p - 1)}>{t("manage.common.previous")}</button>}
              {events.length === pageSize && <button type="button" className="secondary-btn" onClick={() => setPage((p) => p + 1)}>{t("manage.common.next")}</button>}
            </div>
          )}
        </>
      )}
      {assignEventId && (
        <AssignToUserModal
          getToken={getToken}
          entityType="events"
          entityId={assignEventId}
          onAssigned={() => void load()}
          onClose={() => setAssignEventId(null)}
        />
      )}
    </div>
  );
}
