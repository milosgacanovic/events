"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useKeycloakAuth } from "../../../../components/auth/KeycloakAuthProvider";
import { useI18n } from "../../../../components/i18n/I18nProvider";
import { authorizedGet } from "../../../../lib/manageApi";

type CountResponse = { pagination: { totalItems: number } };

export default function LogsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const { getToken } = useKeycloakAuth();
  const [activityTotal, setActivityTotal] = useState<number | null>(null);
  const [errorTotal, setErrorTotal] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [a, e] = await Promise.all([
          authorizedGet<CountResponse>(getToken, "/admin/activity-logs?pageSize=1"),
          authorizedGet<CountResponse>(getToken, "/admin/error-logs?pageSize=1"),
        ]);
        if (!cancelled) {
          setActivityTotal(a.pagination.totalItems);
          setErrorTotal(e.pagination.totalItems);
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [getToken, pathname]);

  function linkClass(href: string) {
    return `manage-subsubmenu-link${pathname.startsWith(href) ? " active" : ""}`;
  }

  return (
    <>
      <nav className="manage-subsubmenu">
        <Link href="/manage/admin/logs/activity" className={linkClass("/manage/admin/logs/activity")}>
          {t("manage.admin.logs.activityLog")}{activityTotal !== null ? ` (${activityTotal})` : ""}
        </Link>
        <Link href="/manage/admin/logs/errors" className={linkClass("/manage/admin/logs/errors")}>
          {t("manage.admin.logs.errorLog")}{errorTotal !== null ? ` (${errorTotal})` : ""}
        </Link>
      </nav>
      {children}
    </>
  );
}
