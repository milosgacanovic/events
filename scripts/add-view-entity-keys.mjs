#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const messagesDir = path.join(__dirname, "../apps/web/i18n/messages");

const KEYS = {
  "manage.form.viewEvent": {
    en: "View event:", ar: "عرض الحدث:", cs: "Zobrazit akci:", da: "Vis begivenhed:",
    de: "Veranstaltung ansehen:", el: "Προβολή εκδήλωσης:", es: "Ver evento:",
    fi: "Näytä tapahtuma:", fr: "Voir l'événement :", he: "הצג אירוע:", hi: "इवेंट देखें:",
    hr: "Pogledaj događaj:", hu: "Esemény megtekintése:", id: "Lihat acara:",
    is: "Skoða viðburð:", it: "Visualizza evento:", ja: "イベントを表示:", ka: "ღონისძიების ნახვა:",
    ko: "이벤트 보기:", nb: "Vis arrangement:", nl: "Evenement bekijken:", pl: "Zobacz wydarzenie:",
    pt: "Ver evento:", ro: "Vizualizează evenimentul:", ru: "Просмотр мероприятия:",
    sk: "Zobraziť akciu:", sl: "Poglej dogodek:", "sr-Latn": "Pogledaj događaj:",
    sv: "Visa evenemang:", th: "ดูกิจกรรม:", tr: "Etkinliği görüntüle:", uk: "Переглянути подію:",
    vi: "Xem sự kiện:", zh: "查看活动:", zu: "Buka umcimbi:",
  },
  "manage.form.viewHost": {
    en: "View host:", ar: "عرض المضيف:", cs: "Zobrazit hostitele:", da: "Vis vært:",
    de: "Veranstalter ansehen:", el: "Προβολή διοργανωτή:", es: "Ver organizador:",
    fi: "Näytä isäntä:", fr: "Voir l'organisateur :", he: "הצג מארח:", hi: "होस्ट देखें:",
    hr: "Pogledaj organizatora:", hu: "Szervező megtekintése:", id: "Lihat host:",
    is: "Skoða gestgjafa:", it: "Visualizza organizzatore:", ja: "主催者を表示:", ka: "მასპინძლის ნახვა:",
    ko: "호스트 보기:", nb: "Vis vert:", nl: "Organisator bekijken:", pl: "Zobacz organizatora:",
    pt: "Ver organizador:", ro: "Vizualizează organizatorul:", ru: "Просмотр организатора:",
    sk: "Zobraziť hostiteľa:", sl: "Poglej organizatorja:", "sr-Latn": "Pogledaj organizatora:",
    sv: "Visa värd:", th: "ดูโฮสต์:", tr: "Organizatörü görüntüle:", uk: "Переглянути організатора:",
    vi: "Xem nhà tổ chức:", zh: "查看主办方:", zu: "Buka umsingathi:",
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
