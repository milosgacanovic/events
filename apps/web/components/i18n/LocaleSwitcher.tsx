"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { localeCookieName, supportedLocales, type AppLocale } from "../../lib/i18n/config";
import { useI18n } from "./I18nProvider";

function setLocaleCookie(locale: AppLocale) {
  document.cookie = `${localeCookieName}=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function LocaleSwitcher() {
  const router = useRouter();
  const { locale, t } = useI18n();
  const sizerRef = useRef<HTMLSpanElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (sizerRef.current && selectRef.current) {
      selectRef.current.style.width = `${sizerRef.current.offsetWidth + 24}px`;
    }
  }, [locale]);

  return (
    <label className="locale-switcher">
      <span ref={sizerRef} className="locale-switcher-sizer" aria-hidden="true">
        {t(`locale.${locale}`)}
      </span>
      <span className="locale-label">{t("locale.selectLabel")}</span>
      <select
        ref={selectRef}
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
