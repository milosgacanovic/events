"use client";

import { useRouter } from "next/navigation";

import { localeCookieName, supportedLocales, type AppLocale } from "../../lib/i18n/config";
import { useI18n } from "./I18nProvider";

function setLocaleCookie(locale: AppLocale) {
  document.cookie = `${localeCookieName}=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function LocaleSwitcher() {
  const router = useRouter();
  const { locale, t } = useI18n();

  return (
    <label className="locale-switcher">
      <span className="locale-label">{t("locale.selectLabel")}</span>
      <select
        aria-label={t("locale.selectLabel")}
        value={locale}
        onChange={(event) => {
          const nextLocale = event.target.value as AppLocale;
          setLocaleCookie(nextLocale);
          (event.target as HTMLSelectElement).blur();
          router.refresh();
        }}
      >
        {supportedLocales.map((value) => (
          <option key={value} value={value}>
            {t(`locale.${value}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
