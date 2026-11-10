import type { Metadata } from "next";
import { cookies, headers } from "next/headers";

import {
  EventDetailClient,
  type EventDetail,
  type TaxonomyResponse,
} from "../../../components/EventDetailClient";
import { apiBase } from "../../../lib/api";
import { toZonedIsoString } from "../../../lib/datetime";
import {
  absoluteImageUrl,
  buildEventLead,
  buildEventMetaDescription,
  buildEventSeoTitle,
  buildThinDescriptionSummary,
  formatSeoDate,
  resolveEventImage,
  seoT,
  THIN_DESCRIPTION_CHARS,
} from "../../../lib/eventSeo";
import { htmlToPlainText } from "../../../lib/htmlToPlainText";
import { getFormatLabel } from "../../../lib/filterHelpers";
import { localeCookieName } from "../../../lib/i18n/config";
import { resolveRequestLocale } from "../../../lib/i18n/locale";
import { toDisplayNamesLocale } from "../../../lib/i18n/languageLabels";

type EventDetailResponse = EventDetail;

const serverApiBase = process.env.INTERNAL_API_BASE_URL?.replace(/\/$/, "") ?? apiBase;

async function fetchServerJson<T>(path: string, revalidateSeconds?: number): Promise<T | null> {
  const init: RequestInit & { next?: { revalidate: number } } = revalidateSeconds
    ? { next: { revalidate: revalidateSeconds } }
    : { cache: "no-store" };
  const response = await fetch(`${serverApiBase}${path}`, init).catch(() => null);
  if (!response || !response.ok) {
    return null;
  }
  return response.json() as Promise<T>;
}

function descriptionText(detail: EventDetailResponse): string {
  const html = (detail.event.description_json as { html?: string } | null)?.html ?? "";
  // 5rhythms.com pages lead with a literal "DESCRIPTION" heading.
  return htmlToPlainText(html).replace(/^DESCRIPTION\s+/i, "");
}

// Taxonomies change rarely. Caching them keeps two calls per page render out of
// the API's per-IP /api/meta/* rate-limit bucket (300/min, shared by the whole
// web container) — a 429 there silently dropped practice/format from titles.
const TAXONOMY_REVALIDATE_SECONDS = 300;

const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://events.danceresource.org";

function buildEventJsonLd(detail: EventDetailResponse, slug: string, ctx: EventSeoContext): Record<string, unknown> {
  const event = detail.event;
  const loc = detail.defaultLocation;
  // This page's OWN next occurrence. occurrences.upcoming is series-wide, so
  // upcoming[0] can be another sibling's date.
  const own = detail.seo?.nextOccurrence ?? null;
  const tz = event.event_timezone || null;

  const description = ctx.jsonLdDescription.slice(0, 5000);

  const startUtc = event.single_start_at ?? own?.starts_at_utc ?? undefined;
  const endUtc = event.single_end_at ?? own?.ends_at_utc ?? undefined;
  const startDate = startUtc ? toZonedIsoString(startUtc, tz) : undefined;
  const endDate = endUtc ? toZonedIsoString(endUtc, tz) : undefined;

  const attendanceMode =
    event.attendance_mode === "online"
      ? "https://schema.org/OnlineEventAttendanceMode"
      : event.attendance_mode === "hybrid"
        ? "https://schema.org/MixedEventAttendanceMode"
        : "https://schema.org/OfflineEventAttendanceMode";

  const eventStatus =
    event.status === "cancelled"
      ? "https://schema.org/EventCancelled"
      : "https://schema.org/EventScheduled";

  const externalUrl = event.externalUrl ?? event.external_url ?? null;
  const onlineUrl = event.online_url ?? externalUrl ?? null;

  const physicalPlace = loc
    ? {
        "@type": "Place",
        name: loc.formatted_address || loc.city || event.title,
        address: {
          "@type": "PostalAddress",
          ...(loc.formatted_address ? { streetAddress: loc.formatted_address } : {}),
          ...(loc.city ? { addressLocality: loc.city } : {}),
          ...(loc.country_code ? { addressCountry: loc.country_code.toUpperCase() } : {}),
        },
        ...(typeof loc.lat === "number" && typeof loc.lng === "number"
          ? { geo: { "@type": "GeoCoordinates", latitude: loc.lat, longitude: loc.lng } }
          : {}),
      }
    : null;

  const virtualPlace = onlineUrl
    ? { "@type": "VirtualLocation", url: onlineUrl }
    : null;

  let location: unknown;
  if (event.attendance_mode === "online") {
    location = virtualPlace ?? undefined;
  } else if (event.attendance_mode === "hybrid" && physicalPlace && virtualPlace) {
    location = [physicalPlace, virtualPlace];
  } else {
    location = physicalPlace ?? virtualPlace ?? undefined;
  }

  const organizerNodes = detail.organizers.map((o) => ({
    "@type": "Person",
    name: o.organizer_name,
    url: `${SITE_ORIGIN}/hosts/${o.organizer_slug}`,
    ...(absoluteImageUrl(o.organizer_avatar_path, SITE_ORIGIN) ? { image: absoluteImageUrl(o.organizer_avatar_path, SITE_ORIGIN) } : {}),
  }));

  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    ...(description ? { description } : {}),
    image: [ctx.image],
    url: `${SITE_ORIGIN}/events/${slug}`,
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
    eventAttendanceMode: attendanceMode,
    eventStatus,
    ...(location ? { location } : {}),
    ...(organizerNodes.length ? { organizer: organizerNodes, performer: organizerNodes } : {}),
    ...(event.languages?.length ? { inLanguage: event.languages } : {}),
    ...(externalUrl ? { isBasedOn: externalUrl } : {}),
  };
}

