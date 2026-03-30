#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const messagesDir = path.join(__dirname, "../apps/web/i18n/messages");

const EN_KEYS = {
  "manage.eventCard.archive": "Archive",
  "manage.eventCard.confirmArchive": "Are you sure you want to archive this event? It will be removed from public listings.",
  "manage.eventCard.delete": "Delete",
  "manage.eventCard.confirmDelete": "Are you sure you want to delete this event? This action cannot be undone.",
};

const T = {
  ar: { "manage.eventCard.archive": "أرشفة", "manage.eventCard.confirmArchive": "هل أنت متأكد من أرشفة هذا الحدث؟ سيتم إزالته من القوائم العامة.", "manage.eventCard.delete": "حذف", "manage.eventCard.confirmDelete": "هل أنت متأكد من حذف هذا الحدث؟ لا يمكن التراجع عن هذا الإجراء." },
  cs: { "manage.eventCard.archive": "Archivovat", "manage.eventCard.confirmArchive": "Opravdu chcete archivovat tuto akci? Bude odstraněna z veřejných výpisů.", "manage.eventCard.delete": "Smazat", "manage.eventCard.confirmDelete": "Opravdu chcete smazat tuto akci? Tuto akci nelze vrátit zpět." },
  da: { "manage.eventCard.archive": "Arkiver", "manage.eventCard.confirmArchive": "Er du sikker på, at du vil arkivere denne begivenhed? Den fjernes fra offentlige lister.", "manage.eventCard.delete": "Slet", "manage.eventCard.confirmDelete": "Er du sikker på, at du vil slette denne begivenhed? Denne handling kan ikke fortrydes." },
  de: { "manage.eventCard.archive": "Archivieren", "manage.eventCard.confirmArchive": "Möchtest du dieses Event archivieren? Es wird aus den öffentlichen Listen entfernt.", "manage.eventCard.delete": "Löschen", "manage.eventCard.confirmDelete": "Möchtest du dieses Event wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden." },
  el: { "manage.eventCard.archive": "Αρχειοθέτηση", "manage.eventCard.confirmArchive": "Θέλετε να αρχειοθετήσετε αυτή την εκδήλωση;", "manage.eventCard.delete": "Διαγραφή", "manage.eventCard.confirmDelete": "Θέλετε να διαγράψετε αυτή την εκδήλωση; Αυτή η ενέργεια δεν μπορεί να αναιρεθεί." },
  es: { "manage.eventCard.archive": "Archivar", "manage.eventCard.confirmArchive": "¿Estás seguro de que quieres archivar este evento? Se eliminará de los listados públicos.", "manage.eventCard.delete": "Eliminar", "manage.eventCard.confirmDelete": "¿Estás seguro de que quieres eliminar este evento? Esta acción no se puede deshacer." },
  fi: { "manage.eventCard.archive": "Arkistoi", "manage.eventCard.confirmArchive": "Haluatko varmasti arkistoida tämän tapahtuman?", "manage.eventCard.delete": "Poista", "manage.eventCard.confirmDelete": "Haluatko varmasti poistaa tämän tapahtuman? Tätä toimintoa ei voi kumota." },
  fr: { "manage.eventCard.archive": "Archiver", "manage.eventCard.confirmArchive": "Êtes-vous sûr de vouloir archiver cet événement ? Il sera retiré des listes publiques.", "manage.eventCard.delete": "Supprimer", "manage.eventCard.confirmDelete": "Êtes-vous sûr de vouloir supprimer cet événement ? Cette action est irréversible." },
  he: { "manage.eventCard.archive": "ארכיון", "manage.eventCard.confirmArchive": "האם אתה בטוח שברצונך לארכב אירוע זה?", "manage.eventCard.delete": "מחק", "manage.eventCard.confirmDelete": "האם אתה בטוח שברצונך למחוק אירוע זה? פעולה זו אינה ניתנת לביטול." },
  hi: { "manage.eventCard.archive": "संग्रहित करें", "manage.eventCard.confirmArchive": "क्या आप इस इवेंट को संग्रहित करना चाहते हैं?", "manage.eventCard.delete": "हटाएं", "manage.eventCard.confirmDelete": "क्या आप इस इवेंट को हटाना चाहते हैं? यह क्रिया पूर्ववत नहीं की जा सकती।" },
  hr: { "manage.eventCard.archive": "Arhiviraj", "manage.eventCard.confirmArchive": "Jeste li sigurni da želite arhivirati ovaj događaj?", "manage.eventCard.delete": "Obriši", "manage.eventCard.confirmDelete": "Jeste li sigurni da želite obrisati ovaj događaj? Ova radnja se ne može poništiti." },
  hu: { "manage.eventCard.archive": "Archiválás", "manage.eventCard.confirmArchive": "Biztosan archiválni szeretnéd ezt az eseményt?", "manage.eventCard.delete": "Törlés", "manage.eventCard.confirmDelete": "Biztosan törölni szeretnéd ezt az eseményt? Ez a művelet nem vonható vissza." },
  id: { "manage.eventCard.archive": "Arsipkan", "manage.eventCard.confirmArchive": "Apakah Anda yakin ingin mengarsipkan acara ini?", "manage.eventCard.delete": "Hapus", "manage.eventCard.confirmDelete": "Apakah Anda yakin ingin menghapus acara ini? Tindakan ini tidak dapat dibatalkan." },
  is: { "manage.eventCard.archive": "Setja í safn", "manage.eventCard.confirmArchive": "Ertu viss um að þú viljir setja þennan viðburð í safn?", "manage.eventCard.delete": "Eyða", "manage.eventCard.confirmDelete": "Ertu viss um að þú viljir eyða þessum viðburði? Þessa aðgerð er ekki hægt að afturkalla." },
  it: { "manage.eventCard.archive": "Archivia", "manage.eventCard.confirmArchive": "Sei sicuro di voler archiviare questo evento?", "manage.eventCard.delete": "Elimina", "manage.eventCard.confirmDelete": "Sei sicuro di voler eliminare questo evento? Questa azione non può essere annullata." },
  ja: { "manage.eventCard.archive": "アーカイブ", "manage.eventCard.confirmArchive": "このイベントをアーカイブしますか？", "manage.eventCard.delete": "削除", "manage.eventCard.confirmDelete": "このイベントを削除しますか？この操作は元に戻せません。" },
  ka: { "manage.eventCard.archive": "არქივი", "manage.eventCard.confirmArchive": "დარწმუნებული ხართ, რომ გსურთ ამ ღონისძიების არქივირება?", "manage.eventCard.delete": "წაშლა", "manage.eventCard.confirmDelete": "დარწმუნებული ხართ, რომ გსურთ ამ ღონისძიების წაშლა?" },
  ko: { "manage.eventCard.archive": "보관", "manage.eventCard.confirmArchive": "이 이벤트를 보관하시겠습니까?", "manage.eventCard.delete": "삭제", "manage.eventCard.confirmDelete": "이 이벤트를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다." },
  nb: { "manage.eventCard.archive": "Arkiver", "manage.eventCard.confirmArchive": "Er du sikker på at du vil arkivere dette arrangementet?", "manage.eventCard.delete": "Slett", "manage.eventCard.confirmDelete": "Er du sikker på at du vil slette dette arrangementet? Denne handlingen kan ikke angres." },
  nl: { "manage.eventCard.archive": "Archiveren", "manage.eventCard.confirmArchive": "Weet je zeker dat je dit evenement wilt archiveren?", "manage.eventCard.delete": "Verwijderen", "manage.eventCard.confirmDelete": "Weet je zeker dat je dit evenement wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt." },
  pl: { "manage.eventCard.archive": "Archiwizuj", "manage.eventCard.confirmArchive": "Czy na pewno chcesz zarchiwizować to wydarzenie?", "manage.eventCard.delete": "Usuń", "manage.eventCard.confirmDelete": "Czy na pewno chcesz usunąć to wydarzenie? Tej operacji nie można cofnąć." },
  pt: { "manage.eventCard.archive": "Arquivar", "manage.eventCard.confirmArchive": "Tem certeza de que deseja arquivar este evento?", "manage.eventCard.delete": "Excluir", "manage.eventCard.confirmDelete": "Tem certeza de que deseja excluir este evento? Esta ação não pode ser desfeita." },
  ro: { "manage.eventCard.archive": "Arhivează", "manage.eventCard.confirmArchive": "Sigur doriți să arhivați acest eveniment?", "manage.eventCard.delete": "Șterge", "manage.eventCard.confirmDelete": "Sigur doriți să ștergeți acest eveniment? Această acțiune nu poate fi anulată." },
  ru: { "manage.eventCard.archive": "Архивировать", "manage.eventCard.confirmArchive": "Вы уверены, что хотите архивировать это мероприятие?", "manage.eventCard.delete": "Удалить", "manage.eventCard.confirmDelete": "Вы уверены, что хотите удалить это мероприятие? Это действие нельзя отменить." },
  sk: { "manage.eventCard.archive": "Archivovať", "manage.eventCard.confirmArchive": "Ste si istí, že chcete archivovať túto udalosť?", "manage.eventCard.delete": "Vymazať", "manage.eventCard.confirmDelete": "Ste si istí, že chcete vymazať túto udalosť? Túto akciu nie je možné vrátiť." },
  sl: { "manage.eventCard.archive": "Arhiviraj", "manage.eventCard.confirmArchive": "Ali ste prepričani, da želite arhivirati ta dogodek?", "manage.eventCard.delete": "Izbriši", "manage.eventCard.confirmDelete": "Ali ste prepričani, da želite izbrisati ta dogodek? Tega dejanja ni mogoče razveljaviti." },
  "sr-Latn": { "manage.eventCard.archive": "Arhiviraj", "manage.eventCard.confirmArchive": "Da li ste sigurni da želite da arhivirate ovaj događaj?", "manage.eventCard.delete": "Obriši", "manage.eventCard.confirmDelete": "Da li ste sigurni da želite da obrišete ovaj događaj? Ova radnja se ne može poništiti." },
  sv: { "manage.eventCard.archive": "Arkivera", "manage.eventCard.confirmArchive": "Är du säker på att du vill arkivera detta evenemang?", "manage.eventCard.delete": "Radera", "manage.eventCard.confirmDelete": "Är du säker på att du vill radera detta evenemang? Denna åtgärd kan inte ångras." },
  th: { "manage.eventCard.archive": "เก็บถาวร", "manage.eventCard.confirmArchive": "คุณแน่ใจหรือไม่ว่าต้องการเก็บถาวรกิจกรรมนี้?", "manage.eventCard.delete": "ลบ", "manage.eventCard.confirmDelete": "คุณแน่ใจหรือไม่ว่าต้องการลบกิจกรรมนี้? การดำเนินการนี้ไม่สามารถย้อนกลับได้" },
  tr: { "manage.eventCard.archive": "Arşivle", "manage.eventCard.confirmArchive": "Bu etkinliği arşivlemek istediğinizden emin misiniz?", "manage.eventCard.delete": "Sil", "manage.eventCard.confirmDelete": "Bu etkinliği silmek istediğinizden emin misiniz? Bu işlem geri alınamaz." },
  uk: { "manage.eventCard.archive": "Архівувати", "manage.eventCard.confirmArchive": "Ви впевнені, що хочете архівувати цю подію?", "manage.eventCard.delete": "Видалити", "manage.eventCard.confirmDelete": "Ви впевнені, що хочете видалити цю подію? Цю дію не можна скасувати." },
  vi: { "manage.eventCard.archive": "Lưu trữ", "manage.eventCard.confirmArchive": "Bạn có chắc muốn lưu trữ sự kiện này?", "manage.eventCard.delete": "Xóa", "manage.eventCard.confirmDelete": "Bạn có chắc muốn xóa sự kiện này? Hành động này không thể hoàn tác." },
  zh: { "manage.eventCard.archive": "归档", "manage.eventCard.confirmArchive": "确定要归档此活动吗？", "manage.eventCard.delete": "删除", "manage.eventCard.confirmDelete": "确定要删除此活动吗？此操作无法撤消。" },
  zu: { "manage.eventCard.archive": "Gcina", "manage.eventCard.confirmArchive": "Uqinisekile ukuthi ufuna ukugcina lo mcimbi?", "manage.eventCard.delete": "Susa", "manage.eventCard.confirmDelete": "Uqinisekile ukuthi ufuna ukususa lo mcimbi? Lesi senzo asinakuhlehliswa." },
};

const allLocales = fs.readdirSync(messagesDir)
  .filter(f => f.endsWith(".json") && f !== "en.json")
  .map(f => f.replace(".json", ""));

let updated = 0;
for (const locale of allLocales) {
  const filePath = path.join(messagesDir, `${locale}.json`);
  const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const translations = T[locale] || EN_KEYS;
  let changed = false;
  for (const [key, value] of Object.entries(translations)) {
    if (content[key] !== value) { content[key] = value; changed = true; }
  }
  for (const [key, value] of Object.entries(EN_KEYS)) {
    if (!content[key]) { content[key] = value; changed = true; }
  }
  if (changed) {
    const sorted = Object.fromEntries(Object.entries(content).sort(([a], [b]) => a.localeCompare(b)));
    fs.writeFileSync(filePath, JSON.stringify(sorted, null, 2) + "\n");
    console.log(`Updated ${locale}`);
    updated++;
  }
}
console.log(`\nDone: ${updated} locale files updated.`);
