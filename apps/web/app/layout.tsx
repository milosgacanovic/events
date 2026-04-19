import type { Metadata } from "next";
import { cookies, headers } from "next/headers";

import { I18nProvider } from "../components/i18n/I18nProvider";
import { LangQueryHandler } from "../components/i18n/LangQueryHandler";
import { KeycloakAuthProvider } from "../components/auth/KeycloakAuthProvider";
import { AppShell } from "../components/layout/AppShell";
import { ToastProvider } from "../components/ToastProvider";
import { PendingActionExecutor } from "../components/PendingActionExecutor";
import { localeCookieName } from "../lib/i18n/config";
import { resolveRequestLocale } from "../lib/i18n/locale";
import { getMessages } from "../lib/i18n/messages";
import { getKeycloakClientConfig } from "../lib/keycloakConfig";
import "./globals.css";

const fallbackTitle = "DanceResource Events";
const fallbackDescription = "Events discovery and publishing for DanceResource";

function resolveLocale() {
  return resolveRequestLocale(
    cookies().get(localeCookieName)?.value,
    headers().get("accept-language"),
  );
}

export function generateMetadata(): Metadata {
  const locale = resolveLocale();
  const messages = getMessages(locale);

  const image = "https://wiki.danceresource.org/images/9/99/Danceresource.org_logo.png";
  const title = messages["meta.title"] ?? fallbackTitle;
  const description = messages["meta.description"] ?? fallbackDescription;
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://events.danceresource.org"),
    title,
    description,
    icons: {
      icon: "/favicon.ico",
      shortcut: "/favicon.ico",
    },
    openGraph: {
      title,
      description,
      siteName: "DanceResource Events",
      type: "website",
      images: [{ url: image }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = resolveLocale();
  const messages = getMessages(locale);
  const keycloakConfig = getKeycloakClientConfig();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){var t;try{var m=document.cookie.match(/(?:^|; )dr_theme=([^;]*)/);if(m)t=decodeURIComponent(m[1])}catch(e){}if(t!=='light'&&t!=='dark'){try{var ls=localStorage.getItem('dr-theme');if(ls==='light'||ls==='dark')t=ls}catch(e){}}if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t)})()` }} />
        <script dangerouslySetInnerHTML={{ __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-KFG8MVPC');` }} />
      </head>
      <body>
        <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-KFG8MVPC" height="0" width="0" style={{ display: "none", visibility: "hidden" }} /></noscript>
        <LangQueryHandler />
        <I18nProvider locale={locale} messages={messages}>
          <KeycloakAuthProvider config={keycloakConfig}>
            <ToastProvider>
              <PendingActionExecutor />
              <AppShell>{children}</AppShell>
            </ToastProvider>
          </KeycloakAuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
