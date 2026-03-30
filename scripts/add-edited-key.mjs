#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const messagesDir = path.join(__dirname, "../apps/web/i18n/messages");

const KEYS = {
  "manage.form.edited": {
    en: "Edited.", ar: "تم التعديل.", cs: "Upraveno.", da: "Redigeret.",
    de: "Bearbeitet.", el: "Επεξεργάστηκε.", es: "Editado.",
    fi: "Muokattu.", fr: "Modifié.", he: "נערך.", hi: "संपादित.",
    hr: "Uređeno.", hu: "Szerkesztve.", id: "Diedit.",
    is: "Breytt.", it: "Modificato.", ja: "編集済み。", ka: "რედაქტირებულია.",
    ko: "편집됨.", nb: "Redigert.", nl: "Bewerkt.", pl: "Edytowano.",
    pt: "Editado.", ro: "Editat.", ru: "Отредактировано.",
    sk: "Upravené.", sl: "Urejeno.", "sr-Latn": "Uređeno.",
    sv: "Redigerad.", th: "แก้ไขแล้ว", tr: "Düzenlendi.", uk: "Відредаговано.",
    vi: "Đã chỉnh sửa.", zh: "已编辑。", zu: "Kuhlelwe.",
  },
};

for (const file of fs.readdirSync(messagesDir)) {
  if (!file.endsWith(".json")) continue;
  const locale = file.replace(".json", "");
  const filePath = path.join(messagesDir, file);
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  let changed = false;
  for (const [key, translations] of Object.entries(KEYS)) {
    if (data[key]) continue;
    data[key] = translations[locale] || translations.en;
    changed = true;
  }
  if (changed) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
    console.log(`✓ ${locale}`);
  }
}
console.log("Done.");
