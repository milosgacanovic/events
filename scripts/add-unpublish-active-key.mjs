#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const messagesDir = path.join(__dirname, "../apps/web/i18n/messages");

const KEY = "manage.hostCard.unpublishHasActiveEvents";

const T = {
  en: "This host cannot be unpublished or archived because it is linked to published events. Unpublish or remove those events first.",
  ar: "لا يمكن إلغاء نشر أو أرشفة هذا المضيف لأنه مرتبط بأحداث منشورة. قم بإلغاء نشر أو إزالة تلك الأحداث أولاً.",
  cs: "Tohoto hostitele nelze zrušit publikaci ani archivovat, protože je propojen s publikovanými akcemi. Nejprve zrušte publikaci nebo odstraňte tyto akce.",
  da: "Denne vært kan ikke afpubliceres eller arkiveres, fordi den er knyttet til publicerede begivenheder. Afpublicer eller fjern disse begivenheder først.",
  de: "Dieser Veranstalter kann nicht unveröffentlicht oder archiviert werden, da er mit veröffentlichten Veranstaltungen verknüpft ist. Veröffentlichung der Veranstaltungen zuerst aufheben oder entfernen.",
  el: "Αυτός ο διοργανωτής δεν μπορεί να αποδημοσιευτεί ή να αρχειοθετηθεί επειδή συνδέεται με δημοσιευμένες εκδηλώσεις. Αποδημοσιεύστε ή αφαιρέστε πρώτα αυτές τις εκδηλώσεις.",
  es: "Este organizador no se puede despublicar ni archivar porque está vinculado a eventos publicados. Despublica o elimina esos eventos primero.",
  fi: "Tätä isäntää ei voi poistaa julkaisusta tai arkistoida, koska se on linkitetty julkaistuihin tapahtumiin. Poista ensin julkaisu tai poista nuo tapahtumat.",
  fr: "Cet organisateur ne peut pas être dépublié ou archivé car il est lié à des événements publiés. Dépubliez ou supprimez d'abord ces événements.",
  he: "לא ניתן לבטל פרסום או לאחסן מארח זה כי הוא מקושר לאירועים מפורסמים. בטל פרסום או הסר אירועים אלה קודם.",
  hi: "इस होस्ट को अप्रकाशित या संग्रहीत नहीं किया जा सकता क्योंकि यह प्रकाशित इवेंट्स से जुड़ा है। पहले उन इवेंट्स को अप्रकाशित करें या हटाएं।",
  hr: "Ovaj organizator ne može biti odpublikiran ili arhiviran jer je povezan s publikiranim događajima. Prvo odpublikirajte ili uklonite te događaje.",
  hu: "Ez a szervező nem vonható vissza vagy archiválható, mert közzétett eseményekhez van kapcsolva. Először vonja vissza vagy távolítsa el azokat az eseményeket.",
  id: "Host ini tidak dapat dibatalkan publikasinya atau diarsipkan karena terhubung dengan acara yang dipublikasikan. Batalkan publikasi atau hapus acara tersebut terlebih dahulu.",
  is: "Þennan gestgjafa er ekki hægt að afbirta eða setja í geymslu vegna þess að hann er tengdur birtum viðburðum. Afbirtaðu eða fjarlægðu þá viðburði fyrst.",
  it: "Questo organizzatore non può essere depubblicato o archiviato perché è collegato a eventi pubblicati. Depubblica o rimuovi prima quegli eventi.",
  ja: "この主催者は公開されたイベントにリンクされているため、非公開またはアーカイブできません。先にそれらのイベントを非公開にするか削除してください。",
  ka: "ეს მასპინძელი ვერ გაუქმდება ან დაარქივდება, რადგან ის გამოქვეყნებულ ღონისძიებებთანაა დაკავშირებული. ჯერ გაუქმეთ ან წაშალეთ ეს ღონისძიებები.",
  ko: "이 호스트는 게시된 이벤트에 연결되어 있어 게시 취소하거나 보관할 수 없습니다. 먼저 해당 이벤트를 게시 취소하거나 제거하세요.",
  nb: "Denne verten kan ikke avpubliseres eller arkiveres fordi den er knyttet til publiserte arrangementer. Avpubliser eller fjern disse arrangementene først.",
  nl: "Deze organisator kan niet worden gedepubliceerd of gearchiveerd omdat deze is gekoppeld aan gepubliceerde evenementen. Depubliceer of verwijder die evenementen eerst.",
  pl: "Tego organizatora nie można cofnąć publikacji ani zarchiwizować, ponieważ jest powiązany z opublikowanymi wydarzeniami. Najpierw cofnij publikację lub usuń te wydarzenia.",
  pt: "Este organizador não pode ser despublicado ou arquivado porque está vinculado a eventos publicados. Despublique ou remova esses eventos primeiro.",
  ro: "Acest organizator nu poate fi depublicat sau arhivat deoarece este legat de evenimente publicate. Depublicați sau eliminați mai întâi acele evenimente.",
  ru: "Этого организатора нельзя снять с публикации или архивировать, так как он связан с опубликованными мероприятиями. Сначала снимите с публикации или удалите эти мероприятия.",
  sk: "Tohto hostiteľa nemožno zrušiť publikáciu ani archivovať, pretože je prepojený s publikovanými akciami. Najprv zrušte publikáciu alebo odstráňte tieto akcie.",
  sl: "Tega organizatorja ni mogoče odpublikirati ali arhivirati, ker je povezan z objavljenimi dogodki. Najprej odpublikirajte ali odstranite te dogodke.",
  "sr-Latn": "Ovaj organizator ne može biti otpublikovan ili arhiviran jer je povezan sa publikovanim događajima. Prvo otpublikujte ili uklonite te događaje.",
  sv: "Denna värd kan inte avpubliceras eller arkiveras eftersom den är kopplad till publicerade evenemang. Avpublicera eller ta bort dessa evenemang först.",
  th: "โฮสต์นี้ไม่สามารถยกเลิกการเผยแพร่หรือเก็บถาวรได้เนื่องจากเชื่อมโยงกับกิจกรรมที่เผยแพร่แล้ว ยกเลิกการเผยแพร่หรือลบกิจกรรมเหล่านั้นก่อน",
  tr: "Bu organizatör, yayınlanmış etkinliklerle bağlantılı olduğu için yayından kaldırılamaz veya arşivlenemez. Önce bu etkinlikleri yayından kaldırın veya silin.",
  uk: "Цього організатора не можна зняти з публікації або архівувати, оскільки він пов'язаний з опублікованими подіями. Спочатку зніміть з публікації або видаліть ці події.",
  vi: "Không thể hủy xuất bản hoặc lưu trữ nhà tổ chức này vì được liên kết với các sự kiện đã xuất bản. Hủy xuất bản hoặc xóa các sự kiện đó trước.",
  zh: "此主办方无法取消发布或归档，因为它与已发布的活动关联。请先取消发布或删除那些活动。",
  zu: "Lo msingathi ngeke akwazi ukukhishwa ekushicilelweni noma efakwe emgcinweni ngoba uxhumene nemicimbi eshicileliwe. Khipha ekushicileleni noma ususe leyo micimbi kuqala.",
};

for (const file of fs.readdirSync(messagesDir)) {
  if (!file.endsWith(".json")) continue;
  const locale = file.replace(".json", "");
  const filePath = path.join(messagesDir, file);
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (data[KEY]) continue; // already has it
  data[KEY] = T[locale] || T.en;
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
  console.log(`✓ ${locale}`);
}
console.log("Done.");
