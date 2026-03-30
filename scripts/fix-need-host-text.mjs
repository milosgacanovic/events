#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const messagesDir = path.join(__dirname, "../apps/web/i18n/messages");

const KEYS = {
  "manage.onboarding.needHostTitle": "One more step to get started",
  "manage.onboarding.needHostMessage": "Create a host profile to represent you or your organization as an event organizer. Once linked to your events, you'll be able to publish them.",
};

const T = {
  ar: { "manage.onboarding.needHostTitle": "خطوة أخيرة للبدء", "manage.onboarding.needHostMessage": "أنشئ ملف مضيف ليمثلك أو مؤسستك كمنظم أحداث. بمجرد ربطه بأحداثك، ستتمكن من نشرها." },
  cs: { "manage.onboarding.needHostTitle": "Ještě jeden krok", "manage.onboarding.needHostMessage": "Vytvořte profil pořadatele, který bude reprezentovat vás nebo vaši organizaci. Po propojení s vašimi akcemi je budete moci publikovat." },
  da: { "manage.onboarding.needHostTitle": "Et skridt mere", "manage.onboarding.needHostMessage": "Opret en værtsprofil for at repræsentere dig eller din organisation. Når den er knyttet til dine begivenheder, kan du publicere dem." },
  de: { "manage.onboarding.needHostTitle": "Noch ein Schritt", "manage.onboarding.needHostMessage": "Erstelle ein Veranstalter-Profil, das dich oder deine Organisation repräsentiert. Sobald es mit deinen Events verknüpft ist, kannst du sie veröffentlichen." },
  el: { "manage.onboarding.needHostTitle": "Ένα ακόμη βήμα", "manage.onboarding.needHostMessage": "Δημιουργήστε ένα προφίλ διοργανωτή. Αφού συνδεθεί με τις εκδηλώσεις σας, θα μπορείτε να τις δημοσιεύσετε." },
  es: { "manage.onboarding.needHostTitle": "Un paso más para empezar", "manage.onboarding.needHostMessage": "Crea un perfil de organizador que te represente. Una vez vinculado a tus eventos, podrás publicarlos." },
  fi: { "manage.onboarding.needHostTitle": "Vielä yksi askel", "manage.onboarding.needHostMessage": "Luo järjestäjäprofiili edustamaan sinua tai organisaatiotasi. Kun se on liitetty tapahtumiisi, voit julkaista ne." },
  fr: { "manage.onboarding.needHostTitle": "Encore une étape", "manage.onboarding.needHostMessage": "Créez un profil organisateur pour vous représenter. Une fois lié à vos événements, vous pourrez les publier." },
  he: { "manage.onboarding.needHostTitle": "עוד צעד אחד", "manage.onboarding.needHostMessage": "צרו פרופיל מארגן שייצג אתכם. לאחר חיבורו לאירועים, תוכלו לפרסם אותם." },
  hi: { "manage.onboarding.needHostTitle": "शुरू करने के लिए एक और कदम", "manage.onboarding.needHostMessage": "अपना या अपने संगठन का प्रतिनिधित्व करने के लिए एक होस्ट प्रोफ़ाइल बनाएं। इवेंट से जुड़ने के बाद, आप उन्हें प्रकाशित कर सकेंगे।" },
  hr: { "manage.onboarding.needHostTitle": "Još jedan korak", "manage.onboarding.needHostMessage": "Kreirajte profil organizatora. Nakon povezivanja s vašim događajima, moći ćete ih objaviti." },
  hu: { "manage.onboarding.needHostTitle": "Még egy lépés", "manage.onboarding.needHostMessage": "Hozz létre egy szervező profilt. Az eseményeidhez csatolva publikálni tudod őket." },
  id: { "manage.onboarding.needHostTitle": "Satu langkah lagi", "manage.onboarding.needHostMessage": "Buat profil host untuk mewakili Anda. Setelah ditautkan ke acara Anda, Anda dapat mempublikasikannya." },
  is: { "manage.onboarding.needHostTitle": "Eitt skref eftir", "manage.onboarding.needHostMessage": "Búðu til gestgjafaprófíl. Þegar hann er tengdur viðburðunum þínum geturðu birt þá." },
  it: { "manage.onboarding.needHostTitle": "Ancora un passaggio", "manage.onboarding.needHostMessage": "Crea un profilo organizzatore che ti rappresenti. Una volta collegato ai tuoi eventi, potrai pubblicarli." },
  ja: { "manage.onboarding.needHostTitle": "あと一歩です", "manage.onboarding.needHostMessage": "ホストプロフィールを作成してください。イベントにリンクすると公開できるようになります。" },
  ka: { "manage.onboarding.needHostTitle": "კიდევ ერთი ნაბიჯი", "manage.onboarding.needHostMessage": "შექმენით ორგანიზატორის პროფილი. ღონისძიებებთან დაკავშირების შემდეგ შეძლებთ მათ გამოქვეყნებას." },
  ko: { "manage.onboarding.needHostTitle": "한 단계만 더", "manage.onboarding.needHostMessage": "호스트 프로필을 만들어 주세요. 이벤트에 연결하면 게시할 수 있습니다." },
  nb: { "manage.onboarding.needHostTitle": "Ett steg igjen", "manage.onboarding.needHostMessage": "Opprett en arrangørprofil. Når den er knyttet til arrangementene dine, kan du publisere dem." },
  nl: { "manage.onboarding.needHostTitle": "Nog één stap", "manage.onboarding.needHostMessage": "Maak een organisatorprofiel aan. Zodra het aan je evenementen is gekoppeld, kun je ze publiceren." },
  pl: { "manage.onboarding.needHostTitle": "Jeszcze jeden krok", "manage.onboarding.needHostMessage": "Utwórz profil organizatora. Po powiązaniu z wydarzeniami będziesz mógł je opublikować." },
  pt: { "manage.onboarding.needHostTitle": "Mais um passo", "manage.onboarding.needHostMessage": "Crie um perfil de organizador. Depois de vinculá-lo aos seus eventos, você poderá publicá-los." },
  ro: { "manage.onboarding.needHostTitle": "Încă un pas", "manage.onboarding.needHostMessage": "Creați un profil de organizator. Odată legat de evenimentele dvs., le veți putea publica." },
  ru: { "manage.onboarding.needHostTitle": "Ещё один шаг", "manage.onboarding.needHostMessage": "Создайте профиль организатора. После привязки к мероприятиям вы сможете их опубликовать." },
  sk: { "manage.onboarding.needHostTitle": "Ešte jeden krok", "manage.onboarding.needHostMessage": "Vytvorte profil organizátora. Po prepojení s vašimi udalosťami ich budete môcť zverejniť." },
  sl: { "manage.onboarding.needHostTitle": "Še en korak", "manage.onboarding.needHostMessage": "Ustvarite profil organizatorja. Ko bo povezan z vašimi dogodki, jih boste lahko objavili." },
  "sr-Latn": { "manage.onboarding.needHostTitle": "Još jedan korak", "manage.onboarding.needHostMessage": "Kreirajte profil organizatora. Nakon povezivanja sa vašim događajima, moći ćete da ih objavite." },
  sv: { "manage.onboarding.needHostTitle": "Ett steg kvar", "manage.onboarding.needHostMessage": "Skapa en värdprofil. När den är kopplad till dina evenemang kan du publicera dem." },
  th: { "manage.onboarding.needHostTitle": "อีกขั้นตอนหนึ่ง", "manage.onboarding.needHostMessage": "สร้างโปรไฟล์ผู้จัด เมื่อเชื่อมโยงกับกิจกรรมแล้ว คุณจะสามารถเผยแพร่ได้" },
  tr: { "manage.onboarding.needHostTitle": "Bir adım daha", "manage.onboarding.needHostMessage": "Sizi temsil edecek bir organizatör profili oluşturun. Etkinliklerinize bağlandığında yayınlayabilirsiniz." },
  uk: { "manage.onboarding.needHostTitle": "Ще один крок", "manage.onboarding.needHostMessage": "Створіть профіль організатора. Після прив'язки до подій ви зможете їх опублікувати." },
  vi: { "manage.onboarding.needHostTitle": "Thêm một bước nữa", "manage.onboarding.needHostMessage": "Tạo hồ sơ người tổ chức. Sau khi liên kết với sự kiện, bạn có thể xuất bản chúng." },
  zh: { "manage.onboarding.needHostTitle": "再一步即可开始", "manage.onboarding.needHostMessage": "创建一个主办方资料。与活动关联后，您就可以发布它们了。" },
  zu: { "manage.onboarding.needHostTitle": "Isinyathelo esisodwa esisele", "manage.onboarding.needHostMessage": "Dala iphrofayili yomsingathi. Uma ixhunyiwe nemicimbi yakho, uzokwazi ukuyishicilela." },
};

const allLocales = fs.readdirSync(messagesDir)
  .filter(f => f.endsWith(".json") && f !== "en.json")
  .map(f => f.replace(".json", ""));

let updated = 0;
for (const locale of allLocales) {
  const filePath = path.join(messagesDir, `${locale}.json`);
  const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const translations = T[locale] || KEYS;
  let changed = false;
  for (const [key, value] of Object.entries(translations)) {
    if (content[key] !== value) { content[key] = value; changed = true; }
  }
  for (const [key, value] of Object.entries(KEYS)) {
    if (!content[key]) { content[key] = value; changed = true; }
  }
  if (changed) {
    const sorted = Object.fromEntries(Object.entries(content).sort(([a], [b]) => a.localeCompare(b)));
    fs.writeFileSync(filePath, JSON.stringify(sorted, null, 2) + "\n");
    console.log(`Updated ${locale}`);
    updated++;
  }
}
console.log(`Done: ${updated} updated.`);
