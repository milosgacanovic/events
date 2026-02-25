import { defaultLocale, type AppLocale, supportedLocales } from "./config";

function localeBase(locale: string): string {
  return locale.split("-")[0]?.toLowerCase() ?? locale.toLowerCase();
}

export function normalizeLocale(value?: string | null): AppLocale | null {
  if (!value) {
    return null;
  }

  const candidate = value.trim();
  if (!candidate) {
    return null;
  }

  const exactMatch = supportedLocales.find(
    (locale) => locale.toLowerCase() === candidate.toLowerCase(),
  );
  if (exactMatch) {
    return exactMatch;
  }

  const base = localeBase(candidate);
  const baseMatch = supportedLocales.find((locale) => localeBase(locale) === base);
  return baseMatch ?? null;
}

type LanguagePreference = {
  locale: string;
  quality: number;
};

function parseAcceptLanguage(headerValue?: string | null): LanguagePreference[] {
  if (!headerValue) {
    return [];
  }

  return headerValue
    .split(",")
    .map((rawItem) => rawItem.trim())
    .filter(Boolean)
    .map((item) => {
      const [localePart, qualityPart] = item.split(";q=");
      const quality = Number(qualityPart);
      return {
        locale: localePart?.trim() ?? "",
        quality: Number.isFinite(quality) ? quality : 1,
      };
    })
    .filter((item) => item.locale)
    .sort((a, b) => b.quality - a.quality);
}

export function resolveRequestLocale(
  cookieLocale?: string | null,
  acceptLanguageHeader?: string | null,
): AppLocale {
  const cookieMatch = normalizeLocale(cookieLocale);
  if (cookieMatch) {
    return cookieMatch;
  }

  const headerPreferences = parseAcceptLanguage(acceptLanguageHeader);
  for (const preference of headerPreferences) {
    const match = normalizeLocale(preference.locale);
    if (match) {
      return match;
    }
  }

  return defaultLocale;
}
