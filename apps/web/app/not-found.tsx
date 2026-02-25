"use client";

import Link from "next/link";

import { useI18n } from "../components/i18n/I18nProvider";

export default function NotFound() {
  const { t } = useI18n();

  return (
    <section className="panel cards">
      <h1 className="title-xl">{t("notFound.title")}</h1>
      <p className="muted">{t("notFound.description")}</p>
      <p>
        <Link href="/events">{t("notFound.cta")}</Link>
      </p>
    </section>
  );
}
