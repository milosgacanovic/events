"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { useKeycloakAuth } from "../auth/KeycloakAuthProvider";
import { useI18n } from "../i18n/I18nProvider";
import { LocaleSwitcher } from "../i18n/LocaleSwitcher";
import { getKeycloakClientConfig } from "../../lib/keycloakConfig";
import { useTheme } from "../../lib/useTheme";

function ThemeIcon({ resolved }: { resolved: string }) {
  if (resolved === "dark") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <g stroke="gray" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="3.2" />
        <path d="M4.6 20c1.8-4.2 5-6.2 7.4-6.2S17.6 15.8 19.4 20" />
      </g>
    </svg>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const auth = useKeycloakAuth();
  const pathname = usePathname();
  const { resolved, toggle } = useTheme();
  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const hamburgerRef = useRef<HTMLDivElement>(null);
  const userMobileRef = useRef<HTMLDivElement>(null);
  const userDesktopRef = useRef<HTMLDivElement>(null);

  const canOpenAdmin = auth.roles.some((role) =>
    role === "dr_events_editor" || role === "dr_events_admin" || role === "editor" || role === "admin"
  );

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (hamburgerRef.current && !hamburgerRef.current.contains(target)) {
        setHamburgerOpen(false);
      }
      if (
        (!userMobileRef.current || !userMobileRef.current.contains(target)) &&
        (!userDesktopRef.current || !userDesktopRef.current.contains(target))
      ) {
        setUserDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    setHamburgerOpen(false);
    setUserDropdownOpen(false);
  }, [pathname]);

  const config = getKeycloakClientConfig();
  const registerUrl = useMemo(() => {
    const envUrl = process.env.NEXT_PUBLIC_KEYCLOAK_REGISTER_URL?.trim();
    if (envUrl) return envUrl;
    if (!config.url || !config.realm || !config.clientId || typeof window === "undefined") return null;
    const redirectUri = `${window.location.origin}${config.loginRedirectPath ?? "/auth/keycloak/callback"}`;
    return `${config.url.replace(/\/$/, "")}/realms/${encodeURIComponent(config.realm)}/protocol/openid-connect/registrations?client_id=${encodeURIComponent(config.clientId)}&response_type=code&scope=openid&redirect_uri=${encodeURIComponent(redirectUri)}`;
  }, [config.clientId, config.loginRedirectPath, config.realm, config.url]);

  return (
    <>
    <main>
      <header className="topbar">
        {/* Mobile: hamburger menu */}
        <div className="hamburger-wrap" ref={hamburgerRef}>
          <button
            type="button"
            className="topbar-icon-btn"
            onClick={() => setHamburgerOpen((o) => !o)}
            aria-label="Menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          {hamburgerOpen && (
            <div className="dropdown-menu">
              <Link href="/events" className={"dropdown-item" + (pathname.startsWith("/events") ? " active" : "")}>
                {t("nav.events")}
              </Link>
              <Link href="/hosts" className={"dropdown-item" + (pathname.startsWith("/hosts") ? " active" : "")}>
                {t("nav.organizers")}
              </Link>
              {canOpenAdmin && (
                <Link href="/admin" className={"dropdown-item" + (pathname.startsWith("/admin") ? " active" : "")}>
                  {t("nav.admin")}
                </Link>
              )}
              <a className="dropdown-item" href="https://danceresource.org" target="_blank" rel="noopener noreferrer">DanceResource</a>
              <a className="dropdown-item" href="https://wiki.danceresource.org" target="_blank" rel="noopener noreferrer">Wiki</a>
            </div>
          )}
        </div>

        {/* Logo */}
        <Link href="/events" className="brand brand-mark">
          <img className="brand-logo" src="/logo.jpg" alt={t("app.brand")} />
        </Link>

        {/* Desktop: nav links with separators */}
        <nav className="nav">
          <Link href="/events" className={pathname.startsWith("/events") ? "active" : ""}>
            {t("nav.events")}
          </Link>
          <Link href="/hosts" className={pathname.startsWith("/hosts") ? "active" : ""}>
            {t("nav.organizers")}
          </Link>
          {canOpenAdmin && (
            <Link href="/admin" className={pathname.startsWith("/admin") ? "active" : ""}>
              {t("nav.admin")}
            </Link>
          )}
          <a href="https://danceresource.org" target="_blank" rel="noopener noreferrer">DanceResource</a>
          <a href="https://wiki.danceresource.org" target="_blank" rel="noopener noreferrer">Wiki</a>
        </nav>

        {/* Desktop: right-side controls */}
        <div className="header-actions">
          {!auth.ready ? (
            <span className="meta">{t("auth.loading")}</span>
          ) : auth.authenticated ? (
            <div className="desktop-user-wrap" ref={userDesktopRef}>
              <button
                type="button"
                className="header-user-pill"
                onClick={() => setUserDropdownOpen((o) => !o)}
              >
                <UserIcon />
                <span className="header-user-name">{auth.userName ?? t("nav.profile")}</span>
                <svg className="header-user-caret" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 6l4 4 4-4" /></svg>
              </button>
              {userDropdownOpen && (
                <div className="dropdown-menu dropdown-right">
                  <Link href="/profile" className="dropdown-item">
                    {t("nav.profile")}
                  </Link>
                  <div className="dropdown-divider" />
                  <button className="dropdown-item" type="button" onClick={() => void auth.logout()}>
                    {t("nav.logout")}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="header-auth-pills">
              <button className="header-auth-pill" type="button" onClick={() => void auth.login()}>
                {t("nav.login")}
              </button>
              {registerUrl && (
                <a className="header-auth-pill" href={registerUrl}>
                  {t("nav.register")}
                </a>
              )}
            </div>
          )}
          <span className="header-sep" />
          <button
            type="button"
            className="theme-toggle"
            onClick={toggle}
            aria-label={resolved === "dark" ? t("theme.dark") : t("theme.light")}
            title={resolved === "dark" ? t("theme.dark") : t("theme.light")}
          >
            <ThemeIcon resolved={resolved} />
          </button>
          <span className="header-sep" />
          <LocaleSwitcher />
        </div>

        {/* Mobile: user icon with dropdown */}
        <div className="user-menu-wrap" ref={userMobileRef}>
          <button
            type="button"
            className="topbar-icon-btn user-icon-btn"
            onClick={() => setUserDropdownOpen((o) => !o)}
            aria-label={t("nav.profile")}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            {auth.authenticated && <span className="user-dot" />}
          </button>
          {userDropdownOpen && (
            <div className="dropdown-menu dropdown-right">
              {auth.ready && auth.authenticated ? (
                <>
                  <Link href="/profile" className="dropdown-item">
                    {auth.userName ?? t("nav.profile")}
                  </Link>
                  <div className="dropdown-divider" />
                  <button className="dropdown-item" type="button" onClick={() => void auth.logout()}>
                    {t("nav.logout")}
                  </button>
                </>
              ) : auth.ready ? (
                <>
                  <button className="dropdown-item" type="button" onClick={() => void auth.login()}>
                    {t("nav.login")}
                  </button>
                  {registerUrl && (
                    <a className="dropdown-item" href={registerUrl}>
                      {t("nav.register")}
                    </a>
                  )}
                </>
              ) : (
                <span className="dropdown-item meta">{t("auth.loading")}</span>
              )}
              <div className="dropdown-divider" />
              <div className="dropdown-item dropdown-locale-row">
                <LocaleSwitcher />
              </div>
              <button className="dropdown-item" type="button" onClick={toggle}>
                <ThemeIcon resolved={resolved} />
                <span style={{ marginLeft: 8 }}>{resolved === "dark" ? t("theme.dark") : t("theme.light")}</span>
              </button>
            </div>
          )}
        </div>
      </header>
      {children}
    </main>
    <footer className="site-footer">
      <div className="site-footer-line">
        © 2026 DanceResource
        <span className="site-footer-sep">·</span>
        <a href="mailto:hello@danceresource.org">Contact</a>
        <span className="site-footer-sep">·</span>
        <a href="mailto:hello@danceresource.org">List or manage your event</a>
        <span className="site-footer-sep">·</span>
        <a href="https://www.danceresource.org" target="_blank" rel="noopener noreferrer">DanceResource.org</a>
      </div>
      <div className="site-footer-line">
        Content shared with care under{" "}
        <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a>
      </div>
    </footer>
    </>
  );
}
