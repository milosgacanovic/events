import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";

import { htmlToPlainText } from "../../../lib/htmlToPlainText";
import { truncateOnWord } from "../../../lib/textTruncate";
import {
  cadenceLine,
  fetchApiJson,
  formatDateTime,
  formatDay,
  requestLocale,
  translator,
} from "../../../lib/seoLanding";

/**
 * Series hub (SEO round 3, Proposal A1): /series/<slug>. A stable page per
 * recurring series listing every upcoming date as a real link. No Event
 * markup (EventSeries isn't a Google rich-result type); occurrence pages
 * stay Google's per-event pages. Indexed while the series has >= 2 upcoming
 * dates, otherwise 200 + noindex. Old slugs redirect to the current one.
 */

type Hub = {
  hub: {
    slug: string;
    title: string;
    venue: string | null;
    city: string | null;
    countryCode: string | null;
    practice: string | null;
    cadence: { kind: "weekly"; weekday: number; startLocalHHMM: string; endLocalHHMM: string; timezone: string } | null;
    eventTimezone: string | null;
    description: string | null;
  };
  hosts: Array<{ slug: string; name: string; imageUrl: string | null }>;
  upcoming: Array<{ slug: string; title: string; startsAtUtc: string; endsAtUtc: string; eventTimezone: string | null }>;
  cityPage: { path: string; name: string } | null;
  seo: { indexable: boolean; lastmod: string | null };
};
type HubResponse = Hub | { redirectTo: string };

type Params = { params: { slug: string } };

async function loadHub(slug: string): Promise<HubResponse | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  const res = await fetchApiJson<HubResponse>(`/series/${slug}`);
  return res.data;
}

function seoTitle(hub: Hub, locale: string): string {
  const t = translator(locale);
  const host = hub.hosts[0]?.name;
  const head = host ? t("eventDetail.seo.titleWith", { title: hub.hub.title, host }) : hub.hub.title;
  return [head, hub.hub.city, t("seriesHub.allDates")].filter(Boolean).join(" · ");
}

/** Venue and city without repeats (imported venues are often just the city). */
function placeParts(hub: Hub): string[] {
  const out: string[] = [];
  for (const part of [hub.hub.venue, hub.hub.city]) {
    if (part && !out.some((p) => p.toLowerCase() === part.toLowerCase())) out.push(part);
  }
  return out;
}

function leadText(hub: Hub, locale: string): string {
  const t = translator(locale);
  const parts: string[] = [];
  const cadence = cadenceLine(hub.hub.cadence, locale);
  if (cadence) parts.push(cadence);
  const where = placeParts(hub).join(", ");
  if (where) parts.push(where);
  parts.push(t("seriesHub.upcomingCount", { count: String(hub.upcoming.length) }));
  const next = hub.upcoming[0];
  if (next) parts.push(t("cityPage.next", { date: formatDay(next.startsAtUtc, next.eventTimezone, locale) }));
  return parts.join(" · ");
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const res = await loadHub(params.slug);
  if (!res || "redirectTo" in res) return { title: "Not found | DanceResource", robots: { index: false, follow: true } };
  const locale = requestLocale();
  const description = truncateOnWord(
    [leadText(res, locale), htmlToPlainText(res.hub.description)].filter(Boolean).join(". "),
    160,
  );
  const path = `/series/${res.hub.slug}`;
  const title = seoTitle(res, locale);
  return {
    title: `${title} | DanceResource`,
    description,
    alternates: { canonical: path },
    robots: res.seo.indexable ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { title, description, url: path, type: "website" },
  };
}

export default async function SeriesHubPage({ params }: Params) {
  const res = await loadHub(params.slug);
  if (!res) notFound();
  if ("redirectTo" in res) permanentRedirect(`/series/${res.redirectTo}`);
  const locale = requestLocale();
  const t = translator(locale);
  const description = truncateOnWord(htmlToPlainText(res.hub.description), 600);
  const cadence = cadenceLine(res.hub.cadence, locale);

  return (
    <section className="panel cards seo-landing">
      <nav className="event-detail-breadcrumb">
        {res.cityPage ? (
          <Link href={res.cityPage.path}><span className="dir-arrow" aria-hidden="true">←</span> {t("cityPage.title", { city: res.cityPage.name })}</Link>
        ) : (
          <Link href="/events"><span className="dir-arrow" aria-hidden="true">←</span> {t("cityPage.allEvents")}</Link>
        )}
      </nav>

      <header className="seo-landing-header">
        <h1>{res.hub.title}</h1>
        {res.hosts.length > 0 && (
          <div className="seo-landing-row-hosts">
            {res.hosts.map((h, i) => (
              <span key={h.slug}>
                {i > 0 ? ", " : ""}
                <Link href={`/hosts/${h.slug}`}>{h.name}</Link>
              </span>
            ))}
          </div>
        )}
        <div className="meta">
          {[res.hub.practice, ...placeParts(res)].filter(Boolean).join(" · ")}
        </div>
        {cadence && <div className="meta">{cadence}</div>}
        {description && <p className="seo-landing-lead">{description}</p>}
      </header>

      <h2 className="seo-landing-heading">
        {t("seriesHub.upcomingHeading")}
        <span className="meta"> · {t("seriesHub.upcomingCount", { count: String(res.upcoming.length) })}</span>
      </h2>
      {res.upcoming.length === 0 ? (
        <p className="meta">{t("seriesHub.empty")}</p>
      ) : (
        <ul className="seo-landing-list seo-landing-dates">
          {res.upcoming.map((o) => (
            <li key={o.slug}>
              <Link className="org-past-event-row" href={`/events/${o.slug}`}>
                <span>{formatDateTime(o.startsAtUtc, o.eventTimezone, locale)}</span>
                {o.title !== res.hub.title && <span className="meta">{o.title}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {res.cityPage && (
        <p className="meta">
          <Link href={res.cityPage.path}>{t("seriesHub.moreInCity", { city: res.cityPage.name })} <span className="dir-arrow" aria-hidden="true">→</span></Link>
        </p>
      )}
    </section>
  );
}
