"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useKeycloakAuth } from "../../components/auth/KeycloakAuthProvider";
import { useI18n } from "../../components/i18n/I18nProvider";

const TABS = [
  { href: "/profile/saved", key: "savedEvents" },
  { href: "/profile/going", key: "rsvps" },
  { href: "/profile/following", key: "following" },
  { href: "/profile/notifications", key: "notifications" },
  { href: "/profile/comments", key: "comments" },
  { href: "/profile/account", key: "account" },
] as const;

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  const auth = useKeycloakAuth();
  const { t } = useI18n();
  const pathname = usePathname();

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

  return (
    <section className="panel cards">
      <h1 className="title-xl">{t("profile.title")}</h1>
      <nav className="profile-tabs">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`profile-tab${pathname.startsWith(tab.href) ? " active" : ""}`}
          >
            {t(`profile.tabs.${tab.key}`)}
          </Link>
        ))}
      </nav>
      {children}
    </section>
  );
}
