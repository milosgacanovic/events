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
  const [error, setError] = useState("");

  const isAdmin = roles.includes(ROLE_ADMIN);

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const result = await authorizedGet<DashboardData>(getToken, "/manage/dashboard");
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return <div className="manage-loading">{t("common.loading")}</div>;
  }

  if (error) {
    return (
      <div className="manage-empty">
        <p>{error}</p>
        <button type="button" className="secondary-btn" onClick={() => void load()} style={{ marginTop: 12 }}>
          {t("common.action.retry")}
        </button>
      </div>
    );
  }

  const displayName = userName?.split("@")[0] ?? "there";

  return (
    <div>
      <h1 className="manage-page-title">{t("manage.dashboard.welcome", { name: displayName })}</h1>

      {/* Onboarding banner for new editors */}
      {!isAdmin && (data?.hostsCount ?? 0) === 0 && (
        <div className="manage-onboarding-banner">
          <h2>{(data?.totalEventsCount ?? 0) === 0 ? t("manage.onboarding.welcomeTitle") : t("manage.onboarding.needHostTitle")}</h2>
          <p>{(data?.totalEventsCount ?? 0) === 0 ? t("manage.onboarding.welcomeMessage") : t("manage.onboarding.needHostMessage")}</p>
          <Link href="/manage/hosts/new" className="primary-btn">
            {t("manage.onboarding.createFirstHost")}
          </Link>
        </div>
      )}
      {!isAdmin && (data?.hostsCount ?? 0) > 0 && (data?.totalEventsCount ?? 0) === 0 && (
        <div className="manage-onboarding-banner">
          <h2>{t("manage.onboarding.hostReadyTitle")}</h2>
          <p>{t("manage.onboarding.hostReadyMessage")}</p>
          <Link href="/manage/events/new" className="primary-btn">
            {t("manage.onboarding.createFirstEvent")}
          </Link>
        </div>
      )}

      {/* Top stat cards — platform-wide for admins, personal for editors */}
      {isAdmin && data?.admin ? (
        <div className="manage-cards-grid">
          <Link href="/manage/admin/events" className="manage-stat-card" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="stat-value">{data.admin.totalEventsCount}</div>
            <div className="stat-label">{t("manage.dashboard.allEvents")}</div>
          </Link>
          <Link href="/manage/admin/hosts" className="manage-stat-card" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="stat-value">{data.admin.totalHostsCount}</div>
            <div className="stat-label">{t("manage.dashboard.allHosts")}</div>
          </Link>
          <Link href="/manage/admin/users" className="manage-stat-card" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="stat-value">{data.admin.totalUsersCount}</div>
            <div className="stat-label">{t("manage.dashboard.registeredUsers")}</div>
          </Link>
          <Link
            href="/manage/admin/applications"
            className="manage-stat-card"
            style={{
              textDecoration: "none",
              color: "inherit",
              border: data.admin.pendingApplicationsCount > 0 ? "2px solid var(--warning-border, #e6d88a)" : undefined,
            }}
          >
            <div className="stat-value">{data.admin.pendingApplicationsCount}</div>
            <div className="stat-label">{t("manage.dashboard.pendingApplications")}</div>
          </Link>
        </div>
      ) : (
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
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <Link href="/manage/events/new" className="primary-btn">{t("manage.dashboard.createEvent")}</Link>
        <Link href="/manage/hosts/new" className="primary-btn">{t("manage.dashboard.createHost")}</Link>
      </div>

      {/* Recent Activity */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: 12 }}>{t("manage.dashboard.recentActivity")}</h2>
        {data?.recentActivity && data.recentActivity.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.recentActivity.map((item) => (
              <div key={`${item.entityType}-${item.entityId}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 6, backgroundColor: "var(--surface, #f8f8f8)" }}>
                <div>
                  <span className="meta" style={{ marginRight: 6 }}>{t(`manage.dashboard.entityType.${item.entityType}`)}</span>
                  <Link
                    href={item.entityType === "event" ? `/manage/events/${item.entityId}` : `/manage/hosts/${item.entityId}`}
                    style={{ textDecoration: "none", fontWeight: 500 }}
                  >
                    {item.entityName}
                  </Link>
                  <span className="meta" style={{ marginLeft: 8 }}>{t(`manage.dashboard.action.${item.action}`)}</span>
                </div>
                <span className="meta">{new Date(item.activityAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="meta">{t("manage.dashboard.noRecentActivity")}</p>
        )}
      </div>
    </div>
  );
}
