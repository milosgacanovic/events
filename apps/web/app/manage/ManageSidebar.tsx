"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useI18n } from "../../components/i18n/I18nProvider";

export function ManageSidebar({
  isAdmin,
  open,
  onClose,
}: {
  isAdmin: boolean;
  open?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const { t } = useI18n();

  function linkClass(href: string, exact?: boolean) {
    const active = exact ? pathname === href : pathname.startsWith(href);
    return active ? "active" : "";
  }

  function handleLinkClick() {
    onClose?.();
  }

  return (
    <aside className={`manage-sidebar${open ? " open" : ""}`}>
      <div className="manage-sidebar-section">
        <div className="manage-sidebar-section-title">{t("manage.sidebar.editor")}</div>
        <Link href="/manage" className={linkClass("/manage", true)} onClick={handleLinkClick}>
          {t("manage.sidebar.dashboard")}
        </Link>
        <Link href="/manage/events" className={linkClass("/manage/events")} onClick={handleLinkClick}>
          {t("manage.sidebar.myEvents")}
        </Link>
        <Link href="/manage/events/new" className={`sub-link ${linkClass("/manage/events/new", true)}`} onClick={handleLinkClick}>
          {t("manage.sidebar.createEvent")}
        </Link>
        <Link href="/manage/hosts" className={linkClass("/manage/hosts")} onClick={handleLinkClick}>
          {t("manage.sidebar.myHosts")}
        </Link>
        <Link href="/manage/hosts/new" className={`sub-link ${linkClass("/manage/hosts/new", true)}`} onClick={handleLinkClick}>
          {t("manage.sidebar.createHost")}
        </Link>
      </div>
      {isAdmin && (
        <>
          <div className="manage-sidebar-divider" />
          <div className="manage-sidebar-section">
            <div className="manage-sidebar-section-title">{t("manage.sidebar.admin")}</div>
            <Link href="/manage/admin/events" className={linkClass("/manage/admin/events")} onClick={handleLinkClick}>
              {t("manage.sidebar.allEvents")}
            </Link>
            <Link href="/manage/admin/hosts" className={linkClass("/manage/admin/hosts")} onClick={handleLinkClick}>
              {t("manage.sidebar.allHosts")}
            </Link>
            <Link href="/manage/admin/users" className={linkClass("/manage/admin/users")} onClick={handleLinkClick}>
              {t("manage.sidebar.users")}
            </Link>
            <Link href="/manage/admin/taxonomies" className={linkClass("/manage/admin/taxonomies")} onClick={handleLinkClick}>
              {t("manage.sidebar.taxonomies")}
            </Link>
            <Link href="/manage/admin/applications" className={linkClass("/manage/admin/applications")} onClick={handleLinkClick}>
              {t("manage.sidebar.applications")}
            </Link>
          </div>
        </>
      )}
    </aside>
  );
}
