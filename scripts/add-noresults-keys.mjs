import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const messagesDir = join(__dirname, '../apps/web/i18n/messages');

const TRANSLATIONS = {
  ar: { "manage.events.noResults": "لا توجد فعاليات تطابق فلاترك.", "manage.hosts.noResults": "لا يوجد مضيفون يطابقون فلاترك." },
  cs: { "manage.events.noResults": "Žádné akce neodpovídají vašim filtrům.", "manage.hosts.noResults": "Žádní organizátoři neodpovídají vašim filtrům." },
  da: { "manage.events.noResults": "Ingen arrangementer matcher dine filtre.", "manage.hosts.noResults": "Ingen arrangører matcher dine filtre." },
  de: { "manage.events.noResults": "Keine Veranstaltungen entsprechen deinen Filtern.", "manage.hosts.noResults": "Keine Veranstalter entsprechen deinen Filtern." },
  el: { "manage.events.noResults": "Δεν υπάρχουν εκδηλώσεις που να ταιριάζουν με τα φίλτρα σας.", "manage.hosts.noResults": "Δεν υπάρχουν διοργανωτές που να ταιριάζουν με τα φίλτρα σας." },
  es: { "manage.events.noResults": "No hay eventos que coincidan con tus filtros.", "manage.hosts.noResults": "No hay organizadores que coincidan con tus filtros." },
  fi: { "manage.events.noResults": "Yksikään tapahtuma ei vastaa suodattimiasi.", "manage.hosts.noResults": "Yksikään järjestäjä ei vastaa suodattimiasi." },
  fr: { "manage.events.noResults": "Aucun événement ne correspond à vos filtres.", "manage.hosts.noResults": "Aucun organisateur ne correspond à vos filtres." },
  he: { "manage.events.noResults": "אין אירועים התואמים את הסינון שלך.", "manage.hosts.noResults": "אין מארגנים התואמים את הסינון שלך." },
  hi: { "manage.events.noResults": "आपके फ़िल्टर से मेल खाने वाले कोई कार्यक्रम नहीं हैं।", "manage.hosts.noResults": "आपके फ़िल्टर से मेल खाने वाले कोई होस्ट नहीं हैं।" },
  hr: { "manage.events.noResults": "Nijedan događaj ne odgovara vašim filterima.", "manage.hosts.noResults": "Nijedan organizator ne odgovara vašim filterima." },
  hu: { "manage.events.noResults": "Nincs a szűrőknek megfelelő esemény.", "manage.hosts.noResults": "Nincs a szűrőknek megfelelő szervező." },
  id: { "manage.events.noResults": "Tidak ada acara yang sesuai dengan filter Anda.", "manage.hosts.noResults": "Tidak ada penyelenggara yang sesuai dengan filter Anda." },
  is: { "manage.events.noResults": "Engar viðburðir passa við síur þínar.", "manage.hosts.noResults": "Engir gestgjafar passa við síur þínar." },
  it: { "manage.events.noResults": "Nessun evento corrisponde ai tuoi filtri.", "manage.hosts.noResults": "Nessun organizzatore corrisponde ai tuoi filtri." },
  ja: { "manage.events.noResults": "フィルターに一致するイベントがありません。", "manage.hosts.noResults": "フィルターに一致するホストがありません。" },
  ka: { "manage.events.noResults": "არცერთი ღონისძიება არ შეესაბამება თქვენს ფილტრებს.", "manage.hosts.noResults": "არცერთი მასპინძელი არ შეესაბამება თქვენს ფილტრებს." },
  ko: { "manage.events.noResults": "필터와 일치하는 이벤트가 없습니다.", "manage.hosts.noResults": "필터와 일치하는 호스트가 없습니다." },
  nb: { "manage.events.noResults": "Ingen arrangementer samsvarer med filtrene dine.", "manage.hosts.noResults": "Ingen arrangører samsvarer med filtrene dine." },
  nl: { "manage.events.noResults": "Geen evenementen komen overeen met uw filters.", "manage.hosts.noResults": "Geen organisatoren komen overeen met uw filters." },
  pl: { "manage.events.noResults": "Żadne wydarzenie nie pasuje do Twoich filtrów.", "manage.hosts.noResults": "Żaden organizator nie pasuje do Twoich filtrów." },
  pt: { "manage.events.noResults": "Nenhum evento corresponde aos seus filtros.", "manage.hosts.noResults": "Nenhum organizador corresponde aos seus filtros." },
  ro: { "manage.events.noResults": "Niciun eveniment nu corespunde filtrelor tale.", "manage.hosts.noResults": "Niciun organizator nu corespunde filtrelor tale." },
  ru: { "manage.events.noResults": "Нет мероприятий, соответствующих вашим фильтрам.", "manage.hosts.noResults": "Нет организаторов, соответствующих вашим фильтрам." },
  sk: { "manage.events.noResults": "Žiadne podujatia nezodpovedajú vašim filtrom.", "manage.hosts.noResults": "Žiadni organizátori nezodpovedajú vašim filtrom." },
  sl: { "manage.events.noResults": "Noben dogodek ne ustreza vašim filtrom.", "manage.hosts.noResults": "Noben gostitelj ne ustreza vašim filtrom." },
  "sr-Latn": { "manage.events.noResults": "Nijedan događaj ne odgovara vašim filterima.", "manage.hosts.noResults": "Nijedan organizator ne odgovara vašim filterima." },
  sv: { "manage.events.noResults": "Inga evenemang matchar dina filter.", "manage.hosts.noResults": "Inga arrangörer matchar dina filter." },
  th: { "manage.events.noResults": "ไม่มีกิจกรรมที่ตรงกับตัวกรองของคุณ", "manage.hosts.noResults": "ไม่มีผู้จัดที่ตรงกับตัวกรองของคุณ" },
  tr: { "manage.events.noResults": "Filtrelerinizle eşleşen etkinlik yok.", "manage.hosts.noResults": "Filtrelerinizle eşleşen organizatör yok." },
  uk: { "manage.events.noResults": "Жодна подія не відповідає вашим фільтрам.", "manage.hosts.noResults": "Жоден організатор не відповідає вашим фільтрам." },
  vi: { "manage.events.noResults": "Không có sự kiện nào phù hợp với bộ lọc của bạn.", "manage.hosts.noResults": "Không có người tổ chức nào phù hợp với bộ lọc của bạn." },
  zh: { "manage.events.noResults": "没有与您筛选条件匹配的活动。", "manage.hosts.noResults": "没有与您筛选条件匹配的主办方。" },
  zu: { "manage.events.noResults": "Ayikho imicimbi efanele izihlungi zakho.", "manage.hosts.noResults": "Ayikho abaqophi abafanele izihlungi zakho." },
};

const EN = JSON.parse(readFileSync(join(messagesDir, 'en.json'), 'utf8'));

for (const [locale, translations] of Object.entries(TRANSLATIONS)) {
  const filePath = join(messagesDir, `${locale}.json`);
  const data = JSON.parse(readFileSync(filePath, 'utf8'));
  let changed = 0;
  for (const [key, value] of Object.entries(translations)) {
    if (data[key] === undefined || data[key] === EN[key]) {
      data[key] = value;
      changed++;
    }
  }
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
  console.log(`${locale}: ${changed} keys updated`);
}
