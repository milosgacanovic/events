"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useKeycloakAuth } from "../../components/auth/KeycloakAuthProvider";
import { useI18n } from "../../components/i18n/I18nProvider";
import { apiBase } from "../../lib/api";

type ProfileCounts = {
  saves: number;
  rsvps: number;
  follows: number;
  comments: number;
};

const TABS = [
  { href: "/profile/saved", key: "savedEvents", countKey: "saves" as const },
  { href: "/profile/going", key: "rsvps", countKey: "rsvps" as const },
  { href: "/profile/following", key: "following", countKey: "follows" as const },
  { href: "/profile/notifications", key: "notifications", countKey: null },
  { href: "/profile/comments", key: "comments", countKey: "comments" as const },
  { href: "/profile/account", key: "account", countKey: null },
] as const;

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  const auth = useKeycloakAuth();
  const { t } = useI18n();
  const pathname = usePathname();
  const [counts, setCounts] = useState<ProfileCounts | null>(null);

  const loadCounts = useCallback(async () => {
    try {
      const token = await auth.getToken();
      if (!token) return;
      const res = await fetch(`${apiBase}/profile/counts`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.ok) setCounts(await res.json() as ProfileCounts);
    } catch { /* ignore */ }
  }, [auth.getToken]);

  useEffect(() => {
    if (auth.authenticated) void loadCounts();
  }, [auth.authenticated, loadCounts]);

  if (!auth.ready) {
    return <section className="panel">{t("profile.loading")}</section>;
  }

  if (!auth.authenticated) {
    return (
      <section className="panel cards">
        <h1 className="title-xl">{t("profile.title")}</h1>
        <p className="muted">{t("profile.loginRequired")}</p>
        <button className="secondary-btn" type="button" onClick={() => void auth.login()}>
          {t("nav.login")}
        </button>
      </section>
    );
  }

  const displayName = auth.userName ?? auth.userEmail ?? "";
  const initial = (displayName || "?")[0].toUpperCase();

  return (
    <section className="panel cards">
      {/* Profile header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{
          width: 44, height: 44, borderRadius: "50%", background: "var(--accent-bg)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "1.1rem", fontWeight: 600, color: "var(--accent)", flexShrink: 0,
        }}>
          {initial}
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: "1.05rem" }}>{displayName}</div>
          {auth.userEmail && auth.userEmail !== displayName && (
            <div className="meta" style={{ fontSize: "0.8rem" }}>{auth.userEmail}</div>
          )}
        </div>
      </div>

      <nav className="profile-tabs">
        {TABS.map((tab) => {
          const count = tab.countKey && counts ? counts[tab.countKey] : 0;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`profile-tab${pathname.startsWith(tab.href) ? " active" : ""}`}
            >
              {t(`profile.tabs.${tab.key}`)}
              {tab.countKey && count > 0 ? ` (${count})` : ""}
            </Link>
          );
        })}
      </nav>
      {children}
    </section>
  );
}
