"use client";

import { ROLE_ADMIN } from "@dr-events/shared";

import { useKeycloakAuth } from "../../../components/auth/KeycloakAuthProvider";
import { useI18n } from "../../../components/i18n/I18nProvider";

export default function AdminManageLayout({ children }: { children: React.ReactNode }) {
  const auth = useKeycloakAuth();
  const { t } = useI18n();
  const isAdmin = auth.roles.includes(ROLE_ADMIN);

  if (!isAdmin) {
    return (
      <div className="manage-empty">
        <h3>{t("manage.auth.adminRequired")}</h3>
        <p>{t("manage.auth.adminMessage")}</p>
      </div>
    );
  }

  return <>{children}</>;
}
