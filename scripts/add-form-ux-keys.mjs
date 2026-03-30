#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const messagesDir = path.join(__dirname, "../apps/web/i18n/messages");

const KEYS = {
  "manage.form.save": {
    en: "Save", ar: "حفظ", cs: "Uložit", da: "Gem", de: "Speichern", el: "Αποθήκευση",
    es: "Guardar", fi: "Tallenna", fr: "Enregistrer", he: "שמור", hi: "सहेजें",
    hr: "Spremi", hu: "Mentés", id: "Simpan", is: "Vista", it: "Salva",
    ja: "保存", ka: "შენახვა", ko: "저장", nb: "Lagre", nl: "Opslaan",
    pl: "Zapisz", pt: "Salvar", ro: "Salvează", ru: "Сохранить", sk: "Uložiť",
    sl: "Shrani", "sr-Latn": "Sačuvaj", sv: "Spara", th: "บันทึก", tr: "Kaydet",
    uk: "Зберегти", vi: "Lưu", zh: "保存", zu: "Gcina",
  },
  "manage.form.discardChanges": {
    en: "Discard changes", ar: "تجاهل التغييرات", cs: "Zahodit změny", da: "Kassér ændringer",
    de: "Änderungen verwerfen", el: "Απόρριψη αλλαγών", es: "Descartar cambios",
    fi: "Hylkää muutokset", fr: "Annuler les modifications", he: "בטל שינויים",
    hi: "परिवर्तन छोड़ें", hr: "Odbaci promjene", hu: "Változások elvetése",
    id: "Buang perubahan", is: "Henda breytingum", it: "Annulla modifiche",
    ja: "変更を破棄", ka: "ცვლილებების გაუქმება", ko: "변경 사항 취소",
    nb: "Forkast endringer", nl: "Wijzigingen verwerpen", pl: "Odrzuć zmiany",
    pt: "Descartar alterações", ro: "Renunță la modificări", ru: "Отменить изменения",
    sk: "Zahodiť zmeny", sl: "Zavrzi spremembe", "sr-Latn": "Odbaci promene",
    sv: "Förkasta ändringar", th: "ยกเลิกการเปลี่ยนแปลง", tr: "Değişiklikleri sil",
    uk: "Скасувати зміни", vi: "Hủy thay đổi", zh: "放弃更改", zu: "Lahla izinguquko",
  },
  "manage.form.view": {
    en: "View", ar: "عرض", cs: "Zobrazit", da: "Vis", de: "Ansehen", el: "Προβολή",
    es: "Ver", fi: "Näytä", fr: "Voir", he: "הצג", hi: "देखें",
    hr: "Pogledaj", hu: "Megtekintés", id: "Lihat", is: "Skoða", it: "Visualizza",
    ja: "表示", ka: "ნახვა", ko: "보기", nb: "Vis", nl: "Bekijken",
    pl: "Zobacz", pt: "Ver", ro: "Vizualizează", ru: "Просмотр", sk: "Zobraziť",
    sl: "Poglej", "sr-Latn": "Pogledaj", sv: "Visa", th: "ดู", tr: "Görüntüle",
    uk: "Переглянути", vi: "Xem", zh: "查看", zu: "Buka",
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
