import enMessages from "../../i18n/messages/en.json";
import deMessages from "../../i18n/messages/de.json";
import nlMessages from "../../i18n/messages/nl.json";
import frMessages from "../../i18n/messages/fr.json";
import esMessages from "../../i18n/messages/es.json";
import itMessages from "../../i18n/messages/it.json";
import srMessages from "../../i18n/messages/sr.json";
import ptMessages from "../../i18n/messages/pt.json";
import elMessages from "../../i18n/messages/el.json";
import hrMessages from "../../i18n/messages/hr.json";
import slMessages from "../../i18n/messages/sl.json";
import zhMessages from "../../i18n/messages/zh.json";
import ruMessages from "../../i18n/messages/ru.json";
import trMessages from "../../i18n/messages/tr.json";
import ukMessages from "../../i18n/messages/uk.json";
import huMessages from "../../i18n/messages/hu.json";
import daMessages from "../../i18n/messages/da.json";
import jaMessages from "../../i18n/messages/ja.json";
import heMessages from "../../i18n/messages/he.json";
import plMessages from "../../i18n/messages/pl.json";
import svMessages from "../../i18n/messages/sv.json";
import fiMessages from "../../i18n/messages/fi.json";
import skMessages from "../../i18n/messages/sk.json";
import idMessages from "../../i18n/messages/id.json";
import arMessages from "../../i18n/messages/ar.json";
import hiMessages from "../../i18n/messages/hi.json";
import noMessages from "../../i18n/messages/no.json";
import csMessages from "../../i18n/messages/cs.json";
import koMessages from "../../i18n/messages/ko.json";
import kaMessages from "../../i18n/messages/ka.json";
import roMessages from "../../i18n/messages/ro.json";
import thMessages from "../../i18n/messages/th.json";
import isMessages from "../../i18n/messages/is.json";
import viMessages from "../../i18n/messages/vi.json";
import zuMessages from "../../i18n/messages/zu.json";
import type { AppLocale } from "./config";

export type MessageCatalog = Record<string, string>;

const catalogs: Record<AppLocale, MessageCatalog> = {
  en: enMessages,
  de: deMessages,
  nl: nlMessages,
  fr: frMessages,
  es: esMessages,
  it: itMessages,
  sr: srMessages,
  pt: ptMessages,
  el: elMessages,
  hr: hrMessages,
  sl: slMessages,
  zh: zhMessages,
  ru: ruMessages,
  tr: trMessages,
  uk: ukMessages,
  hu: huMessages,
  da: daMessages,
  ja: jaMessages,
  he: heMessages,
  pl: plMessages,
  sv: svMessages,
  fi: fiMessages,
  sk: skMessages,
  id: idMessages,
  ar: arMessages,
  hi: hiMessages,
  no: noMessages,
  cs: csMessages,
  ko: koMessages,
  ka: kaMessages,
  ro: roMessages,
  th: thMessages,
  is: isMessages,
  vi: viMessages,
  zu: zuMessages,
};

export function getMessages(locale: AppLocale): MessageCatalog {
  return catalogs[locale];
}
