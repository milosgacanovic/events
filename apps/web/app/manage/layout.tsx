"use client";

import { usePathname } from "next/navigation";

import { ROLE_ADMIN, ROLE_EDITOR } from "@dr-events/shared";

import { useKeycloakAuth } from "../../components/auth/KeycloakAuthProvider";
import { useI18n } from "../../components/i18n/I18nProvider";
import { ManageSubmenu } from "./ManageSubmenu";
import "./manage.css";

export default function ManageLayout({ children }: { children: React.ReactNode }) {
  const auth = useKeycloakAuth();
  const { t } = useI18n();
  const pathname = usePathname();

  if (!auth.ready) {
    return <div className="manage-loading">{t("manage.common.loading")}</div>;
  }

  if (!auth.authenticated) {
    // Let /manage/apply render its own login prompt instead of auto-redirecting
    if (pathname === "/manage/apply") {
      return (
        <div style={{ display: "flex", justifyContent: "center", minHeight: "calc(100vh - 60px)", padding: "24px 16px" }}>
          {children}
        </div>
      );
    }
    void auth.login();
    return <div className="manage-loading">{t("manage.apply.redirectingLogin")}</div>;
  }

  const isAdmin = auth.roles.includes(ROLE_ADMIN);
  const isEditor = auth.roles.includes(ROLE_EDITOR) || isAdmin;

  if (!isEditor) {
    if (pathname === "/manage/apply") {
      return (
        <div style={{ display: "flex", justifyContent: "center", minHeight: "calc(100vh - 60px)", padding: "24px 16px" }}>
          {children}
        </div>
      );
    }
    return (
      <div className="manage-layout">
        <div className="manage-main">
          <div className="manage-empty">
            <h3>{t("manage.auth.editorRequired")}</h3>
            <p>{t("manage.auth.editorMessage")}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="manage-layout">
      <ManageSubmenu isAdmin={isAdmin} />
      <div className="manage-main">
        {children}
      </div>
    </div>
  );
}
