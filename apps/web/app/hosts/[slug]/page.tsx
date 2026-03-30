import type { Metadata } from "next";
import { cookies } from "next/headers";

import { OrganizerDetailClient, type OrganizerDetail } from "../../../components/OrganizerDetailClient";
import { apiBase } from "../../../lib/api";

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

  const cookieStore = cookies();
  const locale = cookieStore.get("dr_locale")?.value ?? "en";
  const serverTranslations = (() => {
    try {
      const regionNames = new Intl.DisplayNames([locale], { type: "region" });
      const languageNames = new Intl.DisplayNames([locale], { type: "language" });
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
      <OrganizerDetailClient slug={slug} initialData={detail} serverTranslations={serverTranslations} />
    </>
  );
}
