#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const messagesDir = path.join(__dirname, "../apps/web/i18n/messages");

const KEYS = {
  "manage.form.savedAsDraft": {
    en: "Saved as draft!", ar: "تم الحفظ كمسودة!", cs: "Uloženo jako koncept!", da: "Gemt som kladde!",
    de: "Als Entwurf gespeichert!", el: "Αποθηκεύτηκε ως πρόχειρο!", es: "¡Guardado como borrador!",
    fi: "Tallennettu luonnoksena!", fr: "Enregistré comme brouillon !", he: "!נשמר כטיוטה", hi: "ड्राफ्ट के रूप में सहेजा गया!",
    hr: "Spremljeno kao skica!", hu: "Piszkozatként mentve!", id: "Disimpan sebagai draf!",
    is: "Vistað sem drög!", it: "Salvato come bozza!", ja: "下書きとして保存しました！", ka: "შენახულია მონახაზად!",
    ko: "초안으로 저장됨!", nb: "Lagret som utkast!", nl: "Opgeslagen als concept!", pl: "Zapisano jako szkic!",
    pt: "Salvo como rascunho!", ro: "Salvat ca ciornă!", ru: "Сохранено как черновик!",
    sk: "Uložené ako koncept!", sl: "Shranjeno kot osnutek!", "sr-Latn": "Sačuvano kao nacrt!",
    sv: "Sparat som utkast!", th: "บันทึกเป็นแบบร่างแล้ว!", tr: "Taslak olarak kaydedildi!", uk: "Збережено як чернетку!",
    vi: "Đã lưu dưới dạng bản nháp!", zh: "已保存为草稿！", zu: "Kulondolozwe njengesikicimu!",
  },
  "manage.form.savedAndPublished": {
    en: "Saved and published!", ar: "تم الحفظ والنشر!", cs: "Uloženo a publikováno!", da: "Gemt og offentliggjort!",
    de: "Gespeichert und veröffentlicht!", el: "Αποθηκεύτηκε και δημοσιεύτηκε!", es: "¡Guardado y publicado!",
    fi: "Tallennettu ja julkaistu!", fr: "Enregistré et publié !", he: "!נשמר ופורסם", hi: "सहेजा और प्रकाशित किया गया!",
    hr: "Spremljeno i objavljeno!", hu: "Mentve és közzétéve!", id: "Disimpan dan dipublikasikan!",
    is: "Vistað og birt!", it: "Salvato e pubblicato!", ja: "保存して公開しました！", ka: "შენახულია და გამოქვეყნებულია!",
    ko: "저장 및 게시됨!", nb: "Lagret og publisert!", nl: "Opgeslagen en gepubliceerd!", pl: "Zapisano i opublikowano!",
    pt: "Salvo e publicado!", ro: "Salvat și publicat!", ru: "Сохранено и опубликовано!",
    sk: "Uložené a publikované!", sl: "Shranjeno in objavljeno!", "sr-Latn": "Sačuvano i objavljeno!",
    sv: "Sparat och publicerat!", th: "บันทึกและเผยแพร่แล้ว!", tr: "Kaydedildi ve yayınlandı!", uk: "Збережено та опубліковано!",
    vi: "Đã lưu và xuất bản!", zh: "已保存并发布！", zu: "Kulondolozwe futhi kushicilelwe!",
  },
  "manage.form.savedAndCancelled": {
    en: "Saved and cancelled!", ar: "تم الحفظ والإلغاء!", cs: "Uloženo a zrušeno!", da: "Gemt og aflyst!",
    de: "Gespeichert und abgesagt!", el: "Αποθηκεύτηκε και ακυρώθηκε!", es: "¡Guardado y cancelado!",
    fi: "Tallennettu ja peruutettu!", fr: "Enregistré et annulé !", he: "!נשמר ובוטל", hi: "सहेजा और रद्द किया गया!",
    hr: "Spremljeno i otkazano!", hu: "Mentve és lemondva!", id: "Disimpan dan dibatalkan!",
    is: "Vistað og aflýst!", it: "Salvato e annullato!", ja: "保存してキャンセルしました！", ka: "შენახულია და გაუქმებულია!",
    ko: "저장 및 취소됨!", nb: "Lagret og avlyst!", nl: "Opgeslagen en geannuleerd!", pl: "Zapisano i anulowano!",
    pt: "Salvo e cancelado!", ro: "Salvat și anulat!", ru: "Сохранено и отменено!",
    sk: "Uložené a zrušené!", sl: "Shranjeno in preklicano!", "sr-Latn": "Sačuvano i otkazano!",
    sv: "Sparat och inställt!", th: "บันทึกและยกเลิกแล้ว!", tr: "Kaydedildi ve iptal edildi!", uk: "Збережено та скасовано!",
    vi: "Đã lưu và hủy!", zh: "已保存并取消！", zu: "Kulondolozwe futhi kukhanseliwe!",
  },
  "manage.form.savedAndArchived": {
    en: "Saved and archived!", ar: "تم الحفظ والأرشفة!", cs: "Uloženo a archivováno!", da: "Gemt og arkiveret!",
    de: "Gespeichert und archiviert!", el: "Αποθηκεύτηκε και αρχειοθετήθηκε!", es: "¡Guardado y archivado!",
    fi: "Tallennettu ja arkistoitu!", fr: "Enregistré et archivé !", he: "!נשמר והועבר לארכיון", hi: "सहेजा और संग्रहित किया गया!",
    hr: "Spremljeno i arhivirano!", hu: "Mentve és archiválva!", id: "Disimpan dan diarsipkan!",
    is: "Vistað og sett í geymslu!", it: "Salvato e archiviato!", ja: "保存してアーカイブしました！", ka: "შენახულია და არქივირებულია!",
    ko: "저장 및 보관됨!", nb: "Lagret og arkivert!", nl: "Opgeslagen en gearchiveerd!", pl: "Zapisano i zarchiwizowano!",
    pt: "Salvo e arquivado!", ro: "Salvat și arhivat!", ru: "Сохранено и заархивировано!",
    sk: "Uložené a archivované!", sl: "Shranjeno in arhivirano!", "sr-Latn": "Sačuvano i arhivirano!",
    sv: "Sparat och arkiverat!", th: "บันทึกและจัดเก็บแล้ว!", tr: "Kaydedildi ve arşivlendi!", uk: "Збережено та заархівовано!",
    vi: "Đã lưu và lưu trữ!", zh: "已保存并归档！", zu: "Kulondolozwe futhi kugcinwe!",
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
