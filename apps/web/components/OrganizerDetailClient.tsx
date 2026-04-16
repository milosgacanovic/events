"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import DOMPurify from "dompurify";
import { useEffect, useState } from "react";

import { fetchJson } from "../lib/api";
import { stripDangerousHtml } from "../lib/sanitizeForSsr";
import { labelForLanguageCode } from "../lib/i18n/languageLabels";
import { useKeycloakAuth } from "./auth/KeycloakAuthProvider";
import { useI18n } from "./i18n/I18nProvider";
import { FollowHostButton } from "./FollowHostButton";
import { SuggestEditButton } from "./SuggestEditButton";
import { ReportButton } from "./ReportButton";

export type OrganizerServerTranslations = {
  locale: string;
  countryLabel?: string | null;
  languageLabels?: Record<string, string>;
  locationCountryLabels?: Record<string, string>;
};

export type OrganizerDetail = {
  organizer: {
    id: string;
    name: string;
    roleKeys?: string[];
    roleKey?: string | null;
    imageUrl?: string | null;
    avatar_path?: string | null;
    website_url: string | null;
    websiteUrl?: string | null;
    external_url?: string | null;
    externalUrl?: string | null;
    tags: string[];
    languages: string[];
    status?: string;
    city?: string | null;
    country_code?: string | null;
    countryCode?: string | null;
    description_json: unknown;
    descriptionJson?: unknown;
    descriptionHtml?: string | null;
  };
  locations: Array<{
    id: string;
    label: string | null;
    formatted_address: string | null;
    city: string | null;
    country_code: string | null;
    lat: number | null;
    lng: number | null;
  }>;
  upcomingOccurrences: Array<{
    occurrence_id: string;
    starts_at_utc: string;
    event_slug: string;
    event_title: string;
    coverImageUrl?: string | null;
  }>;
  pastOccurrences: Array<{
    occurrence_id: string;
    starts_at_utc: string;
    event_slug: string;
    event_title: string;
    coverImageUrl?: string | null;
  }>;
  practiceCategoryIds?: string[];
  canEdit?: boolean;
};

type TaxonomyResponse = {
  uiLabels?: {
    categorySingular?: string;
    practiceCategory?: string;
  };
  practices: {
    categories: Array<{
      id: string;
      key?: string;
      label: string;
    }>;
  };
};

type DescriptionSections = {
  bio: string;
  info: string;
  description: string;
};

function collectText(value: unknown, output: string[]): void {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      output.push(trimmed);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectText(item, output);
    }
    return;
  }

  if (value && typeof value === "object") {
    for (const nestedValue of Object.values(value as Record<string, unknown>)) {
      collectText(nestedValue, output);
    }
  }
}

function getDescriptionText(value: unknown): string | null {
  const parts: string[] = [];
  collectText(value, parts);
  const normalized = parts.join(" ").replace(/\s+/g, " ").trim();
  return normalized || null;
}

