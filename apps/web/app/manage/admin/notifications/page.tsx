"use client";

import { useCallback, useEffect, useState } from "react";

import { useKeycloakAuth } from "../../../../components/auth/KeycloakAuthProvider";
import { useI18n } from "../../../../components/i18n/I18nProvider";
import { authorizedGet, authorizedPatch } from "../../../../lib/manageApi";

type Overview = {
  totalAlerts: number;
  activeAlerts: number;
  pausedAlerts: number;
};

type AlertItem = {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  organizerId: string;
  organizerName: string;
  radiusKm: number;
  locationLabel: string | null;
  unsubscribedAt: string | null;
  createdAt: string;
};

type AlertsResponse = {
  items: AlertItem[];
  pagination: { page: number; pageSize: number; totalPages: number; totalItems: number };
};

export default function AdminNotificationsPage() {
  const { getToken } = useKeycloakAuth();
  const { t } = useI18n();

  const [overview, setOverview] = useState<Overview | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", "20");
      if (statusFilter) params.set("status", statusFilter);
      if (search) params.set("q", search);

      const [overviewData, alertsData] = await Promise.all([
        authorizedGet<Overview>(getToken, "/admin/notifications/overview"),
        authorizedGet<AlertsResponse>(getToken, `/admin/notifications/alerts?${params}`),
      ]);
      setOverview(overviewData);
      setAlerts(alertsData.items);
      setTotalItems(alertsData.pagination.totalItems);
    } finally {
      setLoading(false);
    }
  }, [getToken, page, statusFilter, search]);

  useEffect(() => { void load(); }, [load]);

  async function handleAction(id: string, action: "pause" | "resume" | "delete") {
    if (action === "delete" && !confirm(t("manage.admin.notifications.confirmDelete"))) return;
    await authorizedPatch(getToken, `/admin/notifications/alerts/${id}`, { action });
    void load();
  }

  return (
    <div>
      <h1 className="manage-page-title">{t("manage.admin.notifications.title")}</h1>

      {/* Overview stats */}
      {overview && (
        <div className="manage-cards-grid" style={{ marginBottom: 24 }}>
          <div className="manage-stat-card">
            <div className="stat-value">{overview.totalAlerts}</div>
            <div className="stat-label">{t("manage.admin.notifications.totalAlerts")}</div>
          </div>
          <div className="manage-stat-card">
            <div className="stat-value">{overview.activeAlerts}</div>
            <div className="stat-label">{t("manage.admin.notifications.activeAlerts")}</div>
          </div>
          <div className="manage-stat-card">
            <div className="stat-value">{overview.pausedAlerts}</div>
            <div className="stat-label">{t("manage.admin.notifications.pausedAlerts")}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          type="text"
          className="manage-search-input"
          placeholder={t("manage.admin.notifications.searchPlaceholder")}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <div className="manage-status-pills">
          {[
            { value: "", label: t("manage.admin.notifications.allStatuses") },
            { value: "active", label: t("manage.admin.notifications.statusActive") },
            { value: "paused", label: t("manage.admin.notifications.statusPaused") },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              data-active={statusFilter === opt.value}
              onClick={() => { setStatusFilter(opt.value); setPage(1); }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <span className="meta" style={{ marginLeft: "auto", alignSelf: "center" }}>
          {t("manage.pagination.showing", { start: (page - 1) * 20 + 1, end: (page - 1) * 20 + alerts.length, total: totalItems })}
        </span>
      </div>

      {loading ? (
        <div className="manage-loading">{t("manage.common.loading")}</div>
      ) : alerts.length === 0 ? (
        <div className="manage-empty"><h3>{t("manage.admin.notifications.noAlerts")}</h3></div>
      ) : (
        <>
          <div className="manage-table-wrap">
            <table className="manage-table">
              <thead>
                <tr>
                  <th>{t("manage.admin.notifications.user")}</th>
                  <th>{t("manage.admin.notifications.host")}</th>
                  <th>{t("manage.admin.notifications.radius")}</th>
                  <th>{t("manage.admin.notifications.location")}</th>
                  <th>{t("manage.common.status")}</th>
                  <th>{t("manage.admin.notifications.created")}</th>
                  <th className="text-right">{t("manage.admin.users.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((alert) => (
                  <tr key={alert.id}>
                    <td>
                      <div>{alert.userName ?? "\u2014"}</div>
                      {alert.userEmail && <div className="meta" style={{ fontSize: "0.75rem" }}>{alert.userEmail}</div>}
                    </td>
                    <td>{alert.organizerName}</td>
                    <td>{alert.radiusKm} km</td>
                    <td>{alert.locationLabel ?? t("profile.alerts.locationAnywhere")}</td>
                    <td>
                      <span className={`tag tag--${alert.unsubscribedAt ? "paused" : "active"}`} style={{ fontSize: "0.7rem" }}>
                        {alert.unsubscribedAt ? t("manage.admin.notifications.statusPaused") : t("manage.admin.notifications.statusActive")}
                      </span>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{new Date(alert.createdAt).toLocaleDateString()}</td>
                    <td className="text-right">
                      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                        {alert.unsubscribedAt ? (
                          <button type="button" className="secondary-btn" style={{ fontSize: "0.75rem", padding: "2px 8px" }} onClick={() => void handleAction(alert.id, "resume")}>
                            {t("manage.admin.notifications.resume")}
                          </button>
                        ) : (
                          <button type="button" className="secondary-btn" style={{ fontSize: "0.75rem", padding: "2px 8px" }} onClick={() => void handleAction(alert.id, "pause")}>
                            {t("manage.admin.notifications.pause")}
                          </button>
                        )}
                        <button type="button" className="secondary-btn" style={{ fontSize: "0.75rem", padding: "2px 8px", color: "var(--danger, #c53030)" }} onClick={() => void handleAction(alert.id, "delete")}>
                          {t("manage.common.delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="manage-pagination" style={{ marginTop: 12 }}>
            {page > 1 && <button type="button" className="secondary-btn" onClick={() => setPage((p) => p - 1)}>{t("manage.common.previous")}</button>}
            {alerts.length === 20 && <button type="button" className="secondary-btn" onClick={() => setPage((p) => p + 1)}>{t("manage.common.next")}</button>}
          </div>
        </>
      )}
    </div>
  );
}
