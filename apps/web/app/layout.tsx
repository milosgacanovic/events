import type { Metadata } from "next";
import { cookies, headers } from "next/headers";

import { I18nProvider } from "../components/i18n/I18nProvider";
import { AppShell } from "../components/layout/AppShell";
import { localeCookieName } from "../lib/i18n/config";
import { resolveRequestLocale } from "../lib/i18n/locale";
import { getMessages } from "../lib/i18n/messages";
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
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = resolveLocale();
  const messages = getMessages(locale);

  return (
    <html lang={locale}>
      <body>
        <I18nProvider locale={locale} messages={messages}>
          <AppShell>{children}</AppShell>
        </I18nProvider>
      </body>
    </html>
  );
}
