import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { truncateOnWord } from "../../../../../lib/textTruncate";
import {
  cadenceLine,
  fetchApiJson,
  formatDateTime,
  regionName,
  requestLocale,
  translator,
} from "../../../../../lib/seoLanding";

/**
 * City landing page (SEO round 3, Proposal B): /events/in/<country>/<city>.
 * Server-rendered list of the city's upcoming classes and events (one row per
 * series, linking its next date), and the hosts active there. Self-canonical,
 * no Event markup. Only owner-approved cities exist; robots follow the API's
 * seo.indexable (30-day grace below the minimum).
 */

type CityPage = {
  city: { countryCode: string; slug: string; name: string };
  series: Array<{
    title: string;
    nextEvent: { slug: string; startsAtUtc: string; endsAtUtc: string; eventTimezone: string | null };
    upcomingCount: number;
    cadence: { kind: "weekly"; weekday: number; startLocalHHMM: string; endLocalHHMM: string; timezone: string } | null;
    venue: string | null;
    practice: string | null;
    hosts: Array<{ slug: string; name: string }>;
    hubSlug: string | null;
  }>;
  hosts: Array<{ slug: string; name: string; imageUrl: string | null; seriesCount: number }>;
  practices: Array<{ label: string; seriesCount: number }>;
  stats: { seriesCount: number; hostCount: number; occurrenceCount: number };
  seo: { indexable: boolean; lastmod: string | null };
};

type Params = { params: { country: string; city: string } };

function validParams(params: Params["params"]): boolean {
  return /^[a-z]{2}$/.test(params.country) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(params.city);
}

async function loadCity(params: Params["params"]): Promise<CityPage | null> {
  if (!validParams(params)) return null;
  const res = await fetchApiJson<CityPage>(`/cities/${params.country}/${params.city}`);
  return res.data;
}

function leadText(page: CityPage, locale: string): string {
  const t = translator(locale);
  const parts = [t("cityPage.lead", { city: page.city.name })];
  const practices = page.practices.slice(0, 6).map((p) => p.label);
  if (practices.length) parts.push(t("cityPage.practices", { practices: practices.join(", ") }));
  return parts.join(" ");
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const page = await loadCity(params);
  if (!page) return { title: "Not found | DanceResource", robots: { index: false, follow: true } };
  const locale = requestLocale();
  const t = translator(locale);
  const title = t("cityPage.title", { city: page.city.name });
  const description = truncateOnWord(leadText(page, locale), 160);
  const path = `/events/in/${page.city.countryCode}/${page.city.slug}`;
  return {
    title: `${title} | DanceResource`,
    description,
    alternates: { canonical: path },
    robots: page.seo.indexable ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { title, description, url: path, type: "website" },
  };
}

export default async function CityLandingPage({ params }: Params) {
  const page = await loadCity(params);
  if (!page) notFound();
  const locale = requestLocale();
  const t = translator(locale);
  const country = regionName(page.city.countryCode, locale);

  return (
    <section className="panel cards seo-landing">
      <nav className="event-detail-breadcrumb">
        <Link href="/events"><span className="dir-arrow" aria-hidden="true">←</span> {t("cityPage.allEvents")}</Link>
      </nav>

      <header className="seo-landing-header">
        <h1>{t("cityPage.title", { city: page.city.name })}</h1>
        {country && <div className="meta">{country}</div>}
        <p className="seo-landing-lead">{leadText(page, locale)}</p>
        <div className="meta">
          {t("cityPage.stats", { series: String(page.stats.seriesCount), hosts: String(page.stats.hostCount) })}
        </div>
      </header>

      <h2 className="seo-landing-heading">{t("cityPage.upcomingHeading")}</h2>
      {page.series.length === 0 ? (
        <p className="meta">{t("cityPage.empty")}</p>
      ) : (
        <ul className="seo-landing-list">
          {page.series.map((s) => {
            const cadence = cadenceLine(s.cadence, locale);
            const details = [s.practice, s.venue].filter(Boolean).join(" · ");
            return (
              <li key={s.nextEvent.slug} className="seo-landing-row">
                <Link className="seo-landing-row-title" href={`/events/${s.nextEvent.slug}`}>{s.title}</Link>
                <div className="meta">
                  {t("cityPage.next", { date: formatDateTime(s.nextEvent.startsAtUtc, s.nextEvent.eventTimezone, locale) })}
                  {cadence ? ` · ${cadence}` : ""}
                </div>
                {(s.hosts.length > 0 || details) && (
                  <div className="meta seo-landing-row-hosts">
                    {s.hosts.map((h, i) => (
                      <span key={h.slug}>
                        {i > 0 ? ", " : ""}
                        <Link href={`/hosts/${h.slug}`}>{h.name}</Link>
                      </span>
                    ))}
                    {details ? `${s.hosts.length ? " · " : ""}${details}` : ""}
                  </div>
                )}
                {s.hubSlug && s.upcomingCount > 1 && (
                  <Link className="meta seo-landing-row-hub" href={`/series/${s.hubSlug}`}>
                    {t("seriesHub.allDates")} <span className="dir-arrow" aria-hidden="true">→</span>
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {page.hosts.length > 0 && (
        <>
          <h2 className="seo-landing-heading">{t("cityPage.hostsHeading", { city: page.city.name })}</h2>
          <ul className="seo-landing-hosts">
            {page.hosts.map((h) => (
              <li key={h.slug}>
                <Link href={`/hosts/${h.slug}`}>{h.name}</Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
