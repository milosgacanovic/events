#!/usr/bin/env node
// Adds common.language.multiple translation to all locale files

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const messagesDir = path.join(__dirname, "../apps/web/i18n/messages");

const TRANSLATIONS = {
  ar: "لغات متعددة",
  cs: "Více jazyků",
  da: "Flere sprog",
  de: "Mehrere Sprachen",
  el: "Πολλές γλώσσες",
  es: "Varios idiomas",
  fi: "Useita kieliä",
  fr: "Plusieurs langues",
  he: "מספר שפות",
  hi: "कई भाषाएँ",
  hr: "Više jezika",
  hu: "Több nyelv",
  id: "Beberapa bahasa",
  is: "Margar tungumál",
  it: "Più lingue",
  ja: "複数の言語",
  ka: "მრავალი ენა",
  ko: "여러 언어",
  nb: "Flere språk",
  nl: "Meerdere talen",
  pl: "Wiele języków",
  pt: "Várias línguas",
  ro: "Mai multe limbi",
  ru: "Несколько языков",
  sk: "Viac jazykov",
  sl: "Več jezikov",
  "sr-Latn": "Više jezika",
  sv: "Flera språk",
  th: "หลายภาษา",
  tr: "Birden fazla dil",
  uk: "Кілька мов",
  vi: "Nhiều ngôn ngữ",
  zh: "多种语言",
  zu: "Izilimi eziningi",
};

const KEY = "common.language.multiple";
const EN_VALUE = "Multiple languages";

let updated = 0;
let skipped = 0;

for (const [locale, translation] of Object.entries(TRANSLATIONS)) {
  const filePath = path.join(messagesDir, `${locale}.json`);
  if (!fs.existsSync(filePath)) {
    console.log(`MISSING: ${locale}.json`);
    continue;
  }

  const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));

  if (content[KEY] && content[KEY] !== EN_VALUE) {
    skipped++;
    continue;
  }

  content[KEY] = translation;

  // Sort keys and write
  const sorted = Object.fromEntries(Object.entries(content).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(filePath, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`Updated ${locale}: "${translation}"`);
  updated++;
}

// Also update en.json — already done manually, but ensure it exists
const enPath = path.join(messagesDir, "en.json");
const enContent = JSON.parse(fs.readFileSync(enPath, "utf-8"));
if (!enContent[KEY]) {
  enContent[KEY] = EN_VALUE;
  const sorted = Object.fromEntries(Object.entries(enContent).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(enPath, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`Updated en: "${EN_VALUE}"`);
  updated++;
} else {
  console.log(`en already has key: "${enContent[KEY]}"`);
}

console.log(`\nDone: ${updated} updated, ${skipped} skipped.`);
