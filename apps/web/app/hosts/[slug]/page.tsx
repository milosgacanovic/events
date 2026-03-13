import type { Metadata } from "next";

import { OrganizerDetailClient } from "../../../components/OrganizerDetailClient";
import { apiBase } from "../../../lib/api";

type OrganizerDetail = {
  organizer: {
    name: string;
    descriptionHtml?: string | null;
    description_json?: unknown;
    imageUrl?: string | null;
    avatar_path?: string | null;
    websiteUrl?: string | null;
    website_url?: string | null;
    city?: string | null;
    country_code?: string | null;
    countryCode?: string | null;
    roleKeys?: string[];
  };
};

async function fetchServerJson<T>(path: string): Promise<T | null> {
  const serverApiBase = process.env.INTERNAL_API_BASE_URL ?? apiBase;
  const response = await fetch(`${serverApiBase}${path}`, { cache: "no-store" }).catch(() => null);
  if (!response?.ok) return null;
  return response.json() as Promise<T>;
}

function stripHtml(input: string): string {
  return input.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function getDescription(detail: OrganizerDetail): string {
  const descJson = detail.organizer.description_json as Record<string, unknown> | null;
  const rawHtml = detail.organizer.descriptionHtml ?? (typeof descJson?.html === "string" ? descJson.html : "") ?? "";
  const text = stripHtml(rawHtml);
  return text ? text.slice(0, 160) : `${detail.organizer.name} — conscious dance host on DanceResource`;
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
  return {
    title: `${detail.organizer.name} | DanceResource`,
    description,
    alternates: { canonical: `/hosts/${params.slug}` },
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
  const websiteUrl = detail?.organizer.websiteUrl ?? detail?.organizer.website_url ?? undefined;
  const jsonLd = detail
    ? {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: detail.organizer.name,
        url: websiteUrl,
        image: detail.organizer.imageUrl ?? detail.organizer.avatar_path ?? undefined,
        description: getDescription(detail),
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
      <OrganizerDetailClient slug={slug} />
    </>
  );
}
