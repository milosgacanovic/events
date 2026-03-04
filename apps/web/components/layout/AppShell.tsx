"use client";

import Link from "next/link";
import { useMemo } from "react";

import { useKeycloakAuth } from "../auth/KeycloakAuthProvider";
import { useI18n } from "../i18n/I18nProvider";
import { LocaleSwitcher } from "../i18n/LocaleSwitcher";
import { getKeycloakClientConfig } from "../../lib/keycloakConfig";
import { useTheme } from "../../lib/useTheme";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const auth = useKeycloakAuth();
  const { resolved, toggle } = useTheme();
  const canOpenAdmin = auth.roles.some((role) =>
    role === "dr_events_editor" || role === "dr_events_admin" || role === "editor" || role === "admin"
  );
  const config = getKeycloakClientConfig();
  const registerUrl = useMemo(() => {
    const envUrl = process.env.NEXT_PUBLIC_KEYCLOAK_REGISTER_URL?.trim();
    if (envUrl) {
      return envUrl;
    }

    if (!config.url || !config.realm || !config.clientId || typeof window === "undefined") {
      return null;
    }

    const redirectUri = `${window.location.origin}${config.loginRedirectPath ?? "/auth/keycloak/callback"}`;
    return `${config.url.replace(/\/$/, "")}/realms/${encodeURIComponent(config.realm)}/protocol/openid-connect/registrations?client_id=${encodeURIComponent(config.clientId)}&response_type=code&scope=openid&redirect_uri=${encodeURIComponent(redirectUri)}`;
  }, [config.clientId, config.loginRedirectPath, config.realm, config.url]);

  return (
    <main>
      <header className="topbar">
        <Link href="/events" className="brand brand-mark">
          <img className="brand-logo" src="/logo.jpg" alt={t("app.brand")} />
        </Link>
        <nav className="nav">
          <Link href="/events">{t("nav.events")}</Link>
          <Link href="/hosts">{t("nav.organizers")}</Link>
          {auth.authenticated && canOpenAdmin && <Link href="/admin">{t("nav.admin")}</Link>}
        </nav>
        <div className="auth-actions">
          {!auth.ready ? (
            <span className="meta">{t("auth.loading")}</span>
          ) : auth.authenticated ? (
            <>
              <Link className="ghost-btn" href="/profile">
                {auth.userName ?? t("nav.profile")}
              </Link>
              <button className="secondary-btn" type="button" onClick={() => void auth.logout()}>
                {t("nav.logout")}
              </button>
            </>
          ) : (
            <>
              <button className="secondary-btn" type="button" onClick={() => void auth.login()}>
                {t("nav.login")}
              </button>
              {registerUrl && (
                <a className="ghost-btn" href={registerUrl}>
                  {t("nav.register")}
                </a>
              )}
            </>
          )}
          <LocaleSwitcher />
          <button
            type="button"
            className="theme-toggle"
            onClick={toggle}
            aria-label={resolved === "dark" ? t("theme.dark") : t("theme.light")}
            title={resolved === "dark" ? t("theme.dark") : t("theme.light")}
          >
            {resolved === "dark" ? "\u263E" : "\u2600"}
          </button>
        </div>
      </header>
      {children}
    </main>
  );
}
