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
          <Link href="/manage/admin/applications" className={linkClass("/manage/admin/applications")}>
            {t("manage.sidebar.applications")}
          </Link>
          <Link href="/manage/admin/tags" className={linkClass("/manage/admin/tags")}>
            {t("manage.sidebar.tagSuggestions")}
          </Link>
        </>
      )}
    </nav>
  );
}
