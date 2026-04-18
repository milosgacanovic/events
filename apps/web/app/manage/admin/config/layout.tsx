"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useI18n } from "../../../../components/i18n/I18nProvider";

export default function ConfigLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useI18n();

  const link = (href: string, label: string) => (
    <Link
      key={href}
      href={href}
      className={`manage-subsubmenu-link${pathname.startsWith(href) ? " active" : ""}`}
    >
      {label}
    </Link>
  );

  return (
    <>
      <nav className="manage-subsubmenu">
        {link("/manage/admin/config/dance-practices", t("manage.admin.taxonomies.dancePractices"))}
        {link("/manage/admin/config/event-formats", t("manage.admin.taxonomies.eventFormats"))}
        {link("/manage/admin/config/host-roles", t("manage.admin.taxonomies.hostRoles"))}
        {link("/manage/admin/config/ui-labels", t("manage.admin.taxonomies.uiLabels"))}
      </nav>
      {children}
    </>
  );
}
