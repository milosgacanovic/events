import type { Metadata } from "next";

import {
  EventDetailClient,
  type EventDetail,
  type TaxonomyResponse,
} from "../../../components/EventDetailClient";
import { apiBase } from "../../../lib/api";

type EventDetailResponse = EventDetail;

async function fetchServerJson<T>(path: string): Promise<T | null> {
  const response = await fetch(`${apiBase}${path}`, { cache: "no-store" }).catch(() => null);
  if (!response || !response.ok) {
    return null;
  }
  return response.json() as Promise<T>;
}

function stripHtml(input: string): string {
  return input.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const detail = await fetchServerJson<EventDetailResponse>(`/events/${params.slug}`);
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
  const description = text ? (text.length > 160 ? `${text.slice(0, 160)}...` : text) : "DanceResource event details";
  const image = detail.event.coverImageUrl ?? detail.event.cover_image_path ?? undefined;
  const isPast = (detail.occurrences.upcoming?.length ?? 0) === 0;
  const sourceUrl = detail.event.externalUrl ?? detail.event.external_url ?? null;

  return {
    title: `${detail.event.title} | DanceResource`,
    description,
    robots: isPast ? { index: false, follow: true } : { index: true, follow: true },
    alternates: { canonical: sourceUrl ?? `/events/${params.slug}` },
    openGraph: {
      title: detail.event.title,
      description,
      url: `/events/${params.slug}`,
      siteName: "DanceResource",
      type: "website",
      images: image ? [{ url: image, alt: detail.event.title }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: detail.event.title,
      description,
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
