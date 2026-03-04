import type { Metadata } from "next";
import { cookies, headers } from "next/headers";

import { I18nProvider } from "../components/i18n/I18nProvider";
import { KeycloakAuthProvider } from "../components/auth/KeycloakAuthProvider";
import { AppShell } from "../components/layout/AppShell";
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

  return {
    title: messages["meta.title"] ?? fallbackTitle,
    description: messages["meta.description"] ?? fallbackDescription,
    icons: {
      icon: "/favicon.ico",
      shortcut: "/favicon.ico",
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
        <script dangerouslySetInnerHTML={{ __html: `(function(){var p='system';try{p=localStorage.getItem('dr-theme')||'system'}catch(e){}var r=p;if(p==='system'){r=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',r);document.documentElement.setAttribute('data-theme-preference',p)})()` }} />
      </head>
      <body>
        <I18nProvider locale={locale} messages={messages}>
          <KeycloakAuthProvider config={keycloakConfig}>
            <AppShell>{children}</AppShell>
          </KeycloakAuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
