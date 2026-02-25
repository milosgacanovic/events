"use client";

import { IntlMessageFormat } from "intl-messageformat";
import React, { createContext, useContext, useMemo, useRef } from "react";

import type { AppLocale } from "../../lib/i18n/config";
import type { MessageCatalog } from "../../lib/i18n/messages";

type MessageValues = Record<string, string | number | boolean | null | undefined>;

type I18nContextValue = {
  locale: AppLocale;
  t: (key: string, values?: MessageValues) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function formatResult(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }

  if (Array.isArray(result)) {
    return result
      .map((part) => (typeof part === "string" ? part : String(part)))
      .join("");
  }

  return String(result);
}

export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: AppLocale;
  messages: MessageCatalog;
  children: React.ReactNode;
}) {
  const formatterCache = useRef(new Map<string, IntlMessageFormat>());

  const value = useMemo<I18nContextValue>(() => {
    return {
      locale,
      t: (key, values) => {
        const template = messages[key] ?? key;
        const cacheKey = `${locale}:${key}:${template}`;

        let formatter = formatterCache.current.get(cacheKey);
        if (!formatter) {
          formatter = new IntlMessageFormat(template, locale);
          formatterCache.current.set(cacheKey, formatter);
        }

        try {
          return formatResult(formatter.format(values));
        } catch {
          return template;
        }
      },
    };
  }, [locale, messages]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider");
  }

  return context;
}
