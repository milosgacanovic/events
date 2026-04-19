export const supportedLocales = [
  "id", "cs", "da", "de", "en", "es", "fr", "hr", "zu", "is", "it",
  "hu", "nl", "no", "pl", "pt", "ro", "sk", "sl", "sr", "fi", "sv",
  "vi", "tr", "el", "ru", "uk", "ka", "he", "ar", "hi", "th", "ko", "zh", "ja",
] as const;

export type AppLocale = (typeof supportedLocales)[number];

export const defaultLocale: AppLocale = "en";

export const localeCookieName = "dr_locale";

export function isSupportedLocale(value: string): value is AppLocale {
  return supportedLocales.includes(value as AppLocale);
}