function shouldNoIndex(detail: EventDetailResponse | null): boolean {
  if (!detail) return false;
  // Single source of truth: the API's isEventIndexable(), shared with the
  // sitemap. The legacy checks below only run against an older API.
  if (detail.seo) return !detail.seo.indexable;
  const isPast = (detail.occurrences.upcoming?.length ?? 0) === 0;
  if (isPast) return true;
  if (detail.event.status && detail.event.status !== "published") return true;
  if (detail.event.visibility && detail.event.visibility !== "public") return true;
  return false;
}

/** This page's own occurrence: single dates, else own next, else own latest past. */
function pageOccurrence(detail: EventDetailResponse): { start: string; end: string | null } | null {
  if (detail.event.single_start_at) {
    return { start: detail.event.single_start_at, end: detail.event.single_end_at };
  }
  const own = detail.seo?.nextOccurrence ?? null;
  if (own) return { start: own.starts_at_utc, end: own.ends_at_utc };
  const past = detail.occurrences.past?.[0];
  return past ? { start: past.starts_at_utc, end: past.ends_at_utc } : null;
}

function regionName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([toDisplayNamesLocale(locale)], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

function requestLocale(): string {
  return resolveRequestLocale(cookies().get(localeCookieName)?.value, headers().get("accept-language"));
}

type EventSeoContext = {
  title: string;
  socialTitle: string;
  /** <meta name=description> / og:description. */
  description: string;
  /** Factual summary shown on the page when the description is thin, else null. */
  thinSummary: string | null;
  jsonLdDescription: string;
  image: string;
};

/** One place that derives every SEO text/image for an event page. */
function buildEventSeoContext(
  detail: EventDetailResponse,
  taxonomy: TaxonomyResponse | null,
  locale: string,
): EventSeoContext {
  const text = descriptionText(detail);

  // "Emerging Waves with Ina-Maria Freitas · Den Haag · Thu 12 Nov 2026"
  const tz = detail.event.event_timezone || "UTC";
  const occ = pageOccurrence(detail);
  const dateWithWeekday = occ ? formatSeoDate(occ.start, occ.end, tz, locale, { weekday: true }) : "";
  const dateWithoutWeekday = occ ? formatSeoDate(occ.start, occ.end, tz, locale, { weekday: false }) : "";
  const online = detail.event.attendance_mode === "online";
  const loc = detail.defaultLocation;
  const place = online
    ? seoT(locale, "attendanceMode.online")
    : loc?.city || (loc?.country_code ? regionName(loc.country_code, locale) : null);
  const host = detail.organizers[0]?.organizer_name ?? null;

  const practiceLabel = taxonomy?.practices.categories.find(
    (c) => c.id === detail.event.practice_category_id,
  )?.label ?? "";
  const format = taxonomy?.eventFormats?.find((f) => f.id === detail.event.event_format_id);
  const formatLabel = format ? getFormatLabel(format.key, format.label, (k) => seoT(locale, k)) : "";
  const kind = [practiceLabel, formatLabel].filter(Boolean).join(" ") || null;

  const title = buildEventSeoTitle({
    locale,
    title: detail.event.title,
    host,
    place,
    dateWithWeekday,
    dateWithoutWeekday,
  });
  const lead = buildEventLead({ locale, kind, host, place, online, date: dateWithWeekday || null });

  // Thin description (< 80 chars after cleaning): add a factual summary from
  // known fields. It is rendered visibly above the original text.
  let thinSummary: string | null = null;
  if (text.length < THIN_DESCRIPTION_CHARS) {
    const address = !online && loc?.formatted_address && loc.formatted_address !== loc.city
      ? loc.formatted_address
      : null;
    thinSummary = buildThinDescriptionSummary({
      locale,
      lead,
      cadence: detail.series?.cadence ?? null,
      address,
    }) || null;
  }
  const jsonLdDescription = thinSummary ? [thinSummary, text].filter(Boolean).join(" ") : text;

  const image = resolveEventImage(
    detail.event.coverImageUrl ?? detail.event.cover_image_path,
    detail.organizers.map((o) => o.organizer_avatar_path),
    SITE_ORIGIN,
  ).url;

  return {
    title,
    socialTitle: title.replace(/ \| DanceResource$/, ""),
    description: buildEventMetaDescription(lead, text) || "DanceResource event details",
    thinSummary,
    jsonLdDescription,
    image,
  };
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const [detail, taxonomy] = await Promise.all([
    fetchServerJson<EventDetailResponse>(`/events/${params.slug}`),
    fetchServerJson<TaxonomyResponse>("/meta/taxonomies", TAXONOMY_REVALIDATE_SECONDS),
  ]);
  if (!detail) {
    return {
      title: "Event not found | DanceResource",
      robots: { index: false, follow: true },
      alternates: { canonical: `/events/${params.slug}` },
    };
  }

  const locale = requestLocale();
  const ctx = buildEventSeoContext(detail, taxonomy, locale);
  const { title, socialTitle, description } = ctx;
  const image = ctx.image;
  const noIndex = shouldNoIndex(detail);

  return {
    title,
    description,
    robots: noIndex ? { index: false, follow: true } : { index: true, follow: true },
    alternates: {
      // Always self-canonical: each occurrence page is its own Event. (The
      // old series → earliest-sibling canonical moved every week and told
      // Google distinct dates were duplicates.)
      canonical: `/events/${params.slug}`,
    },
    openGraph: {
      title: socialTitle,
      description,
      url: `/events/${params.slug}`,
      siteName: "DanceResource",
      type: "website",
      images: [{ url: image, alt: detail.event.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      images: [image],
    },
  };
}

export default function EventDetailPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams?: { date?: string | string[] };
}) {
  const slug = params.slug;
  // Accept ?date=YYYY-MM-DD as a view hint that deep-links to a specific
  // occurrence in the upcoming list. Canonical URL stays /events/[slug];
  // we only use this to highlight and scroll to that date on mount.
  const rawDate = Array.isArray(searchParams?.date) ? searchParams?.date[0] : searchParams?.date;
  const targetDate = typeof rawDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;
  return <EventDetailPageServer slug={slug} targetDate={targetDate} />;
}

async function EventDetailPageServer({ slug, targetDate }: { slug: string; targetDate: string | null }) {
  const [detail, taxonomy] = await Promise.all([
    fetchServerJson<EventDetailResponse>(`/events/${slug}`),
    fetchServerJson<TaxonomyResponse>("/meta/taxonomies", TAXONOMY_REVALIDATE_SECONDS),
  ]);

  const cookieStore = cookies();
  const locale = cookieStore.get("dr_locale")?.value ?? "en";
  const seoCtx = detail ? buildEventSeoContext(detail, taxonomy, requestLocale()) : null;
  const jsonLd = detail && seoCtx && !shouldNoIndex(detail) ? buildEventJsonLd(detail, slug, seoCtx) : null;
  const serverTranslations = (() => {
    try {
      const regionNames = new Intl.DisplayNames([toDisplayNamesLocale(locale)], { type: "region" });
      const languageNames = new Intl.DisplayNames([toDisplayNamesLocale(locale)], { type: "language" });
      const regionLabels: Record<string, string> = {};
      const langLabels: Record<string, string> = {};
      const countryCode = detail?.defaultLocation?.country_code;
      if (countryCode) {
        const label = regionNames.of(countryCode.toUpperCase());
        if (label) regionLabels[countryCode.toLowerCase()] = label;
      }
      for (const code of detail?.event.languages ?? []) {
        const label = languageNames.of(code);
        if (label) langLabels[code.toLowerCase()] = label;
      }
      return { locale, regionLabels, languageLabels: langLabels };
    } catch {
      return { locale, regionLabels: {}, languageLabels: {} };
    }
  })();

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <EventDetailClient slug={slug} initialData={detail} initialTaxonomy={taxonomy} serverTranslations={serverTranslations} targetDate={targetDate} thinSummary={seoCtx?.thinSummary ?? null} />
    </>
  );
}
