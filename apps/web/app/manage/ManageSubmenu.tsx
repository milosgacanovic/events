"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useI18n } from "../../components/i18n/I18nProvider";

export function ManageSubmenu({
  isAdmin,
}: {
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const { t } = useI18n();

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
          <Link href="/manage/admin/taxonomies" className={linkClass("/manage/admin/taxonomies")}>
            {t("manage.sidebar.taxonomies")}
          </Link>
          <Link href="/manage/admin/moderation" className={linkClass("/manage/admin/moderation")}>
            {t("manage.sidebar.moderation")}
          </Link>
          <Link href="/manage/admin/notifications" className={linkClass("/manage/admin/notifications")}>
            {t("manage.sidebar.notifications")}
          </Link>
          <Link href="/manage/admin/referrals" className={linkClass("/manage/admin/referrals")}>
            {t("manage.sidebar.referrals")}
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
