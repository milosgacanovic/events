"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { ROLE_ADMIN } from "@dr-events/shared";

import { useKeycloakAuth } from "../../components/auth/KeycloakAuthProvider";
import { useI18n } from "../../components/i18n/I18nProvider";
import { authorizedGet } from "../../lib/manageApi";

type RecentActivity = {
  entityType: string;
  entityId: string;
  entityName: string;
  action: string;
  activityAt: string;
};

type DashboardData = {
  totalEventsCount: number;
  hostsCount: number;
  upcomingEventsCount: number;
  recentActivity?: RecentActivity[];
  admin?: {
    totalEventsCount: number;
    totalHostsCount: number;
    totalUsersCount: number;
    pendingApplicationsCount: number;
  };
};

export default function ManageDashboard() {
  const { roles, getToken, userName } = useKeycloakAuth();
  const { t } = useI18n();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const isAdmin = roles.includes(ROLE_ADMIN);

  const load = useCallback(async () => {
    try {
      const result = await authorizedGet<DashboardData>(getToken, "/manage/dashboard");
      setData(result);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return <div className="manage-loading">Loading dashboard...</div>;
  }

  const displayName = userName?.split("@")[0] ?? "there";

  return (
    <div>
      <h1 className="manage-page-title">{t("manage.dashboard.welcome", { name: displayName })}</h1>

      <div className="manage-cards-grid">
        <div className="manage-stat-card">
          <div className="stat-value">{data?.upcomingEventsCount ?? 0}</div>
          <div className="stat-label">{t("manage.dashboard.upcomingEvents")}</div>
        </div>
        <div className="manage-stat-card">
          <div className="stat-value">{data?.totalEventsCount ?? 0}</div>
          <div className="stat-label">{t("manage.dashboard.totalEvents")}</div>
        </div>
        <div className="manage-stat-card">
          <div className="stat-value">{data?.hostsCount ?? 0}</div>
          <div className="stat-label">{t("manage.dashboard.myHosts")}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <Link href="/manage/events/new" className="primary-btn">{t("manage.dashboard.createEvent")}</Link>
        <Link href="/manage/hosts/new" className="secondary-btn">{t("manage.dashboard.createHost")}</Link>
      </div>

      {/* Recent Activity */}
      {data?.recentActivity && data.recentActivity.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: 12 }}>{t("manage.dashboard.recentActivity")}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.recentActivity.map((item) => (
              <div key={`${item.entityType}-${item.entityId}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 6, backgroundColor: "var(--surface, #f8f8f8)" }}>
                <div>
                  <Link
                    href={item.entityType === "event" ? `/manage/events/${item.entityId}` : `/manage/hosts/${item.entityId}`}
                    style={{ textDecoration: "none", fontWeight: 500 }}
                  >
                    {item.entityName}
                  </Link>
                  <span className="meta" style={{ marginLeft: 8 }}>{item.action}</span>
                </div>
                <span className="meta">{new Date(item.activityAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isAdmin && data?.admin && (
        <>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: 12 }}>{t("manage.dashboard.platformStats")}</h2>
          <div className="manage-cards-grid">
            <div className="manage-stat-card">
              <div className="stat-value">{data.admin.totalEventsCount}</div>
              <div className="stat-label">{t("manage.dashboard.allEvents")}</div>
            </div>
            <div className="manage-stat-card">
              <div className="stat-value">{data.admin.totalHostsCount}</div>
              <div className="stat-label">{t("manage.dashboard.allHosts")}</div>
            </div>
            <div className="manage-stat-card">
              <div className="stat-value">{data.admin.totalUsersCount}</div>
              <div className="stat-label">{t("manage.dashboard.registeredUsers")}</div>
            </div>
            {data.admin.pendingApplicationsCount > 0 && (
              <Link href="/manage/admin/applications" className="manage-stat-card" style={{ textDecoration: "none", color: "inherit", border: "2px solid var(--warning-border, #e6d88a)" }}>
                <div className="stat-value">{data.admin.pendingApplicationsCount}</div>
                <div className="stat-label">{t("manage.dashboard.pendingApplications")}</div>
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}
