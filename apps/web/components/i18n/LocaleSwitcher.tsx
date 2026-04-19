"use client";

import { useEffect, useRef } from "react";

import { supportedLocales, type AppLocale } from "../../lib/i18n/config";
import { setLocaleCookie } from "../../lib/i18n/cookie";
import { getLocaleAutonym } from "../../lib/i18n/messages";
import { useI18n } from "./I18nProvider";

export function LocaleSwitcher() {
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
        {getLocaleAutonym(locale)}
      </span>
      <span className="locale-label">{t("locale.selectLabel")}</span>
      <select
        ref={selectRef}
        aria-label={t("locale.selectLabel")}
        value={locale}
        onChange={(event) => {
          const nextLocale = event.target.value as AppLocale;
          setLocaleCookie(nextLocale);
          window.location.reload();
        }}
      >
        {supportedLocales.map((value) => (
          <option key={value} value={value}>
            {getLocaleAutonym(value)}
          </option>
        ))}
      </select>
    </label>
  );
}
