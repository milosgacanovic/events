"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import DOMPurify from "dompurify";
import { useEffect, useState } from "react";

import { apiBase, fetchJson } from "../lib/api";
import { labelForLanguageCode } from "../lib/i18n/languageLabels";
import { useKeycloakAuth } from "./auth/KeycloakAuthProvider";
import { useI18n } from "./i18n/I18nProvider";

type OrganizerDetail = {
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
    if (anchor) return anchor;
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

export function OrganizerDetailClient({ slug }: { slug: string }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const auth = useKeycloakAuth();
  const [cameFromSearch] = useState(() => {
    try { return !!sessionStorage.getItem("search-cache-snapshot"); } catch { return false; }
  });
  const [data, setData] = useState<OrganizerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [radiusKm, setRadiusKm] = useState(50);
  const [alertCity, setAlertCity] = useState("");
  const [alertCountryCode, setAlertCountryCode] = useState("");
  const [alertStatus, setAlertStatus] = useState<string | null>(null);
  const [savingAlert, setSavingAlert] = useState(false);
  const [taxonomy, setTaxonomy] = useState<TaxonomyResponse | null>(null);

  useEffect(() => {
    setError(null);
    (async () => {
      const token = auth.authenticated ? await auth.getToken() : null;
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      return fetchJson<OrganizerDetail>(`/organizers/${slug}`, headers ? { headers } : undefined);
    })()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : t("organizerDetail.error.fetchFailed")));
  }, [auth.authenticated, auth.getToken, slug, t]);

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
      // SSR: skip sanitize, client re-renders immediately after hydration
      const raw = descriptionHtmlRaw && descriptionHtmlRaw.trim()
        ? descriptionHtmlRaw
        : descriptionSections.description
          ? `<p>${descriptionSections.description.replace(/\n/g, "<br>")}</p>`
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
  const hasEditorRole = auth.roles.some((role) =>
    role === "dr_events_admin" || role === "dr_events_editor" || role === "admin" || role === "editor"
  );
  const canEdit = auth.ready && auth.authenticated && hasEditorRole;

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
    ? (regionNames?.of(countryValue.toUpperCase()) ?? countryValue.toUpperCase())
    : null;
  const practiceLabelById = (() => {
    const map = new Map<string, string>();
    for (const category of taxonomy?.practices.categories ?? []) {
      map.set(category.id, category.label);
    }
    return map;
  })();
  const categorySingularLabel =
    taxonomy?.uiLabels?.categorySingular ??
    taxonomy?.uiLabels?.practiceCategory ??
    t("common.category");
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
  const canFollowHost = auth.authenticated && data.locations.some((location) =>
    location.lat !== null && location.lat !== undefined && location.lng !== null && location.lng !== undefined
  );
  const displayedLocations = data.locations;

  async function createAlert() {
    const organizerId = data?.organizer.id;
    if (!organizerId) {
      return;
    }
    if (!auth.authenticated) {
      await auth.login();
      return;
    }
    setSavingAlert(true);
    setAlertStatus(null);
    try {
      const token = await auth.getToken();
      if (!token) {
        throw new Error("missing_token");
      }
      const response = await fetch(`${apiBase}/profile/alerts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          organizerId,
          radiusKm,
          city: alertCity.trim() || undefined,
          countryCode: alertCountryCode.trim() || undefined,
        }),
      });
      if (!response.ok) {
        throw new Error(`alert_create_failed_${response.status}`);
      }
      setAlertStatus(t("organizerDetail.alert.created"));
    } catch (err) {
      setAlertStatus(err instanceof Error ? err.message : t("organizerDetail.alert.failed"));
    } finally {
      setSavingAlert(false);
    }
  }

  return (
    <section className="panel cards">
      {breadcrumb}
      <div className="organizer-profile-header">
        <div className="organizer-avatar-shell" aria-hidden={!organizerImage}>
          {organizerImage ? (
            <img src={organizerImage} alt={data.organizer.name} loading="lazy" decoding="async" />
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
                {[...practiceEntries.map((e) => e.label), ...roleLabels].join(" · ")}
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
                  href={`/admin?section=organizers&id=${encodeURIComponent(data.organizer.id)}`}
                >
                  {t("organizerDetail.editHost")}
                </Link>
              )}
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
            <dt>{practiceEntries.length === 1 ? (categorySingularLabel) : `${categorySingularLabel}s`}</dt>
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
                <span key={key}>{i > 0 && " · "}<Link href={`/hosts?roleKey=${key}`}>{key}</Link></span>
              ))}
            </dd>
          </>
        )}
        {data.organizer.languages.length > 0 && (
          <>
            <dt>{data.organizer.languages.length === 1 ? t("organizerDetail.language") : t("organizerDetail.languages")}</dt>
            <dd>
              {data.organizer.languages.map((code, i) => (
                <span key={code}>{i > 0 && " · "}<Link href={`/hosts?languages=${code}`}>{labelForLanguageCode(code, languageNames)}</Link></span>
              ))}
            </dd>
          </>
        )}
        {displayedLocations.length > 0 && (
          <>
            <dt>{displayedLocations.length === 1 ? t("organizerDetail.location") : t("organizerDetail.locations")}</dt>
            <dd>
              {displayedLocations.map((loc) => {
                const locCountry = loc.country_code
                  ? (regionNames?.of(loc.country_code.toUpperCase()) ?? loc.country_code.toUpperCase())
                  : null;
                if (loc.city && loc.country_code) {
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
      {canFollowHost && (
        <div className="card org-alert-form">
          <h3>{t("organizerDetail.alert.title")}</h3>
          <div className="meta">{t("organizerDetail.alert.description")}</div>
          <div className="org-alert-fields">
            <label className="org-alert-label">
              <span>{t("organizerDetail.alert.city")}</span>
              <input value={alertCity} onChange={(event) => setAlertCity(event.target.value)} />
            </label>
            <label className="org-alert-label">
              <span>{t("organizerDetail.alert.countryCode")}</span>
              <input value={alertCountryCode} onChange={(event) => setAlertCountryCode(event.target.value)} />
            </label>
            <label className="org-alert-label">
              <span>{t("organizerDetail.alert.radiusKm")}</span>
              <input
                type="number"
                min={1}
                max={500}
                value={radiusKm}
                onChange={(event) => setRadiusKm(Number(event.target.value) || 50)}
              />
            </label>
          </div>
          <button className="primary-btn" type="button" onClick={() => void createAlert()} disabled={savingAlert}>
            {savingAlert ? t("organizerDetail.alert.saving") : t("organizerDetail.alert.follow")}
          </button>
          {alertStatus && <div className="meta">{alertStatus}</div>}
        </div>
      )}


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
    </section>
  );
}
