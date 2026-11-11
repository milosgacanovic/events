import type { Metadata } from "next";
import { cookies } from "next/headers";

import type { EventCardHit } from "../../../components/EventCard";
import { OrganizerDetailClient, type OrganizerDetail } from "../../../components/OrganizerDetailClient";
import { apiBase } from "../../../lib/api";
import { HOST_EVENTS_PAGE_SIZE } from "../../../lib/hostEvents";
import { htmlToPlainText } from "../../../lib/htmlToPlainText";
import { toDisplayNamesLocale } from "../../../lib/i18n/languageLabels";

const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://events.danceresource.org";

async function fetchServerJson<T>(path: string): Promise<T | null> {
  const serverApiBase = process.env.INTERNAL_API_BASE_URL ?? apiBase;
  const response = await fetch(`${serverApiBase}${path}`, { cache: "no-store" }).catch(() => null);
  if (!response?.ok) return null;
  return response.json() as Promise<T>;
}


function isHostPublished(detail: OrganizerDetail): boolean {
  const status = detail.organizer.status;
  return !status || status === "published";
}

function getBioText(detail: OrganizerDetail, maxLength: number): string {
  const descJson = detail.organizer.description_json as Record<string, unknown> | null;
  const rawHtml = detail.organizer.descriptionHtml ?? (typeof descJson?.html === "string" ? descJson.html : "") ?? "";
  // Decodes entities exactly once; the old tag-only strip left "&amp;" in the
  // text, which React escaped again → "&amp;amp;" in the meta description.
  return htmlToPlainText(rawHtml, maxLength);
}

function getDescription(detail: OrganizerDetail): string {
  return getBioText(detail, 160) || `${detail.organizer.name} — conscious dance host on DanceResource`;
}

function absoluteUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) return `${SITE_ORIGIN}${url}`;
  return undefined;
}

type HostUpcomingPage = { organizerId: string; hits: EventCardHit[]; totalHits: number };

// First page of the host's upcoming events, fetched on the server with the
// same query the client uses, so the initial HTML contains real
// <a href="/events/…"> links (the list used to render client-side only).
async function fetchUpcomingFirstPage(organizerId: string): Promise<HostUpcomingPage | null> {
  const params = new URLSearchParams({
    organizerId,
    page: "1",
    pageSize: String(HOST_EVENTS_PAGE_SIZE),
    sort: "date_asc",
  });
  const res = await fetchServerJson<{ hits: EventCardHit[]; totalHits: number }>(`/events/search?${params.toString()}`);
  if (!res || !Array.isArray(res.hits)) return null;
  return { organizerId, hits: res.hits, totalHits: res.totalHits ?? res.hits.length };
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const detail = await fetchServerJson<OrganizerDetail>(`/organizers/${params.slug}`);
  if (!detail) {
    return {
      title: "Host not found | DanceResource",
      robots: { index: false, follow: true },
    };
  }
  const description = getDescription(detail);
  const image = detail.organizer.imageUrl ?? detail.organizer.avatar_path ?? undefined;
  const noIndex = !isHostPublished(detail);
  return {
    title: `${detail.organizer.name} | DanceResource`,
    description,
    alternates: { canonical: `/hosts/${params.slug}` },
    robots: noIndex ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      title: detail.organizer.name,
      description,
      url: `/hosts/${params.slug}`,
      type: "website",
      images: image ? [{ url: image }] : undefined,
    },
  };
}

export default function HostDetailPage({ params }: { params: { slug: string } }) {
  return <HostDetailPageServer slug={params.slug} />;
}

async function HostDetailPageServer({ slug }: { slug: string }) {
  const detail = await fetchServerJson<OrganizerDetail>(`/organizers/${slug}`);
  const initialUpcoming = detail && isHostPublished(detail)
    ? await fetchUpcomingFirstPage(detail.organizer.id)
    : null;

  const cookieStore = cookies();
  const locale = cookieStore.get("dr_locale")?.value ?? "en";
  const serverTranslations = (() => {
    try {
      const regionNames = new Intl.DisplayNames([toDisplayNamesLocale(locale)], { type: "region" });
      const languageNames = new Intl.DisplayNames([toDisplayNamesLocale(locale)], { type: "language" });
      const countryCode = detail?.organizer.countryCode ?? detail?.organizer.country_code ?? null;
      const countryLabel = countryCode ? (regionNames.of(countryCode.toUpperCase()) ?? null) : null;
      const languageLabels: Record<string, string> = {};
      for (const code of detail?.organizer.languages ?? []) {
        const label = languageNames.of(code);
        if (label) languageLabels[code] = label;
      }
      const locationCountryLabels: Record<string, string> = {};
      for (const loc of detail?.locations ?? []) {
        if (loc.country_code && !locationCountryLabels[loc.country_code]) {
          const label = regionNames.of(loc.country_code.toUpperCase());
          if (label) locationCountryLabels[loc.country_code] = label;
        }
      }
      return { locale, countryLabel, languageLabels, locationCountryLabels };
    } catch {
      return { locale, countryLabel: null, languageLabels: {}, locationCountryLabels: {} };
    }
  })();

  const websiteUrl = detail?.organizer.websiteUrl ?? detail?.organizer.website_url ?? null;
  const externalUrl = detail?.organizer.externalUrl ?? detail?.organizer.external_url ?? null;
  const sameAs = Array.from(new Set([websiteUrl, externalUrl].filter((u): u is string => Boolean(u))));
  // Only the host's own bio goes into structured data — the generic fallback
  // used for the meta description is not visible on the page.
  const bio = detail ? getBioText(detail, 500) : "";
  const jsonLd = detail && isHostPublished(detail)
    ? {
        "@context": "https://schema.org",
        // Set per host by an editor (default person); see migration 062.
        "@type": detail.organizer.entityType === "organization" ? "Organization" : "Person",
        name: detail.organizer.name,
        url: `${SITE_ORIGIN}/hosts/${slug}`,
        ...(sameAs.length ? { sameAs } : {}),
        image: absoluteUrl(detail.organizer.imageUrl ?? detail.organizer.avatar_path),
        ...(bio ? { description: bio } : {}),
        address:
          detail.organizer.city || detail.organizer.country_code || detail.organizer.countryCode
            ? {
                "@type": "PostalAddress",
                addressLocality: detail.organizer.city ?? undefined,
                addressCountry: (detail.organizer.countryCode ?? detail.organizer.country_code)?.toUpperCase(),
              }
            : undefined,
      }
    : null;

  return (
    <>
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      )}
      <OrganizerDetailClient
        slug={slug}
        initialData={detail}
        initialUpcoming={initialUpcoming}
        serverTranslations={serverTranslations}
      />
    </>
  );
}
