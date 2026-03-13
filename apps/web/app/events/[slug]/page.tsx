import type { Metadata } from "next";

import {
  EventDetailClient,
  type EventDetail,
  type TaxonomyResponse,
} from "../../../components/EventDetailClient";
import { apiBase } from "../../../lib/api";

type EventDetailResponse = EventDetail;

const serverApiBase = process.env.INTERNAL_API_BASE_URL?.replace(/\/$/, "") ?? apiBase;

async function fetchServerJson<T>(path: string): Promise<T | null> {
  const response = await fetch(`${serverApiBase}${path}`, { cache: "no-store" }).catch(() => null);
  if (!response || !response.ok) {
    return null;
  }
  return response.json() as Promise<T>;
}

function stripHtml(input: string): string {
  return input
    .replace(/<[^>]+>/g, " ")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^DESCRIPTION\s+/i, "");
}

function formatEventDateRange(startIso: string, endIso: string | null, tz: string): string {
  try {
    const s = new Date(startIso);
    const e = endIso ? new Date(endIso) : null;
    const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en", { timeZone: tz, ...o });
    const sDay = fmt({ day: "numeric" }).format(s);
    const sMon = fmt({ month: "short" }).format(s);
    const sYr  = fmt({ year: "numeric" }).format(s);
    if (!e) return `${sDay} ${sMon} ${sYr}`;
    const eDay = fmt({ day: "numeric" }).format(e);
    const eMon = fmt({ month: "short" }).format(e);
    const eYr  = fmt({ year: "numeric" }).format(e);
    if (sYr === eYr && sMon === eMon) {
      return sDay === eDay ? `${sDay} ${sMon} ${sYr}` : `${sDay}–${eDay} ${sMon} ${sYr}`;
    }
    if (sYr === eYr) return `${sDay} ${sMon} – ${eDay} ${eMon} ${sYr}`;
    return `${sDay} ${sMon} ${sYr} – ${eDay} ${eMon} ${eYr}`;
  } catch {
    return "";
  }
}

function countryName(code: string): string {
  try { return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code; }
  catch { return code; }
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const [detail, taxonomy] = await Promise.all([
    fetchServerJson<EventDetailResponse>(`/events/${params.slug}`),
    fetchServerJson<TaxonomyResponse>("/meta/taxonomies"),
  ]);
  if (!detail) {
    return {
      title: "Event not found | DanceResource",
      robots: { index: false, follow: true },
      alternates: { canonical: `/events/${params.slug}` },
    };
  }

  const descriptionJson = (detail.event.description_json ?? {}) as { html?: string };
  const rawHtml = descriptionJson.html ?? "";
  const text = stripHtml(rawHtml);
  const image = detail.event.coverImageUrl ?? detail.event.cover_image_path ?? undefined;
  const isPast = (detail.occurrences.upcoming?.length ?? 0) === 0;
  const sourceUrl = detail.event.externalUrl ?? detail.event.external_url ?? null;

  // Structured summary line: "4–6 Sep 2026 · Belgrade, Serbia · 5Rhythms Workshop"
  const tz = detail.event.event_timezone || "UTC";
  const startIso = detail.event.single_start_at ?? detail.occurrences.upcoming[0]?.starts_at_utc ?? null;
  const endIso   = detail.event.single_end_at   ?? detail.occurrences.upcoming[0]?.ends_at_utc   ?? null;
  const datePart = startIso ? formatEventDateRange(startIso, endIso, tz) : "";
  const locationPart = detail.event.attendance_mode === "online"
    ? "Online"
    : [
        detail.defaultLocation?.city,
        detail.defaultLocation?.country_code ? countryName(detail.defaultLocation.country_code) : null,
      ].filter(Boolean).join(", ");
  const practiceLabel = taxonomy?.practices.categories.find(
    (c) => c.id === detail.event.practice_category_id,
  )?.label ?? "";
  const formatLabel = taxonomy?.eventFormats?.find(
    (f) => f.id === detail.event.event_format_id,
  )?.label ?? "";
  const practicePart = [practiceLabel, formatLabel].filter(Boolean).join(" ");
  const structuredLine = [datePart, locationPart, practicePart].filter(Boolean).join(" · ");

  // Compose OG description: structured line first, then body text if budget allows
  const budget = 200 - structuredLine.length;
  let ogDescription: string;
  if (structuredLine && text && budget > 20) {
    const snippet = text.length > budget - 1 ? `${text.slice(0, budget - 1)}…` : text;
    ogDescription = `${structuredLine}\n${snippet}`;
  } else if (structuredLine) {
    ogDescription = structuredLine;
  } else {
    ogDescription = text || "DanceResource event details";
  }

  // Short description for <title> fallback (plain text, no structured line)
  const titleDescription = text ? (text.length > 160 ? `${text.slice(0, 160)}...` : text) : ogDescription;

  return {
    title: `${detail.event.title} | DanceResource`,
    description: titleDescription,
    robots: isPast ? { index: false, follow: true } : { index: true, follow: true },
    alternates: { canonical: sourceUrl ?? `/events/${params.slug}` },
    openGraph: {
      title: detail.event.title,
      description: ogDescription,
      url: `/events/${params.slug}`,
      siteName: "DanceResource",
      type: "website",
      images: image ? [{ url: image, alt: detail.event.title }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: detail.event.title,
      description: ogDescription,
      images: image ? [image] : undefined,
    },
  };
}

export default function EventDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const slug = params.slug;
  return <EventDetailPageServer slug={slug} />;
}

async function EventDetailPageServer({ slug }: { slug: string }) {
  const [detail, taxonomy] = await Promise.all([
    fetchServerJson<EventDetailResponse>(`/events/${slug}`),
    fetchServerJson<TaxonomyResponse>("/meta/taxonomies"),
  ]);

  const startDate = detail?.event.single_start_at ?? undefined;
  const endDate = detail?.event.single_end_at ?? undefined;
  const location = detail?.event.attendance_mode === "online"
    ? { "@type": "VirtualLocation", url: detail.event.external_url ?? undefined }
    : detail?.defaultLocation
      ? {
          "@type": "Place",
          name: detail.defaultLocation.formatted_address || detail.defaultLocation.city || detail.event.title,
          address: detail.defaultLocation.formatted_address,
          addressCountry: detail.defaultLocation.country_code?.toUpperCase(),
        }
      : undefined;
  const jsonLd = detail
    ? {
        "@context": "https://schema.org",
        "@type": "Event",
        name: detail.event.title,
        startDate,
        endDate,
        eventAttendanceMode:
          detail.event.attendance_mode === "online"
            ? "https://schema.org/OnlineEventAttendanceMode"
            : detail.event.attendance_mode === "hybrid"
              ? "https://schema.org/MixedEventAttendanceMode"
              : "https://schema.org/OfflineEventAttendanceMode",
        location,
        organizer: detail.organizers.map((host) => ({
          "@type": "Organization",
          name: host.organizer_name,
        })),
      }
    : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <EventDetailClient slug={slug} initialData={detail} initialTaxonomy={taxonomy} />
    </>
  );
}