const URL_REGEX = /https?:\/\/[^\s<>"']+[^\s<>"'.,!?)]/g;

function linkifyHtml(html: string): string {
  // Only linkify text outside of existing <a> tags
  return html.replace(/(<a[\s\S]*?<\/a>)|([^<]+)/g, (match, anchor, text) => {
    if (anchor) {
      return anchor
        .replace(/\btarget=["'][^"']*["']/i, '')
        .replace(/\brel=["'][^"']*["']/i, '')
        .replace(/^<a\b/, '<a target="_blank" rel="noopener noreferrer"');
    }
    if (text) return text.replace(URL_REGEX, (url: string) => `<a href="${url}" target="_blank" rel="noreferrer noopener">${url}</a>`);
    return match;
  });
}

function htmlToText(value: string): string {
  const normalized = value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
  return normalized
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

function extractDescriptionSections(value: unknown): DescriptionSections {
  const objectValue = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const bioRaw = objectValue.bio;
  const infoRaw = objectValue.info;
  const descriptionRaw = objectValue.description;
  const htmlRaw = objectValue.html;
  const textRaw = objectValue.text;

  const bio = typeof bioRaw === "string" ? bioRaw.trim() : "";
  const info = typeof infoRaw === "string" ? infoRaw.trim() : "";
  const description = typeof descriptionRaw === "string" ? descriptionRaw.trim() : "";
  if (bio || info || description) {
    return { bio, info, description };
  }

  if (typeof htmlRaw === "string" && htmlRaw.trim()) {
    return {
      bio: "",
      info: "",
      description: htmlToText(htmlRaw),
    };
  }

  if (typeof textRaw === "string" && textRaw.trim()) {
    return {
      bio: "",
      info: "",
      description: textRaw.trim(),
    };
  }

  return {
    bio: "",
    info: "",
    description: getDescriptionText(value) ?? "",
  };
}

import { getRoleLabel } from "../lib/filterHelpers";

export function OrganizerDetailClient({ slug, initialData, serverTranslations }: {
  slug: string;
  initialData?: OrganizerDetail | null;
  serverTranslations?: OrganizerServerTranslations;
}) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const auth = useKeycloakAuth();
  const [cameFromSearch] = useState(() => {
    try { return !!sessionStorage.getItem("search-cache-snapshot"); } catch { return false; }
  });
  const [data, setData] = useState<OrganizerDetail | null>(initialData ?? null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taxonomy, setTaxonomy] = useState<TaxonomyResponse | null>(null);

  useEffect(() => {
    let active = true;

    if (initialData) {
      return () => { active = false; };
    }

    setError(null);

    // Phase 1: fetch publicly without waiting for auth
    fetchJson<OrganizerDetail>(`/organizers/${slug}`)
      .then((d) => { if (active) { setNotFound(false); setData(d); } })
      .catch(async (err) => {
        if (!active) return;
        const message = err instanceof Error ? err.message : t("organizerDetail.error.fetchFailed");
        if (!message.includes("404")) { setError(message); return; }
        // Phase 2: 404 — retry with auth if available
        if (!auth.ready) return; // effect re-runs when auth.ready flips
        if (!auth.authenticated) { setNotFound(true); return; }
        try {
          const token = await auth.getToken();
          const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
          const d = await fetchJson<OrganizerDetail>(`/organizers/${slug}`, headers ? { headers } : undefined);
          if (active) { setNotFound(false); setData(d); }
        } catch {
          if (active) setNotFound(true);
        }
      });

    return () => { active = false; };
  }, [auth.ready, auth.authenticated, auth.getToken, initialData, slug, t]);

  // When data was loaded without auth (SSR or public fetch), re-fetch with auth to get canEdit
  useEffect(() => {
    if (!data || data.canEdit !== undefined) return;
    if (!auth.ready || !auth.authenticated) return;
    let active = true;
    (async () => {
      const token = await auth.getToken();
      if (!token || !active) return;
      try {
        const freshData = await fetchJson<OrganizerDetail>(`/organizers/${slug}`, { headers: { Authorization: `Bearer ${token}` } });
        if (active) setData(freshData);
      } catch { /* ignore */ }
    })();
    return () => { active = false; };
  }, [data, auth.ready, auth.authenticated, auth.getToken, slug]);

  useEffect(() => {
    fetchJson<TaxonomyResponse>("/meta/taxonomies")
      .then(setTaxonomy)
      .catch(() => {
        // Keep host detail usable if taxonomy metadata fails.
      });
  }, []);

  const descriptionSections = extractDescriptionSections(
    data?.organizer.descriptionJson ?? data?.organizer.description_json ?? {},
  );
  const descriptionHtmlRaw = data?.organizer.descriptionHtml
    ?? (typeof (data?.organizer.descriptionJson as { html?: unknown })?.html === "string"
      ? (data?.organizer.descriptionJson as { html?: string }).html
      : null);
  const sanitizedDescriptionHtml = (() => {
    if (typeof window === "undefined") {
      // SSR: API sanitizes on write, but strip dangerous tags/handlers as
      // defense-in-depth for legacy rows. Client re-sanitizes with DOMPurify
      // immediately after hydration.
      const raw = descriptionHtmlRaw && descriptionHtmlRaw.trim()
        ? stripDangerousHtml(descriptionHtmlRaw)
        : descriptionSections.description
          ? `<p>${stripDangerousHtml(descriptionSections.description).replace(/\n/g, "<br>")}</p>`
          : null;
      return raw ? linkifyHtml(raw) : null;
    }
    const raw = descriptionHtmlRaw && descriptionHtmlRaw.trim()
      ? DOMPurify.sanitize(descriptionHtmlRaw)
      : descriptionSections.description
        ? `<p>${DOMPurify.sanitize(descriptionSections.description).replace(/\n/g, "<br>")}</p>`
        : null;
    return raw ? linkifyHtml(raw) : null;
  })();

  const breadcrumb = (
    <nav className="event-detail-breadcrumb">
      {cameFromSearch ? (
        <a href="/hosts" onClick={(e) => { e.preventDefault(); router.back(); }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" style={{ verticalAlign: "middle", marginRight: 4 }}><path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          {t("nav.organizers")}
        </a>
      ) : (
        <Link href="/hosts">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" style={{ verticalAlign: "middle", marginRight: 4 }}><path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          {t("nav.organizers")}
        </Link>
      )}
    </nav>
  );

  if (notFound) {
    return (
      <section className="panel cards">
        {breadcrumb}
        <h1 className="title-xl">{t("organizerDetail.notFound.title")}</h1>
        <p className="muted">{t("organizerDetail.notFound.description")}</p>
        <p>
          <Link href="/hosts">{t("organizerDetail.notFound.backToHosts")}</Link>
        </p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="panel cards">
        {breadcrumb}
        <div className="panel">{error}</div>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="panel cards">
        {breadcrumb}
        <h1 className="title-xl">{t("organizerDetail.loading")}</h1>
        <div className="skeleton-line" />
        <div className="skeleton-line short" />
        <div className="skeleton-block" />
      </section>
    );
  }
  const canEdit = data.canEdit === true;

  const organizerImage = data.organizer.imageUrl ?? data.organizer.avatar_path ?? null;
  const websiteUrl = data.organizer.websiteUrl ?? data.organizer.website_url ?? null;
  const externalUrl = data.organizer.externalUrl ?? data.organizer.external_url ?? null;
  const regionNames = (() => {
    try {
      return new Intl.DisplayNames([locale], { type: "region" });
    } catch {
      return null;
    }
  })();
  const languageNames = (() => {
    try {
      return new Intl.DisplayNames([locale], { type: "language" });
    } catch {
      return null;
    }
  })();
  const countryValue = data.organizer.countryCode ?? data.organizer.country_code ?? null;
  const countryLabel = countryValue
    ? (serverTranslations?.locale === locale && serverTranslations.countryLabel
        ? serverTranslations.countryLabel
        : (regionNames?.of(countryValue.toUpperCase()) ?? countryValue.toUpperCase()))
    : null;
  const getRegionLabel = (code: string): string => {
    if (serverTranslations?.locale === locale) {
      const s = serverTranslations.locationCountryLabels?.[code];
      if (s) return s;
    }
    return regionNames?.of(code.toUpperCase()) ?? code.toUpperCase();
  };
  const getLangLabel = (code: string): string => {
    if (serverTranslations?.locale === locale) {
      const s = serverTranslations.languageLabels?.[code];
      if (s) return s;
    }
    return labelForLanguageCode(code, languageNames);
  };
  const practiceLabelById = (() => {
    const map = new Map<string, string>();
    for (const category of taxonomy?.practices.categories ?? []) {
      map.set(category.id, category.label);
    }
    return map;
  })();
  const categorySingularLabel = t("admin.placeholder.categorySingular");
  const categoryPluralLabel = t("admin.placeholder.categoryPlural");
  const practiceLabels = (data.practiceCategoryIds ?? [])
    .map((item) => practiceLabelById.get(item))
    .filter((item): item is string => Boolean(item));
  const practiceKeyById = (() => {
    const map = new Map<string, string>();
    for (const category of taxonomy?.practices.categories ?? []) {
      if (category.key) map.set(category.id, category.key);
    }
    return map;
  })();
  const practiceEntries = (data.practiceCategoryIds ?? [])
    .map((id) => ({ id, key: practiceKeyById.get(id), label: practiceLabelById.get(id) }))
    .filter((e): e is { id: string; key: string; label: string } => Boolean(e.label && e.key));
  const roleLabels = Array.from(new Set(data.organizer.roleKeys ?? []));
  const displayedLocations = data.locations;

  return (
    <section className="panel cards" style={{ maxWidth: 760, margin: "0 auto" }}>
      {breadcrumb}

      {/* Non-published status banner */}
      {data.organizer.status && data.organizer.status !== "published" && (
        <div className={`event-status-banner event-status-banner--${data.organizer.status}`}>
          {data.organizer.status === "draft" && t("eventDetail.statusBanner.draftHost")}
          {data.organizer.status === "archived" && t("eventDetail.statusBanner.archivedHost")}
        </div>
      )}

      <div className="organizer-profile-header">
        <div className="organizer-avatar-shell" aria-hidden={!organizerImage}>
          {organizerImage ? (
            <img src={organizerImage} alt={data.organizer.name} loading="lazy" decoding="async" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/logo.jpg"; e.currentTarget.style.objectFit = "contain"; e.currentTarget.style.padding = "8px"; }} />
          ) : (
            <span className="organizer-thumb-placeholder">{data.organizer.name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("")}</span>
          )}
        </div>
        <div className="organizer-profile-body">
          <div className="organizer-profile-info">
            <h1 className="title-xl">{data.organizer.name}</h1>
            {(data.organizer.city || countryLabel) && (
              <div className="meta">
                {data.organizer.city ?? ""}
                {countryLabel ? `${data.organizer.city ? ", " : ""}${countryLabel}` : ""}
              </div>
            )}
            {(practiceEntries.length > 0 || roleLabels.length > 0) && (
              <div className="organizer-profile-meta-line">
                {[...practiceEntries.map((e) => e.label), ...roleLabels.map((k) => getRoleLabel(k, t))].join(" · ")}
              </div>
            )}
            <div className="organizer-profile-actions">
              {websiteUrl && (
                <a className="primary-btn" href={websiteUrl} target="_blank" rel="noreferrer">
                  {t("organizerDetail.website")}
                </a>
              )}
              {externalUrl && (
                <a className="primary-btn" href={externalUrl} target="_blank" rel="noreferrer">
                  {t("organizerDetail.officialPage")}
                </a>
              )}
              {canEdit && (
                <Link
                  className="secondary-btn"
                  href={`/manage/hosts/${data.organizer.id}`}
                >
                  {t("organizerDetail.editHost")}
                </Link>
              )}
              <FollowHostButton organizerId={data.organizer.id} organizerName={data.organizer.name} />
            </div>
          </div>
        </div>
      </div>
      <hr className="organizer-section-divider" />
      {sanitizedDescriptionHtml && (
        <div>
          <h3>{t("organizerDetail.descriptionLabel")}</h3>
          <div className="organizer-description-text" dangerouslySetInnerHTML={{ __html: sanitizedDescriptionHtml }} />
        </div>
      )}
      <dl className="org-info-grid">
        {practiceEntries.length > 0 && (
          <>
            <dt>{practiceEntries.length === 1 ? categorySingularLabel : categoryPluralLabel}</dt>
            <dd>
              {practiceEntries.map((e, i) => (
                <span key={e.id}>{i > 0 && " · "}<Link href={`/hosts?practice=${e.key}`}>{e.label}</Link></span>
              ))}
            </dd>
          </>
        )}
        {roleLabels.length > 0 && (
          <>
            <dt>{roleLabels.length === 1 ? t("organizerDetail.role") : t("organizerDetail.roles")}</dt>
            <dd>
              {roleLabels.map((key, i) => (
                <span key={key}>{i > 0 && " · "}<Link href={`/hosts?roleKey=${key}`}>{getRoleLabel(key, t)}</Link></span>
              ))}
            </dd>
          </>
        )}
        {data.organizer.languages.length > 0 && (
          <>
            <dt>{data.organizer.languages.length === 1 ? t("organizerDetail.language") : t("organizerDetail.languages")}</dt>
            <dd>
              {data.organizer.languages.map((code, i) => (
                <span key={code}>{i > 0 && " · "}<Link href={`/hosts?languages=${code}`}>{getLangLabel(code)}</Link></span>
              ))}
            </dd>
          </>
        )}
        {displayedLocations.length > 0 && (
          <>
            <dt>{displayedLocations.length === 1 ? t("organizerDetail.location") : t("organizerDetail.locations")}</dt>
            <dd>
              {displayedLocations.map((loc) => {
                const locCountry = loc.country_code ? getRegionLabel(loc.country_code) : null;
                if (loc.city && !loc.city.includes(',') && loc.country_code) {
                  return (
                    <span key={loc.id} style={{ display: "block" }}>
                      <Link href={`/hosts?city=${encodeURIComponent(loc.city.toLowerCase())}&countryCode=${loc.country_code}`}>{loc.city}</Link>
                      {", "}
                      <Link href={`/hosts?countryCode=${loc.country_code}`} style={{ color: "var(--muted)" }}>{locCountry}</Link>
                    </span>
                  );
                }
                const label = [loc.city, locCountry].filter(Boolean).join(", ") || loc.formatted_address || t("common.unknown");
                return loc.country_code
                  ? <Link key={loc.id} href={`/hosts?countryCode=${loc.country_code}`} style={{ display: "block" }}>{label}</Link>
                  : <span key={loc.id} style={{ display: "block" }}>{label}</span>;
              })}
            </dd>
          </>
        )}
        {data.organizer.tags.length > 0 && (
          <>
            <dt>{t("organizerDetail.tags")}</dt>
            <dd>{data.organizer.tags.join(" · ")}</dd>
          </>
        )}
      </dl>

      <SuggestEditButton
        targetType="organizer"
        targetId={data.organizer.id}
        targetName={data.organizer.name}
      />

      <h3>{t("organizerDetail.upcomingEvents")}</h3>
      {data.upcomingOccurrences.length === 0 && <div className="meta">{t("organizerDetail.noUpcoming")}</div>}
      <div className="card-list">
        {data.upcomingOccurrences.map((item) => (
          <Link className="panel event-card-h" key={item.occurrence_id} href={`/events/${item.event_slug}`}>
            <div className="event-card-main">
              <div className="event-card-thumb-h" style={{ background: "var(--surface-skeleton)" }}>
                {item.coverImageUrl && (
                  <img
                    src={item.coverImageUrl}
                    alt={item.event_title}
                    loading="lazy"
                    decoding="async"
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                )}
              </div>
              <div className="event-card-body">
                <h3 style={{ margin: "0 0 4px", fontSize: "1rem", fontWeight: 600 }}>{item.event_title}</h3>
                <div className="meta">{new Date(item.starts_at_utc).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <h3>{t("organizerDetail.pastEvents")}</h3>
      {data.pastOccurrences.length === 0 && <div className="meta">{t("organizerDetail.noPast")}</div>}
      <div className="org-past-events">
        {data.pastOccurrences.map((item) => (
          <Link className="org-past-event-row" key={item.occurrence_id} href={`/events/${item.event_slug}`}>
            <span>{item.event_title}</span>
            <span className="meta">{new Date(item.starts_at_utc).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}</span>
          </Link>
        ))}
      </div>
      <div className="event-detail-footer-actions">
        <ReportButton targetType="organizer" targetId={data.organizer.id} />
      </div>
    </section>
  );
}
