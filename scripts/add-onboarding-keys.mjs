#!/usr/bin/env node
// Adds onboarding/host-related i18n keys to all locale files

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const messagesDir = path.join(__dirname, "../apps/web/i18n/messages");

const EN_KEYS = {
  "manage.hostLinker.noHostsBanner": "You don't have a host profile yet. Create one to link it to this event.",
  "manage.hostLinker.noHostsBannerHint": "Your event will be saved as a draft first.",
  "manage.hostLinker.createHost": "Save & Create Host",
  "manage.eventForm.publishRequiresHost": "This event needs at least one host before it can be published. Add a host in the Hosts section, then try publishing again.",
  "manage.eventForm.publishRequiresHostTitle": "Host required",
  "manage.eventForm.goToHosts": "Go to Hosts",
  "manage.eventCard.noHost": "No host",
  "manage.eventCard.addHost": "Add host",
  "manage.onboarding.welcomeTitle": "Welcome to your manage area!",
  "manage.onboarding.welcomeMessage": "Start by creating a host profile \u2014 this represents you or your organization as an event organizer. Once you have a host, you can create events and link them to it. Every event needs at least one host.",
  "manage.onboarding.needHostTitle": "You need a host profile",
  "manage.onboarding.needHostMessage": "Your events need a host before they can be published. A host profile represents you or your organization as an event organizer.",
  "manage.onboarding.createFirstHost": "Create Your First Host",
  "manage.onboarding.hostReadyTitle": "Your host profile is ready!",
  "manage.onboarding.hostReadyMessage": "Now create your first event. You'll be able to set the schedule, location, and link it to your host profile so attendees know who's organizing.",
  "manage.onboarding.createFirstEvent": "Create Your First Event",
  "manage.events.needHostFirst": "You'll need a host profile first.",
  "manage.events.createHostLink": "Create one",
};

