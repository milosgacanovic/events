"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useI18n } from "../../components/i18n/I18nProvider";

export function ManageSidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const { t } = useI18n();

  function linkClass(href: string, exact?: boolean) {
    const active = exact ? pathname === href : pathname.startsWith(href);
    return active ? "active" : "";
  }

  return (
    <aside className="manage-sidebar">
      <div className="manage-sidebar-section">
        <div className="manage-sidebar-section-title">{t("manage.sidebar.editor")}</div>
        <Link href="/manage" className={linkClass("/manage", true)}>
          {t("manage.sidebar.dashboard")}
        </Link>
        <Link href="/manage/events" className={linkClass("/manage/events")}>
          {t("manage.sidebar.myEvents")}
        </Link>
        <Link href="/manage/events/new" className={`sub-link ${linkClass("/manage/events/new", true)}`}>
          {t("manage.sidebar.createEvent")}
        </Link>
        <Link href="/manage/hosts" className={linkClass("/manage/hosts")}>
          {t("manage.sidebar.myHosts")}
        </Link>
        <Link href="/manage/hosts/new" className={`sub-link ${linkClass("/manage/hosts/new", true)}`}>
          {t("manage.sidebar.createHost")}
        </Link>
      </div>
      {isAdmin && (
        <>
          <div className="manage-sidebar-divider" />
          <div className="manage-sidebar-section">
            <div className="manage-sidebar-section-title">{t("manage.sidebar.admin")}</div>
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
            <Link href="/manage/admin/applications" className={linkClass("/manage/admin/applications")}>
              {t("manage.sidebar.applications")}
            </Link>
          </div>
        </>
      )}
    </aside>
  );
}
