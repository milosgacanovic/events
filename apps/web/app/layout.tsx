import type { Metadata } from "next";
import { cookies, headers } from "next/headers";

import { I18nProvider } from "../components/i18n/I18nProvider";
import { AppShell } from "../components/layout/AppShell";
import { localeCookieName } from "../lib/i18n/config";
import { resolveRequestLocale } from "../lib/i18n/locale";
import { getMessages } from "../lib/i18n/messages";
import "./globals.css";

export const metadata: Metadata = {
  title: "DanceResource Events",
  description: "Events discovery and publishing for DanceResource",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = resolveRequestLocale(
    cookies().get(localeCookieName)?.value,
    headers().get("accept-language"),
  );
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
