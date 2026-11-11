"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { fetchJson } from "../lib/api";
import { useKeycloakAuth } from "./auth/KeycloakAuthProvider";
import type { EventDetail } from "./EventDetailClient";
import { useI18n } from "./i18n/I18nProvider";
import type { OrganizerDetail } from "./OrganizerDetailClient";

// Loaded only when a signed-in editor turns out to have access (drafts), so
// anonymous visitors of a 404 never download the detail components.
const EventDetailClient = dynamic(() => import("./EventDetailClient").then((m) => m.EventDetailClient), { ssr: false });
const OrganizerDetailClient = dynamic(
  () => import("./OrganizerDetailClient").then((m) => m.OrganizerDetailClient),
  { ssr: false },
);

type Kind = "event" | "host";

/**
 * Body of the real 404 for /events/<slug> and /hosts/<slug> (HTTP 404 since
 * the page now calls notFound()). The server and the first client render are
 * the friendly "not found" message. The public API also 404s for drafts and
 * other non-public entities, so a signed-in visitor gets one retry with
 * their token; if it succeeds (an editor opening a draft), the normal detail
 * view renders, exactly as before.
 */
export function EntityNotFound({ kind }: { kind: Kind }) {
  const { t } = useI18n();
  const auth = useKeycloakAuth();
  const pathname = usePathname() ?? "";
  const slug = decodeURIComponent(pathname.split("/").filter(Boolean)[1] ?? "");
  const [found, setFound] = useState<EventDetail | OrganizerDetail | null>(null);

  useEffect(() => {
    if (!auth.ready || !auth.authenticated || !slug) return;
    let active = true;
    (async () => {
      const token = await auth.getToken();
      if (!token || !active) return;
      try {
        const path = kind === "event" ? `/events/${encodeURIComponent(slug)}` : `/organizers/${encodeURIComponent(slug)}`;
        const data = await fetchJson<EventDetail | OrganizerDetail>(path, { headers: { Authorization: `Bearer ${token}` } });
        if (active) setFound(data);
      } catch {
        // Really missing (or not visible to this account): keep the 404 page.
      }
    })();
    return () => {
      active = false;
    };
  }, [auth.ready, auth.authenticated, auth.getToken, kind, slug]);

  if (found && kind === "event") return <EventDetailClient slug={slug} initialData={found as EventDetail} />;
  if (found && kind === "host") return <OrganizerDetailClient slug={slug} initialData={found as OrganizerDetail} />;

  return (
    <section className="panel cards">
      <h1 className="title-xl">{t(kind === "event" ? "eventDetail.notFound.title" : "organizerDetail.notFound.title")}</h1>
      <p className="muted">
        {t(kind === "event" ? "eventDetail.notFound.description" : "organizerDetail.notFound.description")}
      </p>
      <p className="entity-not-found-links">
        {kind === "event" ? (
          <>
            <Link href="/events">{t("eventDetail.notFound.backToEvents")}</Link>
            <Link href="/hosts">{t("nav.organizers")}</Link>
          </>
        ) : (
          <>
            <Link href="/hosts">{t("organizerDetail.notFound.backToHosts")}</Link>
            <Link href="/events">{t("nav.events")}</Link>
          </>
        )}
      </p>
    </section>
  );
}
