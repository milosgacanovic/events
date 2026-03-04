"use client";

import Link from "next/link";
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
      label: string;
    }>;
  };
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

export function OrganizerDetailClient({ slug }: { slug: string }) {
  const { locale, t } = useI18n();
  const auth = useKeycloakAuth();
  const [data, setData] = useState<OrganizerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [radiusKm, setRadiusKm] = useState(50);
  const [alertCity, setAlertCity] = useState("");
  const [alertCountryCode, setAlertCountryCode] = useState("");
  const [alertStatus, setAlertStatus] = useState<string | null>(null);
  const [savingAlert, setSavingAlert] = useState(false);
  const [taxonomy, setTaxonomy] = useState<TaxonomyResponse | null>(null);

  useEffect(() => {
    fetchJson<OrganizerDetail>(`/organizers/${slug}`)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : t("organizerDetail.error.fetchFailed")));
  }, [slug, t]);

  useEffect(() => {
    fetchJson<TaxonomyResponse>("/meta/taxonomies")
      .then(setTaxonomy)
      .catch(() => {
        // Keep host detail usable if taxonomy metadata fails.
      });
  }, []);

  if (error) {
    return <div className="panel">{error}</div>;
  }

  if (!data) {
    return <div className="panel">{t("organizerDetail.loading")}</div>;
  }

  const description = getDescriptionText(data.organizer.descriptionJson ?? data.organizer.description_json);
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
  const roleLabels = Array.from(new Set(data.organizer.roleKeys ?? []));
  const hasGeoLocation = data.locations.some((location) =>
    location.lat !== null && location.lat !== undefined && location.lng !== null && location.lng !== undefined
  );

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
      <div className="organizer-profile-header">
        <div className="organizer-avatar-shell" aria-hidden={!organizerImage}>
          {organizerImage ? (
            <img src={organizerImage} alt={data.organizer.name} loading="lazy" decoding="async" />
          ) : (
            <span className="organizer-thumb-placeholder">{data.organizer.name.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div className="cards">
          <h1 className="title-xl">{data.organizer.name}</h1>
          {(data.organizer.city || countryLabel) && (
            <div className="meta">
              {data.organizer.city ?? ""}
              {countryLabel ? `${data.organizer.city ? ", " : ""}${countryLabel}` : ""}
            </div>
          )}
          <div className="organizer-profile-actions">
            {websiteUrl && (
              <a className="secondary-btn" href={websiteUrl} target="_blank" rel="noreferrer">
                {t("organizerDetail.website")}
              </a>
            )}
            {externalUrl && (
              <a className="secondary-btn" href={externalUrl} target="_blank" rel="noreferrer">
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
      {description && (
        <div>
          <h3>{t("organizerDetail.descriptionLabel")}</h3>
          <div className="meta organizer-description">{description}</div>
        </div>
      )}
      <div className="kv">
        {roleLabels.map((item) => (
          <span className="tag" key={`role-${item}`}>
            {`${t("organizerSearch.hostType")}: ${item}`}
          </span>
        ))}
        {data.organizer.languages.map((item) => (
          <span className="tag" key={item}>
            {labelForLanguageCode(item, languageNames)}
          </span>
        ))}
        {data.organizer.tags.map((item) => (
          <span className="tag" key={item}>
            {item}
          </span>
        ))}
        {practiceLabels.map((item) => (
          <span className="tag" key={`practice-${item}`}>
            {`${categorySingularLabel}: ${item}`}
          </span>
        ))}
      </div>
      {auth.authenticated && hasGeoLocation && (
        <div className="card">
          <h3>{t("organizerDetail.alert.title")}</h3>
          <div className="meta">{t("organizerDetail.alert.description")}</div>
          <label>
            {t("organizerDetail.alert.radiusKm")}
            <input
              type="number"
              min={1}
              max={500}
              value={radiusKm}
              onChange={(event) => setRadiusKm(Number(event.target.value) || 50)}
            />
          </label>
          <label>
            {t("organizerDetail.alert.city")}
            <input value={alertCity} onChange={(event) => setAlertCity(event.target.value)} />
          </label>
          <label>
            {t("organizerDetail.alert.countryCode")}
            <input value={alertCountryCode} onChange={(event) => setAlertCountryCode(event.target.value)} />
          </label>
          <button className="secondary-btn" type="button" onClick={() => void createAlert()} disabled={savingAlert}>
            {savingAlert ? t("organizerDetail.alert.saving") : t("organizerDetail.alert.follow")}
          </button>
          {alertStatus && <div className="meta">{alertStatus}</div>}
        </div>
      )}

      <h3>{t("organizerDetail.locations")}</h3>
      {data.locations.length === 0 && <div className="muted">{t("organizerDetail.noLocations")}</div>}
      {data.locations.map((location) => {
        const mapHref =
          location.lat !== null &&
          location.lat !== undefined &&
          location.lng !== null &&
          location.lng !== undefined
            ? `https://www.openstreetmap.org/?mlat=${location.lat}&mlon=${location.lng}#map=16/${location.lat}/${location.lng}`
            : null;

        return (
          <div className="card" key={location.id}>
            <div>{location.label || location.formatted_address || t("common.unknown")}</div>
            {(location.city || location.country_code) && (
              <div className="meta">
                {location.city ?? ""}
                {location.country_code
                  ? `${location.city ? ", " : ""}${location.country_code.toUpperCase()}`
                  : ""}
              </div>
            )}
            {mapHref && (
              <div className="meta">
                <a href={mapHref} target="_blank" rel="noreferrer">
                  {t("organizerDetail.openMap")}
                </a>
              </div>
            )}
          </div>
        );
      })}

      <h3>{t("organizerDetail.upcomingEvents")}</h3>
      {data.upcomingOccurrences.length === 0 && <div className="muted">{t("organizerDetail.noUpcoming")}</div>}
      {data.upcomingOccurrences.map((item) => (
        <div className="card" key={item.occurrence_id}>
          {item.coverImageUrl && (
            <div className="event-card-thumb-shell event-card-thumb-shell-sm">
              <img
                className="event-card-thumb"
                src={item.coverImageUrl}
                alt={item.event_title}
                loading="lazy"
                decoding="async"
              />
            </div>
          )}
          <Link href={`/events/${item.event_slug}`}>{item.event_title}</Link>
          <div className="meta">{new Date(item.starts_at_utc).toLocaleString(locale)}</div>
        </div>
      ))}

      <h3>{t("organizerDetail.pastEvents")}</h3>
      {data.pastOccurrences.length === 0 && <div className="muted">{t("organizerDetail.noPast")}</div>}
      {data.pastOccurrences.map((item) => (
        <div className="card" key={item.occurrence_id}>
          <Link href={`/events/${item.event_slug}`}>{item.event_title}</Link>
          <div className="meta">{new Date(item.starts_at_utc).toLocaleString(locale)}</div>
        </div>
      ))}
    </section>
  );
}
