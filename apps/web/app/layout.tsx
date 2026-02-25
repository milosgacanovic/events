import type { Metadata } from "next";
import Link from "next/link";

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
  return (
    <html lang="en">
      <body>
        <main>
          <header className="topbar">
            <Link href="/events" className="brand">
              DanceResource Events
            </Link>
            <nav className="nav">
              <Link href="/events">Events</Link>
              <Link href="/organizers">Organizers</Link>
              <Link href="/admin">Admin</Link>
            </nav>
          </header>
          {children}
        </main>
      </body>
    </html>
  );
}
