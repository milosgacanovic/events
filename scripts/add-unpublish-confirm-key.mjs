#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const messagesDir = path.join(__dirname, "../apps/web/i18n/messages");

const KEYS = {
  "manage.hostForm.unpublishHasActiveEventsConfirm": {
    en: "This host is linked to published events. Changing its status will hide it from those event pages. Are you sure?",
    ar: "هذا المضيف مرتبط بأحداث منشورة. تغيير حالته سيخفيه من صفحات تلك الأحداث. هل أنت متأكد؟",
    cs: "Tento hostitel je propojen s publikovanými akcemi. Změna stavu ho skryje na stránkách těchto akcí. Opravdu chcete pokračovat?",
    da: "Denne vært er knyttet til offentliggjorte begivenheder. Ændring af status vil skjule den fra disse begivenhedssider. Er du sikker?",
    de: "Dieser Veranstalter ist mit veröffentlichten Veranstaltungen verknüpft. Eine Statusänderung wird ihn auf diesen Veranstaltungsseiten ausblenden. Sind Sie sicher?",
    el: "Αυτός ο διοργανωτής είναι συνδεδεμένος με δημοσιευμένες εκδηλώσεις. Η αλλαγή κατάστασης θα τον κρύψει από αυτές τις σελίδες εκδηλώσεων. Είστε σίγουροι;",
    es: "Este organizador está vinculado a eventos publicados. Cambiar su estado lo ocultará de esas páginas de eventos. ¿Está seguro?",
    fi: "Tämä isäntä on linkitetty julkaistuihin tapahtumiin. Tilan muuttaminen piilottaa sen näiltä tapahtumisivuilta. Oletko varma?",
    fr: "Cet organisateur est lié à des événements publiés. Changer son statut le masquera de ces pages d'événements. Êtes-vous sûr ?",
    he: "מארח זה מקושר לאירועים מפורסמים. שינוי הסטטוס יסתיר אותו מדפי האירועים הללו. האם אתה בטוח?",
    hi: "यह होस्ट प्रकाशित इवेंट्स से जुड़ा है। स्थिति बदलने से यह उन इवेंट पृष्ठों से छिप जाएगा। क्या आप सुनिश्चित हैं?",
    hr: "Ovaj organizator je povezan s objavljenim događajima. Promjena statusa će ga sakriti s tih stranica događaja. Jeste li sigurni?",
    hu: "Ez a szervező publikált eseményekhez van kapcsolva. A státusz módosítása elrejti az adott eseményoldalakról. Biztos benne?",
    id: "Host ini terhubung ke acara yang dipublikasikan. Mengubah statusnya akan menyembunyikannya dari halaman acara tersebut. Apakah Anda yakin?",
    is: "Þessi gestgjafi er tengdur birtum viðburðum. Breyting á stöðu mun fela hann af þessum viðburðasíðum. Ertu viss?",
    it: "Questo organizzatore è collegato a eventi pubblicati. Cambiare il suo stato lo nasconderà da quelle pagine degli eventi. Sei sicuro?",
    ja: "このホストは公開中のイベントにリンクされています。ステータスを変更すると、それらのイベントページから非表示になります。よろしいですか？",
    ka: "ეს მასპინძელი დაკავშირებულია გამოქვეყნებულ ღონისძიებებთან. სტატუსის შეცვლა დამალავს მას ამ ღონისძიებების გვერდებიდან. დარწმუნებული ხართ?",
    ko: "이 호스트는 게시된 이벤트에 연결되어 있습니다. 상태를 변경하면 해당 이벤트 페이지에서 숨겨집니다. 계속하시겠습니까?",
    nb: "Denne verten er knyttet til publiserte arrangementer. Endring av status vil skjule den fra disse arrangementssidene. Er du sikker?",
    nl: "Deze organisator is gekoppeld aan gepubliceerde evenementen. Het wijzigen van de status verbergt deze van die evenementenpagina's. Weet u het zeker?",
    pl: "Ten organizator jest powiązany z opublikowanymi wydarzeniami. Zmiana statusu ukryje go na stronach tych wydarzeń. Czy jesteś pewien?",
    pt: "Este organizador está vinculado a eventos publicados. Alterar o status irá ocultá-lo dessas páginas de eventos. Tem certeza?",
    ro: "Acest organizator este legat de evenimente publicate. Schimbarea statutului îl va ascunde de pe paginile acelor evenimente. Sunteți sigur?",
    ru: "Этот организатор связан с опубликованными мероприятиями. Изменение статуса скроет его со страниц этих мероприятий. Вы уверены?",
    sk: "Tento hostiteľ je prepojený s publikovanými akciami. Zmena stavu ho skryje na stránkach týchto akcií. Ste si istý?",
    sl: "Ta organizator je povezan z objavljenimi dogodki. Sprememba statusa ga bo skrila s teh strani dogodkov. Ste prepričani?",
    "sr-Latn": "Ovaj organizator je povezan sa objavljenim događajima. Promena statusa će ga sakriti sa tih stranica događaja. Da li ste sigurni?",
    sv: "Denna värd är kopplad till publicerade evenemang. Ändring av status döljer den från dessa evenemangssidor. Är du säker?",
    th: "โฮสต์นี้เชื่อมโยงกับกิจกรรมที่เผยแพร่แล้ว การเปลี่ยนสถานะจะซ่อนจากหน้ากิจกรรมเหล่านั้น คุณแน่ใจหรือไม่?",
    tr: "Bu organizatör yayınlanmış etkinliklerle bağlantılı. Durumu değiştirmek onu bu etkinlik sayfalarından gizleyecektir. Emin misiniz?",
    uk: "Цей організатор пов'язаний з опублікованими подіями. Зміна статусу приховає його зі сторінок цих подій. Ви впевнені?",
    vi: "Nhà tổ chức này được liên kết với các sự kiện đã xuất bản. Thay đổi trạng thái sẽ ẩn nó khỏi các trang sự kiện đó. Bạn có chắc không?",
    zh: "此主办方已关联到已发布的活动。更改状态将使其从这些活动页面中隐藏。您确定吗？",
    zu: "Lo msingathi uxhunywe nemicimbi eshicilelwe. Ukushintsha isimo kuzomfihla kulawo makhasi emicimbi. Uqinisekile?",
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
