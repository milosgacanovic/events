import enMessages from "../../i18n/messages/en.json";
import srLatnMessages from "../../i18n/messages/sr-Latn.json";
import type { AppLocale } from "./config";

export type MessageCatalog = Record<string, string>;

const catalogs: Record<AppLocale, MessageCatalog> = {
  en: enMessages,
  "sr-Latn": srLatnMessages,
};

export function getMessages(locale: AppLocale): MessageCatalog {
  return catalogs[locale];
}
