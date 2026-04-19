"use client";

import { useEffect } from "react";

import { isSupportedLocale } from "../../lib/i18n/config";
import { getLocaleCookie, setLocaleCookie } from "../../lib/i18n/cookie";

/**
 * Reads ?lang=xx from the URL. If it's a supported locale and differs from
 * the current cookie, sets the cookie and reloads. Always strips ?lang from
 * the URL via replaceState so it doesn't stick around in the address bar.
 */
export function LangQueryHandler() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const lang = url.searchParams.get("lang");
    if (!lang) return;

    // Strip the param from the URL immediately
    url.searchParams.delete("lang");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);

    if (!isSupportedLocale(lang)) return;

    const current = getLocaleCookie();
    if (current === lang) return;

    setLocaleCookie(lang);
    window.location.reload();
  }, []);

  return null;
}
