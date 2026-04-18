"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useKeycloakAuth } from "../../../../components/auth/KeycloakAuthProvider";
import { useI18n } from "../../../../components/i18n/I18nProvider";
import { SubsubmenuPortal } from "../../../../components/manage/SubsubmenuPortal";
import { authorizedGet } from "../../../../lib/manageApi";

type ModerationStats = Record<string, Record<string, number>>;

export default function ModerationLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const { getToken } = useKeycloakAuth();
  const [stats, setStats] = useState<ModerationStats>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await authorizedGet<ModerationStats>(getToken, "/admin/moderation/stats");
        if (!cancelled) setStats(s);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [getToken, pathname]);

  function pending(type: string) {
    return stats[type]?.pending ?? 0;
  }

  function linkClass(href: string) {
    return `manage-subsubmenu-link${pathname.startsWith(href) ? " active" : ""}`;
  }

  return (
    <>
      <SubsubmenuPortal>
      <nav className="manage-subsubmenu">
        <Link href="/manage/admin/moderation/comments" className={linkClass("/manage/admin/moderation/comments")}>
          {t("manage.admin.moderation.comments")}{pending("comment") > 0 ? ` (${pending("comment")})` : ""}
        </Link>
        <Link href="/manage/admin/moderation/suggestions" className={linkClass("/manage/admin/moderation/suggestions")}>
          {t("manage.admin.moderation.suggestions")}{pending("edit_suggestion") > 0 ? ` (${pending("edit_suggestion")})` : ""}
        </Link>
        <Link href="/manage/admin/moderation/reports" className={linkClass("/manage/admin/moderation/reports")}>
          {t("manage.admin.moderation.reports")}{pending("report") > 0 ? ` (${pending("report")})` : ""}
        </Link>
        <Link href="/manage/admin/moderation/applications" className={linkClass("/manage/admin/moderation/applications")}>
          {t("manage.admin.moderation.applications")}{pending("application") > 0 ? ` (${pending("application")})` : ""}
        </Link>
        <Link href="/manage/admin/moderation/tag-suggestions" className={linkClass("/manage/admin/moderation/tag-suggestions")}>
          {t("manage.admin.moderation.tagSuggestions")}{pending("tag_suggestion") > 0 ? ` (${pending("tag_suggestion")})` : ""}
        </Link>
        <span className="manage-subsubmenu-sep" aria-hidden="true" />
        <Link href="/manage/admin/moderation/notifications" className={linkClass("/manage/admin/moderation/notifications")}>
          {t("manage.sidebar.notifications")}
        </Link>
        <Link href="/manage/admin/moderation/referrals" className={linkClass("/manage/admin/moderation/referrals")}>
          {t("manage.sidebar.referrals")}
        </Link>
      </nav>
      </SubsubmenuPortal>
      {children}
    </>
  );
}
