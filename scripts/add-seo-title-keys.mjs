#!/usr/bin/env node
// SEO round 3 (Task 3): strings for server-built <title> / meta description.
// Cased languages (Slavic, Baltic-adjacent, fi, hu, el, is, ka, tr) use
// "leads: {host}" / comma constructions so names stay in nominative.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const messagesDir = path.join(__dirname, "../apps/web/i18n/messages");

// [titleWith, leadHost, leadNoHost, leadOnlineHost, leadOnlineNoHost, kindFallback]
const T = {
  en: ["{title} with {host}", "{kind} with {host} in {place} on {date}.", "{kind} in {place} on {date}.", "Online {kind} with {host} on {date}.", "Online {kind} on {date}.", "Dance event"],
  de: ["{title} mit {host}", "{kind} mit {host} in {place} am {date}.", "{kind} in {place} am {date}.", "{kind} (online) mit {host} am {date}.", "{kind} (online) am {date}.", "Tanzveranstaltung"],
  nl: ["{title} met {host}", "{kind} met {host} in {place} op {date}.", "{kind} in {place} op {date}.", "{kind} (online) met {host} op {date}.", "{kind} (online) op {date}.", "Dansevenement"],
  fr: ["{title} avec {host}", "{kind} avec {host} à {place}, le {date}.", "{kind} à {place}, le {date}.", "{kind} en ligne avec {host}, le {date}.", "{kind} en ligne, le {date}.", "Événement de danse"],
  es: ["{title} con {host}", "{kind} con {host} en {place}, el {date}.", "{kind} en {place}, el {date}.", "{kind} en línea con {host}, el {date}.", "{kind} en línea, el {date}.", "Evento de danza"],
  it: ["{title} con {host}", "{kind} con {host} a {place}, {date}.", "{kind} a {place}, {date}.", "{kind} online con {host}, {date}.", "{kind} online, {date}.", "Evento di danza"],
  pt: ["{title} com {host}", "{kind} com {host} em {place}, {date}.", "{kind} em {place}, {date}.", "{kind} online com {host}, {date}.", "{kind} online, {date}.", "Evento de dança"],
  ro: ["{title} cu {host}", "{kind} cu {host} în {place}, {date}.", "{kind} în {place}, {date}.", "{kind} online cu {host}, {date}.", "{kind} online, {date}.", "Eveniment de dans"],
  da: ["{title} med {host}", "{kind} med {host} i {place}, {date}.", "{kind} i {place}, {date}.", "{kind} online med {host}, {date}.", "{kind} online, {date}.", "Dansebegivenhed"],
  no: ["{title} med {host}", "{kind} med {host} i {place}, {date}.", "{kind} i {place}, {date}.", "{kind} på nett med {host}, {date}.", "{kind} på nett, {date}.", "Dansearrangement"],
  sv: ["{title} med {host}", "{kind} med {host} i {place}, {date}.", "{kind} i {place}, {date}.", "{kind} online med {host}, {date}.", "{kind} online, {date}.", "Dansevenemang"],
  id: ["{title} bersama {host}", "{kind} bersama {host} di {place}, {date}.", "{kind} di {place}, {date}.", "{kind} online bersama {host}, {date}.", "{kind} online, {date}.", "Acara tari"],
  vi: ["{title} cùng {host}", "{kind} cùng {host} tại {place}, {date}.", "{kind} tại {place}, {date}.", "{kind} trực tuyến cùng {host}, {date}.", "{kind} trực tuyến, {date}.", "Sự kiện khiêu vũ"],
  ru: ["{title} — {host}", "{kind}, ведёт {host}, {place}, {date}.", "{kind}, {place}, {date}.", "{kind} онлайн, ведёт {host}, {date}.", "{kind} онлайн, {date}.", "Танцевальное событие"],
  uk: ["{title} — {host}", "{kind}, веде {host}, {place}, {date}.", "{kind}, {place}, {date}.", "{kind} онлайн, веде {host}, {date}.", "{kind} онлайн, {date}.", "Танцювальна подія"],
  pl: ["{title} — {host}", "{kind}, prowadzi {host}, {place}, {date}.", "{kind}, {place}, {date}.", "{kind} online, prowadzi {host}, {date}.", "{kind} online, {date}.", "Wydarzenie taneczne"],
  cs: ["{title} — {host}", "{kind}, vede {host}, {place}, {date}.", "{kind}, {place}, {date}.", "{kind} online, vede {host}, {date}.", "{kind} online, {date}.", "Taneční akce"],
  sk: ["{title} — {host}", "{kind}, vedie {host}, {place}, {date}.", "{kind}, {place}, {date}.", "{kind} online, vedie {host}, {date}.", "{kind} online, {date}.", "Tanečné podujatie"],
  sl: ["{title} — {host}", "{kind}, vodi {host}, {place}, {date}.", "{kind}, {place}, {date}.", "{kind} na spletu, vodi {host}, {date}.", "{kind} na spletu, {date}.", "Plesni dogodek"],
  hr: ["{title} — {host}", "{kind}, vodi {host}, {place}, {date}.", "{kind}, {place}, {date}.", "{kind} online, vodi {host}, {date}.", "{kind} online, {date}.", "Plesni događaj"],
  sr: ["{title} — {host}", "{kind}, vodi {host}, {place}, {date}.", "{kind}, {place}, {date}.", "{kind} onlajn, vodi {host}, {date}.", "{kind} onlajn, {date}.", "Plesni događaj"],
  fi: ["{title} — {host}", "{kind}, vetäjänä {host}, {place}, {date}.", "{kind}, {place}, {date}.", "{kind} verkossa, vetäjänä {host}, {date}.", "{kind} verkossa, {date}.", "Tanssitapahtuma"],
  hu: ["{title} — {host}", "{kind}, vezeti: {host}, {place}, {date}.", "{kind}, {place}, {date}.", "{kind} online, vezeti: {host}, {date}.", "{kind} online, {date}.", "Táncesemény"],
  el: ["{title} — {host}", "{kind}, με καθοδήγηση: {host}, {place}, {date}.", "{kind}, {place}, {date}.", "{kind} διαδικτυακά, με καθοδήγηση: {host}, {date}.", "{kind} διαδικτυακά, {date}.", "Χορευτική εκδήλωση"],
  is: ["{title} — {host}", "{kind}, leiðbeinandi: {host}, {place}, {date}.", "{kind}, {place}, {date}.", "{kind} á netinu, leiðbeinandi: {host}, {date}.", "{kind} á netinu, {date}.", "Dansviðburður"],
  ka: ["{title} — {host}", "{kind}, წამყვანი: {host}, {place}, {date}.", "{kind}, {place}, {date}.", "{kind} ონლაინ, წამყვანი: {host}, {date}.", "{kind} ონლაინ, {date}.", "საცეკვაო ღონისძიება"],
  tr: ["{title} — {host}", "{host} eşliğinde {kind}, {place}, {date}.", "{kind}, {place}, {date}.", "{host} eşliğinde çevrimiçi {kind}, {date}.", "Çevrimiçi {kind}, {date}.", "Dans etkinliği"],
  he: ["{title} עם {host}", "{kind} עם {host}, {place}, {date}.", "{kind}, {place}, {date}.", "{kind} מקוון עם {host}, {date}.", "{kind} מקוון, {date}.", "אירוע ריקוד"],
  ar: ["{title} مع {host}", "{kind} مع {host} في {place}، {date}.", "{kind} في {place}، {date}.", "{kind} عبر الإنترنت مع {host}، {date}.", "{kind} عبر الإنترنت، {date}.", "فعالية رقص"],
  hi: ["{title} — {host} के साथ", "{host} के साथ {kind}, {place}, {date}.", "{kind}, {place}, {date}.", "{host} के साथ ऑनलाइन {kind}, {date}.", "ऑनलाइन {kind}, {date}.", "नृत्य कार्यक्रम"],
  ja: ["{title}（{host}）", "{date}、{place}で開催される{host}の{kind}。", "{date}、{place}で開催される{kind}。", "{date}開催、{host}のオンライン{kind}。", "{date}開催のオンライン{kind}。", "ダンスイベント"],
  zh: ["{title}（{host}）", "{host}的{kind}，{place}，{date}。", "{kind}，{place}，{date}。", "{host}的线上{kind}，{date}。", "线上{kind}，{date}。", "舞蹈活动"],
  ko: ["{title} – {host}", "{kind} – {host}, {place}, {date}.", "{kind}, {place}, {date}.", "온라인 {kind} – {host}, {date}.", "온라인 {kind}, {date}.", "댄스 이벤트"],
  th: ["{title} กับ {host}", "{kind} กับ {host} ที่ {place}, {date}", "{kind} ที่ {place}, {date}", "{kind} ออนไลน์ กับ {host}, {date}", "{kind} ออนไลน์, {date}", "งานเต้นรำ"],
  zu: ["{title} – {host}", "{kind} – {host}, {place}, {date}.", "{kind}, {place}, {date}.", "{kind} ku-inthanethi – {host}, {date}.", "{kind} ku-inthanethi, {date}.", "Umcimbi womdanso"],
};
const KEYS = [
  "eventDetail.seo.titleWith",
  "eventDetail.seo.leadHost",
  "eventDetail.seo.leadNoHost",
  "eventDetail.seo.leadOnlineHost",
  "eventDetail.seo.leadOnlineNoHost",
  "eventDetail.seo.kindFallback",
];

for (const file of fs.readdirSync(messagesDir)) {
  if (!file.endsWith(".json")) continue;
  const locale = file.replace(".json", "");
  const values = T[locale];
  if (!values) throw new Error(`missing translations for ${locale}`);
  const filePath = path.join(messagesDir, file);
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  KEYS.forEach((key, i) => { data[key] = values[i]; });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}
console.log(`wrote ${KEYS.length} keys to ${Object.keys(T).length} locales`);