const TRANSLATIONS = {
  ar: {
    "manage.hostLinker.noHostsBanner": "ليس لديك ملف مضيف بعد. أنشئ واحدًا لربطه بهذا الحدث.",
    "manage.hostLinker.noHostsBannerHint": "سيتم حفظ الحدث كمسودة أولاً.",
    "manage.hostLinker.createHost": "حفظ وإنشاء مضيف",
    "manage.eventForm.publishRequiresHost": "يحتاج هذا الحدث إلى مضيف واحد على الأقل قبل نشره. أضف مضيفًا في قسم المضيفين، ثم حاول النشر مرة أخرى.",
    "manage.eventForm.publishRequiresHostTitle": "مضيف مطلوب",
    "manage.eventForm.goToHosts": "الذهاب إلى المضيفين",
    "manage.eventCard.noHost": "بدون مضيف",
    "manage.eventCard.addHost": "إضافة مضيف",
    "manage.onboarding.welcomeTitle": "مرحبًا بك في منطقة الإدارة!",
    "manage.onboarding.welcomeMessage": "ابدأ بإنشاء ملف مضيف — يمثل هذا أنت أو مؤسستك كمنظم أحداث. بمجرد أن يكون لديك مضيف، يمكنك إنشاء أحداث وربطها به. يحتاج كل حدث إلى مضيف واحد على الأقل.",
    "manage.onboarding.needHostTitle": "أنت بحاجة إلى ملف مضيف",
    "manage.onboarding.needHostMessage": "تحتاج أحداثك إلى مضيف قبل نشرها. يمثل ملف المضيف أنت أو مؤسستك كمنظم أحداث.",
    "manage.onboarding.createFirstHost": "أنشئ أول مضيف",
    "manage.onboarding.hostReadyTitle": "ملف المضيف جاهز!",
    "manage.onboarding.hostReadyMessage": "الآن أنشئ أول حدث. ستتمكن من تعيين الجدول والموقع وربطه بملف المضيف.",
    "manage.onboarding.createFirstEvent": "أنشئ أول حدث",
    "manage.events.needHostFirst": "ستحتاج إلى ملف مضيف أولاً.",
    "manage.events.createHostLink": "أنشئ واحدًا",
  },
  cs: {
    "manage.hostLinker.noHostsBanner": "Nemáte profil pořadatele. Vytvořte si jej pro propojení s touto akcí.",
    "manage.hostLinker.noHostsBannerHint": "Vaše akce bude nejprve uložena jako koncept.",
    "manage.hostLinker.createHost": "Uložit a vytvořit pořadatele",
    "manage.eventForm.publishRequiresHost": "Tato akce potřebuje alespoň jednoho pořadatele. Přidejte pořadatele v sekci Pořadatelé a zkuste publikovat znovu.",
    "manage.eventForm.publishRequiresHostTitle": "Pořadatel vyžadován",
    "manage.eventForm.goToHosts": "Přejít na pořadatele",
    "manage.eventCard.noHost": "Bez pořadatele",
    "manage.eventCard.addHost": "Přidat pořadatele",
    "manage.onboarding.welcomeTitle": "Vítejte ve správě!",
    "manage.onboarding.welcomeMessage": "Začněte vytvořením profilu pořadatele — reprezentuje vás nebo vaši organizaci. Jakmile budete mít pořadatele, můžete vytvářet akce. Každá akce potřebuje alespoň jednoho pořadatele.",
    "manage.onboarding.needHostTitle": "Potřebujete profil pořadatele",
    "manage.onboarding.needHostMessage": "Vaše akce potřebují pořadatele před publikováním. Profil pořadatele reprezentuje vás nebo vaši organizaci.",
    "manage.onboarding.createFirstHost": "Vytvořit prvního pořadatele",
    "manage.onboarding.hostReadyTitle": "Profil pořadatele je připraven!",
    "manage.onboarding.hostReadyMessage": "Nyní vytvořte svou první akci. Můžete nastavit rozvrh, místo a propojit ji s pořadatelem.",
    "manage.onboarding.createFirstEvent": "Vytvořit první akci",
    "manage.events.needHostFirst": "Nejprve budete potřebovat profil pořadatele.",
    "manage.events.createHostLink": "Vytvořit",
  },
  da: {
    "manage.hostLinker.noHostsBanner": "Du har ikke en værtsprofil endnu. Opret en for at knytte den til denne begivenhed.",
    "manage.hostLinker.noHostsBannerHint": "Din begivenhed gemmes først som kladde.",
    "manage.hostLinker.createHost": "Gem og opret vært",
    "manage.eventForm.publishRequiresHost": "Denne begivenhed kræver mindst én vært før publicering. Tilføj en vært i Værter-sektionen.",
    "manage.eventForm.publishRequiresHostTitle": "Vært påkrævet",
    "manage.eventForm.goToHosts": "Gå til værter",
    "manage.eventCard.noHost": "Ingen vært",
    "manage.eventCard.addHost": "Tilføj vært",
    "manage.onboarding.welcomeTitle": "Velkommen til dit administrationsområde!",
    "manage.onboarding.welcomeMessage": "Start med at oprette en værtsprofil — den repræsenterer dig eller din organisation som arrangør. Når du har en vært, kan du oprette begivenheder. Hver begivenhed kræver mindst én vært.",
    "manage.onboarding.needHostTitle": "Du har brug for en værtsprofil",
    "manage.onboarding.needHostMessage": "Dine begivenheder kræver en vært før publicering. En værtsprofil repræsenterer dig eller din organisation.",
    "manage.onboarding.createFirstHost": "Opret din første vært",
    "manage.onboarding.hostReadyTitle": "Din værtsprofil er klar!",
    "manage.onboarding.hostReadyMessage": "Opret nu din første begivenhed. Du kan angive tidsplan, sted og knytte den til din vært.",
    "manage.onboarding.createFirstEvent": "Opret din første begivenhed",
    "manage.events.needHostFirst": "Du har først brug for en værtsprofil.",
    "manage.events.createHostLink": "Opret en",
  },
  de: {
    "manage.hostLinker.noHostsBanner": "Du hast noch kein Veranstalter-Profil. Erstelle eines, um es mit diesem Event zu verknüpfen.",
    "manage.hostLinker.noHostsBannerHint": "Dein Event wird zuerst als Entwurf gespeichert.",
    "manage.hostLinker.createHost": "Speichern & Veranstalter erstellen",
    "manage.eventForm.publishRequiresHost": "Dieses Event benötigt mindestens einen Veranstalter. Füge einen in der Veranstalter-Sektion hinzu und versuche es erneut.",
    "manage.eventForm.publishRequiresHostTitle": "Veranstalter erforderlich",
    "manage.eventForm.goToHosts": "Zu Veranstaltern",
    "manage.eventCard.noHost": "Kein Veranstalter",
    "manage.eventCard.addHost": "Veranstalter hinzufügen",
    "manage.onboarding.welcomeTitle": "Willkommen in deinem Verwaltungsbereich!",
    "manage.onboarding.welcomeMessage": "Erstelle zunächst ein Veranstalter-Profil — es repräsentiert dich oder deine Organisation als Eventveranstalter. Sobald du einen Veranstalter hast, kannst du Events erstellen und verknüpfen. Jedes Event braucht mindestens einen Veranstalter.",
    "manage.onboarding.needHostTitle": "Du brauchst ein Veranstalter-Profil",
    "manage.onboarding.needHostMessage": "Deine Events brauchen einen Veranstalter vor der Veröffentlichung. Ein Veranstalter-Profil repräsentiert dich oder deine Organisation.",
    "manage.onboarding.createFirstHost": "Ersten Veranstalter erstellen",
    "manage.onboarding.hostReadyTitle": "Dein Veranstalter-Profil ist bereit!",
    "manage.onboarding.hostReadyMessage": "Erstelle jetzt dein erstes Event. Du kannst den Zeitplan, den Ort und den Veranstalter festlegen.",
    "manage.onboarding.createFirstEvent": "Erstes Event erstellen",
    "manage.events.needHostFirst": "Du brauchst zuerst ein Veranstalter-Profil.",
    "manage.events.createHostLink": "Eines erstellen",
  },
  el: {
    "manage.hostLinker.noHostsBanner": "Δεν έχετε προφίλ διοργανωτή. Δημιουργήστε ένα για να το συνδέσετε με αυτή την εκδήλωση.",
    "manage.hostLinker.noHostsBannerHint": "Η εκδήλωσή σας θα αποθηκευτεί πρώτα ως πρόχειρο.",
    "manage.hostLinker.createHost": "Αποθήκευση & Δημιουργία διοργανωτή",
    "manage.eventForm.publishRequiresHost": "Αυτή η εκδήλωση χρειάζεται τουλάχιστον έναν διοργανωτή. Προσθέστε έναν στην ενότητα Διοργανωτές.",
    "manage.eventForm.publishRequiresHostTitle": "Απαιτείται διοργανωτής",
    "manage.eventForm.goToHosts": "Μετάβαση στους διοργανωτές",
    "manage.eventCard.noHost": "Χωρίς διοργανωτή",
    "manage.eventCard.addHost": "Προσθήκη διοργανωτή",
    "manage.onboarding.welcomeTitle": "Καλώς ήρθατε στη διαχείριση!",
    "manage.onboarding.welcomeMessage": "Ξεκινήστε δημιουργώντας ένα προφίλ διοργανωτή — αντιπροσωπεύει εσάς ή τον οργανισμό σας. Κάθε εκδήλωση χρειάζεται τουλάχιστον έναν διοργανωτή.",
    "manage.onboarding.needHostTitle": "Χρειάζεστε προφίλ διοργανωτή",
    "manage.onboarding.needHostMessage": "Οι εκδηλώσεις σας χρειάζονται διοργανωτή πριν τη δημοσίευση.",
    "manage.onboarding.createFirstHost": "Δημιουργήστε τον πρώτο διοργανωτή",
    "manage.onboarding.hostReadyTitle": "Το προφίλ διοργανωτή είναι έτοιμο!",
    "manage.onboarding.hostReadyMessage": "Τώρα δημιουργήστε την πρώτη σας εκδήλωση.",
    "manage.onboarding.createFirstEvent": "Δημιουργήστε την πρώτη εκδήλωση",
    "manage.events.needHostFirst": "Χρειάζεστε πρώτα ένα προφίλ διοργανωτή.",
    "manage.events.createHostLink": "Δημιουργήστε ένα",
  },
  es: {
    "manage.hostLinker.noHostsBanner": "Aún no tienes un perfil de organizador. Crea uno para vincularlo a este evento.",
    "manage.hostLinker.noHostsBannerHint": "Tu evento se guardará primero como borrador.",
    "manage.hostLinker.createHost": "Guardar y crear organizador",
    "manage.eventForm.publishRequiresHost": "Este evento necesita al menos un organizador. Añade uno en la sección de Organizadores e inténtalo de nuevo.",
    "manage.eventForm.publishRequiresHostTitle": "Organizador requerido",
    "manage.eventForm.goToHosts": "Ir a organizadores",
    "manage.eventCard.noHost": "Sin organizador",
    "manage.eventCard.addHost": "Añadir organizador",
    "manage.onboarding.welcomeTitle": "¡Bienvenido a tu área de gestión!",
    "manage.onboarding.welcomeMessage": "Comienza creando un perfil de organizador — representa a ti o a tu organización como organizador de eventos. Cada evento necesita al menos un organizador.",
    "manage.onboarding.needHostTitle": "Necesitas un perfil de organizador",
    "manage.onboarding.needHostMessage": "Tus eventos necesitan un organizador antes de poder publicarse.",
    "manage.onboarding.createFirstHost": "Crear primer organizador",
    "manage.onboarding.hostReadyTitle": "¡Tu perfil de organizador está listo!",
    "manage.onboarding.hostReadyMessage": "Ahora crea tu primer evento. Podrás establecer el horario, la ubicación y vincularlo a tu organizador.",
    "manage.onboarding.createFirstEvent": "Crear primer evento",
    "manage.events.needHostFirst": "Necesitarás un perfil de organizador primero.",
    "manage.events.createHostLink": "Crear uno",
  },
  fr: {
    "manage.hostLinker.noHostsBanner": "Vous n'avez pas encore de profil organisateur. Créez-en un pour le lier à cet événement.",
    "manage.hostLinker.noHostsBannerHint": "Votre événement sera d'abord enregistré comme brouillon.",
    "manage.hostLinker.createHost": "Enregistrer et créer un organisateur",
    "manage.eventForm.publishRequiresHost": "Cet événement nécessite au moins un organisateur. Ajoutez-en un dans la section Organisateurs et réessayez.",
    "manage.eventForm.publishRequiresHostTitle": "Organisateur requis",
    "manage.eventForm.goToHosts": "Aller aux organisateurs",
    "manage.eventCard.noHost": "Pas d'organisateur",
    "manage.eventCard.addHost": "Ajouter organisateur",
    "manage.onboarding.welcomeTitle": "Bienvenue dans votre espace de gestion !",
    "manage.onboarding.welcomeMessage": "Commencez par créer un profil organisateur — il vous représente en tant qu'organisateur d'événements. Chaque événement a besoin d'au moins un organisateur.",
    "manage.onboarding.needHostTitle": "Vous avez besoin d'un profil organisateur",
    "manage.onboarding.needHostMessage": "Vos événements ont besoin d'un organisateur avant publication.",
    "manage.onboarding.createFirstHost": "Créer votre premier organisateur",
    "manage.onboarding.hostReadyTitle": "Votre profil organisateur est prêt !",
    "manage.onboarding.hostReadyMessage": "Créez maintenant votre premier événement. Vous pourrez définir le calendrier, le lieu et le lier à votre organisateur.",
    "manage.onboarding.createFirstEvent": "Créer votre premier événement",
    "manage.events.needHostFirst": "Vous aurez d'abord besoin d'un profil organisateur.",
    "manage.events.createHostLink": "En créer un",
  },
  "sr-Latn": {
    "manage.hostLinker.noHostsBanner": "Nemate profil organizatora. Kreirajte ga da biste ga povezali sa ovim događajem.",
    "manage.hostLinker.noHostsBannerHint": "Vaš događaj će prvo biti sačuvan kao nacrt.",
    "manage.hostLinker.createHost": "Sačuvaj i kreiraj organizatora",
    "manage.eventForm.publishRequiresHost": "Ovaj događaj zahteva najmanje jednog organizatora. Dodajte ga u sekciji Organizatori i pokušajte ponovo.",
    "manage.eventForm.publishRequiresHostTitle": "Potreban organizator",
    "manage.eventForm.goToHosts": "Idi na organizatore",
    "manage.eventCard.noHost": "Bez organizatora",
    "manage.eventCard.addHost": "Dodaj organizatora",
    "manage.onboarding.welcomeTitle": "Dobrodošli u vaš prostor za upravljanje!",
    "manage.onboarding.welcomeMessage": "Počnite kreiranjem profila organizatora — on predstavlja vas ili vašu organizaciju. Svaki događaj zahteva najmanje jednog organizatora.",
    "manage.onboarding.needHostTitle": "Potreban vam je profil organizatora",
    "manage.onboarding.needHostMessage": "Vaši događaji zahtevaju organizatora pre objavljivanja.",
    "manage.onboarding.createFirstHost": "Kreirajte prvog organizatora",
    "manage.onboarding.hostReadyTitle": "Vaš profil organizatora je spreman!",
    "manage.onboarding.hostReadyMessage": "Sada kreirajte svoj prvi događaj. Moći ćete da podesite raspored, lokaciju i povežete ga sa organizatorom.",
    "manage.onboarding.createFirstEvent": "Kreirajte prvi događaj",
    "manage.events.needHostFirst": "Prvo vam je potreban profil organizatora.",
    "manage.events.createHostLink": "Kreirajte jedan",
  },
  fi: {
    "manage.hostLinker.noHostsBanner": "Sinulla ei ole järjestäjäprofiilia. Luo sellainen liittääksesi sen tähän tapahtumaan.",
    "manage.hostLinker.noHostsBannerHint": "Tapahtumasi tallennetaan ensin luonnoksena.",
    "manage.hostLinker.createHost": "Tallenna ja luo järjestäjä",
    "manage.eventForm.publishRequiresHost": "Tämä tapahtuma tarvitsee vähintään yhden järjestäjän. Lisää järjestäjä ja yritä uudelleen.",
    "manage.eventForm.publishRequiresHostTitle": "Järjestäjä vaaditaan",
    "manage.eventForm.goToHosts": "Siirry järjestäjiin",
    "manage.eventCard.noHost": "Ei järjestäjää",
    "manage.eventCard.addHost": "Lisää järjestäjä",
    "manage.onboarding.welcomeTitle": "Tervetuloa hallintaasi!",
    "manage.onboarding.welcomeMessage": "Aloita luomalla järjestäjäprofiili. Jokainen tapahtuma tarvitsee vähintään yhden järjestäjän.",
    "manage.onboarding.needHostTitle": "Tarvitset järjestäjäprofiilin",
    "manage.onboarding.needHostMessage": "Tapahtumasi tarvitsevat järjestäjän ennen julkaisua.",
    "manage.onboarding.createFirstHost": "Luo ensimmäinen järjestäjä",
    "manage.onboarding.hostReadyTitle": "Järjestäjäprofiilisi on valmis!",
    "manage.onboarding.hostReadyMessage": "Luo nyt ensimmäinen tapahtumasi.",
    "manage.onboarding.createFirstEvent": "Luo ensimmäinen tapahtuma",
    "manage.events.needHostFirst": "Tarvitset ensin järjestäjäprofiilin.",
    "manage.events.createHostLink": "Luo sellainen",
  },
  he: { "manage.eventForm.publishRequiresHostTitle": "נדרש מארגן", "manage.eventForm.goToHosts": "עבור למארגנים", "manage.hostLinker.noHostsBannerHint": "האירוע שלך יישמר קודם כטיוטה.", "manage.hostLinker.createHost": "שמור וצור מארגן", "manage.onboarding.needHostTitle": "אתה צריך פרופיל מארגן", "manage.onboarding.needHostMessage": "האירועים שלך צריכים מארגן לפני פרסום." },
  hi: { "manage.eventForm.publishRequiresHostTitle": "होस्ट आवश्यक", "manage.eventForm.goToHosts": "होस्ट पर जाएं", "manage.hostLinker.noHostsBannerHint": "आपका इवेंट पहले ड्राफ्ट के रूप में सहेजा जाएगा।", "manage.hostLinker.createHost": "सहेजें और होस्ट बनाएं", "manage.onboarding.needHostTitle": "आपको होस्ट प्रोफ़ाइल चाहिए", "manage.onboarding.needHostMessage": "प्रकाशित करने से पहले आपके इवेंट को एक होस्ट की आवश्यकता है।" },
  hr: { "manage.eventForm.publishRequiresHostTitle": "Potreban organizator", "manage.eventForm.goToHosts": "Idi na organizatore", "manage.hostLinker.noHostsBannerHint": "Vaš događaj bit će prvo spremljen kao nacrt.", "manage.hostLinker.createHost": "Spremi i kreiraj organizatora", "manage.onboarding.needHostTitle": "Trebate profil organizatora", "manage.onboarding.needHostMessage": "Vaši događaji trebaju organizatora prije objave." },
  hu: { "manage.eventForm.publishRequiresHostTitle": "Szervező szükséges", "manage.eventForm.goToHosts": "Szervezőkhöz", "manage.hostLinker.noHostsBannerHint": "Az esemény először piszkozatként lesz mentve.", "manage.hostLinker.createHost": "Mentés és szervező létrehozása", "manage.onboarding.needHostTitle": "Szervező profil szükséges", "manage.onboarding.needHostMessage": "Az eseményeidnek szervezőre van szükségük a közzététel előtt." },
  id: { "manage.eventForm.publishRequiresHostTitle": "Host diperlukan", "manage.eventForm.goToHosts": "Ke host", "manage.hostLinker.noHostsBannerHint": "Acara Anda akan disimpan sebagai draf terlebih dahulu.", "manage.hostLinker.createHost": "Simpan & Buat host", "manage.onboarding.needHostTitle": "Anda memerlukan profil host", "manage.onboarding.needHostMessage": "Acara Anda memerlukan host sebelum dipublikasikan." },
  is: { "manage.eventForm.publishRequiresHostTitle": "Gestgjafi krafist", "manage.eventForm.goToHosts": "Fara í gestgjafa", "manage.hostLinker.noHostsBannerHint": "Viðburðurinn þinn verður fyrst vistaður sem drög.", "manage.hostLinker.createHost": "Vista og búa til gestgjafa", "manage.onboarding.needHostTitle": "Þú þarft gestgjafaprófíl", "manage.onboarding.needHostMessage": "Viðburðirnir þínir þurfa gestgjafa áður en þeir eru birtir." },
  it: { "manage.eventForm.publishRequiresHostTitle": "Organizzatore richiesto", "manage.eventForm.goToHosts": "Vai agli organizzatori", "manage.hostLinker.noHostsBannerHint": "Il tuo evento verrà salvato prima come bozza.", "manage.hostLinker.createHost": "Salva e crea organizzatore", "manage.onboarding.needHostTitle": "Hai bisogno di un profilo organizzatore", "manage.onboarding.needHostMessage": "I tuoi eventi hanno bisogno di un organizzatore prima della pubblicazione." },
  ja: { "manage.eventForm.publishRequiresHostTitle": "ホストが必要です", "manage.eventForm.goToHosts": "ホストへ移動", "manage.hostLinker.noHostsBannerHint": "イベントはまず下書きとして保存されます。", "manage.hostLinker.createHost": "保存してホストを作成", "manage.onboarding.needHostTitle": "ホストプロフィールが必要です", "manage.onboarding.needHostMessage": "公開する前にイベントにはホストが必要です。" },
  ka: { "manage.eventForm.publishRequiresHostTitle": "ორგანიზატორი საჭიროა", "manage.eventForm.goToHosts": "ორგანიზატორებზე გადასვლა", "manage.hostLinker.noHostsBannerHint": "თქვენი ღონისძიება ჯერ მონახაზად შეინახება.", "manage.hostLinker.createHost": "შენახვა და ორგანიზატორის შექმნა", "manage.onboarding.needHostTitle": "გჭირდებათ ორგანიზატორის პროფილი", "manage.onboarding.needHostMessage": "თქვენს ღონისძიებებს ორგანიზატორი სჭირდება გამოქვეყნებამდე." },
  ko: { "manage.eventForm.publishRequiresHostTitle": "호스트 필요", "manage.eventForm.goToHosts": "호스트로 이동", "manage.hostLinker.noHostsBannerHint": "이벤트가 먼저 초안으로 저장됩니다.", "manage.hostLinker.createHost": "저장 후 호스트 만들기", "manage.onboarding.needHostTitle": "호스트 프로필이 필요합니다", "manage.onboarding.needHostMessage": "게시하기 전에 이벤트에 호스트가 필요합니다." },
  nb: { "manage.eventForm.publishRequiresHostTitle": "Arrangør påkrevd", "manage.eventForm.goToHosts": "Gå til arrangører", "manage.hostLinker.noHostsBannerHint": "Arrangementet lagres først som utkast.", "manage.hostLinker.createHost": "Lagre og opprett arrangør", "manage.onboarding.needHostTitle": "Du trenger en arrangørprofil", "manage.onboarding.needHostMessage": "Arrangementene dine trenger en arrangør før publisering." },
  nl: { "manage.eventForm.publishRequiresHostTitle": "Organisator vereist", "manage.eventForm.goToHosts": "Ga naar organisatoren", "manage.hostLinker.noHostsBannerHint": "Je evenement wordt eerst opgeslagen als concept.", "manage.hostLinker.createHost": "Opslaan en organisator aanmaken", "manage.onboarding.needHostTitle": "Je hebt een organisatorprofiel nodig", "manage.onboarding.needHostMessage": "Je evenementen hebben een organisator nodig voor publicatie." },
  pl: { "manage.eventForm.publishRequiresHostTitle": "Wymagany organizator", "manage.eventForm.goToHosts": "Przejdź do organizatorów", "manage.hostLinker.noHostsBannerHint": "Twoje wydarzenie zostanie najpierw zapisane jako szkic.", "manage.hostLinker.createHost": "Zapisz i utwórz organizatora", "manage.onboarding.needHostTitle": "Potrzebujesz profilu organizatora", "manage.onboarding.needHostMessage": "Twoje wydarzenia wymagają organizatora przed publikacją." },
  pt: { "manage.eventForm.publishRequiresHostTitle": "Organizador necessário", "manage.eventForm.goToHosts": "Ir para organizadores", "manage.hostLinker.noHostsBannerHint": "Seu evento será salvo primeiro como rascunho.", "manage.hostLinker.createHost": "Salvar e criar organizador", "manage.onboarding.needHostTitle": "Você precisa de um perfil de organizador", "manage.onboarding.needHostMessage": "Seus eventos precisam de um organizador antes da publicação." },
  ro: { "manage.eventForm.publishRequiresHostTitle": "Organizator necesar", "manage.eventForm.goToHosts": "Mergi la organizatori", "manage.hostLinker.noHostsBannerHint": "Evenimentul va fi salvat mai întâi ca ciornă.", "manage.hostLinker.createHost": "Salvează și creează organizator", "manage.onboarding.needHostTitle": "Aveți nevoie de un profil de organizator", "manage.onboarding.needHostMessage": "Evenimentele dvs. au nevoie de un organizator înainte de publicare." },
  ru: { "manage.eventForm.publishRequiresHostTitle": "Требуется организатор", "manage.eventForm.goToHosts": "К организаторам", "manage.hostLinker.noHostsBannerHint": "Ваше мероприятие будет сохранено как черновик.", "manage.hostLinker.createHost": "Сохранить и создать организатора", "manage.onboarding.needHostTitle": "Нужен профиль организатора", "manage.onboarding.needHostMessage": "Для публикации мероприятию нужен организатор." },
  sk: { "manage.eventForm.publishRequiresHostTitle": "Vyžaduje sa organizátor", "manage.eventForm.goToHosts": "Prejsť na organizátorov", "manage.hostLinker.noHostsBannerHint": "Vaša udalosť bude najprv uložená ako koncept.", "manage.hostLinker.createHost": "Uložiť a vytvoriť organizátora", "manage.onboarding.needHostTitle": "Potrebujete profil organizátora", "manage.onboarding.needHostMessage": "Vaše udalosti potrebujú organizátora pred zverejnením." },
  sl: { "manage.eventForm.publishRequiresHostTitle": "Potreben organizator", "manage.eventForm.goToHosts": "Pojdi na organizatorje", "manage.hostLinker.noHostsBannerHint": "Vaš dogodek bo najprej shranjen kot osnutek.", "manage.hostLinker.createHost": "Shrani in ustvari organizatorja", "manage.onboarding.needHostTitle": "Potrebujete profil organizatorja", "manage.onboarding.needHostMessage": "Vaši dogodki potrebujejo organizatorja pred objavo." },
  sv: { "manage.eventForm.publishRequiresHostTitle": "Värd krävs", "manage.eventForm.goToHosts": "Gå till värdar", "manage.hostLinker.noHostsBannerHint": "Ditt evenemang sparas först som utkast.", "manage.hostLinker.createHost": "Spara och skapa värd", "manage.onboarding.needHostTitle": "Du behöver en värdprofil", "manage.onboarding.needHostMessage": "Dina evenemang behöver en värd innan publicering." },
  th: { "manage.eventForm.publishRequiresHostTitle": "ต้องมีผู้จัด", "manage.eventForm.goToHosts": "ไปที่ผู้จัด", "manage.hostLinker.noHostsBannerHint": "กิจกรรมของคุณจะถูกบันทึกเป็นฉบับร่างก่อน", "manage.hostLinker.createHost": "บันทึกและสร้างผู้จัด", "manage.onboarding.needHostTitle": "คุณต้องมีโปรไฟล์ผู้จัด", "manage.onboarding.needHostMessage": "กิจกรรมของคุณต้องมีผู้จัดก่อนเผยแพร่" },
  tr: { "manage.eventForm.publishRequiresHostTitle": "Organizatör gerekli", "manage.eventForm.goToHosts": "Organizatörlere git", "manage.hostLinker.noHostsBannerHint": "Etkinliğiniz önce taslak olarak kaydedilecek.", "manage.hostLinker.createHost": "Kaydet ve organizatör oluştur", "manage.onboarding.needHostTitle": "Organizatör profiline ihtiyacınız var", "manage.onboarding.needHostMessage": "Etkinliklerinizin yayınlanmadan önce bir organizatöre ihtiyacı var." },
  uk: { "manage.eventForm.publishRequiresHostTitle": "Потрібен організатор", "manage.eventForm.goToHosts": "До організаторів", "manage.hostLinker.noHostsBannerHint": "Вашу подію буде спочатку збережено як чернетку.", "manage.hostLinker.createHost": "Зберегти і створити організатора", "manage.onboarding.needHostTitle": "Потрібен профіль організатора", "manage.onboarding.needHostMessage": "Для публікації подіям потрібен організатор." },
  vi: { "manage.eventForm.publishRequiresHostTitle": "Cần người tổ chức", "manage.eventForm.goToHosts": "Đến người tổ chức", "manage.hostLinker.noHostsBannerHint": "Sự kiện của bạn sẽ được lưu dưới dạng bản nháp trước.", "manage.hostLinker.createHost": "Lưu và tạo người tổ chức", "manage.onboarding.needHostTitle": "Bạn cần hồ sơ người tổ chức", "manage.onboarding.needHostMessage": "Sự kiện của bạn cần người tổ chức trước khi xuất bản." },
  zh: { "manage.eventForm.publishRequiresHostTitle": "需要主办方", "manage.eventForm.goToHosts": "前往主办方", "manage.hostLinker.noHostsBannerHint": "您的活动将首先保存为草稿。", "manage.hostLinker.createHost": "保存并创建主办方", "manage.onboarding.needHostTitle": "您需要主办方资料", "manage.onboarding.needHostMessage": "发布前活动需要主办方。" },
  zu: { "manage.eventForm.publishRequiresHostTitle": "Kudingeka umsingathi", "manage.eventForm.goToHosts": "Iya kubasingathi", "manage.hostLinker.noHostsBannerHint": "Umcimbi wakho uzolondolozwa njengomqulu kuqala.", "manage.hostLinker.createHost": "Londoloza futhi udale umsingathi", "manage.onboarding.needHostTitle": "Udinga iphrofayili yomsingathi", "manage.onboarding.needHostMessage": "Imicimbi yakho idinga umsingathi ngaphambi kokushicilela." },
};

const allLocales = fs.readdirSync(messagesDir)
  .filter(f => f.endsWith(".json") && f !== "en.json")
  .map(f => f.replace(".json", ""));

let updated = 0;

for (const locale of allLocales) {
  const filePath = path.join(messagesDir, `${locale}.json`);
  const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const translations = TRANSLATIONS[locale] || {};
  let changed = false;

  // Apply locale-specific translations (overwrite to fix capitalization etc)
  for (const [key, value] of Object.entries(translations)) {
    if (content[key] !== value) {
      content[key] = value;
      changed = true;
    }
  }
  // Fill any missing keys with English
  for (const [key, value] of Object.entries(EN_KEYS)) {
    if (!content[key]) {
      content[key] = value;
      changed = true;
    }
  }

  if (changed) {
    const sorted = Object.fromEntries(Object.entries(content).sort(([a], [b]) => a.localeCompare(b)));
    fs.writeFileSync(filePath, JSON.stringify(sorted, null, 2) + "\n");
    console.log(`Updated ${locale}`);
    updated++;
  }
}

console.log(`\nDone: ${updated} locale files updated.`);
