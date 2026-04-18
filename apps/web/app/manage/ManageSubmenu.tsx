"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useKeycloakAuth } from "../../components/auth/KeycloakAuthProvider";
import { useI18n } from "../../components/i18n/I18nProvider";
import { authorizedGet } from "../../lib/manageApi";

type ModerationStats = Record<string, Record<string, number>>;

export function ManageSubmenu({
  isAdmin,
}: {
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const { t } = useI18n();
  const { getToken } = useKeycloakAuth();
  const [moderationPending, setModerationPending] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    (async () => {
      try {
        const stats = await authorizedGet<ModerationStats>(getToken, "/admin/moderation/stats");
        if (cancelled) return;
        const total = Object.values(stats).reduce(
          (sum, byStatus) => sum + (byStatus?.pending ?? 0),
          0,
        );
        setModerationPending(total);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [isAdmin, getToken, pathname]);

  function linkClass(href: string, exact?: boolean) {
    const active = exact ? pathname === href : pathname.startsWith(href);
    return `manage-submenu-link${active ? " active" : ""}`;
  }

  return (
    <nav className="manage-submenu">
      <Link href="/manage" className={linkClass("/manage", true)}>
        {t("manage.sidebar.dashboard")}
      </Link>
      <Link href="/manage/events" className={linkClass("/manage/events")}>
        {t("manage.sidebar.myEvents")}
      </Link>
      <Link href="/manage/hosts" className={linkClass("/manage/hosts")}>
        {t("manage.sidebar.myHosts")}
      </Link>
      {isAdmin && (
        <>
          <span className="manage-submenu-sep" aria-hidden="true" />
          <Link href="/manage/admin/events" className={linkClass("/manage/admin/events")}>
            {t("manage.sidebar.allEvents")}
          </Link>
          <Link href="/manage/admin/hosts" className={linkClass("/manage/admin/hosts")}>
            {t("manage.sidebar.allHosts")}
          </Link>
          <Link href="/manage/admin/users" className={linkClass("/manage/admin/users")}>
            {t("manage.sidebar.users")}
          </Link>
          <Link href="/manage/admin/config" className={linkClass("/manage/admin/config")}>
            {t("manage.sidebar.config")}
          </Link>
          <Link href="/manage/admin/moderation" className={linkClass("/manage/admin/moderation")}>
            {t("manage.sidebar.moderation")}
            {moderationPending > 0 ? ` (${moderationPending})` : ""}
          </Link>
          <Link href="/manage/admin/logs" className={linkClass("/manage/admin/logs")}>
            {t("manage.sidebar.activityLogs")}
          </Link>
        </>
      )}
      <Link
        href="/profile"
        className={`manage-submenu-link manage-submenu-link--profile${pathname.startsWith("/profile") ? " active" : ""}`}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        <span>{t("manage.sidebar.myProfile")}</span>
      </Link>
    </nav>
  );
}
