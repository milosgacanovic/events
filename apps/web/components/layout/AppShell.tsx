"use client";

import Link from "next/link";

import { useI18n } from "../i18n/I18nProvider";
import { LocaleSwitcher } from "../i18n/LocaleSwitcher";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();

  return (
    <main>
      <header className="topbar">
        <Link href="/events" className="brand">
          {t("app.brand")}
        </Link>
        <nav className="nav">
          <Link href="/events">{t("nav.events")}</Link>
          <Link href="/organizers">{t("nav.organizers")}</Link>
          <Link href="/admin">{t("nav.admin")}</Link>
        </nav>
        <LocaleSwitcher />
      </header>
      {children}
    </main>
  );
}
