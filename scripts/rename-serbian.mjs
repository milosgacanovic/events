#!/usr/bin/env node
// Updates locale.sr-Latn in all locale JSON files to the localized name of "Serbian"
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const messagesDir = join(__dirname, "../apps/web/i18n/messages");

// How each language says "Serbian" (not "Serbian (Latin)" — just "Serbian")
const TRANSLATIONS = {
  en: "Serbian",
  ar: "الصربية",
  cs: "srbština",
  da: "serbisk",
  de: "Serbisch",
  el: "Σερβικά",
  es: "serbio",
  fi: "serbia",
  fr: "serbe",
  he: "סרבית",
  hi: "सर्बियाई",
  hr: "srpski",
  hu: "szerb",
  id: "bahasa Serbia",
  is: "serbneska",
  it: "serbo",
  ja: "セルビア語",
  ka: "სერბული",
  ko: "세르비아어",
  nb: "serbisk",
  nl: "Servisch",
  pl: "serbski",
  pt: "sérvio",
  ro: "sârbă",
  ru: "сербский",
  sk: "srbčina",
  sl: "srbščina",
  "sr-Latn": "Srpski",
  sv: "serbiska",
  th: "เซอร์เบีย",
  tr: "Sırpça",
  uk: "сербська",
  vi: "tiếng Serbia",
  zh: "塞尔维亚语",
  zu: "Serbian",
};

let updated = 0;
for (const [locale, label] of Object.entries(TRANSLATIONS)) {
  const filePath = join(messagesDir, `${locale}.json`);
  let data;
  try {
    data = JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    console.warn(`  Skipping ${locale}: file not found`);
    continue;
  }
  const key = "locale.sr-Latn";
  const prev = data[key];
  if (prev === label) {
    console.log(`  ${locale}: unchanged (${label})`);
    continue;
  }
  data[key] = label;
  writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`  ${locale}: "${prev}" → "${label}"`);
  updated++;
}
console.log(`\nDone. Updated ${updated} files.`);
